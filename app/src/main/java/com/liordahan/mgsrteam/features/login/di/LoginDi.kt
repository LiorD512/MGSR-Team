package com.liordahan.mgsrteam.features.login.di

import com.liordahan.mgsrteam.features.login.ILoginScreenViewModel
import com.liordahan.mgsrteam.features.login.LoginScreenViewModel
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val loginModule = module {

    viewModel<ILoginScreenViewModel> { LoginScreenViewModel(androidContext(), get(), get()) }
}