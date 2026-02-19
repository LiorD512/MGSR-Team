package com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

/**
 * Tracks when a player was offered to a club (linked to a request).
 * Stored in Firestore collection `PlayerOffers`.
 */
@Keep
data class PlayerOffer(
    @DocumentId
    val id: String? = null,
    val playerTmProfile: String? = null,
    val playerName: String? = null,
    val playerImage: String? = null,
    val requestId: String? = null,
    val clubTmProfile: String? = null,
    val clubName: String? = null,
    val clubLogo: String? = null,
    val position: String? = null,
    val offeredAt: Long? = null,
    val clubFeedback: String? = null,
    val markedByAgentName: String? = null
)
