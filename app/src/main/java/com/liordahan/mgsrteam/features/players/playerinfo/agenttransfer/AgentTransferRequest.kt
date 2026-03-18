package com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

@Keep
data class AgentTransferRequest(
    @DocumentId
    val id: String? = null,
    val playerId: String? = null,
    val playerName: String? = null,
    val playerImage: String? = null,
    val platform: String? = null,
    val fromAgentId: String? = null,
    val fromAgentName: String? = null,
    val toAgentId: String? = null,
    val toAgentName: String? = null,
    val status: String? = "pending",
    val requestedAt: Long? = null,
    val resolvedAt: Long? = null,
    val rejectionReason: String? = null
) {
    companion object {
        const val STATUS_PENDING = "pending"
        const val STATUS_APPROVED = "approved"
        const val STATUS_REJECTED = "rejected"

        const val COLLECTION = "AgentTransferRequests"
    }
}
