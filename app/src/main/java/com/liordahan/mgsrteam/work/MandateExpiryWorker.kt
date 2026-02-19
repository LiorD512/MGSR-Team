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
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Background worker that scans all players with mandate documents and, when a mandate's
 * expiry date has passed, turns off the mandate switch, marks the document as expired,
 * and sends a push notification.
 *
 * ## Access control
 * Only the device signed in as [AUTHORIZED_EMAIL] executes the work.
 * All other devices silently succeed without doing any work.
 *
 * ## Schedule
 * Triggered nightly at 04:00 Israel time (1 hour after ReleasesRefreshWorker) by a
 * periodic work request configured in [MGSRTeamApplication].
 *
 * ## Logic
 * 1. Fetches all mandate documents (type == MANDATE) from PlayerDocuments.
 * 2. For each mandate with expiresAt < now and expired == false:
 *    - Marks the document as expired (expired = true).
 *    - Finds the player by tmProfile and sets haveMandate = false if they have no
 *      other valid mandates.
 *    - Writes a [FeedEvent] with type [FeedEvent.TYPE_MANDATE_EXPIRED].
 * 3. Push notification is sent via the Cloud Function when the FeedEvent is created.
 */
class MandateExpiryWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private var canUseForeground = true

    override suspend fun getForegroundInfo(): ForegroundInfo =
        createForegroundInfo("Checking mandate expiry…")

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.i(TAG, "=== MandateExpiryWorker triggered ===")
        Log.i("MGSR_Worker", "MandateExpiryWorker doWork() started")

        val currentEmail = FirebaseAuth.getInstance().currentUser?.email
        if (!currentEmail.equals(AUTHORIZED_EMAIL, ignoreCase = true)) {
            Log.i(TAG, "Not the authorized device (email=${currentEmail ?: "null"}) — skipping")
            return@withContext Result.success()
        }
        Log.i(TAG, "Authorized device confirmed — starting mandate expiry check")

        updateProgress("Checking mandate expiry…")

        val firebaseHandler = FirebaseHandler()
        val store = FirebaseFirestore.getInstance()
        val playersRef = store.collection(firebaseHandler.playersTable)
        val docsRef = store.collection(firebaseHandler.playerDocumentsTable)
        val feedRef = store.collection(firebaseHandler.feedEventsTable)

        try {
            val now = System.currentTimeMillis()

            // Fetch all mandate documents
            val mandateSnapshot = docsRef
                .whereEqualTo("type", "MANDATE")
                .get()
                .await()

            val expiredMandates = mandateSnapshot.documents
                .mapNotNull { doc ->
                    val data = doc.data ?: return@mapNotNull null
                    val playerTmProfile = data["playerTmProfile"] as? String ?: return@mapNotNull null
                    val expiresAt = (data["expiresAt"] as? Number)?.toLong() ?: return@mapNotNull null
                    val expired = (data["expired"] as? Boolean) == true
                    val uploadedBy = data["uploadedBy"] as? String
                    if (expiresAt < now && !expired) {
                        Triple(doc.reference, playerTmProfile, uploadedBy to expiresAt)
                    } else null
                }

            Log.i(TAG, "Found ${expiredMandates.size} mandate(s) past expiry date")

            for ((docRef, playerTmProfile, uploadedByAndExpiry) in expiredMandates) {
                val (uploadedBy, expiresAt) = uploadedByAndExpiry
                updateProgress("Processing expired mandates…")

                // Mark document as expired
                docRef.update(mapOf("expired" to true)).await()
                Log.i(TAG, "Marked mandate document as expired for $playerTmProfile")

                // Check if player has any other valid mandates
                val allMandatesForPlayer = docsRef
                    .whereEqualTo("playerTmProfile", playerTmProfile)
                    .whereEqualTo("type", "MANDATE")
                    .get()
                    .await()

                val hasOtherValidMandate = allMandatesForPlayer.documents.any { d ->
                    val exp = (d.get("expiresAt") as? Number)?.toLong()
                    val expFlag = (d.get("expired") as? Boolean) == true
                    !expFlag && (exp == null || exp >= now)
                }

                if (!hasOtherValidMandate) {
                    // Turn off mandate switch on the player
                    val playerSnap = playersRef.whereEqualTo("tmProfile", playerTmProfile).get().await()
                    val playerDoc = playerSnap.documents.firstOrNull()
                    if (playerDoc != null) {
                        val player = playerDoc.toObject(Player::class.java)
                        if (player != null && player.haveMandate) {
                            val updated = player.copy(haveMandate = false)
                            playerDoc.reference.set(updated).await()
                            Log.i(TAG, "Turned off mandate switch for ${player.fullName}")
                        }
                    }
                }

                // Get player name for the feed event
                val playerSnap = playersRef.whereEqualTo("tmProfile", playerTmProfile).get().await()
                val player = playerSnap.documents.firstOrNull()?.toObject(Player::class.java)
                val playerName = player?.fullName ?: "Unknown"
                val playerImage = player?.profileImage

                writeFeedEvent(
                    feedRef,
                    FeedEvent(
                        type = FeedEvent.TYPE_MANDATE_EXPIRED,
                        playerName = playerName,
                        playerImage = playerImage,
                        playerTmProfile = playerTmProfile,
                        agentName = uploadedBy,
                        mandateExpiryAt = expiresAt,
                        oldValue = null,
                        newValue = "Mandate expired",
                        timestamp = now
                    )
                )
                Log.i(TAG, "Feed event written for mandate expiry: $playerName")
            }

            markRefreshSuccess()
            Log.i(TAG, "Mandate expiry check complete — ${expiredMandates.size} mandate(s) processed")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Worker failed with exception", e)
            Result.retry()
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
            .setContentTitle("MGSR Mandate Expiry")
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

    private suspend fun writeFeedEvent(
        feedRef: com.google.firebase.firestore.CollectionReference,
        event: FeedEvent
    ) {
        try {
            feedRef.add(event).await()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to write feed event: ${event.type} for ${event.playerName}", e)
        }
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
            .setContentTitle("MGSR Mandate Expiry")
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
        private const val TAG = "MandateExpiryWorker"
        private const val AUTHORIZED_EMAIL = "dahanliordahan@gmail.com"
        private const val PREFS_NAME = "mandate_expiry_prefs"
        private const val KEY_LAST_SUCCESSFUL_REFRESH = "last_successful_refresh"
        private const val STALE_DATA_THRESHOLD_MS = 24 * 3_600_000L  // 24 hours
        private const val INITIAL_WORK_NAME = "MandateExpiryWorker_initial"
        private const val NOTIFICATION_CHANNEL_ID = "mgsr_team_notifications"
        private const val FOREGROUND_NOTIFICATION_ID = 1005

        fun enqueueImmediateRefresh(context: Context) {
            Log.i(TAG, "Enqueuing immediate one-time run")
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<MandateExpiryWorker>()
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
            val hoursSince = elapsed / 3_600_000
            if (elapsed > STALE_DATA_THRESHOLD_MS) {
                Log.i(TAG, "Mandate expiry data is stale (${hoursSince}h since last run) — enqueuing immediate refresh")
                enqueueImmediateRefresh(context)
            } else {
                Log.i(TAG, "Mandate expiry data is fresh (${hoursSince}h since last run) — skipping immediate run")
            }
        }

        /**
         * Schedules [MandateExpiryWorker] to run every 24 hours, starting at the
         * next 04:00 AM Israel time (1 hour after ReleasesRefreshWorker).
         */
        fun schedule(context: Context) {
            val israelZone = java.time.ZoneId.of("Asia/Jerusalem")
            val now = java.time.ZonedDateTime.now(israelZone)
            var nextRun = now
                .withHour(4)
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

            val request = PeriodicWorkRequestBuilder<MandateExpiryWorker>(24, TimeUnit.HOURS)
                .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }

        private const val PERIODIC_WORK_NAME = "MandateExpiryWorker"
    }
}
