package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository

interface ISetContractFilterOptionUseCase {
    operator fun invoke(option: ContractFilterOption)
}

class SetContractFilterOptionUseCase(
    private val filterRepository: IFilterRepository
) : ISetContractFilterOptionUseCase {

    override fun invoke(option: ContractFilterOption) {
        filterRepository.setContractFilterOption(option)
    }

}