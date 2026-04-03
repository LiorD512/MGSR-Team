package com.liordahan.mgsrteam.features.chatroom.repository

import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.liordahan.mgsrteam.features.chatroom.models.ChatMessage
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

interface IChatRoomRepository {
    fun messagesFlow(): Flow<List<ChatMessage>>
}

class ChatRoomRepository(
    private val firebaseHandler: FirebaseHandler
) : IChatRoomRepository {

    companion object {
        private const val CHAT_ROOM_COLLECTION = "ChatRoom"
    }

    override fun messagesFlow(): Flow<List<ChatMessage>> = callbackFlow {
        val registration: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(CHAT_ROOM_COLLECTION)
            .orderBy("createdAt", Query.Direction.ASCENDING)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val messages = snapshot?.documents?.mapNotNull { doc ->
                    doc.toObject(ChatMessage::class.java)?.copy(id = doc.id)
                } ?: emptyList()
                trySend(messages)
            }
        awaitClose { registration.remove() }
    }
}
