package com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.COLLECTION
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.STATUS_APPROVED
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.STATUS_PENDING
import com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.Companion.STATUS_REJECTED
import com.liordahan.mgsrteam.firebase.SharedCallables
import kotlinx.coroutines.tasks.await

class AgentTransferRepository(
    private val firebaseStore: FirebaseFirestore
) {
    /**
     * Creates a transfer request via Cloud Function.
     * Returns the document ID on success, null if there's already a pending request.
     */
    suspend fun requestTransfer(
        playerId: String,
        playerName: String?,
        playerImage: String?,
        platform: Platform,
        fromAgentId: String,
        fromAgentName: String?,
        toAgentId: String,
        toAgentName: String?
    ): String? {
        return SharedCallables.agentTransferRequest(
            platform = platform,
            playerId = playerId,
            playerName = playerName,
            playerImage = playerImage,
            fromAgentId = fromAgentId,
            fromAgentName = fromAgentName,
            toAgentId = toAgentId,
            toAgentName = toAgentName,
        )
    }

    /**
     * Approves a transfer request via Cloud Function (transaction runs server-side).
     */
    suspend fun approveTransfer(
        requestId: String,
        platform: Platform
    ) {
        SharedCallables.agentTransferApprove(platform, requestId)
    }

    /**
     * Rejects a transfer request via Cloud Function.
     */
    suspend fun rejectTransfer(requestId: String, reason: String? = null) {
        SharedCallables.agentTransferReject(requestId, reason)
    }

    /**
     * Cancels a pending transfer request via Cloud Function.
     */
    suspend fun cancelTransferRequest(requestId: String) {
        SharedCallables.agentTransferCancel(requestId)
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

    /**
     * Listens for the most recent resolved (approved/rejected) transfer request on a player.
     * Uses server-side filtering via composite index on playerId + status + resolvedAt.
     */
    fun listenForResolvedTransfer(
        playerId: String,
        onResult: (AgentTransferRequest?) -> Unit
    ): ListenerRegistration {
        return firebaseStore.collection(COLLECTION)
            .whereEqualTo("playerId", playerId)
            .whereIn("status", listOf(STATUS_APPROVED, STATUS_REJECTED))
            .orderBy("resolvedAt", Query.Direction.DESCENDING)
            .limit(1)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    onResult(null)
                    return@addSnapshotListener
                }
                val latest = snapshot?.documents?.firstOrNull()
                    ?.toObject(AgentTransferRequest::class.java)
                onResult(latest)
            }
    }
}
