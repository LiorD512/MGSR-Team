package com.liordahan.mgsrteam.features.chatroom.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

@Keep
data class PlayerMention(
    val playerId: String = "",
    val playerName: String = "",
    val playerNameHe: String = ""
)

@Keep
data class ReplyTo(
    val messageId: String = "",
    val text: String = "",
    val senderName: String = "",
    val senderNameHe: String = ""
)

@Keep
data class ChatAttachment(
    val url: String = "",
    val name: String = "",
    val type: String = "",
    val size: Long = 0L
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
    val mentions: List<PlayerMention> = emptyList(),
    val editedAt: Long? = null,
    val replyTo: ReplyTo? = null,
    val attachments: List<ChatAttachment> = emptyList()
)
