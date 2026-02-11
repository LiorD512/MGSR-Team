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
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.sort.SortOption
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
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale


data class PlayersUiState(
    val playersList: List<Player> = emptyList(),
    val visibleList: List<Player> = emptyList(),
    val expiringSoonPlayers: List<Player> = emptyList(),
    val showPageLoader: Boolean = false,
    val showRefreshButton: Boolean = false,
    val selectedPositions: List<Position> = emptyList(),
    val selectedAccounts: List<Account> = emptyList(),
    val contractFilterOption: ContractFilterOption = ContractFilterOption.NONE,
    val sortOption: SortOption = SortOption.DEFAULT,
    val isWithNotesChecked: Boolean = false,
    val searchQuery: String = "",
    val totalPlayers: Int = 0,
    val mandateCount: Int = 0,
    val freeAgentCount: Int = 0,
    val expiringCount: Int = 0
)

abstract class IPlayersViewModel : ViewModel() {
    abstract val playersFlow: StateFlow<PlayersUiState>
    abstract suspend fun getCurrentUserName(): String?
    abstract fun updateSearchQuery(query: String)
    abstract fun removeAllFilters()
    abstract suspend fun exportRosterCsv(): Result<ByteArray>
}

class PlayersViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val playersUpdate: PlayersUpdate,
    private val getPositionFilterFlowUseCase: IGetPositionFilterFlowUseCase,
    private val getAgentFilterFlowUseCase: IGetAgentFilterFlowUseCase,
    private val getContractFilterOptionUseCase: IGetContractFilterOptionUseCase,
    private val getIsWithNotesCheckedUseCase: IGetIsWithNotesCheckedUseCase,
    private val removeAllFiltersUseCase: IRemoveAllFiltersUseCase,
    private val getSortOptionUseCase: IGetSortOptionUseCase
) : IPlayersViewModel() {

    private val _playersFlow = MutableStateFlow(PlayersUiState())
    override val playersFlow: StateFlow<PlayersUiState> = _playersFlow

    init {
        getAllPlayers()

        viewModelScope.launch {
            _playersFlow.collect {
                _playersFlow.update {
                    val visible = it.playersList
                        .filterPlayersByPosition(it.selectedPositions)
                        ?.filterPlayersByAgent(it.selectedAccounts)
                        ?.filterPlayersByContractOption(it.contractFilterOption)
                        ?.filterByNotes(it.isWithNotesChecked)
                        ?.filterPlayersByNameOrByNote(it.searchQuery)
                        ?.sortedWith(compareByDescending<Player> {
                            it.noteList?.isNotEmpty() ?: false
                        }
                            .thenByDescending { player ->
                                player.noteList?.maxOfOrNull { note ->
                                    note.createdAt ?: Long.MIN_VALUE
                                } ?: Long.MIN_VALUE
                            }
                            .thenByDescending { it.notes?.isNotEmpty() ?: false }
                            .thenByDescending { it.createdAt })
                        ?.sortBySortOption(it.sortOption) ?: emptyList()
                    val allPlayers = it.playersList
                    val expiringSoon = allPlayers.filter { player ->
                        isContractExpiringWithinMonths(player.contractExpired, 5)
                    }
                    val mandateCount = allPlayers.count { player ->
                        player.haveMandate
                    }
                    val freeAgentCount = allPlayers.count { player ->
                        player.currentClub?.clubName.equals("Without Club", ignoreCase = true) ||
                                player.currentClub?.clubName.equals("Without club", ignoreCase = true)
                    }
                    it.copy(
                        visibleList = visible,
                        expiringSoonPlayers = expiringSoon,
                        totalPlayers = allPlayers.size,
                        mandateCount = mandateCount,
                        freeAgentCount = freeAgentCount,
                        expiringCount = expiringSoon.size
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

            launch {
                getSortOptionUseCase().collect { sortOption ->
                    _playersFlow.update { it.copy(sortOption = sortOption) }
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

    private fun List<Player>?.filterPlayersByNameOrByNote(query: String): List<Player>? {
        return if (query.isBlank()) {
            this
        } else {
            this?.filter {
                it.fullName?.contains(
                    query,
                    ignoreCase = true
                ) == true || it.noteList?.any { it.notes?.contains(query, true) == true } == true
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

    override suspend fun exportRosterCsv(): Result<ByteArray> {
        return try {
            val list = _playersFlow.value.playersList
            val header = "Name,Age,Position,Club,Market Value,Contract,Nationality,Agent"
            val rows = list.map { p ->
                listOf(
                    p.fullName.orEmpty().replace("\"", "\"\""),
                    p.age.orEmpty(),
                    (p.positions?.joinToString("; ") ?: "").replace("\"", "\"\""),
                    (p.currentClub?.clubName ?: "").replace("\"", "\"\""),
                    p.marketValue.orEmpty(),
                    p.contractExpired.orEmpty(),
                    p.nationality.orEmpty().replace("\"", "\"\""),
                    p.agentInChargeName.orEmpty().replace("\"", "\"\"")
                ).joinToString(",") { if (it.contains(",") || it.contains("\"")) "\"$it\"" else it }
            }
            val csv = (listOf(header) + rows).joinToString("\n")
            Result.Success(csv.toByteArray(StandardCharsets.UTF_8))
        } catch (e: Exception) {
            Result.Failed(e.message)
        }
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

    private fun List<Player>?.sortBySortOption(sortOption: SortOption): List<Player>? {
        return when (sortOption) {
            SortOption.DEFAULT -> this
            SortOption.NEWEST -> this?.sortedByDescending { it.createdAt }
            SortOption.MARKET_VALUE -> this?.sortedByDescending { it.marketValue?.toNumericValue() }
            SortOption.NAME -> this?.sortedBy { it.fullName }
            SortOption.AGE -> this?.sortedBy { it.age }
        }
    }

    private fun String.toNumericValue(): Double {
        val lower = this.lowercase().trim().removePrefix("€").replace(",", "")

        return when {
            lower.endsWith("k") -> lower.removeSuffix("k").toDoubleOrNull()?.times(1_000) ?: 0.0
            lower.endsWith("m") -> lower.removeSuffix("m").toDoubleOrNull()?.times(1_000_000) ?: 0.0
            else -> lower.toDoubleOrNull() ?: 0.0
        }
    }

    private fun List<Player>?.filterByNotes(isChecked: Boolean): List<Player>? {
        return if (!isChecked) {
            this
        } else {
            this?.filter { player ->
                !player.noteList.isNullOrEmpty()
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
        return isContractExpiringWithinMonths(contractExpired, 6)
    }

    fun isContractExpiringWithinMonths(
        contractExpired: String?,
        months: Int
    ): Boolean {
        if (contractExpired.isNullOrEmpty() || contractExpired == "-") return false
        val expiryDate = parseDateFlexible(contractExpired) ?: return false
        val now = LocalDate.now()
        val threshold = now.plusMonths(months.toLong())
        return !expiryDate.isBefore(now) && !expiryDate.isAfter(threshold)
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