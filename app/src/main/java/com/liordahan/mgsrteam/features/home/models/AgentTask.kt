package com.liordahan.mgsrteam.features.home.models

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName

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
    @get:PropertyName("isCompleted") @set:PropertyName("isCompleted")
    var isCompleted: Boolean = false,
    val dueDate: Long = 0L,
    val createdAt: Long = System.currentTimeMillis(),
    val priority: Int = 0,        // 0 = low, 1 = medium, 2 = high
    val notes: String = "",
    val completedAt: Long = 0L
)
