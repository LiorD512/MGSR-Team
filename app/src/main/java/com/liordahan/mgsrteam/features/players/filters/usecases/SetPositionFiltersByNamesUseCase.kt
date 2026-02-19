package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository

interface ISetPositionFiltersByNamesUseCase {
    operator fun invoke(names: List<String>)
}

class SetPositionFiltersByNamesUseCase(
    private val filterRepository: IFilterRepository
) : ISetPositionFiltersByNamesUseCase {

    override fun invoke(names: List<String>) {
        filterRepository.setPositionFiltersByNames(names)
    }
}
