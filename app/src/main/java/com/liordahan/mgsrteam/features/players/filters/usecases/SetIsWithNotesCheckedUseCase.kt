package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository

interface ISetIsWithNotesCheckedUseCase {
    operator fun invoke(isChecked: Boolean)
}

class SetIsWithNotesCheckedUseCase (
    private val filterRepository: IFilterRepository
): ISetIsWithNotesCheckedUseCase {

    override fun invoke(isChecked: Boolean) {
        filterRepository.setIsWithNotesChecked(isChecked)
    }


}