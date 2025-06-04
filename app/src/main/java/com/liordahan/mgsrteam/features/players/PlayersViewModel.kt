package com.liordahan.mgsrteam.features.players

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.Result
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await


data class PlayersUiState(
    val playersList: List<Player> = emptyList(),
    val visibleList: List<Player> = emptyList(),
    val positionList: List<Position> = emptyList(),
    val showPageLoader: Boolean = false,
    val showRefreshButton: Boolean = false,
    val showEmptyState: Boolean = false
)

abstract class IPlayersViewModel : ViewModel() {
    abstract val playersFlow: StateFlow<PlayersUiState>
    abstract suspend fun getCurrentUserName(): String?
    abstract fun filterPlayersByName(name: String)
    abstract fun filterPlayersByPosition(position: Position?)
    abstract fun updateAllPlayers()
}

class PlayersViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val playersUpdate: PlayersUpdate
) : IPlayersViewModel() {

    private val _playersFlow = MutableStateFlow(PlayersUiState())
    override val playersFlow: StateFlow<PlayersUiState> = _playersFlow

    init {
        getAllPlayers()
        getAllPositions()
    }


    override suspend fun getCurrentUserName(): String? {
        return try {
            val snapshot =
                firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get()
                    .await()
            val accounts = snapshot.toObjects(Account::class.java)
            val account = accounts.firstOrNull {
                it.email?.equals(
                    firebaseHandler.firebaseAuth.currentUser?.email,
                    ignoreCase = true
                ) == true
            }
            if (account?.email.equals("dahanliordahan@gmail.com", ignoreCase = true)) {
                _playersFlow.update { it.copy(showRefreshButton = true) }
            }

            account?.name
        } catch (e: Exception) {
            null
        }
    }

    override fun filterPlayersByName(name: String) {
        val filteredList = if (name.isBlank()) {
            _playersFlow.value.playersList
        } else {
            _playersFlow.value.playersList.filter {
                it.fullName?.contains(name, ignoreCase = true) == true
            }
        }

        _playersFlow.update {
            it.copy(
                visibleList = filteredList.sortedByDescending { player -> player.createdAt },
                showEmptyState = filteredList.isEmpty()
            )
        }
    }

    override fun filterPlayersByPosition(position: Position?) {
        val filteredList = if (position == null) {
            _playersFlow.value.playersList
        } else {
            _playersFlow.value.playersList.filter {
                it.positions?.contains(position.name) == true
            }
        }

        _playersFlow.update {
            it.copy(
                visibleList = filteredList,
            )
        }
    }

    override fun updateAllPlayers() {

        viewModelScope.launch {
            for (player in _playersFlow.value.playersList) {
                _playersFlow.update { it.copy(showPageLoader = true) }
                delay(500)
                when (val response = playersUpdate.updatePlayerByTmProfile(player.tmProfile)) {
                    is Result.Failed -> {
                        println("PlayerViewModel - ${player.fullName} failed - ${response.cause}")
                        _playersFlow.update { it.copy(showPageLoader = false) }
                    }

                    is Result.Success -> {
                        val playerToUpdate = player.copy(
                            marketValue = response.data?.marketValue,
                            profileImage = response.data?.profileImage,
                            nationalityFlag = response.data?.nationalityFlag,
                            nationality = response.data?.citizenship,
                            age = response.data?.age,
                            contractExpired = response.data?.contract,
                            positions = response.data?.positions,
                            currentClub = response.data?.currentClub
                        )

                        try {
                            val doc = firebaseHandler.firebaseStore
                                .collection(firebaseHandler.playersTable)
                                .whereEqualTo("tmProfile", player.tmProfile)
                                .get().await().documents.firstOrNull()

                            doc?.reference?.set(playerToUpdate)?.await()
                            _playersFlow.update { it.copy(showPageLoader = false) }
                            println("PlayerViewModel - ${player.fullName} updated")
                        } catch (e: Exception) {
                            _playersFlow.update { it.copy(showPageLoader = false) }
                            println("PlayerViewModel - ${player.fullName} failed - ${e.localizedMessage}")
                        }
                    }
                }
            }

        }
    }


    private fun getAllPlayers() {

        _playersFlow.update { it.copy(showPageLoader = true) }

        firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    _playersFlow.update {
                        it.copy(
                            playersList = emptyList(),
                            visibleList = emptyList(),
                            showPageLoader = false
                        )
                    }
                } else {
                    val playersList = value?.toObjects(Player::class.java) ?: emptyList()
                    _playersFlow.update {
                        it.copy(
                            playersList = playersList.sortedByDescending { it.createdAt },
                            visibleList = playersList.sortedByDescending { it.createdAt },
                            showPageLoader = false
                        )
                    }
                }
            }
    }

    private fun getAllPositions() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get()
            .addOnSuccessListener {
                val positions = it.toObjects(Position::class.java)
                _playersFlow.update {
                    it.copy(positionList = positions.sortedByDescending { it.sort })
                }
            }
    }
}