package com.liordahan.mgsrteam.features.players

import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.usecases.GetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.GetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetAgentFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.Result
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale


data class PlayersUiState(
    val playersList: List<Player> = emptyList(),
    val visibleList: List<Player> = emptyList(),
    val showPageLoader: Boolean = false,
    val showRefreshButton: Boolean = false,
    val selectedPositions: List<Position> = emptyList(),
    val selectedAccounts: List<Account> = emptyList(),
    val contractFilterOption: ContractFilterOption = ContractFilterOption.NONE,
    val isWithNotesChecked: Boolean = false,
    val searchQuery: String = ""
)

abstract class IPlayersViewModel : ViewModel() {
    abstract val playersFlow: StateFlow<PlayersUiState>
    abstract suspend fun getCurrentUserName(): String?
    abstract fun updateSearchQuery(query: String)
    abstract fun removeAllFilters()
}

class PlayersViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val playersUpdate: PlayersUpdate,
    private val getPositionFilterFlowUseCase: IGetPositionFilterFlowUseCase,
    private val getAgentFilterFlowUseCase: IGetAgentFilterFlowUseCase,
    private val getContractFilterOptionUseCase: IGetContractFilterOptionUseCase,
    private val getIsWithNotesCheckedUseCase: IGetIsWithNotesCheckedUseCase,
    private val removeAllFiltersUseCase: IRemoveAllFiltersUseCase
) : IPlayersViewModel() {

    private val _playersFlow = MutableStateFlow(PlayersUiState())
    override val playersFlow: StateFlow<PlayersUiState> = _playersFlow

    init {
        getAllPlayers()

        viewModelScope.launch {
            _playersFlow.collect {
                _playersFlow.update {
                    it.copy(
                        visibleList = it.playersList
                            .filterPlayersByPosition(it.selectedPositions)
                            ?.filterPlayersByAgent(it.selectedAccounts)
                            ?.filterPlayersByContractOption(it.contractFilterOption)
                            ?.filterByNotes(it.isWithNotesChecked)
                            ?.filterPlayersByName(it.searchQuery)
                            ?.sortedWith(compareByDescending<Player> { it.noteList?.isNotEmpty() ?: false }
                                .thenByDescending { player ->
                                    // Sort by date of last note (descending)
                                    player.noteList?.maxOfOrNull { note ->
                                        note.createdAt ?: Long.MIN_VALUE
                                    } ?: Long.MIN_VALUE
                                }
                                .thenByDescending { it.notes?.isNotEmpty() ?: false }
                                .thenByDescending { it.createdAt }) ?: emptyList(),
                    )
                }
            }
        }

        viewModelScope.launch {
            launch {
                getAgentFilterFlowUseCase().collect { accountFilter ->
                    _playersFlow.update { it.copy(selectedAccounts = accountFilter) }
                }
            }

            launch {
                getPositionFilterFlowUseCase().collect { positionFilter ->
                    _playersFlow.update { it.copy(selectedPositions = positionFilter) }
                }
            }

            launch {
                getContractFilterOptionUseCase().collect { contractFilterOption ->
                    _playersFlow.update { it.copy(contractFilterOption = contractFilterOption) }
                }
            }

            launch {
                getIsWithNotesCheckedUseCase().collect { isChecked ->
                    _playersFlow.update { it.copy(isWithNotesChecked = isChecked) }
                }
            }
        }
    }


    override suspend fun getCurrentUserName(): String? {
        return try {
            val snapshot =
                firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get()
                    .await()
            val accounts = snapshot.toObjects(Account::class.java)
            val account = accounts.firstOrNull {
                it.email?.equals(
                    firebaseHandler.firebaseAuth.currentUser?.email,
                    ignoreCase = true
                ) == true
            }
            if (account?.email.equals("dahanliordahan@gmail.com", ignoreCase = true)) {
                _playersFlow.update { it.copy(showRefreshButton = true) }
            }

            account?.name
        } catch (e: Exception) {
            null
        }
    }

    private fun List<Player>?.filterPlayersByName(name: String): List<Player>? {
        return if (name.isBlank()) {
            this
        } else {
            this?.filter {
                it.fullName?.contains(name, ignoreCase = true) == true
            }
        }
    }


    override fun updateSearchQuery(query: String) {
        _playersFlow.update { it.copy(searchQuery = query) }
    }

    override fun removeAllFilters() {
        updateSearchQuery("")
        removeAllFiltersUseCase()
    }


    private fun List<Player>?.filterPlayersByPosition(positions: List<Position>): List<Player>? {
        return if (positions.isEmpty()) {
            this
        } else {
            val positionNames = positions.map { it.name }.toSet()
            this?.filter { player ->
                player.positions?.any { pos -> pos in positionNames } == true
            }
        }
    }

    private fun List<Player>?.filterPlayersByAgent(accounts: List<Account>): List<Player>? {
        return if (accounts.isEmpty()) {
            this
        } else {
            val accountNames = accounts.map { it.name }.toSet()
            this?.filter { player ->
                player.agentInChargeName in accountNames
            }
        }
    }

    private fun List<Player>?.filterPlayersByContractOption(contractFilterOption: ContractFilterOption): List<Player>? {
        return when (contractFilterOption) {
            ContractFilterOption.NONE -> this
            ContractFilterOption.WITHOUT_CLUB -> this?.filter {
                it.currentClub?.clubName.equals(
                    "Without club",
                    true
                )
            }

            ContractFilterOption.CONTRACT_FINISHING -> this?.filter {
                isContractExpiringWithin6Months(it.contractExpired)
            }
        }
    }

    private fun List<Player>?.filterByNotes(isChecked: Boolean): List<Player>? {
        return if (!isChecked) {
            this
        } else {
            this?.filter { player ->
                !player.notes.isNullOrEmpty()
            }
        }
    }


    fun parseDateFlexible(dateStr: String): LocalDate? {
        val formatters = listOf(
            DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ENGLISH)
        )

        for (formatter in formatters) {
            try {
                return LocalDate.parse(dateStr, formatter)
            } catch (_: DateTimeParseException) {
            }
        }
        return null // if nothing matched
    }

    fun isContractExpiringWithin6Months(
        contractExpired: String?
    ): Boolean {
        if (contractExpired.isNullOrEmpty() || contractExpired == "-") return false
        val expiredDate = parseDateFlexible(contractExpired) ?: return false
        val sixMonthsFromNow = LocalDate.now().plusMonths(6)
        return expiredDate.isBefore(sixMonthsFromNow)
    }

    private fun getAllPlayers() {

        _playersFlow.update { it.copy(showPageLoader = true) }

        firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    _playersFlow.update {
                        it.copy(
                            playersList = emptyList(),
                            visibleList = emptyList(),
                            showPageLoader = false
                        )
                    }
                } else {
                    val playersList = value?.toObjects(Player::class.java) ?: emptyList()
                    _playersFlow.update {
                        it.copy(
                            playersList = playersList.sortedByDescending { it.createdAt },
                            visibleList = playersList.sortedByDescending { it.createdAt },
                            showPageLoader = false
                        )
                    }
                }
            }
    }

}