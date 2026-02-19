package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.FootFilterOption
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import kotlinx.coroutines.flow.Flow

interface IGetFootFilterOptionUseCase {
    operator fun invoke(): Flow<FootFilterOption>
}

class GetFootFilterOptionUseCase(
    private val filterRepository: IFilterRepository
) : IGetFootFilterOptionUseCase {

    override fun invoke(): Flow<FootFilterOption> = filterRepository.footFilterOption

}
