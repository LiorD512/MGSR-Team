package com.liordahan.mgsrteam.firebase

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.liordahan.mgsrteam.MainActivity
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.localization.LocaleManager
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
        val data = message.data

        // Prefer the data payload for localised text (Hebrew / English).
        // This callback fires when the app is in the FOREGROUND. When in
        // background, Android auto-displays the English `notification` payload
        // from the Cloud Function (critical for Xiaomi/Huawei/OPPO).
        if (data.isNotEmpty() && data.containsKey(KEY_TYPE)) {
            val (title, body) = buildLocalizedContent(data)
            showNotification(title = title, body = body, data = data)
        } else {
            message.notification?.let { notification ->
                showNotification(
                    title = notification.title ?: getString(R.string.app_name),
                    body = notification.body ?: "",
                    data = data
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    private fun buildLocalizedContent(data: Map<String, String>): Pair<String, String> {
        val ctx = LocaleManager.setLocale(this)
        val type = data[KEY_TYPE].orEmpty()
        val playerName = data[KEY_PLAYER_NAME].orEmpty()
        val oldValue = data[KEY_OLD_VALUE].orEmpty()
        val newValue = data[KEY_NEW_VALUE].orEmpty()

        return when (type) {
            TYPE_CLUB_CHANGE -> {
                val title = ctx.getString(R.string.notification_club_change_title)
                val body = ctx.getString(R.string.notification_club_change_body, playerName, oldValue, newValue)
                title to body
            }
            TYPE_BECAME_FREE_AGENT -> {
                val title = ctx.getString(R.string.notification_free_agent_title)
                val body = ctx.getString(R.string.notification_free_agent_body, playerName, oldValue)
                title to body
            }
            TYPE_MARKET_VALUE_CHANGE -> {
                val title = ctx.getString(R.string.notification_market_value_title)
                val body = ctx.getString(R.string.notification_market_value_body, playerName, oldValue, newValue)
                title to body
            }
            else -> {
                val title = data["title"] ?: ctx.getString(R.string.app_name)
                val body = data["body"] ?: data["message"] ?: ""
                title to body
            }
        }
    }

    private fun showNotification(
        title: String,
        body: String,
        data: Map<String, String>
    ) {
        createNotificationChannel()

        val notificationId = NOTIFICATION_ID +
            (data[KEY_PLAYER_NAME]?.hashCode()?.and(0x7FFF) ?: 0)

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
        val (accentColor, accentDrawable) = when (type) {
            TYPE_CLUB_CHANGE -> 0xFF2196F3.toInt() to R.drawable.notification_accent_blue
            TYPE_BECAME_FREE_AGENT -> 0xFFFF9800.toInt() to R.drawable.notification_accent_orange
            else -> 0xFF39D164.toInt() to R.drawable.notification_accent_green
        }

        val collapsed = buildCustomView(R.layout.notification_collapsed, title, body, accentDrawable, accentColor)
        val expanded = buildCustomView(R.layout.notification_expanded, title, body, accentDrawable, accentColor)

        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mgsr)
            .setColor(accentColor)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(collapsed)
            .setCustomBigContentView(expanded)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(notificationId, notification)
    }

    private fun buildCustomView(
        layoutRes: Int,
        title: String,
        body: String,
        accentDrawableRes: Int,
        accentColor: Int
    ): RemoteViews {
        return RemoteViews(packageName, layoutRes).apply {
            setTextViewText(R.id.notification_title, title)
            setTextViewText(R.id.notification_body, body)
            setInt(R.id.notification_accent, "setBackgroundResource", accentDrawableRes)
            setInt(R.id.notification_title, "setTextColor", accentColor)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ctx = LocaleManager.setLocale(this)
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                ctx.getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = ctx.getString(R.string.notification_channel_description)
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
                snapshot.documents.firstOrNull()?.reference
                    ?.update("fcmToken", token)
                    ?.await()
                Log.i("FCM", "Token refreshed and saved for $email")
            } catch (e: Exception) {
                Log.w("FCM", "Token save failed (will retry on next login): ${e.message}")
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
        private const val KEY_PLAYER_NAME = "playerName"
        private const val KEY_OLD_VALUE = "oldValue"
        private const val KEY_NEW_VALUE = "newValue"
        private const val TYPE_CLUB_CHANGE = "CLUB_CHANGE"
        private const val TYPE_BECAME_FREE_AGENT = "BECAME_FREE_AGENT"
        private const val TYPE_MARKET_VALUE_CHANGE = "MARKET_VALUE_CHANGE"
    }
}
