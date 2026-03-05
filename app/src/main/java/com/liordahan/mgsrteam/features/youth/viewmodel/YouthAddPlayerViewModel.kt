package com.liordahan.mgsrteam.features.youth.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.youth.data.YouthFirebaseHandler
import com.liordahan.mgsrteam.features.youth.models.YouthClub
import com.liordahan.mgsrteam.features.youth.models.YouthFeedEvent
import com.liordahan.mgsrteam.features.youth.models.YouthPlayer
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class YouthAddPlayerUiState(
    val showSearchProgress: Boolean = false,
    val showPlayerSelectedSearchProgress: Boolean = false
)

data class YouthPlayerFormState(
    val fullName: String = "",
    val fullNameHe: String = "",
    val positions: List<String> = emptyList(),
    val currentClub: String = "",
    val age: String = "",
    val dateOfBirth: String = "",
    val nationality: String = "",
    val marketValue: String = "",
    val profileImage: String = "",
    val ifaUrl: String = "",
    val ifaPlayerId: String = "",
    val academy: String = "",
    val ageGroup: String = "",
    val playerPhone: String = "",
    val playerEmail: String = "",
    val agentPhone: String = "",
    val parentName: String = "",
    val parentRelationship: String = "",
    val parentPhoneNumber: String = "",
    val parentEmail: String = "",
    val notes: String = "",
    val isSaving: Boolean = false
) {
    companion object {
        val YOUTH_POSITIONS = listOf("GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "CF", "SS")
        val YOUTH_AGE_GROUPS = listOf("U-15", "U-16", "U-17", "U-18", "U-19", "U-21", "U-23")
    }
}

abstract class IYouthAddPlayerViewModel : ViewModel() {
    abstract val searchState: StateFlow<YouthAddPlayerUiState>
    abstract val isPlayerAddedFlow: StateFlow<Boolean>
    abstract val errorMessageFlow: SharedFlow<String?>
    abstract val searchQuery: StateFlow<String>
    abstract val youthFormState: StateFlow<YouthPlayerFormState>
    abstract fun updateSearchQuery(query: String?)
    abstract fun updateYouthForm(updater: (YouthPlayerFormState) -> YouthPlayerFormState)
    abstract fun toggleYouthPosition(position: String)
    abstract fun saveYouthPlayer()
    abstract fun clearYouthForm()
    abstract fun createManualPlayer(fullName: String)
    abstract fun resetAfterAdd()
}

/**
 * Youth-dedicated AddPlayer ViewModel.
 * Youth players are primarily added manually (no SoccerDonna/Transfermarkt search).
 * Supports optional IFA URL for linking to Israel Football Association data.
 */
@OptIn(FlowPreview::class)
class YouthAddPlayerViewModel(
    private val firebaseHandler: YouthFirebaseHandler
) : IYouthAddPlayerViewModel() {

    private val _searchState = MutableStateFlow(YouthAddPlayerUiState())
    override val searchState: StateFlow<YouthAddPlayerUiState> = _searchState

    private val _isPlayerAddedFlow = MutableStateFlow(false)
    override val isPlayerAddedFlow: StateFlow<Boolean> = _isPlayerAddedFlow

    private val _errorMessageFlow = MutableSharedFlow<String?>()
    override val errorMessageFlow: SharedFlow<String?> = _errorMessageFlow

    private val _searchQuery = MutableStateFlow("")
    override val searchQuery: StateFlow<String> = _searchQuery

    private val _youthFormState = MutableStateFlow(YouthPlayerFormState())
    override val youthFormState: StateFlow<YouthPlayerFormState> = _youthFormState

    init {
        viewModelScope.launch {
            searchQuery
                .debounce(400)
                .distinctUntilChanged()
                .collectLatest { query ->
                    // Youth uses manual entry — search checks for duplicates in roster
                    if (query.isNotBlank()) {
                        _searchState.update { it.copy(showSearchProgress = true) }
                        try {
                            val snapshot = firebaseHandler.firebaseStore
                                .collection(firebaseHandler.playersTable)
                                .whereEqualTo("fullName", query.trim())
                                .get().await()
                            if (snapshot.documents.isNotEmpty()) {
                                _errorMessageFlow.emit("Player already in roster")
                            }
                        } catch (_: Exception) { }
                        _searchState.update { it.copy(showSearchProgress = false) }
                    }
                }
        }
    }

    override fun updateSearchQuery(query: String?) {
        _searchQuery.update { query ?: "" }
    }

    override fun updateYouthForm(updater: (YouthPlayerFormState) -> YouthPlayerFormState) {
        _youthFormState.update(updater)
    }

    override fun toggleYouthPosition(position: String) {
        _youthFormState.update { state ->
            val current = state.positions.toMutableList()
            if (current.contains(position)) current.remove(position) else current.add(position)
            state.copy(positions = current)
        }
    }

    override fun clearYouthForm() {
        _youthFormState.update { YouthPlayerFormState() }
    }

    override fun createManualPlayer(fullName: String) {
        if (fullName.isBlank()) return
        viewModelScope.launch {
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = true) }
            try {
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("fullName", fullName.trim()).get().await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
                    return@launch
                }
            } catch (_: Exception) { }
            _youthFormState.update {
                YouthPlayerFormState(fullName = fullName.trim())
            }
            _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
        }
    }

    override fun saveYouthPlayer() {
        val form = _youthFormState.value
        if (form.fullName.isBlank()) return
        _youthFormState.update { it.copy(isSaving = true) }

        viewModelScope.launch {
            try {
                // Check duplicate by name
                val snapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("fullName", form.fullName.trim())
                    .get().await()
                if (snapshot.documents.isNotEmpty()) {
                    _errorMessageFlow.emit("Player already in roster")
                    _youthFormState.update { it.copy(isSaving = false) }
                    return@launch
                }

                // Check duplicate by IFA URL
                if (form.ifaUrl.isNotBlank()) {
                    val ifaCheck = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .whereEqualTo("ifaUrl", form.ifaUrl.trim())
                        .get().await()
                    if (ifaCheck.documents.isNotEmpty()) {
                        _errorMessageFlow.emit("Player with this IFA profile already in roster")
                        _youthFormState.update { it.copy(isSaving = false) }
                        return@launch
                    }
                }

                val accountsSnapshot = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.accountsTable).get().await()
                val accounts = accountsSnapshot.toObjects(Account::class.java)
                val agentInChargeName = accounts.firstOrNull {
                    it.email?.equals(firebaseHandler.firebaseAuth.currentUser?.email, ignoreCase = true) == true
                }?.name

                val parentContact = if (form.parentName.isNotBlank()) {
                    com.liordahan.mgsrteam.features.youth.models.YouthParentContact(
                        parentName = form.parentName.trim(),
                        parentRelationship = form.parentRelationship.takeIf { it.isNotBlank() },
                        parentPhoneNumber = form.parentPhoneNumber.takeIf { it.isNotBlank() },
                        parentEmail = form.parentEmail.takeIf { it.isNotBlank() }
                    )
                } else null

                val player = YouthPlayer(
                    fullName = form.fullName.trim(),
                    fullNameHe = form.fullNameHe.takeIf { it.isNotBlank() },
                    positions = form.positions.ifEmpty { null },
                    currentClub = form.currentClub.takeIf { it.isNotBlank() }?.let { YouthClub(clubName = it) },
                    age = form.age.takeIf { it.isNotBlank() },
                    dateOfBirth = form.dateOfBirth.takeIf { it.isNotBlank() },
                    nationality = form.nationality.takeIf { it.isNotBlank() },
                    marketValue = form.marketValue.takeIf { it.isNotBlank() },
                    profileImage = form.profileImage.takeIf { it.isNotBlank() },
                    ifaUrl = form.ifaUrl.takeIf { it.isNotBlank() },
                    ifaPlayerId = form.ifaPlayerId.takeIf { it.isNotBlank() },
                    academy = form.academy.takeIf { it.isNotBlank() },
                    ageGroup = form.ageGroup.takeIf { it.isNotBlank() },
                    playerPhoneNumber = form.playerPhone.takeIf { it.isNotBlank() },
                    playerEmail = form.playerEmail.takeIf { it.isNotBlank() },
                    agentPhoneNumber = form.agentPhone.takeIf { it.isNotBlank() },
                    parentContact = parentContact,
                    notes = form.notes.takeIf { it.isNotBlank() },
                    createdAt = System.currentTimeMillis(),
                    agentInChargeName = agentInChargeName
                )

                val docRef = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable).add(player).await()

                com.liordahan.mgsrteam.analytics.AnalyticsHelper.logAddPlayer()

                firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                    YouthFeedEvent(
                        type = YouthFeedEvent.TYPE_PLAYER_ADDED,
                        playerName = player.fullName,
                        playerImage = player.profileImage,
                        playerTmProfile = docRef.id,
                        timestamp = System.currentTimeMillis(),
                        agentName = agentInChargeName
                    )
                )

                _isPlayerAddedFlow.update { true }
            } catch (e: Exception) {
                _errorMessageFlow.emit(e.message ?: "Failed to save player")
            }
            _youthFormState.update { it.copy(isSaving = false) }
        }
    }

    override fun resetAfterAdd() {
        _isPlayerAddedFlow.value = false
        _youthFormState.update { YouthPlayerFormState() }
        _searchState.update { it.copy(showPlayerSelectedSearchProgress = false) }
    }
}
