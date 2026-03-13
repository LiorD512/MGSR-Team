package com.liordahan.mgsrteam.features.shortlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.sort.SortOption
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ShortlistUiState(
    val entries: List<ShortlistEntry> = emptyList(),
    val isLoading: Boolean = true,
    val sortOption: SortOption = SortOption.DEFAULT,
    val selectedPosition: String? = null,
    val withNotesOnly: Boolean = false,
    val myPlayersOnly: Boolean = false,
    val selectedAgentFilter: String? = null
)

interface IShortlistViewModel {
    val shortlistFlow: StateFlow<ShortlistUiState>
    fun remove(entry: ShortlistEntry)
    fun removeByUrl(tmProfileUrl: String)
    fun addByUrl(tmProfileUrl: String)
    fun addNote(tmProfileUrl: String, text: String)
    fun updateNote(tmProfileUrl: String, noteIndex: Int, newText: String)
    fun deleteNote(tmProfileUrl: String, noteIndex: Int)
    fun setSortOption(option: SortOption)
    fun setSelectedPosition(position: String?)
    fun setWithNotesOnly(enabled: Boolean)
    fun setMyPlayersOnly(enabled: Boolean)
    fun setSelectedAgentFilter(agent: String?)
}

class ShortlistViewModel(
    private val repository: ShortlistRepository
) : ViewModel(), IShortlistViewModel {

    private val _shortlistFlow = MutableStateFlow(ShortlistUiState())
    override val shortlistFlow: StateFlow<ShortlistUiState> = _shortlistFlow.asStateFlow()

    init {
        viewModelScope.launch { repository.migrateFromLegacyIfNeeded() }
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

    override fun removeByUrl(tmProfileUrl: String) {
        viewModelScope.launch {
            repository.removeFromShortlist(tmProfileUrl)
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

    override fun setSortOption(option: SortOption) {
        _shortlistFlow.update { it.copy(sortOption = option) }
    }

    override fun setSelectedPosition(position: String?) {
        _shortlistFlow.update { it.copy(selectedPosition = position) }
    }

    override fun setWithNotesOnly(enabled: Boolean) {
        _shortlistFlow.update { it.copy(withNotesOnly = enabled) }
    }

    override fun setMyPlayersOnly(enabled: Boolean) {
        _shortlistFlow.update {
            it.copy(
                myPlayersOnly = enabled,
                selectedAgentFilter = if (enabled) null else it.selectedAgentFilter
            )
        }
    }

    override fun setSelectedAgentFilter(agent: String?) {
        _shortlistFlow.update {
            it.copy(
                selectedAgentFilter = agent,
                myPlayersOnly = if (agent != null) false else it.myPlayersOnly
            )
        }
    }
}
