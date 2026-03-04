package com.liordahan.mgsrteam.features.women.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.women.models.WomenShortlistEntry
import com.liordahan.mgsrteam.features.women.repository.WomenShortlistRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Women-dedicated shortlist UI state.
 */
data class WomenShortlistUiState(
    val entries: List<WomenShortlistEntry> = emptyList(),
    val isLoading: Boolean = true
)

/**
 * Women-dedicated shortlist ViewModel.
 */
class WomenShortlistViewModel(
    private val repository: WomenShortlistRepository
) : ViewModel() {

    private val _shortlistFlow = MutableStateFlow(WomenShortlistUiState())
    val shortlistFlow: StateFlow<WomenShortlistUiState> = _shortlistFlow.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getShortlistFlow().collect { entries ->
                _shortlistFlow.update { it.copy(entries = entries, isLoading = false) }
            }
        }
    }

    fun remove(entry: WomenShortlistEntry) {
        viewModelScope.launch { repository.removeFromShortlist(entry.tmProfileUrl) }
    }

    fun removeByUrl(tmProfileUrl: String) {
        viewModelScope.launch { repository.removeFromShortlist(tmProfileUrl) }
    }

    fun addByUrl(tmProfileUrl: String) {
        viewModelScope.launch { repository.addToShortlistByUrl(tmProfileUrl) }
    }

    fun addNote(tmProfileUrl: String, text: String) {
        viewModelScope.launch { repository.addNoteToEntry(tmProfileUrl, text) }
    }

    fun updateNote(tmProfileUrl: String, noteIndex: Int, newText: String) {
        viewModelScope.launch { repository.updateNoteInEntry(tmProfileUrl, noteIndex, newText) }
    }

    fun deleteNote(tmProfileUrl: String, noteIndex: Int) {
        viewModelScope.launch { repository.deleteNoteFromEntry(tmProfileUrl, noteIndex) }
    }
}
