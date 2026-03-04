package com.liordahan.mgsrteam.features.women.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenPlayer
import com.liordahan.mgsrteam.features.women.models.WomenPosition
import com.liordahan.mgsrteam.features.women.models.WomenRequest
import com.liordahan.mgsrteam.features.women.repository.WomenPlayersRepository
import com.liordahan.mgsrteam.features.women.repository.WomenRequestsRepository
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Women-dedicated requests UI state.
 */
data class WomenRequestsUiState(
    val requests: List<WomenRequest> = emptyList(),
    val requestsByPositionCountry: Map<String, Map<String, List<WomenRequest>>> = emptyMap(),
    val matchingPlayersByRequestId: Map<String, List<WomenPlayer>> = emptyMap(),
    val totalCount: Int = 0,
    val positionsCount: Int = 0,
    val pendingCount: Int = 0,
    val isLoading: Boolean = true,
    val addRequestMessage: String? = null,
    val addRequestError: String? = null
)

/**
 * Women-dedicated requests abstract ViewModel.
 */
abstract class IWomenRequestsViewModel : ViewModel() {
    abstract val requestsState: StateFlow<WomenRequestsUiState>
    abstract val positions: StateFlow<List<WomenPosition>>
    abstract fun addRequest(
        club: ClubSearchModel, position: String, contactId: String?, contactName: String?,
        contactPhoneNumber: String?, minAge: Int?, maxAge: Int?, ageDoesntMatter: Boolean,
        dominateFoot: String?, salaryRange: String?, transferFee: String?, notes: String?
    )
    abstract fun updateRequest(
        existingRequest: WomenRequest, club: ClubSearchModel, position: String,
        contactId: String?, contactName: String?, contactPhoneNumber: String?,
        minAge: Int?, maxAge: Int?, ageDoesntMatter: Boolean,
        dominateFoot: String?, salaryRange: String?, transferFee: String?, notes: String?
    )
    abstract fun deleteRequest(request: WomenRequest)
    abstract fun clearAddRequestMessage()
}

/**
 * Women-dedicated requests ViewModel implementation.
 */
class WomenRequestsViewModel(
    private val requestsRepository: WomenRequestsRepository,
    private val playersRepository: WomenPlayersRepository,
    private val firebaseHandler: WomenFirebaseHandler,
    private val clubSearch: ClubSearch
) : IWomenRequestsViewModel() {

    private val _positions = MutableStateFlow<List<WomenPosition>>(emptyList())
    override val positions: StateFlow<List<WomenPosition>> = _positions.asStateFlow()
    private val _addRequestMessage = MutableStateFlow<String?>(null)
    private val _addRequestError = MutableStateFlow<String?>(null)

    override val requestsState: StateFlow<WomenRequestsUiState> = MutableStateFlow(WomenRequestsUiState())

    private val _requestsState = requestsState as MutableStateFlow<WomenRequestsUiState>

    init {
        loadPositions()
        viewModelScope.launch {
            combine(
                requestsRepository.requestsFlow().catch { emit(emptyList()) },
                playersRepository.playersFlow().catch { emit(emptyList()) }
            ) { requests, players -> requests to players }
                .collect { (requests, players) ->
                    val byPositionCountry = requests
                        .groupBy { it.position ?: "Unknown" }
                        .mapValues { (_, reqs) ->
                            reqs.groupBy { it.clubCountry ?: "Unknown" }
                        }
                    val matching = requests.associate { request ->
                        val matchedPlayers = players.filter { player ->
                            val positionMatch = request.position.isNullOrEmpty() ||
                                    player.positions?.any { it.equals(request.position, true) } == true
                            positionMatch
                        }
                        (request.id ?: "") to matchedPlayers
                    }
                    _requestsState.value = _requestsState.value.copy(
                        requests = requests,
                        requestsByPositionCountry = byPositionCountry,
                        matchingPlayersByRequestId = matching,
                        totalCount = requests.size,
                        positionsCount = byPositionCountry.size,
                        pendingCount = requests.count { it.status == "pending" },
                        isLoading = false,
                        addRequestMessage = _addRequestMessage.value,
                        addRequestError = _addRequestError.value
                    )
                }
        }
    }

    private fun loadPositions() {
        viewModelScope.launch {
            try {
                val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get().await()
                _positions.value = snapshot.toObjects(WomenPosition::class.java)
                    .sortedBy { it.sort ?: Int.MAX_VALUE }
            } catch (_: Exception) {}
        }
    }

    override fun addRequest(
        club: ClubSearchModel, position: String, contactId: String?, contactName: String?,
        contactPhoneNumber: String?, minAge: Int?, maxAge: Int?, ageDoesntMatter: Boolean,
        dominateFoot: String?, salaryRange: String?, transferFee: String?, notes: String?
    ) {
        viewModelScope.launch {
            val request = WomenRequest(
                clubTmProfile = club.clubTmProfile,
                clubName = club.clubName,
                clubLogo = club.clubLogo,
                clubCountry = club.clubCountry,
                clubCountryFlag = club.clubCountryFlag,
                contactId = contactId,
                contactName = contactName,
                contactPhoneNumber = contactPhoneNumber,
                position = position,
                notes = notes,
                minAge = minAge,
                maxAge = maxAge,
                ageDoesntMatter = ageDoesntMatter,
                dominateFoot = dominateFoot,
                salaryRange = salaryRange,
                transferFee = transferFee,
                createdAt = System.currentTimeMillis(),
                status = "pending"
            )
            requestsRepository.addRequest(request)
                .onSuccess { _addRequestMessage.value = "Request added" }
                .onFailure { _addRequestError.value = it.message }
        }
    }

    override fun updateRequest(
        existingRequest: WomenRequest, club: ClubSearchModel, position: String,
        contactId: String?, contactName: String?, contactPhoneNumber: String?,
        minAge: Int?, maxAge: Int?, ageDoesntMatter: Boolean,
        dominateFoot: String?, salaryRange: String?, transferFee: String?, notes: String?
    ) {
        viewModelScope.launch {
            val updated = existingRequest.copy(
                clubTmProfile = club.clubTmProfile,
                clubName = club.clubName,
                clubLogo = club.clubLogo,
                clubCountry = club.clubCountry,
                clubCountryFlag = club.clubCountryFlag,
                contactId = contactId,
                contactName = contactName,
                contactPhoneNumber = contactPhoneNumber,
                position = position,
                notes = notes,
                minAge = minAge,
                maxAge = maxAge,
                ageDoesntMatter = ageDoesntMatter,
                dominateFoot = dominateFoot,
                salaryRange = salaryRange,
                transferFee = transferFee
            )
            requestsRepository.updateRequest(updated)
        }
    }

    override fun deleteRequest(request: WomenRequest) {
        viewModelScope.launch { requestsRepository.deleteRequest(request) }
    }

    override fun clearAddRequestMessage() {
        _addRequestMessage.value = null
        _addRequestError.value = null
    }
}
