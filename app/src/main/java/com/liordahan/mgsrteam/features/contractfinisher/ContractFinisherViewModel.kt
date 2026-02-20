package com.liordahan.mgsrteam.features.contractfinisher

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.Confederation
import com.liordahan.mgsrteam.transfermarket.ContractFinisher
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.NationToConfederation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Age range filter for contract finishers. */
enum class ContractFinisherAgeRange(val minAge: Int?, val maxAge: Int?) {
    ALL(null, null),
    RANGE_18_21(18, 21),
    RANGE_22_25(22, 25),
    RANGE_26_29(26, 29),
    RANGE_30_PLUS(30, null)
}

/** Foot filter - Left, Right, or All. */
enum class ContractFinisherFootFilter {
    ALL, LEFT, RIGHT
}

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
    abstract val selectedAgeRangeFlow: StateFlow<ContractFinisherAgeRange>
    abstract val selectedFootFlow: StateFlow<ContractFinisherFootFilter>
    abstract val selectedConfederationFlow: StateFlow<Confederation?>

    abstract fun selectPosition(position: Position?)
    abstract fun selectAgeRange(range: ContractFinisherAgeRange)
    abstract fun selectFoot(filter: ContractFinisherFootFilter)
    abstract fun selectConfederation(confederation: Confederation?)
    abstract fun clearFilters()
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
    private val _selectedAgeRangeFlow = MutableStateFlow(ContractFinisherAgeRange.ALL)
    private val _selectedFootFlow = MutableStateFlow(ContractFinisherFootFilter.ALL)
    private val _selectedConfederationFlow = MutableStateFlow<Confederation?>(null)
    private val _fetchErrorFlow = MutableStateFlow<String?>(null)
    private val _isLoadingFlow = MutableStateFlow(true)
    private var fetchJob: Job? = null

    override val selectedPositionFlow: StateFlow<Position?> = _selectedPositionFlow.asStateFlow()
    override val positionsFlow: StateFlow<List<Position>> = _positionsFlow.asStateFlow()
    override val selectedAgeRangeFlow: StateFlow<ContractFinisherAgeRange> = _selectedAgeRangeFlow.asStateFlow()
    override val selectedFootFlow: StateFlow<ContractFinisherFootFilter> = _selectedFootFlow.asStateFlow()
    override val selectedConfederationFlow: StateFlow<Confederation?> = _selectedConfederationFlow.asStateFlow()

    override val contractFinisherFlow: StateFlow<ContractFinisherUiState> = combine(
        _playersFlow,
        _selectedPositionFlow,
        _selectedAgeRangeFlow,
        _selectedFootFlow,
        _selectedConfederationFlow,
        _fetchErrorFlow,
        _isLoadingFlow
    ) { arr ->
        @Suppress("UNCHECKED_CAST")
        val players = arr[0] as List<LatestTransferModel>
        val selectedPos = arr[1] as Position?
        val ageRange = arr[2] as ContractFinisherAgeRange
        val footFilter = arr[3] as ContractFinisherFootFilter
        val confederation = arr[4] as Confederation?
        val error = arr[5] as String?
        val loading = arr[6] as Boolean
        val visible = players
            .filter { selectedPos == null || it.playerPosition.equals(selectedPos.name, ignoreCase = true) }
            .filter { passesAgeFilter(it, ageRange) }
            .filter { passesFootFilter(it, footFilter) }
            .filter { passesConfederationFilter(it, confederation) }
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

    private fun passesAgeFilter(player: LatestTransferModel, range: ContractFinisherAgeRange): Boolean {
        if (range == ContractFinisherAgeRange.ALL) return true
        val age = player.playerAge?.toIntOrNull() ?: return false
        return when (range) {
            ContractFinisherAgeRange.ALL -> true
            ContractFinisherAgeRange.RANGE_18_21 -> age in 18..21
            ContractFinisherAgeRange.RANGE_22_25 -> age in 22..25
            ContractFinisherAgeRange.RANGE_26_29 -> age in 26..29
            ContractFinisherAgeRange.RANGE_30_PLUS -> age >= 30
        }
    }

    private fun passesFootFilter(player: LatestTransferModel, filter: ContractFinisherFootFilter): Boolean {
        if (filter == ContractFinisherFootFilter.ALL) return true
        val foot = player.playerFoot?.trim()?.lowercase() ?: return false
        return when (filter) {
            ContractFinisherFootFilter.ALL -> true
            ContractFinisherFootFilter.LEFT -> foot == "left" || foot == "both"
            ContractFinisherFootFilter.RIGHT -> foot == "right" || foot == "both"
        }
    }

    private fun passesConfederationFilter(player: LatestTransferModel, confederation: Confederation?): Boolean {
        if (confederation == null) return true
        val playerConf = NationToConfederation.getConfederation(player.playerNationality) ?: return false
        return playerConf == confederation
    }

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

    override fun selectAgeRange(range: ContractFinisherAgeRange) {
        _selectedAgeRangeFlow.update { range }
    }

    override fun selectFoot(filter: ContractFinisherFootFilter) {
        _selectedFootFlow.update { filter }
    }

    override fun selectConfederation(confederation: Confederation?) {
        _selectedConfederationFlow.update { confederation }
    }

    override fun clearFilters() {
        _selectedPositionFlow.value = null
        _selectedAgeRangeFlow.value = ContractFinisherAgeRange.ALL
        _selectedFootFlow.value = ContractFinisherFootFilter.ALL
        _selectedConfederationFlow.value = null
    }

    override fun retry() {
        fetchByDetailsuche()
    }
}
