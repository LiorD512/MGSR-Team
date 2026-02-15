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
import com.liordahan.mgsrteam.features.players.filters.usecases.IQuickFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IResetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetPositionFiltersByNamesUseCase
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
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


data class PlayerWithMandateExpiry(val player: Player, val mandateExpiryAt: Long?)

data class PlayersUiState(
    val playersList: List<Player> = emptyList(),
    val visibleList: List<Player> = emptyList(),
    val allAccounts: List<Account> = emptyList(),
    val expiringSoonPlayers: List<Player> = emptyList(),
    val playersWithMandate: List<PlayerWithMandateExpiry> = emptyList(),
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
    val expiringCount: Int = 0,
    val quickFilterFreeAgents: Boolean = false,
    val quickFilterContractExpiring: Boolean = false,
    val quickFilterWithMandate: Boolean = false,
    val quickFilterMyPlayersOnly: Boolean = false,
    val quickFilterLoanPlayersOnly: Boolean = false,
    val currentUserName: String? = null
)

abstract class IPlayersViewModel : ViewModel() {
    abstract val playersFlow: StateFlow<PlayersUiState>
    abstract suspend fun getCurrentUserName(): String?
    abstract fun updateSearchQuery(query: String)
    abstract fun removeAllFilters()
    abstract fun setPositionFilterByChip(positionName: String)
    abstract fun toggleQuickFilterFreeAgents()
    abstract fun toggleQuickFilterContractExpiring()
    abstract fun toggleQuickFilterWithMandate()
    abstract fun toggleQuickFilterMyPlayersOnly()
    abstract fun toggleQuickFilterLoanPlayersOnly()
    abstract fun toggleQuickFilterWithNotesOnly()
    abstract fun setSortOption(option: SortOption)
    abstract fun resetSortOption()
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
    private val getSortOptionUseCase: IGetSortOptionUseCase,
    private val setPositionFiltersByNamesUseCase: ISetPositionFiltersByNamesUseCase,
    private val quickFilterUseCase: IQuickFilterUseCase,
    private val setSortOptionUseCase: ISetSortOptionUseCase,
    private val resetSortOptionUseCase: IResetSortOptionUseCase
) : IPlayersViewModel() {

    private val _playersFlow = MutableStateFlow(PlayersUiState())
    override val playersFlow: StateFlow<PlayersUiState> = _playersFlow

    private val _mandateExpiryByPlayer = MutableStateFlow<Map<String, Long>>(emptyMap())

    init {
        getAllPlayers()
        loadAllAccounts()
        loadMandateDocuments()

        viewModelScope.launch {
            val name = getCurrentUserName()
            _playersFlow.update { it.copy(currentUserName = name) }
        }

        viewModelScope.launch {
            _playersFlow.collect {
                _playersFlow.update {
                    val visible = it.playersList
                        .filterPlayersByPosition(it.selectedPositions)
                        ?.filterPlayersByAgent(it.selectedAccounts)
                        ?.filterPlayersByQuickFilterAndContract(
                            quickFilterFreeAgents = it.quickFilterFreeAgents,
                            quickFilterContractExpiring = it.quickFilterContractExpiring,
                            contractFilterOption = it.contractFilterOption
                        )
                        ?.filterPlayersByWithMandate(it.quickFilterWithMandate, _mandateExpiryByPlayer.value)
                        ?.filterPlayersByMyPlayersOnly(it.quickFilterMyPlayersOnly, it.currentUserName)
                        ?.filterPlayersByLoanPlayers(it.quickFilterLoanPlayersOnly)
                        ?.filterByNotes(it.isWithNotesChecked)
                        ?.filterPlayersByNameOrByNote(it.searchQuery)
                        ?.sortPlayers(it.isWithNotesChecked, it.sortOption) ?: emptyList()
                    val allPlayers = it.playersList
                    val expiringSoon = allPlayers.filter { player ->
                        isContractExpiringWithinMonths(player.contractExpired, 5)
                    }
                    val mandateExpiryMap = _mandateExpiryByPlayer.value
                    val playersWithMandate = allPlayers
                        .filter { player ->
                            player.haveMandate || (player.tmProfile != null && player.tmProfile in mandateExpiryMap)
                        }
                        .map { player ->
                            PlayerWithMandateExpiry(
                                player = player,
                                mandateExpiryAt = player.tmProfile?.let { mandateExpiryMap[it] }
                            )
                        }
                        .sortedBy { it.mandateExpiryAt ?: Long.MAX_VALUE }
                    val mandateCount = allPlayers.count { player ->
                        player.haveMandate || (player.tmProfile != null && player.tmProfile in mandateExpiryMap)
                    }
                    val freeAgentCount = allPlayers.count { player ->
                        player.currentClub?.clubName.equals("Without Club", ignoreCase = true) ||
                                player.currentClub?.clubName.equals("Without club", ignoreCase = true)
                    }
                    it.copy(
                        visibleList = visible,
                        expiringSoonPlayers = expiringSoon,
                        playersWithMandate = playersWithMandate,
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

            launch {
                quickFilterUseCase.quickFilterFreeAgents.collect { enabled ->
                    _playersFlow.update { it.copy(quickFilterFreeAgents = enabled) }
                }
            }

            launch {
                quickFilterUseCase.quickFilterContractExpiring.collect { enabled ->
                    _playersFlow.update { it.copy(quickFilterContractExpiring = enabled) }
                }
            }

            launch {
                quickFilterUseCase.quickFilterWithMandate.collect { enabled ->
                    _playersFlow.update { it.copy(quickFilterWithMandate = enabled) }
                }
            }

            launch {
                quickFilterUseCase.quickFilterMyPlayersOnly.collect { enabled ->
                    _playersFlow.update { it.copy(quickFilterMyPlayersOnly = enabled) }
                }
            }

            launch {
                quickFilterUseCase.quickFilterLoanPlayersOnly.collect { enabled ->
                    _playersFlow.update { it.copy(quickFilterLoanPlayersOnly = enabled) }
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

    override fun setPositionFilterByChip(positionName: String) {
        when (positionName) {
            "All" -> setPositionFiltersByNamesUseCase(emptyList())
            else -> setPositionFiltersByNamesUseCase(listOf(positionName))
        }
    }

    override fun toggleQuickFilterFreeAgents() = quickFilterUseCase.toggleFreeAgents()
    override fun toggleQuickFilterContractExpiring() = quickFilterUseCase.toggleContractExpiring()
    override fun toggleQuickFilterWithMandate() = quickFilterUseCase.toggleWithMandate()
    override fun toggleQuickFilterMyPlayersOnly() = quickFilterUseCase.toggleMyPlayersOnly()
    override fun toggleQuickFilterLoanPlayersOnly() = quickFilterUseCase.toggleLoanPlayersOnly()
    override fun toggleQuickFilterWithNotesOnly() = quickFilterUseCase.toggleWithNotesOnly()
    override fun setSortOption(option: SortOption) = setSortOptionUseCase(option)
    override fun resetSortOption() = resetSortOptionUseCase()

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
            val positionNames = expandPositionNames(positions.mapNotNull { it.name })
            this?.filter { player ->
                player.positions?.any { pos ->
                    pos?.uppercase()?.let { p -> positionNames.any { it.equals(p, ignoreCase = true) } } == true
                } == true
            }
        }
    }

    /** Expands chip labels (DEF, MID, FWD) to actual position codes from Transfermarkt. */
    private fun expandPositionNames(names: List<String>): Set<String> {
        val groupToCodes = mapOf(
            "DEF" to setOf("CB", "RB", "LB"),
            "MID" to setOf("CM", "DM", "AM"),
            "FWD" to setOf("ST", "CF", "LW", "RW", "SS", "AM")
        )
        return names.flatMap { name ->
            groupToCodes[name.uppercase()] ?: setOf(name)
        }.toSet()
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

    private fun List<Player>?.filterPlayersByQuickFilterAndContract(
        quickFilterFreeAgents: Boolean,
        quickFilterContractExpiring: Boolean,
        contractFilterOption: ContractFilterOption
    ): List<Player>? {
        return when {
            quickFilterFreeAgents || quickFilterContractExpiring -> {
                this?.filter { player ->
                    val isFreeAgent = player.currentClub?.clubName.equals("Without Club", ignoreCase = true) ||
                            player.currentClub?.clubName.equals("Without club", ignoreCase = true)
                    val isExpiring = isContractExpiringWithin6Months(player.contractExpired)
                    when {
                        quickFilterFreeAgents && quickFilterContractExpiring -> isFreeAgent || isExpiring
                        quickFilterFreeAgents -> isFreeAgent
                        else -> isExpiring
                    }
                }
            }
            contractFilterOption != ContractFilterOption.NONE -> filterPlayersByContractOption(contractFilterOption)
            else -> this
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

    private fun List<Player>?.filterPlayersByWithMandate(
        enabled: Boolean,
        mandateExpiryByPlayer: Map<String, Long> = emptyMap()
    ): List<Player>? {
        return if (!enabled) this
        else this?.filter { player ->
            player.haveMandate || (player.tmProfile != null && player.tmProfile in mandateExpiryByPlayer)
        }
    }

    private fun List<Player>?.filterPlayersByMyPlayersOnly(enabled: Boolean, currentUserName: String?): List<Player>? {
        return if (!enabled || currentUserName.isNullOrBlank()) this
        else this?.filter { it.agentInChargeName.equals(currentUserName, ignoreCase = true) }
    }

    private fun List<Player>?.filterPlayersByLoanPlayers(enabled: Boolean): List<Player>? {
        return if (!enabled) this else this?.filter { it.isOnLoan }
    }

    /** Newest first by default. When withNotesOnly is on, players with most recent note date come first. */
    private fun List<Player>?.sortPlayers(withNotesOnly: Boolean, sortOption: SortOption): List<Player>? {
        return if (withNotesOnly) {
            this?.sortedWith(
                compareByDescending<Player> { player ->
                    player.noteList?.maxOfOrNull { note -> note.createdAt ?: Long.MIN_VALUE } ?: Long.MIN_VALUE
                }.thenByDescending { it.createdAt }
            )
        } else {
            this?.sortBySortOption(sortOption)
        }
    }

    private fun List<Player>?.sortBySortOption(sortOption: SortOption): List<Player>? {
        return when (sortOption) {
            SortOption.DEFAULT, SortOption.NEWEST -> this?.sortedByDescending { it.createdAt }
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

    private fun loadMandateDocuments() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.playerDocumentsTable)
            .whereEqualTo("type", "MANDATE")
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val docs = snapshot.toObjects(PlayerDocument::class.java)
                val map = docs
                    .filter { it.playerTmProfile != null && it.expiresAt != null }
                    .groupBy { it.playerTmProfile!! }
                    .mapValues { (_, list) -> list.maxOf { it.expiresAt!! } }
                _mandateExpiryByPlayer.value = map
                _playersFlow.update { state ->
                    val allPlayers = state.playersList
                    val playersWithMandate = allPlayers
                        .filter { player ->
                            player.haveMandate || (player.tmProfile != null && player.tmProfile in map)
                        }
                        .map { player ->
                            PlayerWithMandateExpiry(
                                player = player,
                                mandateExpiryAt = player.tmProfile?.let { map[it] }
                            )
                        }
                        .sortedBy { it.mandateExpiryAt ?: Long.MAX_VALUE }
                    state.copy(playersWithMandate = playersWithMandate)
                }
            }
    }

    private fun loadAllAccounts() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val accounts = snapshot.toObjects(Account::class.java)
                _playersFlow.update { it.copy(allAccounts = accounts) }
            }
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