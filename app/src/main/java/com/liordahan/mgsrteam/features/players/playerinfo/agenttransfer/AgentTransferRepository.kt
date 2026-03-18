package com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.COLLECTION
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.STATUS_APPROVED
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.STATUS_PENDING
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.STATUS_REJECTED
import kotlinx.coroutines.tasks.await

class AgentTransferRepository(
    private val firebaseStore: FirebaseFirestore
) {
    /**
     * Creates a transfer request. Returns the document ID on success, null on failure.
     * Enforces: only one pending request per player at a time.
     */
    suspend fun requestTransfer(
        playerId: String,
        playerName: String?,
        playerImage: String?,
        platform: String,
        fromAgentId: String,
        fromAgentName: String?,
        toAgentId: String,
        toAgentName: String?
    ): String? {
        // Check for existing pending request on this player
        val existing = firebaseStore.collection(COLLECTION)
            .whereEqualTo("playerId", playerId)
            .whereEqualTo("status", STATUS_PENDING)
            .limit(1)
            .get()
            .await()

        if (!existing.isEmpty) return null // already has a pending request

        val request = AgentTransferRequest(
            playerId = playerId,
            playerName = playerName,
            playerImage = playerImage,
            platform = platform,
            fromAgentId = fromAgentId,
            fromAgentName = fromAgentName,
            toAgentId = toAgentId,
            toAgentName = toAgentName,
            status = STATUS_PENDING,
            requestedAt = System.currentTimeMillis()
        )

        val ref = firebaseStore.collection(COLLECTION).add(request).await()
        return ref.id
    }

    /**
     * Approves a transfer request:
     * 1. Updates the request status to "approved"
     * 2. Updates the player's agentInChargeId and agentInChargeName
     */
    suspend fun approveTransfer(
        requestId: String,
        playersCollection: String
    ) {
        val requestRef = firebaseStore.collection(COLLECTION).document(requestId)
        val snapshot = requestRef.get().await()
        val request = snapshot.toObject(AgentTransferRequest::class.java) ?: return

        firebaseStore.runTransaction { transaction ->
            // Update request status
            transaction.update(requestRef, mapOf(
                "status" to STATUS_APPROVED,
                "resolvedAt" to System.currentTimeMillis()
            ))

            // Update the player document
            val playerId = request.playerId ?: return@runTransaction

            val playerRef = firebaseStore.collection(playersCollection).document(playerId)
            val playerSnap = transaction.get(playerRef)

            val updates = mutableMapOf<String, Any?>(
                "agentInChargeId" to request.toAgentId,
                "agentInChargeName" to request.toAgentName,
                "agentTransferredAt" to System.currentTimeMillis()
            )

            // Preserve original agent info on first transfer
            if (playerSnap.getString("originalAgentId") == null) {
                updates["originalAgentId"] = playerSnap.getString("agentInChargeId")
                updates["originalAgentName"] = playerSnap.getString("agentInChargeName")
            }

            transaction.update(playerRef, updates)
        }.await()
    }

    /**
     * Rejects a transfer request.
     */
    suspend fun rejectTransfer(requestId: String, reason: String? = null) {
        val updates = mutableMapOf<String, Any?>(
            "status" to STATUS_REJECTED,
            "resolvedAt" to System.currentTimeMillis()
        )
        if (reason != null) updates["rejectionReason"] = reason

        firebaseStore.collection(COLLECTION)
            .document(requestId)
            .update(updates)
            .await()
    }

    /**
     * Cancels a pending transfer request (by the requester).
     */
    suspend fun cancelTransferRequest(requestId: String) {
        firebaseStore.collection(COLLECTION)
            .document(requestId)
            .delete()
            .await()
    }

    /**
     * Adds a real-time listener for a pending transfer request on a specific player.
     * Returns a ListenerRegistration that the caller must remove when done.
     */
    fun listenForPendingRequest(
        playerId: String,
        onResult: (AgentTransferRequest?) -> Unit
    ): ListenerRegistration {
        return firebaseStore.collection(COLLECTION)
            .whereEqualTo("playerId", playerId)
            .whereEqualTo("status", STATUS_PENDING)
            .limit(1)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    onResult(null)
                    return@addSnapshotListener
                }
                val request = snapshot?.documents?.firstOrNull()
                    ?.toObject(AgentTransferRequest::class.java)
                onResult(request)
            }
    }
}
