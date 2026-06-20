package com.liordahan.mgsrteam.features.releases

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.liordahan.mgsrteam.firebase.SharedCallables
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.ScrapingCacheRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.transfermarket.convertLongPositionNameToShort
import com.liordahan.mgsrteam.transfermarket.LatestReleases
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.utils.extractPlayerIdFromUrl
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class ReleasesUiState(
    val releasesList: List<LatestTransferModel> = emptyList(),
    val visibleList: List<LatestTransferModel> = emptyList(),
    val releaseAddedAtByUrl: Map<String, Long> = emptyMap(),
    val isLoading: Boolean = true,
    val showError: Boolean = false,
    val failedFetchError: String? = null,
    val playersCount: Map<String, Int> = emptyMap()
)

data class ReleasesRefreshUiState(
    val isRefreshing: Boolean = false,
    val lastError: String? = null,
    val lastSuccessAt: Long? = null,
)

abstract class IReleasesViewModel : ViewModel() {
    abstract val releasesFlow: StateFlow<ReleasesUiState>
    abstract val selectedPositionFlow: StateFlow<Position?>
    abstract val positionsFlow: StateFlow<List<Position>>
    abstract val refreshStateFlow: StateFlow<ReleasesRefreshUiState>

    abstract fun selectPosition(position: Position?)
    abstract fun triggerManualRefresh()
}

class ReleasesViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val latestReleases: LatestReleases,
    private val scrapingCacheRepository: ScrapingCacheRepository,
    private val playerSearch: PlayerSearch
) : IReleasesViewModel() {

    companion object {
        private const val NOTIFICATION_MIN_MARKET_VALUE = 150_000L
        private const val NOTIFICATION_MAX_MARKET_VALUE = 4_000_000L
        private const val NOTIFICATION_MAX_AGE = 33
        private const val MANUAL_REFRESH_STATUS_POLL_MS = 5_000L
        private const val MANUAL_REFRESH_MAX_WAIT_MS = 45L * 60L * 1000L
    }

    private val releaseRanges = listOf(
        125000..250000,
        250001..400000,
        400001..600000,
        600001..800000,
        800001..1000000,
        1000001..1200000,
        1200001..1400000,
        1400001..1600000,
        1600001..1800000,
        1800000..2000000,
        2000000..2200000,
    )

    private val totalRangeCount = releaseRanges.size
    private val fetchedCount = MutableStateFlow(0)
    private val notificationReleasesFlow = MutableStateFlow<List<LatestTransferModel>>(emptyList())
    private val notificationAddedAtByUrlFlow = MutableStateFlow<Map<String, Long>>(emptyMap())
    private val notificationEventsFlow = MutableStateFlow<List<ReleaseFeedEvent>>(emptyList())
    private val profileMetaByUrlFlow = MutableStateFlow<Map<String, LatestTransferModel>>(emptyMap())
    private val notificationLoadedFlow = MutableStateFlow(false)
    private var feedEventsRegistration: ListenerRegistration? = null
    @Volatile
    private var cacheMetaByUrl: Map<String, LatestTransferModel> = emptyMap()
    @Volatile
    private var cacheMetaByPlayerId: Map<String, LatestTransferModel> = emptyMap()
    private val enrichingUrls = mutableSetOf<String>()
    private val enrichedUrls = mutableSetOf<String>()
    private val enrichmentAttempts = mutableMapOf<String, Int>()

    private val _selectedPositionFlow = MutableStateFlow<Position?>(null)
    override val selectedPositionFlow: StateFlow<Position?> = _selectedPositionFlow

    private val _positionsFlow = MutableStateFlow<List<Position>>(emptyList())
    override val positionsFlow: StateFlow<List<Position>> = _positionsFlow

    private val _refreshStateFlow = MutableStateFlow(ReleasesRefreshUiState())
    override val refreshStateFlow: StateFlow<ReleasesRefreshUiState> = _refreshStateFlow

    private val fetchFailedErrorFlow = MutableStateFlow<String?>(null)

    private val releaseFlowsMap: Map<IntRange, MutableStateFlow<List<LatestTransferModel>>> =
        releaseRanges.associateWith { MutableStateFlow(emptyList()) }

    override val releasesFlow: StateFlow<ReleasesUiState> = combine(
        releaseFlowsMap.values.toList() + fetchedCount + _selectedPositionFlow + fetchFailedErrorFlow + notificationReleasesFlow + notificationAddedAtByUrlFlow + notificationLoadedFlow
    ) { combined ->
        val releasesCount = releaseFlowsMap.size
        val fetched = combined[releasesCount] as Int
        val selectedPosition = combined[releasesCount + 1] as Position?
        val failedFetchError = combined[releasesCount + 2] as String?
        val notificationReleases = (combined[releasesCount + 3] as? List<*>)
            ?.filterIsInstance<LatestTransferModel>()
            .orEmpty()
        val notificationAddedAtByUrl = (combined[releasesCount + 4] as? Map<*, *>)
            ?.mapNotNull { (k, v) ->
                val key = k as? String ?: return@mapNotNull null
                val value = v as? Long ?: return@mapNotNull null
                key to value
            }
            ?.toMap()
            .orEmpty()
        val notificationLoaded = combined[releasesCount + 5] as Boolean

        val releasesLists =
            combined.take(releasesCount).filterIsInstance<List<LatestTransferModel>>()

        val baseList = notificationReleases.filter { it.isWithinNotificationLimits() }

        val sortedBaseList = baseList.sortedByDescending { it.getRealMarketValue() }
        val releaseAddedAtByUrl = notificationAddedAtByUrl

        ReleasesUiState(
            releasesList = sortedBaseList,
            visibleList = sortedBaseList.filterPlayersByPosition(selectedPosition)
                ?.sortedByDescending { it.getRealMarketValue() } ?: emptyList(),
            releaseAddedAtByUrl = releaseAddedAtByUrl,
            isLoading = !notificationLoaded,
            showError = notificationLoaded && notificationReleases.isEmpty(),
            failedFetchError = failedFetchError,
            playersCount = sortedBaseList
                .groupingBy { it.playerPosition ?: "" }
                .eachCount()
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ReleasesUiState()
    )

    init {
        loadReleasesCacheMeta()
        observeNotificationReleases()
        getAllPositions()
    }

    private fun loadReleasesCacheMeta() {
        viewModelScope.launch(Dispatchers.IO) {
            val cached = scrapingCacheRepository.getCachedPlayers("releases-all").orEmpty()
            cacheMetaByUrl = cached
                .filter { !it.playerUrl.isNullOrBlank() }
                .associateBy { it.playerUrl!! }
            cacheMetaByPlayerId = cached
                .filter { !it.playerUrl.isNullOrBlank() }
                .mapNotNull { model ->
                    val id = extractPlayerIdFromUrl(model.playerUrl) ?: return@mapNotNull null
                    id to model
                }
                .toMap()
            recomputeNotificationReleases()
        }
    }

    private fun observeNotificationReleases() {
        feedEventsRegistration?.remove()
        feedEventsRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.feedEventsTable)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .limit(1000)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    fetchFailedErrorFlow.value = error.localizedMessage
                    notificationLoadedFlow.value = true
                    return@addSnapshotListener
                }
                if (snapshot == null) {
                    notificationLoadedFlow.value = true
                    return@addSnapshotListener
                }

                val events = snapshot.documents
                    .mapNotNull { it.toReleaseEventOrNull() }
                    .filter {
                        it.type == "NEW_RELEASE_FROM_CLUB" &&
                            it.extraInfo == "NOT_IN_DATABASE" &&
                            !it.playerTmProfile.isNullOrBlank()
                    }

                val deduped = deduplicateReleaseEvents(events)
                notificationEventsFlow.value = deduped
                notificationAddedAtByUrlFlow.value = deduped
                    .mapNotNull { event ->
                        val url = event.playerTmProfile ?: return@mapNotNull null
                        url to (event.timestamp ?: 0L)
                    }
                    .toMap()
                recomputeNotificationReleases()
                maybeEnrichMissingProfiles()
                notificationLoadedFlow.value = true
            }
    }

    private fun recomputeNotificationReleases() {
        val profileMetaByUrl = profileMetaByUrlFlow.value
        notificationReleasesFlow.value = notificationEventsFlow.value.map { event ->
            val url = event.playerTmProfile.orEmpty()
            val playerId = extractPlayerIdFromUrl(url)
            val cacheMeta = cacheMetaByUrl[url] ?: playerId?.let { cacheMetaByPlayerId[it] }
            val profileMeta = profileMetaByUrl[url]
            LatestTransferModel(
                playerImage = firstMeaningful(event.playerImage, profileMeta?.playerImage, cacheMeta?.playerImage),
                playerName = firstMeaningful(event.playerName, profileMeta?.playerName, cacheMeta?.playerName),
                playerUrl = url,
                playerPosition = firstMeaningful(event.playerPosition, profileMeta?.playerPosition, cacheMeta?.playerPosition)
                    ?.convertLongPositionNameToShort(),
                playerAge = firstMeaningful(event.playerAge, profileMeta?.playerAge, cacheMeta?.playerAge),
                playerNationality = firstMeaningful(event.playerNationality, profileMeta?.playerNationality, cacheMeta?.playerNationality),
                playerNationalityFlag = firstMeaningful(event.playerNationalityFlag, profileMeta?.playerNationalityFlag, cacheMeta?.playerNationalityFlag),
                transferDate = firstMeaningful(event.transferDate, profileMeta?.transferDate, cacheMeta?.transferDate)
                    ?: event.timestamp?.let { formatTimestampDdMmYyyy(it) },
                marketValue = firstMeaningful(event.marketValue, profileMeta?.marketValue, cacheMeta?.marketValue)
            )
        }
    }

    private fun maybeEnrichMissingProfiles() {
        val currentReleases = notificationReleasesFlow.value
        currentReleases.forEach { release ->
            val url = release.playerUrl?.trim().orEmpty()
            if (url.isBlank()) return@forEach
            if (!needsProfileEnrichment(release)) return@forEach
            if (enrichedUrls.contains(url) || enrichingUrls.contains(url)) return@forEach
            val attempts = enrichmentAttempts[url] ?: 0
            if (attempts >= 2) return@forEach

            enrichingUrls.add(url)
            enrichmentAttempts[url] = attempts + 1
            viewModelScope.launch(Dispatchers.IO) {
                runCatching {
                    val details = playerSearch.getPlayerBasicInfo(
                        PlayerSearchModel(tmProfile = url, playerName = release.playerName)
                    )
                    val enrichedMeta = LatestTransferModel(
                        playerUrl = url,
                        playerPosition = details.positions?.firstOrNull()?.takeIf { !it.isNullOrBlank() },
                        playerAge = details.age,
                        playerNationality = details.nationality,
                        playerNationalityFlag = details.nationalityFlag,
                        transferDate = release.transferDate,
                        marketValue = details.marketValue,
                        playerImage = details.profileImage,
                        playerName = details.fullName
                    )

                    profileMetaByUrlFlow.update { it + (url to enrichedMeta) }
                    recomputeNotificationReleases()
                    persistEnrichmentToFeedEvents(url, enrichedMeta)
                    enrichedUrls.add(url)
                }
                enrichingUrls.remove(url)
            }
        }
    }

    private fun needsProfileEnrichment(release: LatestTransferModel): Boolean {
        return firstMeaningful(release.playerPosition).isNullOrBlank() ||
            firstMeaningful(release.marketValue).isNullOrBlank() ||
            firstMeaningful(release.playerAge).isNullOrBlank() ||
            firstMeaningful(release.playerNationality).isNullOrBlank()
    }

    private fun persistEnrichmentToFeedEvents(url: String, enrichedMeta: LatestTransferModel) {
        val eventIds = notificationEventsFlow.value
            .filter { it.playerTmProfile == url }
            .mapNotNull { it.id }
        if (eventIds.isEmpty()) return

        val fields = mutableMapOf<String, Any>()
        firstMeaningful(enrichedMeta.playerPosition)?.let { fields["playerPosition"] = it }
        firstMeaningful(enrichedMeta.marketValue)?.let { fields["marketValue"] = it }
        firstMeaningful(enrichedMeta.playerAge)?.let { fields["playerAge"] = it }
        firstMeaningful(enrichedMeta.playerNationality)?.let { fields["playerNationality"] = it }
        firstMeaningful(enrichedMeta.playerNationalityFlag)?.let { fields["playerNationalityFlag"] = it }
        firstMeaningful(enrichedMeta.playerImage)?.let { fields["playerImage"] = it }
        firstMeaningful(enrichedMeta.playerName)?.let { fields["playerName"] = it }
        if (fields.isEmpty()) return

        eventIds.forEach { eventId ->
            firebaseHandler.firebaseStore
                .collection(firebaseHandler.feedEventsTable)
                .document(eventId)
                .set(fields, SetOptions.merge())
        }
    }

    private fun fetchAllReleases() {
        releaseRanges.forEach { range ->
            viewModelScope.launch(Dispatchers.IO) {
                when (val result = latestReleases.getLatestReleases(range.first, range.last)) {
                    is TransfermarktResult.Success -> releaseFlowsMap[range]?.value = result.data.filterNotNull()
                    is TransfermarktResult.Failed -> fetchFailedErrorFlow.value = result.cause
                }
                fetchedCount.update { it + 1 }
            }
        }
    }

    private fun List<LatestTransferModel>?.filterPlayersByPosition(position: Position?): List<LatestTransferModel>? {
        return if (position == null) {
            this
        } else {
            this?.filter {
                it.playerPosition?.equals(position.name, ignoreCase = true) == true
            }
        }
    }


    private fun getAllPositions() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get()
            .addOnSuccessListener {
                val positions = it.toObjects(Position::class.java)
                _positionsFlow.update {
                    positions.sortedByDescending { it.sort }
                }
            }
    }

    override fun selectPosition(position: Position?) {
        _selectedPositionFlow.update { position }
    }

    override fun triggerManualRefresh() {
        if (_refreshStateFlow.value.isRefreshing) return

        viewModelScope.launch(Dispatchers.IO) {
            _refreshStateFlow.value = ReleasesRefreshUiState(
                isRefreshing = true,
                lastError = null,
                lastSuccessAt = _refreshStateFlow.value.lastSuccessAt,
            )

            runCatching {
                val triggerResult = SharedCallables.triggerReleasesRefreshJob()
                val requestedAt = triggerResult.requestedAt
                val startedAt = System.currentTimeMillis()

                var workerCompleted = false
                var finalStatus: String? = null
                var finalSummary: String? = null
                var finalError: String? = null

                while (System.currentTimeMillis() - startedAt < MANUAL_REFRESH_MAX_WAIT_MS) {
                    val status = SharedCallables.getReleasesRefreshJobStatus(
                        operationName = triggerResult.operationName,
                        executionName = triggerResult.executionName,
                    )

                    finalStatus = status.status
                    finalSummary = status.summary
                    finalError = status.error

                    if (!status.operationError.isNullOrBlank()) {
                        error("Cloud Run operation failed: ${status.operationError}")
                    }
                    if (!status.executionError.isNullOrBlank()) {
                        error("Cloud Run execution failed: ${status.executionError}")
                    }

                    val hasFreshRun = (status.lastRunAt ?: 0L) >= requestedAt
                    val executionAllowsCompletion = if (!triggerResult.executionName.isNullOrBlank()) {
                        status.executionDone == true && status.executionSucceeded == true
                    } else {
                        false
                    }
                    val operationAllowsCompletion = if (!triggerResult.operationName.isNullOrBlank()) {
                        status.operationDone == true
                    } else {
                        true
                    }

                    if (
                        operationAllowsCompletion &&
                        executionAllowsCompletion &&
                        hasFreshRun &&
                        (finalStatus == "success" || finalStatus == "failed")
                    ) {
                        workerCompleted = true
                        break
                    }

                    delay(MANUAL_REFRESH_STATUS_POLL_MS)
                }

                if (!workerCompleted) {
                    error("Releases refresh worker timeout. Check WorkerRuns/ReleasesRefreshWorker.")
                }

                if (finalStatus != "success") {
                    error(finalError ?: finalSummary ?: "Releases refresh worker failed.")
                }

                loadReleasesCacheMeta()
                recomputeNotificationReleases()
            }.onSuccess {
                _refreshStateFlow.value = ReleasesRefreshUiState(
                    isRefreshing = false,
                    lastError = null,
                    lastSuccessAt = System.currentTimeMillis(),
                )
            }.onFailure { error ->
                _refreshStateFlow.value = ReleasesRefreshUiState(
                    isRefreshing = false,
                    lastError = error.message ?: "Failed to refresh releases",
                    lastSuccessAt = _refreshStateFlow.value.lastSuccessAt,
                )
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        feedEventsRegistration?.remove()
        feedEventsRegistration = null
    }

    private data class ReleaseFeedEvent(
        val id: String? = null,
        val type: String? = null,
        val extraInfo: String? = null,
        val playerTmProfile: String? = null,
        val playerName: String? = null,
        val playerImage: String? = null,
        val playerPosition: String? = null,
        val marketValue: String? = null,
        val playerAge: String? = null,
        val playerNationality: String? = null,
        val playerNationalityFlag: String? = null,
        val transferDate: String? = null,
        val timestamp: Long? = null,
    )

    private fun DocumentSnapshot.toReleaseEventOrNull(): ReleaseFeedEvent? {
        val tmProfile = getString("playerTmProfile")?.takeIf { it.isNotBlank() } ?: return null
        return ReleaseFeedEvent(
            id = id,
            type = getString("type"),
            extraInfo = getString("extraInfo"),
            playerTmProfile = tmProfile,
            playerName = getString("playerName"),
            playerImage = getString("playerImage"),
            playerPosition = getString("playerPosition"),
            marketValue = getString("marketValue"),
            playerAge = getString("playerAge"),
            playerNationality = getString("playerNationality"),
            playerNationalityFlag = getString("playerNationalityFlag"),
            transferDate = getString("transferDate"),
            timestamp = getLong("timestamp")
        )
    }

    private fun deduplicateReleaseEvents(events: List<ReleaseFeedEvent>): List<ReleaseFeedEvent> {
        val byProfile = LinkedHashMap<String, ReleaseFeedEvent>()
        events.forEach { event ->
            val profile = event.playerTmProfile ?: return@forEach
            val existing = byProfile[profile]
            if (existing == null) {
                byProfile[profile] = event
                return@forEach
            }

            val eventTs = event.timestamp ?: 0L
            val existingTs = existing.timestamp ?: 0L
            val newer = if (eventTs >= existingTs) event else existing
            val older = if (eventTs >= existingTs) existing else event

            byProfile[profile] = newer.copy(
                playerPosition = firstMeaningful(newer.playerPosition, older.playerPosition),
                marketValue = firstMeaningful(newer.marketValue, older.marketValue),
                playerAge = firstMeaningful(newer.playerAge, older.playerAge),
                playerNationality = firstMeaningful(newer.playerNationality, older.playerNationality),
                playerNationalityFlag = firstMeaningful(newer.playerNationalityFlag, older.playerNationalityFlag),
                transferDate = firstMeaningful(newer.transferDate, older.transferDate),
                playerImage = firstMeaningful(newer.playerImage, older.playerImage),
                playerName = firstMeaningful(newer.playerName, older.playerName),
            )
        }

        return byProfile.values.sortedByDescending { it.timestamp ?: 0L }
    }

    private fun firstMeaningful(vararg values: String?): String? {
        values.forEach { value ->
            val v = value?.trim()
            if (!v.isNullOrEmpty() && v != "-" && v != "—" && !v.equals("unknown", ignoreCase = true)) {
                return v
            }
        }
        return null
    }

    private fun LatestTransferModel.isWithinNotificationLimits(): Boolean {
        val value = getRealMarketValue()
        if (value !in NOTIFICATION_MIN_MARKET_VALUE..NOTIFICATION_MAX_MARKET_VALUE) return false
        val age = playerAge
            ?.trim()
            ?.let { Regex("\\d{1,2}").find(it)?.value }
            ?.toIntOrNull()
            ?: return false
        return age <= NOTIFICATION_MAX_AGE
    }

    private fun formatTimestampDdMmYyyy(timestamp: Long): String {
        val formatter = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        return formatter.format(Date(timestamp))
    }
}

