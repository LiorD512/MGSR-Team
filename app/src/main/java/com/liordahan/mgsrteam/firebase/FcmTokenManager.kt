package com.liordahan.mgsrteam.firebase

import android.content.Context
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessaging
import com.liordahan.mgsrteam.localization.LocaleManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class FcmTokenManager(
    private val context: Context
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun registerTokenIfNeeded() {
        scope.launch {
            val user = FirebaseAuth.getInstance().currentUser
            if (user == null) {
                Log.d(TAG, "No authenticated user — skipping token registration")
                return@launch
            }

            val messaging = FirebaseMessaging.getInstance()

            // Force-refresh the token once after each install to clear stale
            // cached tokens that FCM servers no longer recognise (UNREGISTERED).
            if (!prefs.getBoolean(KEY_TOKEN_REFRESHED, false)) {
                try {
                    Log.i(TAG, "First run after install — deleting stale FCM token")
                    messaging.deleteToken().await()
                    Log.i(TAG, "Stale token deleted, requesting fresh one…")
                } catch (e: Exception) {
                    Log.w(TAG, "deleteToken failed (non-fatal): ${e.message}")
                }
            }

            // Get (or generate) a valid token
            val token: String
            try {
                token = messaging.token.await()
                Log.i(TAG, "FCM token: ${token.take(30)}…")
                prefs.edit().putBoolean(KEY_TOKEN_REFRESHED, true).apply()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to obtain FCM token: ${e.message}")
                return@launch
            }

            // Subscribe to topic
            try {
                messaging.subscribeToTopic(FCM_TOPIC).await()
                Log.i(TAG, "Subscribed to topic '$FCM_TOPIC'")
            } catch (e: Exception) {
                Log.w(TAG, "Topic subscription failed: ${e.message}")
            }

            // Save token to Firestore (for direct-device messages)
            saveTokenToFirestore(token, user.email)
        }
    }

    companion object {
        private const val TAG = "FcmTokenManager"
        private const val PREFS_NAME = "fcm_prefs"
        private const val KEY_TOKEN_REFRESHED = "token_refreshed_v1"
        /** Must match the topic used by the Cloud Function (onNewFeedEvent). */
        const val FCM_TOPIC = "mgsr_all"
    }

    private suspend fun saveTokenToFirestore(token: String, email: String?) {
        if (email.isNullOrBlank()) return
        try {
            val language = LocaleManager.getSavedLanguage(context)
            SharedCallables.accountUpdate(
                email = email,
                fields = mapOf("fcmToken" to token, "language" to language)
            )
            Log.i(TAG, "FCM token + language ($language) saved via callable for $email")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to save token to Firestore: ${e.message}")
        }
    }
}
