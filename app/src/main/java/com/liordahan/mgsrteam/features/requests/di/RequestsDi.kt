package com.liordahan.mgsrteam.features.requests.di

import com.liordahan.mgsrteam.features.requests.IRequestsViewModel
import com.liordahan.mgsrteam.features.requests.RequestsViewModel
import com.liordahan.mgsrteam.features.requests.repository.IRequestsRepository
import com.liordahan.mgsrteam.features.requests.repository.RequestsRepository
import com.liordahan.mgsrteam.features.requests.voice.RequestVoiceAnalyzer
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.bind
import org.koin.dsl.module

val requestsModule = module {
    single { RequestsRepository(get(), get(), get()) } bind IRequestsRepository::class
    single { RequestVoiceAnalyzer(get<ClubSearch>()) }
    viewModel<IRequestsViewModel> { RequestsViewModel(get(), get(), get(), get(), get()) }
}
