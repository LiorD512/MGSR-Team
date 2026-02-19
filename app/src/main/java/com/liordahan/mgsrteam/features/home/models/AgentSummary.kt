package com.liordahan.mgsrteam.features.home.models

/**
 * Aggregated stats per agent for the dashboard Agent Tasks section.
 */
data class AgentSummary(
    val agentId: String?,
    val agentName: String,
    val totalPlayers: Int,
    val withMandate: Int,
    val expiringContracts: Int,
    val withNotes: Int
)
