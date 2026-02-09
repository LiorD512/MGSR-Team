package com.liordahan.mgsrteam.features.shortlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ShortlistUiState(
    val entries: List<ShortlistEntry> = emptyList(),
    val isLoading: Boolean = true
)

interface IShortlistViewModel {
    val shortlistFlow: StateFlow<ShortlistUiState>
    fun remove(entry: ShortlistEntry)
}

class ShortlistViewModel(
    private val repository: ShortlistRepository
) : ViewModel(), IShortlistViewModel {

    private val _shortlistFlow = MutableStateFlow(ShortlistUiState())
    override val shortlistFlow: StateFlow<ShortlistUiState> = _shortlistFlow.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getShortlistFlow().collect { entries ->
                _shortlistFlow.update { it.copy(entries = entries, isLoading = false) }
            }
        }
    }

    override fun remove(entry: ShortlistEntry) {
        viewModelScope.launch {
            repository.removeFromShortlist(entry.tmProfileUrl)
        }
    }
}
