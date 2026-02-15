package com.liordahan.mgsrteam.features.contractfinisher

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.ContractFinisher
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

data class ContractFinisherUiState(
    val releasesList: List<LatestTransferModel> = emptyList(),
    val visibleList: List<LatestTransferModel> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val showError: Boolean = false,
    val failedFetchError: String? = null,
    val playersCount: Map<String, Int> = emptyMap(),
    val windowLabel: String = "Summer"
)

abstract class IContractFinisherViewModel : ViewModel() {
    abstract val contractFinisherFlow: StateFlow<ContractFinisherUiState>
    abstract val selectedPositionFlow: StateFlow<Position?>
    abstract val positionsFlow: StateFlow<List<Position>>

    abstract fun selectPosition(position: Position?)
    abstract fun retry()
}

class ContractFinisherViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val contractFinisher: ContractFinisher
) : IContractFinisherViewModel() {

    private val config = contractFinisher.getCurrentWindowConfig()

    private val _playersFlow = MutableStateFlow<List<LatestTransferModel>>(emptyList())
    private val _selectedPositionFlow = MutableStateFlow<Position?>(null)
    private val _positionsFlow = MutableStateFlow<List<Position>>(emptyList())
    private val _fetchErrorFlow = MutableStateFlow<String?>(null)
    private val _isLoadingFlow = MutableStateFlow(true)
    private var fetchJob: Job? = null

    override val selectedPositionFlow: StateFlow<Position?> = _selectedPositionFlow.asStateFlow()
    override val positionsFlow: StateFlow<List<Position>> = _positionsFlow.asStateFlow()

    override val contractFinisherFlow: StateFlow<ContractFinisherUiState> = combine(
        _playersFlow,
        _selectedPositionFlow,
        _fetchErrorFlow,
        _isLoadingFlow
    ) { players, selectedPos, error, loading ->
        val visible = players
            .filter { selectedPos == null || it.playerPosition.equals(selectedPos.name, ignoreCase = true) }
            .sortedByDescending { it.getRealMarketValue() }
        ContractFinisherUiState(
            releasesList = players,
            visibleList = visible,
            isLoading = loading,
            isLoadingMore = loading && players.isNotEmpty(),
            showError = !loading && players.isEmpty() && error != null,
            failedFetchError = error,
            playersCount = players.groupingBy { it.playerPosition ?: "" }.eachCount(),
            windowLabel = config.label
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ContractFinisherUiState(windowLabel = config.label)
    )

    init {
        getAllPositions()
        fetchByDetailsuche()
    }

    /**
     * Fetches contract finishers page by page, updating UI after each page (like Returnees).
     */
    private fun fetchByDetailsuche() {
        fetchJob?.cancel()
        fetchJob = viewModelScope.launch {
            _isLoadingFlow.value = true
            _fetchErrorFlow.value = null

            try {
                contractFinisher.fetchContractFinishersAsFlow(config).collect { progress ->
                    _playersFlow.value = progress.players
                    _isLoadingFlow.value = progress.isLoading
                    progress.error?.let { _fetchErrorFlow.value = it }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _fetchErrorFlow.value = e.localizedMessage ?: "Unknown error"
                _isLoadingFlow.value = false
            }
        }
    }

    private fun getAllPositions() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get()
            .addOnSuccessListener {
                _positionsFlow.value = it.toObjects(Position::class.java).sortedByDescending { it.sort }
            }
    }

    override fun selectPosition(position: Position?) {
        _selectedPositionFlow.update { position }
    }

    override fun retry() {
        fetchByDetailsuche()
    }
}
