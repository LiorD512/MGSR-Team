package com.liordahan.mgsrteam.features.shadowteams

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class ShadowTeamsUiState(
    val accounts: List<Account> = emptyList(),
    val selectedAccountId: String? = null,
    val formationId: String = "4-3-3",
    val slots: List<PositionSlot> = emptyList(),
    val isLoading: Boolean = true
)

abstract class IShadowTeamsViewModel : ViewModel() {
    abstract val uiState: StateFlow<ShadowTeamsUiState>
    abstract fun selectAccount(accountId: String)
    abstract suspend fun getTmProfileForPlayer(playerDocId: String): String?
}

class ShadowTeamsViewModel(
    private val firebaseHandler: FirebaseHandler
) : IShadowTeamsViewModel() {

    private val _uiState = MutableStateFlow(ShadowTeamsUiState())
    override val uiState: StateFlow<ShadowTeamsUiState> = _uiState.asStateFlow()

    init {
        loadAccounts()
    }

    private fun loadAccounts() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
                    .get()
                    .await()
                val accounts = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(Account::class.java)?.copy(id = doc.id)
                }
                val selectedId = _uiState.value.selectedAccountId ?: accounts.firstOrNull()?.id
                _uiState.update {
                    it.copy(
                        accounts = accounts,
                        selectedAccountId = selectedId,
                        isLoading = false
                    )
                }
                selectedId?.let { loadShadowTeam(it) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    override fun selectAccount(accountId: String) {
        _uiState.update { it.copy(selectedAccountId = accountId, isLoading = true) }
        loadShadowTeam(accountId)
    }

    private fun loadShadowTeam(accountId: String) {
        viewModelScope.launch {
            try {
                val doc = firebaseHandler.firebaseStore.collection(firebaseHandler.shadowTeamsTable)
                    .document(accountId)
                    .get()
                    .await()
                val data = doc.data
                val formationId = (data?.get("formationId") as? String) ?: "4-3-3"
                @Suppress("UNCHECKED_CAST")
                val slotsRaw = data?.get("slots") as? List<Map<String, Any?>> ?: emptyList()
                val slots = slotsRaw.map { slotMap ->
                    val starterRaw = slotMap["starter"] as? Map<String, Any?>
                    val starter = if (starterRaw != null) {
                        val id = starterRaw["id"] as? String ?: return@map PositionSlot(null)
                        val fullName = starterRaw["fullName"] as? String ?: ""
                        val profileImage = starterRaw["profileImage"] as? String
                        PositionSlot(ShadowPlayer(id = id, fullName = fullName, profileImage = profileImage))
                    } else {
                        PositionSlot(null)
                    }
                    starter
                }
                val paddedSlots = if (slots.size < 11) {
                    slots + List(11 - slots.size) { PositionSlot(null) }
                } else slots.take(11)
                _uiState.update {
                    it.copy(
                        formationId = formationId,
                        slots = paddedSlots,
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        formationId = "4-3-3",
                        slots = List(11) { PositionSlot(null) },
                        isLoading = false
                    )
                }
            }
        }
    }

    override suspend fun getTmProfileForPlayer(playerDocId: String): String? {
        return try {
            val doc = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                .document(playerDocId)
                .get()
                .await()
            doc.toObject(Player::class.java)?.tmProfile
        } catch (e: Exception) {
            null
        }
    }
}
