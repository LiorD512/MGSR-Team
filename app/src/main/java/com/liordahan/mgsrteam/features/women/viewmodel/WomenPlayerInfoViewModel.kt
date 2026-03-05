package com.liordahan.mgsrteam.features.women.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenFeedEvent
import com.liordahan.mgsrteam.features.women.models.WomenMarketValueEntry
import com.liordahan.mgsrteam.features.women.models.WomenNote
import com.liordahan.mgsrteam.features.women.models.WomenPassportDetails
import com.liordahan.mgsrteam.features.women.models.WomenPlayer
import com.liordahan.mgsrteam.features.women.models.WomenAgentTask
import com.liordahan.mgsrteam.features.women.models.toSharedPlayer
import com.liordahan.mgsrteam.features.women.models.toSharedRequest
import com.liordahan.mgsrteam.features.women.repository.WomenRequestsRepository
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import com.liordahan.mgsrteam.features.players.playerinfo.ai.ScoutReportOptions
import com.liordahan.mgsrteam.features.players.playerinfo.ai.SimilarPlayersOptions
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentDetectionService
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PdfFlattener
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocumentsRepository
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.IPlayerOffersRepository
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.MatchingRequestUiState
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.PlayerOffer
import com.liordahan.mgsrteam.features.players.playerinfo.notes.NoteParser
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.features.requests.RequestMatcher
import com.liordahan.mgsrteam.features.women.models.WomenRequest
import com.liordahan.mgsrteam.helpers.UiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Women-dedicated PlayerInfo abstract ViewModel.
 * Uses [WomenPlayer] types throughout — fully isolated from men/youth.
 */
abstract class IWomenPlayerInfoViewModel : ViewModel() {
    abstract val playerInfoFlow: StateFlow<WomenPlayer?>
    abstract val showButtonProgress: StateFlow<Boolean>
    abstract val updatePlayerFlow: StateFlow<UiResult<String>>
    abstract val showDeletePlayerIconFlow: StateFlow<Boolean>
    abstract val isUploadingDocumentFlow: StateFlow<Boolean>
    abstract val uploadErrorFlow: SharedFlow<String>
    abstract val documentsFlow: Flow<List<PlayerDocument>>
    abstract val similarPlayersFlow: StateFlow<List<AiHelperService.SimilarPlayerSuggestion>>
    abstract val isSimilarPlayersLoading: StateFlow<Boolean>
    abstract val hiddenGemFlow: StateFlow<AiHelperService.HiddenGemResult?>
    abstract val isHiddenGemLoading: StateFlow<Boolean>
    abstract val scoutReportFlow: StateFlow<String?>
    abstract val isScoutReportLoading: StateFlow<Boolean>
    abstract fun getPlayerInfo(playerId: String)
    abstract fun deletePlayer(playerDocId: String, onDeleteSuccessfully: () -> Unit)
    abstract fun updatePlayerNumber(number: String)
    abstract fun updateAgentNumber(number: String)
    abstract fun clearAgency()
    abstract fun updateHaveMandate(hasMandate: Boolean, isManual: Boolean = true)
    abstract fun updateSalaryRange(salaryRange: String?)
    abstract fun updateTransferFee(transferFee: String?)
    abstract fun updateNotes(notes: WomenNote)
    abstract fun refreshPlayerInfo()
    abstract fun onDeleteNoteClicked(note: WomenNote)
    abstract fun uploadDocument(uri: android.net.Uri?, bytes: ByteArray, name: String, mimeType: String?, expiresAt: Long?)
    abstract fun deleteDocument(documentId: String, isPassport: Boolean = false)
    abstract fun findSimilarPlayers(player: WomenPlayer, languageCode: String = "en", options: SimilarPlayersOptions = SimilarPlayersOptions(), excludeNames: List<String> = emptyList())
    abstract fun computeHiddenGemScore(player: WomenPlayer, languageCode: String = "en")
    abstract fun generateScoutReport(player: WomenPlayer, languageCode: String = "en", options: ScoutReportOptions = ScoutReportOptions())
    abstract fun consumeUpdateResult()
    abstract val matchingRequestsFlow: StateFlow<List<MatchingRequestUiState>>
    abstract val allAccountsFlow: StateFlow<List<Account>>
    abstract val playerDocumentIdFlow: StateFlow<String?>
    abstract val playerTasksFlow: Flow<List<WomenAgentTask>>
    abstract fun markPlayerAsOffered(player: WomenPlayer, request: WomenRequest, clubFeedback: String?)
    abstract fun addPlayerTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String, playerId: String, playerName: String, playerTmProfile: String, templateId: String)
    abstract fun togglePlayerTaskCompleted(task: WomenAgentTask)
    abstract fun updateClubFeedback(offerId: String, clubFeedback: String?)
    abstract suspend fun createShareUrl(player: WomenPlayer, playerDocId: String, documents: List<PlayerDocument>, scoutReport: String?, lang: String): Result<String>
}

private const val TAG = "WomenPlayerInfo"

/**
 * Women-dedicated PlayerInfo ViewModel implementation.
 * Uses [WomenFirebaseHandler] (hardcoded to women collections) — no PlatformManager.
 * For women, playerId is always the Firestore document ID (no tmProfile-based lookup).
 */
class WomenPlayerInfoViewModel(
    private val appContext: android.content.Context,
    private val firebaseHandler: WomenFirebaseHandler,
    private val documentsRepository: PlayerDocumentsRepository,
    private val documentDetectionService: DocumentDetectionService,
    private val aiHelperService: AiHelperService,
    private val requestsRepository: WomenRequestsRepository,
    private val offersRepository: IPlayerOffersRepository
) : IWomenPlayerInfoViewModel() {

    private val _playerInfoFlow = MutableStateFlow<WomenPlayer?>(null)
    override val playerInfoFlow: StateFlow<WomenPlayer?> = _playerInfoFlow

    private val _showButtonProgress = MutableStateFlow(false)
    override val showButtonProgress: StateFlow<Boolean> = _showButtonProgress

    private val _updatePlayerFlow = MutableStateFlow<UiResult<String>>(UiResult.UnInitialized)
    override val updatePlayerFlow: StateFlow<UiResult<String>> = _updatePlayerFlow

    private val _showDeletePlayerIconFlow = MutableStateFlow(false)
    override val showDeletePlayerIconFlow: StateFlow<Boolean> = _showDeletePlayerIconFlow

    private val _isUploadingDocumentFlow = MutableStateFlow(false)
    override val isUploadingDocumentFlow: StateFlow<Boolean> = _isUploadingDocumentFlow

    private val _uploadErrorFlow = MutableSharedFlow<String>()
    override val uploadErrorFlow: SharedFlow<String> = _uploadErrorFlow

    private val _playerDocumentIdFlow = MutableStateFlow<String?>(null)
    override val playerDocumentIdFlow: StateFlow<String?> = _playerDocumentIdFlow

    private fun getPlayerDocRef() = _playerDocumentIdFlow.value?.let { docId ->
        firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable).document(docId)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    override val documentsFlow: Flow<List<PlayerDocument>> =
        _playerDocumentIdFlow.flatMapLatest { docId ->
            if (docId != null) documentsRepository.getDocumentsFlow(docId)
            else flowOf(emptyList())
        }

    private val _similarPlayersFlow = MutableStateFlow<List<AiHelperService.SimilarPlayerSuggestion>>(emptyList())
    override val similarPlayersFlow: StateFlow<List<AiHelperService.SimilarPlayerSuggestion>> = _similarPlayersFlow

    private val _isSimilarPlayersLoading = MutableStateFlow(false)
    override val isSimilarPlayersLoading: StateFlow<Boolean> = _isSimilarPlayersLoading

    private val _hiddenGemFlow = MutableStateFlow<AiHelperService.HiddenGemResult?>(null)
    override val hiddenGemFlow: StateFlow<AiHelperService.HiddenGemResult?> = _hiddenGemFlow

    private val _isHiddenGemLoading = MutableStateFlow(false)
    override val isHiddenGemLoading: StateFlow<Boolean> = _isHiddenGemLoading

    private val _scoutReportFlow = MutableStateFlow<String?>(null)
    override val scoutReportFlow: StateFlow<String?> = _scoutReportFlow

    private val _isScoutReportLoading = MutableStateFlow(false)
    override val isScoutReportLoading: StateFlow<Boolean> = _isScoutReportLoading

    @OptIn(ExperimentalCoroutinesApi::class)
    override val matchingRequestsFlow: StateFlow<List<MatchingRequestUiState>> = combine(
        requestsRepository.requestsFlow(),
        _playerDocumentIdFlow.flatMapLatest { key ->
            key?.let { offersRepository.offersForPlayerFlow(it) } ?: flowOf(emptyList())
        },
        _playerInfoFlow
    ) { requests, offers, player ->
        if (player == null) emptyList()
        else {
            val sharedPlayer = player.toSharedPlayer()
            val pendingRequests = requests.filter { (it.status ?: "pending") == "pending" }
            // Convert WomenRequest to shared Request for RequestMatcher
            val sharedRequests = pendingRequests.map { it.toSharedRequest() }
            val matching = RequestMatcher.matchingRequestsForPlayer(sharedPlayer, sharedRequests)
            val offerByRequestId = offers.associateBy { it.requestId }
            matching.map { req -> MatchingRequestUiState(request = req, offer = offerByRequestId[req.id]) }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    override val allAccountsFlow: StateFlow<List<Account>> = callbackFlow {
        val listener = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot != null) trySend(snapshot.toObjects(Account::class.java))
            }
        awaitClose { listener.remove() }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private var playerListenerRegistration: ListenerRegistration? = null

    init {
        viewModelScope.launch {
            var prevMandateCount: Int? = null
            documentsFlow.collect { docs ->
                val player = _playerInfoFlow.value ?: return@collect
                val mandateDocs = docs.filter { it.documentType == DocumentType.MANDATE }
                val now = System.currentTimeMillis()
                for (mandate in mandateDocs) {
                    val expiresAt = mandate.expiresAt ?: continue
                    if (expiresAt < now && !mandate.expired) {
                        mandate.id?.let { documentsRepository.markDocumentExpired(it) }
                    }
                }
                val validMandateCount = mandateDocs.count { !it.expired && (it.expiresAt == null || it.expiresAt >= now) }
                if (prevMandateCount != null && validMandateCount != prevMandateCount) {
                    updateHaveMandate(validMandateCount > 0, isManual = false)
                }
                prevMandateCount = validMandateCount
            }
        }
    }

    init {
        viewModelScope.launch(Dispatchers.IO) {
            val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
            val accounts = snapshot.toObjects(Account::class.java)
            val account = accounts.firstOrNull {
                it.email?.equals(firebaseHandler.firebaseAuth.currentUser?.email, ignoreCase = true) == true
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

    @OptIn(ExperimentalCoroutinesApi::class)
    override val playerTasksFlow: Flow<List<WomenAgentTask>> = _playerDocumentIdFlow.flatMapLatest { docId ->
        if (docId.isNullOrBlank()) flowOf(emptyList())
        else callbackFlow {
            val listener = firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
                .whereEqualTo("playerId", docId)
                .addSnapshotListener { snapshot, _ ->
                    if (snapshot != null) {
                        val tasks = snapshot.documents.mapNotNull { doc ->
                            doc.toObject(WomenAgentTask::class.java)?.copy(id = doc.id)
                        }.sortedBy { it.dueDate }
                        trySend(tasks)
                    }
                }
            awaitClose { listener.remove() }
        }
    }

    override fun addPlayerTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String, playerId: String, playerName: String, playerTmProfile: String, templateId: String) {
        viewModelScope.launch {
            val currentAccount = allAccountsFlow.value.firstOrNull {
                it.email.equals(firebaseHandler.firebaseAuth.currentUser?.email, true)
            }
            val newTask = WomenAgentTask(
                agentId = agentId, agentName = agentName, title = title,
                isCompleted = false, dueDate = dueDate, createdAt = System.currentTimeMillis(),
                priority = priority, notes = notes,
                createdByAgentId = currentAccount?.id ?: "",
                createdByAgentName = currentAccount?.getDisplayName(appContext) ?: "",
                playerId = playerId, playerName = playerName, playerTmProfile = playerTmProfile,
                templateId = templateId
            )
            firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable).add(newTask).await()
        }
    }

    override fun togglePlayerTaskCompleted(task: WomenAgentTask) {
        if (task.id.isBlank()) return
        viewModelScope.launch {
            val nowCompleted = !task.isCompleted
            firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
                .document(task.id)
                .update(mapOf("isCompleted" to nowCompleted, "completedAt" to if (nowCompleted) System.currentTimeMillis() else 0L))
                .await()
        }
    }

    // ── Women-specific: playerId IS the Firestore document ID ────────

    override fun getPlayerInfo(playerId: String) {
        _scoutReportFlow.update { null }
        _hiddenGemFlow.update { null }
        _playerDocumentIdFlow.update { null }
        playerListenerRegistration?.remove()

        playerListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.playersTable)
            .document(playerId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener
                val player = snapshot?.toObject(WomenPlayer::class.java) ?: return@addSnapshotListener
                _playerInfoFlow.update { player }
                _playerDocumentIdFlow.update { snapshot.id }
            }
    }

    override fun deletePlayer(playerDocId: String, onDeleteSuccessfully: () -> Unit) {
        viewModelScope.launch {
            _showButtonProgress.update { true }
            try {
                val player = _playerInfoFlow.value
                getPlayerDocRef()?.delete()?.await()
                val deletedBy = getCurrentUserName()
                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    WomenFeedEvent(
                        type = WomenFeedEvent.TYPE_PLAYER_DELETED,
                        playerName = player?.fullName,
                        playerImage = player?.profileImage,
                        playerTmProfile = playerDocId,
                        agentName = deletedBy,
                        timestamp = System.currentTimeMillis()
                    )
                ).await()
                onDeleteSuccessfully()
            } finally {
                _showButtonProgress.update { false }
            }
        }
    }

    override fun updatePlayerNumber(number: String) {
        _playerInfoFlow.update { it?.copy(playerPhoneNumber = number, playerAdditionalInfoModel = null) }
        _playerInfoFlow.value?.let { player ->
            viewModelScope.launch { getPlayerDocRef()?.set(player)?.await() }
        }
    }

    override fun updateAgentNumber(number: String) {
        _playerInfoFlow.update { it?.copy(agentPhoneNumber = number, playerAdditionalInfoModel = null) }
        _playerInfoFlow.value?.let { player ->
            viewModelScope.launch { getPlayerDocRef()?.set(player)?.await() }
        }
    }

    override fun clearAgency() {
        _playerInfoFlow.update { it?.copy(agency = null, agencyUrl = null) }
        _playerInfoFlow.value?.let { player ->
            viewModelScope.launch { getPlayerDocRef()?.set(player)?.await() }
        }
    }

    override fun updateHaveMandate(hasMandate: Boolean, isManual: Boolean) {
        _playerInfoFlow.update { it?.copy(haveMandate = hasMandate) }
        viewModelScope.launch {
            val player = _playerInfoFlow.value ?: return@launch
            getPlayerDocRef()?.set(player.copy(haveMandate = hasMandate))?.await()

            if (isManual) {
                val createdBy = getCurrentUserName()
                val feedProfileId = _playerDocumentIdFlow.value
                val mandateExpiryAt = if (hasMandate && feedProfileId != null) {
                    documentsRepository.getDocuments(feedProfileId)
                        .filter { it.documentType == DocumentType.MANDATE && !it.expired }
                        .maxOfOrNull { it.expiresAt ?: 0L }?.takeIf { it > 0 }
                } else null
                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    WomenFeedEvent(
                        type = if (hasMandate) WomenFeedEvent.TYPE_MANDATE_SWITCHED_ON else WomenFeedEvent.TYPE_MANDATE_SWITCHED_OFF,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        playerTmProfile = feedProfileId,
                        agentName = createdBy,
                        mandateExpiryAt = mandateExpiryAt,
                        timestamp = System.currentTimeMillis()
                    )
                ).await()
            }
        }
    }

    override fun updateSalaryRange(salaryRange: String?) {
        _playerInfoFlow.update { it?.copy(salaryRange = salaryRange) }
        viewModelScope.launch { _playerInfoFlow.value?.let { getPlayerDocRef()?.set(it)?.await() } }
    }

    override fun updateTransferFee(transferFee: String?) {
        _playerInfoFlow.update { it?.copy(transferFee = transferFee) }
        viewModelScope.launch { _playerInfoFlow.value?.let { getPlayerDocRef()?.set(it)?.await() } }
    }

    override fun updateNotes(notes: WomenNote) {
        viewModelScope.launch {
            var updatedPlayer: WomenPlayer? = null
            var createdBy: String? = null
            _playerInfoFlow.update { player ->
                val currentNotes = player?.noteList?.toMutableList() ?: mutableListOf()
                createdBy = getCurrentUserName()
                val note = notes.copy(createBy = createdBy)
                currentNotes.add(note)
                // Extract salary hints using NoteParser (shared utility)
                val sharedNotes = currentNotes.map { NotesModel(notes = it.notes, createBy = it.createBy, createdAt = it.createdAt) }
                val salaryRange = NoteParser.extractSalaryRange(sharedNotes)
                val isFree = NoteParser.extractFreeTransfer(sharedNotes)
                updatedPlayer = player?.copy(
                    noteList = currentNotes,
                    salaryRange = salaryRange ?: player.salaryRange,
                    transferFee = if (isFree) "Free/Free loan" else player.transferFee
                )
                updatedPlayer
            }
            updatedPlayer?.let { player ->
                getPlayerDocRef()?.set(player)?.await()
                val notePreview = notes.notes?.take(120)?.let { if (it.length == 120) "$it…" else it }
                val feedProfileId = _playerDocumentIdFlow.value
                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    WomenFeedEvent(
                        type = WomenFeedEvent.TYPE_NOTE_ADDED,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        playerTmProfile = feedProfileId,
                        agentName = createdBy,
                        extraInfo = notePreview,
                        timestamp = System.currentTimeMillis()
                    )
                ).await()
            }
        }
    }

    override fun onDeleteNoteClicked(note: WomenNote) {
        viewModelScope.launch {
            var updatedPlayer: WomenPlayer? = null
            _playerInfoFlow.update { player ->
                val currentNotes = player?.noteList?.toMutableList() ?: mutableListOf()
                currentNotes.remove(note)
                val sharedNotes = currentNotes.map { NotesModel(notes = it.notes, createBy = it.createBy, createdAt = it.createdAt) }
                val salaryRange = NoteParser.extractSalaryRange(sharedNotes)
                val isFree = NoteParser.extractFreeTransfer(sharedNotes)
                updatedPlayer = player?.copy(
                    noteList = currentNotes,
                    salaryRange = salaryRange ?: player.salaryRange,
                    transferFee = if (isFree) "Free/Free loan" else player.transferFee
                )
                updatedPlayer
            }
            updatedPlayer?.let { player ->
                getPlayerDocRef()?.set(player)?.await()
                val deletedBy = getCurrentUserName()
                val notePreview = note.notes?.take(120)?.let { if (it.length == 120) "$it…" else it }
                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    WomenFeedEvent(
                        type = WomenFeedEvent.TYPE_NOTE_DELETED,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        playerTmProfile = _playerDocumentIdFlow.value,
                        agentName = deletedBy,
                        extraInfo = notePreview,
                        timestamp = System.currentTimeMillis()
                    )
                ).await()
            }
        }
    }

    override fun refreshPlayerInfo() {
        viewModelScope.launch {
            // Women players have no Transfermarkt profile — nothing to refresh from external sources
            _updatePlayerFlow.update { UiResult.Success("Player data is up to date") }
        }
    }

    override fun uploadDocument(uri: android.net.Uri?, bytes: ByteArray, name: String, mimeType: String?, expiresAt: Long?) {
        viewModelScope.launch {
            val player = _playerInfoFlow.value ?: return@launch
            val storageKey = _playerDocumentIdFlow.value ?: return@launch
            _isUploadingDocumentFlow.value = true
            try {
                val detection = documentDetectionService.detectDocumentType(
                    uri = uri, bytes = bytes, mimeType = mimeType,
                    originalFileName = name, playerName = player.fullName
                )
                if (detection.documentType == DocumentType.PASSPORT && player.passportDetails != null) {
                    _uploadErrorFlow.emit("passport_already_exists")
                    return@launch
                }
                when {
                    detection.documentType == DocumentType.PASSPORT && detection.passportInfo != null -> {
                        val info = detection.passportInfo
                        Log.i(TAG, "Passport uploaded - ${info.firstName} ${info.lastName}")
                        val passportDetails = WomenPassportDetails(
                            firstName = info.firstName.takeIf { it.isNotBlank() },
                            lastName = info.lastName.takeIf { it.isNotBlank() },
                            dateOfBirth = info.dateOfBirth?.takeIf { it.isNotBlank() },
                            passportNumber = info.passportNumber?.takeIf { it.isNotBlank() },
                            nationality = info.nationality?.takeIf { it.isNotBlank() },
                            lastUpdatedAt = System.currentTimeMillis()
                        )
                        savePassportDetailsToPlayer(storageKey, passportDetails)
                    }
                    detection.documentType == DocumentType.PASSPORT && detection.passportInfo == null -> {
                        Log.w(TAG, "Passport detected but MRZ parsing failed")
                    }
                }
                val docExpiresAt = detection.mandateExpiresAt ?: expiresAt
                val createdBy = getCurrentUserName()
                val uploadedBy = if (detection.documentType == DocumentType.MANDATE) createdBy else null
                val isPdf = mimeType?.lowercase() == "application/pdf" || name.lowercase().endsWith(".pdf")
                val bytesToUpload = if (isPdf) withContext(Dispatchers.IO) { PdfFlattener.flatten(bytes) } else bytes
                val result = documentsRepository.uploadDocument(
                    storageKey, detection.documentType, detection.suggestedName,
                    bytesToUpload, docExpiresAt, uploadedBy = uploadedBy
                )
                if (result.isSuccess && detection.documentType == DocumentType.MANDATE) {
                    firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                        WomenFeedEvent(
                            type = WomenFeedEvent.TYPE_MANDATE_UPLOADED,
                            playerName = player.fullName,
                            playerImage = player.profileImage,
                            playerTmProfile = storageKey,
                            agentName = createdBy,
                            mandateExpiryAt = docExpiresAt,
                            timestamp = System.currentTimeMillis()
                        )
                    ).await()
                }
            } finally {
                _isUploadingDocumentFlow.value = false
            }
        }
    }

    override fun deleteDocument(documentId: String, isPassport: Boolean) {
        viewModelScope.launch {
            documentsRepository.deleteDocument(documentId)
            if (isPassport) clearPassportDetails()
        }
    }

    override fun consumeUpdateResult() {
        _updatePlayerFlow.update { UiResult.UnInitialized }
    }

    override fun markPlayerAsOffered(player: WomenPlayer, request: WomenRequest, clubFeedback: String?) {
        viewModelScope.launch {
            val offer = PlayerOffer(
                playerTmProfile = player.tmProfile,
                playerName = player.fullName,
                playerImage = player.profileImage,
                requestId = request.id,
                clubTmProfile = request.clubTmProfile,
                clubName = request.clubName,
                clubLogo = request.clubLogo,
                position = request.position,
                offeredAt = System.currentTimeMillis(),
                clubFeedback = clubFeedback?.takeIf { it.isNotBlank() }
            )
            offersRepository.addOffer(offer)
        }
    }

    override fun updateClubFeedback(offerId: String, clubFeedback: String?) {
        viewModelScope.launch { offersRepository.updateClubFeedback(offerId, clubFeedback) }
    }

    // AI helpers — convert WomenPlayer to shared Player for AI service compatibility
    override fun findSimilarPlayers(player: WomenPlayer, languageCode: String, options: SimilarPlayersOptions, excludeNames: List<String>) {
        viewModelScope.launch {
            _isSimilarPlayersLoading.update { true }
            aiHelperService.findSimilarPlayers(player.toSharedPlayer(), languageCode, options, excludeNames = excludeNames)
                .onSuccess { _similarPlayersFlow.update { it } }
                .onFailure { Log.e(TAG, "findSimilarPlayers failed", it) }
            _isSimilarPlayersLoading.update { false }
        }
    }

    override fun computeHiddenGemScore(player: WomenPlayer, languageCode: String) {
        viewModelScope.launch {
            _isHiddenGemLoading.update { true }
            _hiddenGemFlow.update { null }
            aiHelperService.computeHiddenGemScore(player.toSharedPlayer(), languageCode)
                .onSuccess { _hiddenGemFlow.update { it } }
                .onFailure { Log.e(TAG, "computeHiddenGemScore failed", it) }
            _isHiddenGemLoading.update { false }
        }
    }

    override fun generateScoutReport(player: WomenPlayer, languageCode: String, options: ScoutReportOptions) {
        viewModelScope.launch(Dispatchers.IO) {
            _isScoutReportLoading.update { true }
            _scoutReportFlow.update { null }
            aiHelperService.generateScoutReport(player.toSharedPlayer(), languageCode, options)
                .onSuccess { _scoutReportFlow.update { it } }
                .onFailure { Log.e(TAG, "generateScoutReport failed", it) }
            _isScoutReportLoading.update { false }
        }
    }

    override suspend fun createShareUrl(
        player: WomenPlayer, playerDocId: String, documents: List<PlayerDocument>,
        scoutReport: String?, lang: String
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val mandateDoc = documents
                .filter { it.documentType == DocumentType.MANDATE && !it.expired }
                .maxByOrNull { it.expiresAt ?: 0L }
            val mandateExpiry = mandateDoc?.expiresAt?.takeIf { it >= System.currentTimeMillis() }
            val hasValidMandate = documents.any {
                it.documentType == DocumentType.MANDATE && !it.expired &&
                    (it.expiresAt == null || it.expiresAt >= System.currentTimeMillis())
            }

            val currentAccount = getCurrentUserAccount()
            val sharerPhone = currentAccount?.phone?.takeIf { it.isNotBlank() } ?: player.agentPhoneNumber
            val sharerName = currentAccount?.getDisplayName(appContext)?.takeIf { it.isNotBlank() }

            val shareData = hashMapOf<String, Any?>(
                "playerId" to playerDocId,
                "player" to hashMapOf(
                    "fullName" to player.fullName,
                    "fullNameHe" to player.fullNameHe,
                    "profileImage" to player.profileImage,
                    "positions" to player.positions,
                    "marketValue" to player.marketValue,
                    "currentClub" to player.currentClub?.let { c ->
                        hashMapOf("clubName" to c.clubName, "clubLogo" to c.clubLogo, "clubCountry" to c.clubCountry)
                    },
                    "age" to player.age,
                    "height" to player.height,
                    "nationality" to player.nationality,
                    "contractExpired" to player.contractExpired,
                    "tmProfile" to player.tmProfile
                ),
                "mandateInfo" to hashMapOf("hasMandate" to hasValidMandate, "expiresAt" to mandateExpiry),
                "scoutReport" to (scoutReport?.takeIf { it.isNotBlank() } ?: buildScoutSummary(player)),
                "createdAt" to System.currentTimeMillis(),
                "lang" to (lang.takeIf { it in listOf("he", "en") } ?: "en"),
                "sharerPhone" to sharerPhone,
                "sharerName" to sharerName,
                "highlights" to player.pinnedHighlights?.takeIf { it.isNotEmpty() }?.map { h ->
                    hashMapOf(
                        "id" to h.id, "source" to h.source, "title" to h.title,
                        "thumbnailUrl" to h.thumbnailUrl, "embedUrl" to h.embedUrl,
                        "channelName" to h.channelName?.takeIf { it.isNotBlank() },
                        "viewCount" to h.viewCount
                    )
                }
            )
            val ref = firebaseHandler.firebaseStore.collection(firebaseHandler.sharedPlayersTable)
                .add(shareData).await()
            val baseUrl = com.liordahan.mgsrteam.BuildConfig.MGSR_WEB_URL.trimEnd('/')
            Result.success("$baseUrl/p/${ref.id}")
        } catch (e: Exception) {
            Log.e(TAG, "createShareUrl failed", e)
            Result.failure(e)
        }
    }

    private fun buildScoutSummary(player: WomenPlayer): String {
        val parts = mutableListOf<String>()
        if (player.age != null) parts.add("${player.age}yo")
        player.positions?.firstOrNull()?.let { parts.add(it ?: "") }
        player.marketValue?.let { parts.add(it) }
        player.currentClub?.clubName?.let { parts.add(it) }
        player.nationality?.let { parts.add(it) }
        return parts.filter { it.isNotBlank() }.joinToString(" • ")
    }

    private suspend fun clearPassportDetails() {
        withContext(Dispatchers.IO) {
            try {
                getPlayerDocRef()?.update("passportDetails", FieldValue.delete())?.await()
                _playerInfoFlow.update { it?.copy(passportDetails = null) }
            } catch (e: Exception) { Log.e(TAG, "Failed to clear passport details", e) }
        }
    }

    private suspend fun savePassportDetailsToPlayer(docId: String, passportDetails: WomenPassportDetails) {
        withContext(Dispatchers.IO) {
            try {
                getPlayerDocRef()?.update("passportDetails", passportDetails)?.await()
                _playerInfoFlow.update { it?.copy(passportDetails = passportDetails) }
            } catch (e: Exception) { Log.e(TAG, "Failed to save passport details", e) }
        }
    }

    private suspend fun getCurrentUserAccount(): Account? = withContext(Dispatchers.IO) {
        try {
            val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
            snapshot.toObjects(Account::class.java).firstOrNull {
                it.email?.equals(firebaseHandler.firebaseAuth.currentUser?.email, ignoreCase = true) == true
            }
        } catch (_: Exception) { null }
    }

    private suspend fun getCurrentUserName(): String? = getCurrentUserAccount()?.getDisplayName(appContext)
}
