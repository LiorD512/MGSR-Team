package com.liordahan.mgsrteam.features.youth.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.youth.data.YouthFirebaseHandler
import com.liordahan.mgsrteam.features.youth.models.YouthPlayer
import com.liordahan.mgsrteam.features.youth.models.YouthPosition
import com.liordahan.mgsrteam.features.youth.models.YouthRequest
import com.liordahan.mgsrteam.features.youth.repository.YouthPlayersRepository
import com.liordahan.mgsrteam.features.youth.repository.YouthRequestsRepository
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class YouthRequestsUiState(
    val requests: List<YouthRequest> = emptyList(),
    val requestsByPositionCountry: Map<String, Map<String, List<YouthRequest>>> = emptyMap(),
    val matchingPlayersByRequestId: Map<String, List<YouthPlayer>> = emptyMap(),
    val totalCount: Int = 0,
    val positionsCount: Int = 0,
    val pendingCount: Int = 0,
    val isLoading: Boolean = true,
    val addRequestMessage: String? = null,
    val addRequestError: String? = null
)

abstract class IYouthRequestsViewModel : ViewModel() {
    abstract val requestsState: StateFlow<YouthRequestsUiState>
    abstract val positions: StateFlow<List<YouthPosition>>
    abstract fun addRequest(
        club: ClubSearchModel, position: String, contactId: String?, contactName: String?,
        contactPhoneNumber: String?, minAge: Int?, maxAge: Int?, ageDoesntMatter: Boolean,
        dominateFoot: String?, salaryRange: String?, transferFee: String?, notes: String?
    )
    abstract fun updateRequest(
        existingRequest: YouthRequest, club: ClubSearchModel, position: String,
        contactId: String?, contactName: String?, contactPhoneNumber: String?,
        minAge: Int?, maxAge: Int?, ageDoesntMatter: Boolean,
        dominateFoot: String?, salaryRange: String?, transferFee: String?, notes: String?
    )
    abstract fun deleteRequest(request: YouthRequest)
    abstract fun clearAddRequestMessage()
}

class YouthRequestsViewModel(
    private val requestsRepository: YouthRequestsRepository,
    private val playersRepository: YouthPlayersRepository,
    private val firebaseHandler: YouthFirebaseHandler,
    private val clubSearch: ClubSearch
) : IYouthRequestsViewModel() {

    private val _positions = MutableStateFlow<List<YouthPosition>>(emptyList())
    override val positions: StateFlow<List<YouthPosition>> = _positions.asStateFlow()
    private val _addRequestMessage = MutableStateFlow<String?>(null)
    private val _addRequestError = MutableStateFlow<String?>(null)

    override val requestsState: StateFlow<YouthRequestsUiState> = MutableStateFlow(YouthRequestsUiState())

    private val _requestsState = requestsState as MutableStateFlow<YouthRequestsUiState>

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
                _positions.value = snapshot.toObjects(YouthPosition::class.java)
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
            val request = YouthRequest(
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
        existingRequest: YouthRequest, club: ClubSearchModel, position: String,
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

    override fun deleteRequest(request: YouthRequest) {
        val requestId = request.id ?: return
        viewModelScope.launch { requestsRepository.deleteRequest(requestId) }
    }

    override fun clearAddRequestMessage() {
        _addRequestMessage.value = null
        _addRequestError.value = null
    }
}
