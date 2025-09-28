package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import kotlinx.coroutines.flow.Flow

interface IGetContractFilterOptionUseCase {
    operator fun invoke(): Flow<ContractFilterOption>
}

class GetContractFilterOptionUseCase(
    private val filterRepository: IFilterRepository
) : IGetContractFilterOptionUseCase {

    override fun invoke(): Flow<ContractFilterOption> = filterRepository.contractFilterOption

}