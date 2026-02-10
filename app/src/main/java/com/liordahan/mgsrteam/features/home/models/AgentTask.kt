package com.liordahan.mgsrteam.features.home.models

import com.google.firebase.firestore.DocumentId

/**
 * A task assigned to (or created by) an agent.
 * Stored in the "AgentTasks" Firestore collection.
 */
data class AgentTask(
    @DocumentId
    val id: String = "",
    val agentId: String = "",
    val agentName: String = "",
    val title: String = "",
    val isCompleted: Boolean = false,
    val dueDate: Long = 0L,          // epoch millis
    val createdAt: Long = System.currentTimeMillis()
)
