package com.liordahan.mgsrteam.features.home.models

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName

/**
 * A task assigned to (or created by) an agent.
 * Stored in the "AgentTasks" Firestore collection.
 *
 * @param createdByAgentId ID of the agent who created the task (for push notifications).
 * @param createdByAgentName Display name of the creator.
 * @param remindersSent Days-before-due values for which reminders were already sent (e.g. [7, 3, 1]).
 */
data class AgentTask(
    @DocumentId
    val id: String = "",
    val agentId: String = "",
    val agentName: String = "",
    val title: String = "",
    @get:PropertyName("isCompleted") @set:PropertyName("isCompleted")
    var isCompleted: Boolean = false,
    val dueDate: Long = 0L,
    val createdAt: Long = System.currentTimeMillis(),
    val priority: Int = 0,        // 0 = low, 1 = medium, 2 = high
    val notes: String = "",
    val completedAt: Long = 0L,
    val createdByAgentId: String = "",
    val createdByAgentName: String = "",
    @get:PropertyName("remindersSent") @set:PropertyName("remindersSent")
    var remindersSent: List<Int> = emptyList()
)
