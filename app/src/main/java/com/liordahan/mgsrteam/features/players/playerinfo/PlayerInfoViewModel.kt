package com.liordahan.mgsrteam.features.players.playerinfo

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FieldValue
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.MarketValueEntry
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.features.players.models.PassportDetails
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentDetectionService
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocumentsRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext


abstract class IPlayerInfoViewModel : ViewModel() {
    abstract val playerInfoFlow: StateFlow<Player?>
    abstract val showButtonProgress: StateFlow<Boolean>
    abstract val updatePlayerFlow: StateFlow<UiResult<String>>
    abstract val showDeletePlayerIconFlow: StateFlow<Boolean>
    abstract val isUploadingDocumentFlow: StateFlow<Boolean>
    abstract val uploadErrorFlow: SharedFlow<String>
    abstract val documentsFlow: Flow<List<PlayerDocument>>
    abstract val similarPlayersFlow: StateFlow<List<AiHelperService.SimilarPlayerSuggestion>>
    abstract val isSimilarPlayersLoading: StateFlow<Boolean>
    abstract val scoutReportFlow: StateFlow<String?>
    abstract val isScoutReportLoading: StateFlow<Boolean>
    abstract fun getPlayerInfo(playerId: String)
    abstract fun deletePlayer(playerTmProfile: String, onDeleteSuccessfully: () -> Unit)
    abstract fun updatePlayerNumber(number: String)
    abstract fun updateAgentNumber(number: String)
    abstract fun updateHaveMandate(hasMandate: Boolean)
    abstract fun updateSalaryRange(salaryRange: String?)
    abstract fun updateTransferFee(transferFee: String?)
    abstract fun updateNotes(notes: NotesModel)
    abstract fun refreshPlayerInfo()
    abstract fun onDeleteNoteClicked(note: NotesModel)
    abstract fun uploadDocument(uri: android.net.Uri?, bytes: ByteArray, name: String, mimeType: String?, expiresAt: Long?)
    abstract fun deleteDocument(documentId: String, isPassport: Boolean = false)
    abstract fun findSimilarPlayers(player: Player, languageCode: String = "en")
    abstract fun generateScoutReport(player: Player, languageCode: String = "en")
    abstract fun consumeUpdateResult()
}


private const val TAG = "PassportUpload"

class PlayerInfoViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val playersUpdate: PlayersUpdate,
    private val documentsRepository: PlayerDocumentsRepository,
    private val documentDetectionService: DocumentDetectionService,
    private val aiHelperService: AiHelperService
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

    private val _isUploadingDocumentFlow = MutableStateFlow(false)
    override val isUploadingDocumentFlow: StateFlow<Boolean> = _isUploadingDocumentFlow

    private val _uploadErrorFlow = MutableSharedFlow<String>()
    override val uploadErrorFlow: SharedFlow<String> = _uploadErrorFlow

    @OptIn(ExperimentalCoroutinesApi::class)
    override val documentsFlow: Flow<List<PlayerDocument>> =
        _playerInfoFlow.flatMapLatest { player ->
            if (player?.tmProfile != null) documentsRepository.getDocumentsFlow(player.tmProfile)
            else flowOf(emptyList())
        }

    private val _similarPlayersFlow = MutableStateFlow<List<AiHelperService.SimilarPlayerSuggestion>>(emptyList())
    override val similarPlayersFlow: StateFlow<List<AiHelperService.SimilarPlayerSuggestion>> = _similarPlayersFlow

    private val _isSimilarPlayersLoading = MutableStateFlow(false)
    override val isSimilarPlayersLoading: StateFlow<Boolean> = _isSimilarPlayersLoading

    private val _scoutReportFlow = MutableStateFlow<String?>(null)
    override val scoutReportFlow: StateFlow<String?> = _scoutReportFlow

    private val _isScoutReportLoading = MutableStateFlow(false)
    override val isScoutReportLoading: StateFlow<Boolean> = _isScoutReportLoading

    private var playerListenerRegistration: ListenerRegistration? = null

    init {
        viewModelScope.launch {
            var prevMandateCount: Int? = null
            documentsFlow.collect { docs ->
                val player = _playerInfoFlow.value ?: return@collect
                val tmProfile = player.tmProfile ?: return@collect
                val mandateDocs = docs.filter { it.documentType == DocumentType.MANDATE }
                val now = System.currentTimeMillis()
                for (mandate in mandateDocs) {
                    val expiresAt = mandate.expiresAt ?: continue
                    if (expiresAt < now) {
                        mandate.id?.let { documentsRepository.deleteDocument(it) }
                    }
                }
                // Auto-sync mandate switch: ON when mandate docs exist, OFF when none. Manual toggle preserved until docs change.
                val count = mandateDocs.size
                if (prevMandateCount == null || count != prevMandateCount) {
                    prevMandateCount = count
                    updateHaveMandate(count > 0)
                }
            }
        }
    }

    init {
        viewModelScope.launch(Dispatchers.IO) {
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

    override fun onCleared() {
        super.onCleared()
        playerListenerRegistration?.remove()
    }

    override fun getPlayerInfo(playerId: String) {
        _scoutReportFlow.update { null }
        playerListenerRegistration?.remove()
        playerListenerRegistration = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .whereEqualTo("tmProfile", playerId).addSnapshotListener { value, error ->
                if (error != null) {
                    //
                } else {
                    val player = value?.documents?.firstOrNull()?.toObject(Player::class.java)
                        ?: return@addSnapshotListener
                    _playerInfoFlow.update { player }
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

    override fun updateHaveMandate(hasMandate: Boolean) {
        _playerInfoFlow.update {
            it?.copy(haveMandate = hasMandate)
        }
        viewModelScope.launch {
            _playerInfoFlow.value?.let { player ->
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", player.tmProfile)
                    .get().await().documents.firstOrNull()
                doc?.reference?.set(player)?.await()
            }
        }
    }

    override fun updateSalaryRange(salaryRange: String?) {
        _playerInfoFlow.update {
            it?.copy(salaryRange = salaryRange)
        }
        viewModelScope.launch {
            _playerInfoFlow.value?.let { player ->
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", player.tmProfile)
                    .get().await().documents.firstOrNull()
                doc?.reference?.set(player)?.await()
            }
        }
    }

    override fun updateTransferFee(transferFee: String?) {
        _playerInfoFlow.update {
            it?.copy(transferFee = transferFee)
        }
        viewModelScope.launch {
            _playerInfoFlow.value?.let { player ->
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
                if (response is TransfermarktResult.Success) {
                    val club = response.data?.currentClub?.let {
                        com.liordahan.mgsrteam.features.players.models.Club(
                            clubName = it.clubName,
                            clubLogo = it.clubLogo,
                            clubTmProfile = it.clubTmProfile,
                            clubCountry = it.clubCountry
                        )
                    }
                    val newValue = response.data?.marketValue
                    val marketValueHistory = if (newValue != null && newValue != player.marketValue) {
                        val entry = MarketValueEntry(value = newValue, date = System.currentTimeMillis())
                        (player.marketValueHistory?.toMutableList() ?: mutableListOf()).apply { add(entry) }.takeLast(24)
                    } else {
                        player.marketValueHistory
                    }
                    val playerToUpdate = player.copy(
                        marketValue = response.data?.marketValue ?: player.marketValue,
                        profileImage = response.data?.profileImage ?: player.profileImage,
                        nationalityFlag = response.data?.nationalityFlag ?: player.nationalityFlag,
                        nationality = response.data?.citizenship ?: player.nationality,
                        age = response.data?.age ?: player.age,
                        contractExpired = response.data?.contract ?: player.contractExpired,
                        positions = response.data?.positions ?: player.positions,
                        currentClub = club ?: player.currentClub,
                        marketValueHistory = marketValueHistory,
                        lastRefreshedAt = System.currentTimeMillis(),
                        isOnLoan = response.data?.isOnLoan ?: player.isOnLoan,
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
                } else if (response is TransfermarktResult.Failed) {
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

    override fun uploadDocument(uri: android.net.Uri?, bytes: ByteArray, name: String, mimeType: String?, expiresAt: Long?) {
        viewModelScope.launch {
            val player = _playerInfoFlow.value ?: return@launch
            val tmProfile = player.tmProfile ?: return@launch
            _isUploadingDocumentFlow.value = true
            try {
                val detection = documentDetectionService.detectDocumentType(
                    uri = uri,
                    bytes = bytes,
                    mimeType = mimeType,
                    originalFileName = name,
                    playerName = player.fullName
                )
                if (detection.documentType == DocumentType.PASSPORT && player.passportDetails != null) {
                    _uploadErrorFlow.emit("passport_already_exists")
                    return@launch
                }
                when {
                    detection.documentType == DocumentType.PASSPORT && detection.passportInfo != null -> {
                        val info = detection.passportInfo
                        Log.i(TAG, "Passport uploaded - First name: ${info.firstName}, Last name: ${info.lastName}, " +
                            "Date of birth: ${info.dateOfBirth ?: "N/A"}, Passport number: ${info.passportNumber ?: "N/A"}")
                        val passportDetails = PassportDetails(
                            firstName = info.firstName.takeIf { it.isNotBlank() },
                            lastName = info.lastName.takeIf { it.isNotBlank() },
                            dateOfBirth = info.dateOfBirth?.takeIf { it.isNotBlank() },
                            passportNumber = info.passportNumber?.takeIf { it.isNotBlank() },
                            nationality = info.nationality?.takeIf { it.isNotBlank() },
                            lastUpdatedAt = System.currentTimeMillis()
                        )
                        savePassportDetailsToPlayer(tmProfile, passportDetails)
                    }
                    detection.documentType == DocumentType.PASSPORT && detection.passportInfo == null -> {
                        Log.w(TAG, "Passport detected but MRZ parsing failed - could not extract name, DOB, or passport number")
                    }
                    detection.documentType != DocumentType.PASSPORT -> {
                        Log.w(TAG, "Document not detected as passport (type: ${detection.documentType})")
                    }
                }
                val docExpiresAt = detection.mandateExpiresAt ?: expiresAt
                documentsRepository.uploadDocument(
                    tmProfile,
                    detection.documentType,
                    detection.suggestedName,
                    bytes,
                    docExpiresAt
                )
            } finally {
                _isUploadingDocumentFlow.value = false
            }
        }
    }

    override fun deleteDocument(documentId: String, isPassport: Boolean) {
        viewModelScope.launch {
            documentsRepository.deleteDocument(documentId)
            if (isPassport) {
                clearPassportDetails()
            }
        }
    }

    /**
     * Resets the update result to UnInitialized after the UI has consumed
     * the Success/Failed state (shown toast). Prevents stale StateFlow
     * replays from re-triggering toasts on recomposition or lifecycle restart.
     */
    override fun consumeUpdateResult() {
        _updatePlayerFlow.update { UiResult.UnInitialized }
    }

    override fun findSimilarPlayers(player: Player, languageCode: String) {
        viewModelScope.launch {
            _isSimilarPlayersLoading.update { true }
            _similarPlayersFlow.update { emptyList() }
            aiHelperService.findSimilarPlayers(player, languageCode)
                .onSuccess { suggestions ->
                    _similarPlayersFlow.update { suggestions }
                    Log.d(TAG, "findSimilarPlayers: found ${suggestions.size} similar players for ${player.fullName}")
                }
                .onFailure { e ->
                    Log.e(TAG, "findSimilarPlayers failed for ${player.fullName}", e)
                    _similarPlayersFlow.update { emptyList() }
                }
            _isSimilarPlayersLoading.update { false }
        }
    }

    override fun generateScoutReport(player: Player, languageCode: String) {
        viewModelScope.launch {
            _isScoutReportLoading.update { true }
            _scoutReportFlow.update { null }
            aiHelperService.generateScoutReport(player, languageCode)
                .onSuccess { report ->
                    _scoutReportFlow.update { report }
                    Log.d(TAG, "generateScoutReport: success for ${player.fullName}")
                }
                .onFailure { e ->
                    Log.e(TAG, "generateScoutReport failed for ${player.fullName}", e)
                    _scoutReportFlow.update { null }
                }
            _isScoutReportLoading.update { false }
        }
    }

    private suspend fun clearPassportDetails() {
        val tmProfile = _playerInfoFlow.value?.tmProfile ?: return
        withContext(Dispatchers.IO) {
            try {
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", tmProfile)
                    .get().await().documents.firstOrNull()
                doc?.reference?.update("passportDetails", FieldValue.delete())?.await()
                _playerInfoFlow.update { it?.copy(passportDetails = null) }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear passport details", e)
            }
        }
    }

    private suspend fun savePassportDetailsToPlayer(tmProfile: String, passportDetails: PassportDetails) {
        withContext(Dispatchers.IO) {
            try {
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", tmProfile)
                    .get().await().documents.firstOrNull()
                doc?.reference?.update("passportDetails", passportDetails)?.await()
                _playerInfoFlow.update { it?.copy(passportDetails = passportDetails) }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save passport details", e)
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
