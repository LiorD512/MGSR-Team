package com.liordahan.mgsrteam.work

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.MarketValueEntry
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * Background worker that refreshes a small batch of players from Transfermarkt
 * and appends market value history. Runs periodically (e.g. daily).
 */
class PlayerRefreshWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val firebaseHandler = FirebaseHandler()
        val playersUpdate = PlayersUpdate()
        val store = FirebaseFirestore.getInstance()
        val playersRef = store.collection(firebaseHandler.playersTable)

        try {
            val snapshot = playersRef
                .whereNotEqualTo("tmProfile", null)
                .limit(BATCH_SIZE.toLong())
                .get()
                .await()

            val players = snapshot.toObjects(Player::class.java)
            val docRefs = snapshot.documents

            if (players.isEmpty()) return@withContext Result.success()

            val becameWithoutClubCount = mutableListOf<Unit>() // count only

            for (i in players.indices) {
                val player = players[i]
                val tmProfile = player.tmProfile ?: continue
                val docRef = docRefs.getOrNull(i)?.reference ?: continue

                when (val result = playersUpdate.updatePlayerByTmProfile(tmProfile)) {
                    is TransfermarktResult.Success -> {
                        result.data?.let { data ->
                            val currentValue = player.marketValue
                            val newValue = data.marketValue
                            val history = if (newValue != null && newValue != currentValue) {
                                val entry = MarketValueEntry(value = newValue, date = System.currentTimeMillis())
                                val list = (player.marketValueHistory?.toMutableList() ?: mutableListOf()).apply { add(entry) }
                                list.takeLast(MAX_HISTORY_ENTRIES) // keep last N
                            } else {
                                player.marketValueHistory
                            }

                            val club = data.currentClub?.let {
                                Club(
                                    clubName = it.clubName,
                                    clubLogo = it.clubLogo,
                                    clubTmProfile = it.clubTmProfile,
                                    clubCountry = it.clubCountry
                                )
                            }

                            val newClubName = club?.clubName
                            val wasWithClub = !player.currentClub?.clubName.isNullOrBlank() &&
                                !player.currentClub?.clubName.equals("Without club", true)
                            val nowWithoutClub = newClubName != null && newClubName.equals("Without club", true)
                            if (wasWithClub && nowWithoutClub) {
                                becameWithoutClubCount.add(Unit)
                            }

                            val updated = player.copy(
                                marketValue = newValue ?: player.marketValue,
                                profileImage = data.profileImage ?: player.profileImage,
                                nationalityFlag = data.nationalityFlag ?: player.nationalityFlag,
                                nationality = data.citizenship ?: player.nationality,
                                age = data.age ?: player.age,
                                contractExpired = data.contract ?: player.contractExpired,
                                positions = data.positions ?: player.positions,
                                currentClub = club ?: player.currentClub,
                                marketValueHistory = history
                            )
                            docRef.set(updated).await()
                        }
                    }
                    is TransfermarktResult.Failed -> { /* skip this player */ }
                }
                // Small delay to avoid hammering Transfermarkt
                delay(2000)
            }

            if (becameWithoutClubCount.isNotEmpty()) {
                showWithoutClubNotification(becameWithoutClubCount.size)
            }

            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private fun showWithoutClubNotification(count: Int) {
        val channelId = "mgsr_without_club"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                applicationContext.getString(R.string.notification_channel_without_club),
                NotificationManager.IMPORTANCE_DEFAULT
            )
            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.mgsr_circle_black)
            .setContentTitle(applicationContext.getString(R.string.notification_without_club_title))
            .setContentText(applicationContext.getString(R.string.notification_without_club_body, count))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID_WITHOUT_CLUB, notification)
    }

    companion object {
        private const val BATCH_SIZE = 5
        private const val MAX_HISTORY_ENTRIES = 24
        private const val NOTIFICATION_ID_WITHOUT_CLUB = 1003
    }
}
