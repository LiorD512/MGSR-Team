package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import com.liordahan.mgsrteam.features.players.models.Position

interface IAddPositionFilterUseCase {
    operator fun invoke(position: Position)
}

class AddPositionFilterUseCase(
    private val filterRepository: IFilterRepository
) : IAddPositionFilterUseCase {

    override fun invoke(position: Position) {
        filterRepository.addPositionFilter(position)
    }

}