package com.liordahan.mgsrteam.firebase

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.liordahan.mgsrteam.MainActivity
import com.liordahan.mgsrteam.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
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

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    private fun showNotification(
        title: String,
        body: String,
        data: Map<String, String>
    ) {
        val channelId = NOTIFICATION_CHANNEL_ID
        createNotificationChannel(channelId)

        val notificationId = NOTIFICATION_ID +
            (data[KEY_PLAYER_ID]?.hashCode()?.and(0x7FFF) ?: 0)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            data[KEY_PLAYER_ID]?.let { putExtra(EXTRA_PLAYER_ID, it) }
            data[KEY_SCREEN]?.let { putExtra(EXTRA_SCREEN, it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val type = data[KEY_TYPE].orEmpty()
        val accentColor = when (type) {
            "CLUB_CHANGE" -> 0xFF2196F3.toInt()      // Blue
            "BECAME_FREE_AGENT" -> 0xFFFF9800.toInt() // Orange
            else -> 0xFF39D164.toInt()                // MGSR green (default)
        }

        val largeIcon = drawableToBitmap(R.drawable.for_app_logo, 256)

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_stat_mgsr)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setColor(accentColor)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon)
        }

        val notification = builder.build()

        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(notificationId, notification)
    }

    private fun drawableToBitmap(drawableRes: Int, sizePx: Int): Bitmap? {
        val drawable = ContextCompat.getDrawable(this, drawableRes) ?: return null
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, sizePx, sizePx)
        drawable.draw(canvas)
        return bitmap
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
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
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
        private const val KEY_TYPE = "type"
    }
}
