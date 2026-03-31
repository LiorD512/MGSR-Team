package com.liordahan.mgsrteam.features.requests

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.config.AppConfigManager
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.requests.repository.IRequestsRepository
import com.liordahan.mgsrteam.features.requests.repository.MatchResultsRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Structure: Position -> Country -> List of Requests (clubs)
 */
data class RequestsUiState(
    val requests: List<Request> = emptyList(),
    val requestsByPositionCountry: Map<String, Map<String, List<Request>>> = emptyMap(),
    val matchingPlayersByRequestId: Map<String, List<Player>> = emptyMap(),
    val matchCountsByRequestId: Map<String, Int> = emptyMap(),
    val mandatePlayersByRequestId: Map<String, List<Player>> = emptyMap(),
    val totalCount: Int = 0,
    val positionsCount: Int = 0,
    val pendingCount: Int = 0,
    val isLoading: Boolean = true,
    val addRequestMessage: String? = null,
    val addRequestError: String? = null
)

abstract class IRequestsViewModel : ViewModel() {
    abstract val requestsState: StateFlow<RequestsUiState>
    abstract val positions: StateFlow<List<Position>>
    abstract val onlinePlayersLoading: StateFlow<Boolean>
    abstract val onlinePlayersResult: StateFlow<List<AiHelperService.SimilarPlayerSuggestion>>
    abstract fun findPlayersOnlineForRequest(request: Request, languageCode: String)
    abstract fun refreshPlayersOnlineForRequest(request: Request, languageCode: String)
    abstract fun clearOnlinePlayersResult()
    abstract fun addRequest(
        club: ClubSearchModel,
        position: String,
        contactId: String?,
        contactName: String?,
        contactPhoneNumber: String?,
        minAge: Int?,
        maxAge: Int?,
        ageDoesntMatter: Boolean,
        dominateFoot: String?,
        salaryRange: String?,
        transferFee: String?,
        notes: String?,
        euOnly: Boolean = false
    )
    abstract fun updateRequest(
        existingRequest: Request,
        club: ClubSearchModel,
        position: String,
        contactId: String?,
        contactName: String?,
        contactPhoneNumber: String?,
        minAge: Int?,
        maxAge: Int?,
        ageDoesntMatter: Boolean,
        dominateFoot: String?,
        salaryRange: String?,
        transferFee: String?,
        notes: String?,
        euOnly: Boolean = false
    )
    abstract fun deleteRequest(request: Request)
    abstract fun clearAddRequestMessage()
    abstract val isDeletingRequest: StateFlow<Boolean>
    abstract val isSavingRequest: StateFlow<Boolean>
}

class RequestsViewModel(
    private val requestsRepository: IRequestsRepository,
    private val playersRepository: IPlayersRepository,
    private val matchResultsRepository: MatchResultsRepository,
    private val firebaseHandler: FirebaseHandler,
    private val clubSearch: ClubSearch,
    private val aiHelperService: AiHelperService
) : IRequestsViewModel() {

    private val _positions = MutableStateFlow<List<Position>>(emptyList())
    private val _onlinePlayersLoading = MutableStateFlow(false)
    override val onlinePlayersLoading: StateFlow<Boolean> = _onlinePlayersLoading.asStateFlow()
    private val _onlinePlayersResult = MutableStateFlow<List<AiHelperService.SimilarPlayerSuggestion>>(emptyList())
    override val onlinePlayersResult: StateFlow<List<AiHelperService.SimilarPlayerSuggestion>> = _onlinePlayersResult.asStateFlow()
    override val positions: StateFlow<List<Position>> = _positions.asStateFlow()

    /** URLs of players already shown — excluded on refresh so user gets fresh results */
    private val _excludedOnlineUrls: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

    private val _addRequestMessage = MutableStateFlow<String?>(null)
    private val _addRequestError = MutableStateFlow<String?>(null)
    private val _isDeletingRequest = MutableStateFlow(false)
    override val isDeletingRequest: StateFlow<Boolean> = _isDeletingRequest.asStateFlow()
    private val _isSavingRequest = MutableStateFlow(false)
    override val isSavingRequest: StateFlow<Boolean> = _isSavingRequest.asStateFlow()

    /** playerTmProfile → aggregated validLeagues from all active (non-expired) mandate documents */
    private val _mandateLeaguesByPlayer = MutableStateFlow<Map<String, List<String>>>(emptyMap())

    private val defaultPositionOrder = listOf("GK", "CB", "RB", "LB", "DM", "CM", "AM", "RW", "LW", "CF", "ST")

    /** Merge message+error into a single flow so we keep the typed 5-param combine. */
    private val _addRequestFeedback = combine(_addRequestMessage, _addRequestError) { msg, err -> msg to err }

    override val requestsState: StateFlow<RequestsUiState> = combine(
        requestsRepository.requestsFlow(),
        playersRepository.playersFlow(),
        matchResultsRepository.allRequestMatchResults(),
        _addRequestFeedback,
        combine(_positions, _mandateLeaguesByPlayer) { pos, mandate -> pos to mandate }
    ) { requests, players, matchResults, feedback, (posList, mandateData) ->
        val (msg, err) = feedback
        val pendingCount = requests.count { (it.status ?: "pending") == "pending" }
        val order = posList.map { it.name ?: "" }.filter { it.isNotBlank() }
            .ifEmpty { defaultPositionOrder }
        val pendingList = requests.filter { (it.status ?: "pending") == "pending" }
        val byPosition = pendingList.groupBy { it.position ?: "Other" }
            .toSortedMap(compareBy { pos ->
                order.indexOfFirst { it.equals(pos, ignoreCase = true) }.takeIf { it >= 0 } ?: 999
            })
        val byPositionCountry = byPosition.mapValues { (_, reqList) ->
            reqList.groupBy { it.clubCountry?.takeIf { c -> c.isNotBlank() } ?: "Other" }
                .toSortedMap(compareBy { if (it == "Other") "\uFFFF" else it.lowercase() })
        }

        // Resolve pre-computed match IDs to Player objects, sorted by market value (highest first)
        // Cap at 20 per request to keep the UI state lightweight
        val playerById = players.associateBy { it.id }
        val matchingPlayersByRequestId = requests.associate { req ->
            val matchedIds = matchResults[req.id ?: ""] ?: emptyList()
            (req.id ?: "") to matchedIds.mapNotNull { playerById[it] }
                .sortedByDescending { parseMarketValueToEuros(it.marketValue) }
                .take(20)
        }.filterKeys { it.isNotBlank() }

        // Store match counts separately (cheap for UI stats without full Player objects)
        val matchCountsByRequestId = requests.associate { req ->
            (req.id ?: "") to (matchResults[req.id ?: ""]?.size ?: 0)
        }.filterKeys { it.isNotBlank() }

        val mandatePlayersByRequestId = computeMandatePlayers(requests, players, mandateData)

        RequestsUiState(
            requests = requests,
            requestsByPositionCountry = byPositionCountry,
            matchingPlayersByRequestId = matchingPlayersByRequestId,
            matchCountsByRequestId = matchCountsByRequestId,
            mandatePlayersByRequestId = mandatePlayersByRequestId,
            totalCount = requests.size,
            positionsCount = byPosition.size,
            pendingCount = pendingCount,
            isLoading = false,
            addRequestMessage = msg,
            addRequestError = err
        )
    }
    .flowOn(Dispatchers.Default)
    .stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        RequestsUiState()
    )

    init {
        loadPositions()
        loadMandateDocuments()
    }

    private fun loadPositions() {
        val configList = AppConfigManager.positions.filterList
        val heMap = AppConfigManager.positions.displayHE
        _positions.value = configList.mapIndexed { index, code ->
            Position(name = code, sort = configList.size - index, hebrewName = heMap[code])
        }
    }

    private fun loadMandateDocuments() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.playerDocumentsTable)
            .whereEqualTo("type", "MANDATE")
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val docs = snapshot.toObjects(PlayerDocument::class.java)
                viewModelScope.launch(Dispatchers.Default) {
                    val now = System.currentTimeMillis()
                    val map = docs
                        .filter { it.playerTmProfile != null && it.expiresAt != null && !it.expired }
                        .filter { it.expiresAt!! >= now }
                        .groupBy { it.playerTmProfile!! }
                        .mapValues { (_, list) ->
                            list.flatMap { it.validLeagues ?: emptyList() }.distinct()
                        }
                    _mandateLeaguesByPlayer.value = map
                }
            }
    }

    /**
     * For each request, find players from the roster who:
     * 1. Have a valid mandate (appear in mandateData)
     * 2. Their mandate validLeagues match the request's club:
     *    - Country-wide mandate: validLeagues contains the club's country (e.g. "Israel")
     *    - Specific club mandate: validLeagues contains "ClubName - Country" matching the request
     *    - Worldwide mandate: validLeagues contains "WorldWide"
     * 3. Player's position matches the request position
     */
    private fun computeMandatePlayers(
        requests: List<Request>,
        players: List<Player>,
        mandateData: Map<String, List<String>>
    ): Map<String, List<Player>> {
        if (mandateData.isEmpty()) return emptyMap()
        // Build a set of player profiles that have active mandates
        val playersWithMandate = players.filter { player ->
            val profile = player.tmProfile?.takeIf { it.isNotBlank() } ?: return@filter false
            mandateData.containsKey(profile)
        }
        if (playersWithMandate.isEmpty()) return emptyMap()

        return requests.mapNotNull { req ->
            val reqId = req.id?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val reqPosition = req.position?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val clubName = req.clubName?.takeIf { it.isNotBlank() }
            val clubCountry = req.clubCountry?.takeIf { it.isNotBlank() }

            val matched = playersWithMandate.filter { player ->
                // 1. Position must match
                if (!RequestMatcher.matchesPositionPublic(player, reqPosition)) return@filter false
                // 2. Mandate must cover this club
                val profile = player.tmProfile ?: return@filter false
                val leagues = mandateData[profile] ?: return@filter false
                mandateMatchesClub(leagues, clubName, clubCountry)
            }
            if (matched.isNotEmpty()) reqId to matched else null
        }.toMap()
    }

    /** Normalize text for fuzzy club name matching: strip diacritics, punctuation, collapse whitespace */
    private fun normalizeClub(s: String): String =
        java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
            .replace("\\p{M}".toRegex(), "")
            .replace("[.,'\\-]".toRegex(), " ")
            .replace("\\s+".toRegex(), " ")
            .trim().lowercase()

    /** Check if two club names match (exact or one contains the other) */
    private fun clubNamesMatch(a: String, b: String): Boolean =
        a == b || a.contains(b) || b.contains(a)

    /** Check if mandate validLeagues covers the given club */
    private fun mandateMatchesClub(validLeagues: List<String>, clubName: String?, clubCountry: String?): Boolean {
        val leaguesNorm = validLeagues.map { normalizeClub(it) }
        if (leaguesNorm.any { it == "worldwide" }) return true
        val clubCountryNorm = clubCountry?.let { normalizeClub(it) }
        val clubNameNorm = clubName?.let { normalizeClub(it) }
        // Country-wide mandate: validLeagues contains just the country name
        if (clubCountryNorm != null && leaguesNorm.any { it == clubCountryNorm }) return true
        // Specific club mandate: "ClubName - Country"
        if (clubNameNorm != null && clubCountryNorm != null) {
            val clubEntry = "$clubNameNorm - $clubCountryNorm"
            if (leaguesNorm.any { it == clubEntry }) return true
        }
        // Fuzzy club-name match: covers partial names, abbreviations, spelling differences
        if (clubNameNorm != null) {
            for (l in leaguesNorm) {
                val clubPart = if (" - " in l) l.substringBefore(" - ") else l
                if (clubNamesMatch(clubNameNorm, clubPart)) return true
            }
        }
        return false
    }

    /** Ensure the lower age value is min and the higher is max. */
    private fun normalizeAgeRange(minAge: Int?, maxAge: Int?): Pair<Int?, Int?> {
        val a = minAge?.takeIf { it > 0 }
        val b = maxAge?.takeIf { it > 0 }
        if (a != null && b != null && a > b) return b to a
        return a to b
    }

    override fun addRequest(
        club: ClubSearchModel,
        position: String,
        contactId: String?,
        contactName: String?,
        contactPhoneNumber: String?,
        minAge: Int?,
        maxAge: Int?,
        ageDoesntMatter: Boolean,
        dominateFoot: String?,
        salaryRange: String?,
        transferFee: String?,
        notes: String?,
        euOnly: Boolean
    ) {
        viewModelScope.launch {
            _isSavingRequest.value = true
            _addRequestError.value = null
            val request = Request(
                clubTmProfile = club.clubTmProfile,
                clubName = club.clubName,
                clubLogo = club.clubLogo,
                clubCountry = club.clubCountry,
                clubCountryFlag = club.clubCountryFlag,
                contactId = contactId,
                contactName = contactName,
                contactPhoneNumber = contactPhoneNumber,
                position = position,
                notes = notes?.takeIf { it.isNotBlank() },
                minAge = normalizeAgeRange(minAge, maxAge).first,
                maxAge = normalizeAgeRange(minAge, maxAge).second,
                ageDoesntMatter = ageDoesntMatter,
                dominateFoot = dominateFoot?.takeIf { it.isNotBlank() },
                salaryRange = salaryRange?.takeIf { it.isNotBlank() },
                transferFee = transferFee?.takeIf { it.isNotBlank() },
                createdAt = System.currentTimeMillis(),
                status = "pending",
                euOnly = euOnly
            )
            requestsRepository.addRequest(request).fold(
                onSuccess = { _addRequestMessage.value = "Request added" },
                onFailure = { _addRequestError.value = it.message ?: "Failed to add request" }
            )
            _isSavingRequest.value = false
        }
    }

    override fun updateRequest(
        existingRequest: Request,
        club: ClubSearchModel,
        position: String,
        contactId: String?,
        contactName: String?,
        contactPhoneNumber: String?,
        minAge: Int?,
        maxAge: Int?,
        ageDoesntMatter: Boolean,
        dominateFoot: String?,
        salaryRange: String?,
        transferFee: String?,
        notes: String?,
        euOnly: Boolean
    ) {
        viewModelScope.launch {
            _isSavingRequest.value = true
            _addRequestError.value = null
            val updatedRequest = existingRequest.copy(
                clubTmProfile = club.clubTmProfile,
                clubName = club.clubName,
                clubLogo = club.clubLogo,
                clubCountry = club.clubCountry,
                clubCountryFlag = club.clubCountryFlag,
                contactId = contactId,
                contactName = contactName,
                contactPhoneNumber = contactPhoneNumber,
                position = position,
                notes = notes?.takeIf { it.isNotBlank() },
                minAge = normalizeAgeRange(minAge, maxAge).first,
                maxAge = normalizeAgeRange(minAge, maxAge).second,
                ageDoesntMatter = ageDoesntMatter,
                dominateFoot = dominateFoot?.takeIf { it.isNotBlank() },
                salaryRange = salaryRange?.takeIf { it.isNotBlank() },
                transferFee = transferFee?.takeIf { it.isNotBlank() },
                euOnly = euOnly
            )
            requestsRepository.updateRequest(updatedRequest).fold(
                onSuccess = { _addRequestMessage.value = "Request updated" },
                onFailure = { _addRequestError.value = it.message ?: "Failed to update request" }
            )
            _isSavingRequest.value = false
        }
    }

    override fun deleteRequest(request: Request) {
        viewModelScope.launch {
            _isDeletingRequest.value = true
            try {
                requestsRepository.deleteRequest(request)
            } finally {
                _isDeletingRequest.value = false
            }
        }
    }

    override fun clearAddRequestMessage() {
        _addRequestMessage.value = null
        _addRequestError.value = null
    }

    override fun findPlayersOnlineForRequest(request: Request, languageCode: String) {
        _excludedOnlineUrls.clear()
        _findPlayersOnline(request, languageCode)
    }

    override fun refreshPlayersOnlineForRequest(request: Request, languageCode: String) {
        // Collect current player URLs so the next search excludes them
        val currentUrls = _onlinePlayersResult.value.mapNotNull { it.transfermarktUrl }
        _excludedOnlineUrls.addAll(currentUrls)
        _findPlayersOnline(request, languageCode)
    }

    private fun _findPlayersOnline(request: Request, languageCode: String) {
        viewModelScope.launch {
            _onlinePlayersLoading.value = true
            _onlinePlayersResult.value = emptyList()
            val rosterUrls = playersRepository.playersFlow().first()
                .mapNotNull { it.tmProfile?.takeIf { url -> url.isNotBlank() } }.toSet()
            val allExcluded = rosterUrls + _excludedOnlineUrls
            aiHelperService.findPlayersForRequestAsFlow(request, allExcluded, languageCode)
                .catch { _onlinePlayersResult.value = emptyList() }
                .collect { list ->
                    _onlinePlayersResult.value = list.take(10)
                    if (list.size >= 10) _onlinePlayersLoading.value = false
                }
            _onlinePlayersLoading.value = false
        }
    }

    override fun clearOnlinePlayersResult() {
        _onlinePlayersResult.value = emptyList()
        _excludedOnlineUrls.clear()
    }
}

/** Parse market value strings like "€1.50m", "€500k" to euros. */
private fun parseMarketValueToEuros(value: String?): Double {
    if (value.isNullOrBlank()) return 0.0
    val cleaned = value.replace("€", "").replace(",", "").trim().lowercase()
    val num = cleaned.replace(Regex("[^\\d.]"), "").toDoubleOrNull() ?: return 0.0
    return when {
        cleaned.contains("m") -> num * 1_000_000
        cleaned.contains("k") -> num * 1_000
        else -> num
    }
}
