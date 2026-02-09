package com.liordahan.mgsrteam.firebase

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.liordahan.mgsrteam.MainActivity
import com.liordahan.mgsrteam.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class MgsrFirebaseMessagingService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        saveTokenToFirestore(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        message.notification?.let { notification ->
            showNotification(
                title = notification.title ?: getString(R.string.app_name),
                body = notification.body ?: "",
                data = message.data
            )
        }
        if (message.notification == null && message.data.isNotEmpty()) {
            val title = message.data["title"] ?: getString(R.string.app_name)
            val body = message.data["body"] ?: message.data["message"] ?: ""
            showNotification(title = title, body = body, data = message.data)
        }
    }

    private fun showNotification(
        title: String,
        body: String,
        data: Map<String, String>
    ) {
        val channelId = NOTIFICATION_CHANNEL_ID
        createNotificationChannel(channelId)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            data[KEY_PLAYER_ID]?.let { putExtra(EXTRA_PLAYER_ID, it) }
            data[KEY_SCREEN]?.let { putExtra(EXTRA_SCREEN, it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.mgsr_circle_black)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel(channelId: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = getString(R.string.notification_channel_description)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun saveTokenToFirestore(token: String) {
        serviceScope.launch {
            try {
                val user = FirebaseAuth.getInstance().currentUser ?: return@launch
                val email = user.email ?: return@launch
                val snapshot = FirebaseFirestore.getInstance()
                    .collection(FirebaseHandler().accountsTable)
                    .whereEqualTo("email", email)
                    .get()
                    .await()
                snapshot.documents.firstOrNull()?.reference?.update("fcmToken", token)
            } catch (_: Exception) {
                // Token will be saved on next login
            }
        }
    }

    companion object {
        private const val NOTIFICATION_CHANNEL_ID = "mgsr_team_notifications"
        private const val NOTIFICATION_ID = 1001
        const val EXTRA_PLAYER_ID = "player_id"
        const val EXTRA_SCREEN = "screen"
        private const val KEY_PLAYER_ID = "playerId"
        private const val KEY_SCREEN = "screen"
    }
}
