package com.liordahan.mgsrteam.features.youth.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.youth.models.YouthShortlistEntry
import com.liordahan.mgsrteam.features.youth.repository.YouthShortlistRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class YouthShortlistUiState(
    val entries: List<YouthShortlistEntry> = emptyList(),
    val isLoading: Boolean = true
)

class YouthShortlistViewModel(
    private val repository: YouthShortlistRepository
) : ViewModel() {

    private val _shortlistFlow = MutableStateFlow(YouthShortlistUiState())
    val shortlistFlow: StateFlow<YouthShortlistUiState> = _shortlistFlow.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getShortlistFlow().collect { entries ->
                _shortlistFlow.update { it.copy(entries = entries, isLoading = false) }
            }
        }
    }

    fun remove(entry: YouthShortlistEntry) {
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
