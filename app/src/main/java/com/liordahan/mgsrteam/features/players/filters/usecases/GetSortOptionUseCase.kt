package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.ISortRepository
import com.liordahan.mgsrteam.features.players.sort.SortOption
import kotlinx.coroutines.flow.Flow

interface IGetSortOptionUseCase {
    operator fun invoke(): Flow<SortOption>
}

class GetSortOptionUseCase(
    private val sortRepository: ISortRepository
) : IGetSortOptionUseCase {

    override fun invoke(): Flow<SortOption> {
        return sortRepository.sortFilterOption
    }

}