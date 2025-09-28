package com.liordahan.mgsrteam.features.players.di

import com.liordahan.mgsrteam.features.players.IPlayersViewModel
import com.liordahan.mgsrteam.features.players.PlayersViewModel
import com.liordahan.mgsrteam.features.players.filters.IPlayerListFiltersViewModel
import com.liordahan.mgsrteam.features.players.filters.PlayerListFiltersViewModel
import com.liordahan.mgsrteam.features.players.filters.repository.FilterRepository
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import com.liordahan.mgsrteam.features.players.filters.usecases.AddAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.AddPositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetAgentFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IAddAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IAddPositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetAgentFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemovePositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.RemoveAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.RemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.RemovePositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.SetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.playerinfo.IPlayerInfoViewModel
import com.liordahan.mgsrteam.features.players.playerinfo.PlayerInfoViewModel
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.bind
import org.koin.dsl.module

val playersModule = module {

    single { PlayersUpdate() }

    single {
        FilterRepository()
    } bind IFilterRepository::class

    viewModel<IPlayersViewModel> { PlayersViewModel(get(), get(), get(), get(), get(), get()) }
    viewModel<IPlayerInfoViewModel> { PlayerInfoViewModel(get(), get()) }
    viewModel<IPlayerListFiltersViewModel> {
        PlayerListFiltersViewModel(
            get(),
            get(),
            get(),
            get(),
            get(),
            get(),
            get()
        )
    }

    factory<IAddPositionFilterUseCase> {
        AddPositionFilterUseCase(
            get()
        )
    }

    factory<IRemovePositionFilterUseCase> {
        RemovePositionFilterUseCase(
            get()
        )
    }

    factory<IAddAgentFilterUseCase> {
        AddAgentFilterUseCase(
            get()
        )
    }

    factory<IRemoveAgentFilterUseCase> {
        RemoveAgentFilterUseCase(
            get()
        )
    }

    factory<IGetPositionFilterFlowUseCase> {
        GetPositionFilterFlowUseCase(
            get()
        )
    }

    factory<IGetAgentFilterFlowUseCase> {
        GetAgentFilterFlowUseCase(
            get()
        )
    }

    factory<ISetContractFilterOptionUseCase> {
        SetContractFilterOptionUseCase(
            get()
        )
    }

    factory<IGetContractFilterOptionUseCase> {
        GetContractFilterOptionUseCase(
            get()
        )
    }

    factory<IRemoveAllFiltersUseCase> {
        RemoveAllFiltersUseCase(
            get()
        )
    }
}