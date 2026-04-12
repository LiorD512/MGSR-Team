package com.liordahan.mgsrteam.features.notificationcenter

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.liordahan.mgsrteam.firebase.SharedCallables
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class StoredNotification(
    val id: String = "",
    val type: String = "",
    val title: String = "",
    val body: String = "",
    val data: Map<String, Any> = emptyMap(),
    val timestamp: Long = 0L,
    val read: Boolean = false
)

data class NotificationCenterState(
    val notifications: List<StoredNotification> = emptyList(),
    val unreadCount: Int = 0,
    val isLoading: Boolean = true
)

/**
 * Manages notification center data — real-time listener on
 * Accounts/{accountId}/Notifications subcollection.
 */
class NotificationCenterManager {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val db = FirebaseFirestore.getInstance()

    private val _state = MutableStateFlow(NotificationCenterState())
    val state: StateFlow<NotificationCenterState> = _state.asStateFlow()

    private var listener: ListenerRegistration? = null
    private var currentAccountId: String? = null

    fun startListening(accountId: String) {
        if (accountId == currentAccountId && listener != null) return
        stopListening()
        currentAccountId = accountId

        listener = db.collection("Accounts")
            .document(accountId)
            .collection("Notifications")
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .limit(20)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    _state.update { it.copy(isLoading = false) }
                    return@addSnapshotListener
                }
                val items = snapshot?.documents?.mapNotNull { doc ->
                    try {
                        StoredNotification(
                            id = doc.id,
                            type = doc.getString("type") ?: "",
                            title = doc.getString("title") ?: "",
                            body = doc.getString("body") ?: "",
                            data = (doc.get("data") as? Map<String, Any>) ?: emptyMap(),
                            timestamp = doc.getLong("timestamp") ?: 0L,
                            read = doc.getBoolean("read") ?: false
                        )
                    } catch (_: Exception) { null }
                } ?: emptyList()

                _state.update {
                    it.copy(
                        notifications = items,
                        unreadCount = items.count { n -> !n.read },
                        isLoading = false
                    )
                }
            }
    }

    fun stopListening() {
        listener?.remove()
        listener = null
        currentAccountId = null
    }

    fun markAllRead(accountId: String) {
        scope.launch {
            try {
                SharedCallables.notificationMarkAllRead(accountId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun markRead(accountId: String, notificationId: String) {
        scope.launch {
            try {
                SharedCallables.notificationMarkRead(accountId, notificationId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
