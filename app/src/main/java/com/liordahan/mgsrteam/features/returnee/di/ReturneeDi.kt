package com.liordahan.mgsrteam.features.returnee.di

import com.liordahan.mgsrteam.features.players.IPlayersViewModel
import com.liordahan.mgsrteam.features.players.PlayersViewModel
import com.liordahan.mgsrteam.features.returnee.IReturneeViewModel
import com.liordahan.mgsrteam.features.returnee.ReturneeViewModel
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import com.liordahan.mgsrteam.transfermarket.Returnees
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val returneeModule = module {

    single { Returnees() }
    viewModel<IReturneeViewModel> { ReturneeViewModel(get(), get()) }

}