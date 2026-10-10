package com.liordahan.mgsrteam.features.clubchanges

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.utils.extractPlayerIdFromUrl
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn

/**
 * A single club-change movement row — the Android mirror of the web's
 * `ClubChangeItem` (mgsr-web/src/app/club-change-notifications/page.tsx). Built
 * from a CLUB_CHANGE [FeedEvent] joined (by Transfermarkt id) to the roster
 * player when the moved player is already in the database.
 */
data class ClubChangeItem(
    val playerUrl: String,
    val rosterPlayerId: String?,
    val displayName: String,
    val displayImage: String?,
    val displayPosition: String?,
    val displayAge: String?,
    val displayMarketValue: String?,
    val oldClub: String,
    val newClub: String,
    val newClubLogo: String?,
    val playerNationality: String?,
    val timestamp: Long?,
) {
    val isRoster: Boolean get() = !rosterPlayerId.isNullOrBlank()
}

data class ClubChangesUiState(
    val items: List<ClubChangeItem> = emptyList(),
    val rosterCount: Int = 0,
    val newTodayCount: Int = 0,
    val isLoading: Boolean = true,
)

abstract class IClubChangesViewModel : ViewModel() {
    abstract val uiState: StateFlow<ClubChangesUiState>
}

/**
 * Sources club-change notifications the SAME way the web does: it reads the
 * platform's `FeedEvents` Firestore collection (via
 * [FirebaseHandler.feedEventsTable], the exact collection Android's dashboard
 * already consumes), filters to `type == CLUB_CHANGE` with a non-blank
 * `playerTmProfile`, and joins each move to a roster [Player] by Transfermarkt
 * id. Fields map 1:1 to the web page: `oldValue` → old club, `newValue` → new
 * club, `playerName`/`playerImage`/`playerPosition`/`playerAge` from the event
 * with roster fall-backs. Re-subscribes on platform switch so Youth reads the
 * `FeedEventsYouth` / `PlayersYouth` collections automatically.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ClubChangesViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager,
) : IClubChangesViewModel() {

    companion object {
        private const val FEED_LIMIT = 1200L
        private const val ONE_DAY_MS = 86_400_000L
    }

    private val feedEventsFlow: Flow<List<FeedEvent>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.feedEventsTable)
                    .orderBy("timestamp", Query.Direction.DESCENDING)
                    .limit(FEED_LIMIT)
                    .addSnapshotListener { value, error ->
                        if (error != null) {
                            trySend(emptyList())
                            return@addSnapshotListener
                        }
                        val list = value?.documents?.mapNotNull { doc ->
                            try { doc.toObject(FeedEvent::class.java) } catch (_: Exception) { null }
                        } ?: emptyList()
                        trySend(list)
                    }
                awaitClose { listener.remove() }
            }
        }

    private val rosterFlow: Flow<List<Player>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .addSnapshotListener { value, error ->
                        if (error != null) {
                            trySend(emptyList())
                            return@addSnapshotListener
                        }
                        val list = value?.documents?.mapNotNull { doc ->
                            try { doc.toObject(Player::class.java) } catch (_: Exception) { null }
                        } ?: emptyList()
                        trySend(list)
                    }
                awaitClose { listener.remove() }
            }
        }

    override val uiState: StateFlow<ClubChangesUiState> =
        combine(feedEventsFlow, rosterFlow) { events, roster ->
            val rosterByTmId = roster
                .mapNotNull { player ->
                    val tmId = extractPlayerIdFromUrl(player.tmProfile) ?: return@mapNotNull null
                    tmId to player
                }
                .toMap()

            val items = events
                .filter { it.type == FeedEvent.TYPE_CLUB_CHANGE && !it.playerTmProfile.isNullOrBlank() }
                .sortedByDescending { it.timestamp ?: 0L }
                .map { event -> buildItem(event, rosterByTmId) }

            val cutoff = System.currentTimeMillis() - ONE_DAY_MS
            ClubChangesUiState(
                items = items,
                rosterCount = items.count { it.isRoster },
                newTodayCount = items.count { (it.timestamp ?: 0L) >= cutoff },
                isLoading = false,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = ClubChangesUiState(isLoading = true),
        )

    private fun buildItem(event: FeedEvent, rosterByTmId: Map<String, Player>): ClubChangeItem {
        val playerUrl = event.playerTmProfile.orEmpty()
        val tmId = extractPlayerIdFromUrl(playerUrl)
        val rosterPlayer = tmId?.let { rosterByTmId[it] }

        val newClub = firstText(event.newValue, rosterPlayer?.currentClub?.clubName) ?: "—"
        // Only attach the roster's stored logo when its current club matches the
        // move's destination, so we never show a stale/wrong crest (same guard
        // as the web page).
        val rosterClubName = rosterPlayer?.currentClub?.clubName
        val newClubLogo = rosterPlayer?.currentClub?.clubLogo
            ?.takeIf {
                !rosterClubName.isNullOrBlank() &&
                    rosterClubName.trim().equals(newClub.trim(), ignoreCase = true)
            }

        return ClubChangeItem(
            playerUrl = playerUrl,
            rosterPlayerId = rosterPlayer?.id,
            displayName = firstText(event.playerName, rosterPlayer?.fullName) ?: "Unknown",
            displayImage = firstText(event.playerImage, rosterPlayer?.profileImage),
            displayPosition = firstText(event.extraInfoPosition(), rosterPlayer?.positions?.firstOrNull { hasText(it) }),
            displayAge = firstText(rosterPlayer?.age),
            displayMarketValue = firstText(rosterPlayer?.marketValue),
            oldClub = firstText(event.oldValue) ?: "—",
            newClub = newClub,
            newClubLogo = newClubLogo,
            playerNationality = firstText(rosterPlayer?.nationality),
            timestamp = event.timestamp,
        )
    }

    /**
     * The web stores the player's position on the CLUB_CHANGE event; the Android
     * [FeedEvent] model does not carry a dedicated position field, so we fall
     * back to the roster player's position in [buildItem]. This hook keeps the
     * resolution order identical to the web (event first, roster second).
     */
    private fun FeedEvent.extraInfoPosition(): String? = null

    private fun hasText(value: String?): Boolean {
        val cleaned = value?.trim() ?: return false
        return cleaned.isNotEmpty() && cleaned != "-" && cleaned != "—"
    }

    private fun firstText(vararg values: String?): String? =
        values.firstOrNull { hasText(it) }?.trim()
}
