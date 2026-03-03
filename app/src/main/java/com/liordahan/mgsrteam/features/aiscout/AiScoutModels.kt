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

// ─── Find Next (Find Me The Next...) ────────────────────────────────────────

data class FindNextRequest(
    val playerName: String,
    val ageMax: Int = 23,
    val valueMax: Int = 3_000_000,
    val lang: String = "en"
)

data class FindNextResponse(
    val referencePlayer: ReferencePlayer?,
    val signatureStats: List<SignatureStat>?,
    val results: List<FindNextResult>,
    val resultCount: Int,
    val totalCandidatesScanned: Int?,
    val error: String?
)

data class ReferencePlayer(
    val name: String,
    val position: String,
    val age: String,
    val marketValue: String,
    val league: String,
    val club: String,
    val foot: String,
    val height: String,
    val nationality: String,
    val playingStyle: String?,
    val url: String
)

data class SignatureStat(
    val statKey: String,
    val label: String,
    val percentile: Int,
    val value: Number
)

data class FindNextResult(
    val name: String,
    val position: String,
    val age: String,
    val marketValue: String,
    val url: String,
    val league: String,
    val club: String?,
    val citizenship: String,
    val foot: String,
    val height: String,
    val contract: String,
    val playingStyle: String?,
    val findNextScore: Int,
    val signatureMatch: Int,
    val styleMatchBonus: Int,
    val valueGapBonus: Int,
    val contractBonus: Int,
    val ageBonus: Int,
    val explanation: String,
    val scoutNarrative: String?
)
