package com.liordahan.mgsrteam.application

import android.app.Application
import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessaging
import com.liordahan.mgsrteam.application.di.applicationModules
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.BuildConfig
import com.liordahan.mgsrteam.work.MandateExpiryWorker
import com.liordahan.mgsrteam.work.PlayerRefreshWorker
import com.liordahan.mgsrteam.work.ReleasesRefreshWorker
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
        Log.i("MGSR_DEBUG", "=== Subscribing to FCM topic '${FcmTokenManager.FCM_TOPIC}' ===")
        FirebaseMessaging.getInstance().subscribeToTopic(FcmTokenManager.FCM_TOPIC)
            .addOnSuccessListener { Log.i("MGSR_DEBUG", "Topic subscription SUCCESS") }
            .addOnFailureListener { Log.e("MGSR_DEBUG", "Topic subscription FAILED", it) }

        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> Log.i("MGSR_DEBUG", "FCM token: ${token.take(30)}…") }
            .addOnFailureListener { Log.e("MGSR_DEBUG", "FCM token retrieval FAILED", it) }

        // WORKERS MOVED TO CLOUD — scheduling disabled. Workers now run as:
        // - MandateExpiryWorker: Firebase Cloud Function (04:00 Israel)
        // - ReleasesRefreshWorker: Firebase Cloud Function (03:00 Israel)
        // - PlayerRefreshWorker: Cloud Run Job (02:00 Israel via Cloud Scheduler)
        // Success confirmation stored in Firestore WorkerRuns collection.
        // schedulePlayerRefresh()
        // Log.i("MGSR_Worker", "PlayerRefreshWorker: periodic schedule enqueued (02:00 Israel)")
        // ReleasesRefreshWorker.schedule(this)
        // Log.i("MGSR_Worker", "ReleasesRefreshWorker: periodic schedule enqueued (03:00 Israel)")
        // MandateExpiryWorker.schedule(this)
        // Log.i("MGSR_Worker", "MandateExpiryWorker: periodic schedule enqueued (04:00 Israel)")

        // Catch-up / immediate run — disabled; workers run on cloud only.
        // val currentUser = FirebaseAuth.getInstance().currentUser
        // if (currentUser != null) {
        //     Log.i("MGSR_Worker", "User logged in (${currentUser.email}) — checking if workers need immediate run")
        //     if (BuildConfig.DEBUG) {
        //         Log.i("MGSR_Worker", "DEBUG build — forcing immediate run of all workers for testing")
        //         PlayerRefreshWorker.enqueueImmediateRefresh(this)
        //         ReleasesRefreshWorker.enqueueImmediateRefresh(this)
        //         MandateExpiryWorker.enqueueImmediateRefresh(this)
        //     } else {
        //         PlayerRefreshWorker.enqueueIfStale(this)
        //         ReleasesRefreshWorker.enqueueIfStale(this)
        //         MandateExpiryWorker.enqueueIfStale(this)
        //     }
        // } else {
        //     Log.i("MGSR_Worker", "User not logged in — workers will run after login")
        // }
        Log.i("MGSR_Worker", "Workers run on cloud — Android scheduling disabled")
    }

    /**
     * Schedules [PlayerRefreshWorker] to run every 24 hours, starting at the
     * next 02:00 AM Israel time (Asia/Jerusalem). Requires network connectivity.
     *
     * Uses [ExistingPeriodicWorkPolicy.KEEP] so the schedule is created once
     * and never reset by subsequent app launches. This prevents re-opening the
     * app from pushing the pending run into the future (the old `UPDATE` bug).
     */
    private fun schedulePlayerRefresh() {
        val israelZone = ZoneId.of("Asia/Jerusalem")
        val now = ZonedDateTime.now(israelZone)
        var nextRun = now
            .withHour(TARGET_HOUR)
            .withMinute(0)
            .withSecond(0)
            .withNano(0)

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
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    companion object {
        private const val TARGET_HOUR = 2
        private const val PERIODIC_WORK_NAME = "PlayerRefreshWorker"
    }
}
