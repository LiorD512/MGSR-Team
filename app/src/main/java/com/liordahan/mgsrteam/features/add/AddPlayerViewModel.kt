package com.liordahan.mgsrteam.features.add

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearch
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearchResult
import com.liordahan.mgsrteam.transfermarket.TransfermarktPlayerDetails
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
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

data class AddPlayerUiState(
    val playerSearchResults: List<PlayerSearchModel> = emptyList(),
    /** SoccerDonna search results for Women platform. */
    val womenSearchResults: List<SoccerDonnaSearchResult> = emptyList(),
    /** IFA search results for Youth platform. */
    val youthSearchResults: List<MgsrWebApiClient.IFASearchResult> = emptyList(),
    val showSearchProgress: Boolean = false,
    val showPlayerSelectedSearchProgress: Boolean = false
)

/** Form state for the Women single-page add-player form (mirrors web AddWomanPlayerForm). */
data class WomanPlayerFormState(
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

/** Form state for the Youth single-page add-player form (mirrors web AddYouthPlayerForm). */
data class YouthPlayerFormState(
    val fullName: String = "",
    val fullNameHe: String = "",
    val positions: List<String> = emptyList(),
    val currentClub: String = "",
    val academy: String = "",
    val dateOfBirth: String = "",
    val ageGroup: String = "",
    val nationality: String = "",
    val profileImage: String = "",
    val ifaUrl: String = "",
    val playerPhone: String = "",
    val playerEmail: String = "",
    val parentName: String = "",
    val parentRelationship: String = "",
    val parentPhone: String = "",
    val parentEmail: String = "",
    val notes: String = "",
    val isSaving: Boolean = false
) {
    companion object {
        val YOUTH_POSITIONS = listOf("GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "CF", "SS")
        val AGE_GROUPS = listOf("U-13", "U-14", "U-15", "U-17", "U-19", "U-21")
        val PARENT_RELATIONSHIPS = listOf("Father", "Mother", "Guardian", "Agent")

        /** Auto-compute age group from birth year, matching web logic. */
        fun computeAgeGroup(dateOfBirth: String): String {
            val year = dateOfBirth.takeLast(4).toIntOrNull() ?: return ""
            val currentYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
            val age = currentYear - year
            return when {
                age <= 13 -> "U-13"
                age <= 14 -> "U-14"
                age <= 15 -> "U-15"
                age <= 17 -> "U-17"
                age <= 19 -> "U-19"
                age <= 21 -> "U-21"
                else -> ""
            }
        }
    }
}

abstract class IAddPlayerViewModel : ViewModel() {
    abstract val playerSearchStateFlow: StateFlow<AddPlayerUiState>
    abstract val selectedPlayerFlow: StateFlow<Player?>
    abstract val isPlayerAddedFlow: StateFlow<Boolean>
    abstract val errorMessageFlow: SharedFlow<String?>
    abstract val searchQuery: StateFlow<String>
    abstract fun onPlayerSelected(player: PlayerSearchModel)
    /** Load player by Transfermarkt profile URL (e.g. from Releases/Returnee "Add to agency"). */
    abstract fun loadPlayerByTmProfileUrl(tmProfileUrl: String)
    abstract fun updatePlayerNumber(number: String)
    abstract fun updateAgentNumber(number: String)
    abstract fun updateSearchQuery(query: String?)
    abstract fun onSavePlayerClicked()
    /** Create a Women/Youth player manually from a name (no Transfermarkt lookup). */
    abstract fun createManualPlayer(fullName: String)
    /** Select a SoccerDonna search result (Women): fetch profile + create player. */
    abstract fun onWomanPlayerSelected(result: SoccerDonnaSearchResult)
    /** Load a Women player by direct SoccerDonna profile URL. */
    abstract fun loadWomanPlayerByUrl(soccerDonnaUrl: String)
    /** Call when closing the add-player sheet so the next open doesn't use stale state. */
    abstract fun resetAfterAdd()

    /** Select an IFA search result (Youth): pre-fill youth form. */
    abstract fun onYouthPlayerSelected(result: MgsrWebApiClient.IFASearchResult)

    // ── Women single-page form (matches web AddWomanPlayerForm) ──
    abstract val womanFormState: StateFlow<WomanPlayerFormState>
    abstract fun updateWomanForm(updater: (WomanPlayerFormState) -> WomanPlayerFormState)
    abstract fun toggleWomanPosition(position: String)
    abstract fun saveWomanPlayer()
    abstract fun clearWomanForm()

    // ── Youth single-page form (matches web AddYouthPlayerForm) ──
    abstract val youthFormState: StateFlow<YouthPlayerFormState>
    abstract fun updateYouthForm(updater: (YouthPlayerFormState) -> YouthPlayerFormState)
    abstract fun toggleYouthPosition(position: String)
    abstract fun saveYouthPlayer()
    abstract fun clearYouthForm()

    // ── Shortlist save (Women/Youth) ──
    abstract fun saveWomanPlayerToShortlist()
    abstract fun saveYouthPlayerToShortlist()
    /** One-shot event: emitted when a shortlist add succeeds. */
    abstract val shortlistAddedEvent: SharedFlow<Unit>
    /** Pre-fill Youth form from shortlist entry data. */
    abstract fun prefillYouthFromShortlist(url: String)
    /** Pre-fill Women form from shortlist entry data. */
    abstract fun prefillWomanFromShortlist(url: String)
}

@OptIn(FlowPreview::class)
class AddPlayerViewModel(
    private val playerSearch: PlayerSearch,
    private val soccerDonnaSearch: SoccerDonnaSearch,
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager,
    private val webApiClient: MgsrWebApiClient,
    private val shortlistRepository: ShortlistRepository
) : IAddPlayerViewModel() {

    private val _playerSearchStateFlow = MutableStateFlow(AddPlayerUiState())
    override val playerSearchStateFlow: StateFlow<AddPlayerUiState> = _playerSearchStateFlow

    private val _selectedPlayerFlow = MutableStateFlow<Player?>(null)
    override val selectedPlayerFlow: StateFlow<Player?> = _selectedPlayerFlow

    private val _isPlayerAddedFlow = MutableStateFlow(false)
    override val isPlayerAddedFlow: StateFlow<Boolean> = _isPlayerAddedFlow

    private val _errorMessageFlow = MutableSharedFlow<String?>()
    override val errorMessageFlow: SharedFlow<String?> = _errorMessageFlow

    private val _shortlistAddedEvent = MutableSharedFlow<Unit>()
    override val shortlistAddedEvent: SharedFlow<Unit> = _shortlistAddedEvent

    private val _searchQuery = MutableStateFlow("")
    override val searchQuery: StateFlow<String> = _searchQuery

    private val _womanFormState = MutableStateFlow(WomanPlayerFormState())
    override val womanFormState: StateFlow<WomanPlayerFormState> = _womanFormState

    private val _youthFormState = MutableStateFlow(YouthPlayerFormState())
    override val youthFormState: StateFlow<YouthPlayerFormState> = _youthFormState

    private val isWomenPlatform: Boolean
        get() = platformManager.current.value == Platform.WOMEN

    private val isYouthPlatform: Boolean
        get() = platformManager.current.value == Platform.YOUTH

    init {
        viewModelScope.launch {
            searchQuery
                .debounce(400)
                .distinctUntilChanged()
                .collectLatest { query ->
                    if (isWomenPlatform) {
                        performWomenSearch(query)
                    } else if (isYouthPlatform) {
                        performYouthSearch(query)
                    } else {
                        performSearch(query)
                    }
                }
        }

    }

    // ── Men: Transfermarkt search ──

    private suspend fun performSearch(query: String?) {
        updateProgress(true)
        if (query.isNullOrBlank()) {
            _playerSearchStateFlow.update { it.copy(playerSearchResults = emptyList()) }
            updateProgress(false)
        } else {
            when (val response = playerSearch.getSearchResults(query)) {
                is TransfermarktResult.Failed -> {
                    _playerSearchStateFlow.update { it.copy(playerSearchResults = emptyList()) }
                }

                is TransfermarktResult.Success -> {
                    _playerSearchStateFlow.update {
                        it.copy(playerSearchResults = response.data)
                    }
                }
            }
            updateProgress(false)
        }
    }

    // ── Women: SoccerDonna search ──

    private suspend fun performWomenSearch(query: String?) {
        updateProgress(true)
        if (query.isNullOrBlank()) {
            _playerSearchStateFlow.update { it.copy(womenSearchResults = emptyList()) }
            updateProgress(false)
        } else {
            val results = soccerDonnaSearch.search(query)
            _playerSearchStateFlow.update { it.copy(womenSearchResults = results) }
            updateProgress(false)
        }
    }

    // ── Youth: IFA search ──

    private suspend fun performYouthSearch(query: String?) {
        updateProgress(true)
        if (query.isNullOrBlank()) {
            _playerSearchStateFlow.update { it.copy(youthSearchResults = emptyList()) }
            updateProgress(false)
        } else {
            val result = webApiClient.searchYouthIFA(query)
            val results = result.getOrDefault(emptyList())
            _playerSearchStateFlow.update { it.copy(youthSearchResults = results) }
            updateProgress(false)
        }
    }

    override fun onYouthPlayerSelected(result: MgsrWebApiClient.IFASearchResult) {
        // Pre-fill the youth form with IFA data and clear search
        _youthFormState.update {
            YouthPlayerFormState(
                fullName = result.fullName,
                fullNameHe = result.fullNameHe ?: "",
                currentClub = result.currentClub ?: "",
                dateOfBirth = result.dateOfBirth ?: "",
                ageGroup = result.dateOfBirth?.let { YouthPlayerFormState.computeAgeGroup(it) } ?: "",
                ifaUrl = result.ifaUrl ?: ""
            )
        }
        _searchQuery.update { "" }
        _playerSearchStateFlow.update { it.copy(youthSearchResults = emptyList()) }
    }

    override fun onWomanPlayerSelected(result: SoccerDonnaSearchResult) {
        viewModelScope.launch {
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                // Duplicate check by soccerDonnaUrl
                if (!result.soccerDonnaUrl.isNullOrBlank()) {
                    val snapshot = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("soccerDonnaUrl", result.soccerDonnaUrl)
                        .get()
                        .await()
                    if (snapshot.documents.isNotEmpty()) {
                        _errorMessageFlow.emit("Player already in roster")
                        _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                        return@launch
                    }
                }

                // Fetch full profile from SoccerDonna
                val profile = result.soccerDonnaUrl?.let { soccerDonnaSearch.fetchProfile(it) }

                // Fill form state (web-style: pre-fill editable form)
                _womanFormState.update {
                    WomanPlayerFormState(
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
                // Clear search so dropdown hides
                _searchQuery.update { "" }
                _playerSearchStateFlow.update { it.copy(womenSearchResults = emptyList()) }
            } catch (e: Exception) {
                // If profile fetch fails, still fill with basic data from search
                _womanFormState.update {
                    WomanPlayerFormState(
                        fullName = result.fullName,
                        currentClub = result.currentClub ?: "",
                        soccerDonnaUrl = result.soccerDonnaUrl ?: ""
                    )
                }
                _searchQuery.update { "" }
                _playerSearchStateFlow.update { it.copy(womenSearchResults = emptyList()) }
            }
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    override fun loadWomanPlayerByUrl(soccerDonnaUrl: String) {
        val url = soccerDonnaUrl.trim()
        if (url.isBlank() || !url.contains("soccerdonna")) return
        viewModelScope.launch {
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                // Duplicate check
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("soccerDonnaUrl", url)
                    .get()
                    .await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }

                val profile = soccerDonnaSearch.fetchProfile(url)
                if (profile == null) {
                    _errorMessageFlow.emit("Invalid SoccerDonna profile URL")
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
                _womanFormState.update {
                    WomanPlayerFormState(
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
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    /**
     * Maps SoccerDonna position strings (e.g. "Centre Forward", "Left Winger")
     * to short position abbreviations used in the app (e.g. "CF", "LW").
     */
    private fun mapSoccerDonnaPosition(raw: String): List<String> {
        val mapping = mapOf(
            "goalkeeper" to "GK",
            "centre back" to "CB",
            "centre-back" to "CB",
            "left back" to "LB",
            "left-back" to "LB",
            "right back" to "RB",
            "right-back" to "RB",
            "defensive midfielder" to "DM",
            "defensive midfield" to "DM",
            "central midfielder" to "CM",
            "central midfield" to "CM",
            "attacking midfielder" to "AM",
            "attacking midfield" to "AM",
            "left midfielder" to "LM",
            "left midfield" to "LM",
            "right midfielder" to "RM",
            "right midfield" to "RM",
            "left winger" to "LW",
            "right winger" to "RW",
            "centre forward" to "CF",
            "centre-forward" to "CF",
            "striker" to "ST",
            "forward" to "ST"
        )
        val lower = raw.lowercase().trim()
        val mapped = mapping[lower]
        return if (mapped != null) listOf(mapped) else listOf(raw)
    }

    // ── Women form-state helpers ──

    override fun updateWomanForm(updater: (WomanPlayerFormState) -> WomanPlayerFormState) {
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
        _womanFormState.update { WomanPlayerFormState() }
    }

    // ── Youth form-state helpers ──

    override fun updateYouthForm(updater: (YouthPlayerFormState) -> YouthPlayerFormState) {
        _youthFormState.update(updater)
    }

    override fun toggleYouthPosition(position: String) {
        _youthFormState.update { state ->
            val current = state.positions.toMutableList()
            if (current.contains(position)) current.remove(position) else current.add(position)
            state.copy(positions = current)
        }
    }

    override fun clearYouthForm() {
        _youthFormState.update { YouthPlayerFormState() }
    }

    override fun saveYouthPlayer() {
        val form = _youthFormState.value
        if (form.fullName.isBlank()) return
        _youthFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                // Duplicate check by fullName
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("fullName", form.fullName.trim())
                    .get()
                    .await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _youthFormState.update { it.copy(isSaving = false) }
                    return@launch
                }

                // Get agent info
                val accountsSnapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.accountsTable)
                    .get()
                    .await()
                val accounts = accountsSnapshot.toObjects(Account::class.java)
                val agentInChargeName = accounts.firstOrNull {
                    it.email?.equals(
                        firebaseHandler.firebaseAuth.currentUser?.email,
                        ignoreCase = true
                    ) == true
                }?.name

                val parentContact = if (form.parentName.isNotBlank() || form.parentPhone.isNotBlank()) {
                    com.liordahan.mgsrteam.features.players.models.ParentContact(
                        parentName = form.parentName.takeIf { it.isNotBlank() },
                        parentRelationship = form.parentRelationship.takeIf { it.isNotBlank() },
                        parentPhoneNumber = form.parentPhone.takeIf { it.isNotBlank() },
                        parentEmail = form.parentEmail.takeIf { it.isNotBlank() }
                    )
                } else null

                val player = Player(
                    fullName = form.fullName.trim(),
                    fullNameHe = form.fullNameHe.takeIf { it.isNotBlank() },
                    positions = form.positions.ifEmpty { null },
                    currentClub = form.currentClub.takeIf { it.isNotBlank() }?.let { Club(clubName = it) },
                    academy = form.academy.takeIf { it.isNotBlank() },
                    dateOfBirth = form.dateOfBirth.takeIf { it.isNotBlank() },
                    ageGroup = form.ageGroup.takeIf { it.isNotBlank() },
                    nationality = form.nationality.takeIf { it.isNotBlank() },
                    profileImage = form.profileImage.takeIf { it.isNotBlank() },
                    ifaUrl = form.ifaUrl.takeIf { it.isNotBlank() },
                    playerPhoneNumber = form.playerPhone.takeIf { it.isNotBlank() },
                    playerEmail = form.playerEmail.takeIf { it.isNotBlank() },
                    parentContact = parentContact,
                    notes = form.notes.takeIf { it.isNotBlank() },
                    createdAt = System.currentTimeMillis(),
                    agentInChargeName = agentInChargeName
                )

                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .add(player)
                    .await()

                com.liordahan.mgsrteam.analytics.AnalyticsHelper.logAddPlayer()

                // Write feed event
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.feedEventsTable)
                    .add(
                        FeedEvent(
                            type = FeedEvent.TYPE_PLAYER_ADDED,
                            playerName = player.fullName,
                            playerImage = player.profileImage,
                            playerTmProfile = null,
                            timestamp = System.currentTimeMillis(),
                            agentName = agentInChargeName
                        )
                    )

                _isPlayerAddedFlow.update { true }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to save player")
            }
            _youthFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun saveWomanPlayer() {
        val form = _womanFormState.value
        if (form.fullName.isBlank()) return
        _womanFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                // Duplicate check by soccerDonnaUrl
                if (form.soccerDonnaUrl.isNotBlank()) {
                    val snapshot = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("soccerDonnaUrl", form.soccerDonnaUrl)
                        .get()
                        .await()
                    if (snapshot.documents.isNotEmpty()) {
                        _errorMessageFlow.emit("Player already in roster")
                        _womanFormState.update { it.copy(isSaving = false) }
                        return@launch
                    }
                }

                // Get agent info
                val accountsSnapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.accountsTable)
                    .get()
                    .await()
                val accounts = accountsSnapshot.toObjects(Account::class.java)
                val agentInChargeName = accounts.firstOrNull {
                    it.email?.equals(
                        firebaseHandler.firebaseAuth.currentUser?.email,
                        ignoreCase = true
                    ) == true
                }?.name

                val player = Player(
                    fullName = form.fullName.trim(),
                    positions = form.positions.ifEmpty { null },
                    currentClub = form.currentClub.takeIf { it.isNotBlank() }?.let { Club(clubName = it) },
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
                    .collection(firebaseHandler.playersTable)
                    .add(player)
                    .await()

                com.liordahan.mgsrteam.analytics.AnalyticsHelper.logAddPlayer()

                // Write feed event — for Women/Youth use document ID (no tmProfile)
                val feedProfileId = player.tmProfile ?: docRef.id
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.feedEventsTable)
                    .add(
                        FeedEvent(
                            type = FeedEvent.TYPE_PLAYER_ADDED,
                            playerName = player.fullName,
                            playerImage = player.profileImage,
                            playerTmProfile = feedProfileId,
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


    override fun onPlayerSelected(player: PlayerSearchModel) {
        viewModelScope.launch {
            selectPlayerAndLoadIfNew(player)
        }
    }

    override fun loadPlayerByTmProfileUrl(tmProfileUrl: String) {
        val url = tmProfileUrl.trim()
        if (url.isBlank()) return
        // Route SoccerDonna URLs to the Women-specific loader
        if (url.contains("soccerdonna")) {
            loadWomanPlayerByUrl(url)
            return
        }
        viewModelScope.launch {
            val searchModel = PlayerSearchModel(tmProfile = url)
            selectPlayerAndLoadIfNew(searchModel)
        }
    }

    private suspend fun selectPlayerAndLoadIfNew(player: PlayerSearchModel) {
        _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
        try {
            val snapshot = firebaseHandler.firebaseStore
                .collection(firebaseHandler.playersTable)
                .whereEqualTo("tmProfile", player.tmProfile)
                .get()
                .await()
            val existing = snapshot.toObjects(Player::class.java).firstOrNull()
            if (existing != null) {
                _errorMessageFlow.emit("Player already in roster")
                _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
            } else {
                getPlayerBasicInfo(player)
            }
        } catch (e: Exception) {
            _errorMessageFlow.emit(e.message ?: "Failed to check player")
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    private fun getPlayerBasicInfo(playerSearchModel: PlayerSearchModel){
        viewModelScope.launch {
            val details: TransfermarktPlayerDetails = playerSearch.getPlayerBasicInfo(playerSearchModel)
            val playerToSave = Player(
                tmProfile = details.tmProfile,
                fullName = details.fullName,
                height = details.height,
                age = details.age,
                positions = details.positions,
                profileImage = details.profileImage,
                nationality = details.nationality,
                nationalityFlag = details.nationalityFlag,
                contractExpired = details.contractExpires,
                marketValue = details.marketValue,
                currentClub = details.currentClub?.let {
                    Club(
                        clubName = it.clubName,
                        clubLogo = it.clubLogo,
                        clubTmProfile = it.clubTmProfile,
                        clubCountry = it.clubCountry
                    )
                },
                createdAt = System.currentTimeMillis(),
                isOnLoan = details.isOnLoan,
                onLoanFromClub = details.onLoanFromClub,
                foot = details.foot
            )
            _selectedPlayerFlow.update { playerToSave }
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    override fun updatePlayerNumber(number: String) {
        _selectedPlayerFlow.update {
            it?.copy(playerPhoneNumber = number)
        }
    }

    override fun updateAgentNumber(number: String) {
        _selectedPlayerFlow.update {
            it?.copy(agentPhoneNumber = number)
        }
    }

    override fun updateSearchQuery(query: String?) {
        _searchQuery.update { query ?: "" }
    }

    override fun onSavePlayerClicked() {
        _selectedPlayerFlow.update {
            it?.copy(agentInChargeName = firebaseHandler.firebaseAuth.currentUser?.displayName)
        }

        firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get()
            .addOnSuccessListener {
                val accounts = it.toObjects(Account::class.java)
                val agentInChargeName = accounts.firstOrNull {
                    it.email?.equals(
                        firebaseHandler.firebaseAuth.currentUser?.email,
                        ignoreCase = true
                    ) == true
                }?.name

                _selectedPlayerFlow.update {
                    it?.copy(agentInChargeName = agentInChargeName)
                }

                _selectedPlayerFlow.value?.let { playerToSave ->
                    firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable).add(playerToSave)
                        .addOnSuccessListener {
                            com.liordahan.mgsrteam.analytics.AnalyticsHelper.logAddPlayer()
                            _isPlayerAddedFlow.update { true }
                            // Write feed event (no push)
                            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                                FeedEvent(
                                    type = FeedEvent.TYPE_PLAYER_ADDED,
                                    playerName = playerToSave.fullName,
                                    playerImage = playerToSave.profileImage,
                                    playerTmProfile = playerToSave.tmProfile,
                                    timestamp = System.currentTimeMillis(),
                                    agentName = agentInChargeName
                                )
                            )
                        }
                }
            }

    }

    override fun createManualPlayer(fullName: String) {
        if (fullName.isBlank()) return
        viewModelScope.launch {
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                // Check for duplicate by fullName in the current platform's collection
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("fullName", fullName.trim())
                    .get()
                    .await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
            } catch (_: Exception) { /* proceed even if dedup check fails */ }

            val player = Player(
                fullName = fullName.trim(),
                createdAt = System.currentTimeMillis()
            )
            _selectedPlayerFlow.update { player }
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    private fun updateProgress(showProgress: Boolean) {
        _playerSearchStateFlow.update { it.copy(showSearchProgress = showProgress) }
    }

    // ── Shortlist save (Women/Youth) ──

    override fun saveWomanPlayerToShortlist() {
        val form = _womanFormState.value
        if (form.fullName.isBlank()) return
        _womanFormState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            try {
                val url = form.soccerDonnaUrl.takeIf { it.isNotBlank() }
                    ?: "women-${form.fullName.trim().lowercase().replace(" ", "-")}-${System.currentTimeMillis()}"
                val release = LatestTransferModel(
                    playerImage = form.profileImage.takeIf { it.isNotBlank() },
                    playerName = form.fullName.trim(),
                    playerUrl = url,
                    playerPosition = form.positions.firstOrNull(),
                    playerAge = form.age.takeIf { it.isNotBlank() },
                    playerNationality = form.nationality.takeIf { it.isNotBlank() },
                    clubJoinedName = form.currentClub.takeIf { it.isNotBlank() },
                    marketValue = form.marketValue.takeIf { it.isNotBlank() }
                )
                when (shortlistRepository.addToShortlist(release)) {
                    is ShortlistRepository.AddToShortlistResult.Added -> {
                        _shortlistAddedEvent.emit(Unit)
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist -> {
                        _errorMessageFlow.emit("Player already in shortlist")
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInRoster -> {
                        _errorMessageFlow.emit("Player already in roster")
                    }
                }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to add to shortlist")
            }
            _womanFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun saveYouthPlayerToShortlist() {
        val form = _youthFormState.value
        if (form.fullName.isBlank()) return
        _youthFormState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            try {
                val url = form.ifaUrl.takeIf { it.isNotBlank() }
                    ?: "youth-${form.fullName.trim().lowercase().replace(" ", "-")}-${System.currentTimeMillis()}"
                val release = LatestTransferModel(
                    playerImage = form.profileImage.takeIf { it.isNotBlank() },
                    playerName = form.fullName.trim(),
                    playerUrl = url,
                    playerPosition = form.positions.firstOrNull(),
                    playerNationality = form.nationality.takeIf { it.isNotBlank() },
                    clubJoinedName = form.currentClub.takeIf { it.isNotBlank() }
                )
                when (shortlistRepository.addToShortlist(release)) {
                    is ShortlistRepository.AddToShortlistResult.Added -> {
                        _shortlistAddedEvent.emit(Unit)
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist -> {
                        _errorMessageFlow.emit("Player already in shortlist")
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInRoster -> {
                        _errorMessageFlow.emit("Player already in roster")
                    }
                }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to add to shortlist")
            }
            _youthFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun prefillYouthFromShortlist(url: String) {
        viewModelScope.launch {
            try {
                val entry = shortlistRepository.getEntryByUrl(url) ?: return@launch
                _youthFormState.update {
                    YouthPlayerFormState(
                        fullName = entry.playerName ?: "",
                        positions = listOfNotNull(entry.playerPosition),
                        nationality = entry.playerNationality ?: "",
                        currentClub = entry.clubJoinedName ?: "",
                        profileImage = entry.playerImage ?: "",
                        ifaUrl = if (url.contains("ifa.co.il")) url else ""
                    )
                }
            } catch (_: Exception) { }
        }
    }

    override fun prefillWomanFromShortlist(url: String) {
        viewModelScope.launch {
            try {
                val entry = shortlistRepository.getEntryByUrl(url) ?: return@launch
                _womanFormState.update {
                    WomanPlayerFormState(
                        fullName = entry.playerName ?: "",
                        positions = listOfNotNull(entry.playerPosition),
                        nationality = entry.playerNationality ?: "",
                        currentClub = entry.clubJoinedName ?: "",
                        age = entry.playerAge ?: "",
                        marketValue = entry.marketValue ?: "",
                        profileImage = entry.playerImage ?: "",
                        soccerDonnaUrl = if (url.contains("soccerdonna")) url else ""
                    )
                }
            } catch (_: Exception) { }
        }
    }

    override fun resetAfterAdd() {
        _isPlayerAddedFlow.value = false
        _selectedPlayerFlow.value = null
        _womanFormState.update { WomanPlayerFormState() }
        _youthFormState.update { YouthPlayerFormState() }
        _playerSearchStateFlow.update {
            it.copy(
                showPlayerSelectedSearchProgress = false,
                womenSearchResults = emptyList()
            )
        }
    }
}