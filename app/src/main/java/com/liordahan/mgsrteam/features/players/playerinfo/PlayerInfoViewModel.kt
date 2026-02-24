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
import com.liordahan.mgsrteam.features.players.playerinfo.ai.ScoutReportOptions
import com.liordahan.mgsrteam.features.players.playerinfo.ai.SimilarPlayersOptions
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentDetectionService
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PdfFlattener
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.MatchingRequestUiState
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.PlayerOffer
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.IPlayerOffersRepository
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocumentsRepository
import com.liordahan.mgsrteam.features.players.playerinfo.notes.NoteParser
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.requests.RequestMatcher
import com.liordahan.mgsrteam.features.requests.repository.IRequestsRepository
import com.liordahan.mgsrteam.features.home.models.FeedEvent
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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
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
    abstract val hiddenGemFlow: StateFlow<AiHelperService.HiddenGemResult?>
    abstract val isHiddenGemLoading: StateFlow<Boolean>
    abstract val scoutReportFlow: StateFlow<String?>
    abstract val isScoutReportLoading: StateFlow<Boolean>
    abstract fun getPlayerInfo(playerId: String)
    abstract fun deletePlayer(playerTmProfile: String, onDeleteSuccessfully: () -> Unit)
    abstract fun updatePlayerNumber(number: String)
    abstract fun updateAgentNumber(number: String)
    abstract fun clearAgency()
    abstract fun updateHaveMandate(hasMandate: Boolean, isManual: Boolean = true)
    abstract fun updateSalaryRange(salaryRange: String?)
    abstract fun updateTransferFee(transferFee: String?)
    abstract fun updateNotes(notes: NotesModel)
    abstract fun refreshPlayerInfo()
    abstract fun onDeleteNoteClicked(note: NotesModel)
    abstract fun uploadDocument(uri: android.net.Uri?, bytes: ByteArray, name: String, mimeType: String?, expiresAt: Long?)
    abstract fun deleteDocument(documentId: String, isPassport: Boolean = false)
    abstract fun findSimilarPlayers(player: Player, languageCode: String = "en", options: SimilarPlayersOptions = SimilarPlayersOptions(), excludeNames: List<String> = emptyList())
    abstract fun computeHiddenGemScore(player: Player, languageCode: String = "en")
    abstract fun generateScoutReport(player: Player, languageCode: String = "en", options: ScoutReportOptions = ScoutReportOptions())
    abstract fun consumeUpdateResult()
    abstract val matchingRequestsFlow: StateFlow<List<MatchingRequestUiState>>
    abstract val allAccountsFlow: StateFlow<List<Account>>
    abstract val playerDocumentIdFlow: StateFlow<String?>
    abstract val playerTasksFlow: Flow<List<com.liordahan.mgsrteam.features.home.models.AgentTask>>
    abstract fun markPlayerAsOffered(player: Player, request: com.liordahan.mgsrteam.features.requests.models.Request, clubFeedback: String?)
    abstract fun addPlayerTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String, playerId: String, playerName: String, playerTmProfile: String, templateId: String)
    abstract fun togglePlayerTaskCompleted(task: com.liordahan.mgsrteam.features.home.models.AgentTask)
    abstract fun updateClubFeedback(offerId: String, clubFeedback: String?)
}


private const val TAG = "PassportUpload"

class PlayerInfoViewModel(
    private val appContext: android.content.Context,
    private val firebaseHandler: FirebaseHandler,
    private val playersUpdate: PlayersUpdate,
    private val documentsRepository: PlayerDocumentsRepository,
    private val documentDetectionService: DocumentDetectionService,
    private val aiHelperService: AiHelperService,
    private val requestsRepository: IRequestsRepository,
    private val offersRepository: IPlayerOffersRepository,
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
        _playerInfoFlow.flatMapLatest { player ->
            player?.tmProfile?.let { offersRepository.offersForPlayerFlow(it) } ?: flowOf(emptyList())
        },
        _playerInfoFlow
    ) { requests, offers, player ->
        if (player == null) emptyList()
        else {
            val pendingRequests = requests.filter { (it.status ?: "pending") == "pending" }
            val matching = RequestMatcher.matchingRequestsForPlayer(player, pendingRequests)
            val offerByRequestId = offers.associateBy { it.requestId }
            matching.map { req ->
                MatchingRequestUiState(request = req, offer = offerByRequestId[req.id])
            }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    override val allAccountsFlow: StateFlow<List<Account>> = callbackFlow {
        val listener = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot != null) {
                    trySend(snapshot.toObjects(Account::class.java))
                }
            }
        awaitClose { listener.remove() }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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
                    if (expiresAt < now && !mandate.expired) {
                        mandate.id?.let { documentsRepository.markDocumentExpired(it) }
                    }
                }
                // Auto-sync mandate switch: ON when valid mandate docs exist, OFF when none.
                // Only overwrite when count CHANGES (prevMandateCount != null) — never on first load,
                // so we don't overwrite a manual switch (player.haveMandate) when user navigates back.
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

    private val _playerDocumentIdFlow = MutableStateFlow<String?>(null)
    override val playerDocumentIdFlow: StateFlow<String?> = _playerDocumentIdFlow

    @OptIn(ExperimentalCoroutinesApi::class)
    override val playerTasksFlow: Flow<List<AgentTask>> = _playerDocumentIdFlow.flatMapLatest { docId ->
        if (docId.isNullOrBlank()) flowOf(emptyList())
        else callbackFlow {
            val listener = firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
                .whereEqualTo("playerId", docId)
                .addSnapshotListener { snapshot, _ ->
                    if (snapshot != null) {
                        val tasks = snapshot.documents.mapNotNull { doc ->
                            doc.toObject(AgentTask::class.java)?.copy(id = doc.id)
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
            val createdByAgentId = currentAccount?.id ?: ""
            val createdByAgentName = currentAccount?.getDisplayName(appContext) ?: ""
            val newTask = AgentTask(
                agentId = agentId,
                agentName = agentName,
                title = title,
                isCompleted = false,
                dueDate = dueDate,
                createdAt = System.currentTimeMillis(),
                priority = priority,
                notes = notes,
                createdByAgentId = createdByAgentId,
                createdByAgentName = createdByAgentName,
                playerId = playerId,
                playerName = playerName,
                playerTmProfile = playerTmProfile,
                templateId = templateId
            )
            firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable).add(newTask).await()
        }
    }

    override fun togglePlayerTaskCompleted(task: AgentTask) {
        if (task.id.isBlank()) return
        viewModelScope.launch {
            val nowCompleted = !task.isCompleted
            val data = mapOf(
                "isCompleted" to nowCompleted,
                "completedAt" to if (nowCompleted) System.currentTimeMillis() else 0L
            )
            firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
                .document(task.id).update(data).await()
        }
    }

    override fun getPlayerInfo(playerId: String) {
        _scoutReportFlow.update { null }
        _hiddenGemFlow.update { null }
        _playerDocumentIdFlow.update { null }
        playerListenerRegistration?.remove()
        playerListenerRegistration = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .whereEqualTo("tmProfile", playerId).addSnapshotListener { value, error ->
                if (error != null) {
                    //
                } else {
                    val doc = value?.documents?.firstOrNull() ?: return@addSnapshotListener
                    val player = doc.toObject(Player::class.java) ?: return@addSnapshotListener
                    _playerInfoFlow.update { player }
                    _playerDocumentIdFlow.update { doc.id }
                }
            }
    }

    override fun deletePlayer(playerTmProfile: String, onDeleteSuccessfully: () -> Unit) {
        viewModelScope.launch {
            _showButtonProgress.update { true }
            try {
                val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", playerTmProfile).get().await()
                val doc = snapshot.documents.firstOrNull() ?: return@launch
                val player = doc.toObject(Player::class.java)
                doc.reference.delete().await()
                val deletedBy = getCurrentUserName()
                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    FeedEvent(
                        type = FeedEvent.TYPE_PLAYER_DELETED,
                        playerName = player?.fullName,
                        playerImage = player?.profileImage,
                        playerTmProfile = playerTmProfile,
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

    override fun clearAgency() {
        _playerInfoFlow.update {
            it?.copy(agency = null, agencyUrl = null)
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

    override fun updateHaveMandate(hasMandate: Boolean, isManual: Boolean) {
        _playerInfoFlow.update {
            it?.copy(haveMandate = hasMandate)
        }
        viewModelScope.launch {
            val player = _playerInfoFlow.value ?: return@launch
            val tmProfile = player.tmProfile ?: return@launch
            val doc = firebaseHandler.firebaseStore
                .collection(firebaseHandler.playersTable)
                .whereEqualTo("tmProfile", tmProfile)
                .get().await().documents.firstOrNull()
            doc?.reference?.set(player.copy(haveMandate = hasMandate))?.await()

            if (isManual) {
                val createdBy = getCurrentUserName()
                val mandateExpiryAt = if (hasMandate) {
                    documentsRepository.getDocuments(tmProfile)
                        .filter { it.documentType == DocumentType.MANDATE && !it.expired }
                        .maxOfOrNull { it.expiresAt ?: 0L }
                        ?.takeIf { it > 0 }
                } else null
                val feedRef = firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable)
                val feedEvent = FeedEvent(
                    type = if (hasMandate) FeedEvent.TYPE_MANDATE_SWITCHED_ON else FeedEvent.TYPE_MANDATE_SWITCHED_OFF,
                    playerName = player.fullName,
                    playerImage = player.profileImage,
                    playerTmProfile = tmProfile,
                    agentName = createdBy,
                    mandateExpiryAt = mandateExpiryAt,
                    timestamp = System.currentTimeMillis()
                )
                feedRef.add(feedEvent).await()
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
            var updatedPlayer: Player? = null
            var createdBy: String? = null
            _playerInfoFlow.update { player ->
                val currentNotes = player?.noteList?.toMutableList() ?: mutableListOf()
                createdBy = getCurrentUserName()
                val note = notes.copy(createBy = createdBy)
                currentNotes.add(note)
                val newNoteList = currentNotes
                val salaryRange = NoteParser.extractSalaryRange(newNoteList)
                val isFree = NoteParser.extractFreeTransfer(newNoteList)
                updatedPlayer = player?.copy(
                    noteList = newNoteList,
                    salaryRange = salaryRange ?: player.salaryRange,
                    transferFee = if (isFree) "Free/Free loan" else player.transferFee
                )
                updatedPlayer
            }

            updatedPlayer?.let { player ->
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", player.tmProfile)
                    .get().await().documents.firstOrNull()
                doc?.reference?.set(player)?.await()

                // Write FeedEvent so dashboard updates immediately
                val feedRef = firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable)
                val notePreview = notes.notes?.take(120)?.let { if (it.length == 120) "$it…" else it }
                val feedEvent = FeedEvent(
                    type = FeedEvent.TYPE_NOTE_ADDED,
                    playerName = player.fullName,
                    playerImage = player.profileImage,
                    playerTmProfile = player.tmProfile,
                    agentName = createdBy,
                    extraInfo = notePreview,
                    timestamp = System.currentTimeMillis()
                )
                feedRef.add(feedEvent).await()
            }
        }
    }

    override fun onDeleteNoteClicked(note: NotesModel) {
        viewModelScope.launch {
            var updatedPlayer: Player? = null
            _playerInfoFlow.update { player ->
                val currentNotes = player?.noteList?.toMutableList() ?: mutableListOf()
                currentNotes.remove(note)
                val newNoteList = currentNotes
                val salaryRange = NoteParser.extractSalaryRange(newNoteList)
                val isFree = NoteParser.extractFreeTransfer(newNoteList)
                updatedPlayer = player?.copy(
                    noteList = newNoteList,
                    salaryRange = salaryRange ?: player.salaryRange,
                    transferFee = if (isFree) "Free/Free loan" else player.transferFee
                )
                updatedPlayer
            }

            updatedPlayer?.let { player ->
                val doc = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", player.tmProfile)
                    .get().await().documents.firstOrNull()

                doc?.reference?.set(player)?.await()

                // Write feed event for note deleted
                val deletedBy = getCurrentUserName()
                val notePreview = note.notes?.take(120)?.let { if (it.length == 120) "$it…" else it }
                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    FeedEvent(
                        type = FeedEvent.TYPE_NOTE_DELETED,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        playerTmProfile = player.tmProfile,
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
                        foot = response.data?.foot ?: player.foot,
                        agency = response.data?.agency ?: player.agency,
                        agencyUrl = response.data?.agencyUrl ?: player.agencyUrl,
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
                val createdBy = getCurrentUserName()
                val uploadedBy = if (detection.documentType == DocumentType.MANDATE) createdBy else null
                // Flatten PDFs so annotations (signatures, stamps) are visible in all viewers
                val isPdf = mimeType?.lowercase() == "application/pdf" || name.lowercase().endsWith(".pdf")
                val bytesToUpload = if (isPdf) {
                    withContext(Dispatchers.IO) { PdfFlattener.flatten(bytes) }
                } else bytes
                val result = documentsRepository.uploadDocument(
                    tmProfile,
                    detection.documentType,
                    detection.suggestedName,
                    bytesToUpload,
                    docExpiresAt,
                    uploadedBy = uploadedBy
                )
                if (result.isSuccess && detection.documentType == DocumentType.MANDATE) {
                    val feedRef = firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable)
                    val feedEvent = FeedEvent(
                        type = FeedEvent.TYPE_MANDATE_UPLOADED,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        playerTmProfile = tmProfile,
                        agentName = createdBy,
                        mandateExpiryAt = docExpiresAt,
                        timestamp = System.currentTimeMillis()
                    )
                    feedRef.add(feedEvent).await()
                }
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

    override fun markPlayerAsOffered(player: Player, request: com.liordahan.mgsrteam.features.requests.models.Request, clubFeedback: String?) {
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
        viewModelScope.launch {
            offersRepository.updateClubFeedback(offerId, clubFeedback)
        }
    }

    override fun findSimilarPlayers(player: Player, languageCode: String, options: SimilarPlayersOptions, excludeNames: List<String>) {
        viewModelScope.launch {
            _isSimilarPlayersLoading.update { true }
            aiHelperService.findSimilarPlayers(player, languageCode, options, excludeNames = excludeNames)
                .onSuccess { suggestions ->
                    _similarPlayersFlow.update { suggestions }
                    Log.d(TAG, "findSimilarPlayers: found ${suggestions.size} similar players for ${player.fullName}")
                }
                .onFailure { e ->
                    Log.e(TAG, "findSimilarPlayers failed for ${player.fullName}", e)
                }
            _isSimilarPlayersLoading.update { false }
        }
    }

    override fun computeHiddenGemScore(player: Player, languageCode: String) {
        viewModelScope.launch {
            _isHiddenGemLoading.update { true }
            _hiddenGemFlow.update { null }
            aiHelperService.computeHiddenGemScore(player, languageCode)
                .onSuccess { result ->
                    _hiddenGemFlow.update { result }
                    Log.d(TAG, "computeHiddenGemScore: ${player.fullName} score=${result.score}")
                }
                .onFailure { e ->
                    Log.e(TAG, "computeHiddenGemScore failed for ${player.fullName}", e)
                    _hiddenGemFlow.update { null }
                }
            _isHiddenGemLoading.update { false }
        }
    }

    override fun generateScoutReport(player: Player, languageCode: String, options: ScoutReportOptions) {
        viewModelScope.launch {
            _isScoutReportLoading.update { true }
            _scoutReportFlow.update { null }
            aiHelperService.generateScoutReport(player, languageCode, options)
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
            account?.getDisplayName(appContext)
        } catch (e: Exception) {
            null
        }
    }
}
