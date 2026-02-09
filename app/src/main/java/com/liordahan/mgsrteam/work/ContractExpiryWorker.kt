package com.liordahan.mgsrteam.work

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.tasks.await
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

class ContractExpiryWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val firebaseHandler = FirebaseHandler()
            val snapshot = FirebaseFirestore.getInstance()
                .collection(firebaseHandler.playersTable)
                .get()
                .await()
            val players = snapshot.toObjects(Player::class.java)
            val expiringIn5Months = players.filter { player ->
                isContractExpiringWithinMonths(player.contractExpired, 5)
            }
            if (expiringIn5Months.isNotEmpty()) {
                showReminderNotification(expiringIn5Months.size)
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private fun isContractExpiringWithinMonths(contractExpired: String?, months: Int): Boolean {
        if (contractExpired.isNullOrEmpty() || contractExpired == "-") return false
        val formatters = listOf(
            DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ENGLISH)
        )
        val expiryDate = formatters.mapNotNull { formatter ->
            try {
                LocalDate.parse(contractExpired, formatter)
            } catch (_: DateTimeParseException) {
                null
            }
        }.firstOrNull() ?: return false
        val now = LocalDate.now()
        val threshold = now.plusMonths(months.toLong())
        return !expiryDate.isBefore(now) && !expiryDate.isAfter(threshold)
    }

    private fun showReminderNotification(count: Int) {
        val channelId = "mgsr_contract_reminder"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                applicationContext.getString(R.string.notification_channel_contract_reminder),
                NotificationManager.IMPORTANCE_DEFAULT
            )
            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.mgsr_circle_black)
            .setContentTitle(applicationContext.getString(R.string.notification_contract_reminder_title))
            .setContentText(applicationContext.getString(R.string.notification_contract_reminder_body, count))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        private const val NOTIFICATION_ID = 1002
    }
}
