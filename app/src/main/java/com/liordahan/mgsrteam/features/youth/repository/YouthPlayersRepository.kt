package com.liordahan.mgsrteam.features.youth.repository

import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.liordahan.mgsrteam.features.youth.data.YouthFirebaseHandler
import com.liordahan.mgsrteam.features.youth.models.YouthPlayer
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Youth player with Firestore document ID.
 */
data class YouthPlayerWithId(val id: String, val player: YouthPlayer)

/**
 * Youth-dedicated players repository.
 * Hardcoded to "PlayersYouth" collection — no PlatformManager dependency.
 */
class YouthPlayersRepository(
    private val firebaseHandler: YouthFirebaseHandler
) {

    fun playersFlow(): Flow<List<YouthPlayer>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.playersTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.toObjects(YouthPlayer::class.java) ?: emptyList()
                trySend(list.sortedByDescending { it.createdAt ?: 0L })
            }
        awaitClose { listener.remove() }
    }

    fun playersWithIdsFlow(): Flow<List<YouthPlayerWithId>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.playersTable)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.documents?.mapNotNull { doc ->
                    doc.toObject(YouthPlayer::class.java)?.let { YouthPlayerWithId(doc.id, it) }
                } ?: emptyList()
                trySend(list)
            }
        awaitClose { listener.remove() }
    }
}
