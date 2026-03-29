package com.liordahan.mgsrteam.features.requests.repository

import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flatMapLatest

/**
 * Reads pre-computed match results written by Cloud Functions.
 * Both RequestMatchResults and PlayerMatchResults are populated by
 * Firestore triggers whenever Players or ClubRequests change.
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class MatchResultsRepository(
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager
) {

    /**
     * Flow of matching player IDs for a specific request.
     * Document: RequestMatchResults/{requestId} → { matchingPlayerIds: [...] }
     */
    fun matchingPlayerIdsForRequest(requestId: String): Flow<List<String>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.requestMatchResultsTable)
                    .document(requestId)
                    .addSnapshotListener { snapshot, error ->
                        if (error != null || snapshot == null || !snapshot.exists()) {
                            trySend(emptyList())
                            return@addSnapshotListener
                        }
                        @Suppress("UNCHECKED_CAST")
                        val ids = (snapshot.get("matchingPlayerIds") as? List<String>) ?: emptyList()
                        trySend(ids)
                    }
                awaitClose { listener.remove() }
            }
        }

    /**
     * Flow of matching request IDs for a specific player.
     * Document: PlayerMatchResults/{playerId} → { matchingRequestIds: [...] }
     */
    fun matchingRequestIdsForPlayer(playerId: String): Flow<List<String>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playerMatchResultsTable)
                    .document(playerId)
                    .addSnapshotListener { snapshot, error ->
                        if (error != null || snapshot == null || !snapshot.exists()) {
                            trySend(emptyList())
                            return@addSnapshotListener
                        }
                        @Suppress("UNCHECKED_CAST")
                        val ids = (snapshot.get("matchingRequestIds") as? List<String>) ?: emptyList()
                        trySend(ids)
                    }
                awaitClose { listener.remove() }
            }
        }

    /**
     * Flow of ALL request match results (used by RequestsScreen to show counts).
     * Returns Map<requestId, List<playerIds>>.
     */
    fun allRequestMatchResults(): Flow<Map<String, List<String>>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.requestMatchResultsTable)
                    .addSnapshotListener { snapshot, error ->
                        if (error != null || snapshot == null) {
                            trySend(emptyMap())
                            return@addSnapshotListener
                        }
                        val map = mutableMapOf<String, List<String>>()
                        for (doc in snapshot.documents) {
                            @Suppress("UNCHECKED_CAST")
                            val ids = (doc.get("matchingPlayerIds") as? List<String>) ?: emptyList()
                            map[doc.id] = ids
                        }
                        trySend(map)
                    }
                awaitClose { listener.remove() }
            }
        }
}
