package com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests

import com.liordahan.mgsrteam.features.requests.models.Request

/**
 * UI state for a matching request in the Player Info screen.
 * Combines the request with optional offer data if the player was already offered.
 */
data class MatchingRequestUiState(
    val request: Request,
    val offer: PlayerOffer?
) {
    val isOffered: Boolean get() = offer != null
}
