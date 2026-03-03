package com.liordahan.mgsrteam.features.warroom.di

import com.liordahan.mgsrteam.features.warroom.IWarRoomViewModel
import com.liordahan.mgsrteam.features.warroom.WarRoomViewModel
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val warRoomModule = module {
    viewModel<IWarRoomViewModel> { WarRoomViewModel(get(), androidContext()) }
}
