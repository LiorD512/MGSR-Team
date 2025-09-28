package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import com.liordahan.mgsrteam.features.players.models.Position
import kotlinx.coroutines.flow.Flow

interface IGetPositionFilterFlowUseCase {
    operator fun invoke(): Flow<List<Position>>
}

class GetPositionFilterFlowUseCase(
    private val filterRepository: IFilterRepository
) : IGetPositionFilterFlowUseCase {

    override fun invoke(): Flow<List<Position>> = filterRepository.positionFilterList

}