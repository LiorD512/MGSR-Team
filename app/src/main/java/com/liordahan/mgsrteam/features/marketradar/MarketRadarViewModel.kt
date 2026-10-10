package com.liordahan.mgsrteam.features.marketradar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * UI state for the Market Radar screen (mock SCREENS.marketRadar).
 */
data class MarketRadarUiState(
    val items: List<MarketRadarItem> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
)

abstract class IMarketRadarViewModel : ViewModel() {
    abstract val uiState: StateFlow<MarketRadarUiState>
    abstract fun load(refresh: Boolean = false)
    abstract fun retry()
}

/**
 * Fetches the Early Market Radar feed from the web's /api/market-radar route
 * (via [MarketRadarApiClient]) and exposes loading / empty / error states for
 * the editorial radar screen. The radar feed is platform-independent on the web
 * (a global league disruption scanner), so no platform arg is sent.
 */
class MarketRadarViewModel(
    private val apiClient: MarketRadarApiClient
) : IMarketRadarViewModel() {

    private val _uiState = MutableStateFlow(MarketRadarUiState())
    override val uiState: StateFlow<MarketRadarUiState> = _uiState.asStateFlow()

    init {
        load(refresh = false)
    }

    override fun load(refresh: Boolean) {
        _uiState.update {
            it.copy(
                isLoading = it.items.isEmpty(),
                isRefreshing = refresh && it.items.isNotEmpty(),
                errorMessage = null,
            )
        }
        viewModelScope.launch {
            apiClient.getMarketRadar(refresh = refresh)
                .onSuccess { items ->
                    _uiState.update {
                        it.copy(
                            items = items,
                            isLoading = false,
                            isRefreshing = false,
                            errorMessage = null,
                        )
                    }
                }
                .onFailure { throwable ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            errorMessage = throwable.message ?: "Could not load the market radar.",
                        )
                    }
                }
        }
    }

    override fun retry() = load(refresh = true)
}
