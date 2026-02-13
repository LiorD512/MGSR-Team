package com.liordahan.mgsrteam.features.requests.di

import com.liordahan.mgsrteam.features.requests.RequestsViewModel
import com.liordahan.mgsrteam.features.requests.IRequestsViewModel
import com.liordahan.mgsrteam.features.requests.repository.IRequestsRepository
import com.liordahan.mgsrteam.features.requests.repository.RequestsRepository
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.bind
import org.koin.dsl.module

val requestsModule = module {
    single { RequestsRepository(get()) } bind IRequestsRepository::class
    viewModel<IRequestsViewModel> { RequestsViewModel(get(), get(), get(), get()) }
}
