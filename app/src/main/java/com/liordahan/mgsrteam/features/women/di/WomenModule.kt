package com.liordahan.mgsrteam.features.women.di

import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.repository.WomenContactsRepository
import com.liordahan.mgsrteam.features.women.repository.WomenPlayersRepository
import com.liordahan.mgsrteam.features.women.repository.WomenRequestsRepository
import com.liordahan.mgsrteam.features.women.repository.WomenShortlistRepository
import com.liordahan.mgsrteam.features.women.viewmodel.WomenAddPlayerViewModel
import com.liordahan.mgsrteam.features.women.viewmodel.WomenContactsViewModel
import com.liordahan.mgsrteam.features.women.viewmodel.WomenHomeViewModel
import com.liordahan.mgsrteam.features.women.viewmodel.WomenPlayerInfoViewModel
import com.liordahan.mgsrteam.features.women.viewmodel.WomenPlayersViewModel
import com.liordahan.mgsrteam.features.women.viewmodel.WomenRequestsViewModel
import com.liordahan.mgsrteam.features.women.viewmodel.WomenShadowTeamsViewModel
import com.liordahan.mgsrteam.features.women.viewmodel.WomenShortlistViewModel
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Women-dedicated Koin DI module.
 * Wires all women-specific singletons and ViewModels.
 * All dependencies are isolated from men/youth — no PlatformManager dependency.
 */
val womenModule = module {

    // ── Data layer ───────────────────────────────────────────────────
    single { WomenFirebaseHandler() }

    // ── Repositories ─────────────────────────────────────────────────
    single { WomenPlayersRepository(get()) }
    single { WomenContactsRepository(get()) }
    single { WomenRequestsRepository(get()) }
    single { WomenShortlistRepository(get()) }

    // ── ViewModels ───────────────────────────────────────────────────

    viewModel { WomenPlayersViewModel(get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get(), get()) }

    viewModel { WomenContactsViewModel(get(), get()) }

    viewModel { WomenShortlistViewModel(get()) }

    viewModel { WomenRequestsViewModel(get<WomenRequestsRepository>(), get<WomenPlayersRepository>(), get<WomenFirebaseHandler>(), get()) }

    viewModel { WomenHomeViewModel(get<WomenFirebaseHandler>(), get(), androidContext()) }

    viewModel { WomenAddPlayerViewModel(get(), get<WomenFirebaseHandler>()) }

    viewModel {
        WomenPlayerInfoViewModel(
            appContext = androidContext(),
            firebaseHandler = get<WomenFirebaseHandler>(),
            documentsRepository = get(),          // shared PlayerDocumentsRepository
            documentDetectionService = get(),     // shared DocumentDetectionService
            aiHelperService = get(),              // shared AiHelperService
            requestsRepository = get<WomenRequestsRepository>(),
            offersRepository = get()              // shared IPlayerOffersRepository
        )
    }

    viewModel { WomenShadowTeamsViewModel(get<WomenFirebaseHandler>(), get<WomenPlayersRepository>()) }
}
