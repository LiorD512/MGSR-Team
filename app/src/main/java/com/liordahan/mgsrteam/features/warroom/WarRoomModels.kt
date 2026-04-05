package com.liordahan.mgsrteam.features.warroom

/**
 * Data models for War Room features.
 * Maps to the Next.js /api/war-room/ API responses.
 */

// ── Discovery ──────────────────────────────────────────────────────────────

data class DiscoveryResponse(
    val candidates: List<DiscoveryCandidate>,
    val count: Int,
    val updatedAt: String
)

data class DiscoveryCandidate(
    val name: String,
    val position: String,
    val age: Int,
    val marketValue: String,
    val transfermarktUrl: String,
    val club: String,
    val nationality: String,
    val source: String,            // "request_match", "hidden_gem", "general", "agent_pick"
    val sourceLabel: String,
    val hiddenGemScore: Int?,
    val hiddenGemReason: String?,
    val fmPotentialAbility: Int?,
    val fmCurrentAbility: Int?,
    val fmGap: Int?,
    val goalsPerNinety: Double?,
    val assistsPerNinety: Double?,
    val apiRating: Double?,
    val scoutNarrative: String?,
    val matchScore: Int?,
    val profileType: String?,
    val agentId: String?,
    val imageUrl: String?
)

// ── Scout Profiles (Agent Tab) ─────────────────────────────────────────────

data class ScoutProfilesResponse(
    val profiles: List<ScoutProfile>,
    val total: Int
)

data class ScoutProfile(
    val id: String,
    val name: String,
    val position: String,
    val age: Int,
    val marketValue: String,
    val club: String,
    val nationality: String,
    val transfermarktUrl: String,
    val agentId: String,
    val agentName: String,
    val agentNameHe: String,
    val matchScore: Int,
    val profileType: String,
    val profileTypeLabel: String,   // translated label of profileType
    val explanation: String,
    val imageUrl: String?
)

// ── War Room Report ────────────────────────────────────────────────────────

data class WarRoomReportRequest(
    val playerUrl: String,
    val playerName: String?,
    val lang: String = "en"
)

data class WarRoomReportResponse(
    val playerName: String,
    val position: String,
    val age: Int,
    val marketValue: String,
    val club: String,
    val nationality: String,
    val recommendation: String,        // "SIGN", "MONITOR", "PASS"
    val confidencePercent: Int,
    val oneLiner: String,
    val timeline: String,
    val synthesis: SynthesisReport,
    val stats: StatsReport,
    val market: MarketReport,
    val tactics: TacticsReport
)

data class SynthesisReport(
    val summary: String,
    val risks: List<String>,
    val opportunities: List<String>
)

data class StatsReport(
    val analysis: String,
    val strengths: List<String>,
    val weaknesses: List<String>,
    val keyMetrics: List<String>
)

data class MarketReport(
    val analysis: String,
    val marketPosition: String,
    val currentValue: String,
    val comparableRange: String,
    val contractLeverage: String,
    val suggestedBid: String
)

data class TacticsReport(
    val analysis: String,
    val bestRole: String,
    val bestSystem: String,
    val leagueFit: String,
    val comparison: String,
    val bestClubFit: List<String>
)
