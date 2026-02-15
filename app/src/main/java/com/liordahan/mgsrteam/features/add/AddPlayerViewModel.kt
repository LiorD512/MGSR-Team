package com.liordahan.mgsrteam.features.add

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktPlayerDetails
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.delay
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
    val showSearchProgress: Boolean = false,
    val showPlayerSelectedSearchProgress: Boolean = false
)

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
    /** Call when closing the add-player sheet so the next open doesn't use stale state. */
    abstract fun resetAfterAdd()
}

@OptIn(FlowPreview::class)
class AddPlayerViewModel(
    private val playerSearch: PlayerSearch,
    private val firebaseHandler: FirebaseHandler
) : IAddPlayerViewModel() {

    private val _playerSearchStateFlow = MutableStateFlow(AddPlayerUiState())
    override val playerSearchStateFlow: StateFlow<AddPlayerUiState> = _playerSearchStateFlow

    private val _selectedPlayerFlow = MutableStateFlow<Player?>(null)
    override val selectedPlayerFlow: StateFlow<Player?> = _selectedPlayerFlow

    private val _isPlayerAddedFlow = MutableStateFlow(false)
    override val isPlayerAddedFlow: StateFlow<Boolean> = _isPlayerAddedFlow

    private val _errorMessageFlow = MutableSharedFlow<String?>()
    override val errorMessageFlow: SharedFlow<String?> = _errorMessageFlow

    private val _searchQuery = MutableStateFlow("")
    override val searchQuery: StateFlow<String> = _searchQuery

    init {
        viewModelScope.launch {
            searchQuery
                .debounce(400)
                .distinctUntilChanged()
                .collectLatest { query ->
                    performSearch(query)
                }
        }

    }

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


    override fun onPlayerSelected(player: PlayerSearchModel) {
        viewModelScope.launch {
            selectPlayerAndLoadIfNew(player)
        }
    }

    override fun loadPlayerByTmProfileUrl(tmProfileUrl: String) {
        val url = tmProfileUrl.trim()
        if (url.isBlank()) return
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
                onLoanFromClub = details.onLoanFromClub
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
                        }
                }
            }

    }

    private fun updateProgress(showProgress: Boolean) {
        _playerSearchStateFlow.update { it.copy(showSearchProgress = showProgress) }
    }

    override fun resetAfterAdd() {
        _isPlayerAddedFlow.value = false
        _selectedPlayerFlow.value = null
        _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
    }
}