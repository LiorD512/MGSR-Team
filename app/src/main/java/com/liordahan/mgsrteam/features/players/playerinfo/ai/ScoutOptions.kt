package com.liordahan.mgsrteam.features.players.playerinfo.ai

/**
 * Options for the "Find Similar Players" feature.
 * Allows users to tailor results by similarity focus, age range, and exclusions.
 */
data class SimilarPlayersOptions(
    /** How to prioritize similarity: style, value, position, or all-round. */
    val similarityMode: SimilarityMode = SimilarityMode.ALL_ROUND,
    /** Age range filter: strict (±2), relaxed (±5), or any. */
    val ageRange: AgeRangePreference = AgeRangePreference.STRICT,
    /** Number of players to suggest (5–15). */
    val count: Int = 10,
    /** Exclude players from the same club as the source player. */
    val excludeSameClub: Boolean = true,
    /** Exclude players from the same league/country — surface hidden gems from other markets. Off by default. */
    val excludeSameLeague: Boolean = false
) {
    enum class SimilarityMode {
        /** Focus on playing style, movement, technical profile. */
        PLAYING_STYLE,
        /** Focus on market value bracket and transfer context. */
        MARKET_VALUE,
        /** Focus on positional profile and tactical role. */
        POSITION_PROFILE,
        /** Balanced: style, value, position, physicality. */
        ALL_ROUND
    }

    enum class AgeRangePreference {
        /** ±2 years from source player. */
        STRICT,
        /** ±5 years from source player. */
        RELAXED,
        /** No age restriction. */
        ANY
    }
}

/**
 * Options for the "Create Scout Report" feature.
 * Allows users to choose report type for different use cases.
 */
data class ScoutReportOptions(
    /** Report type: executive summary, full tactical, transfer focus, or youth potential. */
    val reportType: ScoutReportType = ScoutReportType.FULL_TACTICAL
) {
    enum class ScoutReportType {
        /** 1–2 paragraphs, key strengths and verdict for quick decisions. */
        EXECUTIVE_SUMMARY,
        /** Full pro-style report: strengths, weaknesses, tactical fit, tendencies. */
        FULL_TACTICAL,
        /** Focus on transfer value, contract, market context, suitability. */
        TRANSFER_RECOMMENDATION,
        /** Focus on potential, development trajectory, youth profile. */
        YOUTH_POTENTIAL
    }
}
