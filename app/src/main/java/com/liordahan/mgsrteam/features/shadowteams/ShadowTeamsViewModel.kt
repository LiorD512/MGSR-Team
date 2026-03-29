package com.liordahan.mgsrteam.features.shadowteams

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.players.repository.PlayerWithId
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.SharedCallables
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class ShadowTeamsUiState(
    val accounts: List<Account> = emptyList(),
    val selectedAccountId: String? = null,
    val currentAccountId: String? = null,
    val formationId: String = "4-3-3",
    val slots: List<PositionSlot> = emptyList(),
    val isLoading: Boolean = true,
    val slotsLoading: Boolean = true,
    val isOwnTeam: Boolean = false,
    val isSaving: Boolean = false
)

abstract class IShadowTeamsViewModel : ViewModel() {
    abstract val uiState: StateFlow<ShadowTeamsUiState>
    abstract val rosterPlayers: StateFlow<List<PlayerWithId>>
    abstract fun selectAccount(accountId: String)
    abstract fun setFormation(formationId: String)
    abstract fun setSlot(index: Int, player: PlayerWithId)
    abstract fun removeSlot(index: Int)
    abstract suspend fun getTmProfileForPlayer(playerDocId: String): String?
}

class ShadowTeamsViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val playersRepository: IPlayersRepository,
    private val platformManager: PlatformManager
) : IShadowTeamsViewModel() {

    private val _uiState = MutableStateFlow(ShadowTeamsUiState())
    override val uiState: StateFlow<ShadowTeamsUiState> = _uiState.asStateFlow()

    override val rosterPlayers: StateFlow<List<PlayerWithId>> = playersRepository.playersWithIdsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        loadAccounts()
    }

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
                val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
                    .get()
                    .await()
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
                        slots = if (selectedId != null) List(11) { PositionSlot(null) } else it.slots,
                        formationId = if (selectedId != null) "4-3-3" else it.formationId
                    )
                }
                selectedId?.let { loadShadowTeam(it) }
            } catch (e: Exception) {
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
                slots = List(11) { PositionSlot(null) },
                formationId = "4-3-3"
            )
        }
        loadShadowTeam(accountId)
    }

    override fun setFormation(formationId: String) {
        val accountId = _uiState.value.selectedAccountId ?: return
        if (!_uiState.value.isOwnTeam) return
        _uiState.update { it.copy(formationId = formationId) }
        saveShadowTeam(_uiState.value.slots, formationId)
    }

    override fun setSlot(index: Int, player: PlayerWithId) {
        if (!_uiState.value.isOwnTeam) return
        val slots = _uiState.value.slots.toMutableList()
        while (slots.size <= index) slots.add(PositionSlot(null))
        slots[index] = PositionSlot(
            ShadowPlayer(
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
            slots[index] = PositionSlot(null)
            _uiState.update { it.copy(slots = slots) }
            saveShadowTeam(slots, _uiState.value.formationId)
        }
    }

    private fun saveShadowTeam(slots: List<PositionSlot>, formationId: String) {
        val accountId = _uiState.value.selectedAccountId ?: return
        if (!_uiState.value.isOwnTeam) return
        _uiState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            try {
                SharedCallables.shadowTeamsSave(
                    platformManager.value,
                    accountId,
                    mapOf(
                        "formationId" to formationId,
                        "slots" to slots.map { s ->
                            hashMapOf(
                                "starter" to (s.starter?.let { st ->
                                    hashMapOf(
                                        "id" to st.id,
                                        "fullName" to st.fullName,
                                        "profileImage" to st.profileImage
                                    )
                                })
                            )
                        },
                        "updatedAt" to System.currentTimeMillis()
                    )
                )
            } catch (e: Exception) {
                android.util.Log.e("ShadowTeamsVM", "saveShadowTeam failed", e)
            } finally {
                _uiState.update { it.copy(isSaving = false) }
            }
        }
    }

    private fun loadShadowTeam(accountId: String) {
        viewModelScope.launch {
            val startTime = System.currentTimeMillis()
            try {
                val doc = firebaseHandler.firebaseStore.collection(firebaseHandler.shadowTeamsTable)
                    .document(accountId)
                    .get()
                    .await()
                val minLoadingMs = 500L
                val elapsed = System.currentTimeMillis() - startTime
                val delay = (minLoadingMs - elapsed).coerceAtLeast(0L)
                delay(delay)
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
                        slotsLoading = false
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        formationId = "4-3-3",
                        slots = List(11) { PositionSlot(null) },
                        slotsLoading = false
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
