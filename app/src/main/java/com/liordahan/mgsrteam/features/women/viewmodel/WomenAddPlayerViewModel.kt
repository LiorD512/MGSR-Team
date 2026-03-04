package com.liordahan.mgsrteam.features.women.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenClub
import com.liordahan.mgsrteam.features.women.models.WomenFeedEvent
import com.liordahan.mgsrteam.features.women.models.WomenPlayer
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearch
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearchResult
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Women-dedicated add-player search UI state.
 */
data class WomenAddPlayerUiState(
    val womenSearchResults: List<SoccerDonnaSearchResult> = emptyList(),
    val showSearchProgress: Boolean = false,
    val showPlayerSelectedSearchProgress: Boolean = false
)

/**
 * Women-dedicated form state for adding a WomenPlayer.
 */
data class WomenPlayerFormState(
    val fullName: String = "",
    val positions: List<String> = emptyList(),
    val currentClub: String = "",
    val age: String = "",
    val nationality: String = "",
    val marketValue: String = "",
    val profileImage: String = "",
    val soccerDonnaUrl: String = "",
    val playerPhone: String = "",
    val agentPhone: String = "",
    val notes: String = "",
    val isSaving: Boolean = false
) {
    companion object {
        val WOMEN_POSITIONS = listOf("GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "CF", "SS")
    }
}

/**
 * Women-dedicated add-player abstract ViewModel.
 */
abstract class IWomenAddPlayerViewModel : ViewModel() {
    abstract val searchState: StateFlow<WomenAddPlayerUiState>
    abstract val isPlayerAddedFlow: StateFlow<Boolean>
    abstract val errorMessageFlow: SharedFlow<String?>
    abstract val searchQuery: StateFlow<String>
    abstract val womanFormState: StateFlow<WomenPlayerFormState>
    abstract fun updateSearchQuery(query: String?)
    abstract fun onWomanPlayerSelected(result: SoccerDonnaSearchResult)
    abstract fun loadWomanPlayerByUrl(soccerDonnaUrl: String)
    abstract fun updateWomanForm(updater: (WomenPlayerFormState) -> WomenPlayerFormState)
    abstract fun toggleWomanPosition(position: String)
    abstract fun saveWomanPlayer()
    abstract fun clearWomanForm()
    abstract fun createManualPlayer(fullName: String)
    abstract fun resetAfterAdd()
}

/**
 * Women-dedicated add-player ViewModel.
 * Uses WomenFirebaseHandler (hardcoded women collections) and SoccerDonnaSearch.
 * No PlatformManager dependency.
 */
@OptIn(FlowPreview::class)
class WomenAddPlayerViewModel(
    private val soccerDonnaSearch: SoccerDonnaSearch,
    private val firebaseHandler: WomenFirebaseHandler
) : IWomenAddPlayerViewModel() {

    private val _searchState = MutableStateFlow(WomenAddPlayerUiState())
    override val searchState: StateFlow<WomenAddPlayerUiState> = _searchState

    private val _isPlayerAddedFlow = MutableStateFlow(false)
    override val isPlayerAddedFlow: StateFlow<Boolean> = _isPlayerAddedFlow

    private val _errorMessageFlow = MutableSharedFlow<String?>()
    override val errorMessageFlow: SharedFlow<String?> = _errorMessageFlow

    private val _searchQuery = MutableStateFlow("")
    override val searchQuery: StateFlow<String> = _searchQuery

    private val _womanFormState = MutableStateFlow(WomenPlayerFormState())
    override val womanFormState: StateFlow<WomenPlayerFormState> = _womanFormState

    init {
        viewModelScope.launch {
            searchQuery
                .debounce(400)
                .distinctUntilChanged()
                .collectLatest { query -> performWomenSearch(query) }
        }
    }

    private suspend fun performWomenSearch(query: String?) {
        _searchState.update { it.copy(showSearchProgress = true) }
        if (query.isNullOrBlank()) {
            _searchState.update { it.copy(womenSearchResults = emptyList(), showSearchProgress = false) }
        } else {
            val results = soccerDonnaSearch.search(query)
            _searchState.update { it.copy(womenSearchResults = results, showSearchProgress = false) }
        }
    }

    override fun updateSearchQuery(query: String?) {
        _searchQuery.update { query ?: "" }
    }

    override fun onWomanPlayerSelected(result: SoccerDonnaSearchResult) {
        viewModelScope.launch {
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                if (!result.soccerDonnaUrl.isNullOrBlank()) {
                    val snapshot = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("soccerDonnaUrl", result.soccerDonnaUrl)
                        .get().await()
                    if (snapshot.documents.isNotEmpty()) {
                        _errorMessageFlow.emit("Player already in roster")
                        _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
                        return@launch
                    }
                }
                val profile = result.soccerDonnaUrl?.let { soccerDonnaSearch.fetchProfile(it) }
                _womanFormState.update {
                    WomenPlayerFormState(
                        fullName = profile?.fullName ?: result.fullName,
                        positions = profile?.position?.let { mapSoccerDonnaPosition(it) } ?: emptyList(),
                        currentClub = profile?.currentClub ?: result.currentClub ?: "",
                        age = profile?.age ?: "",
                        nationality = profile?.nationality ?: "",
                        marketValue = profile?.marketValue ?: "",
                        profileImage = profile?.profileImage ?: "",
                        soccerDonnaUrl = result.soccerDonnaUrl ?: ""
                    )
                }
                _searchQuery.update { "" }
                _searchState.update { it.copy(womenSearchResults = emptyList()) }
            } catch (_: Exception) {
                _womanFormState.update {
                    WomenPlayerFormState(
                        fullName = result.fullName,
                        currentClub = result.currentClub ?: "",
                        soccerDonnaUrl = result.soccerDonnaUrl ?: ""
                    )
                }
                _searchQuery.update { "" }
                _searchState.update { it.copy(womenSearchResults = emptyList()) }
            }
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    override fun loadWomanPlayerByUrl(soccerDonnaUrl: String) {
        val url = soccerDonnaUrl.trim()
        if (url.isBlank() || !url.contains("soccerdonna")) return
        viewModelScope.launch {
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("soccerDonnaUrl", url).get().await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
                val profile = soccerDonnaSearch.fetchProfile(url)
                if (profile == null) {
                    _errorMessageFlow.emit("Invalid SoccerDonna profile URL")
                    _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
                _womanFormState.update {
                    WomenPlayerFormState(
                        fullName = profile.fullName ?: "",
                        positions = profile.position?.let { mapSoccerDonnaPosition(it) } ?: emptyList(),
                        currentClub = profile.currentClub ?: "",
                        age = profile.age ?: "",
                        nationality = profile.nationality ?: "",
                        marketValue = profile.marketValue ?: "",
                        profileImage = profile.profileImage ?: "",
                        soccerDonnaUrl = profile.soccerDonnaUrl ?: url
                    )
                }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to load profile")
            }
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    private fun mapSoccerDonnaPosition(raw: String): List<String> {
        val mapping = mapOf(
            "goalkeeper" to "GK", "centre back" to "CB", "centre-back" to "CB",
            "left back" to "LB", "left-back" to "LB", "right back" to "RB", "right-back" to "RB",
            "defensive midfielder" to "DM", "defensive midfield" to "DM",
            "central midfielder" to "CM", "central midfield" to "CM",
            "attacking midfielder" to "AM", "attacking midfield" to "AM",
            "left midfielder" to "LM", "left midfield" to "LM",
            "right midfielder" to "RM", "right midfield" to "RM",
            "left winger" to "LW", "right winger" to "RW",
            "centre forward" to "CF", "centre-forward" to "CF",
            "striker" to "ST", "forward" to "ST"
        )
        val lower = raw.lowercase().trim()
        val mapped = mapping[lower]
        return if (mapped != null) listOf(mapped) else listOf(raw)
    }

    override fun updateWomanForm(updater: (WomenPlayerFormState) -> WomenPlayerFormState) {
        _womanFormState.update(updater)
    }

    override fun toggleWomanPosition(position: String) {
        _womanFormState.update { state ->
            val current = state.positions.toMutableList()
            if (current.contains(position)) current.remove(position) else current.add(position)
            state.copy(positions = current)
        }
    }

    override fun clearWomanForm() {
        _womanFormState.update { WomenPlayerFormState() }
    }

    override fun createManualPlayer(fullName: String) {
        if (fullName.isBlank()) return
        viewModelScope.launch {
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("fullName", fullName.trim()).get().await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
            } catch (_: Exception) { }
            _womanFormState.update {
                WomenPlayerFormState(fullName = fullName.trim())
            }
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    override fun saveWomanPlayer() {
        val form = _womanFormState.value
        if (form.fullName.isBlank()) return
        _womanFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                if (form.soccerDonnaUrl.isNotBlank()) {
                    val snapshot = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("soccerDonnaUrl", form.soccerDonnaUrl)
                        .get().await()
                    if (snapshot.documents.isNotEmpty()) {
                        _errorMessageFlow.emit("Player already in roster")
                        _womanFormState.update { it.copy(isSaving = false) }
                        return@launch
                    }
                }

                val accountsSnapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.accountsTable).get().await()
                val accounts = accountsSnapshot.toObjects(Account::class.java)
                val agentInChargeName = accounts.firstOrNull {
                    it.email?.equals(firebaseHandler.firebaseAuth.currentUser?.email, ignoreCase = true) == true
                }?.name

                val player = WomenPlayer(
                    fullName = form.fullName.trim(),
                    positions = form.positions.ifEmpty { null },
                    currentClub = form.currentClub.takeIf { it.isNotBlank() }?.let { WomenClub(clubName = it) },
                    age = form.age.takeIf { it.isNotBlank() },
                    nationality = form.nationality.takeIf { it.isNotBlank() },
                    marketValue = form.marketValue.takeIf { it.isNotBlank() },
                    profileImage = form.profileImage.takeIf { it.isNotBlank() },
                    soccerDonnaUrl = form.soccerDonnaUrl.takeIf { it.isNotBlank() },
                    playerPhoneNumber = form.playerPhone.takeIf { it.isNotBlank() },
                    agentPhoneNumber = form.agentPhone.takeIf { it.isNotBlank() },
                    notes = form.notes.takeIf { it.isNotBlank() },
                    createdAt = System.currentTimeMillis(),
                    agentInChargeName = agentInChargeName
                )

                val docRef = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable).add(player).await()

                com.liordahan.mgsrteam.analytics.AnalyticsHelper.logAddPlayer()

                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    WomenFeedEvent(
                        type = WomenFeedEvent.TYPE_PLAYER_ADDED,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        playerTmProfile = docRef.id,
                        timestamp = System.currentTimeMillis(),
                        agentName = agentInChargeName
                    )
                )

                _isPlayerAddedFlow.update { true }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to save player")
            }
            _womanFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun resetAfterAdd() {
        _isPlayerAddedFlow.value = false
        _womanFormState.update { WomenPlayerFormState() }
        _searchState.update { it.copy(showPlayerSelectedSearchProgress = false, womenSearchResults = emptyList()) }
    }
}
