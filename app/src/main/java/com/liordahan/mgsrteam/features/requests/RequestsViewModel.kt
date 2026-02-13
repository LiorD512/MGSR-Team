package com.liordahan.mgsrteam.features.requests

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.requests.repository.IRequestsRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Structure: Position -> Country -> List of Requests (clubs)
 */
data class RequestsUiState(
    val requests: List<Request> = emptyList(),
    val requestsByPositionCountry: Map<String, Map<String, List<Request>>> = emptyMap(),
    val matchingPlayersByRequestId: Map<String, List<Player>> = emptyMap(),
    val totalCount: Int = 0,
    val positionsCount: Int = 0,
    val pendingCount: Int = 0,
    val isLoading: Boolean = true,
    val addRequestMessage: String? = null,
    val addRequestError: String? = null
)

abstract class IRequestsViewModel : ViewModel() {
    abstract val requestsState: StateFlow<RequestsUiState>
    abstract val positions: StateFlow<List<Position>>
    abstract fun addRequest(
        club: ClubSearchModel,
        position: String,
        contactId: String?,
        contactName: String?,
        contactPhoneNumber: String?,
        minAge: Int?,
        maxAge: Int?,
        ageDoesntMatter: Boolean,
        salaryRange: String?,
        transferFee: String?,
        notes: String?
    )
    abstract fun deleteRequest(requestId: String)
    abstract fun clearAddRequestMessage()
}

class RequestsViewModel(
    private val requestsRepository: IRequestsRepository,
    private val playersRepository: IPlayersRepository,
    private val firebaseHandler: FirebaseHandler,
    private val clubSearch: ClubSearch
) : IRequestsViewModel() {

    private val _positions = MutableStateFlow<List<Position>>(emptyList())
    override val positions: StateFlow<List<Position>> = _positions.asStateFlow()

    private val _addRequestMessage = MutableStateFlow<String?>(null)
    private val _addRequestError = MutableStateFlow<String?>(null)

    private val defaultPositionOrder = listOf("GK", "CB", "LB", "RB", "DM", "CM", "LM", "RM", "LW", "RW", "CF", "ST")

    override val requestsState: StateFlow<RequestsUiState> = combine(
        requestsRepository.requestsFlow(),
        playersRepository.playersFlow(),
        _positions,
        _addRequestMessage,
        _addRequestError
    ) { requests, players, posList, msg, err ->
        val pendingCount = requests.count { (it.status ?: "pending") == "pending" }
        val order = posList.map { it.name ?: "" }.filter { it.isNotBlank() }
            .ifEmpty { defaultPositionOrder }
        val pendingList = requests.filter { (it.status ?: "pending") == "pending" }
        val byPosition = pendingList.groupBy { it.position ?: "Other" }
            .toSortedMap(compareBy { pos ->
                order.indexOfFirst { it.equals(pos, ignoreCase = true) }.takeIf { it >= 0 } ?: 999
            })
        val byPositionCountry = byPosition.mapValues { (_, reqList) ->
            reqList.groupBy { it.clubCountry?.takeIf { c -> c.isNotBlank() } ?: "Other" }
                .toSortedMap(compareBy { if (it == "Other") "\uFFFF" else it.lowercase() })
        }
        val matchingPlayersByRequestId = requests.associate { req ->
            (req.id ?: "") to RequestMatcher.match(req, players)
        }.filterKeys { it.isNotBlank() }
        RequestsUiState(
            requests = requests,
            requestsByPositionCountry = byPositionCountry,
            matchingPlayersByRequestId = matchingPlayersByRequestId,
            totalCount = requests.size,
            positionsCount = byPosition.size,
            pendingCount = pendingCount,
            isLoading = false,
            addRequestMessage = msg,
            addRequestError = err
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        RequestsUiState()
    )

    init {
        loadPositions()
    }

    private fun loadPositions() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get()
            .addOnSuccessListener {
                val posList = it.toObjects(Position::class.java)
                _positions.value = posList.sortedByDescending { it.sort }
            }
    }

    override fun addRequest(
        club: ClubSearchModel,
        position: String,
        contactId: String?,
        contactName: String?,
        contactPhoneNumber: String?,
        minAge: Int?,
        maxAge: Int?,
        ageDoesntMatter: Boolean,
        salaryRange: String?,
        transferFee: String?,
        notes: String?
    ) {
        viewModelScope.launch {
            _addRequestError.value = null
            val request = Request(
                clubTmProfile = club.clubTmProfile,
                clubName = club.clubName,
                clubLogo = club.clubLogo,
                clubCountry = club.clubCountry,
                clubCountryFlag = club.clubCountryFlag,
                contactId = contactId,
                contactName = contactName,
                contactPhoneNumber = contactPhoneNumber,
                position = position,
                notes = notes?.takeIf { it.isNotBlank() },
                minAge = minAge?.takeIf { it > 0 },
                maxAge = maxAge?.takeIf { it > 0 },
                ageDoesntMatter = ageDoesntMatter,
                salaryRange = salaryRange?.takeIf { it.isNotBlank() },
                transferFee = transferFee?.takeIf { it.isNotBlank() },
                createdAt = System.currentTimeMillis(),
                status = "pending"
            )
            requestsRepository.addRequest(request).fold(
                onSuccess = { _addRequestMessage.value = "Request added" },
                onFailure = { _addRequestError.value = it.message ?: "Failed to add request" }
            )
        }
    }

    override fun deleteRequest(requestId: String) {
        viewModelScope.launch {
            requestsRepository.deleteRequest(requestId)
        }
    }

    override fun clearAddRequestMessage() {
        _addRequestMessage.value = null
        _addRequestError.value = null
    }
}
