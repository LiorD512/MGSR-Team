package com.liordahan.mgsrteam.application

import android.app.Application
import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessaging
import com.liordahan.mgsrteam.application.di.applicationModules
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.localization.LocaleManager
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

    /**
     * Override system locale with the user's chosen language at the root.
     * This ensures the Application context (and all derived contexts) use
     * the user's choice, not the system locale.
     */
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(LocaleManager.wrapContext(base))
    }

    override fun onCreate() {
        super.onCreate()

        // Sync our saved language with AppCompat BEFORE any Activity is created.
        // This ensures AppCompatActivity.attachBaseContext applies the correct
        // locale when the first Activity starts. Since no Activity exists yet,
        // this call just stores the value — no recreation happens.
        val savedLang = LocaleManager.getSavedLanguage(this)
        AppCompatDelegate.setApplicationLocales(
            LocaleListCompat.forLanguageTags(savedLang)
        )

        startKoin {
            androidContext(this@MGSRTeamApplication)
            androidLogger(Level.ERROR)
            modules(applicationModules)
        }

        // Register FCM token when app starts (if user already logged in)
        val fcmTokenManager: FcmTokenManager by inject()
        fcmTokenManager.registerTokenIfNeeded()

        // Subscribe every device to the shared FCM topic so push notifications
        // from the Cloud Function reach all users.
        FirebaseMessaging.getInstance().subscribeToTopic(FcmTokenManager.FCM_TOPIC)

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