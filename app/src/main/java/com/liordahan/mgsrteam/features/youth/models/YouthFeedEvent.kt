package com.liordahan.mgsrteam.features.youth.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

/**
 * Youth-dedicated feed event data class.
 * Maps to the "FeedEventsYouth" Firestore collection.
 */
@Keep
data class YouthFeedEvent(
    @DocumentId
    val id: String? = null,
    val type: String? = null,
    val playerName: String? = null,
    val playerImage: String? = null,
    val playerTmProfile: String? = null,
    val oldValue: String? = null,
    val newValue: String? = null,
    val extraInfo: String? = null,
    val timestamp: Long? = null,
    val agentName: String? = null,
    val mandateExpiryAt: Long? = null
) {
    companion object {
        const val TYPE_MARKET_VALUE_CHANGE = "MARKET_VALUE_CHANGE"
        const val TYPE_CLUB_CHANGE = "CLUB_CHANGE"
        const val TYPE_CONTRACT_EXPIRING = "CONTRACT_EXPIRING"
        const val TYPE_NOTE_ADDED = "NOTE_ADDED"
        const val TYPE_NOTE_DELETED = "NOTE_DELETED"
        const val TYPE_PLAYER_ADDED = "PLAYER_ADDED"
        const val TYPE_PLAYER_DELETED = "PLAYER_DELETED"
        const val TYPE_BECAME_FREE_AGENT = "BECAME_FREE_AGENT"
        const val TYPE_NEW_RELEASE_FROM_CLUB = "NEW_RELEASE_FROM_CLUB"
        const val TYPE_MANDATE_EXPIRED = "MANDATE_EXPIRED"
        const val TYPE_MANDATE_UPLOADED = "MANDATE_UPLOADED"
        const val TYPE_MANDATE_SWITCHED_ON = "MANDATE_SWITCHED_ON"
        const val TYPE_MANDATE_SWITCHED_OFF = "MANDATE_SWITCHED_OFF"
        const val TYPE_SHORTLIST_ADDED = "SHORTLIST_ADDED"
        const val TYPE_SHORTLIST_REMOVED = "SHORTLIST_REMOVED"
        const val TYPE_REQUEST_ADDED = "REQUEST_ADDED"
        const val TYPE_REQUEST_DELETED = "REQUEST_DELETED"
        const val TYPE_PLAYER_OFFERED_TO_CLUB = "PLAYER_OFFERED_TO_CLUB"
    }
}

// ── Conversion helpers ──

fun YouthFeedEvent.toSharedFeedEvent(): com.liordahan.mgsrteam.features.home.models.FeedEvent {
    return com.liordahan.mgsrteam.features.home.models.FeedEvent(
        id = id,
        type = type,
        playerName = playerName,
        playerImage = playerImage,
        playerTmProfile = playerTmProfile,
        oldValue = oldValue,
        newValue = newValue,
        extraInfo = extraInfo,
        timestamp = timestamp,
        agentName = agentName,
        mandateExpiryAt = mandateExpiryAt
    )
}
