package com.liordahan.mgsrteam.features.requests.models

/**
 * Maps short position codes to long display names for the request position header.
 */
object PositionDisplayNames {

    private val shortToLong = mapOf(
        "GK" to "GOALKEEPER",
        "CB" to "CENTER BACK",
        "RB" to "RIGHT BACK",
        "LB" to "LEFT BACK",
        "DM" to "DEFENSIVE MIDFIELDER",
        "CM" to "CENTRAL MIDFIELDER",
        "AM" to "ATTACKING MIDFIELDER",
        "LM" to "LEFT MIDFIELDER",
        "RM" to "RIGHT MIDFIELDER",
        "LW" to "LEFT WINGER",
        "RW" to "RIGHT WINGER",
        "CF" to "CENTER FORWARD",
        "ST" to "STRIKER",
        "SS" to "SECOND STRIKER",
        "CDM" to "DEFENSIVE MIDFIELDER",
        "LWB" to "LEFT WING BACK",
        "RWB" to "RIGHT WING BACK",
        "DEF" to "DEFENDER",
        "MID" to "MIDFIELDER",
        "FWD" to "FORWARD"
    )

    /**
     * Returns the long display name for a position code, or the original if not found.
     */
    fun toLongName(shortPosition: String?): String {
        if (shortPosition.isNullOrBlank()) return shortPosition ?: ""
        val upper = shortPosition.trim().uppercase()
        return shortToLong[upper] ?: shortPosition.trim()
    }
}
