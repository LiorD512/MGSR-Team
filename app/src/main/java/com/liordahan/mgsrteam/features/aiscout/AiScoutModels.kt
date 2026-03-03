package com.liordahan.mgsrteam.features.aiscout

/**
 * Data models for AI Scout search feature.
 * Maps to the Next.js /api/scout/search API response.
 */

data class AiScoutSearchRequest(
    val query: String,
    val lang: String = "en",
    val initial: Boolean = true,
    val excludeUrls: List<String> = emptyList()
)

data class AiScoutSearchResponse(
    val results: List<ScoutPlayerResult>,
    val interpretation: String,
    val query: String,
    val leagueInfo: LeagueInfo?,
    val hasMore: Boolean,
    val requestedTotal: Int,
    val searchMethod: String
)

data class ScoutPlayerResult(
    val name: String,
    val position: String,
    val age: Int,
    val marketValue: String,
    val club: String,
    val nationality: String,
    val transfermarktUrl: String,
    val matchPercent: Int,
    val scoutAnalysis: String,
    val fmCurrentAbility: Int?,
    val fmPotentialAbility: Int?,
    val fmTier: String?,
    val imageUrl: String?,
    val scoreBreakdown: ScoreBreakdown?
)

data class ScoreBreakdown(
    val clubFit: Int?,
    val realism: Int?,
    val noteFit: Int?
)

data class LeagueInfo(
    val name: String,
    val avgValue: String?,
    val minValue: String?,
    val maxValue: String?
)
