package com.liordahan.mgsrteam.features.home.models

import com.google.firebase.firestore.DocumentId

/**
 * Persisted feed event – written by PlayerRefreshWorker (or manual refresh)
 * and displayed on the Home dashboard.
 */
data class FeedEvent(
    @DocumentId
    val id: String? = null,
    val type: String? = null,           // MARKET_VALUE_CHANGE, CLUB_CHANGE, CONTRACT_EXPIRING, NOTE_ADDED, PLAYER_ADDED, BECAME_FREE_AGENT
    val playerName: String? = null,
    val playerImage: String? = null,
    val playerTmProfile: String? = null,
    val oldValue: String? = null,       // e.g. old market value or old club name
    val newValue: String? = null,       // e.g. new market value or new club name
    val extraInfo: String? = null,      // e.g. agent name who wrote a note, count of expiring players
    val timestamp: Long? = null,
    val agentName: String? = null
) {
    companion object {
        const val TYPE_MARKET_VALUE_CHANGE = "MARKET_VALUE_CHANGE"
        const val TYPE_CLUB_CHANGE = "CLUB_CHANGE"
        const val TYPE_CONTRACT_EXPIRING = "CONTRACT_EXPIRING"
        const val TYPE_NOTE_ADDED = "NOTE_ADDED"
        const val TYPE_PLAYER_ADDED = "PLAYER_ADDED"
        const val TYPE_BECAME_FREE_AGENT = "BECAME_FREE_AGENT"
        /** New player in releases list (not seen before). extraInfo: IN_DATABASE or NOT_IN_DATABASE */
        const val TYPE_NEW_RELEASE_FROM_CLUB = "NEW_RELEASE_FROM_CLUB"
        /** Player mandate has expired (expiry date passed). */
        const val TYPE_MANDATE_EXPIRED = "MANDATE_EXPIRED"
    }
}
