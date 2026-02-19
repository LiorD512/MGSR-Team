package com.liordahan.mgsrteam.work

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.contacts.club.ClubDiscoveryService
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.models.ContactRole
import com.liordahan.mgsrteam.features.contacts.models.ContactType
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Background worker that re-validates club contacts monthly. For each club contact, re-runs the
 * club discovery search. If there is a 100% positive result that the contact is no longer at
 * their stored club (moved to a new club or is without club), updates the database and writes
 * a feed event.
 *
 * ## Access control
 * Only the device signed in as [AUTHORIZED_EMAIL] executes the work.
 * All other devices silently succeed without doing any work.
 *
 * ## Schedule
 * Triggered monthly at 05:00 Israel time by a periodic work request configured in
 * [MGSRTeamApplication].
 *
 * ## Logic
 * 1. Fetches all club contacts (contactType == CLUB) from Firestore.
 * 2. For each contact with a name, calls [ClubDiscoveryService.discoverClubForPerson].
 * 3. If result is null (not 100% sure) → skip.
 * 4. If result indicates "Without club" → clear club fields, update DB, write feed event.
 * 5. If result indicates a different club → update contact with new club data, write feed event.
 * 6. If result indicates same club → no change.
 *
 * ## Push notifications
 * When a club contact is detected as having left, the worker writes a [FeedEvent] to Firestore.
 * A Firebase Cloud Function sends the push notification to all users via the `mgsr_all` FCM topic.
 */
class ClubContactsRefreshWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private var canUseForeground = true

    private val clubDiscoveryService = ClubDiscoveryService(ClubSearch())

    override suspend fun getForegroundInfo(): ForegroundInfo =
        createForegroundInfo("Checking club contacts…")

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.i(TAG, "=== ClubContactsRefreshWorker triggered ===")
        Log.i("MGSR_Worker", "ClubContactsRefreshWorker doWork() started")

        val currentEmail = FirebaseAuth.getInstance().currentUser?.email
        if (!currentEmail.equals(AUTHORIZED_EMAIL, ignoreCase = true)) {
            Log.i(TAG, "Not the authorized device (email=${currentEmail ?: "null"}) — skipping")
            return@withContext Result.success()
        }
        Log.i(TAG, "Authorized device confirmed — starting club contacts refresh")

        updateProgress("Checking club contacts…")

        val firebaseHandler = FirebaseHandler()
        val store = FirebaseFirestore.getInstance()
        val contactsRef = store.collection(firebaseHandler.contactsTable)
        val feedRef = store.collection(firebaseHandler.feedEventsTable)

        try {
            val clubContactsSnapshot = contactsRef
                .whereEqualTo("contactType", ContactType.CLUB.name)
                .get()
                .await()

            val clubContacts = clubContactsSnapshot.documents
                .mapNotNull { doc ->
                    doc.toObject(Contact::class.java)?.copy(id = doc.id)
                }
                .filter { (it.name?.trim()?.length ?: 0) >= 2 }

            Log.i(TAG, "Found ${clubContacts.size} club contacts to check")

            var updatedCount = 0
            for ((index, contact) in clubContacts.withIndex()) {
                updateProgress("Checking club contacts…", index + 1, clubContacts.size)

                val result = clubDiscoveryService.discoverClubForPerson(contact.name ?: "")
                val discovered = result.getOrNull() ?: run {
                    Log.d(TAG, "Skipping ${contact.name}: no definitive result")
                    delay(DELAY_BETWEEN_CONTACTS_MS)
                    continue
                }

                val currentClub = contact.clubName?.trim()?.takeIf { it.isNotBlank() }
                val discoveredClubName = discovered.clubName.trim()

                when {
                    isWithoutClub(discoveredClubName) -> {
                        if (currentClub != null) {
                            updateContactToWithoutClub(contactsRef, contact)
                            writeFeedEvent(
                                feedRef,
                                contact,
                                oldClub = currentClub,
                                newValue = "Without club"
                            )
                            updatedCount++
                            Log.i(TAG, "Contact ${contact.name} left club: now without club")
                        }
                    }
                    !isSameClub(currentClub, discoveredClubName) -> {
                        val newClubModel = discovered.clubModel
                        updateContactWithNewClub(
                            contactsRef,
                            contact,
                            clubName = discoveredClubName,
                            clubModel = newClubModel,
                            newRole = discovered.role
                        )
                        writeFeedEvent(
                            feedRef,
                            contact,
                            oldClub = currentClub ?: "Unknown",
                            newValue = discoveredClubName
                        )
                        updatedCount++
                        Log.i(TAG, "Contact ${contact.name} left club: now at $discoveredClubName")
                    }
                    else -> {
                        Log.d(TAG, "Contact ${contact.name} still at $currentClub — no change")
                    }
                }

                delay(DELAY_BETWEEN_CONTACTS_MS)
            }

            markRefreshSuccess()
            Log.i(TAG, "Club contacts refresh complete — $updatedCount updated of ${clubContacts.size} checked")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Worker failed with exception", e)
            Result.retry()
        }
    }

    private fun isWithoutClub(clubName: String): Boolean {
        val lower = clubName.lowercase()
        return lower == "without club" ||
            lower == "free agent" ||
            lower.contains("without club") ||
            lower.contains("free agent") ||
            lower == "retired" ||
            lower == "no club"
    }

    private fun isSameClub(current: String?, discovered: String): Boolean {
        if (current.isNullOrBlank()) return false
        val c = current.lowercase().trim()
        val d = discovered.lowercase().trim()
        return c == d || c.contains(d) || d.contains(c)
    }

    private suspend fun updateContactToWithoutClub(
        contactsRef: com.google.firebase.firestore.CollectionReference,
        contact: Contact
    ) {
        val id = contact.id ?: return
        val data = mapOf(
            "name" to (contact.name ?: ""),
            "phoneNumber" to (contact.phoneNumber ?: ""),
            "role" to (contact.role ?: ""),
            "clubName" to "",
            "clubCountry" to "",
            "clubLogo" to "",
            "clubCountryFlag" to "",
            "clubTmProfile" to "",
            "contactType" to ContactType.CLUB.name,
            "agencyName" to (contact.agencyName ?: ""),
            "agencyCountry" to (contact.agencyCountry ?: ""),
            "agencyUrl" to (contact.agencyUrl ?: "")
        )
        contactsRef.document(id).set(data).await()
    }

    private suspend fun updateContactWithNewClub(
        contactsRef: com.google.firebase.firestore.CollectionReference,
        contact: Contact,
        clubName: String,
        clubModel: com.liordahan.mgsrteam.transfermarket.ClubSearchModel?,
        newRole: ContactRole
    ) {
        val id = contact.id ?: return
        val data = mapOf(
            "name" to (contact.name ?: ""),
            "phoneNumber" to (contact.phoneNumber ?: ""),
            "role" to newRole.name,
            "clubName" to clubName,
            "clubCountry" to (clubModel?.clubCountry ?: ""),
            "clubLogo" to (clubModel?.clubLogo ?: ""),
            "clubCountryFlag" to (clubModel?.clubCountryFlag ?: ""),
            "clubTmProfile" to (clubModel?.clubTmProfile ?: ""),
            "contactType" to ContactType.CLUB.name,
            "agencyName" to (contact.agencyName ?: ""),
            "agencyCountry" to (contact.agencyCountry ?: ""),
            "agencyUrl" to (contact.agencyUrl ?: "")
        )
        contactsRef.document(id).set(data).await()
    }

    private suspend fun writeFeedEvent(
        feedRef: com.google.firebase.firestore.CollectionReference,
        contact: Contact,
        oldClub: String,
        newValue: String
    ) {
        try {
            feedRef.add(
                FeedEvent(
                    type = FeedEvent.TYPE_CLUB_CONTACT_LEFT,
                    playerName = contact.name,
                    playerImage = null,
                    playerTmProfile = null,
                    oldValue = oldClub,
                    newValue = newValue,
                    extraInfo = contact.phoneNumber,
                    timestamp = System.currentTimeMillis(),
                    agentName = null
                )
            ).await()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to write feed event for ${contact.name}", e)
        }
    }

    private suspend fun updateProgress(text: String, current: Int = 0, total: Int = 0) {
        if (canUseForeground) {
            try {
                setForeground(createForegroundInfo(text, current, total))
                return
            } catch (e: IllegalStateException) {
                Log.w(TAG, "Foreground promotion blocked — falling back to plain notification: ${e.message}")
                canUseForeground = false
            }
        }
        showNotification(text, current, total)
    }

    private fun showNotification(text: String, current: Int = 0, total: Int = 0) {
        ensureNotificationChannel()
        val body = if (total > 0) "$text $current / $total" else text
        val notification = NotificationCompat.Builder(applicationContext, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mgsr)
            .setContentTitle("MGSR Club Contacts")
            .setContentText(body)
            .setOngoing(true)
            .setSilent(true)
            .apply {
                if (total > 0) {
                    setProgress(total, current, false)
                    setSubText("$current / $total")
                } else {
                    setProgress(0, 0, true)
                }
            }
            .build()
        (applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(FOREGROUND_NOTIFICATION_ID, notification)
    }

    private fun markRefreshSuccess() {
        applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_SUCCESSFUL_REFRESH, System.currentTimeMillis())
            .apply()
    }

    private fun createForegroundInfo(
        text: String,
        current: Int = 0,
        total: Int = 0
    ): ForegroundInfo {
        ensureNotificationChannel()
        val body = if (total > 0) "$text $current / $total" else text
        val notification = NotificationCompat.Builder(applicationContext, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mgsr)
            .setContentTitle("MGSR Club Contacts")
            .setContentText(body)
            .setOngoing(true)
            .setSilent(true)
            .apply {
                if (total > 0) {
                    setProgress(total, current, false)
                    setSubText("$current / $total")
                } else {
                    setProgress(0, 0, true)
                }
            }
            .build()

        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            ForegroundInfo(
                FOREGROUND_NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(FOREGROUND_NOTIFICATION_ID, notification)
        }
    }

    private fun ensureNotificationChannel() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                applicationContext.getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = applicationContext.getString(R.string.notification_channel_description)
            }
            val manager = applicationContext
                .getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val TAG = "ClubContactsRefreshWorker"
        private const val AUTHORIZED_EMAIL = "dahanliordahan@gmail.com"
        private const val PREFS_NAME = "club_contacts_refresh_prefs"
        private const val KEY_LAST_SUCCESSFUL_REFRESH = "last_successful_refresh"
        private const val STALE_DATA_THRESHOLD_MS = 30L * 24 * 3_600_000  // 30 days
        private const val INITIAL_WORK_NAME = "ClubContactsRefreshWorker_initial"
        private const val DELAY_BETWEEN_CONTACTS_MS = 10_000L  // 10s between contacts (Gemini + TM rate limits)
        private const val NOTIFICATION_CHANNEL_ID = "mgsr_team_notifications"
        private const val FOREGROUND_NOTIFICATION_ID = 1006

        fun enqueueImmediateRefresh(context: Context) {
            Log.i(TAG, "Enqueuing immediate one-time run")
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<ClubContactsRefreshWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                INITIAL_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }

        fun enqueueIfStale(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastSuccess = prefs.getLong(KEY_LAST_SUCCESSFUL_REFRESH, 0L)
            val elapsed = System.currentTimeMillis() - lastSuccess
            val daysSince = elapsed / (24 * 3_600_000)
            if (elapsed > STALE_DATA_THRESHOLD_MS) {
                Log.i(TAG, "Club contacts data is stale (${daysSince}d since last run) — enqueuing immediate refresh")
                enqueueImmediateRefresh(context)
            } else {
                Log.i(TAG, "Club contacts data is fresh (${daysSince}d since last run) — skipping immediate run")
            }
        }

        /**
         * Schedules [ClubContactsRefreshWorker] to run every 30 days, starting at the
         * next 05:00 AM Israel time.
         */
        fun schedule(context: Context) {
            val israelZone = java.time.ZoneId.of("Asia/Jerusalem")
            val now = java.time.ZonedDateTime.now(israelZone)
            var nextRun = now
                .withHour(5)
                .withMinute(0)
                .withSecond(0)
                .withNano(0)

            if (!now.isBefore(nextRun)) {
                nextRun = nextRun.plusDays(1)
            }

            val initialDelay = java.time.Duration.between(now, nextRun).toMillis()

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<ClubContactsRefreshWorker>(30, TimeUnit.DAYS)
                .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }

        private const val PERIODIC_WORK_NAME = "ClubContactsRefreshWorker"
    }
}
