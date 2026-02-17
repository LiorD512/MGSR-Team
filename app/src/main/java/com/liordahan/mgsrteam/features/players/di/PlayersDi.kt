package com.liordahan.mgsrteam.features.players.di

import android.content.Context
import com.liordahan.mgsrteam.BuildConfig
import com.liordahan.mgsrteam.features.players.IPlayersViewModel
import com.liordahan.mgsrteam.features.players.PlayersViewModel
import com.liordahan.mgsrteam.features.players.filters.IPlayerListFiltersViewModel
import com.liordahan.mgsrteam.features.players.filters.PlayerListFiltersViewModel
import com.liordahan.mgsrteam.features.players.filters.repository.FilterRepository
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import com.liordahan.mgsrteam.features.players.filters.repository.ISortRepository
import com.liordahan.mgsrteam.features.players.filters.repository.SortRepository
import com.liordahan.mgsrteam.features.players.filters.usecases.AddAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.AddPositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetAgentFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IAddAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IAddPositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetAgentFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IQuickFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemovePositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IResetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetPositionFiltersByNamesUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.QuickFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.RemoveAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.RemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.RemovePositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ResetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.SetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.SetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.SetPositionFiltersByNamesUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.SetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.playerinfo.IPlayerInfoViewModel
import com.liordahan.mgsrteam.features.players.playerinfo.PlayerInfoViewModel
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import com.liordahan.mgsrteam.features.players.playerinfo.documents.CloudVisionOcrProvider
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentDetectionService
import com.liordahan.mgsrteam.features.players.playerinfo.documents.GeminiPassportOcrProvider
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocumentsRepository
import com.liordahan.mgsrteam.features.players.playerinfo.mandate.GenerateMandateViewModel
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.players.repository.PlayersRepository
import com.liordahan.mgsrteam.features.players.sort.IPlayerListSortBottomSheetViewModel
import com.liordahan.mgsrteam.features.players.sort.PlayerListSortBottomSheetViewModel
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.bind
import org.koin.dsl.module

val playersModule = module {

    single { PlayersUpdate() }

    single { PlayersRepository(get()) } bind IPlayersRepository::class

    single {
        FilterRepository()
    } bind IFilterRepository::class

    single {
        SortRepository()
    } bind ISortRepository::class

    viewModel<IPlayersViewModel> { PlayersViewModel(get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get()) }
    single { PlayerDocumentsRepository(get()) }
    single { AiHelperService(get<PlayerSearch>()) }
    single {
        val apiKey = BuildConfig.VISION_API_KEY
        CloudVisionOcrProvider(if (apiKey.isBlank()) null else apiKey)
    }
    single { GeminiPassportOcrProvider() }
    single { DocumentDetectionService(get<Context>(), get<CloudVisionOcrProvider>(), get<GeminiPassportOcrProvider>()) }
    viewModel<IPlayerInfoViewModel> { PlayerInfoViewModel(get(), get(), get(), get(), get()) }
    viewModel { GenerateMandateViewModel() }
    viewModel<IPlayerListFiltersViewModel> {
        PlayerListFiltersViewModel(
            get(),
            get(),
            get(),
            get(),
            get(),
            get(),
            get(),
            get()
        )
    }

    viewModel<IPlayerListSortBottomSheetViewModel> {
        PlayerListSortBottomSheetViewModel(get(), get())
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

    factory<ISetPositionFiltersByNamesUseCase> {
        SetPositionFiltersByNamesUseCase(
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

    factory<ISetSortOptionUseCase> {
        SetSortOptionUseCase(
            get()
        )
    }

    factory<IGetSortOptionUseCase> {
        GetSortOptionUseCase(
            get()
        )
    }

    factory<IResetSortOptionUseCase> {
        ResetSortOptionUseCase(
            get()
        )
    }

    factory<IRemoveAllFiltersUseCase> {
        RemoveAllFiltersUseCase(
            get()
        )
    }

    factory<ISetIsWithNotesCheckedUseCase> {
        SetIsWithNotesCheckedUseCase(
            get()
        )
    }

    factory<IGetIsWithNotesCheckedUseCase> {
        GetIsWithNotesCheckedUseCase(
            get()
        )
    }

    factory<IQuickFilterUseCase> {
        QuickFilterUseCase(get())
    }
}