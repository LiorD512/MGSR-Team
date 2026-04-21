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
    val selectedAgentFilter: String? = null,
    /** URLs currently being removed (optimistic hide + loading indicator). */
    val removingUrls: Set<String> = emptySet(),
    /** URL currently being added. */
    val isAdding: Boolean = false,
    /** True while a note save/delete is in progress. */
    val isSavingNote: Boolean = false
)

interface IShortlistViewModel {
    val shortlistFlow: StateFlow<ShortlistUiState>
    fun remove(entry: ShortlistEntry)
    fun removeByUrl(tmProfileUrl: String)
    fun addByUrl(tmProfileUrl: String)
    fun addNote(tmProfileUrl: String, text: String, taggedAgentIds: List<String> = emptyList(), playerName: String? = null, playerImage: String? = null)
    fun updateNote(tmProfileUrl: String, noteIndex: Int, newText: String)
    fun deleteNote(tmProfileUrl: String, noteIndex: Int)
    fun setSortOption(option: SortOption)
    fun setSelectedPosition(position: String?)
    fun setWithNotesOnly(enabled: Boolean)
    fun setMyPlayersOnly(enabled: Boolean)
    fun setSelectedAgentFilter(agent: String?)
    fun markInstagramSent(tmProfileUrl: String)
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
                _shortlistFlow.update {
                    // Clear removingUrls for entries that are now actually gone
                    val stillPresent = entries.map { e -> e.tmProfileUrl }.toSet()
                    val updatedRemoving = it.removingUrls.filter { url -> stillPresent.contains(url) }.toSet()
                    it.copy(entries = entries, isLoading = false, removingUrls = updatedRemoving)
                }
            }
        }
    }

    override fun remove(entry: ShortlistEntry) {
        // Optimistic: immediately mark as removing so UI can hide/animate
        _shortlistFlow.update { it.copy(removingUrls = it.removingUrls + entry.tmProfileUrl) }
        viewModelScope.launch {
            try {
                repository.removeFromShortlist(entry.tmProfileUrl)
            } catch (_: Exception) {
                // Revert optimistic hide on failure
                _shortlistFlow.update { it.copy(removingUrls = it.removingUrls - entry.tmProfileUrl) }
            }
        }
    }

    override fun removeByUrl(tmProfileUrl: String) {
        _shortlistFlow.update { it.copy(removingUrls = it.removingUrls + tmProfileUrl) }
        viewModelScope.launch {
            try {
                repository.removeFromShortlist(tmProfileUrl)
            } catch (_: Exception) {
                _shortlistFlow.update { it.copy(removingUrls = it.removingUrls - tmProfileUrl) }
            }
        }
    }

    override fun addByUrl(tmProfileUrl: String) {
        viewModelScope.launch {
            _shortlistFlow.update { it.copy(isAdding = true) }
            try {
                repository.addToShortlist(tmProfileUrl)
            } finally {
                _shortlistFlow.update { it.copy(isAdding = false) }
            }
        }
    }

    override fun addNote(tmProfileUrl: String, text: String, taggedAgentIds: List<String>, playerName: String?, playerImage: String?) {
        viewModelScope.launch {
            _shortlistFlow.update { it.copy(isSavingNote = true) }
            try {
                repository.addNoteToEntry(tmProfileUrl, text, taggedAgentIds, playerName, playerImage)
            } finally {
                _shortlistFlow.update { it.copy(isSavingNote = false) }
            }
        }
    }

    override fun updateNote(tmProfileUrl: String, noteIndex: Int, newText: String) {
        viewModelScope.launch {
            _shortlistFlow.update { it.copy(isSavingNote = true) }
            try {
                repository.updateNoteInEntry(tmProfileUrl, noteIndex, newText)
            } finally {
                _shortlistFlow.update { it.copy(isSavingNote = false) }
            }
        }
    }

    override fun deleteNote(tmProfileUrl: String, noteIndex: Int) {
        viewModelScope.launch {
            _shortlistFlow.update { it.copy(isSavingNote = true) }
            try {
                repository.deleteNoteFromEntry(tmProfileUrl, noteIndex)
            } finally {
                _shortlistFlow.update { it.copy(isSavingNote = false) }
            }
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

    override fun markInstagramSent(tmProfileUrl: String) {
        viewModelScope.launch {
            repository.markInstagramSent(tmProfileUrl)
        }
    }
}
