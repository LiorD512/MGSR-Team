package com.liordahan.mgsrteam.features.women.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.FootFilterOption
import com.liordahan.mgsrteam.features.players.filters.usecases.*
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenPlayer
import com.liordahan.mgsrteam.features.women.models.toSharedPlayer
import com.liordahan.mgsrteam.features.women.repository.WomenPlayersRepository
import com.liordahan.mgsrteam.helpers.Result
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

// ── Women-dedicated player with mandate expiry ──

data class WomenPlayerWithMandateExpiry(val player: WomenPlayer, val mandateExpiryAt: Long?)

// ── Women-dedicated UI state ──

data class WomenPlayersUiState(
    val playersList: List<WomenPlayer> = emptyList(),
    val visibleList: List<WomenPlayer> = emptyList(),
    val allAccounts: List<Account> = emptyList(),
    val expiringSoonPlayers: List<WomenPlayer> = emptyList(),
    val playersWithMandate: List<WomenPlayerWithMandateExpiry> = emptyList(),
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
    val quickFilterWithoutRegisteredAgent: Boolean = false,
    val footFilterOption: FootFilterOption = FootFilterOption.NONE,
    val currentUserName: String? = null
)

// ── Abstract interface ──

abstract class IWomenPlayersViewModel : ViewModel() {
    abstract val playersFlow: StateFlow<WomenPlayersUiState>
    abstract suspend fun getCurrentUserName(): String?
    abstract fun updateSearchQuery(query: String)
    abstract fun removeAllFilters()
    abstract fun setPositionFilterByChip(positionName: String)
    abstract fun toggleQuickFilterFreeAgents()
    abstract fun toggleQuickFilterContractExpiring()
    abstract fun toggleQuickFilterWithMandate()
    abstract fun toggleQuickFilterMyPlayersOnly()
    abstract fun toggleQuickFilterLoanPlayersOnly()
    abstract fun toggleQuickFilterWithoutRegisteredAgent()
    abstract fun applyInitialMyPlayersOnlyIfNeeded(initialMyPlayersOnly: Boolean)
    abstract fun toggleQuickFilterWithNotesOnly()
    abstract fun setFootFilterOption(option: FootFilterOption)
    abstract fun setSortOption(option: SortOption)
    abstract fun resetSortOption()
    abstract suspend fun exportRosterCsv(): Result<ByteArray>
}

// ── Women-dedicated implementation ──

class WomenPlayersViewModel(
    private val firebaseHandler: WomenFirebaseHandler,
    private val womenPlayersRepository: WomenPlayersRepository,
    private val getPositionFilterFlowUseCase: IGetPositionFilterFlowUseCase,
    private val getAgentFilterFlowUseCase: IGetAgentFilterFlowUseCase,
    private val getContractFilterOptionUseCase: IGetContractFilterOptionUseCase,
    private val getFootFilterOptionUseCase: IGetFootFilterOptionUseCase,
    private val setFootFilterOptionUseCase: ISetFootFilterOptionUseCase,
    private val getIsWithNotesCheckedUseCase: IGetIsWithNotesCheckedUseCase,
    private val removeAllFiltersUseCase: IRemoveAllFiltersUseCase,
    private val getSortOptionUseCase: IGetSortOptionUseCase,
    private val setPositionFiltersByNamesUseCase: ISetPositionFiltersByNamesUseCase,
    private val quickFilterUseCase: IQuickFilterUseCase,
    private val setSortOptionUseCase: ISetSortOptionUseCase,
    private val resetSortOptionUseCase: IResetSortOptionUseCase
) : IWomenPlayersViewModel() {

    private val _inputState = MutableStateFlow(WomenPlayersUiState())
    private val _searchQuery = MutableStateFlow("")
    private val _mandateExpiryByPlayer = MutableStateFlow<Map<String, Long>>(emptyMap())

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    override val playersFlow: StateFlow<WomenPlayersUiState> = combine(
        _inputState,
        _searchQuery.debounce(300L),
        _mandateExpiryByPlayer
    ) { state, debouncedQuery, mandateMap ->
        computeUiState(state, debouncedQuery, mandateMap)
    }
        .flowOn(Dispatchers.Default)
        .stateIn(viewModelScope, SharingStarted.Eagerly, WomenPlayersUiState(showPageLoader = true))

    private val listenerRegistrations = mutableListOf<ListenerRegistration>()
    private var hasAppliedInitialMyPlayersOnly = false

    init {
        getAllPlayers()
        loadAllAccounts()
        loadMandateDocuments()

        viewModelScope.launch(Dispatchers.IO) {
            val name = getCurrentUserName()
            _inputState.update { it.copy(currentUserName = name) }
        }

        viewModelScope.launch {
            launch { getAgentFilterFlowUseCase().collect { v -> _inputState.update { it.copy(selectedAccounts = v) } } }
            launch { getPositionFilterFlowUseCase().collect { v -> _inputState.update { it.copy(selectedPositions = v) } } }
            launch { getContractFilterOptionUseCase().collect { v -> _inputState.update { it.copy(contractFilterOption = v) } } }
            launch { getFootFilterOptionUseCase().collect { v -> _inputState.update { it.copy(footFilterOption = v) } } }
            launch { getIsWithNotesCheckedUseCase().collect { v -> _inputState.update { it.copy(isWithNotesChecked = v) } } }
            launch { getSortOptionUseCase().collect { v -> _inputState.update { it.copy(sortOption = v) } } }
            launch { quickFilterUseCase.quickFilterFreeAgents.collect { v -> _inputState.update { it.copy(quickFilterFreeAgents = v) } } }
            launch { quickFilterUseCase.quickFilterContractExpiring.collect { v -> _inputState.update { it.copy(quickFilterContractExpiring = v) } } }
            launch { quickFilterUseCase.quickFilterWithMandate.collect { v -> _inputState.update { it.copy(quickFilterWithMandate = v) } } }
            launch { quickFilterUseCase.quickFilterMyPlayersOnly.collect { v -> _inputState.update { it.copy(quickFilterMyPlayersOnly = v) } } }
            launch { quickFilterUseCase.quickFilterLoanPlayersOnly.collect { v -> _inputState.update { it.copy(quickFilterLoanPlayersOnly = v) } } }
            launch { quickFilterUseCase.quickFilterWithoutRegisteredAgent.collect { v -> _inputState.update { it.copy(quickFilterWithoutRegisteredAgent = v) } } }
        }
    }

    private fun computeUiState(
        state: WomenPlayersUiState,
        query: String,
        mandateMap: Map<String, Long>
    ): WomenPlayersUiState {
        var visible = state.playersList.toList()

        // Position filter
        if (state.selectedPositions.isNotEmpty()) {
            val positionNames = expandPositionNames(state.selectedPositions.mapNotNull { it.name })
            visible = visible.filter { player ->
                player.positions?.any { pos ->
                    pos?.uppercase()?.let { p -> positionNames.any { it.equals(p, ignoreCase = true) } } == true
                } == true
            }
        }
        // Agent filter
        if (state.selectedAccounts.isNotEmpty()) {
            val accountNames = state.selectedAccounts.map { it.name }.toSet()
            visible = visible.filter { it.agentInChargeName in accountNames }
        }
        // Quick filter: freeAgents / contractExpiring
        if (state.quickFilterFreeAgents || state.quickFilterContractExpiring) {
            visible = visible.filter { player ->
                val isFreeAgent = player.currentClub?.clubName.equals("Without Club", ignoreCase = true) ||
                        player.currentClub?.clubName.equals("Without club", ignoreCase = true)
                val isExpiring = isContractExpiringWithin6Months(player.contractExpired)
                when {
                    state.quickFilterFreeAgents && state.quickFilterContractExpiring -> isFreeAgent || isExpiring
                    state.quickFilterFreeAgents -> isFreeAgent
                    else -> isExpiring
                }
            }
        } else if (state.contractFilterOption != ContractFilterOption.NONE) {
            visible = when (state.contractFilterOption) {
                ContractFilterOption.WITHOUT_CLUB -> visible.filter { it.currentClub?.clubName.equals("Without club", true) }
                ContractFilterOption.CONTRACT_FINISHING -> visible.filter { isContractExpiringWithin6Months(it.contractExpired) }
                else -> visible
            }
        }
        // With mandate
        if (state.quickFilterWithMandate) {
            visible = visible.filter { player ->
                player.haveMandate || (player.tmProfile != null && player.tmProfile in mandateMap) || (player.id != null && player.id in mandateMap)
            }
        }
        // My players only
        if (state.quickFilterMyPlayersOnly && !state.currentUserName.isNullOrBlank()) {
            visible = visible.filter { it.agentInChargeName.equals(state.currentUserName, ignoreCase = true) }
        }
        // Loan players
        if (state.quickFilterLoanPlayersOnly) {
            visible = visible.filter { it.isOnLoan }
        }
        // Without registered agent
        if (state.quickFilterWithoutRegisteredAgent) {
            val noAgentValues = setOf("relatives", "no agent", "without agent", "ohne berater", "sans agent")
            visible = visible.filter { player ->
                val agency = player.agency?.trim()?.lowercase()
                agency.isNullOrBlank() || noAgentValues.any { agency == it || agency.contains(it) }
            }
        }
        // Foot filter
        when (state.footFilterOption) {
            FootFilterOption.LEFT -> visible = visible.filter { it.foot?.lowercase() == "left" }
            FootFilterOption.RIGHT -> visible = visible.filter { it.foot?.lowercase() == "right" }
            FootFilterOption.NONE -> { /* no-op */ }
        }
        // Notes filter
        if (state.isWithNotesChecked) {
            visible = visible.filter { !it.noteList.isNullOrEmpty() }
        }
        // Search query
        if (query.isNotBlank()) {
            visible = visible.filter {
                it.fullName?.contains(query, ignoreCase = true) == true ||
                        it.noteList?.any { n -> n.notes?.contains(query, true) == true } == true
            }
        }
        // Sort
        visible = if (state.isWithNotesChecked) {
            visible.sortedWith(
                compareByDescending<WomenPlayer> { player ->
                    player.noteList?.maxOfOrNull { note -> note.createdAt ?: Long.MIN_VALUE } ?: Long.MIN_VALUE
                }.thenByDescending { it.createdAt }
            )
        } else {
            when (state.sortOption) {
                SortOption.DEFAULT, SortOption.NEWEST -> visible.sortedByDescending { it.createdAt }
                SortOption.MARKET_VALUE -> visible.sortedByDescending { it.marketValue?.toNumericValue() }
                SortOption.NAME -> visible.sortedBy { it.fullName }
                SortOption.AGE -> visible.sortedBy { it.age }
            }
        }

        val allPlayers = state.playersList
        val expiringSoon = allPlayers.filter { isContractExpiringWithinMonths(it.contractExpired, 5) }
        val playersWithMandate = allPlayers
            .filter { it.haveMandate || (it.tmProfile != null && it.tmProfile in mandateMap) || (it.id != null && it.id in mandateMap) }
            .map { WomenPlayerWithMandateExpiry(it, (it.tmProfile?.let { mandateMap[it] }) ?: (it.id?.let { mandateMap[it] })) }
            .sortedBy { it.mandateExpiryAt ?: Long.MAX_VALUE }

        return state.copy(
            visibleList = visible,
            searchQuery = query,
            expiringSoonPlayers = expiringSoon,
            playersWithMandate = playersWithMandate,
            totalPlayers = allPlayers.size,
            mandateCount = playersWithMandate.size,
            freeAgentCount = allPlayers.count { player ->
                player.currentClub?.clubName.equals("Without Club", ignoreCase = true) ||
                        player.currentClub?.clubName.equals("Without club", ignoreCase = true)
            },
            expiringCount = expiringSoon.size
        )
    }

    override fun onCleared() {
        super.onCleared()
        listenerRegistrations.forEach { it.remove() }
        listenerRegistrations.clear()
        removeAllFiltersUseCase()
    }

    override suspend fun getCurrentUserName(): String? {
        return try {
            val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
            val accounts = snapshot.toObjects(Account::class.java)
            val account = accounts.firstOrNull {
                it.email?.equals(firebaseHandler.firebaseAuth.currentUser?.email, ignoreCase = true) == true
            }
            if (account?.email.equals("dahanliordahan@gmail.com", ignoreCase = true)) {
                _inputState.update { it.copy(showRefreshButton = true) }
            }
            account?.name
        } catch (e: Exception) { null }
    }

    override fun updateSearchQuery(query: String) { _searchQuery.value = query }

    override fun removeAllFilters() {
        updateSearchQuery("")
        removeAllFiltersUseCase()
    }

    override fun setPositionFilterByChip(positionName: String) {
        when (positionName) {
            "All" -> setPositionFiltersByNamesUseCase(emptyList())
            else -> {
                val current = _inputState.value.selectedPositions.mapNotNull { it.name }
                val isAlreadySelected = current.size == 1 && current.any { it.equals(positionName, ignoreCase = true) }
                if (isAlreadySelected) setPositionFiltersByNamesUseCase(emptyList())
                else setPositionFiltersByNamesUseCase(listOf(positionName))
            }
        }
    }

    override fun toggleQuickFilterFreeAgents() = quickFilterUseCase.toggleFreeAgents()
    override fun toggleQuickFilterContractExpiring() = quickFilterUseCase.toggleContractExpiring()
    override fun toggleQuickFilterWithMandate() = quickFilterUseCase.toggleWithMandate()
    override fun toggleQuickFilterMyPlayersOnly() = quickFilterUseCase.toggleMyPlayersOnly()
    override fun toggleQuickFilterLoanPlayersOnly() = quickFilterUseCase.toggleLoanPlayersOnly()
    override fun toggleQuickFilterWithoutRegisteredAgent() = quickFilterUseCase.toggleWithoutRegisteredAgent()
    override fun toggleQuickFilterWithNotesOnly() = quickFilterUseCase.toggleWithNotesOnly()
    override fun setFootFilterOption(option: FootFilterOption) = setFootFilterOptionUseCase(option)

    override fun applyInitialMyPlayersOnlyIfNeeded(initialMyPlayersOnly: Boolean) {
        if (!initialMyPlayersOnly || hasAppliedInitialMyPlayersOnly) return
        if (!_inputState.value.quickFilterMyPlayersOnly) {
            quickFilterUseCase.toggleMyPlayersOnly()
        }
        hasAppliedInitialMyPlayersOnly = true
    }

    override fun setSortOption(option: SortOption) = setSortOptionUseCase(option)
    override fun resetSortOption() = resetSortOptionUseCase()

    override suspend fun exportRosterCsv(): Result<ByteArray> {
        return try {
            val list = _inputState.value.playersList
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

    private fun expandPositionNames(names: List<String>): Set<String> {
        val groupToCodes = mapOf(
            "DEF" to setOf("CB", "RB", "LB"),
            "MID" to setOf("CM", "DM", "AM"),
            "FWD" to setOf("ST", "CF", "LW", "RW", "SS", "AM")
        )
        return names.flatMap { name -> groupToCodes[name.uppercase()] ?: setOf(name) }.toSet()
    }

    private fun String.toNumericValue(): Double {
        val lower = this.lowercase().trim().removePrefix("€").replace(",", "")
        return when {
            lower.endsWith("k") -> lower.removeSuffix("k").toDoubleOrNull()?.times(1_000) ?: 0.0
            lower.endsWith("m") -> lower.removeSuffix("m").toDoubleOrNull()?.times(1_000_000) ?: 0.0
            else -> lower.toDoubleOrNull() ?: 0.0
        }
    }

    fun parseDateFlexible(dateStr: String): LocalDate? {
        val formatters = listOf(
            DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ENGLISH)
        )
        for (formatter in formatters) {
            try { return LocalDate.parse(dateStr, formatter) } catch (_: DateTimeParseException) {}
        }
        return null
    }

    fun isContractExpiringWithin6Months(contractExpired: String?): Boolean = isContractExpiringWithinMonths(contractExpired, 6)

    fun isContractExpiringWithinMonths(contractExpired: String?, months: Int): Boolean {
        if (contractExpired.isNullOrEmpty() || contractExpired == "-") return false
        val expiryDate = parseDateFlexible(contractExpired) ?: return false
        val now = LocalDate.now()
        val threshold = now.plusMonths(months.toLong())
        return !expiryDate.isBefore(now) && !expiryDate.isAfter(threshold)
    }

    private fun loadMandateDocuments() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.playerDocumentsTable)
            .whereEqualTo("type", "MANDATE")
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val docs = snapshot.toObjects(PlayerDocument::class.java)
                viewModelScope.launch(Dispatchers.Default) {
                    val map = docs
                        .filter { it.playerTmProfile != null && it.expiresAt != null && !it.expired }
                        .filter { it.expiresAt!! >= System.currentTimeMillis() }
                        .groupBy { it.playerTmProfile!! }
                        .mapValues { (_, list) -> list.maxOf { it.expiresAt!! } }
                    _mandateExpiryByPlayer.value = map
                }
            }
        listenerRegistrations.add(reg)
    }

    private fun loadAllAccounts() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val accounts = snapshot.toObjects(Account::class.java)
                _inputState.update { it.copy(allAccounts = accounts) }
            }
        listenerRegistrations.add(reg)
    }

    private fun getAllPlayers() {
        _inputState.update { it.copy(showPageLoader = true) }
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    _inputState.update { it.copy(playersList = emptyList(), showPageLoader = false) }
                } else {
                    val playersList = value?.toObjects(WomenPlayer::class.java) ?: emptyList()
                    viewModelScope.launch(Dispatchers.Default) {
                        val sorted = playersList.sortedByDescending { it.createdAt }
                        _inputState.update { it.copy(playersList = sorted, showPageLoader = false) }
                    }
                }
            }
        listenerRegistrations.add(reg)
    }
}
