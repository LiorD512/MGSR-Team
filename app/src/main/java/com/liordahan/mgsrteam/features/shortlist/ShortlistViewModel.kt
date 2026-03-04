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
    fun removeByUrl(tmProfileUrl: String)
    fun addByUrl(tmProfileUrl: String)
    fun addNote(tmProfileUrl: String, text: String)
    fun updateNote(tmProfileUrl: String, noteIndex: Int, newText: String)
    fun deleteNote(tmProfileUrl: String, noteIndex: Int)
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
        // Optimistically remove from UI immediately
        _shortlistFlow.update { state ->
            state.copy(entries = state.entries.filter { it.tmProfileUrl != entry.tmProfileUrl })
        }
        viewModelScope.launch {
            try {
                repository.removeFromShortlist(entry.tmProfileUrl)
            } catch (e: Exception) {
                // Revert: re-add entry on failure (snapshot listener will fix order)
                _shortlistFlow.update { state ->
                    state.copy(entries = (state.entries + entry).sortedByDescending { it.addedAt })
                }
            }
        }
    }

    override fun removeByUrl(tmProfileUrl: String) {
        _shortlistFlow.update { state ->
            state.copy(entries = state.entries.filter { it.tmProfileUrl != tmProfileUrl })
        }
        viewModelScope.launch {
            try {
                repository.removeFromShortlist(tmProfileUrl)
            } catch (_: Exception) { }
        }
    }

    override fun addByUrl(tmProfileUrl: String) {
        viewModelScope.launch {
            repository.addToShortlist(tmProfileUrl)
        }
    }

    override fun addNote(tmProfileUrl: String, text: String) {
        viewModelScope.launch {
            repository.addNoteToEntry(tmProfileUrl, text)
        }
    }

    override fun updateNote(tmProfileUrl: String, noteIndex: Int, newText: String) {
        viewModelScope.launch {
            repository.updateNoteInEntry(tmProfileUrl, noteIndex, newText)
        }
    }

    override fun deleteNote(tmProfileUrl: String, noteIndex: Int) {
        viewModelScope.launch {
            repository.deleteNoteFromEntry(tmProfileUrl, noteIndex)
        }
    }
}
