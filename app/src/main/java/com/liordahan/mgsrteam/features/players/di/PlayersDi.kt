package com.liordahan.mgsrteam.features.players.di

import com.liordahan.mgsrteam.features.players.IPlayersViewModel
import com.liordahan.mgsrteam.features.players.PlayersViewModel
import com.liordahan.mgsrteam.features.players.playerinfo.IPlayerInfoViewModel
import com.liordahan.mgsrteam.features.players.playerinfo.PlayerInfoViewModel
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val playersModule = module {

    single { PlayersUpdate() }
    viewModel<IPlayersViewModel> { PlayersViewModel(get(), get()) }
    viewModel<IPlayerInfoViewModel> { PlayerInfoViewModel(get(), get()) }
}