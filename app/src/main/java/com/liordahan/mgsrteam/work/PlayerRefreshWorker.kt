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
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.MarketValueEntry
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.PlayerToUpdateValues
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
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
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // ── 0. Only run on the authorised device ──
        val currentEmail = FirebaseAuth.getInstance().currentUser?.email
        if (!currentEmail.equals(AUTHORIZED_EMAIL, ignoreCase = true)) {
            return@withContext Result.success()
        }

        // Promote to foreground service — prevents the OS from killing this work
        setForeground(createForegroundInfo("Starting player refresh…"))

        val firebaseHandler = FirebaseHandler()
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

            val totalPlayers = playersWithDocs.size
            Log.i(TAG, "Starting refresh for $totalPlayers players")

            // ── 2. Detect available networks for IP rotation ──
            val networks = getAvailableNetworks()
            val hasMultipleNetworks = networks.size > 1
            Log.i(TAG, "Available networks: ${networks.size} (${if (hasMultipleNetworks) "dual — alternating per request" else "single — steady pacing"})")

            var consecutiveBlocks = 0
            var successCount = 0
            var failCount = 0

            // ── 3. Process every player with steady, human-like pacing ──
            for ((index, pair) in playersWithDocs.withIndex()) {
                val (player, docRef) = pair
                val tmProfile = player.tmProfile ?: continue

                // Pick network: alternate on each request so each IP rests ~2× the delay
                val networkForRequest = if (hasMultipleNetworks) {
                    networks[index % networks.size]
                } else {
                    null // single network — use default route
                }

                setForeground(
                    createForegroundInfo("Refreshing ${index + 1}/$totalPlayers: ${player.fullName ?: "Unknown"}")
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
                                Log.i(TAG, "Updated ${index + 1}/$totalPlayers: ${player.fullName}")
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
                                    "BLOCKED ${index + 1}/$totalPlayers: ${player.fullName} " +
                                        "(retry $retries/$MAX_RETRIES, blocks: $consecutiveBlocks) " +
                                        "— backing off ${backoff / 1000}s — $cause"
                                )
                                setForeground(
                                    createForegroundInfo("Rate limited — waiting ${backoff / 1000}s before retry…")
                                )
                                delay(backoff)
                            } else {
                                failCount++
                                Log.w(TAG, "Failed ${index + 1}/$totalPlayers: ${player.fullName} — $cause")
                                break
                            }
                        }
                    }
                }

                if (!succeeded && retries > MAX_RETRIES) {
                    failCount++
                    Log.w(TAG, "Giving up on ${index + 1}/$totalPlayers: ${player.fullName} after $MAX_RETRIES retries")
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
                    Log.i(TAG, "Progress: ${index + 1}/$totalPlayers — $successCount ok, $failCount failed")
                }
            }

            Log.i(TAG, "Roster refresh complete — $successCount succeeded, $failCount failed out of $totalPlayers")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Worker failed with exception", e)
            Result.retry()
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
            val nowWithoutClub = newClubName.equals("Without club", true)
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
            onLoanFromClub = data.onLoanFromClub
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
            feedRef.add(event).await()
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

    // ── Foreground notification ──────────────────────────────────────────────

    private fun createForegroundInfo(progress: String): ForegroundInfo {
        val channelId = NOTIFICATION_CHANNEL_ID
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Player Data Refresh",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shown while player data is being refreshed from Transfermarkt"
            }
            val manager = applicationContext
                .getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.ic_stat_mgsr)
            .setContentTitle("MGSR Player Refresh")
            .setContentText(progress)
            .setOngoing(true)
            .setSilent(true)
            .setColor(0xFF39D164.toInt())
            .build()

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

    companion object {
        private const val TAG = "PlayerRefreshWorker"

        private const val AUTHORIZED_EMAIL = "dahanliordahan@gmail.com"
        private const val MAX_HISTORY_ENTRIES = 24

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

        private const val NOTIFICATION_CHANNEL_ID = "mgsr_player_refresh"
        private const val FOREGROUND_NOTIFICATION_ID = 1003
    }
}
