package com.liordahan.mgsrteam.features.chatroom.di

import com.liordahan.mgsrteam.features.chatroom.ChatRoomViewModel
import com.liordahan.mgsrteam.features.chatroom.IChatRoomViewModel
import com.liordahan.mgsrteam.features.chatroom.repository.ChatRoomRepository
import com.liordahan.mgsrteam.features.chatroom.repository.IChatRoomRepository
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val chatRoomModule = module {
    single<IChatRoomRepository> { ChatRoomRepository(get()) }
    viewModel<IChatRoomViewModel> { ChatRoomViewModel(get(), get(), get(), androidContext()) }
}
