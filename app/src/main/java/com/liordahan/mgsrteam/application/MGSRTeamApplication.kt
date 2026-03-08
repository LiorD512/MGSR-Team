package com.liordahan.mgsrteam.application

import android.app.Application
import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.liordahan.mgsrteam.application.di.applicationModules
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.localization.LocaleManager
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import org.koin.core.context.startKoin
import org.koin.core.logger.Level

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

    }

}
