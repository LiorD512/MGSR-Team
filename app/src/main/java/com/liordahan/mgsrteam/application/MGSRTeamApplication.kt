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
import com.liordahan.mgsrteam.work.ClubContactsRefreshWorker
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

        // Schedule nightly player data refresh from Transfermarkt at 02:00 Israel time
        schedulePlayerRefresh()
        Log.i("MGSR_Worker", "PlayerRefreshWorker: periodic schedule enqueued (02:00 Israel)")
        // Schedule nightly releases fetch at 03:00 Israel time (new free agents → push notifications)
        ReleasesRefreshWorker.schedule(this)
        Log.i("MGSR_Worker", "ReleasesRefreshWorker: periodic schedule enqueued (03:00 Israel)")
        // Schedule nightly mandate expiry check at 04:00 Israel time
        MandateExpiryWorker.schedule(this)
        Log.i("MGSR_Worker", "MandateExpiryWorker: periodic schedule enqueued (04:00 Israel)")
        // Schedule monthly club contacts re-validation at 05:00 Israel time
        ClubContactsRefreshWorker.schedule(this)
        Log.i("MGSR_Worker", "ClubContactsRefreshWorker: periodic schedule enqueued (05:00 Israel, monthly)")

        // If the user is already logged in, check whether the last successful
        // refresh was more than 24 h ago. If so, enqueue an immediate catch-up
        // run (e.g. when the nightly 02:00 run was missed). On fresh install
        // currentUser is null so this is a no-op; the login screen triggers
        // the first refresh after authentication instead.
        val currentUser = FirebaseAuth.getInstance().currentUser
        if (currentUser != null) {
            Log.i("MGSR_Worker", "User logged in (${currentUser.email}) — checking if workers need immediate run")
            if (BuildConfig.DEBUG) {
                Log.i("MGSR_Worker", "DEBUG build — forcing immediate run of all workers for testing")
                PlayerRefreshWorker.enqueueImmediateRefresh(this)
                ReleasesRefreshWorker.enqueueImmediateRefresh(this)
                MandateExpiryWorker.enqueueImmediateRefresh(this)
                ClubContactsRefreshWorker.enqueueImmediateRefresh(this)
            } else {
                PlayerRefreshWorker.enqueueIfStale(this)
                ReleasesRefreshWorker.enqueueIfStale(this)
                MandateExpiryWorker.enqueueIfStale(this)
                ClubContactsRefreshWorker.enqueueIfStale(this)
            }
        } else {
            Log.i("MGSR_Worker", "User not logged in — workers will run after login")
        }
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
