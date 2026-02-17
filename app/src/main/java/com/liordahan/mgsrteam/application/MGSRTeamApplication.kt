package com.liordahan.mgsrteam.application

import android.app.Application
import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessaging
import com.liordahan.mgsrteam.application.di.applicationModules
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.work.PlayerRefreshWorker
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import org.koin.core.context.startKoin
import org.koin.core.logger.Level
import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

class MGSRTeamApplication : Application(), KoinComponent {

    /**
     * Override system locale with the user's chosen language at the root.
     * This ensures the Application context (and all derived contexts) use
     * the user's choice, not the system locale.
     */
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(LocaleManager.setLocale(base))
    }

    override fun onCreate() {
        super.onCreate()

        PDFBoxResourceLoader.init(applicationContext)

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

        // Schedule nightly player data refresh from Transfermarkt at 02:00 Israel time
        schedulePlayerRefresh()
    }

    /**
     * Schedules [PlayerRefreshWorker] to run every 24 hours, starting at the
     * next 02:00 AM Israel time (Asia/Jerusalem). Requires network connectivity.
     *
     * Uses [ExistingPeriodicWorkPolicy.UPDATE] so the schedule is replaced once
     * (important for the migration from the old "anytime" schedule). After that
     * it repeats every 24 hours from whenever the first run executed (~02:00).
     */
    private fun schedulePlayerRefresh() {
        val israelZone = ZoneId.of("Asia/Jerusalem")
        val now = ZonedDateTime.now(israelZone)
        var nextRun = now
            .withHour(TARGET_HOUR)
            .withMinute(0)
            .withSecond(0)
            .withNano(0)

        // If 02:00 today has already passed, schedule for tomorrow
        if (!now.isBefore(nextRun)) {
            nextRun = nextRun.plusDays(1)
        }

        val initialDelay = Duration.between(now, nextRun).toMillis()

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<PlayerRefreshWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            PlayerRefreshWorker::class.java.simpleName,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }

    companion object {
        /** Target hour in Israel time (Asia/Jerusalem) for the nightly refresh. */
        private const val TARGET_HOUR = 2
    }
}
