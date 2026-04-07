package com.liordahan.mgsrteam.features.players.playerinfo

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.MarketValueEntry
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.features.players.models.PassportDetails
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getAgentPhoneNumber
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
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRepository
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.SharedCallables
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
import kotlinx.coroutines.flow.first
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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit


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
    abstract fun updateInterestedInIsrael(interested: Boolean)
    abstract fun updateIsMarried(married: Boolean)
    abstract fun updateKidsCount(count: Int)
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
    abstract val proposalHistoryFlow: StateFlow<List<PlayerOffer>>
    abstract val allAccountsFlow: StateFlow<List<Account>>
    abstract val playerDocumentIdFlow: StateFlow<String?>
    abstract val playerTasksFlow: Flow<List<com.liordahan.mgsrteam.features.home.models.AgentTask>>
    abstract fun markPlayerAsOffered(player: Player, request: com.liordahan.mgsrteam.features.requests.models.Request, clubFeedback: String?)
    abstract fun addPlayerTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String, playerId: String, playerName: String, playerTmProfile: String, templateId: String, linkedAgentContactId: String = "", linkedAgentContactName: String = "", linkedAgentContactPhone: String = "")
    abstract fun togglePlayerTaskCompleted(task: com.liordahan.mgsrteam.features.home.models.AgentTask)
    abstract fun updateClubFeedback(offerId: String, clubFeedback: String?)
    abstract fun updateHistorySummary(offerId: String, summary: String?)
    abstract suspend fun createShareUrl(player: Player, playerDocId: String, documents: List<PlayerDocument>, scoutReport: String?, lang: String, includePlayerContact: Boolean = false, includeAgencyContact: Boolean = false): Result<String>

    // ── Highlights ─────────────────────────────────────────────────
    abstract val highlightVideosFlow: StateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightVideo>>
    abstract val isHighlightsLoading: StateFlow<Boolean>
    abstract val highlightsError: StateFlow<String?>
    abstract val highlightsHasFetched: StateFlow<Boolean>
    abstract val isHighlightsSaving: StateFlow<Boolean>
    abstract fun searchHighlights(player: Player, refresh: Boolean = false)
    abstract fun savePinnedHighlights(videos: List<com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightVideo>)
    abstract fun saveYouthHighlights(highlights: List<com.liordahan.mgsrteam.features.players.models.PinnedHighlight>)

    // ── Player Stats (API-Football) ─────────────────────────────────
    abstract val playerStatsFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.playerstats.PlayerStatsData?>
    abstract val isPlayerStatsLoading: StateFlow<Boolean>
    abstract val playerStatsError: StateFlow<String?>
    abstract fun fetchPlayerStats(playerTmProfile: String)

    // ── FM Intelligence ────────────────────────────────────────────
    abstract val fmIntelligenceFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence.FmIntelligenceData?>
    abstract val isFmIntelligenceLoading: StateFlow<Boolean>
    abstract val fmIntelligenceError: StateFlow<String?>
    abstract fun fetchFmIntelligence(player: Player)

    // ── GPS Performance ────────────────────────────────────────────
    abstract val gpsMatchDataFlow: StateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsMatchData>>
    abstract val gpsSummaryFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsSummary?>
    abstract val gpsInsightsFlow: StateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsInsight>>
    abstract val isGpsLoading: StateFlow<Boolean>
    abstract fun processGpsDocument(bytes: ByteArray, mimeType: String?, storageUrl: String, documentId: String?)

    // ── Agent Transfer ─────────────────────────────────────────────
    abstract val pendingTransferFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest?>
    abstract val resolvedTransferFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest?>
    abstract val currentUserAccountFlow: StateFlow<com.liordahan.mgsrteam.features.login.models.Account?>
    abstract val currentUserAuthUid: String?
    abstract val transferSuccessFlow: SharedFlow<String>
    abstract val transferLoadingFlow: StateFlow<Boolean>
    abstract fun requestAgentTransfer()
    abstract fun approveTransfer()
    abstract fun rejectTransfer()
    abstract fun cancelTransferRequest()

    // ── Fine-grained saving indicators ─────────────────────────────
    /** Set of field keys currently being saved (e.g. "playerPhone", "salary"). */
    abstract val savingFieldsFlow: StateFlow<Set<String>>
    abstract val deletingDocIdFlow: StateFlow<String?>
    abstract val isMarkingOfferedFlow: StateFlow<Boolean>
    abstract val isSavingTaskFlow: StateFlow<Boolean>
    abstract val isSavingFeedbackFlow: StateFlow<Boolean>
    abstract val isSavingSummaryFlow: StateFlow<Boolean>
    abstract val isRequestingTransferFlow: StateFlow<Boolean>
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
    private val platformManager: PlatformManager,
    private val highlightsApiClient: com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightsApiClient = com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightsApiClient(),
    private val scoutApiClient: com.liordahan.mgsrteam.features.scouting.ScoutApiClient,
    private val agentTransferRepository: AgentTransferRepository = AgentTransferRepository(com.google.firebase.firestore.FirebaseFirestore.getInstance()),
    private val matchResultsRepository: com.liordahan.mgsrteam.features.requests.repository.MatchResultsRepository,
    private val playerStatsApiClient: com.liordahan.mgsrteam.features.players.playerinfo.playerstats.PlayerStatsApiClient = com.liordahan.mgsrteam.features.players.playerinfo.playerstats.PlayerStatsApiClient(),
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

    private val _playerDocumentIdFlow = MutableStateFlow<String?>(null)
    override val playerDocumentIdFlow: StateFlow<String?> = _playerDocumentIdFlow

    /** True when the active platform is Women or Youth. */
    private val isNonMenPlatform: Boolean
        get() = platformManager.current.value != Platform.MEN

    @OptIn(ExperimentalCoroutinesApi::class)
    override val documentsFlow: Flow<List<PlayerDocument>> =
        _playerDocumentIdFlow.flatMapLatest { docId ->
            val key = if (platformManager.current.value != Platform.MEN) docId else _playerInfoFlow.value?.tmProfile
            if (key != null) documentsRepository.getDocumentsFlow(key)
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

    // ── Highlights ──────────────────────────────────────────────────
    private val _highlightVideosFlow = MutableStateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightVideo>>(emptyList())
    override val highlightVideosFlow: StateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightVideo>> = _highlightVideosFlow

    private val _isHighlightsLoading = MutableStateFlow(false)
    override val isHighlightsLoading: StateFlow<Boolean> = _isHighlightsLoading

    private val _highlightsError = MutableStateFlow<String?>(null)
    override val highlightsError: StateFlow<String?> = _highlightsError

    private val _highlightsHasFetched = MutableStateFlow(false)
    override val highlightsHasFetched: StateFlow<Boolean> = _highlightsHasFetched

    private val _isHighlightsSaving = MutableStateFlow(false)
    override val isHighlightsSaving: StateFlow<Boolean> = _isHighlightsSaving

    // ── Player Stats (API-Football) ──────────────────────────────────
    private val _playerStatsFlow = MutableStateFlow<com.liordahan.mgsrteam.features.players.playerinfo.playerstats.PlayerStatsData?>(null)
    override val playerStatsFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.playerstats.PlayerStatsData?> = _playerStatsFlow

    private val _isPlayerStatsLoading = MutableStateFlow(false)
    override val isPlayerStatsLoading: StateFlow<Boolean> = _isPlayerStatsLoading

    private val _playerStatsError = MutableStateFlow<String?>(null)
    override val playerStatsError: StateFlow<String?> = _playerStatsError

    // ── FM Intelligence ──────────────────────────────────────────────
    private val _fmIntelligenceFlow = MutableStateFlow<com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence.FmIntelligenceData?>(null)
    override val fmIntelligenceFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence.FmIntelligenceData?> = _fmIntelligenceFlow

    private val _isFmIntelligenceLoading = MutableStateFlow(false)
    override val isFmIntelligenceLoading: StateFlow<Boolean> = _isFmIntelligenceLoading

    private val _fmIntelligenceError = MutableStateFlow<String?>(null)
    override val fmIntelligenceError: StateFlow<String?> = _fmIntelligenceError

    // ── GPS Performance ──────────────────────────────────────────────
    private val _gpsMatchDataFlow = MutableStateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsMatchData>>(emptyList())
    override val gpsMatchDataFlow: StateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsMatchData>> = _gpsMatchDataFlow

    private val _gpsSummaryFlow = MutableStateFlow<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsSummary?>(null)
    override val gpsSummaryFlow: StateFlow<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsSummary?> = _gpsSummaryFlow

    private val _gpsInsightsFlow = MutableStateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsInsight>>(emptyList())
    override val gpsInsightsFlow: StateFlow<List<com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsInsight>> = _gpsInsightsFlow

    private val _isGpsLoading = MutableStateFlow(false)
    override val isGpsLoading: StateFlow<Boolean> = _isGpsLoading

    @OptIn(ExperimentalCoroutinesApi::class)
    override val matchingRequestsFlow: StateFlow<List<MatchingRequestUiState>> = combine(
        requestsRepository.requestsFlow(),
        combine(_playerInfoFlow, _playerDocumentIdFlow) { player, docId ->
            val key = if (platformManager.current.value != Platform.MEN) docId else player?.tmProfile
            key
        }.flatMapLatest { key ->
            key?.let { offersRepository.offersForPlayerFlow(it) } ?: flowOf(emptyList())
        },
        _playerInfoFlow,
        // Read pre-computed matching request IDs from Cloud Function results
        _playerDocumentIdFlow.flatMapLatest { docId ->
            docId?.let { matchResultsRepository.matchingRequestIdsForPlayer(it) } ?: flowOf(emptyList())
        }
    ) { requests, offers, player, matchingRequestIds ->
        if (player == null) emptyList()
        else {
            val requestById = requests.associateBy { it.id }
            val matching = matchingRequestIds.mapNotNull { requestById[it] }
            val offerByRequestId = offers.associateBy { it.requestId }
            matching.map { req ->
                MatchingRequestUiState(request = req, offer = offerByRequestId[req.id])
            }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    @OptIn(ExperimentalCoroutinesApi::class)
    override val proposalHistoryFlow: StateFlow<List<PlayerOffer>> = combine(
        combine(_playerInfoFlow, _playerDocumentIdFlow) { player, docId ->
            val key = if (platformManager.current.value != Platform.MEN) docId else player?.tmProfile
            key
        }.flatMapLatest { key ->
            key?.let { offersRepository.offersForPlayerFlow(it) } ?: flowOf(emptyList())
        },
        matchingRequestsFlow
    ) { allOffers, matchingStates ->
        val activeRequestIds = matchingStates.map { it.request.id }.toSet()
        allOffers.filter { it.requestId !in activeRequestIds }
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
                if (player.tmProfile == null && !isNonMenPlatform) return@collect
                val mandateDocs = docs.filter { it.documentType == DocumentType.MANDATE }
                val now = System.currentTimeMillis()
                for (mandate in mandateDocs) {
                    val expiresAt = mandate.expiresAt ?: continue
                    if (expiresAt < now && !mandate.expired) {
                        mandate.id?.let { SharedCallables.playerDocumentsMarkExpired(it) }
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

                // Auto-set interestedInIsrael when any valid mandate has Israel in validLeagues
                val validMandates = mandateDocs.filter { !it.expired && (it.expiresAt == null || it.expiresAt >= now) }
                val hasIsraelLeague = validMandates.any { mandate ->
                    mandate.validLeagues?.any { it.contains("Israel", ignoreCase = true) } == true
                }
                if (hasIsraelLeague && player.interestedInIsrael != true) {
                    updateInterestedInIsrael(true)
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

    // ── Agent Transfer ──────────────────────────────────────────────
    private val _pendingTransferFlow = MutableStateFlow<AgentTransferRequest?>(null)
    override val pendingTransferFlow: StateFlow<AgentTransferRequest?> = _pendingTransferFlow

    private val _resolvedTransferFlow = MutableStateFlow<AgentTransferRequest?>(null)
    override val resolvedTransferFlow: StateFlow<AgentTransferRequest?> = _resolvedTransferFlow

    private val _currentUserAccountFlow = MutableStateFlow<Account?>(null)
    override val currentUserAccountFlow: StateFlow<Account?> = _currentUserAccountFlow

    override val currentUserAuthUid: String?
        get() = firebaseHandler.firebaseAuth.currentUser?.uid

    private val _transferSuccessFlow = MutableSharedFlow<String>()
    override val transferSuccessFlow: SharedFlow<String> = _transferSuccessFlow

    private val _transferLoadingFlow = MutableStateFlow(false)
    override val transferLoadingFlow: StateFlow<Boolean> = _transferLoadingFlow

    // ── Fine-grained saving indicators ──────────────────────────────
    private val _savingFieldsFlow = MutableStateFlow<Set<String>>(emptySet())
    override val savingFieldsFlow: StateFlow<Set<String>> = _savingFieldsFlow

    private val _deletingDocIdFlow = MutableStateFlow<String?>(null)
    override val deletingDocIdFlow: StateFlow<String?> = _deletingDocIdFlow

    private val _isMarkingOfferedFlow = MutableStateFlow(false)
    override val isMarkingOfferedFlow: StateFlow<Boolean> = _isMarkingOfferedFlow

    private val _isSavingTaskFlow = MutableStateFlow(false)
    override val isSavingTaskFlow: StateFlow<Boolean> = _isSavingTaskFlow

    private val _isSavingFeedbackFlow = MutableStateFlow(false)
    override val isSavingFeedbackFlow: StateFlow<Boolean> = _isSavingFeedbackFlow

    private val _isSavingSummaryFlow = MutableStateFlow(false)
    override val isSavingSummaryFlow: StateFlow<Boolean> = _isSavingSummaryFlow

    private val _isRequestingTransferFlow = MutableStateFlow(false)
    override val isRequestingTransferFlow: StateFlow<Boolean> = _isRequestingTransferFlow

    private var transferListenerRegistration: com.google.firebase.firestore.ListenerRegistration? = null
    private var resolvedTransferListenerRegistration: com.google.firebase.firestore.ListenerRegistration? = null

    init {
        // Load current user account eagerly for transfer feature
        viewModelScope.launch(Dispatchers.IO) {
            _currentUserAccountFlow.value = getCurrentUserAccount()
        }
        // Start transfer listener when player doc ID is available
        viewModelScope.launch {
            _playerDocumentIdFlow.collect { docId ->
                if (docId != null) {
                    startTransferListener(docId)
                    startResolvedTransferListener(docId)
                }
            }
        }
        // Start GPS listener when player info loaded (keyed on tmProfile for men, docId for women/youth)
        viewModelScope.launch {
            combine(_playerInfoFlow, _playerDocumentIdFlow) { player, docId ->
                if (platformManager.current.value != Platform.MEN) docId else player?.tmProfile
            }.collect { key ->
                if (key != null) startGpsListener(key)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        gpsListenerRegistration?.remove()
        gpsInsightsListenerRegistration?.remove()
        playerListenerRegistration?.remove()
        transferListenerRegistration?.remove()
        resolvedTransferListenerRegistration?.remove()
    }

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

    override fun addPlayerTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String, playerId: String, playerName: String, playerTmProfile: String, templateId: String, linkedAgentContactId: String, linkedAgentContactName: String, linkedAgentContactPhone: String) {
        viewModelScope.launch {
            _isSavingTaskFlow.value = true
            try {
                val currentAccount = allAccountsFlow.value.firstOrNull {
                    it.email.equals(firebaseHandler.firebaseAuth.currentUser?.email, true)
                }
                val createdByAgentId = currentAccount?.id ?: ""
                val createdByAgentName = currentAccount?.getDisplayName(appContext) ?: ""
                SharedCallables.tasksCreate(platformManager.value, mapOf(
                    "agentId" to agentId,
                    "agentName" to agentName,
                    "title" to title,
                    "isCompleted" to false,
                    "dueDate" to dueDate,
                    "createdAt" to System.currentTimeMillis(),
                    "priority" to priority,
                    "notes" to notes,
                    "createdByAgentId" to createdByAgentId,
                    "createdByAgentName" to createdByAgentName,
                    "playerId" to playerId,
                    "playerName" to playerName,
                    "playerTmProfile" to playerTmProfile,
                    "templateId" to templateId,
                    "linkedAgentContactId" to linkedAgentContactId,
                    "linkedAgentContactName" to linkedAgentContactName,
                    "linkedAgentContactPhone" to linkedAgentContactPhone
                ))
            } finally {
                _isSavingTaskFlow.value = false
            }
        }
    }

    override fun togglePlayerTaskCompleted(task: AgentTask) {
        if (task.id.isBlank()) return
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "task_${task.id}" }
            try {
                val nowCompleted = !task.isCompleted
                SharedCallables.tasksToggleComplete(platformManager.value, task.id, nowCompleted)
            } finally {
                _savingFieldsFlow.update { it - "task_${task.id}" }
            }
        }
    }

    override fun getPlayerInfo(playerId: String) {
        _scoutReportFlow.update { null }
        _hiddenGemFlow.update { null }
        _playerDocumentIdFlow.update { null }
        playerListenerRegistration?.remove()

        if (isNonMenPlatform) {
            // Women / Youth — playerId IS the Firestore document ID
            playerListenerRegistration = firebaseHandler.firebaseStore
                .collection(firebaseHandler.playersTable)
                .document(playerId)
                .addSnapshotListener { snapshot, error ->
                    if (error != null) return@addSnapshotListener
                    val player = try {
                        snapshot?.toObject(Player::class.java)
                    } catch (_: Exception) { null } ?: return@addSnapshotListener
                    _playerInfoFlow.update { player }
                    _playerDocumentIdFlow.update { snapshot!!.id }
                }
        } else {
            // Men — playerId is the tmProfile URL
            playerListenerRegistration = firebaseHandler.firebaseStore
                .collection(firebaseHandler.playersTable)
                .whereEqualTo("tmProfile", playerId)
                .addSnapshotListener { value, error ->
                    if (error != null) return@addSnapshotListener
                    val doc = value?.documents?.firstOrNull() ?: return@addSnapshotListener
                    val player = try {
                        doc.toObject(Player::class.java)
                    } catch (_: Exception) { null } ?: return@addSnapshotListener
                    _playerInfoFlow.update { player }
                    _playerDocumentIdFlow.update { doc.id }
                }
        }
    }

    override fun deletePlayer(playerTmProfile: String, onDeleteSuccessfully: () -> Unit) {
        viewModelScope.launch {
            _showButtonProgress.update { true }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                val player = _playerInfoFlow.value
                val deletedBy = getCurrentUserName()
                val feedProfileId = player?.tmProfile ?: docId
                SharedCallables.playersDelete(
                    platform = platformManager.value,
                    playerId = docId,
                    playerRefId = feedProfileId,
                    playerName = player?.fullName,
                    playerImage = player?.profileImage,
                    agentName = deletedBy
                )
                onDeleteSuccessfully()
            } finally {
                _showButtonProgress.update { false }
            }
        }
    }

    override fun updatePlayerNumber(number: String) {
        _playerInfoFlow.update {
            it?.copy(
                playerPhoneNumber = number
            )
        }

        viewModelScope.launch {
            _savingFieldsFlow.update { it + "playerPhone" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                SharedCallables.playersUpdate(platformManager.value, docId, mapOf("playerPhoneNumber" to number))
            } finally {
                _savingFieldsFlow.update { it - "playerPhone" }
            }
        }
    }

    override fun updateAgentNumber(number: String) {
        _playerInfoFlow.update {
            it?.copy(
                agentPhoneNumber = number
            )
        }

        viewModelScope.launch {
            _savingFieldsFlow.update { it + "agentPhone" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                SharedCallables.playersUpdate(platformManager.value, docId, mapOf("agentPhoneNumber" to number))
            } finally {
                _savingFieldsFlow.update { it - "agentPhone" }
            }
        }
    }

    override fun clearAgency() {
        _playerInfoFlow.update {
            it?.copy(agency = null, agencyUrl = null)
        }

        viewModelScope.launch {
            _savingFieldsFlow.update { it + "agency" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                SharedCallables.playersUpdate(platformManager.value, docId, emptyMap(), deleteFields = listOf("agency", "agencyUrl"))
            } finally {
                _savingFieldsFlow.update { it - "agency" }
            }
        }
    }

    override fun updateHaveMandate(hasMandate: Boolean, isManual: Boolean) {
        _playerInfoFlow.update {
            it?.copy(haveMandate = hasMandate)
        }
        viewModelScope.launch {
            if (isManual) _savingFieldsFlow.update { it + "mandate" }
            try {
                val player = _playerInfoFlow.value ?: return@launch
                val docId = _playerDocumentIdFlow.value ?: return@launch
                val feedProfileId = player.tmProfile ?: docId

                if (isManual) {
                    val createdBy = getCurrentUserName()
                    SharedCallables.playersToggleMandate(
                        platform = platformManager.value,
                        playerId = docId,
                        hasMandate = hasMandate,
                        playerRefId = feedProfileId,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        agentName = createdBy
                    )
                } else {
                    // Auto-sync from document watcher — just update the field, no FeedEvent
                    SharedCallables.playersUpdate(platformManager.value, docId, mapOf("haveMandate" to hasMandate))
                }
            } finally {
                if (isManual) _savingFieldsFlow.update { it - "mandate" }
            }
        }
    }

    override fun updateInterestedInIsrael(interested: Boolean) {
        _playerInfoFlow.update {
            it?.copy(interestedInIsrael = interested)
        }
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "interestedInIsrael" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                SharedCallables.playersUpdate(platformManager.value, docId, mapOf("interestedInIsrael" to interested))
            } finally {
                _savingFieldsFlow.update { it - "interestedInIsrael" }
            }
        }
    }

    override fun updateIsMarried(married: Boolean) {
        _playerInfoFlow.update {
            it?.copy(isMarried = married)
        }
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "isMarried" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                SharedCallables.playersUpdate(platformManager.value, docId, mapOf("isMarried" to married))
            } finally {
                _savingFieldsFlow.update { it - "isMarried" }
            }
        }
    }

    override fun updateKidsCount(count: Int) {
        _playerInfoFlow.update {
            it?.copy(kidsCount = count)
        }
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "kidsCount" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                SharedCallables.playersUpdate(platformManager.value, docId, mapOf("kidsCount" to count))
            } finally {
                _savingFieldsFlow.update { it - "kidsCount" }
            }
        }
    }

    override fun updateSalaryRange(salaryRange: String?) {
        _playerInfoFlow.update {
            it?.copy(salaryRange = salaryRange)
        }
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "salary" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                if (salaryRange != null) {
                    SharedCallables.playersUpdate(platformManager.value, docId, mapOf("salaryRange" to salaryRange))
                } else {
                    SharedCallables.playersUpdate(platformManager.value, docId, emptyMap(), deleteFields = listOf("salaryRange"))
                }
            } finally {
                _savingFieldsFlow.update { it - "salary" }
            }
        }
    }

    override fun updateTransferFee(transferFee: String?) {
        _playerInfoFlow.update {
            it?.copy(transferFee = transferFee)
        }
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "transferFee" }
            try {
                val docId = _playerDocumentIdFlow.value ?: return@launch
                if (transferFee != null) {
                    SharedCallables.playersUpdate(platformManager.value, docId, mapOf("transferFee" to transferFee))
                } else {
                    SharedCallables.playersUpdate(platformManager.value, docId, emptyMap(), deleteFields = listOf("transferFee"))
                }
            } finally {
                _savingFieldsFlow.update { it - "transferFee" }
            }
        }
    }

    override fun updateNotes(notes: NotesModel) {
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "notes" }
            try {
                val player = _playerInfoFlow.value ?: return@launch
                val docId = _playerDocumentIdFlow.value ?: return@launch
                val feedProfileId = player.tmProfile ?: docId
                val account = getCurrentUserAccount()

                // Optimistic local update + extract financial terms from notes
                var extractedSalary: String? = null
                var extractedFree = false
                _playerInfoFlow.update { p ->
                    val currentNotes = p?.noteList?.toMutableList() ?: mutableListOf()
                    val note = notes.copy(
                        createBy = account?.name,
                        createByHe = account?.hebrewName
                    )
                    currentNotes.add(note)
                    extractedSalary = NoteParser.extractSalaryRange(currentNotes)
                    extractedFree = NoteParser.extractFreeTransfer(currentNotes)
                    p?.copy(
                        noteList = currentNotes,
                        salaryRange = extractedSalary ?: p.salaryRange,
                        transferFee = if (extractedFree) "Free/Free loan" else p.transferFee
                    )
                }

                SharedCallables.playersAddNote(
                    platform = platformManager.value,
                    playerId = docId,
                    playerRefId = feedProfileId,
                    noteText = notes.notes ?: "",
                    createdBy = account?.name,
                    createdByHe = account?.hebrewName,
                    playerName = player.fullName,
                    playerImage = player.profileImage,
                    agentName = account?.getDisplayName(appContext),
                    taggedAgentIds = notes.taggedAgentIds
                )

                // Persist extracted financial terms from notes
                val financialUpdates = mutableMapOf<String, Any>()
                if (extractedSalary != null && extractedSalary != player.salaryRange) {
                    financialUpdates["salaryRange"] = extractedSalary!!
                }
                if (extractedFree && player.transferFee != "Free/Free loan") {
                    financialUpdates["transferFee"] = "Free/Free loan"
                }
                if (financialUpdates.isNotEmpty()) {
                    SharedCallables.playersUpdate(platformManager.value, docId, financialUpdates)
                }
            } finally {
                _savingFieldsFlow.update { it - "notes" }
            }
        }
    }

    override fun onDeleteNoteClicked(note: NotesModel) {
        viewModelScope.launch {
            _savingFieldsFlow.update { it + "notes" }
            try {
                val player = _playerInfoFlow.value ?: return@launch
                val docId = _playerDocumentIdFlow.value ?: return@launch
                val feedProfileId = player.tmProfile ?: docId
                val noteIndex = player.noteList?.indexOf(note) ?: -1

                // Optimistic local update + recalculate financial terms
                _playerInfoFlow.update { p ->
                    val currentNotes = p?.noteList?.toMutableList() ?: mutableListOf()
                    currentNotes.remove(note)
                    val salaryRange = NoteParser.extractSalaryRange(currentNotes)
                    val isFree = NoteParser.extractFreeTransfer(currentNotes)
                    p?.copy(
                        noteList = currentNotes,
                        salaryRange = salaryRange ?: p.salaryRange,
                        transferFee = if (isFree) "Free/Free loan" else p.transferFee
                    )
                }

                val deletedBy = getCurrentUserName()
                SharedCallables.playersDeleteNote(
                    platform = platformManager.value,
                    playerId = docId,
                    playerRefId = feedProfileId,
                    noteIndex = noteIndex,
                    noteText = note.notes,
                    noteCreatedAt = note.createdAt,
                    playerName = player.fullName,
                    playerImage = player.profileImage,
                    agentName = deletedBy
                )
            } finally {
                _savingFieldsFlow.update { it - "notes" }
            }
        }
    }

    override fun refreshPlayerInfo() {
        viewModelScope.launch {
            _updatePlayerFlow.update { UiResult.Loading }

            val player = _playerInfoFlow.value ?: return@launch

            // Women / Youth players have no Transfermarkt profile — nothing to refresh
            if (isNonMenPlatform) {
                _updatePlayerFlow.update { UiResult.Success("Player data is up to date") }
                return@launch
            }

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
                        nationalities = response.data?.citizenships?.takeIf { it.isNotEmpty() } ?: player.nationalities,
                        nationalityFlags = response.data?.citizenshipFlags?.takeIf { it.isNotEmpty() } ?: player.nationalityFlags,
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

                    val docId = _playerDocumentIdFlow.value
                    if (docId != null) {
                        SharedCallables.playersUpdate(platformManager.value, docId, mapOf(
                            "marketValue" to playerToUpdate.marketValue,
                            "profileImage" to playerToUpdate.profileImage,
                            "nationalityFlag" to playerToUpdate.nationalityFlag,
                            "nationality" to playerToUpdate.nationality,
                            "nationalities" to playerToUpdate.nationalities,
                            "nationalityFlags" to playerToUpdate.nationalityFlags,
                            "age" to playerToUpdate.age,
                            "contractExpired" to playerToUpdate.contractExpired,
                            "positions" to playerToUpdate.positions,
                            "currentClub" to playerToUpdate.currentClub?.let {
                                mapOf(
                                    "clubName" to it.clubName,
                                    "clubLogo" to it.clubLogo,
                                    "clubTmProfile" to it.clubTmProfile,
                                    "clubCountry" to it.clubCountry
                                )
                            },
                            "marketValueHistory" to playerToUpdate.marketValueHistory?.map {
                                mapOf("value" to it.value, "date" to it.date)
                            },
                            "lastRefreshedAt" to playerToUpdate.lastRefreshedAt,
                            "isOnLoan" to playerToUpdate.isOnLoan,
                            "foot" to playerToUpdate.foot,
                            "agency" to playerToUpdate.agency,
                            "agencyUrl" to playerToUpdate.agencyUrl,
                            "noteList" to playerToUpdate.noteList?.map {
                                mapOf(
                                    "notes" to it.notes,
                                    "createBy" to it.createBy,
                                    "createByHe" to it.createByHe,
                                    "createdAt" to it.createdAt
                                )
                            },
                            "notes" to playerToUpdate.notes
                        ))
                    }
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
            // For Men, document storage key is tmProfile; for Women/Youth, use Firestore doc ID
            val storageKey = if (isNonMenPlatform) {
                _playerDocumentIdFlow.value ?: return@launch
            } else {
                player.tmProfile ?: return@launch
            }
            _isUploadingDocumentFlow.value = true
            try {
                // ── GPS Report pre-check ───────────────────────────────────
                val isPdf = mimeType?.lowercase() == "application/pdf" || name.lowercase().endsWith(".pdf")
                if (isPdf) {
                    val pdfText = withContext(Dispatchers.IO) {
                        try {
                            val doc = com.tom_roush.pdfbox.pdmodel.PDDocument.load(java.io.ByteArrayInputStream(bytes))
                            val text = com.tom_roush.pdfbox.text.PDFTextStripper().getText(doc)
                            doc.close()
                            text
                        } catch (_: Exception) { "" }
                    }
                    if (com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsPdfParser.isGpsReport(pdfText)) {
                        Log.i(TAG, "GPS report detected — uploading as GPS_DATA and parsing")
                        // Build name: GPS_PlayerName_FirstDate_to_LastDate.pdf
                        val dateRegex = Regex("""\d{2}/\d{2}/\d{4}""")
                        val allDates = dateRegex.findAll(pdfText).map { it.value }.toList()
                        val firstDate = allDates.firstOrNull()?.replace("/", "-") ?: ""
                        val lastDate = allDates.lastOrNull()?.replace("/", "-") ?: ""
                        val dateStr = if (firstDate.isNotEmpty() && lastDate.isNotEmpty() && firstDate != lastDate) {
                            "${firstDate}_to_${lastDate}"
                        } else firstDate
                        val safeName = player.fullName?.replace(Regex("[^a-zA-Z0-9 ]"), "")?.replace(" ", "_") ?: ""
                        val gpsName = listOf("GPS", safeName, dateStr).filter { it.isNotEmpty() }.joinToString("_") + ".pdf"
                        val bytesToUpload = withContext(Dispatchers.IO) { PdfFlattener.flatten(bytes) }
                        val storageUrl = documentsRepository.uploadBytesToStorage(storageKey, gpsName, bytesToUpload)

                        // GPS uploads: don't delete existing docs — each file is a separate match report.
                        // GpsMatchData dedup (in processGpsDocument) handles preventing data duplicates.

                        val docResult = SharedCallables.playerDocumentsCreate(
                            platform = platformManager.value,
                            playerRefId = storageKey,
                            type = DocumentType.GPS_DATA.name,
                            name = gpsName,
                            storageUrl = storageUrl,
                            playerName = player.fullName,
                            playerImage = player.profileImage,
                            agentName = getCurrentUserName()
                        )
                        // Parse GPS data in background (don't block upload completion)
                        processGpsDocument(bytes, mimeType, storageUrl, docResult)
                        return@launch
                    }
                }
                // ── Standard document detection ────────────────────────────
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
                        savePassportDetailsToPlayer(storageKey, passportDetails)
                    }
                    detection.documentType == DocumentType.PASSPORT && detection.passportInfo == null -> {
                        Log.w(TAG, "Passport detected but MRZ parsing failed - could not extract name, DOB, or passport number")
                    }
                    detection.documentType != DocumentType.PASSPORT -> {
                        Log.w(TAG, "Document not detected as passport (type: ${detection.documentType})")
                    }
                }
                // ── GPS_DATA from Gemini vision fallback ──────────────────
                if (detection.documentType == DocumentType.GPS_DATA) {
                    Log.i(TAG, "GPS report detected via Gemini vision — uploading as GPS_DATA and parsing")
                    val gpsName = detection.suggestedName
                    val bytesToUpload = if (isPdf) {
                        withContext(Dispatchers.IO) { PdfFlattener.flatten(bytes) }
                    } else bytes
                    val storageUrl = documentsRepository.uploadBytesToStorage(storageKey, gpsName, bytesToUpload)

                    // GPS uploads: don't delete existing docs — each file is a separate match report.
                    // GpsMatchData dedup (in processGpsDocument) handles preventing data duplicates.

                    val docResult = SharedCallables.playerDocumentsCreate(
                        platform = platformManager.value,
                        playerRefId = storageKey,
                        type = DocumentType.GPS_DATA.name,
                        name = gpsName,
                        storageUrl = storageUrl,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        agentName = getCurrentUserName()
                    )
                    // Parse GPS data in background (don't block upload completion)
                    processGpsDocument(bytes, mimeType, storageUrl, docResult)
                    return@launch
                }

                val docExpiresAt = detection.mandateExpiresAt ?: expiresAt
                val createdBy = getCurrentUserName()
                val uploadedBy = if (detection.documentType == DocumentType.MANDATE) createdBy else null
                // Flatten PDFs so annotations (signatures, stamps) are visible in all viewers
                val bytesToUpload = if (isPdf) {
                    withContext(Dispatchers.IO) { PdfFlattener.flatten(bytes) }
                } else bytes
                // Upload bytes to Storage (client-side), then create Firestore entry via callable
                val storageUrl = documentsRepository.uploadBytesToStorage(storageKey, detection.suggestedName, bytesToUpload)
                SharedCallables.playerDocumentsCreate(
                    platform = platformManager.value,
                    playerRefId = storageKey,
                    type = detection.documentType.name,
                    name = detection.suggestedName,
                    storageUrl = storageUrl,
                    expiresAt = docExpiresAt,
                    validLeagues = detection.validLeagues.takeIf { it.isNotEmpty() },
                    uploadedBy = uploadedBy,
                    playerName = player.fullName,
                    playerImage = player.profileImage,
                    agentName = createdBy
                )
            } finally {
                _isUploadingDocumentFlow.value = false
            }
        }
    }

    override fun deleteDocument(documentId: String, isPassport: Boolean) {
        viewModelScope.launch {
            _deletingDocIdFlow.value = documentId
            try {
                val docId = _playerDocumentIdFlow.value
                SharedCallables.playerDocumentsDelete(
                    platform = platformManager.value,
                    documentId = documentId,
                    clearPassport = isPassport,
                    playerId = docId
                )
            } finally {
                _deletingDocIdFlow.value = null
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
            _isMarkingOfferedFlow.value = true
            try {
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
            } finally {
                _isMarkingOfferedFlow.value = false
            }
        }
    }

    override fun updateClubFeedback(offerId: String, clubFeedback: String?) {
        viewModelScope.launch {
            _isSavingFeedbackFlow.value = true
            try {
                offersRepository.updateClubFeedback(offerId, clubFeedback)
            } finally {
                _isSavingFeedbackFlow.value = false
            }
        }
    }

    override fun updateHistorySummary(offerId: String, summary: String?) {
        viewModelScope.launch {
            _isSavingSummaryFlow.value = true
            try {
                offersRepository.updateHistorySummary(offerId, summary)
            } finally {
                _isSavingSummaryFlow.value = false
            }
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
        viewModelScope.launch(Dispatchers.IO) {
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
        withContext(Dispatchers.IO) {
            try {
                val docId = _playerDocumentIdFlow.value ?: return@withContext
                SharedCallables.playersUpdate(platformManager.value, docId, emptyMap(), deleteFields = listOf("passportDetails"))
                _playerInfoFlow.update { it?.copy(passportDetails = null) }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear passport details", e)
            }
        }
    }

    private suspend fun savePassportDetailsToPlayer(tmProfile: String, passportDetails: PassportDetails) {
        withContext(Dispatchers.IO) {
            try {
                val docId = _playerDocumentIdFlow.value ?: return@withContext
                SharedCallables.playersUpdate(platformManager.value, docId, mapOf("passportDetails" to mapOf(
                    "firstName" to passportDetails.firstName,
                    "lastName" to passportDetails.lastName,
                    "dateOfBirth" to passportDetails.dateOfBirth,
                    "passportNumber" to passportDetails.passportNumber,
                    "nationality" to passportDetails.nationality,
                    "lastUpdatedAt" to passportDetails.lastUpdatedAt
                )))
                _playerInfoFlow.update { it?.copy(passportDetails = passportDetails) }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save passport details", e)
            }
        }
    }

    // ── Highlights search & pin ─────────────────────────────────────────

    override fun searchHighlights(player: Player, refresh: Boolean) {
        val name = player.fullName ?: return
        viewModelScope.launch {
            _isHighlightsLoading.value = true
            _highlightsError.value = null
            try {
                val response = highlightsApiClient.searchHighlights(
                    playerName = name,
                    teamName = player.currentClub?.clubName,
                    position = player.positions?.firstOrNull(),
                    refresh = refresh,
                    parentClub = if (player.isOnLoan) player.onLoanFromClub else null,
                    nationality = player.nationality,
                    fullNameHe = player.fullNameHe,
                    clubCountry = player.currentClub?.clubCountry
                )
                _highlightVideosFlow.value = response.videos
                if (response.error != null) _highlightsError.value = response.error
            } catch (e: Exception) {
                Log.e(TAG, "searchHighlights failed", e)
                _highlightsError.value = e.message
            } finally {
                _isHighlightsLoading.value = false
                _highlightsHasFetched.value = true
            }
        }
    }

    override fun savePinnedHighlights(videos: List<com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightVideo>) {
        val docId = _playerDocumentIdFlow.value ?: return
        viewModelScope.launch {
            _isHighlightsSaving.value = true
            try {
                SharedCallables.playersUpdate(
                    platformManager.value,
                    docId,
                    mapOf("pinnedHighlights" to videos.take(com.liordahan.mgsrteam.features.players.playerinfo.highlights.HighlightsApiClient.MAX_PINNED).map { v ->
                        hashMapOf(
                            "id" to v.id,
                            "source" to v.source,
                            "title" to v.title,
                            "thumbnailUrl" to v.thumbnailUrl,
                            "embedUrl" to v.embedUrl,
                            "channelName" to v.channelName,
                            "publishedAt" to v.publishedAt,
                            "durationSeconds" to v.durationSeconds,
                            "viewCount" to v.viewCount
                        )
                    })
                )
                // Update local state — Firestore listener will update pinnedHighlights on the model
            } catch (e: Exception) {
                Log.e(TAG, "savePinnedHighlights failed", e)
            } finally {
                _isHighlightsSaving.value = false
            }
        }
    }

    override fun saveYouthHighlights(highlights: List<com.liordahan.mgsrteam.features.players.models.PinnedHighlight>) {
        val docId = _playerDocumentIdFlow.value ?: return
        viewModelScope.launch {
            _isHighlightsSaving.value = true
            try {
                SharedCallables.playersUpdate(
                    platformManager.value,
                    docId,
                    mapOf("pinnedHighlights" to highlights.map { v ->
                        hashMapOf(
                            "id" to v.id,
                            "source" to v.source,
                            "title" to v.title,
                            "thumbnailUrl" to v.thumbnailUrl,
                            "embedUrl" to v.embedUrl,
                            "channelName" to (v.channelName ?: ""),
                            "viewCount" to (v.viewCount ?: 0L)
                        )
                    })
                )
            } catch (e: Exception) {
                Log.e(TAG, "saveYouthHighlights failed", e)
            } finally {
                _isHighlightsSaving.value = false
            }
        }
    }

    // ── FM Intelligence ─────────────────────────────────────────────────

    override fun fetchFmIntelligence(player: Player) {
        val name = player.fullName ?: return
        if (_fmIntelligenceFlow.value != null) return // already fetched
        viewModelScope.launch {
            _isFmIntelligenceLoading.value = true
            _fmIntelligenceError.value = null
            try {
                val json = withContext(Dispatchers.IO) {
                    scoutApiClient.getFmIntelligence(
                        playerName = name,
                        club = player.currentClub?.clubName,
                        age = player.age?.toString()
                    )
                }
                if (json != null) {
                    _fmIntelligenceFlow.value = com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence.parseFmIntelligenceData(json)
                } else {
                    _fmIntelligenceError.value = "FM data not available"
                }
            } catch (e: Exception) {
                Log.e(TAG, "fetchFmIntelligence failed", e)
                _fmIntelligenceError.value = e.message
            } finally {
                _isFmIntelligenceLoading.value = false
            }
        }
    }

    // ── Player Stats (API-Football) ─────────────────────────────────────

    override fun fetchPlayerStats(playerTmProfile: String) {
        if (_playerStatsFlow.value != null) return // already fetched
        viewModelScope.launch {
            _isPlayerStatsLoading.value = true
            _playerStatsError.value = null
            try {
                val result = playerStatsApiClient.getPlayerStats(playerTmProfile)
                _playerStatsFlow.value = result
                if (result == null) {
                    _playerStatsError.value = "Stats not available"
                }
            } catch (e: Exception) {
                Log.e(TAG, "fetchPlayerStats failed", e)
                _playerStatsError.value = e.message
            } finally {
                _isPlayerStatsLoading.value = false
            }
        }
    }

    // ── GPS Performance ─────────────────────────────────────────────────

    private var gpsListenerRegistration: ListenerRegistration? = null
    private var gpsInsightsListenerRegistration: ListenerRegistration? = null

    /**
     * Starts a Firestore listener for GPS match data linked to this player.
     * Called once the player's TM profile / doc ID is known.
     */
    private fun startGpsListener(playerTmProfile: String) {
        gpsListenerRegistration?.remove()
        val store = com.google.firebase.firestore.FirebaseFirestore.getInstance()
        gpsListenerRegistration = store.collection("GpsMatchData")
            .whereEqualTo("playerTmProfile", playerTmProfile)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Log.e(TAG, "GPS listener error", error)
                    return@addSnapshotListener
                }
                val matches = snapshot?.documents?.mapNotNull { doc ->
                    doc.toObject(com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsMatchData::class.java)
                        ?.copy(id = doc.id)
                }?.sortedByDescending { it.matchDate ?: 0L } ?: emptyList()

                _gpsMatchDataFlow.value = matches
                val summary = com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsAnalyzer.buildSummary(matches)
                _gpsSummaryFlow.value = summary
            }

        // Listen to server-computed insights (bilingual, position-aware)
        val safeId = playerTmProfile.replace(Regex("[/\\\\]"), "_")
        gpsInsightsListenerRegistration?.remove()
        gpsInsightsListenerRegistration = store.collection("GpsPlayerInsights").document(safeId)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    Log.e(TAG, "GPS insights listener error", err)
                    return@addSnapshotListener
                }
                if (snap != null && snap.exists()) {
                    val isHebrew = java.util.Locale.getDefault().language == "he" || java.util.Locale.getDefault().language == "iw"
                    val rawInsights = snap.get("insights") as? List<*> ?: emptyList<Any>()
                    val parsed = rawInsights.mapNotNull { raw ->
                        val map = raw as? Map<*, *> ?: return@mapNotNull null
                        val type = when ((map["type"] as? String)?.lowercase()) {
                            "strength" -> com.liordahan.mgsrteam.features.players.playerinfo.gps.InsightType.STRENGTH
                            "weakness" -> com.liordahan.mgsrteam.features.players.playerinfo.gps.InsightType.WEAKNESS
                            else -> return@mapNotNull null
                        }
                        com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsInsight(
                            type = type,
                            title = if (isHebrew) (map["titleHe"] as? String ?: "") else (map["titleEn"] as? String ?: ""),
                            description = if (isHebrew) (map["descriptionHe"] as? String ?: "") else (map["descriptionEn"] as? String ?: ""),
                            value = map["value"] as? String ?: "",
                            benchmark = map["benchmark"] as? String
                        )
                    }
                    _gpsInsightsFlow.value = parsed
                } else {
                    // Fallback to local analysis if no server insights yet
                    _gpsInsightsFlow.value = com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsAnalyzer.analyze(_gpsMatchDataFlow.value)
                }
            }
    }

    /**
     * Process an uploaded GPS PDF: parse with Gemini, find this player's row,
     * and write GpsMatchData to Firestore.
     */
    override fun processGpsDocument(bytes: ByteArray, mimeType: String?, storageUrl: String, documentId: String?) {
        val player = _playerInfoFlow.value ?: return
        val playerName = player.fullName ?: return
        val storageKey = player.tmProfile ?: _playerDocumentIdFlow.value ?: return

        viewModelScope.launch {
            _isGpsLoading.value = true
            try {
                val report = withContext(Dispatchers.IO) {
                    com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsPdfParser.parseFromBytes(bytes, mimeType)
                } ?: run {
                    Log.w(TAG, "GPS parsing returned null — could not parse PDF")
                    return@launch
                }

                // Single-player report: each row is a match, not a player — use all rows directly
                val isSinglePlayer = report.isSinglePlayerReport
                val allRows = if (isSinglePlayer) {
                    Log.i(TAG, "Single-player report: ${report.players.size} matches for '$playerName'")
                    report.players
                } else {
                    // Find this player's rows in the report (may be multiple for multi-match reports)
                    val rows = com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsPdfParser.findAllPlayerRows(report, playerName)
                    if (rows.isEmpty()) {
                        Log.w(TAG, "Player '$playerName' not found in GPS report with ${report.players.size} players")
                        return@launch
                    }
                    rows
                }

                Log.i(TAG, "Found ${allRows.size} GPS match rows for '$playerName'")

                val store = com.google.firebase.firestore.FirebaseFirestore.getInstance()
                val sdf = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.US)

                for (playerRow in allRows) {
                    // Use per-row matchDate if available, else fall back to report-level
                    val rowDateStr = playerRow.perRowMatchDate ?: report.matchDateStr
                    val rowDateMs = if (!playerRow.perRowMatchDate.isNullOrEmpty()) {
                        try { sdf.parse(playerRow.perRowMatchDate)?.time } catch (_: Exception) { null }
                    } else report.matchDate

                    // For single-player reports, each row's "playerName" is actually the match title
                    val rowMatchTitle = if (isSinglePlayer) {
                        playerRow.playerName.ifEmpty { report.matchTitle ?: "" }
                    } else {
                        report.matchTitle ?: ""
                    }

                    val matchData = playerRow.toGpsMatchData(
                        playerTmProfile = storageKey,
                        matchTitle = rowMatchTitle,
                        matchDate = rowDateMs,
                        matchDateStr = rowDateStr,
                        documentId = documentId,
                        storageUrl = storageUrl,
                        teamAvgDist = report.teamAverageTotalDist,
                        teamAvgMeterage = report.teamAverageMeteragePerMin,
                        teamAvgHI = report.teamAverageHighIntensityRuns,
                        teamAvgSprints = report.teamAverageSprints,
                        teamAvgMaxVel = report.teamAverageMaxVelocity
                    )

                    // Check for duplicate (same player + same match date + same match title) — replace if exists
                    val existingQuery = store.collection("GpsMatchData")
                        .whereEqualTo("playerTmProfile", storageKey)
                    val existing = withContext(Dispatchers.IO) {
                        var q = existingQuery
                        if (!rowDateStr.isNullOrEmpty()) q = q.whereEqualTo("matchDateStr", rowDateStr)
                        if (rowMatchTitle.isNotEmpty()) q = q.whereEqualTo("matchTitle", rowMatchTitle)
                        q.get().await()
                    }

                    // Write to Firestore
                    val dataMap = hashMapOf<String, Any?>(
                        "playerTmProfile" to matchData.playerTmProfile,
                        "playerName" to if (isSinglePlayer) playerName else matchData.playerName,
                        "matchTitle" to rowMatchTitle,
                        "matchDate" to matchData.matchDate,
                        "matchDateStr" to matchData.matchDateStr,
                        "documentId" to matchData.documentId,
                        "storageUrl" to matchData.storageUrl,
                        "totalDuration" to matchData.totalDuration,
                        "totalDistance" to matchData.totalDistance,
                        "highMpEffsDist" to matchData.highMpEffsDist,
                        "highMpEffs" to matchData.highMpEffs,
                        "meteragePerMinute" to matchData.meteragePerMinute,
                        "accelerations" to matchData.accelerations,
                        "decelerations" to matchData.decelerations,
                        "highIntensityRuns" to matchData.highIntensityRuns,
                        "sprints" to matchData.sprints,
                        "maxVelocity" to matchData.maxVelocity,
                        "adEffs" to matchData.adEffs,
                        "hiDistTotal" to matchData.hiDistTotal,
                        "hiDistPercent" to matchData.hiDistPercent,
                        "sprintDistTotal" to matchData.sprintDistTotal,
                        "sprintDistPercent" to matchData.sprintDistPercent,
                        "isStarTotalDist" to matchData.isStarTotalDist,
                        "isStarHighMpEffsDist" to matchData.isStarHighMpEffsDist,
                        "isStarHighMpEffs" to matchData.isStarHighMpEffs,
                        "isStarMeteragePerMin" to matchData.isStarMeteragePerMin,
                        "isStarAccelerations" to matchData.isStarAccelerations,
                        "isStarHighIntensityRuns" to matchData.isStarHighIntensityRuns,
                        "isStarSprints" to matchData.isStarSprints,
                        "isStarMaxVelocity" to matchData.isStarMaxVelocity,
                        "teamAverageTotalDist" to matchData.teamAverageTotalDist,
                        "teamAverageMeteragePerMin" to matchData.teamAverageMeteragePerMin,
                        "teamAverageHighIntensityRuns" to matchData.teamAverageHighIntensityRuns,
                        "teamAverageSprints" to matchData.teamAverageSprints,
                        "teamAverageMaxVelocity" to matchData.teamAverageMaxVelocity,
                        "createdAt" to System.currentTimeMillis()
                    )
                    withContext(Dispatchers.IO) {
                        if (!existing.isEmpty) {
                            val existingId = existing.documents.first().id
                            dataMap["updatedAt"] = System.currentTimeMillis()
                            store.collection("GpsMatchData").document(existingId).update(dataMap as Map<String, Any>).await()
                            Log.i(TAG, "GPS data replaced for $playerName — $rowDateStr -> $existingId")
                        } else {
                            store.collection("GpsMatchData").add(dataMap).await()
                            Log.i(TAG, "GPS data saved for $playerName — $rowDateStr")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "processGpsDocument failed", e)
            } finally {
                _isGpsLoading.value = false
            }
        }
    }

    override suspend fun createShareUrl(
        player: Player,
        playerDocId: String,
        documents: List<PlayerDocument>,
        scoutReport: String?,
        lang: String,
        includePlayerContact: Boolean,
        includeAgencyContact: Boolean
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val mandateDoc = documents
                .filter { it.documentType == DocumentType.MANDATE && !it.expired }
                .maxByOrNull { it.expiresAt ?: 0L }
            val mandateExpiry = mandateDoc?.expiresAt?.takeIf { it >= System.currentTimeMillis() }
            val hasValidMandate = documents.any {
                it.documentType == DocumentType.MANDATE &&
                    !it.expired &&
                    (it.expiresAt == null || it.expiresAt >= System.currentTimeMillis())
            }

            val currentAccount = getCurrentUserAccount()
            val sharerPhone = currentAccount?.phone?.takeIf { it.isNotBlank() }
                ?: player.getAgentPhoneNumber()
            val sharerName = currentAccount?.let { acc ->
                if (lang == "he") (acc.hebrewName ?: acc.name) else (acc.name ?: acc.hebrewName)
            }?.takeIf { it.isNotBlank() }

            val playerMap = hashMapOf<String, Any?>(
                    "fullName" to player.fullName,
                    "fullNameHe" to player.fullNameHe,
                    "profileImage" to player.profileImage,
                    "positions" to player.positions,
                    "marketValue" to player.marketValue,
                    "currentClub" to player.currentClub?.let { c ->
                        hashMapOf(
                            "clubName" to c.clubName,
                            "clubLogo" to c.clubLogo,
                            "clubCountry" to c.clubCountry
                        )
                    },
                    "age" to player.age,
                    "height" to player.height,
                    "nationality" to player.nationality,
                    "contractExpired" to player.contractExpired,
                    "tmProfile" to player.tmProfile
                )
            if (includePlayerContact) {
                val playerPhone = player.playerPhoneNumber?.takeIf { it.isNotBlank() }
                if (playerPhone != null) playerMap["playerPhoneNumber"] = playerPhone
            }
            if (includeAgencyContact) {
                val agentPhone = player.agentPhoneNumber?.takeIf { it.isNotBlank() }
                if (agentPhone != null) playerMap["agentPhoneNumber"] = agentPhone
            }

            val mandateUrl = mandateDoc?.storageUrl?.takeIf { it.isNotBlank() }
            val platformStr = when (platformManager.current.value) {
                Platform.WOMEN -> "women"
                Platform.YOUTH -> "youth"
                else -> "men"
            }

            val shareData = hashMapOf<String, Any?>(
                "playerId" to playerDocId,
                "player" to playerMap,
                "mandateInfo" to hashMapOf(
                    "hasMandate" to hasValidMandate,
                    "expiresAt" to mandateExpiry
                ),
                "mandateUrl" to mandateUrl,
                "scoutReport" to (scoutReport?.takeIf { it.isNotBlank() }
                    ?: fetchShareScoutReport(player, lang)
                    ?: buildScoutSummary(player)),
                "createdAt" to System.currentTimeMillis(),
                "lang" to (lang.takeIf { it in listOf("he", "en") } ?: "en"),
                "platform" to platformStr,
                "sharerPhone" to sharerPhone,
                "sharerName" to sharerName,
                "includePlayerContact" to includePlayerContact,
                "includeAgencyContact" to includeAgencyContact,
                "highlights" to player.pinnedHighlights
                    ?.takeIf { it.isNotEmpty() }
                    ?.map { h ->
                        hashMapOf(
                            "id" to h.id,
                            "source" to h.source,
                            "title" to h.title,
                            "thumbnailUrl" to h.thumbnailUrl,
                            "embedUrl" to h.embedUrl,
                            "channelName" to (h.channelName?.takeIf { it.isNotBlank() }),
                            "viewCount" to h.viewCount
                        )
                    }
            )

            // ── GPS data for shared view (strengths only) ─────────────
            val gpsMatches = _gpsMatchDataFlow.value
            if (gpsMatches.isNotEmpty()) {
                val summary = com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsAnalyzer.buildSummary(gpsMatches)
                // Use server-computed insights (already in English for share)
                val currentInsights = _gpsInsightsFlow.value
                val strengths = currentInsights.filter { it.type == com.liordahan.mgsrteam.features.players.playerinfo.gps.InsightType.STRENGTH }
                val gpsDocUrls = documents.filter { it.documentType == DocumentType.GPS_DATA }
                    .mapNotNull { it.storageUrl }

                shareData["gpsData"] = hashMapOf(
                    "matchCount" to (summary?.matchCount ?: 0),
                    "totalMinutesPlayed" to (summary?.totalMinutesPlayed ?: 0),
                    "avgTotalDistance" to (summary?.avgTotalDistance ?: 0),
                    "avgMeteragePerMinute" to (summary?.avgMeteragePerMinute ?: 0),
                    "avgHighIntensityRuns" to (summary?.avgHighIntensityRuns ?: 0),
                    "avgSprints" to (summary?.avgSprints ?: 0),
                    "peakMaxVelocity" to (summary?.peakMaxVelocity ?: 0.0),
                    "avgMaxVelocity" to (summary?.avgMaxVelocity ?: 0.0),
                    "totalStars" to (summary?.totalStars ?: 0),
                    "strengths" to strengths.map { s ->
                        hashMapOf(
                            "title" to s.title,
                            "description" to s.description,
                            "value" to s.value,
                            "benchmark" to s.benchmark
                        )
                    },
                    "documentUrls" to gpsDocUrls
                )
            }

            // ── Family status for shared view ──────────────────────────
            if (player.isMarried || player.kidsCount > 0) {
                shareData["familyStatus"] = hashMapOf(
                    "isMarried" to player.isMarried,
                    "kidsCount" to player.kidsCount
                )
            }

            val token = SharedCallables.sharePlayerCreate(shareData)

            val baseUrl = com.liordahan.mgsrteam.BuildConfig.MGSR_WEB_URL.trimEnd('/')
            Result.success("$baseUrl/p/$token")
        } catch (e: Exception) {
            Log.e(TAG, "createShareUrl failed", e)
            Result.failure(e)
        }
    }

    private val shareHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Calls the web API to generate a full AI scout report for sharing.
     * Returns the report text, or null on failure (caller falls back to buildScoutSummary).
     */
    private fun fetchShareScoutReport(player: Player, lang: String): String? {
        return try {
            val platform = when (platformManager.current.value) {
                Platform.WOMEN -> "women"
                Platform.YOUTH -> "youth"
                else -> "men"
            }
            val playerJson = JSONObject().apply {
                put("fullName", player.fullName ?: "")
                put("fullNameHe", player.fullNameHe ?: "")
                put("profileImage", player.profileImage ?: "")
                put("positions", JSONArray(player.positions?.filterNotNull() ?: emptyList<String>()))
                put("marketValue", player.marketValue ?: "")
                player.currentClub?.let { c ->
                    put("currentClub", JSONObject().apply {
                        put("clubName", c.clubName ?: "")
                        put("clubLogo", c.clubLogo ?: "")
                        put("clubCountry", c.clubCountry ?: "")
                    })
                }
                put("age", player.age?.toString() ?: "")
                put("height", player.height ?: "")
                put("nationality", player.nationality ?: "")
                put("contractExpired", player.contractExpired ?: "")
                put("foot", player.foot ?: "")
                put("tmProfile", player.tmProfile ?: "")
            }
            val body = JSONObject().apply {
                put("player", playerJson)
                put("lang", lang)
                put("platform", platform)
            }
            val baseUrl = com.liordahan.mgsrteam.BuildConfig.MGSR_WEB_URL.trimEnd('/')
            val request = Request.Builder()
                .url("$baseUrl/api/share/generate-scout-report")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()
            val response = shareHttpClient.newCall(request).execute()
            if (!response.isSuccessful) {
                Log.w(TAG, "Share scout report API returned ${response.code}")
                return null
            }
            val responseBody = response.body?.string() ?: return null
            val json = JSONObject(responseBody)
            val report = json.optString("scoutReport", "").trim()
            if (report.isNotBlank()) {
                Log.i(TAG, "Generated share scout report (${report.length} chars)")
                report
            } else null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to generate share scout report, falling back to summary", e)
            null
        }
    }

    private fun buildScoutSummary(player: Player): String {
        val parts = mutableListOf<String>()
        if (player.age != null) parts.add("${player.age}yo")
        player.positions?.firstOrNull()?.let { parts.add(it ?: "") }
        player.marketValue?.let { parts.add(it) }
        player.currentClub?.clubName?.let { parts.add(it) }
        player.nationality?.let { parts.add(it) }
        return parts.filter { it.isNotBlank() }.joinToString(" • ")
    }

    private suspend fun getCurrentUserAccount(): Account? = withContext(Dispatchers.IO) {
        try {
            val snapshot =
                firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get()
                    .await()
            val accounts = snapshot.toObjects(Account::class.java)
            accounts.firstOrNull {
                it.email?.equals(
                    firebaseHandler.firebaseAuth.currentUser?.email,
                    ignoreCase = true
                ) == true
            }
        } catch (e: Exception) {
            null
        }
    }

    private suspend fun getCurrentUserName(): String? =
        getCurrentUserAccount()?.getDisplayName(appContext)

    // ── Agent Transfer Operations ────────────────────────────────────

    /** Start listening for pending transfer requests on the current player. */
    private fun startTransferListener(playerId: String) {
        transferListenerRegistration?.remove()
        transferListenerRegistration = agentTransferRepository.listenForPendingRequest(playerId) { request ->
            _pendingTransferFlow.value = request
        }
    }

    /** Start listening for resolved (approved/rejected) transfer requests. */
    private fun startResolvedTransferListener(playerId: String) {
        resolvedTransferListenerRegistration?.remove()
        resolvedTransferListenerRegistration = agentTransferRepository.listenForResolvedTransfer(playerId) { request ->
            _resolvedTransferFlow.value = request
        }
    }

    override fun requestAgentTransfer() {
        viewModelScope.launch {
            _isRequestingTransferFlow.value = true
            try {
                val player = _playerInfoFlow.value ?: return@launch
                val docId = _playerDocumentIdFlow.value ?: return@launch
                val currentUser = _currentUserAccountFlow.value ?: getCurrentUserAccount() ?: return@launch
                // Allow empty fromAgentId — cloud function uses name fallback
                val fromAgentId = player.agentInChargeId ?: ""
                val fromAgentName = player.agentInChargeName

                val result = agentTransferRepository.requestTransfer(
                    playerId = docId,
                    playerName = player.fullName,
                    playerImage = player.profileImage,
                    platform = platformManager.value,
                    fromAgentId = fromAgentId,
                    fromAgentName = fromAgentName,
                    toAgentId = currentUser.id ?: return@launch,
                    toAgentName = currentUser.getDisplayName(appContext)
                )
                if (result != null) {
                    _transferSuccessFlow.emit("request_sent")
                } else {
                    _transferSuccessFlow.emit("request_already_pending")
                }
            } finally {
                _isRequestingTransferFlow.value = false
            }
        }
    }

    override fun approveTransfer() {
        viewModelScope.launch {
            val request = _pendingTransferFlow.value ?: return@launch
            val requestId = request.id ?: return@launch
            _transferLoadingFlow.value = true
            try {
                agentTransferRepository.approveTransfer(requestId, platformManager.value)
                _transferSuccessFlow.emit("transfer_approved")
            } catch (e: Exception) {
                Log.e(TAG, "approveTransfer failed", e)
            } finally {
                _transferLoadingFlow.value = false
            }
        }
    }

    override fun rejectTransfer() {
        viewModelScope.launch {
            val request = _pendingTransferFlow.value ?: return@launch
            val requestId = request.id ?: return@launch
            _transferLoadingFlow.value = true
            try {
                agentTransferRepository.rejectTransfer(requestId)
                _transferSuccessFlow.emit("transfer_rejected")
            } catch (e: Exception) {
                Log.e(TAG, "rejectTransfer failed", e)
            } finally {
                _transferLoadingFlow.value = false
            }
        }
    }

    override fun cancelTransferRequest() {
        viewModelScope.launch {
            val request = _pendingTransferFlow.value ?: return@launch
            val requestId = request.id ?: return@launch
            try {
                agentTransferRepository.cancelTransferRequest(requestId)
                _transferSuccessFlow.emit("request_cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "cancelTransferRequest failed", e)
            }
        }
    }
}
