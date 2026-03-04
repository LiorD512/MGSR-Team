package com.liordahan.mgsrteam.features.women.repository

import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenPlayer
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Women player with Firestore document ID.
 */
data class WomenPlayerWithId(val id: String, val player: WomenPlayer)

/**
 * Women-dedicated players repository.
 * Hardcoded to "PlayersWomen" collection — no PlatformManager dependency.
 */
class WomenPlayersRepository(
    private val firebaseHandler: WomenFirebaseHandler
) {

    fun playersFlow(): Flow<List<WomenPlayer>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.playersTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.toObjects(WomenPlayer::class.java) ?: emptyList()
                trySend(list.sortedByDescending { it.createdAt ?: 0L })
            }
        awaitClose { listener.remove() }
    }

    fun playersWithIdsFlow(): Flow<List<WomenPlayerWithId>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.playersTable)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.documents?.mapNotNull { doc ->
                    doc.toObject(WomenPlayer::class.java)?.let { WomenPlayerWithId(doc.id, it) }
                } ?: emptyList()
                trySend(list)
            }
        awaitClose { listener.remove() }
    }
}
