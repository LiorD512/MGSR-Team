package com.liordahan.mgsrteam.application.di

import com.liordahan.mgsrteam.features.add.di.addPlayerModule
import com.liordahan.mgsrteam.features.home.di.homeScreenModule
import com.liordahan.mgsrteam.features.login.di.loginModule
import com.liordahan.mgsrteam.features.players.di.playersModule
import com.liordahan.mgsrteam.features.releases.di.releasesModule

val applicationModules = listOf(
    mainModule,
    loginModule,
    homeScreenModule,
    playersModule,
    releasesModule,
    addPlayerModule
)