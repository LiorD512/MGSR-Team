package com.liordahan.mgsrteam.application.di

import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.MainViewModel
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val mainModule = module {

    single { FirebaseHandler() }
    single { FcmTokenManager(get()) }
    viewModel<IMainViewModel> { MainViewModel(get()) }
}