package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.FilterRepository
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import kotlinx.coroutines.flow.Flow

interface IGetIsWithNotesCheckedUseCase {
    operator fun invoke(): Flow<Boolean>
}

class GetIsWithNotesCheckedUseCase (
    private val filterRepository: IFilterRepository
): IGetIsWithNotesCheckedUseCase {


    override fun invoke(): Flow<Boolean>  = filterRepository.withNotesCheckedFlow

}