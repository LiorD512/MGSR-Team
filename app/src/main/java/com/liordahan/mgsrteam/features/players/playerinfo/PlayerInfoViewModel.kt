package com.liordahan.mgsrteam.features.players.playerinfo

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.Result
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext


abstract class IPlayerInfoViewModel : ViewModel() {
    abstract val playerInfoFlow: StateFlow<Player?>
    abstract val showButtonProgress: StateFlow<Boolean>
    abstract val updatePlayerFlow: StateFlow<UiResult<String>>
    abstract val showDeletePlayerIconFlow: StateFlow<Boolean>
    abstract fun getPlayerInfo(playerId: String)
    abstract fun deletePlayer(playerTmProfile: String, onDeleteSuccessfully: () -> Unit)
    abstract fun updatePlayerNumber(number: String)
    abstract fun updateAgentNumber(number: String)
    abstract fun updateNotes(notes: NotesModel)
    abstract fun refreshPlayerInfo()
    abstract fun onDeleteNoteClicked(note: NotesModel)
}


class PlayerInfoViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val playersUpdate: PlayersUpdate
) : IPlayerInfoViewModel() {

    private val _playerInfoFlow = MutableStateFlow<Player?>(null)
    override val playerInfoFlow: StateFlow<Player?> = _playerInfoFlow

    private val _showButtonProgress = MutableStateFlow(false)
    override val showButtonProgress: StateFlow<Boolean> = _showButtonProgress

    private val _updatePlayerFlow = MutableStateFlow<UiResult<String>>(UiResult.UnInitialized)
    override val updatePlayerFlow: StateFlow<UiResult<String>>
        get() = _updatePlayerFlow

    private val _showDeletePlayerIconFlow = MutableStateFlow(false)
    override val showDeletePlayerIconFlow: StateFlow<Boolean>
        get() = _showDeletePlayerIconFlow

    init {
        viewModelScope.launch {
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
                _showDeletePlayerIconFlow.update { true }
            }
        }
    }

    override fun getPlayerInfo(playerId: String) {
        firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .whereEqualTo("tmProfile", playerId).addSnapshotListener { value, error ->
                if (error != null) {
                    //
                } else {
                    val player = value?.documents?.firstOrNull()?.toObject(Player::class.java)
                        ?: return@addSnapshotListener
                    _playerInfoFlow.update { player }
                    refreshPlayerInfo()
                }
            }
    }

    override fun deletePlayer(playerTmProfile: String, onDeleteSuccessfully: () -> Unit) {
        _showButtonProgress.update { true }
        firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .whereEqualTo("tmProfile", playerTmProfile).get().addOnSuccessListener {
                it.documents[0].reference.delete().addOnSuccessListener {
                    _showButtonProgress.update { false }
                    onDeleteSuccessfully()
                }.addOnFailureListener {
                    _showButtonProgress.update { false }
                }
            }.addOnFailureListener {
                _showButtonProgress.update { false }
            }
    }

    override fun updatePlayerNumber(number: String) {
        _playerInfoFlow.update {
            it?.copy(playerPhoneNumber = number, playerAdditionalInfoModel = null)
        }


        _playerInfoFlow.value?.let { player ->
            viewModelScope.launch {
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", player.tmProfile)
                    .get().await().documents.firstOrNull()

                doc?.reference?.set(player)?.await()
            }
        }
    }

    override fun updateAgentNumber(number: String) {
        _playerInfoFlow.update {
            it?.copy(agentPhoneNumber = number, playerAdditionalInfoModel = null)
        }

        _playerInfoFlow.value?.let { player ->
            viewModelScope.launch {
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", player.tmProfile)
                    .get().await().documents.firstOrNull()

                doc?.reference?.set(player)?.await()
            }
        }
    }

    override fun updateNotes(notes: NotesModel) {
        viewModelScope.launch {
            _playerInfoFlow.update { player ->
                val currentNotes = player?.noteList?.toMutableList() ?: mutableListOf()
                val createdBy = getCurrentUserName()
                val note = notes.copy(createBy = createdBy)
                currentNotes.add(note)
                player?.copy(noteList = currentNotes)
            }

            _playerInfoFlow.value?.let { player ->
                viewModelScope.launch {
                    val doc = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("tmProfile", player.tmProfile)
                        .get().await().documents.firstOrNull()

                    doc?.reference?.set(player)?.await()
                }
            }
        }
    }

    override fun refreshPlayerInfo() {
        viewModelScope.launch {
            _updatePlayerFlow.update { UiResult.Loading }

            val player = _playerInfoFlow.value ?: return@launch

            try {
                val response = playersUpdate.updatePlayerByTmProfile(player.tmProfile)
                if (response is Result.Success) {
                    val playerToUpdate = player.copy(
                        marketValue = response.data?.marketValue,
                        profileImage = response.data?.profileImage,
                        nationalityFlag = response.data?.nationalityFlag,
                        nationality = response.data?.citizenship,
                        age = response.data?.age,
                        contractExpired = response.data?.contract,
                        positions = response.data?.positions,
                        currentClub = response.data?.currentClub,
                        noteList = if (player.notes?.isNotEmpty() == true) {
                            val currentNotes = player.noteList?.toMutableList() ?: mutableListOf()
                            currentNotes.add(
                                NotesModel(
                                    notes = player.notes,
                                    createBy = player.agentInChargeName,
                                    createdAt = System.currentTimeMillis()
                                )
                            )
                            currentNotes
                        } else {
                            player.noteList
                        },
                        notes = ""
                    )

                    val doc = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("tmProfile", player.tmProfile)
                        .get().await().documents.firstOrNull()

                    doc?.reference?.set(playerToUpdate)?.await()
                    _updatePlayerFlow.update { UiResult.Success("Update succeed") }
                } else if (response is Result.Failed) {
                    _updatePlayerFlow.update { UiResult.Failed(cause = "Update failed\nTry again later") }
                }
            } catch (e: Exception) {
                _updatePlayerFlow.update { UiResult.Failed(cause = "Update failed\nTry again later") }
            }
        }
    }

    override fun onDeleteNoteClicked(note: NotesModel) {
        viewModelScope.launch {
            _playerInfoFlow.update { player ->
                val currentNotes = player?.noteList?.toMutableList() ?: mutableListOf()
                currentNotes.remove(note)
                player?.copy(noteList = currentNotes)
            }

            _playerInfoFlow.value?.let { player ->
                viewModelScope.launch {
                    val doc = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("tmProfile", player.tmProfile)
                        .get().await().documents.firstOrNull()

                    doc?.reference?.set(player)?.await()
                }
            }
        }
    }

    private suspend fun getCurrentUserName(): String? = withContext(Dispatchers.IO) {
        try {
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
            account?.name
        } catch (e: Exception) {
            null
        }
    }
}
