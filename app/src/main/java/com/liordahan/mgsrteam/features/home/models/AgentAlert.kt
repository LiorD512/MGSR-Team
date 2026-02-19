package com.liordahan.mgsrteam.features.home.models

enum class AlertSeverity { URGENT, WARNING }

data class AgentAlert(
    val playerName: String,
    val detail: String,
    val daysLeft: Int,
    val severity: AlertSeverity
)
