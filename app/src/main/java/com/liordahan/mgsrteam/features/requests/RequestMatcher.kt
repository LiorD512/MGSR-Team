package com.liordahan.mgsrteam.features.requests

import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.DominateFootOptions
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions

/**
 * Matches roster players to a request based on position, age, dominate foot, salary range, and transfer fee.
 * - Position: player must have the requested position (or equivalent)
 * - Age: if request has an age range, player age must fall within it
 * - Dominate foot: if request specifies left/right, player must match; players without foot info are shown anyway
 * - Salary: if request has salaryRange, player's salaryRange must match the request range OR an adjacent range
 *   (e.g. request 26-30 also accepts 20-25 and 30+). Players with no salary data are included as suggestions.
 * - Transfer fee: if request has transferFee, player's transferFee must match exactly.
 *   Players with no transfer fee data are included as suggestions.
 */
object RequestMatcher {

    /**
     * Returns requests that match the given player (reverse of match).
     * Used on Player Info screen to show "Matching Requests" for a player.
     */
    fun matchingRequestsForPlayer(player: Player, requests: List<Request>): List<Request> {
        return requests.filter { match(it, listOf(player)).isNotEmpty() }
    }

    fun match(request: Request, players: List<Player>): List<Player> {
        val position = request.position?.takeIf { it.isNotBlank() } ?: return emptyList()
        return players.filter { player -> matchesRequest(player, request, position) }
    }

    private fun matchesRequest(player: Player, request: Request, position: String): Boolean {
        if (!matchesPosition(player, position)) return false
        if (!matchesAge(player, request)) return false
        if (!matchesDominateFoot(player, request)) return false
        if (!matchesSalaryRange(player, request)) return false
        if (!matchesTransferFee(player, request)) return false
        return true
    }

    private fun matchesDominateFoot(player: Player, request: Request): Boolean {
        val reqFoot = request.dominateFoot?.trim()?.lowercase()?.takeIf { it.isNotBlank() } ?: return true
        if (reqFoot == DominateFootOptions.ANY) return true
        val playerFoot = player.foot?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        // Show players without foot info anyway; only exclude when player has different foot
        if (playerFoot == null) return true
        return playerFoot == reqFoot
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
        val reqSalary = request.salaryRange?.trim()?.takeIf { it.isNotBlank() } ?: return true
        val playerSalary = player.salaryRange?.trim()?.takeIf { it.isNotBlank() }
        if (playerSalary == null) return true // Include players with no salary data as suggestions

        val ranges = SalaryRangeOptions.all
        val reqIndex = ranges.indexOfFirst { it.equals(reqSalary, ignoreCase = true) }
        if (reqIndex < 0) return playerSalary.equals(reqSalary, ignoreCase = true) // fallback for unknown range

        val acceptedRanges = buildSet {
            add(ranges[reqIndex])
            if (reqIndex > 0) add(ranges[reqIndex - 1])
            if (reqIndex < ranges.lastIndex) add(ranges[reqIndex + 1])
        }
        return acceptedRanges.any { it.equals(playerSalary, ignoreCase = true) }
    }

    private fun matchesTransferFee(player: Player, request: Request): Boolean {
        val reqFee = request.transferFee?.takeIf { it.isNotBlank() } ?: return true
        val playerFee = player.transferFee?.takeIf { it.isNotBlank() }
        if (playerFee == null) return true // Include players with no transfer fee data as suggestions
        return playerFee.equals(reqFee, ignoreCase = true)
    }
}
