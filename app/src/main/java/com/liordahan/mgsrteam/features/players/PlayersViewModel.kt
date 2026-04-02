package com.liordahan.mgsrteam.features.players

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.FootFilterOption
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetAgentFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetFootFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IQuickFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IResetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetFootFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetPositionFiltersByNamesUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetSortOptionUseCase
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.isFreeAgent
import com.liordahan.mgsrteam.utils.EuCountries
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.PlayerOffer
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.helpers.Result
import com.liordahan.mgsrteam.transfermarket.PlayersUpdate
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


data class MandateInfo(val expiryAt: Long, val validLeagues: List<String>)

data class PlayerWithMandateExpiry(val player: Player, val mandateExpiryAt: Long?, val validLeagues: List<String> = emptyList())

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
    val quickFilterWithoutRegisteredAgent: Boolean = false,
    val selectedAgentFilter: String? = null,
    val quickFilterEuNational: Boolean = false,
    val quickFilterOfferedNoFeedback: Boolean = false,
    val offeredNoFeedbackTmProfiles: Set<String> = emptySet(),
    val footFilterOption: FootFilterOption = FootFilterOption.NONE,
    val quickFilterInterestedInIsrael: Boolean = false,
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
    abstract fun toggleQuickFilterWithoutRegisteredAgent()
    abstract fun setSelectedAgentFilter(agentName: String?)
    abstract fun toggleQuickFilterEuNational()
    abstract fun toggleQuickFilterOfferedNoFeedback()
    abstract fun toggleQuickFilterInterestedInIsrael()
    /** Apply "My Players Only" filter only when first landing from dashboard. Never re-apply on back. */
    abstract fun applyInitialMyPlayersOnlyIfNeeded(initialMyPlayersOnly: Boolean)
    abstract fun toggleQuickFilterWithNotesOnly()
    abstract fun setFootFilterOption(option: FootFilterOption)
    abstract fun setSortOption(option: SortOption)
    abstract fun resetSortOption()
    abstract suspend fun exportRosterCsv(): Result<ByteArray>
}

class PlayersViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val playersUpdate: PlayersUpdate,
    private val platformManager: PlatformManager,
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
) : IPlayersViewModel() {

    private val _inputState = MutableStateFlow(PlayersUiState())
    private val _searchQuery = MutableStateFlow("")
    private val _mandateInfoByPlayer = MutableStateFlow<Map<String, MandateInfo>>(emptyMap())
    private val _quickFilterEuNational = MutableStateFlow(false)
    private val _quickFilterOfferedNoFeedback = MutableStateFlow(false)
    private val _offeredNoFeedbackTmProfiles = MutableStateFlow<Set<String>>(emptySet())
    private val _quickFilterInterestedInIsrael = MutableStateFlow(false)

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    override val playersFlow: StateFlow<PlayersUiState> = combine(
        _inputState,
        _searchQuery.debounce(300L),
        _mandateInfoByPlayer,
        _quickFilterEuNational,
        combine(_quickFilterOfferedNoFeedback, _offeredNoFeedbackTmProfiles, _quickFilterInterestedInIsrael) { a, b, c -> Triple(a, b, c) }
    ) { state, debouncedQuery, mandateInfoMap, euNational, (offeredNoFb, offeredNoFbProfiles, interestedInIsrael) ->
        computeUiState(
            state.copy(
                quickFilterEuNational = euNational,
                quickFilterOfferedNoFeedback = offeredNoFb,
                offeredNoFeedbackTmProfiles = offeredNoFbProfiles,
                quickFilterInterestedInIsrael = interestedInIsrael
            ),
            debouncedQuery,
            mandateInfoMap
        )
    }
        .flowOn(Dispatchers.Default)
        .stateIn(viewModelScope, SharingStarted.Eagerly, PlayersUiState(showPageLoader = true))

    private val listenerRegistrations = mutableListOf<ListenerRegistration>()
    private var hasAppliedInitialMyPlayersOnly = false

    init {
        getAllPlayers()
        loadAllAccounts()
        loadMandateDocuments()
        loadOfferedNoFeedbackProfiles()

        viewModelScope.launch(Dispatchers.IO) {
            val name = getCurrentUserName()
            _inputState.update { it.copy(currentUserName = name) }
        }

        // Re-subscribe to Firestore when the active platform changes
        viewModelScope.launch {
            platformManager.current
                .collect {
                    // Remove old snapshot listeners and re-register on new collection
                    listenerRegistrations.forEach { it.remove() }
                    listenerRegistrations.clear()
                    getAllPlayers()
                    loadAllAccounts()
                    loadMandateDocuments()
                    loadOfferedNoFeedbackProfiles()
                }
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
            launch { quickFilterUseCase.selectedAgentFilter.collect { v -> _inputState.update { it.copy(selectedAgentFilter = v) } } }
        }
    }

    private fun computeUiState(
        state: PlayersUiState,
        query: String,
        mandateInfoMap: Map<String, MandateInfo>
    ): PlayersUiState {
        val mandateMap = mandateInfoMap.mapValues { (_, info) -> info.expiryAt }
        val visible = state.playersList
            .filterPlayersByPosition(state.selectedPositions)
            ?.filterPlayersByAgent(state.selectedAccounts)
            ?.filterPlayersByQuickFilterAndContract(
                quickFilterFreeAgents = state.quickFilterFreeAgents,
                quickFilterContractExpiring = state.quickFilterContractExpiring,
                contractFilterOption = state.contractFilterOption
            )
            ?.filterPlayersByWithMandate(state.quickFilterWithMandate, mandateMap)
            ?.filterPlayersByMyPlayersOnly(state.quickFilterMyPlayersOnly, state.currentUserName)
            ?.filterPlayersBySelectedAgent(state.selectedAgentFilter)
            ?.filterPlayersByLoanPlayers(state.quickFilterLoanPlayersOnly)
            ?.filterPlayersByWithoutRegisteredAgent(state.quickFilterWithoutRegisteredAgent)
            ?.filterPlayersByEuNational(state.quickFilterEuNational)
            ?.filterPlayersByOfferedNoFeedback(state.quickFilterOfferedNoFeedback, state.offeredNoFeedbackTmProfiles)
            ?.filterPlayersByInterestedInIsrael(state.quickFilterInterestedInIsrael)
            ?.filterPlayersByFoot(state.footFilterOption)
            ?.filterByNotes(state.isWithNotesChecked)
            ?.filterPlayersByNameOrByNote(query)
            ?.sortPlayers(state.isWithNotesChecked, state.sortOption) ?: emptyList()

        val allPlayers = state.playersList
        val expiringSoon = allPlayers.filter { player ->
            isContractExpiringWithinMonths(player.contractExpired, 5)
        }
        val playersWithMandate = allPlayers
            .filter { player ->
                player.haveMandate || (player.tmProfile != null && player.tmProfile in mandateMap)
            }
            .map { player ->
                val info = player.tmProfile?.let { mandateInfoMap[it] }
                PlayerWithMandateExpiry(
                    player = player,
                    mandateExpiryAt = info?.expiryAt,
                    validLeagues = info?.validLeagues ?: emptyList()
                )
            }
            .sortedBy { it.mandateExpiryAt ?: Long.MAX_VALUE }
        val mandateCount = playersWithMandate.size
        val freeAgentCount = allPlayers.count { it.isFreeAgent }

        return state.copy(
            visibleList = visible,
            searchQuery = query,
            expiringSoonPlayers = expiringSoon,
            playersWithMandate = playersWithMandate,
            totalPlayers = allPlayers.size,
            mandateCount = mandateCount,
            freeAgentCount = freeAgentCount,
            expiringCount = expiringSoon.size
        )
    }




    override fun onCleared() {
        super.onCleared()
        listenerRegistrations.forEach { it.remove() }
        listenerRegistrations.clear()
        // User left player list (back to dashboard). Reset filters so next visit is fresh.
        removeAllFiltersUseCase()
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
                _inputState.update { it.copy(showRefreshButton = true) }
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
        _searchQuery.value = query
    }

    override fun removeAllFilters() {
        updateSearchQuery("")
        _quickFilterEuNational.value = false
        _quickFilterOfferedNoFeedback.value = false
        _quickFilterInterestedInIsrael.value = false
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
    override fun setSelectedAgentFilter(agentName: String?) = quickFilterUseCase.setSelectedAgentFilter(agentName)
    override fun toggleQuickFilterEuNational() { _quickFilterEuNational.value = !_quickFilterEuNational.value }
    override fun toggleQuickFilterOfferedNoFeedback() { _quickFilterOfferedNoFeedback.value = !_quickFilterOfferedNoFeedback.value }
    override fun toggleQuickFilterInterestedInIsrael() { _quickFilterInterestedInIsrael.value = !_quickFilterInterestedInIsrael.value }
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
                    val isFreeAgent = player.isFreeAgent
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
            ContractFilterOption.WITHOUT_CLUB -> this?.filter { it.isFreeAgent }

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

    private fun List<Player>?.filterPlayersBySelectedAgent(agentName: String?): List<Player>? {
        return if (agentName.isNullOrBlank()) this
        else this?.filter { it.agentInChargeName.equals(agentName, ignoreCase = true) }
    }

    private fun List<Player>?.filterPlayersByLoanPlayers(enabled: Boolean): List<Player>? {
        return if (!enabled) this else this?.filter { it.isOnLoan }
    }

    /** Players where agency is relatives, no agent, or blank/null (Transfermarkt values for no registered agent). */
    private fun List<Player>?.filterPlayersByWithoutRegisteredAgent(enabled: Boolean): List<Player>? {
        if (!enabled) return this
        val noAgentValues = setOf("relatives", "no agent", "without agent", "ohne berater", "sans agent")
        return this?.filter { player ->
            val agency = player.agency?.trim()?.lowercase()
            agency.isNullOrBlank() || noAgentValues.any { agency == it || agency.contains(it) }
        }
    }

    private fun List<Player>?.filterPlayersByEuNational(enabled: Boolean): List<Player>? {
        return if (!enabled) this
        else this?.filter { EuCountries.isEuNational(it.nationalities, it.nationality) }
    }

    private fun List<Player>?.filterPlayersByInterestedInIsrael(enabled: Boolean): List<Player>? {
        return if (!enabled) this else this?.filter { it.interestedInIsrael }
    }

    private fun List<Player>?.filterPlayersByOfferedNoFeedback(enabled: Boolean, profiles: Set<String>): List<Player>? {
        return if (!enabled) this
        else this?.filter { it.tmProfile != null && it.tmProfile in profiles }
    }

    private fun List<Player>?.filterPlayersByFoot(footFilterOption: FootFilterOption): List<Player>? {
        return when (footFilterOption) {
            FootFilterOption.NONE -> this
            FootFilterOption.LEFT -> this?.filter { it.foot?.lowercase() == "left" }
            FootFilterOption.RIGHT -> this?.filter { it.foot?.lowercase() == "right" }
        }
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
                        .mapValues { (_, list) ->
                            val maxExpiry = list.maxOf { it.expiresAt!! }
                            val leagues = list.flatMap { it.validLeagues ?: emptyList() }.distinct()
                            MandateInfo(expiryAt = maxExpiry, validLeagues = leagues)
                        }
                    _mandateInfoByPlayer.value = map
                }
            }
        listenerRegistrations.add(reg)
    }

    private fun loadOfferedNoFeedbackProfiles() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.playerOffersTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val offers = snapshot.toObjects(PlayerOffer::class.java)
                viewModelScope.launch(Dispatchers.Default) {
                    // Group by player; keep those where ANY offer has no feedback
                    val byPlayer = offers.groupBy { it.playerTmProfile ?: "" }
                    val noFeedbackProfiles = byPlayer
                        .filter { (profile, playerOffers) ->
                            profile.isNotBlank() && playerOffers.any { it.clubFeedback.isNullOrBlank() }
                        }
                        .keys
                    _offeredNoFeedbackTmProfiles.value = noFeedbackProfiles
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
                    _inputState.update {
                        it.copy(
                            playersList = emptyList(),
                            showPageLoader = false
                        )
                    }
                } else {
                    val playersList = value?.documents?.mapNotNull { doc ->
                        try { doc.toObject(Player::class.java) } catch (_: Exception) { null }
                    } ?: emptyList()
                    viewModelScope.launch(Dispatchers.Default) {
                        val sorted = playersList.sortedByDescending { it.createdAt }
                        _inputState.update {
                            it.copy(
                                playersList = sorted,
                                showPageLoader = false
                            )
                        }
                    }
                }
            }
        listenerRegistrations.add(reg)
    }

}