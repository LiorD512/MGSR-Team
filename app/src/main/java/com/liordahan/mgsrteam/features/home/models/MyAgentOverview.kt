package com.liordahan.mgsrteam.features.home.models

/**
 * Personalised dashboard summary for the currently logged-in agent.
 * Computed in the ViewModel from the same Firestore data that powers the
 * full dashboard, but filtered to only this agent's players, tasks and events.
 */
data class MyAgentOverview(
    val totalPlayers: Int,
    val withMandate: Int,
    val freeAgents: Int,
    val expiringContracts: Int,
    val taskCompletionPercent: Float,
    val completedTaskCount: Int,
    val totalTaskCount: Int,
    val upcomingTasks: List<AgentTask>,
    val pendingTaskCount: Int,
    val overdueTaskCount: Int,
    val alerts: List<AgentAlert>
)
