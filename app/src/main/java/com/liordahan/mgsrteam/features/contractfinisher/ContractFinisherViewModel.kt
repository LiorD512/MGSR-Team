package com.liordahan.mgsrteam.features.contractfinisher

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.ScrapingCacheRepository
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

/** Market value range filter (values in €). */
enum class ContractFinisherMarketValueRange(val minValue: Int?, val maxValue: Int?) {
    ALL(null, null),
    RANGE_150K_500K(150_000, 500_000),
    RANGE_500K_1M(500_000, 1_000_000),
    RANGE_1M_2M(1_000_000, 2_000_000),
    RANGE_2M_3M(2_000_000, 3_000_000)
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
    abstract val selectedConfederationFlow: StateFlow<Confederation?>
    abstract val selectedMarketValueRangeFlow: StateFlow<ContractFinisherMarketValueRange>

    abstract fun selectPosition(position: Position?)
    abstract fun selectAgeRange(range: ContractFinisherAgeRange)
    abstract fun selectConfederation(confederation: Confederation?)
    abstract fun selectMarketValueRange(range: ContractFinisherMarketValueRange)
    abstract fun clearFilters()
    abstract fun retry()
}

class ContractFinisherViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val contractFinisher: ContractFinisher,
    private val scrapingCache: ScrapingCacheRepository
) : IContractFinisherViewModel() {

    private val config = contractFinisher.getCurrentWindowConfig()

    private val _playersFlow = MutableStateFlow<List<LatestTransferModel>>(emptyList())
    private val _selectedPositionFlow = MutableStateFlow<Position?>(null)
    private val _positionsFlow = MutableStateFlow<List<Position>>(emptyList())
    private val _selectedAgeRangeFlow = MutableStateFlow(ContractFinisherAgeRange.ALL)
    private val _selectedConfederationFlow = MutableStateFlow<Confederation?>(null)
    private val _selectedMarketValueRangeFlow = MutableStateFlow(ContractFinisherMarketValueRange.ALL)
    private val _fetchErrorFlow = MutableStateFlow<String?>(null)
    private val _isLoadingFlow = MutableStateFlow(true)
    private var fetchJob: Job? = null

    override val selectedPositionFlow: StateFlow<Position?> = _selectedPositionFlow.asStateFlow()
    override val positionsFlow: StateFlow<List<Position>> = _positionsFlow.asStateFlow()
    override val selectedAgeRangeFlow: StateFlow<ContractFinisherAgeRange> = _selectedAgeRangeFlow.asStateFlow()
    override val selectedConfederationFlow: StateFlow<Confederation?> = _selectedConfederationFlow.asStateFlow()
    override val selectedMarketValueRangeFlow: StateFlow<ContractFinisherMarketValueRange> = _selectedMarketValueRangeFlow.asStateFlow()

    override val contractFinisherFlow: StateFlow<ContractFinisherUiState> = combine(
        _playersFlow,
        _selectedPositionFlow,
        _selectedAgeRangeFlow,
        _selectedConfederationFlow,
        _selectedMarketValueRangeFlow,
        _fetchErrorFlow,
        _isLoadingFlow
    ) { arr ->
        @Suppress("UNCHECKED_CAST")
        val players = arr[0] as List<LatestTransferModel>
        val selectedPos = arr[1] as Position?
        val ageRange = arr[2] as ContractFinisherAgeRange
        val confederation = arr[3] as Confederation?
        val marketValueRange = arr[4] as ContractFinisherMarketValueRange
        val error = arr[5] as String?
        val loading = arr[6] as Boolean
        val visible = players
            .filter { selectedPos == null || it.playerPosition.equals(selectedPos.name, ignoreCase = true) }
            .filter { passesAgeFilter(it, ageRange) }
            .filter { passesConfederationFilter(it, confederation) }
            .filter { passesMarketValueFilter(it, marketValueRange) }
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

    private fun passesConfederationFilter(player: LatestTransferModel, confederation: Confederation?): Boolean {
        if (confederation == null) return true
        val playerConf = NationToConfederation.getConfederation(player.playerNationality) ?: return false
        return playerConf == confederation
    }

    private fun passesMarketValueFilter(player: LatestTransferModel, range: ContractFinisherMarketValueRange): Boolean {
        if (range == ContractFinisherMarketValueRange.ALL) return true
        val value = player.getRealMarketValue()
        if (value <= 0) return false
        val min = range.minValue ?: return true
        val max = range.maxValue ?: return value >= min
        return value in min..max
    }

    init {
        getAllPositions()
        fetchByDetailsuche()
    }

    /**
     * Tries Firestore cache first (populated weekly by GitHub Actions).
     * Falls back to live TM scraping if cache is empty or expired.
     */
    private fun fetchByDetailsuche() {
        fetchJob?.cancel()
        fetchJob = viewModelScope.launch {
            _isLoadingFlow.value = true
            _fetchErrorFlow.value = null

            // Try cache first
            val cached = scrapingCache.getCachedPlayers("contract-finishers")
            if (!cached.isNullOrEmpty()) {
                _playersFlow.value = cached.sortedByDescending { it.getRealMarketValue() }
                _isLoadingFlow.value = false
                return@launch
            }

            // Fallback: live scraping
            try {
                contractFinisher.fetchContractFinishersAsFlow(config).collect { progress ->
                    _playersFlow.value = progress.players
                    _isLoadingFlow.value = progress.isLoading
                    progress.error?.let { _fetchErrorFlow.value = it }
                }
                _isLoadingFlow.value = false
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

    override fun selectConfederation(confederation: Confederation?) {
        _selectedConfederationFlow.update { confederation }
    }

    override fun selectMarketValueRange(range: ContractFinisherMarketValueRange) {
        _selectedMarketValueRangeFlow.update { range }
    }

    override fun clearFilters() {
        _selectedPositionFlow.value = null
        _selectedAgeRangeFlow.value = ContractFinisherAgeRange.ALL
        _selectedConfederationFlow.value = null
        _selectedMarketValueRangeFlow.value = ContractFinisherMarketValueRange.ALL
    }

    override fun retry() {
        fetchByDetailsuche()
    }
}
