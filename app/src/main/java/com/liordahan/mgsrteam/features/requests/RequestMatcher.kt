package com.liordahan.mgsrteam.features.requests

import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.DominateFootOptions
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions
import com.liordahan.mgsrteam.utils.EuCountries

/**
 * Matches roster players to a request based on position, age, dominate foot, salary range, and transfer fee.
 * All ClubRequests are shared — matching is not filtered by who added the request.
 * - Position: player must have the requested position (or equivalent); normalizes "Centre Forward" <-> "CF"
 * - Age: if request has an age range, player age must fall within it
 * - Dominate foot: if request specifies left/right, player must match; players without foot info are shown anyway
 * - Salary: if request has salaryRange, player's salaryRange must match the request range OR an adjacent range
 * - Transfer fee: if request has transferFee, player's transferFee must match exactly.
 */
object RequestMatcher {

    /** Maps common position names to canonical codes (aligns with web/Transfermarkt). */
    private val POSITION_ALIASES = mapOf(
        "GOALKEEPER" to "GK",
        "LEFT BACK" to "LB",
        "CENTRE BACK" to "CB",
        "CENTER BACK" to "CB",
        "CENTREBACK" to "CB",
        "CENTERBACK" to "CB",
        "RIGHT BACK" to "RB",
        "LEFTBACK" to "LB",
        "RIGHTBACK" to "RB",
        "DEFENSIVE MIDFIELD" to "DM",
        "CENTRAL MIDFIELD" to "CM",
        "ATTACKING MIDFIELD" to "AM",
        "RIGHT WINGER" to "RW",
        "LEFT WINGER" to "LW",
        "CENTRE FORWARD" to "CF",
        "CENTER FORWARD" to "CF",
        "CENTREFORWARD" to "CF",
        "CENTERFORWARD" to "CF",
        "SECOND STRIKER" to "SS",
        "LEFT MIDFIELD" to "LM",
        "RIGHT MIDFIELD" to "RM",
        "STRIKER" to "CF",
        "ST" to "CF"
    )

    private fun normalizePosition(pos: String): String {
        val upper = pos.trim().uppercase().replace("-", " ")
        return POSITION_ALIASES[upper] ?: POSITION_ALIASES[upper.replace(" ", "")] ?: upper.replace(" ", "")
    }

    /**
     * Returns requests that match the given player (reverse of match).
     * Used on Player Info screen to show "Matching Requests" for a player.
     * Requests are not filtered by who added them — all pending requests are considered.
     */
    fun matchingRequestsForPlayer(player: Player, requests: List<Request>): List<Request> {
        return requests.filter { match(it, listOf(player)).isNotEmpty() }
    }

    fun match(request: Request, players: List<Player>): List<Player> {
        val position = request.position?.takeIf { it.isNotBlank() } ?: return emptyList()
        return players.filter { player -> matchesRequest(player, request, position) }
    }

    /** Public position check for use outside the matcher (e.g. mandate filtering). */
    fun matchesPositionPublic(player: Player, requestPosition: String): Boolean {
        return matchesPosition(player, requestPosition)
    }

    private fun matchesRequest(player: Player, request: Request, position: String): Boolean {
        if (!matchesPosition(player, position)) return false
        if (!matchesAge(player, request)) return false
        if (!matchesDominateFoot(player, request)) return false
        if (!matchesSalaryRange(player, request)) return false
        if (!matchesTransferFee(player, request)) return false
        if (!matchesEu(player, request)) return false
        return true
    }

    private fun matchesEu(player: Player, request: Request): Boolean {
        if (request.euOnly != true) return true
        // Don't exclude players with no nationality data
        val nats = player.nationalities?.takeIf { it.isNotEmpty() } ?: listOfNotNull(player.nationality)
        if (nats.isEmpty()) return true
        return EuCountries.isEuNational(nats)
    }

    private fun matchesDominateFoot(player: Player, request: Request): Boolean {
        val reqFoot = request.dominateFoot?.trim()?.lowercase()?.takeIf { it.isNotBlank() } ?: return true
        if (reqFoot == DominateFootOptions.ANY) return true
        val playerFoot = player.foot?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        if (playerFoot == null) return true
        return playerFoot == reqFoot
    }

    private fun matchesPosition(player: Player, requestPosition: String): Boolean {
        val playerPositions = player.positions?.mapNotNull { it?.trim()?.takeIf { p -> p.isNotBlank() } } ?: return false
        if (playerPositions.isEmpty()) return false
        val reqPosNorm = normalizePosition(requestPosition)
        if (reqPosNorm.isBlank()) return false
        return playerPositions.any { normalizePosition(it) == reqPosNorm }
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
