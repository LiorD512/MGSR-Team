package com.liordahan.mgsrteam.features.chatroom

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.chatroom.models.ChatMessage
import com.liordahan.mgsrteam.features.chatroom.models.PlayerMention
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
    val highlightMessageId: String? = null
)

abstract class IChatRoomViewModel : ViewModel() {
    abstract val state: StateFlow<ChatRoomUiState>
    abstract fun sendMessage(text: String, notifyAccountId: String?, mentions: List<PlayerMention>)
    abstract fun setHighlightMessage(messageId: String?)
    abstract fun searchPlayers(query: String): List<Player>
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
        if (text.isBlank()) return

        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(isSending = true)
            try {
                val mentionMaps = mentions.map { mapOf("playerId" to it.playerId, "playerName" to it.playerName) }

                SharedCallables.chatRoomSend(
                    senderAccountId = account.id ?: "",
                    senderName = account.name ?: "",
                    senderNameHe = account.hebrewName ?: "",
                    text = text,
                    notifyAccountId = notifyAccountId ?: "",
                    mentions = mentionMaps
                )
            } catch (e: Exception) {
                android.util.Log.e("ChatRoom", "Send failed", e)
            } finally {
                _state.value = _state.value.copy(isSending = false)
            }
        }
    }

    override fun setHighlightMessage(messageId: String?) {
        _state.value = _state.value.copy(highlightMessageId = messageId)
    }

    override fun searchPlayers(query: String): List<Player> {
        if (query.isBlank()) return emptyList()
        val q = query.lowercase()
        return _state.value.players
            .filter { it.fullName?.lowercase()?.contains(q) == true }
            .take(5)
    }
}
