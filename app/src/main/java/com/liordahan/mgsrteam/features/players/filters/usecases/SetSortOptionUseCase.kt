package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.ISortRepository
import com.liordahan.mgsrteam.features.players.filters.repository.SortRepository
import com.liordahan.mgsrteam.features.players.sort.SortOption

interface ISetSortOptionUseCase {
    operator fun invoke(option: SortOption)
}

class SetSortOptionUseCase(
    private val sortRepository: ISortRepository
) : ISetSortOptionUseCase {

    override fun invoke(option: SortOption) {
        sortRepository.setSortOption(option)
    }

}