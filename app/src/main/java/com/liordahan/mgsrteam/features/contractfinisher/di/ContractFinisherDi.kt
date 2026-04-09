package com.liordahan.mgsrteam.features.contractfinisher.di

import com.liordahan.mgsrteam.features.contractfinisher.ContractFinisherViewModel
import com.liordahan.mgsrteam.features.contractfinisher.IContractFinisherViewModel
import com.liordahan.mgsrteam.transfermarket.ContractFinisher
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val contractFinisherModule = module {

    single { ContractFinisher() }
    viewModel<IContractFinisherViewModel> { ContractFinisherViewModel(get(), get(), get()) }
}
