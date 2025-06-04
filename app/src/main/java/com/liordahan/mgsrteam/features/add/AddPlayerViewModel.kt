package com.liordahan.mgsrteam.features.add

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.Result
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AddPlayerUiState(
    val playerSearchResults: List<PlayerSearchModel> = emptyList(),
    val showSearchProgress: Boolean = false
)

abstract class IAddPlayerViewModel : ViewModel() {
    abstract val playerSearchStateFlow: StateFlow<AddPlayerUiState>
    abstract val selectedPlayerFlow: StateFlow<Player?>
    abstract val isPlayerAddedFlow: StateFlow<Boolean>
    abstract fun getSearchResults(query: String?)
    abstract fun onPlayerSelected(player: PlayerSearchModel)
    abstract fun updatePlayerNumber(number: String)
    abstract fun updateAgentNumber(number: String)
    abstract fun onSavePlayerClicked()

}

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


    override fun getSearchResults(query: String?) {
        viewModelScope.launch(Dispatchers.IO) {
            updateProgress(true)
            if (query.isNullOrBlank()) {
                _playerSearchStateFlow.update { it.copy(playerSearchResults = emptyList()) }
                updateProgress(false)
            } else {
                when (val response = playerSearch.getSearchResults(query)) {
                    is Result.Failed -> {
                        _playerSearchStateFlow.update { it.copy(playerSearchResults = emptyList()) }
                        updateProgress(false)
                    }

                    is Result.Success -> {
                        _playerSearchStateFlow.update {
                            it.copy(playerSearchResults = response.data)
                        }
                        updateProgress(false)
                    }
                }
            }
        }
    }

    override fun onPlayerSelected(player: PlayerSearchModel) {
        viewModelScope.launch {
            val playerToSave = playerSearch.getPlayerBasicInfo(player)
            _selectedPlayerFlow.update { playerToSave }
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
                            _isPlayerAddedFlow.update { true }
                        }
                }
            }

    }

    private fun updateProgress(showProgress: Boolean) {
        _playerSearchStateFlow.update { it.copy(showSearchProgress = showProgress) }
    }

}