package com.liordahan.mgsrteam.features.players.repository

import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flatMapLatest

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class PlayersRepository(
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager
) : IPlayersRepository {

    /**
     * Emits the full player list. Automatically re-subscribes when the
     * active platform changes (Men → Women → Youth) so the snapshot
     * listener always points at the correct Firestore collection.
     */
    override fun playersFlow(): Flow<List<Player>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .addSnapshotListener { value, error ->
                        if (error != null) {
                            trySend(emptyList())
                            return@addSnapshotListener
                        }
                        val list = value?.toObjects(Player::class.java) ?: emptyList()
                        trySend(list.sortedByDescending { it.createdAt ?: 0L })
                    }
                awaitClose { listener.remove() }
            }
        }

    override fun playersWithIdsFlow(): Flow<List<PlayerWithId>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .orderBy("createdAt", Query.Direction.DESCENDING)
                    .addSnapshotListener { value, error ->
                        if (error != null) {
                            trySend(emptyList())
                            return@addSnapshotListener
                        }
                        val list = value?.documents?.mapNotNull { doc ->
                            doc.toObject(Player::class.java)?.let { PlayerWithId(doc.id, it) }
                        } ?: emptyList()
                        trySend(list)
                    }
                awaitClose { listener.remove() }
            }
        }
}
