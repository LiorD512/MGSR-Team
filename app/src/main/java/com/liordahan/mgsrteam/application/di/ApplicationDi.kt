package com.liordahan.mgsrteam.application.di

import com.liordahan.mgsrteam.features.add.di.addPlayerModule
import com.liordahan.mgsrteam.features.contacts.di.contactsModule
import com.liordahan.mgsrteam.features.contractfinisher.di.contractFinisherModule
import com.liordahan.mgsrteam.features.home.di.homeScreenModule
import com.liordahan.mgsrteam.features.login.di.loginModule
import com.liordahan.mgsrteam.features.players.di.playersModule
import com.liordahan.mgsrteam.features.releases.di.releasesModule
import com.liordahan.mgsrteam.features.requests.di.requestsModule
import com.liordahan.mgsrteam.features.returnee.di.returneeModule
import com.liordahan.mgsrteam.features.shadowteams.di.shadowTeamsModule
import com.liordahan.mgsrteam.features.shortlist.di.shortlistModule

val applicationModules = listOf(
    mainModule,
    loginModule,
    homeScreenModule,
    releasesModule,
    playersModule,
    contractFinisherModule,
    addPlayerModule,
    returneeModule,
    contactsModule,
    shortlistModule,
    requestsModule,
    shadowTeamsModule
)