package com.liordahan.mgsrteam.features.youth.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.youth.data.YouthFirebaseHandler
import com.liordahan.mgsrteam.features.youth.models.YouthPlayer
import com.liordahan.mgsrteam.features.youth.models.YouthPositionSlot
import com.liordahan.mgsrteam.features.youth.models.YouthShadowPlayer
import com.liordahan.mgsrteam.features.youth.repository.YouthPlayersRepository
import com.liordahan.mgsrteam.features.youth.repository.YouthPlayerWithId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class YouthShadowTeamsUiState(
    val accounts: List<Account> = emptyList(),
    val selectedAccountId: String? = null,
    val currentAccountId: String? = null,
    val formationId: String = "4-3-3",
    val slots: List<YouthPositionSlot> = emptyList(),
    val isLoading: Boolean = true,
    val slotsLoading: Boolean = true,
    val isOwnTeam: Boolean = false
)

abstract class IYouthShadowTeamsViewModel : ViewModel() {
    abstract val uiState: StateFlow<YouthShadowTeamsUiState>
    abstract val rosterPlayers: StateFlow<List<YouthPlayerWithId>>
    abstract fun selectAccount(accountId: String)
    abstract fun setFormation(formationId: String)
    abstract fun setSlot(index: Int, player: YouthPlayerWithId)
    abstract fun removeSlot(index: Int)
    abstract suspend fun getTmProfileForPlayer(playerDocId: String): String?
}

class YouthShadowTeamsViewModel(
    private val firebaseHandler: YouthFirebaseHandler,
    private val playersRepository: YouthPlayersRepository
) : IYouthShadowTeamsViewModel() {

    private val _uiState = MutableStateFlow(YouthShadowTeamsUiState())
    override val uiState: StateFlow<YouthShadowTeamsUiState> = _uiState.asStateFlow()

    override val rosterPlayers: StateFlow<List<YouthPlayerWithId>> =
        playersRepository.playersWithIdsFlow()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init { loadAccounts() }

    private fun currentAccountId(accounts: List<Account> = _uiState.value.accounts): String? {
        val user = firebaseHandler.firebaseAuth.currentUser ?: return null
        val byUid = accounts.find { it.id == user.uid }
        val byEmail = accounts.find { it.email?.equals(user.email, ignoreCase = true) == true }
        return byUid?.id ?: byEmail?.id ?: user.uid
    }

    private fun loadAccounts() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
                val accounts = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(Account::class.java)?.copy(id = doc.id)
                }
                val selectedId = _uiState.value.selectedAccountId ?: accounts.firstOrNull()?.id
                val currentId = currentAccountId(accounts)
                _uiState.update {
                    it.copy(
                        accounts = accounts,
                        selectedAccountId = selectedId,
                        currentAccountId = currentId,
                        isOwnTeam = selectedId == currentId,
                        isLoading = false,
                        slotsLoading = selectedId != null,
                        slots = if (selectedId != null) List(11) { YouthPositionSlot(null) } else it.slots,
                        formationId = if (selectedId != null) "4-3-3" else it.formationId
                    )
                }
                selectedId?.let { loadShadowTeam(it) }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    override fun selectAccount(accountId: String) {
        val currentId = currentAccountId()
        _uiState.update {
            it.copy(
                selectedAccountId = accountId,
                isOwnTeam = accountId == currentId,
                slotsLoading = true,
                slots = List(11) { YouthPositionSlot(null) },
                formationId = "4-3-3"
            )
        }
        loadShadowTeam(accountId)
    }

    override fun setFormation(formationId: String) {
        if (!_uiState.value.isOwnTeam) return
        _uiState.update { it.copy(formationId = formationId) }
        saveShadowTeam(_uiState.value.slots, formationId)
    }

    override fun setSlot(index: Int, player: YouthPlayerWithId) {
        if (!_uiState.value.isOwnTeam) return
        val slots = _uiState.value.slots.toMutableList()
        while (slots.size <= index) slots.add(YouthPositionSlot(null))
        slots[index] = YouthPositionSlot(
            YouthShadowPlayer(
                id = player.id,
                fullName = player.player.fullName ?: "",
                profileImage = player.player.profileImage
            )
        )
        _uiState.update { it.copy(slots = slots) }
        saveShadowTeam(slots, _uiState.value.formationId)
    }

    override fun removeSlot(index: Int) {
        if (!_uiState.value.isOwnTeam) return
        val slots = _uiState.value.slots.toMutableList()
        if (index in slots.indices) {
            slots[index] = YouthPositionSlot(null)
            _uiState.update { it.copy(slots = slots) }
            saveShadowTeam(slots, _uiState.value.formationId)
        }
    }

    private fun saveShadowTeam(slots: List<YouthPositionSlot>, formationId: String) {
        val accountId = _uiState.value.selectedAccountId ?: return
        if (!_uiState.value.isOwnTeam) return
        viewModelScope.launch {
            try {
                val data = hashMapOf(
                    "formationId" to formationId,
                    "slots" to slots.map { s ->
                        hashMapOf("starter" to (s.starter?.let { st ->
                            hashMapOf("id" to st.id, "fullName" to st.fullName, "profileImage" to st.profileImage)
                        }))
                    },
                    "updatedAt" to System.currentTimeMillis()
                )
                firebaseHandler.firebaseStore.collection(firebaseHandler.shadowTeamsTable)
                    .document(accountId).set(data).await()
            } catch (_: Exception) { }
        }
    }

    private fun loadShadowTeam(accountId: String) {
        viewModelScope.launch {
            val startTime = System.currentTimeMillis()
            try {
                val doc = firebaseHandler.firebaseStore.collection(firebaseHandler.shadowTeamsTable)
                    .document(accountId).get().await()
                val elapsed = System.currentTimeMillis() - startTime
                delay((500L - elapsed).coerceAtLeast(0L))
                val data = doc.data
                val formationId = (data?.get("formationId") as? String) ?: "4-3-3"
                @Suppress("UNCHECKED_CAST")
                val slotsRaw = data?.get("slots") as? List<Map<String, Any?>> ?: emptyList()
                val slots = slotsRaw.map { slotMap ->
                    val starterRaw = slotMap["starter"] as? Map<String, Any?>
                    if (starterRaw != null) {
                        val id = starterRaw["id"] as? String ?: return@map YouthPositionSlot(null)
                        val fullName = starterRaw["fullName"] as? String ?: ""
                        val profileImage = starterRaw["profileImage"] as? String
                        YouthPositionSlot(YouthShadowPlayer(id = id, fullName = fullName, profileImage = profileImage))
                    } else {
                        YouthPositionSlot(null)
                    }
                }
                val padded = if (slots.size < 11) slots + List(11 - slots.size) { YouthPositionSlot(null) } else slots.take(11)
                _uiState.update { it.copy(formationId = formationId, slots = padded, slotsLoading = false) }
            } catch (_: Exception) {
                _uiState.update { it.copy(formationId = "4-3-3", slots = List(11) { YouthPositionSlot(null) }, slotsLoading = false) }
            }
        }
    }

    override suspend fun getTmProfileForPlayer(playerDocId: String): String? {
        return try {
            val doc = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                .document(playerDocId).get().await()
            doc.toObject(YouthPlayer::class.java)?.tmProfile
        } catch (_: Exception) { null }
    }
}
