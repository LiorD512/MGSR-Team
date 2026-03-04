package com.liordahan.mgsrteam.features.women.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName

/**
 * Women-dedicated agent task data class.
 * Maps to the "AgentTasksWomen" Firestore collection.
 */
@Keep
data class WomenAgentTask(
    @DocumentId
    val id: String = "",
    val agentId: String = "",
    val agentName: String = "",
    val title: String = "",
    @get:PropertyName("isCompleted") @set:PropertyName("isCompleted")
    var isCompleted: Boolean = false,
    val dueDate: Long = 0L,
    val createdAt: Long = System.currentTimeMillis(),
    val priority: Int = 0,
    val notes: String = "",
    val completedAt: Long = 0L,
    val createdByAgentId: String = "",
    val createdByAgentName: String = "",
    @get:PropertyName("remindersSent") @set:PropertyName("remindersSent")
    var remindersSent: List<Int> = emptyList(),
    val playerId: String = "",
    val playerName: String = "",
    val playerTmProfile: String = "",
    val templateId: String = ""
)

// ── Conversion helpers ──

fun WomenAgentTask.toSharedAgentTask(): com.liordahan.mgsrteam.features.home.models.AgentTask {
    return com.liordahan.mgsrteam.features.home.models.AgentTask(
        id = id,
        agentId = agentId,
        agentName = agentName,
        title = title,
        isCompleted = isCompleted,
        dueDate = dueDate,
        createdAt = createdAt,
        priority = priority,
        notes = notes,
        completedAt = completedAt,
        createdByAgentId = createdByAgentId,
        createdByAgentName = createdByAgentName,
        remindersSent = remindersSent,
        playerId = playerId,
        playerName = playerName,
        playerTmProfile = playerTmProfile,
        templateId = templateId
    )
}
