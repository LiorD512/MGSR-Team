package com.liordahan.mgsrteam.features.clubchanges.di

import com.liordahan.mgsrteam.features.clubchanges.ClubChangesViewModel
import com.liordahan.mgsrteam.features.clubchanges.IClubChangesViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val clubChangesModule = module {
    viewModel<IClubChangesViewModel> { ClubChangesViewModel(get(), get()) }
}
