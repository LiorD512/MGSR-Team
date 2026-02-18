package com.liordahan.mgsrteam.features.contacts.di

import com.liordahan.mgsrteam.features.contacts.ContactsViewModel
import com.liordahan.mgsrteam.features.contacts.IContactsViewModel
import com.liordahan.mgsrteam.features.contacts.agency.AgencyDiscoveryService
import com.liordahan.mgsrteam.features.contacts.repository.ContactsRepository
import com.liordahan.mgsrteam.features.contacts.repository.IContactsRepository
import com.liordahan.mgsrteam.transfermarket.AgencySearch
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.bind
import org.koin.dsl.module

val contactsModule = module {
    single { ClubSearch() }
    single { AgencySearch() }
    single { AgencyDiscoveryService(get()) }
    single { ContactsRepository(get()) } bind IContactsRepository::class
    viewModel<IContactsViewModel> { ContactsViewModel(get(), get()) }
}
