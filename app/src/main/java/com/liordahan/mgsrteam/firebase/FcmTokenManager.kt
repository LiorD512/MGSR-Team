package com.liordahan.mgsrteam.firebase

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class FcmTokenManager(
    private val firebaseHandler: FirebaseHandler
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun registerTokenIfNeeded() {
        scope.launch {
            try {
                val user = FirebaseAuth.getInstance().currentUser ?: return@launch
                val token = FirebaseMessaging.getInstance().token.await()
                saveTokenToFirestore(token, user.email)
                // Subscribe to the shared topic so push notifications from the
                // Cloud Function reach this device.
                FirebaseMessaging.getInstance().subscribeToTopic(FCM_TOPIC).await()
            } catch (_: Exception) {
                // Token will be requested again on next app launch or login
            }
        }
    }

    companion object {
        /** Must match the topic used by the Cloud Function (onNewFeedEvent). */
        const val FCM_TOPIC = "mgsr_all"
    }

    private suspend fun saveTokenToFirestore(token: String, email: String?) {
        if (email.isNullOrBlank()) return
        try {
            val snapshot = FirebaseFirestore.getInstance()
                .collection(firebaseHandler.accountsTable)
                .whereEqualTo("email", email)
                .get()
                .await()
            snapshot.documents.firstOrNull()?.reference?.update("fcmToken", token)
        } catch (_: Exception) {
            // Ignore
        }
    }
}
