package com.liordahan.mgsrteam.features.women.models

/**
 * Women-dedicated agent overview — personal dashboard summary.
 */
data class WomenAgentOverview(
    val totalPlayers: Int,
    val withMandate: Int,
    val freeAgents: Int,
    val expiringContracts: Int,
    val taskCompletionPercent: Float,
    val completedTaskCount: Int,
    val totalTaskCount: Int,
    val upcomingTasks: List<WomenAgentTask>,
    val pendingTaskCount: Int,
    val overdueTaskCount: Int,
    val alerts: List<WomenAgentAlert>
)

/**
 * Women-dedicated agent alert.
 */
data class WomenAgentAlert(
    val playerName: String,
    val detail: String,
    val daysLeft: Int,
    val severity: WomenAlertSeverity
)

enum class WomenAlertSeverity {
    URGENT, WARNING, INFO
}

/**
 * Women-dedicated agent summary for dashboard agent tasks section.
 */
data class WomenAgentSummary(
    val agentId: String?,
    val agentName: String,
    val totalPlayers: Int,
    val withMandate: Int,
    val expiringContracts: Int,
    val withNotes: Int
)
