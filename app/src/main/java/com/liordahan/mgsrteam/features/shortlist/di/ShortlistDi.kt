package com.liordahan.mgsrteam.features.shortlist.di

import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.features.shortlist.ShortlistViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val shortlistModule = module {

    single { ShortlistRepository(get(), get()) }
    viewModel<ShortlistViewModel> { ShortlistViewModel(get()) }
}
