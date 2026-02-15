package com.liordahan.mgsrteam.work

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.MarketValueEntry
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlin.random.Random
import java.util.concurrent.TimeUnit

/**
 * Background worker that refreshes players from Transfermarkt and appends market value history.
 *
 * **Access control**: Only the device signed in as [AUTHORIZED_EMAIL] executes the scraping.
 * All other devices silently succeed without doing any work.
 *
 * **Schedule**: Triggered daily by a periodic work. When a run processes a full batch
 * ([BATCH_SIZE] players), it chains a follow-up run 2–3 minutes later. This continues
 * until the roster is fully updated (fewer than [BATCH_SIZE] players remain).
 *
 * **Push notifications**: When changes are detected the worker writes [FeedEvent] documents
 * to Firestore. A Firebase Cloud Function (`onNewFeedEvent`) watches that collection and
 * sends a push notification to the `mgsr_all` FCM topic, so **every** user receives it
 * regardless of which device ran the scraper.
 *
 * Key behaviours:
 * - Players are sorted by [Player.lastRefreshedAt] ascending so the **stalest** players are
 *   updated first, guaranteeing full roster rotation over successive runs.
 * - After every [NETWORK_SWITCH_INTERVAL] players the worker switches between available
 *   Android networks (WiFi ↔ Cellular) to change the outgoing IP address.
 * - A random user-agent is used for each HTTP request (handled inside [PlayersUpdate]).
 * - Randomised delays between requests further reduce the "bot" fingerprint.
 * - Writes [FeedEvent] entries so the Home dashboard can display recent changes.
 */
class PlayerRefreshWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // ── 0. Only run on the authorised device ──
        val currentEmail = FirebaseAuth.getInstance().currentUser?.email
        if (!currentEmail.equals(AUTHORIZED_EMAIL, ignoreCase = true)) {
            // Not the designated device – skip silently.
            return@withContext Result.success()
        }

        val firebaseHandler = FirebaseHandler()
        val playersUpdate = PlayersUpdate()
        val store = FirebaseFirestore.getInstance()
        val playersRef = store.collection(firebaseHandler.playersTable)
        val feedRef = store.collection(firebaseHandler.feedEventsTable)

        try {
            // ── 1. Fetch ALL players that have a TM profile, sorted by stalest first ──
            val snapshot = playersRef.get().await()

            val playersWithDocs = snapshot.documents
                .mapNotNull { doc ->
                    val player = doc.toObject(Player::class.java) ?: return@mapNotNull null
                    if (player.tmProfile.isNullOrBlank()) return@mapNotNull null
                    player to doc.reference
                }
                .sortedBy { (player, _) -> player.lastRefreshedAt ?: 0L }
                .take(BATCH_SIZE)

            if (playersWithDocs.isEmpty()) return@withContext Result.success()

            // ── 2. Detect available networks for IP rotation ──
            val networks = getAvailableNetworks()
            var networkIndex = 0
            var successCount = 0

            for ((index, pair) in playersWithDocs.withIndex()) {
                val (player, docRef) = pair
                val tmProfile = player.tmProfile ?: continue

                // Switch network every NETWORK_SWITCH_INTERVAL players
                if (index > 0 && index % NETWORK_SWITCH_INTERVAL == 0 && networks.size > 1) {
                    networkIndex++
                    // Longer cooldown when switching IP
                    delay(COOLDOWN_MIN_MS + Random.nextLong(COOLDOWN_VARIANCE_MS))
                }

                val currentNetwork = if (networks.size > 1) {
                    networks[networkIndex % networks.size]
                } else {
                    null // single network – use default route
                }

                when (val result = playersUpdate.updatePlayerByTmProfile(tmProfile, currentNetwork)) {
                    is TransfermarktResult.Success -> {
                        result.data?.let { data ->
                            val currentValue = player.marketValue
                            val newValueRaw = data.marketValue
                            // Treat no market value as €0
                            val newValue = newValueRaw?.takeIf { it.isNotBlank() } ?: "€0"
                            val valueChanged = newValue != (currentValue ?: "€0")
                            val history = if (valueChanged) {
                                val entry = MarketValueEntry(value = newValue, date = System.currentTimeMillis())
                                val list = (player.marketValueHistory?.toMutableList() ?: mutableListOf()).apply { add(entry) }
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

                            val newClubName = club?.clubName
                            val nowWithoutClub = newClubName != null && newClubName.equals("Without club", true)

                            // ── Write feed events for detected changes ──
                            // (A Firebase Cloud Function triggers on new FeedEvent
                            //  documents and sends push notifications to ALL users.)
                            val now = System.currentTimeMillis()

                            if (valueChanged) {
                                writeFeedEvent(feedRef, FeedEvent(
                                    type = FeedEvent.TYPE_MARKET_VALUE_CHANGE,
                                    playerName = player.fullName,
                                    playerImage = data.profileImage ?: player.profileImage,
                                    playerTmProfile = tmProfile,
                                    oldValue = currentValue,
                                    newValue = newValue,
                                    timestamp = now
                                ))
                            }

                            val oldClubName = player.currentClub?.clubName
                            if (newClubName != null && !newClubName.equals(oldClubName, true)) {
                                val eventType = if (nowWithoutClub) {
                                    FeedEvent.TYPE_BECAME_FREE_AGENT
                                } else {
                                    FeedEvent.TYPE_CLUB_CHANGE
                                }
                                writeFeedEvent(feedRef, FeedEvent(
                                    type = eventType,
                                    playerName = player.fullName,
                                    playerImage = data.profileImage ?: player.profileImage,
                                    playerTmProfile = tmProfile,
                                    oldValue = oldClubName,
                                    newValue = newClubName,
                                    timestamp = now
                                ))
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
                            successCount++
                            Log.i(TAG, "PlayerRefreshWorker: update succeed — ${player.fullName ?: "unknown"}")
                            Log.i(TAG, "PlayerRefreshWorker: $successCount player(s) successfully updated so far")
                        }
                    }
                    is TransfermarktResult.Failed -> {
                        Log.w(TAG, "PlayerRefreshWorker: update failed — ${player.fullName ?: "unknown"} — ${result.cause ?: "unknown error"}")
                        // Skip this player – will be retried on the next run
                        // (it stays at the top of the staleness queue)
                    }
                }

                // Randomised delay between individual requests
                delay(DELAY_MIN_MS + Random.nextLong(DELAY_VARIANCE_MS))
            }

            // ── 3. Chain follow-up if more players remain ──
            // Processed a full batch → there may be more; schedule next run in 2–3 min
            if (playersWithDocs.size == BATCH_SIZE) {
                val delayMinutes = CHAIN_DELAY_MIN_MINUTES + Random.nextLong(CHAIN_DELAY_EXTRA_MINUTES)
                val followUp = OneTimeWorkRequestBuilder<PlayerRefreshWorker>()
                    .setInitialDelay(delayMinutes, TimeUnit.MINUTES)
                    .build()
                WorkManager.getInstance(applicationContext).enqueue(followUp)
                Log.i(TAG, "PlayerRefreshWorker: run complete ($successCount succeeded). Scheduled follow-up in $delayMinutes min")
            } else {
                Log.i(TAG, "PlayerRefreshWorker: roster fully updated ($successCount succeeded this run)")
            }

            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    // ── Network helpers ──────────────────────────────────────────────────────

    /**
     * Returns the list of usable networks (WiFi and/or Cellular).
     * When both are available the worker alternates between them to change IP.
     */
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
        } catch (_: Exception) { /* best-effort */ }
    }

    companion object {
        private const val TAG = "PlayerRefreshWorker"

        /** Only this user's device will execute the Transfermarkt scraping. */
        private const val AUTHORIZED_EMAIL = "dahanliordahan@gmail.com"

        /** Max players per worker run (keeps execution well under the 10-minute WM limit). */
        private const val BATCH_SIZE = 20
        /** Keep last N market-value snapshots per player. */
        private const val MAX_HISTORY_ENTRIES = 24

        /** Switch to the other network (WiFi↔Cellular) every N players. */
        private const val NETWORK_SWITCH_INTERVAL = 3

        /** Randomised delay between individual player requests (ms). */
        private const val DELAY_MIN_MS = 4_000L
        private const val DELAY_VARIANCE_MS = 3_000L   // 4-7 s

        /** Longer pause when switching networks (ms). */
        private const val COOLDOWN_MIN_MS = 12_000L
        private const val COOLDOWN_VARIANCE_MS = 8_000L // 12-20 s

        /** Delay before chained follow-up run: 2 + random(0..1) = 2–3 min. */
        private const val CHAIN_DELAY_MIN_MINUTES = 2L
        private const val CHAIN_DELAY_EXTRA_MINUTES = 2L // nextLong(2) yields 0 or 1
    }
}
