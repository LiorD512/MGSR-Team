package com.liordahan.mgsrteam.features.youth.models

/**
 * Youth-dedicated agent overview — personal dashboard summary.
 */
data class YouthAgentOverview(
    val totalPlayers: Int,
    val withMandate: Int,
    val freeAgents: Int,
    val expiringContracts: Int,
    val taskCompletionPercent: Float,
    val completedTaskCount: Int,
    val totalTaskCount: Int,
    val upcomingTasks: List<YouthAgentTask>,
    val pendingTaskCount: Int,
    val overdueTaskCount: Int,
    val alerts: List<YouthAgentAlert>,
    // Youth-specific aggregations
    val ageGroupDistribution: Map<String, Int> = emptyMap(),
    val academyDistribution: Map<String, Int> = emptyMap()
)

/**
 * Youth-dedicated agent alert.
 */
data class YouthAgentAlert(
    val playerName: String,
    val detail: String,
    val daysLeft: Int,
    val severity: YouthAlertSeverity
)

enum class YouthAlertSeverity {
    URGENT, WARNING, INFO
}

/**
 * Youth-dedicated agent summary for dashboard agent tasks section.
 */
data class YouthAgentSummary(
    val agentId: String?,
    val agentName: String,
    val totalPlayers: Int,
    val withMandate: Int,
    val expiringContracts: Int,
    val withNotes: Int
)
