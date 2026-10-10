package com.liordahan.mgsrteam.features.marketradar.di

import com.liordahan.mgsrteam.features.marketradar.IMarketRadarViewModel
import com.liordahan.mgsrteam.features.marketradar.MarketRadarApiClient
import com.liordahan.mgsrteam.features.marketradar.MarketRadarViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val marketRadarModule = module {
    single { MarketRadarApiClient() }
    viewModel<IMarketRadarViewModel> { MarketRadarViewModel(get()) }
}
