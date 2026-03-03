package com.liordahan.mgsrteam.features.aiscout.di

import com.liordahan.mgsrteam.features.aiscout.AiScoutViewModel
import com.liordahan.mgsrteam.features.aiscout.IAiScoutViewModel
import com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val aiScoutModule = module {
    single { MgsrWebApiClient(androidContext()) }
    viewModel<IAiScoutViewModel> { AiScoutViewModel(get(), androidContext()) }
}
