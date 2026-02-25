package com.liordahan.mgsrteam.features.shadowteams.di

import com.liordahan.mgsrteam.features.shadowteams.IShadowTeamsViewModel
import com.liordahan.mgsrteam.features.shadowteams.ShadowTeamsViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val shadowTeamsModule = module {
    viewModel<IShadowTeamsViewModel> { ShadowTeamsViewModel(get(), get()) }
}
