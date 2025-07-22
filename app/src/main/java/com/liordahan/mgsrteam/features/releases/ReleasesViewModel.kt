package com.liordahan.mgsrteam.features.releases

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.Result
import com.liordahan.mgsrteam.transfermarket.LatestReleases
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReleasesUiState(
    val releasesList: List<LatestTransferModel> = emptyList(),
    val visibleList: List<LatestTransferModel> = emptyList(),
    val isLoading: Boolean = true,
    val showError: Boolean = false,
    val failedFetchError: String? = null
)

abstract class IReleasesViewModel : ViewModel() {
    abstract val releasesFlow: StateFlow<ReleasesUiState>
    abstract val selectedPositionFlow: StateFlow<Position?>
    abstract val positionsFlow: StateFlow<List<Position>>
    abstract fun selectPosition(position: Position?)
}

class ReleasesViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val latestReleases: LatestReleases
) : IReleasesViewModel() {

    private val releaseRanges = listOf(
        125000..250000,
        250001..400000,
        400001..600000,
        600001..800000,
        800001..1000000,
        1000001..1200000,
        1200001..1400000,
        1400001..1600000,
        1600001..1800000
    )

    private val totalRangeCount = releaseRanges.size
    private val fetchedCount = MutableStateFlow(0)

    private val _selectedPositionFlow = MutableStateFlow<Position?>(null)
    override val selectedPositionFlow: StateFlow<Position?> = _selectedPositionFlow

    private val _positionsFlow = MutableStateFlow<List<Position>>(emptyList())
    override val positionsFlow: StateFlow<List<Position>> = _positionsFlow

    private val fetchFailedErrorFlow = MutableStateFlow<String?>(null)

    private val releaseFlowsMap: Map<IntRange, MutableStateFlow<List<LatestTransferModel>>> =
        releaseRanges.associateWith { MutableStateFlow(emptyList()) }

    override val releasesFlow: StateFlow<ReleasesUiState> = combine(
        releaseFlowsMap.values.toList() + fetchedCount + _selectedPositionFlow + fetchFailedErrorFlow
    ) { combined ->
        val releasesCount = releaseFlowsMap.size
        val fetched = combined[releasesCount] as Int
        val selectedPosition = combined[releasesCount + 1] as Position?
        val failedFetchError = combined[releasesCount + 2] as String?

        val releasesLists =
            combined.take(releasesCount).filterIsInstance<List<LatestTransferModel>>()

        ReleasesUiState(
            releasesList = releasesLists.flatten().sortedByDescending { it.getRealMarketValue() },
            visibleList = releasesLists.flatten().filterPlayersByPosition(selectedPosition)
                ?.sortedByDescending { it.getRealMarketValue() } ?: emptyList(),
            isLoading = fetched < totalRangeCount,
            showError = releasesLists.isEmpty(),
            failedFetchError = failedFetchError
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ReleasesUiState()
    )

    init {
        fetchAllReleases()
        getAllPositions()
    }

    private fun fetchAllReleases() {
        releaseRanges.forEach { range ->
            viewModelScope.launch {
                when (val result = latestReleases.getLatestReleases(range.first, range.last)) {
                    is Result.Success -> releaseFlowsMap[range]?.value = result.data.filterNotNull()
                    is Result.Failed -> fetchFailedErrorFlow.update { it }
                }
                fetchedCount.value += 1
            }
        }
    }

    private fun List<LatestTransferModel>?.filterPlayersByPosition(position: Position?): List<LatestTransferModel>? {
        return if (position == null) {
            this
        } else {
            this?.filter {
                it.playerPosition?.equals(position.name, ignoreCase = true) == true
            }
        }
    }


    private fun getAllPositions() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get()
            .addOnSuccessListener {
                val positions = it.toObjects(Position::class.java)
                _positionsFlow.update {
                    positions.sortedByDescending { it.sort }
                }
            }
    }

    override fun selectPosition(position: Position?) {
        _selectedPositionFlow.update { position }
    }
}

