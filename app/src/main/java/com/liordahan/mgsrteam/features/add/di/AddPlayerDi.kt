package com.liordahan.mgsrteam.features.add.di

import com.liordahan.mgsrteam.features.add.AddPlayerViewModel
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val addPlayerModule = module {
    single { PlayerSearch() }
    viewModel<IAddPlayerViewModel> { AddPlayerViewModel(get(), get()) }
}