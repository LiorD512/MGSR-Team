package com.liordahan.mgsrteam.application

import android.app.Application
import com.liordahan.mgsrteam.application.di.applicationModules
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.component.KoinComponent
import org.koin.core.context.startKoin
import org.koin.core.logger.Level

class MGSRTeamApplication: Application(), KoinComponent {

    override fun onCreate() {
        super.onCreate()

        startKoin {
            androidContext(this@MGSRTeamApplication)
            androidLogger(Level.ERROR)
            modules(applicationModules)
        }
    }
}