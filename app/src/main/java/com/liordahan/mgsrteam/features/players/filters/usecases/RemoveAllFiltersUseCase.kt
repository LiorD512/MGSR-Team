package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository

interface IRemoveAllFiltersUseCase {
    operator fun invoke()
}

class RemoveAllFiltersUseCase (
    private val filterRepository: IFilterRepository
) : IRemoveAllFiltersUseCase {

    override fun invoke() {
        filterRepository.removeAllFilters()
    }

}
