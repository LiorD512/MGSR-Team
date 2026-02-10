package com.liordahan.mgsrteam.features.home.models

/**
 * Represents a live / today match from football-data.org API
 * that involves one of our managed players' clubs.
 */
data class LiveMatch(
    val matchId: Int,
    val homeTeam: String,
    val homeTeamCrest: String?,
    val awayTeam: String,
    val awayTeamCrest: String?,
    val homeScore: Int?,
    val awayScore: Int?,
    val minute: String?,           // e.g. "78'" or "HT" or "FT"
    val status: MatchStatus,
    val playerName: String,        // our managed player
    val playerImage: String?,
    val playerClubIsHome: Boolean  // true if our player's club is the home side
)

enum class MatchStatus(val display: String) {
    SCHEDULED("Scheduled"),
    TIMED("Timed"),
    IN_PLAY("LIVE"),
    PAUSED("HT"),
    FINISHED("FT"),
    POSTPONED("Postponed"),
    SUSPENDED("Suspended"),
    CANCELLED("Cancelled"),
    UNKNOWN("--");

    companion object {
        fun fromApi(value: String?): MatchStatus =
            entries.find { it.name.equals(value, true) } ?: UNKNOWN
    }
}
