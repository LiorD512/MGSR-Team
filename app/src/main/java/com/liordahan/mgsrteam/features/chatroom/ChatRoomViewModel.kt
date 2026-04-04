package com.liordahan.mgsrteam.features.chatroom

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import android.net.Uri
import com.google.firebase.storage.FirebaseStorage
import com.liordahan.mgsrteam.features.chatroom.models.ChatAttachment
import com.liordahan.mgsrteam.features.chatroom.models.ChatMessage
import com.liordahan.mgsrteam.features.chatroom.models.PlayerMention
import com.liordahan.mgsrteam.features.chatroom.models.ReplyTo
import com.liordahan.mgsrteam.features.chatroom.repository.IChatRoomRepository
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.SharedCallables
import com.liordahan.mgsrteam.localization.LocaleManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class ChatRoomUiState(
    val messages: List<ChatMessage> = emptyList(),
    val allAccounts: List<Account> = emptyList(),
    val currentAccount: Account? = null,
    val players: List<Player> = emptyList(),
    val isLoading: Boolean = true,
    val isSending: Boolean = false,
    val isEditing: Boolean = false,
    val deletingMessageId: String? = null,
    val highlightMessageId: String? = null,
    val replyToMessage: ChatMessage? = null,
    val pendingAttachments: List<ChatAttachment> = emptyList(),
    val isUploading: Boolean = false
)

abstract class IChatRoomViewModel : ViewModel() {
    abstract val state: StateFlow<ChatRoomUiState>
    abstract fun sendMessage(text: String, notifyAccountId: String?, mentions: List<PlayerMention>)
    abstract fun editMessage(messageId: String, newText: String)
    abstract fun deleteMessage(messageId: String)
    abstract fun setHighlightMessage(messageId: String?)
    abstract fun searchPlayers(query: String): List<Player>
    abstract fun setReplyTo(message: ChatMessage?)
    abstract fun addAttachment(uri: Uri, fileName: String, mimeType: String, fileSize: Long)
    abstract fun removeAttachment(index: Int)
    abstract fun clearAttachments()
}

class ChatRoomViewModel(
    private val repository: IChatRoomRepository,
    private val playersRepository: IPlayersRepository,
    private val firebaseHandler: FirebaseHandler,
    private val appContext: Context
) : IChatRoomViewModel() {

    private val _state = MutableStateFlow(ChatRoomUiState())
    override val state: StateFlow<ChatRoomUiState> = _state.asStateFlow()

    init {
        loadCurrentAccount()
        loadAccounts()

        viewModelScope.launch {
            combine(
                repository.messagesFlow().catch { emit(emptyList()) },
                playersRepository.playersFlow().catch { emit(emptyList()) }
            ) { messages, players ->
                messages to players
            }.collect { (messages, players) ->
                _state.value = _state.value.copy(
                    messages = messages,
                    players = players,
                    isLoading = false
                )
            }
        }
    }

    private fun loadCurrentAccount() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val email = firebaseHandler.firebaseAuth.currentUser?.email ?: return@launch
                val snap = firebaseHandler.firebaseStore
                    .collection("Accounts")
                    .whereEqualTo("email", email)
                    .limit(1)
                    .get()
                    .await()
                val doc = snap.documents.firstOrNull() ?: return@launch
                val account = doc.toObject(Account::class.java)?.copy(id = doc.id)
                _state.value = _state.value.copy(currentAccount = account)
            } catch (_: Exception) { }
        }
    }

    private fun loadAccounts() {
        firebaseHandler.firebaseStore.collection("Accounts")
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val accounts = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(Account::class.java)?.copy(id = doc.id)
                }
                _state.value = _state.value.copy(allAccounts = accounts)
            }
    }

    override fun sendMessage(text: String, notifyAccountId: String?, mentions: List<PlayerMention>) {
        val account = _state.value.currentAccount ?: return
        val pendingAttachments = _state.value.pendingAttachments
        if (text.isBlank() && pendingAttachments.isEmpty()) return

        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(isSending = true)
            try {
                val mentionMaps = mentions.map { mapOf("playerId" to it.playerId, "playerName" to it.playerName, "playerNameHe" to it.playerNameHe) }

                // Build replyTo map if replying
                val replyToMap = _state.value.replyToMessage?.let { reply ->
                    mapOf(
                        "messageId" to reply.id,
                        "text" to reply.text,
                        "senderName" to reply.senderName,
                        "senderNameHe" to reply.senderNameHe
                    )
                }

                // Build attachments list
                val attachmentMaps = if (pendingAttachments.isNotEmpty()) {
                    pendingAttachments.map {
                        mapOf<String, Any>("url" to it.url, "name" to it.name, "type" to it.type, "size" to it.size)
                    }
                } else null

                SharedCallables.chatRoomSend(
                    senderAccountId = account.id ?: "",
                    senderName = account.name ?: "",
                    senderNameHe = account.hebrewName ?: "",
                    text = text,
                    notifyAccountId = notifyAccountId ?: "",
                    mentions = mentionMaps,
                    replyTo = replyToMap,
                    attachments = attachmentMaps
                )
            } catch (e: Exception) {
                android.util.Log.e("ChatRoom", "Send failed", e)
            } finally {
                _state.value = _state.value.copy(
                    isSending = false,
                    replyToMessage = null,
                    pendingAttachments = emptyList()
                )
            }
        }
    }

    override fun setHighlightMessage(messageId: String?) {
        _state.value = _state.value.copy(highlightMessageId = messageId)
    }

    override fun editMessage(messageId: String, newText: String) {
        val account = _state.value.currentAccount ?: return
        if (newText.isBlank()) return
        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(isEditing = true)
            try {
                SharedCallables.chatRoomEdit(
                    messageId = messageId,
                    senderAccountId = account.id ?: "",
                    newText = newText
                )
            } catch (e: Exception) {
                android.util.Log.e("ChatRoom", "Edit failed", e)
            } finally {
                _state.value = _state.value.copy(isEditing = false)
            }
        }
    }

    override fun deleteMessage(messageId: String) {
        val account = _state.value.currentAccount ?: return
        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(deletingMessageId = messageId)
            try {
                SharedCallables.chatRoomDelete(
                    messageId = messageId,
                    senderAccountId = account.id ?: ""
                )
            } catch (e: Exception) {
                android.util.Log.e("ChatRoom", "Delete failed", e)
            } finally {
                _state.value = _state.value.copy(deletingMessageId = null)
            }
        }
    }

    override fun searchPlayers(query: String): List<Player> {
        if (query.isBlank()) return emptyList()
        val q = query.lowercase()
        return _state.value.players
            .filter { it.fullName?.lowercase()?.contains(q) == true }
            .take(5)
    }

    override fun setReplyTo(message: ChatMessage?) {
        _state.value = _state.value.copy(replyToMessage = message)
    }

    override fun addAttachment(uri: Uri, fileName: String, mimeType: String, fileSize: Long) {
        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(isUploading = true)
            try {
                val storagePath = "ChatRoom/${System.currentTimeMillis()}_$fileName"
                val ref = FirebaseStorage.getInstance().reference.child(storagePath)
                ref.putFile(uri).await()
                val downloadUrl = ref.downloadUrl.await().toString()
                val attachment = ChatAttachment(
                    url = downloadUrl,
                    name = fileName,
                    type = mimeType,
                    size = fileSize
                )
                _state.value = _state.value.copy(
                    pendingAttachments = _state.value.pendingAttachments + attachment
                )
            } catch (e: Exception) {
                android.util.Log.e("ChatRoom", "Upload failed", e)
            } finally {
                _state.value = _state.value.copy(isUploading = false)
            }
        }
    }

    override fun removeAttachment(index: Int) {
        val current = _state.value.pendingAttachments.toMutableList()
        if (index in current.indices) current.removeAt(index)
        _state.value = _state.value.copy(pendingAttachments = current)
    }

    override fun clearAttachments() {
        _state.value = _state.value.copy(pendingAttachments = emptyList())
    }
}
