package com.liordahan.mgsrteam.features.home.di

import com.liordahan.mgsrteam.features.home.HomeScreenViewModel
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val homeScreenModule = module {
    viewModel<IHomeScreenViewModel> { HomeScreenViewModel() }
}