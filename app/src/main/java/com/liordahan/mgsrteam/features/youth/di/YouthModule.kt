package com.liordahan.mgsrteam.features.youth.di

import com.liordahan.mgsrteam.features.youth.data.YouthFirebaseHandler
import com.liordahan.mgsrteam.features.youth.repository.YouthContactsRepository
import com.liordahan.mgsrteam.features.youth.repository.YouthPlayersRepository
import com.liordahan.mgsrteam.features.youth.repository.YouthRequestsRepository
import com.liordahan.mgsrteam.features.youth.repository.YouthShortlistRepository
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthAddPlayerViewModel
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthContactsViewModel
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthHomeViewModel
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthPlayerInfoViewModel
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthPlayersViewModel
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthRequestsViewModel
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthShadowTeamsViewModel
import com.liordahan.mgsrteam.features.youth.viewmodel.YouthShortlistViewModel
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val youthModule = module {

    // ── Data layer ───────────────────────────────────────────────────
    single { YouthFirebaseHandler() }

    // ── Repositories ─────────────────────────────────────────────────
    single { YouthPlayersRepository(get()) }
    single { YouthContactsRepository(get()) }
    single { YouthRequestsRepository(get()) }
    single { YouthShortlistRepository(get()) }

    // ── ViewModels ───────────────────────────────────────────────────

    viewModel { YouthPlayersViewModel(get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get()) }

    viewModel { YouthContactsViewModel(get(), get()) }

    viewModel { YouthShortlistViewModel(get()) }

    viewModel { YouthRequestsViewModel(get<YouthRequestsRepository>(), get<YouthPlayersRepository>(), get<YouthFirebaseHandler>(), get()) }

    viewModel { YouthHomeViewModel(get<YouthFirebaseHandler>(), get(), androidContext()) }

    viewModel { YouthAddPlayerViewModel(get<YouthFirebaseHandler>()) }

    viewModel {
        YouthPlayerInfoViewModel(
            appContext = androidContext(),
            firebaseHandler = get<YouthFirebaseHandler>(),
            documentsRepository = get(),          // shared PlayerDocumentsRepository
            documentDetectionService = get(),     // shared DocumentDetectionService
            aiHelperService = get(),              // shared AiHelperService
            requestsRepository = get<YouthRequestsRepository>(),
            offersRepository = get()              // shared IPlayerOffersRepository
        )
    }

    viewModel { YouthShadowTeamsViewModel(get<YouthFirebaseHandler>(), get<YouthPlayersRepository>()) }
}
