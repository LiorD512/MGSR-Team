package com.liordahan.mgsrteam.features.add

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearch
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearchResult
import com.liordahan.mgsrteam.transfermarket.TransfermarktPlayerDetails
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.FlowPreview
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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/** IFA search result for youth platform (mirrors web YouthPlayerSearchResult). */
data class YouthIFASearchResult(
    val fullName: String,
    val fullNameHe: String? = null,
    val currentClub: String? = null,
    val dateOfBirth: String? = null,
    val nationality: String? = null,
    val profileImage: String? = null,
    val ifaUrl: String? = null,
    val ifaPlayerId: String? = null
)

/** Strip IFA site noise from club snippet (e.g. "עונהשינוי יביא לרענון", season listings) */
private fun cleanYouthClubSnippet(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    var c = raw.trim()
    // Strip "עונה שינוי יביא לרענון" and everything after (IFA season-change banner)
    c = c.replace(Regex("""\.?\s*עונה?\s*שינוי.*$"""), "").trim()
    // Strip season page listings "עמוד: 2024/2025, ..."
    c = c.replace(Regex("""\.?\s*עמוד\s*:.*$"""), "").trim()
    // Strip trailing season years "2024/2025, 2023/2024 ..."
    c = c.replace(Regex("""\.?\s*\d{4}/\d{4}[\d\s,/]*\.{0,3}\s*$"""), "").trim()
    // Strip stat noise like "שערים. מסגרת."
    c = c.replace(Regex("""\.?\s*(?:שערים|מסגרת|כרטיסים)[\s.]*$"""), "").trim()
    // Take only first club (before comma-separated second club)
    val commaIdx = c.indexOf("),")
    if (commaIdx > 0) c = c.substring(0, commaIdx + 1).trim()
    // Remove trailing periods
    c = c.replace(Regex("""\.\s*$"""), "").trim()
    // If nothing meaningful or starts with noise, return null
    if (c.length < 2 || c.startsWith("עונה")) return null
    return c
}

data class AddPlayerUiState(
    val playerSearchResults: List<PlayerSearchModel> = emptyList(),
    /** SoccerDonna search results for Women platform. */
    val womenSearchResults: List<SoccerDonnaSearchResult> = emptyList(),
    /** IFA search results for Youth platform. */
    val youthSearchResults: List<YouthIFASearchResult> = emptyList(),
    val showSearchProgress: Boolean = false,
    val showPlayerSelectedSearchProgress: Boolean = false
)

/** Form state for the Women single-page add-player form (mirrors web AddWomanPlayerForm). */
data class WomanPlayerFormState(
    val fullName: String = "",
    val positions: List<String> = emptyList(),
    val currentClub: String = "",
    val age: String = "",
    val nationality: String = "",
    val marketValue: String = "",
    val profileImage: String = "",
    val soccerDonnaUrl: String = "",
    val playerPhone: String = "",
    val agentPhone: String = "",
    val notes: String = "",
    val isSaving: Boolean = false
) {
    companion object {
        val WOMEN_POSITIONS = listOf("GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "CF", "SS")
    }
}

/** Form state for the Youth single-page add-player form (mirrors web AddYouthPlayerForm). */
data class YouthPlayerFormState(
    val fullName: String = "",
    val fullNameHe: String = "",
    val positions: List<String> = emptyList(),
    val currentClub: String = "",
    val academy: String = "",
    val dateOfBirth: String = "",
    val ageGroup: String = "",
    val nationality: String = "",
    val profileImage: String = "",
    val ifaUrl: String = "",
    val playerPhone: String = "",
    val playerEmail: String = "",
    val parentName: String = "",
    val parentRelationship: String = "",
    val parentPhone: String = "",
    val parentEmail: String = "",
    val notes: String = "",
    val isSaving: Boolean = false
) {
    companion object {
        val YOUTH_POSITIONS = listOf("GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "CF", "SS")
        val AGE_GROUPS = listOf("U-13", "U-14", "U-15", "U-17", "U-19", "U-21")
        val PARENT_RELATIONSHIPS = listOf("Father", "Mother", "Guardian", "Agent")

        /** Auto-compute age group from birth year, matching web logic. */
        fun computeAgeGroup(dateOfBirth: String): String {
            val year = dateOfBirth.takeLast(4).toIntOrNull() ?: return ""
            val currentYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
            val age = currentYear - year
            return when {
                age <= 13 -> "U-13"
                age <= 14 -> "U-14"
                age <= 15 -> "U-15"
                age <= 17 -> "U-17"
                age <= 19 -> "U-19"
                age <= 21 -> "U-21"
                else -> ""
            }
        }
    }
}

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
    /** Create a Women/Youth player manually from a name (no Transfermarkt lookup). */
    abstract fun createManualPlayer(fullName: String)
    /** Select a SoccerDonna search result (Women): fetch profile + create player. */
    abstract fun onWomanPlayerSelected(result: SoccerDonnaSearchResult)
    /** Load a Women player by direct SoccerDonna profile URL. */
    abstract fun loadWomanPlayerByUrl(soccerDonnaUrl: String)
    /** Load a Youth player by IFA profile URL (from shortlist → roster). */
    abstract fun loadYouthPlayerByUrl(ifaUrl: String)
    /** Call when closing the add-player sheet so the next open doesn't use stale state. */
    abstract fun resetAfterAdd()

    // ── Women single-page form (matches web AddWomanPlayerForm) ──
    abstract val womanFormState: StateFlow<WomanPlayerFormState>
    abstract fun updateWomanForm(updater: (WomanPlayerFormState) -> WomanPlayerFormState)
    abstract fun toggleWomanPosition(position: String)
    abstract fun saveWomanPlayer()
    /** Save the current Women form data to the shortlist (not roster). */
    abstract fun saveWomanToShortlist()
    abstract fun clearWomanForm()

    // ── Youth single-page form (matches web AddYouthPlayerForm) ──
    abstract val youthFormState: StateFlow<YouthPlayerFormState>
    abstract fun updateYouthForm(updater: (YouthPlayerFormState) -> YouthPlayerFormState)
    abstract fun toggleYouthPosition(position: String)
    abstract fun saveYouthPlayer()
    /** Save the current Youth form data to the shortlist (not roster). */
    abstract fun saveYouthToShortlist()
    abstract fun clearYouthForm()
    /** Select an IFA search result (Youth): pre-fill form and optionally fetch profile. */
    abstract fun onYouthIFAResultSelected(result: YouthIFASearchResult)
}

@OptIn(FlowPreview::class)
class AddPlayerViewModel(
    private val playerSearch: PlayerSearch,
    private val soccerDonnaSearch: SoccerDonnaSearch,
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager,
    private val shortlistRepository: ShortlistRepository
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

    private val _womanFormState = MutableStateFlow(WomanPlayerFormState())
    override val womanFormState: StateFlow<WomanPlayerFormState> = _womanFormState

    private val _youthFormState = MutableStateFlow(YouthPlayerFormState())
    override val youthFormState: StateFlow<YouthPlayerFormState> = _youthFormState

    private val isWomenPlatform: Boolean
        get() = platformManager.current.value == Platform.WOMEN

    private val isYouthPlatform: Boolean
        get() = platformManager.current.value == Platform.YOUTH

    private val httpClient = okhttp3.OkHttpClient.Builder()
        .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    init {
        viewModelScope.launch {
            searchQuery
                .debounce(400)
                .distinctUntilChanged()
                .collectLatest { query ->
                    when {
                        isYouthPlatform -> performYouthSearch(query)
                        isWomenPlatform -> performWomenSearch(query)
                        else -> performSearch(query)
                    }
                }
        }
    }

    // ── Men: Transfermarkt search ──

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

    // ── Women: SoccerDonna search ──

    private suspend fun performWomenSearch(query: String?) {
        updateProgress(true)
        if (query.isNullOrBlank()) {
            _playerSearchStateFlow.update { it.copy(womenSearchResults = emptyList()) }
            updateProgress(false)
        } else {
            val results = soccerDonnaSearch.search(query)
            _playerSearchStateFlow.update { it.copy(womenSearchResults = results) }
            updateProgress(false)
        }
    }

    // ── Youth: IFA search via web API ──

    private suspend fun performYouthSearch(query: String?) {
        updateProgress(true)
        if (query.isNullOrBlank() || query.length < 2) {
            _playerSearchStateFlow.update { it.copy(youthSearchResults = emptyList()) }
            updateProgress(false)
        } else {
            try {
                val encodedQuery = java.net.URLEncoder.encode(query, "UTF-8")
                val url = "${com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient.DEFAULT_BASE_URL}/api/youth-players/search?q=$encodedQuery"
                val request = okhttp3.Request.Builder().url(url).get().build()
                val response = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    httpClient.newCall(request).execute()
                }
                val body = response.body?.string()
                if (response.isSuccessful && body != null) {
                    val json = org.json.JSONObject(body)
                    val arr = json.optJSONArray("results") ?: org.json.JSONArray()
                    val results = mutableListOf<YouthIFASearchResult>()
                    for (i in 0 until arr.length()) {
                        val obj = arr.getJSONObject(i)
                        results.add(
                            YouthIFASearchResult(
                                fullName = obj.optString("fullName", ""),
                                fullNameHe = obj.optString("fullNameHe", null),
                                currentClub = cleanYouthClubSnippet(obj.optString("currentClub", null)),
                                dateOfBirth = obj.optString("dateOfBirth", null),
                                nationality = obj.optString("nationality", null),
                                profileImage = obj.optString("profileImage", null),
                                ifaUrl = obj.optString("ifaUrl", null),
                                ifaPlayerId = obj.optString("ifaPlayerId", null)
                            )
                        )
                    }
                    _playerSearchStateFlow.update { it.copy(youthSearchResults = results) }
                    // Background enrichment: fetch real IFA data per player (progressive)
                    enrichYouthResults(results)
                } else {
                    _playerSearchStateFlow.update { it.copy(youthSearchResults = emptyList()) }
                }
            } catch (e: Exception) {
                android.util.Log.e("AddPlayerVM", "Youth IFA search error", e)
                _playerSearchStateFlow.update { it.copy(youthSearchResults = emptyList()) }
            }
            updateProgress(false)
        }
    }

    /** Fire background /enrich calls for each player to replace stale Google snippet data. */
    private fun enrichYouthResults(results: List<YouthIFASearchResult>) {
        val baseUrl = com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient.DEFAULT_BASE_URL
        for (result in results) {
            val pid = result.ifaPlayerId ?: continue
            viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    val req = okhttp3.Request.Builder()
                        .url("$baseUrl/api/youth-players/enrich?player_id=$pid")
                        .get().build()
                    val resp = httpClient.newCall(req).execute()
                    val body = resp.body?.string()
                    if (resp.isSuccessful && body != null) {
                        val obj = org.json.JSONObject(body)
                        val club = obj.optString("currentClub", "").takeIf { it.isNotBlank() }
                        val dob = obj.optString("dateOfBirth", "").takeIf { it.isNotBlank() }
                        val nat = obj.optString("nationality", "").takeIf { it.isNotBlank() }
                        val nameHe = obj.optString("fullNameHe", "").takeIf { it.isNotBlank() }
                        val img = obj.optString("profileImage", "").takeIf { it.isNotBlank() }
                        if (club != null || dob != null || nat != null || nameHe != null || img != null) {
                            _playerSearchStateFlow.update { state ->
                                state.copy(youthSearchResults = state.youthSearchResults.map { r ->
                                    if (r.ifaPlayerId == pid) r.copy(
                                        currentClub = club?.let { cleanYouthClubSnippet(it) } ?: r.currentClub,
                                        dateOfBirth = dob ?: r.dateOfBirth,
                                        nationality = nat ?: r.nationality,
                                        fullNameHe = nameHe ?: r.fullNameHe,
                                        profileImage = img ?: r.profileImage
                                    ) else r
                                })
                            }
                        }
                    }
                } catch (_: Exception) { /* keep snippet data */ }
            }
        }
    }

    override fun onYouthIFAResultSelected(result: YouthIFASearchResult) {
        // Pre-fill the youth form from the selected IFA search result
        // Note: fullName (English) is NOT auto-filled — only manual input
        _youthFormState.update { state ->
            state.copy(
                fullNameHe = result.fullNameHe?.takeIf { it.isNotBlank() } ?: result.fullName.ifBlank { state.fullNameHe },
                currentClub = result.currentClub?.takeIf { it.isNotBlank() } ?: state.currentClub,
                dateOfBirth = result.dateOfBirth?.takeIf { it.isNotBlank() } ?: state.dateOfBirth,
                ageGroup = result.dateOfBirth?.let { YouthPlayerFormState.computeAgeGroup(it) }?.ifBlank { state.ageGroup } ?: state.ageGroup,
                nationality = result.nationality?.takeIf { it.isNotBlank() } ?: state.nationality,
                profileImage = result.profileImage?.takeIf { it.isNotBlank() } ?: state.profileImage,
                ifaUrl = result.ifaUrl?.takeIf { it.isNotBlank() } ?: state.ifaUrl
            )
        }
        // Clear search results
        _playerSearchStateFlow.update { it.copy(youthSearchResults = emptyList()) }
        _searchQuery.update { "" }

        // If we have an IFA URL, fetch the full profile for more data
        result.ifaUrl?.takeIf { it.isNotBlank() }?.let { url ->
            viewModelScope.launch {
                _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
                try {
                    kotlinx.coroutines.withTimeout(15_000) {
                        val requestBody = org.json.JSONObject().apply {
                            put("url", url)
                        }.toString().toRequestBody("application/json".toMediaType())

                        val request = okhttp3.Request.Builder()
                            .url("${com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient.DEFAULT_BASE_URL}/api/youth-players/fetch-profile")
                            .post(requestBody)
                            .build()

                        val response = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                            httpClient.newCall(request).execute()
                        }
                        val body = response.body?.string()
                        if (response.isSuccessful && body != null) {
                            val data = org.json.JSONObject(body)
                            _youthFormState.update { state ->
                                state.copy(
                                    fullNameHe = data.optString("fullNameHe", "").takeIf { it.isNotBlank() }
                                        ?: data.optString("fullName", "").takeIf { it.isNotBlank() }
                                        ?: state.fullNameHe,
                                    currentClub = data.optString("currentClub", "").takeIf { it.isNotBlank() } ?: state.currentClub,
                                    nationality = data.optString("nationality", "").takeIf { it.isNotBlank() } ?: state.nationality,
                                    profileImage = data.optString("profileImage", "").takeIf { it.isNotBlank() } ?: state.profileImage,
                                    ifaUrl = data.optString("ifaUrl", "").takeIf { it.isNotBlank() } ?: state.ifaUrl,
                                    dateOfBirth = data.optString("dateOfBirth", "").takeIf { it.isNotBlank() } ?: state.dateOfBirth,
                                    ageGroup = data.optString("dateOfBirth", "").takeIf { it.isNotBlank() }?.let { YouthPlayerFormState.computeAgeGroup(it) }?.ifBlank { state.ageGroup } ?: state.ageGroup
                                )
                            }
                            data.optJSONArray("positions")?.let { posArr ->
                                val positions = mutableListOf<String>()
                                for (i in 0 until posArr.length()) {
                                    posArr.optString(i)?.takeIf { it.isNotBlank() }?.let { positions.add(it) }
                                }
                                if (positions.isNotEmpty()) {
                                    _youthFormState.update { it.copy(positions = positions) }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.e("AddPlayerVM", "Youth IFA profile fetch error", e)
                } finally {
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                }
            }
        }
    }

    override fun onWomanPlayerSelected(result: SoccerDonnaSearchResult) {
        viewModelScope.launch {
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                // Duplicate check by soccerDonnaUrl
                if (!result.soccerDonnaUrl.isNullOrBlank()) {
                    val snapshot = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("soccerDonnaUrl", result.soccerDonnaUrl)
                        .get()
                        .await()
                    if (snapshot.documents.isNotEmpty()) {
                        _errorMessageFlow.emit("Player already in roster")
                        _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                        return@launch
                    }
                }

                // Fetch full profile from SoccerDonna
                val profile = result.soccerDonnaUrl?.let { soccerDonnaSearch.fetchProfile(it) }

                // Fill form state (web-style: pre-fill editable form)
                _womanFormState.update {
                    WomanPlayerFormState(
                        fullName = profile?.fullName ?: result.fullName,
                        positions = profile?.position?.let { mapSoccerDonnaPosition(it) } ?: emptyList(),
                        currentClub = profile?.currentClub ?: result.currentClub ?: "",
                        age = profile?.age ?: "",
                        nationality = profile?.nationality ?: "",
                        marketValue = profile?.marketValue ?: "",
                        profileImage = profile?.profileImage ?: "",
                        soccerDonnaUrl = result.soccerDonnaUrl ?: ""
                    )
                }
                // Clear search so dropdown hides
                _searchQuery.update { "" }
                _playerSearchStateFlow.update { it.copy(womenSearchResults = emptyList()) }
            } catch (e: Exception) {
                // If profile fetch fails, still fill with basic data from search
                _womanFormState.update {
                    WomanPlayerFormState(
                        fullName = result.fullName,
                        currentClub = result.currentClub ?: "",
                        soccerDonnaUrl = result.soccerDonnaUrl ?: ""
                    )
                }
                _searchQuery.update { "" }
                _playerSearchStateFlow.update { it.copy(womenSearchResults = emptyList()) }
            }
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    override fun loadWomanPlayerByUrl(soccerDonnaUrl: String) {
        val url = soccerDonnaUrl.trim()
        if (url.isBlank() || !url.contains("soccerdonna")) return
        viewModelScope.launch {
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                // Duplicate check
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("soccerDonnaUrl", url)
                    .get()
                    .await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }

                val profile = soccerDonnaSearch.fetchProfile(url)
                if (profile == null) {
                    _errorMessageFlow.emit("Invalid SoccerDonna profile URL")
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
                _womanFormState.update {
                    WomanPlayerFormState(
                        fullName = profile.fullName ?: "",
                        positions = profile.position?.let { mapSoccerDonnaPosition(it) } ?: emptyList(),
                        currentClub = profile.currentClub ?: "",
                        age = profile.age ?: "",
                        nationality = profile.nationality ?: "",
                        marketValue = profile.marketValue ?: "",
                        profileImage = profile.profileImage ?: "",
                        soccerDonnaUrl = profile.soccerDonnaUrl ?: url
                    )
                }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to load profile")
            }
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    /**
     * Maps SoccerDonna position strings (e.g. "Centre Forward", "Left Winger")
     * to short position abbreviations used in the app (e.g. "CF", "LW").
     */
    private fun mapSoccerDonnaPosition(raw: String): List<String> {
        val p = raw.lowercase().trim()
        if (p.isBlank() || p == "-" || p == "- -") return emptyList()
        // Partial matching – mirrors the web platform's mapPosition logic.
        // SoccerDonna may return compound values like "Defence - Centre Back".
        if (p.contains("keeper") || p.contains("goalkeeper") || p == "gk") return listOf("GK")
        if (p.contains("centre back") || p.contains("center back") || p == "cb") return listOf("CB")
        if (p.contains("left back") || p.contains("fullback, left") || p == "lb") return listOf("LB")
        if (p.contains("right back") || p.contains("fullback, right") || p == "rb") return listOf("RB")
        if (p.contains("defensive mid") || p == "dm") return listOf("DM")
        if (p.contains("central mid") || p.contains("centre mid") || p == "cm") return listOf("CM")
        if (p.contains("attacking mid") || p == "am") return listOf("AM")
        if (p.contains("left mid") || p == "lm") return listOf("LM")
        if (p.contains("right mid") || p == "rm") return listOf("RM")
        if (p.contains("left wing") || p == "lw") return listOf("LW")
        if (p.contains("right wing") || p == "rw") return listOf("RW")
        if (p.contains("centre forward") || p.contains("center forward") || p.contains("striker") || p == "cf") return listOf("CF")
        if (p.contains("second striker") || p == "ss") return listOf("SS")
        if (p.contains("forward") || p.contains("attack")) return listOf("CF")
        // Category-only fallbacks ("Defence", "Midfield")
        if (p.contains("defence") || p.contains("defense")) return listOf("CB")
        if (p.contains("midfield")) return listOf("CM")
        return emptyList()
    }

    override fun loadYouthPlayerByUrl(ifaUrl: String) {
        val url = ifaUrl.trim()
        if (url.isBlank() || !url.contains("football.org.il")) return
        viewModelScope.launch {
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                // Duplicate check by ifaUrl
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("ifaUrl", url)
                    .get()
                    .await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }

                // Fetch full profile from IFA via Vercel API
                val requestBody = org.json.JSONObject().apply {
                    put("url", url)
                }.toString().toRequestBody("application/json".toMediaType())

                val request = okhttp3.Request.Builder()
                    .url("${com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient.DEFAULT_BASE_URL}/api/youth-players/fetch-profile")
                    .post(requestBody)
                    .build()

                val response = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    httpClient.newCall(request).execute()
                }
                val body = response.body?.string()
                if (response.isSuccessful && body != null) {
                    val data = org.json.JSONObject(body)
                    val positions = mutableListOf<String>()
                    data.optJSONArray("positions")?.let { posArr ->
                        for (i in 0 until posArr.length()) {
                            posArr.optString(i)?.takeIf { it.isNotBlank() }?.let { positions.add(it) }
                        }
                    }
                    _youthFormState.update {
                        YouthPlayerFormState(
                            fullName = data.optString("fullName", ""),
                            fullNameHe = data.optString("fullNameHe", "").takeIf { it.isNotBlank() }
                                ?: data.optString("fullName", ""),
                            positions = positions,
                            currentClub = data.optString("currentClub", ""),
                            academy = data.optString("academy", ""),
                            dateOfBirth = data.optString("dateOfBirth", ""),
                            ageGroup = data.optString("dateOfBirth", "").takeIf { it.isNotBlank() }
                                ?.let { YouthPlayerFormState.computeAgeGroup(it) } ?: "",
                            nationality = data.optString("nationality", ""),
                            profileImage = data.optString("profileImage", ""),
                            ifaUrl = data.optString("ifaUrl", "").takeIf { it.isNotBlank() } ?: url
                        )
                    }
                } else {
                    // Fallback: populate form with just the URL so user can fill manually
                    _youthFormState.update { YouthPlayerFormState(ifaUrl = url) }
                }
            } catch (e: Exception) {
                android.util.Log.e("AddPlayerVM", "Youth IFA profile load error", e)
                _youthFormState.update { YouthPlayerFormState(ifaUrl = url) }
            }
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    // ── Women form-state helpers ──

    override fun updateWomanForm(updater: (WomanPlayerFormState) -> WomanPlayerFormState) {
        _womanFormState.update(updater)
    }

    override fun toggleWomanPosition(position: String) {
        _womanFormState.update { state ->
            val current = state.positions.toMutableList()
            if (current.contains(position)) current.remove(position) else current.add(position)
            state.copy(positions = current)
        }
    }

    override fun clearWomanForm() {
        _womanFormState.update { WomanPlayerFormState() }
    }

    // ── Youth form-state helpers ──

    override fun updateYouthForm(updater: (YouthPlayerFormState) -> YouthPlayerFormState) {
        _youthFormState.update(updater)
    }

    override fun toggleYouthPosition(position: String) {
        _youthFormState.update { state ->
            val current = state.positions.toMutableList()
            if (current.contains(position)) current.remove(position) else current.add(position)
            state.copy(positions = current)
        }
    }

    override fun clearYouthForm() {
        _youthFormState.update { YouthPlayerFormState() }
    }

    override fun saveYouthPlayer() {
        val form = _youthFormState.value
        val effectiveName = form.fullNameHe.ifBlank { form.fullName }
        if (effectiveName.isBlank()) return
        _youthFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                // Duplicate check by fullName or fullNameHe
                val nameField = if (form.fullName.isNotBlank()) "fullName" else "fullNameHe"
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo(nameField, effectiveName.trim())
                    .get()
                    .await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _youthFormState.update { it.copy(isSaving = false) }
                    return@launch
                }

                // Get agent info
                val accountsSnapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.accountsTable)
                    .get()
                    .await()
                val accounts = accountsSnapshot.toObjects(Account::class.java)
                val agentInChargeName = accounts.firstOrNull {
                    it.email?.equals(
                        firebaseHandler.firebaseAuth.currentUser?.email,
                        ignoreCase = true
                    ) == true
                }?.name

                val parentContact = if (form.parentName.isNotBlank() || form.parentPhone.isNotBlank()) {
                    com.liordahan.mgsrteam.features.players.models.ParentContact(
                        parentName = form.parentName.takeIf { it.isNotBlank() },
                        parentRelationship = form.parentRelationship.takeIf { it.isNotBlank() },
                        parentPhoneNumber = form.parentPhone.takeIf { it.isNotBlank() },
                        parentEmail = form.parentEmail.takeIf { it.isNotBlank() }
                    )
                } else null

                val player = Player(
                    fullName = effectiveName.trim(),
                    fullNameHe = form.fullNameHe.takeIf { it.isNotBlank() },
                    positions = form.positions.ifEmpty { null },
                    currentClub = form.currentClub.takeIf { it.isNotBlank() }?.let { Club(clubName = it) },
                    academy = form.academy.takeIf { it.isNotBlank() },
                    dateOfBirth = form.dateOfBirth.takeIf { it.isNotBlank() },
                    ageGroup = form.ageGroup.takeIf { it.isNotBlank() },
                    nationality = form.nationality.takeIf { it.isNotBlank() },
                    profileImage = form.profileImage.takeIf { it.isNotBlank() },
                    ifaUrl = form.ifaUrl.takeIf { it.isNotBlank() },
                    playerPhoneNumber = form.playerPhone.takeIf { it.isNotBlank() },
                    playerEmail = form.playerEmail.takeIf { it.isNotBlank() },
                    parentContact = parentContact,
                    notes = form.notes.takeIf { it.isNotBlank() },
                    createdAt = System.currentTimeMillis(),
                    agentInChargeName = agentInChargeName
                )

                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .add(player)
                    .await()

                com.liordahan.mgsrteam.analytics.AnalyticsHelper.logAddPlayer()

                // Write feed event
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.feedEventsTable)
                    .add(
                        FeedEvent(
                            type = FeedEvent.TYPE_PLAYER_ADDED,
                            playerName = player.fullName,
                            playerImage = player.profileImage,
                            playerTmProfile = null,
                            timestamp = System.currentTimeMillis(),
                            agentName = agentInChargeName
                        )
                    )

                // Auto-remove from shortlist (same behaviour as women/men platform)
                if (form.ifaUrl.isNotBlank()) {
                    try { shortlistRepository.removeFromShortlist(form.ifaUrl) } catch (_: Exception) {}
                }

                _isPlayerAddedFlow.update { true }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to save player")
            }
            _youthFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun saveYouthToShortlist() {
        val form = _youthFormState.value
        val effectiveName = form.fullNameHe.ifBlank { form.fullName }
        if (effectiveName.isBlank()) return
        _youthFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                // Use ifaUrl as the tmProfileUrl for youth shortlist entries, fallback to generated ID
                val url = form.ifaUrl.takeIf { it.isNotBlank() }
                    ?: "youth-manual-${System.currentTimeMillis()}"

                when (shortlistRepository.addToShortlistFromForm(
                    tmProfileUrl = url,
                    playerName = effectiveName.trim(),
                    playerPosition = form.positions.firstOrNull(),
                    playerAge = form.dateOfBirth.takeIf { it.isNotBlank() },
                    playerNationality = form.nationality.takeIf { it.isNotBlank() },
                    clubJoinedName = form.currentClub.takeIf { it.isNotBlank() },
                    marketValue = null,
                    playerImage = form.profileImage.takeIf { it.isNotBlank() }
                )) {
                    is ShortlistRepository.AddToShortlistResult.Added -> {
                        _isPlayerAddedFlow.update { true }
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist -> {
                        _errorMessageFlow.emit("Player already in shortlist")
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInRoster -> {
                        _errorMessageFlow.emit("Player already in roster")
                    }
                }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to add to shortlist")
            }
            _youthFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun saveWomanPlayer() {
        val form = _womanFormState.value
        if (form.fullName.isBlank()) return
        _womanFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                // Duplicate check by soccerDonnaUrl
                if (form.soccerDonnaUrl.isNotBlank()) {
                    val snapshot = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("soccerDonnaUrl", form.soccerDonnaUrl)
                        .get()
                        .await()
                    if (snapshot.documents.isNotEmpty()) {
                        _errorMessageFlow.emit("Player already in roster")
                        _womanFormState.update { it.copy(isSaving = false) }
                        return@launch
                    }
                }

                // Get agent info
                val accountsSnapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.accountsTable)
                    .get()
                    .await()
                val accounts = accountsSnapshot.toObjects(Account::class.java)
                val agentInChargeName = accounts.firstOrNull {
                    it.email?.equals(
                        firebaseHandler.firebaseAuth.currentUser?.email,
                        ignoreCase = true
                    ) == true
                }?.name

                val player = Player(
                    fullName = form.fullName.trim(),
                    positions = form.positions.ifEmpty { null },
                    currentClub = form.currentClub.takeIf { it.isNotBlank() }?.let { Club(clubName = it) },
                    age = form.age.takeIf { it.isNotBlank() },
                    nationality = form.nationality.takeIf { it.isNotBlank() },
                    marketValue = form.marketValue.takeIf { it.isNotBlank() },
                    profileImage = form.profileImage.takeIf { it.isNotBlank() },
                    soccerDonnaUrl = form.soccerDonnaUrl.takeIf { it.isNotBlank() },
                    playerPhoneNumber = form.playerPhone.takeIf { it.isNotBlank() },
                    agentPhoneNumber = form.agentPhone.takeIf { it.isNotBlank() },
                    notes = form.notes.takeIf { it.isNotBlank() },
                    createdAt = System.currentTimeMillis(),
                    agentInChargeName = agentInChargeName
                )

                val docRef = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .add(player)
                    .await()

                com.liordahan.mgsrteam.analytics.AnalyticsHelper.logAddPlayer()

                // Write feed event — for Women/Youth use document ID (no tmProfile)
                val feedProfileId = player.tmProfile ?: docRef.id
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.feedEventsTable)
                    .add(
                        FeedEvent(
                            type = FeedEvent.TYPE_PLAYER_ADDED,
                            playerName = player.fullName,
                            playerImage = player.profileImage,
                            playerTmProfile = feedProfileId,
                            timestamp = System.currentTimeMillis(),
                            agentName = agentInChargeName
                        )
                    )

                // Auto-remove from shortlist (same behaviour as men platform)
                if (form.soccerDonnaUrl.isNotBlank()) {
                    try { shortlistRepository.removeFromShortlist(form.soccerDonnaUrl) } catch (_: Exception) {}
                }

                _isPlayerAddedFlow.update { true }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to save player")
            }
            _womanFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun saveWomanToShortlist() {
        val form = _womanFormState.value
        if (form.fullName.isBlank() && form.soccerDonnaUrl.isBlank()) return
        _womanFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                // Use soccerDonnaUrl as the tmProfileUrl for women shortlist entries
                val url = form.soccerDonnaUrl.takeIf { it.isNotBlank() }
                    ?: "women-manual-${System.currentTimeMillis()}"

                when (shortlistRepository.addToShortlistFromForm(
                    tmProfileUrl = url,
                    playerName = form.fullName.trim().takeIf { it.isNotBlank() },
                    playerPosition = form.positions.firstOrNull(),
                    playerAge = form.age.takeIf { it.isNotBlank() },
                    playerNationality = form.nationality.takeIf { it.isNotBlank() },
                    clubJoinedName = form.currentClub.takeIf { it.isNotBlank() },
                    marketValue = form.marketValue.takeIf { it.isNotBlank() },
                    playerImage = form.profileImage.takeIf { it.isNotBlank() }
                )) {
                    is ShortlistRepository.AddToShortlistResult.Added -> {
                        _isPlayerAddedFlow.update { true }
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist -> {
                        _errorMessageFlow.emit("Player already in shortlist")
                    }
                    is ShortlistRepository.AddToShortlistResult.AlreadyInRoster -> {
                        _errorMessageFlow.emit("Player already in roster")
                    }
                }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to add to shortlist")
            }
            _womanFormState.update { it.copy(isSaving = false) }
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
        // Route SoccerDonna URLs to the Women-specific loader
        if (url.contains("soccerdonna")) {
            loadWomanPlayerByUrl(url)
            return
        }
        // Route IFA URLs to the Youth-specific loader
        if (url.contains("football.org.il")) {
            loadYouthPlayerByUrl(url)
            return
        }
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
                onLoanFromClub = details.onLoanFromClub,
                foot = details.foot
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
                            // Write feed event (no push)
                            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                                FeedEvent(
                                    type = FeedEvent.TYPE_PLAYER_ADDED,
                                    playerName = playerToSave.fullName,
                                    playerImage = playerToSave.profileImage,
                                    playerTmProfile = playerToSave.tmProfile,
                                    timestamp = System.currentTimeMillis(),
                                    agentName = agentInChargeName
                                )
                            )
                        }
                }
            }

    }

    override fun createManualPlayer(fullName: String) {
        if (fullName.isBlank()) return
        viewModelScope.launch {
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                // Check for duplicate by fullName in the current platform's collection
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("fullName", fullName.trim())
                    .get()
                    .await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
            } catch (_: Exception) { /* proceed even if dedup check fails */ }

            val player = Player(
                fullName = fullName.trim(),
                createdAt = System.currentTimeMillis()
            )
            _selectedPlayerFlow.update { player }
            _playerSearchStateFlow.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    private fun updateProgress(showProgress: Boolean) {
        _playerSearchStateFlow.update { it.copy(showSearchProgress = showProgress) }
    }

    override fun resetAfterAdd() {
        _isPlayerAddedFlow.value = false
        _selectedPlayerFlow.value = null
        _womanFormState.update { WomanPlayerFormState() }
        _youthFormState.update { YouthPlayerFormState() }
        _playerSearchStateFlow.update {
            it.copy(
                showPlayerSelectedSearchProgress = false,
                womenSearchResults = emptyList()
            )
        }
    }
}