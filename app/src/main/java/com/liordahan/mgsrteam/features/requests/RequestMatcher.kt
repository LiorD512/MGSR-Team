package com.liordahan.mgsrteam.features.requests

import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.Request

/**
 * Matches roster players to a request based on position, age, salary range, and transfer fee.
 * - Position: player must have the requested position (or equivalent)
 * - Age: if request has an age range, player age must fall within it
 * - Salary: if request has salaryRange, player's salaryRange must match exactly
 * - Transfer fee: if request has transferFee, player's transferFee must match exactly
 */
object RequestMatcher {

    fun match(request: Request, players: List<Player>): List<Player> {
        val position = request.position?.takeIf { it.isNotBlank() } ?: return emptyList()
        return players.filter { player -> matchesRequest(player, request, position) }
    }

    private fun matchesRequest(player: Player, request: Request, position: String): Boolean {
        if (!matchesPosition(player, position)) return false
        if (!matchesAge(player, request)) return false
        if (!matchesSalaryRange(player, request)) return false
        if (!matchesTransferFee(player, request)) return false
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

    private fun matchesSalaryRange(player: Player, request: Request): Boolean {
        val reqSalary = request.salaryRange?.takeIf { it.isNotBlank() } ?: return true
        val playerSalary = player.salaryRange?.takeIf { it.isNotBlank() } ?: return false
        return playerSalary.equals(reqSalary, ignoreCase = true)
    }

    private fun matchesTransferFee(player: Player, request: Request): Boolean {
        val reqFee = request.transferFee?.takeIf { it.isNotBlank() } ?: return true
        val playerFee = player.transferFee?.takeIf { it.isNotBlank() } ?: return false
        return playerFee.equals(reqFee, ignoreCase = true)
    }
}
