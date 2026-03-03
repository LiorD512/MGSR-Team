package com.liordahan.mgsrteam.features.aiscout

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.localization.LocaleManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
    val ageMax: Int = 23,
    val valueMax: Int = 3_000_000,
    val isSearching: Boolean = false,
    val response: FindNextResponse? = null,
    val errorMessage: String? = null
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
    abstract fun updateFindNextAgeMax(age: Int)
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
    }

    override fun loadMore() {
        val currentState = _uiState.value
        if (currentState.isLoading || !currentState.hasMore) return

        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        viewModelScope.launch {
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

    override fun updateFindNextAgeMax(age: Int) {
        _findNextState.update { it.copy(ageMax = age) }
    }

    override fun updateFindNextValueMax(value: Int) {
        _findNextState.update { it.copy(valueMax = value) }
    }

    override fun findNextSearch() {
        val name = _findNextState.value.playerName.trim()
        if (name.isBlank()) return

        _findNextState.update {
            it.copy(isSearching = true, errorMessage = null, response = null)
        }

        viewModelScope.launch {
            val request = FindNextRequest(
                playerName = name,
                ageMax = _findNextState.value.ageMax,
                valueMax = _findNextState.value.valueMax,
                lang = lang
            )

            apiClient.findNext(request)
                .onSuccess { response ->
                    Log.d(TAG, "Find Next returned ${response.results.size} results")
                    _findNextState.update {
                        it.copy(
                            isSearching = false,
                            response = response,
                            errorMessage = response.error
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
    }
}
