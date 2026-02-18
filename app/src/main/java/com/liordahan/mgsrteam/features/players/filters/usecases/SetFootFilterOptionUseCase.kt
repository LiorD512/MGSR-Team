package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.FootFilterOption
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository

interface ISetFootFilterOptionUseCase {
    operator fun invoke(option: FootFilterOption)
}

class SetFootFilterOptionUseCase(
    private val filterRepository: IFilterRepository
) : ISetFootFilterOptionUseCase {

    override fun invoke(option: FootFilterOption) {
        filterRepository.setFootFilterOption(option)
    }

}
