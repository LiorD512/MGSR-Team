package com.liordahan.mgsrteam.features.home.di

import com.liordahan.mgsrteam.features.home.HomeScreenViewModel
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.transfermarket.TransferWindows
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val homeScreenModule = module {
    single { TransferWindows() }
    viewModel<IHomeScreenViewModel> { HomeScreenViewModel(get(), get(), androidContext()) }
}
