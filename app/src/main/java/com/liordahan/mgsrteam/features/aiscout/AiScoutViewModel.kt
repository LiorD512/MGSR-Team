package com.liordahan.mgsrteam.features.aiscout

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.localization.LocaleManager
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

// ── UI State ────────────────────────────────────────────────────────────────

data class AiScoutUiState(
    val query: String = "",
    val isLoading: Boolean = false,
    val results: List<ScoutPlayerResult> = emptyList(),
    val interpretation: String = "",
    val leagueInfo: LeagueInfo? = null,
    val hasMore: Boolean = false,
    val requestedTotal: Int = 0,
    val searchMethod: String = "",
    val errorMessage: String? = null,
    val hasSearched: Boolean = false,
    val excludeUrls: List<String> = emptyList()
)

data class FindNextUiState(
    val playerName: String = "",
    val ageMin: Int = 17,
    val ageMax: Int = 23,
    val valueMin: Int = 100_000,
    val valueMax: Int = 3_000_000,
    val isSearching: Boolean = false,
    val response: FindNextResponse? = null,
    val errorMessage: String? = null,
    val seenUrls: Set<String> = emptySet(),
    val lastSearchKey: String = ""
)

// ── Interface ───────────────────────────────────────────────────────────────

abstract class IAiScoutViewModel : ViewModel() {
    abstract val uiState: StateFlow<AiScoutUiState>
    abstract val findNextState: StateFlow<FindNextUiState>
    abstract fun updateQuery(query: String)
    abstract fun search()
    abstract fun loadMore()
    abstract fun clearSearch()
    abstract fun useExample(example: String)
    abstract fun updateFindNextPlayerName(name: String)
    abstract fun updateFindNextAgeMin(age: Int)
    abstract fun updateFindNextAgeMax(age: Int)
    abstract fun updateFindNextValueMin(value: Int)
    abstract fun updateFindNextValueMax(value: Int)
    abstract fun findNextSearch()
}

// ── Implementation ──────────────────────────────────────────────────────────

class AiScoutViewModel(
    private val apiClient: MgsrWebApiClient,
    private val context: android.content.Context
) : IAiScoutViewModel() {

    companion object {
        private const val TAG = "AiScoutViewModel"
    }

    private val _uiState = MutableStateFlow(AiScoutUiState())
    override val uiState: StateFlow<AiScoutUiState> = _uiState.asStateFlow()

    private val _findNextState = MutableStateFlow(FindNextUiState())
    override val findNextState: StateFlow<FindNextUiState> = _findNextState.asStateFlow()

    private val lang: String
        get() = LocaleManager.getSavedLanguage(context)

    override fun updateQuery(query: String) {
        _uiState.update { it.copy(query = query) }
    }

    override fun search() {
        val currentQuery = _uiState.value.query.trim()
        if (currentQuery.isBlank()) return

        _uiState.update {
            it.copy(
                isLoading = true,
                errorMessage = null,
                results = emptyList(),
                hasSearched = true,
                excludeUrls = emptyList()
            )
        }

        viewModelScope.launch {
            try {
                withTimeout(30_000L) {
                    val request = AiScoutSearchRequest(
                        query = currentQuery,
                        lang = lang,
                        initial = true
                    )

                    apiClient.searchPlayers(request)
                        .onSuccess { response ->
                            Log.d(TAG, "Search returned ${response.results.size} results")
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    results = response.results,
                                    interpretation = response.interpretation,
                                    leagueInfo = response.leagueInfo,
                                    hasMore = response.hasMore,
                                    requestedTotal = response.requestedTotal,
                                    searchMethod = response.searchMethod,
                                    excludeUrls = response.results.map { r -> r.transfermarktUrl }
                                )
                            }
                        }
                        .onFailure { e ->
                            Log.e(TAG, "Search failed", e)
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    errorMessage = e.message ?: "Search failed"
                                )
                            }
                        }
                }
            } catch (e: TimeoutCancellationException) {
                _uiState.update {
                    it.copy(isLoading = false, errorMessage = "Search timed out. Please try again.")
                }
            }
        }
    }

    override fun loadMore() {
        val currentState = _uiState.value
        if (currentState.isLoading || !currentState.hasMore) return

        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        viewModelScope.launch {
            try {
                withTimeout(30_000L) {
                    val request = AiScoutSearchRequest(
                        query = currentState.query.trim(),
                        lang = lang,
                        initial = false,
                        excludeUrls = currentState.excludeUrls
                    )

                    apiClient.searchPlayers(request)
                        .onSuccess { response ->
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    results = it.results + response.results,
                                    hasMore = response.hasMore,
                                    requestedTotal = response.requestedTotal,
                                    excludeUrls = it.excludeUrls + response.results.map { r -> r.transfermarktUrl }
                                )
                            }
                        }
                        .onFailure { e ->
                            Log.e(TAG, "Load more failed", e)
                            _uiState.update {
                                it.copy(
                                    isLoading = false,
                                    errorMessage = e.message ?: "Failed to load more"
                                )
                            }
                        }
                }
            } catch (e: TimeoutCancellationException) {
                _uiState.update {
                    it.copy(isLoading = false, errorMessage = "Request timed out. Please try again.")
                }
            }
        }
    }

    override fun clearSearch() {
        _uiState.update { AiScoutUiState() }
    }

    override fun useExample(example: String) {
        _uiState.update { it.copy(query = example) }
        search()
    }

    override fun updateFindNextPlayerName(name: String) {
        _findNextState.update { it.copy(playerName = name, errorMessage = null) }
    }

    override fun updateFindNextAgeMin(age: Int) {
        _findNextState.update {
            val normalizedMin = age.coerceIn(17, 35)
            val normalizedMax = it.ageMax.coerceAtLeast(normalizedMin)
            it.copy(ageMin = normalizedMin, ageMax = normalizedMax)
        }
    }

    override fun updateFindNextAgeMax(age: Int) {
        _findNextState.update {
            val normalizedMax = age.coerceIn(17, 35)
            val normalizedMin = it.ageMin.coerceAtMost(normalizedMax)
            it.copy(ageMin = normalizedMin, ageMax = normalizedMax)
        }
    }

    override fun updateFindNextValueMin(value: Int) {
        _findNextState.update {
            val normalizedMin = value.coerceAtLeast(0)
            val normalizedMax = if (it.valueMax > 0 && it.valueMax < normalizedMin) {
                normalizedMin
            } else {
                it.valueMax
            }
            it.copy(valueMin = normalizedMin, valueMax = normalizedMax)
        }
    }

    override fun updateFindNextValueMax(value: Int) {
        _findNextState.update {
            val normalizedMax = value.coerceAtLeast(0)
            val normalizedMin = if (normalizedMax > 0) {
                it.valueMin.coerceAtMost(normalizedMax)
            } else {
                it.valueMin
            }
            it.copy(valueMin = normalizedMin, valueMax = normalizedMax)
        }
    }

    override fun findNextSearch() {
        val name = _findNextState.value.playerName.trim()
        if (name.isBlank()) return
        val current = _findNextState.value
        val normalizedAgeMin = minOf(current.ageMin, current.ageMax)
        val normalizedAgeMax = maxOf(current.ageMin, current.ageMax)
        val normalizedValueMin = current.valueMin.coerceAtLeast(0)
        val normalizedValueMax = if (current.valueMax > 0 && current.valueMax < normalizedValueMin) {
            normalizedValueMin
        } else {
            current.valueMax
        }

        // If search params changed, reset seen URLs for fresh results
        val searchKey = "${name}|age:${normalizedAgeMin}-${normalizedAgeMax}|value:${normalizedValueMin}-${if (normalizedValueMax > 0) normalizedValueMax else "any"}"
        val currentSeenUrls = if (searchKey != _findNextState.value.lastSearchKey) {
            emptySet()
        } else {
            _findNextState.value.seenUrls
        }

        _findNextState.update {
            it.copy(
                isSearching = true, errorMessage = null, response = null,
                seenUrls = currentSeenUrls, lastSearchKey = searchKey
            )
        }

        viewModelScope.launch {
            try {
                withTimeout(120_000L) {
                    val request = FindNextRequest(
                        playerName = name,
                        ageMin = normalizedAgeMin,
                        ageMax = normalizedAgeMax,
                        valueMin = normalizedValueMin,
                        valueMax = normalizedValueMax,
                        lang = lang,
                        excludeUrls = currentSeenUrls.toList()
                    )

                    apiClient.findNext(request)
                        .onSuccess { response ->
                            val filteredResults = response.results.filter { player ->
                                val playerAge = player.age.filter { it.isDigit() }.toIntOrNull()
                                if (playerAge == null || playerAge < normalizedAgeMin || playerAge > normalizedAgeMax) {
                                    return@filter false
                                }

                                val playerValue = parseMarketValueToEuro(player.marketValue)
                                if (normalizedValueMin > 0 && (playerValue == null || playerValue < normalizedValueMin)) {
                                    return@filter false
                                }
                                if (normalizedValueMax > 0 && playerValue != null && playerValue > normalizedValueMax) {
                                    return@filter false
                                }
                                true
                            }

                            Log.d(TAG, "Find Next returned ${filteredResults.size} filtered results")
                            val newSeenUrls = currentSeenUrls + filteredResults.mapNotNull { it.url }
                            _findNextState.update {
                                it.copy(
                                    isSearching = false,
                                    response = response.copy(
                                        results = filteredResults,
                                        resultCount = filteredResults.size
                                    ),
                                    errorMessage = response.error,
                                    seenUrls = newSeenUrls
                                )
                            }
                        }
                        .onFailure { e ->
                            Log.e(TAG, "Find Next failed", e)
                            _findNextState.update {
                                it.copy(
                                    isSearching = false,
                                    errorMessage = e.message ?: "Find Next failed"
                                )
                            }
                        }
                }
            } catch (e: TimeoutCancellationException) {
                _findNextState.update {
                    it.copy(isSearching = false, errorMessage = "Search timed out. Please try again.")
                }
            }
        }
    }

    private fun parseMarketValueToEuro(value: String?): Int? {
        if (value.isNullOrBlank()) return null
        val normalized = value.trim().replace(",", "").lowercase()
        val number = normalized.filter { it.isDigit() || it == '.' }.toDoubleOrNull() ?: return null
        return when {
            normalized.contains("m") -> (number * 1_000_000).toInt()
            normalized.contains("k") -> (number * 1_000).toInt()
            else -> number.toInt()
        }
    }
}
