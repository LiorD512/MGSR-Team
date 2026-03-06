package com.liordahan.mgsrteam.work

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.MarketValueEntry
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.isFreeAgentClub
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.PlayerToUpdateValues
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import kotlin.math.min
import kotlin.random.Random

/**
 * Background worker that refreshes **all** players from Transfermarkt nightly.
 *
 * ## Access control
 * Only the device signed in as [AUTHORIZED_EMAIL] executes the scraping.
 * All other devices silently succeed without doing any work.
 *
 * ## Schedule
 * Triggered nightly at 02:00 Israel time (Asia/Jerusalem) by a periodic work
 * request configured in `MGSRTeamApplication`. Runs as a **foreground service**
 * so the system will not kill it mid-execution.
 *
 * ## Anti-blocking strategy
 * Transfermarkt blocks after ~4-5 rapid requests from the same IP. Instead of
 * bursting requests in batches with long pauses, this worker mimics **human
 * browsing speed** — a steady stream of requests spaced far enough apart that
 * Transfermarkt never detects a bot pattern:
 *
 * | Network setup        | Delay between requests | Per-IP gap | 800 players |
 * |----------------------|-----------------------|-----------|-------------|
 * | WiFi + Cellular      | 5-8 s                 | ~13 s     | ~1.5 h      |
 * | WiFi only            | 12-18 s               | 12-18 s   | ~3.3 h      |
 *
 * If a request is blocked despite the pacing (HTTP 403/429/503), the worker
 * applies exponential back-off (90 s → 3 min → 5 min) and retries up to
 * [MAX_RETRIES] times per player, switching to the other network when available.
 *
 * ## Push notifications
 * When a **club change** or **free-agent** transition is detected the worker
 * writes a [FeedEvent] to Firestore. A Firebase Cloud Function sends the push
 * notification to all users via the `mgsr_all` FCM topic.
 */
class PlayerRefreshWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params), KoinComponent {

    /**
     * `true` while [setForeground] is available. Flipped to `false` on Android 12+
     * when the OS blocks foreground-service promotion from the background; the
     * worker then falls back to a plain notification via [NotificationManager].
     */
    private var canUseForeground = true

    override suspend fun getForegroundInfo(): ForegroundInfo =
        createForegroundInfo("Starting player refresh…")

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.i(TAG, "=== PlayerRefreshWorker triggered (runAttemptCount=$runAttemptCount) ===")
        Log.i("MGSR_Worker", "PlayerRefreshWorker doWork() started")

        // ── 0. Only run on the authorised device ──
        val currentEmail = FirebaseAuth.getInstance().currentUser?.email
        if (!currentEmail.equals(AUTHORIZED_EMAIL, ignoreCase = true)) {
            Log.i(TAG, "Not the authorized device (email=${currentEmail ?: "null"}) — skipping")
            return@withContext Result.success()
        }
        Log.i(TAG, "Authorized device confirmed — starting refresh")

        // Try to promote to foreground service — prevents the OS from killing this work.
        // On Android 12+ this can fail when launched from background (periodic / expedited).
        updateProgress("Starting player refresh…")

        val firebaseHandler: FirebaseHandler by inject()
        val playersUpdate = PlayersUpdate()
        val store = FirebaseFirestore.getInstance()
        val playersRef = store.collection(firebaseHandler.playersTable)
        val feedRef = store.collection(firebaseHandler.feedEventsTable)

        try {
            // ── 1. Fetch ALL players with a TM profile, stalest first ──
            val snapshot = playersRef.get().await()

            val playersWithDocs = snapshot.documents
                .mapNotNull { doc ->
                    val player = doc.toObject(Player::class.java) ?: return@mapNotNull null
                    if (player.tmProfile.isNullOrBlank()) return@mapNotNull null
                    player to doc.reference
                }
                .sortedBy { (player, _) -> player.lastRefreshedAt ?: 0L }

            if (playersWithDocs.isEmpty()) {
                Log.i(TAG, "No players with TM profiles — nothing to refresh")
                return@withContext Result.success()
            }

            val recentThreshold = System.currentTimeMillis() - RECENT_REFRESH_THRESHOLD_MS
            val stale = playersWithDocs.filter { (player, _) ->
                (player.lastRefreshedAt ?: 0L) < recentThreshold
            }

            val totalPlayers = playersWithDocs.size
            val skipped = totalPlayers - stale.size
            Log.i(TAG, "Starting refresh: $totalPlayers total, $skipped recently refreshed (skipped), ${stale.size} to update")

            if (stale.isEmpty()) {
                Log.i(TAG, "All players already refreshed within the last ${RECENT_REFRESH_THRESHOLD_MS / 3_600_000}h — nothing to do")
                markRefreshSuccess()
                return@withContext Result.success()
            }

            // ── 2. Detect available networks for IP rotation ──
            val networks = getAvailableNetworks()
            val hasMultipleNetworks = networks.size > 1
            Log.i(TAG, "Available networks: ${networks.size} (${if (hasMultipleNetworks) "dual — alternating per request" else "single — steady pacing"})")

            var consecutiveBlocks = 0
            var successCount = 0
            var failCount = 0

            val total = stale.size

            // ── 3. Process stale players with steady, human-like pacing ──
            for ((index, pair) in stale.withIndex()) {
                val (player, docRef) = pair
                val tmProfile = player.tmProfile ?: continue

                // Pick network: alternate on each request so each IP rests ~2× the delay
                val networkForRequest = if (hasMultipleNetworks) {
                    networks[index % networks.size]
                } else {
                    null // single network — use default route
                }

                updateProgress(
                    player.fullName ?: "Unknown",
                    current = index + 1,
                    total = total
                )

                // ── Attempt with retry on rate-limit ──
                var retries = 0
                var succeeded = false

                while (retries <= MAX_RETRIES && !succeeded) {
                    // On retry after a block, try a different network if possible
                    val network = if (retries > 0 && hasMultipleNetworks) {
                        networks[(index + retries) % networks.size]
                    } else {
                        networkForRequest
                    }

                    when (val result = playersUpdate.updatePlayerByTmProfile(tmProfile, network)) {
                        is TransfermarktResult.Success -> {
                            result.data?.let { data ->
                                processSuccessfulUpdate(player, data, docRef, feedRef, tmProfile)
                                successCount++
                                consecutiveBlocks = 0
                                Log.i(TAG, "Updated ${index + 1}/$total: ${player.fullName}")
                            }
                            succeeded = true
                        }

                        is TransfermarktResult.Failed -> {
                            val cause = result.cause.orEmpty()
                            if (isRateLimited(cause)) {
                                consecutiveBlocks++
                                retries++
                                if (retries > MAX_RETRIES) break

                                val backoff = calculateBlockBackoff(consecutiveBlocks)
                                Log.w(
                                    TAG,
                                    "BLOCKED ${index + 1}/$total: ${player.fullName} " +
                                        "(retry $retries/$MAX_RETRIES, blocks: $consecutiveBlocks) " +
                                        "— backing off ${backoff / 1000}s — $cause"
                                )
                                updateProgress(
                                    "Rate limited — retrying…",
                                    current = index + 1,
                                    total = total
                                )
                                delay(backoff)
                            } else {
                                failCount++
                                Log.w(TAG, "Failed ${index + 1}/$total: ${player.fullName} — $cause")
                                break
                            }
                        }
                    }
                }

                if (!succeeded && retries > MAX_RETRIES) {
                    failCount++
                    Log.w(TAG, "Giving up on ${index + 1}/$total: ${player.fullName} after $MAX_RETRIES retries")
                }

                // ── Steady inter-request delay (the core anti-blocking mechanism) ──
                val baseDelay = if (hasMultipleNetworks) {
                    DUAL_NET_DELAY_MIN_MS + Random.nextLong(DUAL_NET_DELAY_VARIANCE_MS)
                } else {
                    SINGLE_NET_DELAY_MIN_MS + Random.nextLong(SINGLE_NET_DELAY_VARIANCE_MS)
                }
                delay(baseDelay)

                // Progress log every 50 players
                if ((index + 1) % 50 == 0) {
                    Log.i(TAG, "Progress: ${index + 1}/$total — $successCount ok, $failCount failed")
                }
            }

            Log.i(TAG, "Roster refresh complete — $successCount succeeded, $failCount failed out of ${stale.size} (skipped $skipped already fresh)")
            markRefreshSuccess()
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

    // ── Block detection ──────────────────────────────────────────────────────

    /**
     * Returns `true` if the error looks like a Transfermarkt rate-limit / IP block.
     */
    private fun isRateLimited(cause: String): Boolean {
        val lower = cause.lowercase()
        return lower.contains("http 403") ||
            lower.contains("http 429") ||
            lower.contains("http 503") ||
            lower.contains("status=403") ||
            lower.contains("status=429") ||
            lower.contains("status=503") ||
            lower.contains("forbidden") ||
            lower.contains("too many requests")
    }

    /**
     * Exponential back-off: 90 s → 3 min → 5 min (cap).
     * Random jitter is added to avoid thundering-herd patterns.
     */
    private fun calculateBlockBackoff(consecutiveBlocks: Int): Long {
        val multiplier = 1L shl (consecutiveBlocks - 1).coerceIn(0, 3)
        val base = BLOCK_BACKOFF_MIN_MS * multiplier
        val capped = min(base, MAX_BLOCK_BACKOFF_MS)
        return capped + Random.nextLong(BLOCK_BACKOFF_VARIANCE_MS)
    }

    // ── Player update logic ─────────────────────────────────────────────────

    private suspend fun processSuccessfulUpdate(
        player: Player,
        data: PlayerToUpdateValues,
        docRef: com.google.firebase.firestore.DocumentReference,
        feedRef: com.google.firebase.firestore.CollectionReference,
        tmProfile: String
    ) {
        val currentValue = player.marketValue
        val newValueRaw = data.marketValue
        val newValue = newValueRaw?.takeIf { it.isNotBlank() } ?: "€0"

        val valueChanged = when {
            isNoMarketValue(currentValue) && isNoMarketValue(newValue) -> false
            else -> newValue != (currentValue ?: "€0")
        }

        val history = if (valueChanged) {
            val entry = MarketValueEntry(value = newValue, date = System.currentTimeMillis())
            val list = (player.marketValueHistory?.toMutableList() ?: mutableListOf())
                .apply { add(entry) }
            list.takeLast(MAX_HISTORY_ENTRIES)
        } else {
            player.marketValueHistory
        }

        val club = data.currentClub?.let {
            Club(
                clubName = it.clubName,
                clubLogo = it.clubLogo,
                clubTmProfile = it.clubTmProfile,
                clubCountry = it.clubCountry
            )
        }

        // Feed events for club changes and free-agent transitions only
        val newClubName = club?.clubName
        val oldClubName = player.currentClub?.clubName
        val now = System.currentTimeMillis()

        if (newClubName != null && !newClubName.equals(oldClubName, true)) {
            val nowWithoutClub = isFreeAgentClub(newClubName)
            val eventType = if (nowWithoutClub) {
                FeedEvent.TYPE_BECAME_FREE_AGENT
            } else {
                FeedEvent.TYPE_CLUB_CHANGE
            }
            writeFeedEvent(
                feedRef, FeedEvent(
                    type = eventType,
                    playerName = player.fullName,
                    playerImage = data.profileImage ?: player.profileImage,
                    playerTmProfile = tmProfile,
                    oldValue = oldClubName,
                    newValue = newClubName,
                    timestamp = now
                )
            )
        }

        val updated = player.copy(
            marketValue = newValue,
            profileImage = data.profileImage ?: player.profileImage,
            nationalityFlag = data.nationalityFlag ?: player.nationalityFlag,
            nationality = data.citizenship ?: player.nationality,
            age = data.age ?: player.age,
            contractExpired = data.contract ?: player.contractExpired,
            positions = data.positions ?: player.positions,
            currentClub = club ?: player.currentClub,
            marketValueHistory = history,
            lastRefreshedAt = System.currentTimeMillis(),
            isOnLoan = data.isOnLoan,
            onLoanFromClub = data.onLoanFromClub,
            foot = data.foot ?: player.foot,
            agency = data.agency ?: player.agency,
            agencyUrl = data.agencyUrl ?: player.agencyUrl
        )
        docRef.set(updated).await()
    }

    // ── Network helpers ──────────────────────────────────────────────────────

    @Suppress("DEPRECATION")
    private fun getAvailableNetworks(): List<Network> {
        val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return cm.allNetworks.filter { network ->
            cm.getNetworkCapabilities(network)?.let { caps ->
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
            } ?: false
        }
    }

    // ── Feed helpers ─────────────────────────────────────────────────────────

    private suspend fun writeFeedEvent(
        feedRef: com.google.firebase.firestore.CollectionReference,
        event: FeedEvent
    ) {
        try {
            val dayMs = 24 * 60 * 60 * 1000L
            val dayBucket = (event.timestamp ?: System.currentTimeMillis()) / dayMs
            val profileHash = (event.playerTmProfile ?: "").hashCode().toUInt()
            val docId = "${event.type}_${profileHash}_$dayBucket"
            feedRef.document(docId).set(event).await()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to write feed event: ${event.type} for ${event.playerName}", e)
        }
    }

    private fun isNoMarketValue(value: String?): Boolean {
        if (value.isNullOrBlank()) return true
        val trimmed = value.trim()
        if (trimmed == "-" || trimmed == "€0") return true
        val lower = trimmed.lowercase().removePrefix("€").replace(",", "")
        return when {
            lower.endsWith("k") -> (lower.removeSuffix("k").toDoubleOrNull() ?: 0.0) == 0.0
            lower.endsWith("m") -> (lower.removeSuffix("m").toDoubleOrNull() ?: 0.0) == 0.0
            else -> (lower.toDoubleOrNull() ?: 0.0) == 0.0
        }
    }

    // ── Staleness tracking ─────────────────────────────────────────────────

    private fun markRefreshSuccess() {
        applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_SUCCESSFUL_REFRESH, System.currentTimeMillis())
            .apply()
    }

    // ── Progress / notification helpers ─────────────────────────────────────

    /**
     * Updates the visible notification. Tries [setForeground] first (keeps the
     * process alive); falls back to a plain [NotificationManager] post when
     * Android 12+ blocks foreground-service promotion from the background.
     */
    private suspend fun updateProgress(
        text: String,
        current: Int = 0,
        total: Int = 0
    ) {
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

    /**
     * Posts a plain notification (no foreground service). Used as fallback when
     * [setForeground] is not allowed.
     */
    private fun showNotification(text: String, current: Int = 0, total: Int = 0) {
        ensureNotificationChannel()
        val notification = buildNotification(text, current, total).build()
        val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(FOREGROUND_NOTIFICATION_ID, notification)
    }

    private fun createForegroundInfo(
        text: String,
        current: Int = 0,
        total: Int = 0
    ): ForegroundInfo {
        ensureNotificationChannel()
        val notification = buildNotification(text, current, total).build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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

    private fun buildNotification(
        text: String,
        current: Int,
        total: Int
    ): NotificationCompat.Builder {
        val body = if (total > 0) "$text $current / $total" else text
        val builder = NotificationCompat.Builder(applicationContext, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mgsr)
            .setContentTitle("MGSR Player Refresh")
            .setContentText(body)
            .setOngoing(true)
            .setSilent(true)

        if (total > 0) {
            builder.setProgress(total, current, false)
                .setSubText("$current / $total")
        } else {
            builder.setProgress(0, 0, true)
        }

        return builder
    }

    companion object {
        private const val TAG = "PlayerRefreshWorker"
        private const val INITIAL_WORK_NAME = "PlayerRefreshWorker_initial"

        private const val AUTHORIZED_EMAIL = "dahanliordahan@gmail.com"
        private const val MAX_HISTORY_ENTRIES = 24

        private const val PREFS_NAME = "player_refresh_prefs"
        private const val KEY_LAST_SUCCESSFUL_REFRESH = "last_successful_refresh"
        private const val STALE_DATA_THRESHOLD_MS = 24 * 3_600_000L  // 24 hours

        /**
         * Enqueues a one-time immediate run. Use after login (unconditional)
         * or from [enqueueIfStale] on app open (conditional).
         */
        fun enqueueImmediateRefresh(context: Context) {
            Log.i(TAG, "Enqueuing immediate one-time run")
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<PlayerRefreshWorker>()
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
         * Only enqueues an immediate refresh if the last successful run was
         * more than [STALE_DATA_THRESHOLD_MS] ago (or never). Called from
         * [MGSRTeamApplication.onCreate] so returning users don't trigger
         * a Firestore read on every app open.
         */
        fun enqueueIfStale(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastSuccess = prefs.getLong(KEY_LAST_SUCCESSFUL_REFRESH, 0L)
            val elapsed = System.currentTimeMillis() - lastSuccess
            val hoursSince = elapsed / 3_600_000
            if (elapsed > STALE_DATA_THRESHOLD_MS) {
                Log.i(TAG, "Data is stale (${hoursSince}h since last refresh) — enqueuing immediate refresh")
                enqueueImmediateRefresh(context)
            } else {
                Log.i(TAG, "Data is fresh (${hoursSince}h since last refresh) — skipping immediate run")
            }
        }

        /**
         * Players refreshed within this window are skipped. Prevents re-doing
         * work after a reinstall or restart while a previous run's Firestore
         * updates are still fresh.
         */
        private const val RECENT_REFRESH_THRESHOLD_MS = 20 * 3_600_000L  // 20 hours

        // ── Steady pacing (core anti-blocking mechanism) ────────────────────
        //
        // Instead of bursting 3-4 fast requests then pausing for a minute,
        // requests are spaced evenly — like a human browsing Transfermarkt.
        // This never triggers TM's burst-detection rate limiter.

        /**
         * Delay between requests when **two networks** (WiFi + Cellular) are
         * available. The worker alternates networks per request, so each IP
         * sees a request only every ~13 s (2 × 6.5 s average).
         *
         * **800 players ≈ 1.5 hours.**
         */
        private const val DUAL_NET_DELAY_MIN_MS = 5_000L
        private const val DUAL_NET_DELAY_VARIANCE_MS = 3_000L   // 5–8 s

        /**
         * Delay between requests when only **one network** is available
         * (typical at 2 AM on WiFi). Spaced like a human reading each
         * player page for 12-18 seconds — well below TM's detection window.
         *
         * **800 players ≈ 3.3 hours** (safely under the 6-hour Android
         * foreground-service limit for `dataSync` on API 35+).
         */
        private const val SINGLE_NET_DELAY_MIN_MS = 12_000L
        private const val SINGLE_NET_DELAY_VARIANCE_MS = 6_000L  // 12–18 s

        // ── Back-off on block (safety net) ──────────────────────────────────

        /** Initial back-off when blocked (HTTP 403/429/503). */
        private const val BLOCK_BACKOFF_MIN_MS = 90_000L         // 1.5 min
        private const val BLOCK_BACKOFF_VARIANCE_MS = 30_000L    // +0–0.5 min
        private const val MAX_BLOCK_BACKOFF_MS = 300_000L        // cap at 5 min

        /** Per-player retry limit when rate-limited. */
        private const val MAX_RETRIES = 3

        private const val NOTIFICATION_CHANNEL_ID = "mgsr_team_notifications"
        private const val FOREGROUND_NOTIFICATION_ID = 1003
    }
}
