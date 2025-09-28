package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import com.liordahan.mgsrteam.features.players.models.Position
import kotlinx.coroutines.flow.Flow

interface IGetAgentFilterFlowUseCase {
    operator fun invoke(): Flow<List<Account>>
}

class GetAgentFilterFlowUseCase(
    private val filterRepository: IFilterRepository
) : IGetAgentFilterFlowUseCase {

    override fun invoke(): Flow<List<Account>> = filterRepository.agentFilterList

}