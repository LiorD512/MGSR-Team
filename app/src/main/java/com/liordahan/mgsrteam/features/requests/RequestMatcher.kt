package com.liordahan.mgsrteam.features.requests

import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.Request

/**
 * Matches roster players to a request based on position and age.
 * - Position: player must have the requested position (or equivalent)
 * - Age: if request has an age range, player age must fall within it
 */
object RequestMatcher {

    fun match(request: Request, players: List<Player>): List<Player> {
        val position = request.position?.takeIf { it.isNotBlank() } ?: return emptyList()
        return players.filter { player -> matchesRequest(player, request, position) }
    }

    private fun matchesRequest(player: Player, request: Request, position: String): Boolean {
        if (!matchesPosition(player, position)) return false
        if (!matchesAge(player, request)) return false
        return true
    }

    private fun matchesPosition(player: Player, requestPosition: String): Boolean {
        val playerPositions = player.positions?.mapNotNull { it?.trim()?.uppercase()?.takeIf { p -> p.isNotBlank() } } ?: return false
        if (playerPositions.isEmpty()) return false
        val reqPos = requestPosition.trim().uppercase().takeIf { it.isNotBlank() } ?: return false
        return playerPositions.any { it.equals(reqPos, ignoreCase = true) }
    }

    private fun matchesAge(player: Player, request: Request): Boolean {
        if (request.ageDoesntMatter == true) return true
        val minAge = request.minAge ?: 0
        val maxAge = request.maxAge ?: 999
        if (minAge <= 0 && maxAge >= 999) return true
        val playerAge = player.age?.toIntOrNull() ?: return true
        return playerAge in minAge..maxAge
    }
}
