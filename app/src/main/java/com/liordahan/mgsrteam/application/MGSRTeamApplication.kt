package com.liordahan.mgsrteam.application

import android.app.Application
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.liordahan.mgsrteam.application.di.applicationModules
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.work.ContractExpiryWorker
import com.liordahan.mgsrteam.work.PlayerRefreshWorker
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import org.koin.core.context.startKoin
import org.koin.core.logger.Level
import java.util.concurrent.TimeUnit

class MGSRTeamApplication : Application(), KoinComponent {

    override fun onCreate() {
        super.onCreate()

        startKoin {
            androidContext(this@MGSRTeamApplication)
            androidLogger(Level.ERROR)
            modules(applicationModules)
        }

        // Register FCM token when app starts (if user already logged in)
        val fcmTokenManager: FcmTokenManager by inject()
        fcmTokenManager.registerTokenIfNeeded()

        // Schedule contract expiry reminder (daily)
        scheduleContractExpiryReminder()
        // Schedule player data refresh from Transfermarkt (daily)
        schedulePlayerRefresh()
    }

    private fun scheduleContractExpiryReminder() {
        val request = PeriodicWorkRequestBuilder<ContractExpiryWorker>(1, TimeUnit.DAYS)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            ContractExpiryWorker::class.java.simpleName,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    private fun schedulePlayerRefresh() {
        val request = PeriodicWorkRequestBuilder<PlayerRefreshWorker>(1, TimeUnit.DAYS)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            PlayerRefreshWorker::class.java.simpleName,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }
}