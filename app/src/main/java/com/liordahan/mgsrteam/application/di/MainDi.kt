package com.liordahan.mgsrteam.application.di

import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.MainViewModel
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.ScrapingCacheRepository
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val mainModule = module {

    single { PlatformManager(androidContext()) }
    single { FirebaseHandler(get()) }
    single { FcmTokenManager(androidContext()) }
    single { ScrapingCacheRepository() }
    viewModel<IMainViewModel> { MainViewModel(get()) }
}