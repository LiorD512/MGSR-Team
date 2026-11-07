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
