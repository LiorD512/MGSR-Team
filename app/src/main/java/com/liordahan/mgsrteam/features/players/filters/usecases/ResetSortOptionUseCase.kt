package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.ISortRepository

interface IResetSortOptionUseCase {
    operator fun invoke()
}

class ResetSortOptionUseCase(
    private val sortRepository: ISortRepository
) : IResetSortOptionUseCase {

    override fun invoke() {
        sortRepository.resetSortOption()
    }

}