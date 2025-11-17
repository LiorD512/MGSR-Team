package com.liordahan.mgsrteam.features.players.sort

import androidx.lifecycle.ViewModel
import com.liordahan.mgsrteam.features.players.filters.usecases.IResetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetSortOptionUseCase

abstract class IPlayerListSortBottomSheetViewModel : ViewModel() {

    abstract fun setSortOption(option: SortOption)
    abstract fun resetSortOption()

}

class PlayerListSortBottomSheetViewModel(
    private val setSortOptionUseCase: ISetSortOptionUseCase,
    private val resetSortOptionUseCase: IResetSortOptionUseCase
) : IPlayerListSortBottomSheetViewModel() {


    override fun setSortOption(option: SortOption) {
        setSortOptionUseCase(option)
    }

    override fun resetSortOption() {
        resetSortOptionUseCase()
    }

}