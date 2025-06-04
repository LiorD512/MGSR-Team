package com.liordahan.mgsrteam.features.releases.di

import com.liordahan.mgsrteam.features.releases.IReleasesViewModel
import com.liordahan.mgsrteam.features.releases.ReleasesViewModel
import com.liordahan.mgsrteam.transfermarket.LatestReleases
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val releasesModule = module {

    single { LatestReleases() }
    viewModel<IReleasesViewModel> { ReleasesViewModel(get(), get()) }
}