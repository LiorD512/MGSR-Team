package com.liordahan.mgsrteam.features.players.filters.repository

import com.liordahan.mgsrteam.features.players.sort.SortOption
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

interface ISortRepository {
    val sortFilterOption: StateFlow<SortOption>
    fun setSortOption(option: SortOption)
    fun resetSortOption()
}

class SortRepository : ISortRepository {

    private val _sortFilterOption = MutableStateFlow(SortOption.DEFAULT)
    override val sortFilterOption: StateFlow<SortOption> = _sortFilterOption


    override fun setSortOption(option: SortOption) {
        if (sortFilterOption.value == option) return
        _sortFilterOption.update { option }
    }

    override fun resetSortOption() {
        _sortFilterOption.update { SortOption.DEFAULT }
    }


}