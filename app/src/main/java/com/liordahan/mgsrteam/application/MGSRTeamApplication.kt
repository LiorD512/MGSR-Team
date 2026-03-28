package com.liordahan.mgsrteam.application

import android.app.Application
import android.content.Context
import android.util.Log
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.google.firebase.messaging.FirebaseMessaging
import com.liordahan.mgsrteam.application.di.applicationModules
import com.liordahan.mgsrteam.config.AppConfigManager
import com.liordahan.mgsrteam.firebase.FcmTokenManager
import com.liordahan.mgsrteam.localization.LocaleManager
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import org.koin.core.context.startKoin
import org.koin.core.logger.Level
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MGSRTeamApplication : Application(), KoinComponent, ImageLoaderFactory {

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

        // Defer heavy PDFBox disk I/O off the main thread
        Thread { PDFBoxResourceLoader.init(applicationContext) }.start()

        startKoin {
            androidContext(this@MGSRTeamApplication)
            androidLogger(Level.ERROR)
            modules(applicationModules)
        }

        // Register FCM token when app starts (if user already logged in)
        val fcmTokenManager: FcmTokenManager by inject()
        fcmTokenManager.registerTokenIfNeeded()

        // Load remote config from Firestore (positions, countries, etc.)
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            AppConfigManager.initialize()
        }

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

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.20) // 20% of available app memory
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(100L * 1024 * 1024) // 100 MB disk cache
                    .build()
            }
            .crossfade(true)
            .build()
    }

}
