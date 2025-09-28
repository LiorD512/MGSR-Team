package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import com.liordahan.mgsrteam.features.players.models.Position

interface IRemovePositionFilterUseCase {
    operator fun invoke(position: Position)
}

class RemovePositionFilterUseCase(
    private val filterRepository: IFilterRepository
) : IRemovePositionFilterUseCase {

    override fun invoke(position: Position) {
        filterRepository.removePositionFilter(position)
    }

}