package com.liordahan.mgsrteam.features.chatroom.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

@Keep
data class PlayerMention(
    val playerId: String = "",
    val playerName: String = ""
)

@Keep
data class ChatMessage(
    @DocumentId
    val id: String = "",
    val text: String = "",
    val senderAccountId: String = "",
    val senderName: String = "",
    val senderNameHe: String = "",
    val createdAt: Long = 0L,
    val notifyAccountId: String = "",
    val mentions: List<PlayerMention> = emptyList()
)
