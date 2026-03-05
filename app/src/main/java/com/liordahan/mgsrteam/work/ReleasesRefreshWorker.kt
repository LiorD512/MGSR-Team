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
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.LatestReleases
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import org.json.JSONArray
import java.util.concurrent.TimeUnit

/**
 * Background worker that fetches all releases from Transfermarkt nightly and sends push
 * notifications when new players appear who weren't in the list before.
 *
 * ## Access control
 * Only the device signed in as [AUTHORIZED_EMAIL] executes the scraping.
 * All other devices silently succeed without doing any work.
 *
 * ## Schedule
 * Triggered nightly at 03:00 Israel time (1 hour after PlayerRefreshWorker) by a periodic
 * work request configured in [MGSRTeamApplication].
 *
 * ## Logic
 * 1. Fetches releases using the same ranges as the Releases screen.
 * 2. Compares with previously known release URLs (stored in SharedPreferences).
 * 3. For each NEW player (not in known URLs):
 *    - Skips if a [FeedEvent] with [FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB] already exists
 *      for that player (avoids duplicate events and notifications).
 *    - Otherwise: checks if the player exists in our Firestore Players database.
 *    - Writes a [FeedEvent] with type [FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB].
 *    - Sets [FeedEvent.extraInfo] to "NOT_IN_DATABASE" or "IN_DATABASE" so the user knows.
 * 4. Updates the stored known URLs for the next run.
 *
 * ## Push notifications
 * When a new release is detected, the worker writes a [FeedEvent] to Firestore. A Firebase
 * Cloud Function sends the push notification to all users via the `mgsr_all` FCM topic.
 */
class ReleasesRefreshWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params), KoinComponent {

    private var canUseForeground = true

    override suspend fun getForegroundInfo(): ForegroundInfo =
        createForegroundInfo("Fetching releases…")

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.i(TAG, "=== ReleasesRefreshWorker triggered ===")
        Log.i("MGSR_Worker", "ReleasesRefreshWorker doWork() started")

        val currentEmail = FirebaseAuth.getInstance().currentUser?.email
        if (!currentEmail.equals(AUTHORIZED_EMAIL, ignoreCase = true)) {
            Log.i(TAG, "Not the authorized device (email=${currentEmail ?: "null"}) — skipping")
            return@withContext Result.success()
        }
        Log.i(TAG, "Authorized device confirmed — starting releases fetch")

        updateProgress("Fetching releases…")

        val firebaseHandler: FirebaseHandler by inject()
        val store = FirebaseFirestore.getInstance()
        val playersRef = store.collection(firebaseHandler.playersTable)
        val feedRef = store.collection(firebaseHandler.feedEventsTable)
        val latestReleases = LatestReleases()

        try {
            val knownUrls = loadKnownReleaseUrls()
            Log.i(TAG, "Previously known releases: ${knownUrls.size}")

            val allReleases = mutableListOf<LatestTransferModel>()
            val releaseRanges = RELEASE_RANGES

            for ((index, range) in releaseRanges.withIndex()) {
                updateProgress("Fetching releases…", index + 1, releaseRanges.size)
                when (val result = latestReleases.getLatestReleases(range.first, range.last, forceEnrichAll = true)) {
                    is TransfermarktResult.Success -> {
                        allReleases.addAll(result.data.filterNotNull())
                        Log.i(TAG, "Fetched range ${index + 1}/${releaseRanges.size}: ${result.data.size} releases")
                    }
                    is TransfermarktResult.Failed -> {
                        Log.w(TAG, "Failed range $range: ${result.cause}")
                    }
                }
                delay(DELAY_BETWEEN_RANGES_MS)
            }

            val distinctReleases = allReleases.distinctBy { it.playerUrl }.filter { it.playerUrl != null }
            val currentUrls = distinctReleases.mapNotNull { it.playerUrl }.toSet()
            val newReleases = distinctReleases.filter { (it.playerUrl ?: "") !in knownUrls }

            Log.i(TAG, "Total releases: ${distinctReleases.size}, new: ${newReleases.size}")

            // Filter out players that already have a FeedEvent (avoids duplicate events & notifications)
            val newReleaseUrls = newReleases.mapNotNull { it.playerUrl }
            val alreadyHaveEvents = mutableSetOf<String>()
            for (chunk in newReleaseUrls.chunked(30)) {  // Firestore whereIn limit is 30
                val snapshot = feedRef
                    .whereEqualTo("type", FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB)
                    .whereIn("playerTmProfile", chunk)
                    .get()
                    .await()
                alreadyHaveEvents.addAll(snapshot.documents.mapNotNull { it.getString("playerTmProfile") })
            }
            val releasesToCreate = newReleases.filter { (it.playerUrl ?: "") !in alreadyHaveEvents }
            Log.i(TAG, "Releases already in feed: ${alreadyHaveEvents.size}, creating events for: ${releasesToCreate.size}")

            for (release in releasesToCreate) {
                val playerUrl = release.playerUrl ?: continue
                val isInDatabase = playersRef.whereEqualTo("tmProfile", playerUrl).get().await().documents.isNotEmpty()

                writeFeedEvent(
                    feedRef,
                    FeedEvent(
                        type = FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB,
                        playerName = release.playerName,
                        playerImage = release.playerImage,
                        playerTmProfile = playerUrl,
                        oldValue = null,
                        newValue = "Without club",
                        extraInfo = if (isInDatabase) "IN_DATABASE" else "NOT_IN_DATABASE",
                        timestamp = System.currentTimeMillis()
                    )
                )
                Log.i(TAG, "New release: ${release.playerName} (in DB: $isInDatabase)")
            }

            saveKnownReleaseUrls(currentUrls)
            markRefreshSuccess()
            Log.i(TAG, "Releases refresh complete — ${releasesToCreate.size} new events created, ${currentUrls.size} total known")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Worker failed with exception", e)
            Result.retry()
        } finally {
            // Dismiss notification when work completes. When using the fallback path
            // (showNotification), WorkManager does not own the notification, so we must
            // cancel it explicitly. When using setForeground(), cancel is harmless.
            (applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(FOREGROUND_NOTIFICATION_ID)
        }
    }

    private fun loadKnownReleaseUrls(): Set<String> {
        return try {
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val json = prefs.getString(KEY_KNOWN_URLS, "[]") ?: "[]"
            JSONArray(json).let { arr ->
                (0 until arr.length()).mapNotNull { i -> arr.optString(i).takeIf { it.isNotBlank() } }.toSet()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load known URLs", e)
            emptySet()
        }
    }

    private fun saveKnownReleaseUrls(urls: Set<String>) {
        try {
            val arr = JSONArray(urls.toList())
            applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_KNOWN_URLS, arr.toString())
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to save known URLs", e)
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
            .setContentTitle("MGSR Releases Refresh")
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
            .setContentTitle("MGSR Releases Refresh")
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
        private const val TAG = "ReleasesRefreshWorker"
        private const val AUTHORIZED_EMAIL = "dahanliordahan@gmail.com"
        private const val PREFS_NAME = "releases_refresh_prefs"
        private const val KEY_KNOWN_URLS = "known_release_urls"
        private const val KEY_LAST_SUCCESSFUL_REFRESH = "last_successful_refresh"
        private const val STALE_DATA_THRESHOLD_MS = 24 * 3_600_000L  // 24 hours
        private const val INITIAL_WORK_NAME = "ReleasesRefreshWorker_initial"
        private const val DELAY_BETWEEN_RANGES_MS = 8_000L
        private const val NOTIFICATION_CHANNEL_ID = "mgsr_team_notifications"
        private const val FOREGROUND_NOTIFICATION_ID = 1004

        private val RELEASE_RANGES = listOf(
            125000..250000,
            250001..400000,
            400001..600000,
            600001..800000,
            800001..1000000,
            1000001..1200000,
            1200001..1400000,
            1400001..1600000,
            1600001..1800000,
            1800000..2000000,
            2000000..2200000,
        )

        /**
         * Enqueues a one-time immediate run. Use after login or from [enqueueIfStale].
         */
        fun enqueueImmediateRefresh(context: Context) {
            Log.i(TAG, "Enqueuing immediate one-time run")
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<ReleasesRefreshWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                INITIAL_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }

        /**
         * Only enqueues an immediate refresh if the last successful run was more than
         * [STALE_DATA_THRESHOLD_MS] ago (or never). Called from [MGSRTeamApplication.onCreate].
         */
        fun enqueueIfStale(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastSuccess = prefs.getLong(KEY_LAST_SUCCESSFUL_REFRESH, 0L)
            val elapsed = System.currentTimeMillis() - lastSuccess
            val hoursSince = elapsed / 3_600_000
            if (elapsed > STALE_DATA_THRESHOLD_MS) {
                Log.i(TAG, "Releases data is stale (${hoursSince}h since last refresh) — enqueuing immediate refresh")
                enqueueImmediateRefresh(context)
            } else {
                Log.i(TAG, "Releases data is fresh (${hoursSince}h since last refresh) — skipping immediate run")
            }
        }

        /**
         * Schedules [ReleasesRefreshWorker] to run every 24 hours, starting at the
         * next 03:00 AM Israel time (1 hour after PlayerRefreshWorker).
         */
        fun schedule(context: Context) {
            val israelZone = java.time.ZoneId.of("Asia/Jerusalem")
            val now = java.time.ZonedDateTime.now(israelZone)
            var nextRun = now
                .withHour(3)
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

            val request = PeriodicWorkRequestBuilder<ReleasesRefreshWorker>(24, TimeUnit.HOURS)
                .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }

        private const val PERIODIC_WORK_NAME = "ReleasesRefreshWorker"
    }
}
