package com.liordahan.mgsrteam.features.women.viewmodel

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.DocumentReminder
import com.liordahan.mgsrteam.features.home.FeedFilter
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenAgentAlert
import com.liordahan.mgsrteam.features.women.models.WomenAgentOverview
import com.liordahan.mgsrteam.features.women.models.WomenAgentSummary
import com.liordahan.mgsrteam.features.women.models.WomenAgentTask
import com.liordahan.mgsrteam.features.women.models.toSharedAgentTask
import com.liordahan.mgsrteam.features.women.models.WomenAlertSeverity
import com.liordahan.mgsrteam.features.women.models.WomenFeedEvent
import com.liordahan.mgsrteam.features.women.models.WomenPlayer
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.transfermarket.Confederation
import com.liordahan.mgsrteam.transfermarket.PRIORITY_COUNTRY_CODES
import com.liordahan.mgsrteam.transfermarket.TransferWindow
import com.liordahan.mgsrteam.transfermarket.TransferWindows
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.Calendar
import java.util.Locale


/**
 * Women-dedicated home dashboard UI state.
 */
data class WomenHomeDashboardState(
    val currentUserAccount: Account? = null,
    @param:StringRes val greetingRes: Int = R.string.greeting_good_morning,

    val totalPlayers: Int = 0,
    val withMandate: Int = 0,
    val expiringSoon: Int = 0,
    val freeAgents: Int = 0,
    val requestsCount: Int = 0,

    val feedEvents: List<WomenFeedEvent> = emptyList(),
    val selectedFeedFilter: FeedFilter = FeedFilter.ALL,
    val isFeedExpanded: Boolean = false,

    val myAgentOverview: WomenAgentOverview? = null,
    val agentSummaries: List<WomenAgentSummary> = emptyList(),
    val allAccounts: List<Account> = emptyList(),

    val agentTasks: Map<String, List<WomenAgentTask>> = emptyMap(),
    val expandedAgentId: String? = null,

    val mandateDocProfiles: Set<String> = emptySet(),
    val mandateStatusByTmProfile: Map<String, Boolean> = emptyMap(),

    val documentReminders: List<DocumentReminder> = emptyList(),
    val isTeamOverviewExpanded: Boolean = false,

    val transferWindows: List<TransferWindow> = emptyList(),
    val transferWindowGroups: Map<Confederation, List<TransferWindow>> = emptyMap(),
    val expandedConfederations: Set<Confederation> = setOf(Confederation.PRIORITY),
    val transferWindowsLoading: Boolean = false,

    val isLoading: Boolean = true
)

/**
 * Women-dedicated home screen abstract ViewModel.
 */
abstract class IWomenHomeViewModel : ViewModel() {
    abstract val dashboardState: StateFlow<WomenHomeDashboardState>
    abstract fun checkPlayerExists(docId: String, onResult: (Boolean) -> Unit)
    abstract fun findPlayerDocIdByName(playerName: String, onResult: (String?) -> Unit)
    abstract fun updatePlayerMandate(docId: String, hasMandate: Boolean)
    abstract fun selectFeedFilter(filter: FeedFilter)
    abstract fun toggleFeedExpanded()
    abstract fun toggleAgentExpanded(agentId: String)
    abstract fun toggleTaskCompleted(task: WomenAgentTask)
    abstract fun addTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int = 0, notes: String = "", playerId: String = "", playerName: String = "", playerTmProfile: String = "", templateId: String = "")
    abstract fun updateTask(task: WomenAgentTask)
    abstract fun deleteTask(task: WomenAgentTask)
    abstract fun toggleTransferWindowGroup(confederation: Confederation)
    abstract fun toggleTeamOverview()
    abstract fun refreshTransferWindows()
}

/**
 * Women-dedicated home screen ViewModel implementation.
 * Uses WomenFirebaseHandler (hardcoded to women collections) — no PlatformManager.
 */
class WomenHomeViewModel(
    private val firebaseHandler: WomenFirebaseHandler,
    private val transferWindows: TransferWindows,
    private val appContext: android.content.Context
) : IWomenHomeViewModel() {

    private val _state = MutableStateFlow(WomenHomeDashboardState())
    override val dashboardState: StateFlow<WomenHomeDashboardState> = _state

    private var _currentPlayers: List<WomenPlayer> = emptyList()
    private val listenerRegistrations = mutableListOf<ListenerRegistration>()

    init {
        loadGreeting()
        loadAllAccounts()
        listenToPlayers()
        listenToRequests()
        loadFeedEvents()
        listenToAgentTasks()
        loadTransferWindowsDeferred()
        ensureLoadingClearedWithinTimeout()
    }

    private fun ensureLoadingClearedWithinTimeout() {
        viewModelScope.launch(Dispatchers.Main) {
            delay(4000)
            _state.update { if (it.isLoading) it.copy(isLoading = false) else it }
        }
    }

    override fun onCleared() {
        super.onCleared()
        listenerRegistrations.forEach { it.remove() }
        listenerRegistrations.clear()
    }

    // ── Player exists (Women: docId is Firestore document ID) ────────────

    override fun checkPlayerExists(docId: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val exists = try {
                firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                    .document(docId).get().await().exists()
            } catch (_: Exception) { false }
            withContext(Dispatchers.Main) { onResult(exists) }
        }
    }

    override fun findPlayerDocIdByName(playerName: String, onResult: (String?) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val docId = try {
                firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                    .whereEqualTo("fullName", playerName).get().await()
                    .documents.firstOrNull()?.id
            } catch (_: Exception) { null }
            withContext(Dispatchers.Main) { onResult(docId) }
        }
    }

    override fun updatePlayerMandate(docId: String, hasMandate: Boolean) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val doc = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                    .document(docId).get().await()
                val player = doc.toObject(WomenPlayer::class.java) ?: return@launch
                doc.reference.set(player.copy(haveMandate = hasMandate)).await()
            } catch (_: Exception) { }
        }
    }

    // ── Greeting ─────────────────────────────────────────────────────

    private fun loadGreeting() {
        viewModelScope.launch(Dispatchers.IO) {
            val greetingRes = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
                in 5..11 -> R.string.greeting_good_morning
                in 12..17 -> R.string.greeting_good_afternoon
                else -> R.string.greeting_good_evening
            }
            val currentAccount = try {
                val currentEmail = firebaseHandler.firebaseAuth.currentUser?.email
                if (currentEmail == null) null
                else {
                    val snap = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.accountsTable)
                        .whereEqualTo("email", currentEmail).limit(1).get().await()
                    snap.documents.firstOrNull()?.toObject(Account::class.java)?.copy(id = snap.documents.first().id)
                }
            } catch (_: Exception) { null }
            _state.update { it.copy(greetingRes = greetingRes, currentUserAccount = currentAccount) }
            recomputeMyOverview()
        }
    }

    // ── Accounts ─────────────────────────────────────────────────────

    private fun loadAllAccounts() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val accounts = snapshot.toObjects(Account::class.java)
                _state.update { it.copy(allAccounts = accounts) }
            }
        listenerRegistrations.add(reg)
    }

    // ── Players ──────────────────────────────────────────────────────

    private fun listenToPlayers() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .addSnapshotListener { snapshot, error ->
                if (error != null || snapshot == null) return@addSnapshotListener
                val players = snapshot.toObjects(WomenPlayer::class.java)
                viewModelScope.launch(Dispatchers.Default) {
                    val total = players.size
                    val freeAgents = players.count {
                        it.currentClub?.clubName.equals("Without Club", true) ||
                            it.currentClub?.clubName.equals("Without club", true)
                    }
                    val expiring = players.count { isContractExpiringWithinMonths(it.contractExpired, 5) }

                    val agentGroups = players.groupBy { it.agentInChargeName ?: "Unassigned" }
                    val summaries = agentGroups
                        .filter { it.key != "Unassigned" }
                        .map { (name, list) ->
                            WomenAgentSummary(
                                agentId = list.firstOrNull()?.agentInChargeId,
                                agentName = name,
                                totalPlayers = list.size,
                                withMandate = 0,
                                expiringContracts = list.count { isContractExpiringWithinMonths(it.contractExpired, 5) },
                                withNotes = list.count { !it.noteList.isNullOrEmpty() }
                            )
                        }

                    _currentPlayers = players

                    val mandateStatusByTmProfile = players
                        .filter { it.tmProfile != null }
                        .associate { it.tmProfile!! to it.haveMandate }
                    _state.update {
                        it.copy(
                            totalPlayers = total,
                            freeAgents = freeAgents,
                            expiringSoon = expiring,
                            agentSummaries = summaries,
                            mandateStatusByTmProfile = mandateStatusByTmProfile
                        )
                    }
                    recomputeMyOverview()
                    loadDocumentReminders()
                    countMandates(players)
                }
            }
        listenerRegistrations.add(reg)
    }

    private fun countMandates(players: List<WomenPlayer>) {
        viewModelScope.launch(Dispatchers.IO) {
            // Query mandate documents; fall back to empty set so haveMandate still counts
            val profilesWithMandateDoc: Set<String> = try {
                val docsSnap = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playerDocumentsTable)
                    .whereEqualTo("type", DocumentType.MANDATE.name).get().await()
                val docs = docsSnap.toObjects(PlayerDocument::class.java)
                docs.mapNotNull { it.playerTmProfile }.toSet()
            } catch (_: Exception) { emptySet() }

            // Women docs store Firestore doc ID as playerTmProfile (not a TM URL),
            // so match by player.id (doc ID) as well as player.tmProfile.
            val mandateCount = players.count { it.haveMandate || it.tmProfile in profilesWithMandateDoc || it.id in profilesWithMandateDoc }

            _state.update { it.copy(withMandate = mandateCount, mandateDocProfiles = profilesWithMandateDoc) }

            val agentGroups = players.groupBy { it.agentInChargeName ?: "Unassigned" }
            val updatedSummaries = agentGroups
                .filter { it.key != "Unassigned" }
                .map { (name, list) ->
                    WomenAgentSummary(
                        agentId = list.firstOrNull()?.agentInChargeId,
                        agentName = name,
                        totalPlayers = list.size,
                        withMandate = list.count { it.haveMandate || it.tmProfile in profilesWithMandateDoc || it.id in profilesWithMandateDoc },
                        expiringContracts = list.count { isContractExpiringWithinMonths(it.contractExpired, 5) },
                        withNotes = list.count { !it.noteList.isNullOrEmpty() }
                    )
                }
            _state.update { it.copy(agentSummaries = updatedSummaries) }
            recomputeMyOverview()
        }
    }

    // ── Requests count ───────────────────────────────────────────────

    private fun listenToRequests() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.clubRequestsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                _state.update { it.copy(requestsCount = snapshot.size()) }
            }
        listenerRegistrations.add(reg)
    }

    // ── Feed events ──────────────────────────────────────────────────

    private fun loadFeedEvents() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable)
            .orderBy("timestamp", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val events = snapshot.toObjects(WomenFeedEvent::class.java)
                val deduped = events.distinctBy { "${it.type}_${it.playerTmProfile}_${it.oldValue}_${it.newValue}" }
                _state.update { it.copy(feedEvents = deduped, isLoading = false) }
            }
        listenerRegistrations.add(reg)
    }

    override fun selectFeedFilter(filter: FeedFilter) {
        _state.update { it.copy(selectedFeedFilter = filter) }
    }

    override fun toggleFeedExpanded() {
        _state.update { it.copy(isFeedExpanded = !it.isFeedExpanded) }
    }

    // ── Document reminders ───────────────────────────────────────────

    private fun loadDocumentReminders() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val snap = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playerDocumentsTable).get().await()
                val docs = snap.toObjects(PlayerDocument::class.java)
                val now = System.currentTimeMillis()
                val thirtyDaysMs = 30L * 24 * 60 * 60 * 1000
                val reminders = docs
                    .filter { doc ->
                        val expires = doc.expiresAt ?: return@filter false
                        expires - now in 0..thirtyDaysMs
                    }
                    .mapNotNull { doc ->
                        val playerName = _currentPlayers.firstOrNull { it.tmProfile == doc.playerTmProfile }?.fullName
                            ?: return@mapNotNull null
                        val daysLeft = ((doc.expiresAt!! - now) / (24 * 60 * 60 * 1000)).toInt()
                        DocumentReminder(playerName, doc.documentType.displayName, daysLeft)
                    }
                    .sortedBy { it.daysUntilExpiry }
                    .take(5)
                _state.update { it.copy(documentReminders = reminders) }
                recomputeMyOverview()
            } catch (_: Exception) { }
        }
    }

    // ── Agent Tasks ──────────────────────────────────────────────────

    private fun listenToAgentTasks() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
            .orderBy("createdAt", com.google.firebase.firestore.Query.Direction.ASCENDING)
            .limit(100)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val tasks = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(WomenAgentTask::class.java)?.copy(id = doc.id)
                }
                _state.update { it.copy(agentTasks = tasks.groupBy { it.agentId }) }
                recomputeMyOverview()
            }
        listenerRegistrations.add(reg)
    }

    override fun toggleAgentExpanded(agentId: String) {
        _state.update { it.copy(expandedAgentId = if (it.expandedAgentId == agentId) null else agentId) }
    }

    override fun toggleTaskCompleted(task: WomenAgentTask) {
        if (task.id.isBlank()) return
        val nowCompleted = !task.isCompleted
        _state.update { state ->
            val list = state.agentTasks[task.agentId].orEmpty()
            val updated = list.map { if (it.id == task.id) it.copy(isCompleted = nowCompleted) else it }
            state.copy(agentTasks = state.agentTasks + (task.agentId to updated))
        }
        recomputeMyOverview()
        viewModelScope.launch {
            try {
                firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
                    .document(task.id)
                    .update(mapOf("isCompleted" to nowCompleted, "completedAt" to if (nowCompleted) System.currentTimeMillis() else 0L))
                    .await()
            } catch (_: Exception) { }
        }
    }

    override fun addTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String, playerId: String, playerName: String, playerTmProfile: String, templateId: String) {
        viewModelScope.launch {
            val currentAccount = _state.value.currentUserAccount
            val createdByAgentId = currentAccount?.id ?: ""
            val createdByAgentName = currentAccount?.let { it.getDisplayName(appContext) } ?: ""
            val newTask = WomenAgentTask(
                agentId = agentId, agentName = agentName, title = title,
                isCompleted = false, dueDate = dueDate, createdAt = System.currentTimeMillis(),
                priority = priority, notes = notes,
                createdByAgentId = createdByAgentId, createdByAgentName = createdByAgentName,
                playerId = playerId, playerName = playerName, playerTmProfile = playerTmProfile,
                templateId = templateId
            )
            _state.update { state ->
                val existing = state.agentTasks[agentId].orEmpty()
                state.copy(agentTasks = state.agentTasks + (agentId to (existing + newTask)))
            }
            recomputeMyOverview()
            try {
                firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable).add(newTask).await()
            } catch (_: Exception) { }
        }
    }

    override fun updateTask(task: WomenAgentTask) {
        if (task.id.isBlank()) return
        _state.update { state ->
            val list = state.agentTasks[task.agentId].orEmpty()
            val updated = list.map { if (it.id == task.id) task else it }
            state.copy(agentTasks = state.agentTasks + (task.agentId to updated))
        }
        recomputeMyOverview()
        viewModelScope.launch {
            try {
                firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
                    .document(task.id)
                    .update(mapOf(
                        "title" to task.title, "agentId" to task.agentId, "agentName" to task.agentName,
                        "dueDate" to task.dueDate, "priority" to task.priority, "notes" to task.notes,
                        "isCompleted" to task.isCompleted, "completedAt" to task.completedAt
                    )).await()
            } catch (_: Exception) { }
        }
    }

    override fun deleteTask(task: WomenAgentTask) {
        _state.update { state ->
            val list = state.agentTasks[task.agentId].orEmpty().filter { it.id != task.id }
            state.copy(agentTasks = state.agentTasks + (task.agentId to list))
        }
        recomputeMyOverview()
        viewModelScope.launch {
            try {
                firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
                    .document(task.id).delete().await()
            } catch (_: Exception) { }
        }
    }

    // ── Transfer Windows ─────────────────────────────────────────────

    override fun toggleTeamOverview() {
        _state.update { it.copy(isTeamOverviewExpanded = !it.isTeamOverviewExpanded) }
    }

    override fun toggleTransferWindowGroup(confederation: Confederation) {
        _state.update { current ->
            val expanded = current.expandedConfederations.toMutableSet()
            if (confederation in expanded) expanded.remove(confederation) else expanded.add(confederation)
            current.copy(expandedConfederations = expanded)
        }
    }

    override fun refreshTransferWindows() { loadTransferWindows() }

    private fun loadTransferWindowsDeferred() {
        viewModelScope.launch(Dispatchers.IO) {
            delay(1500)
            loadTransferWindows()
        }
    }

    private fun loadTransferWindows() {
        viewModelScope.launch(Dispatchers.IO) {
            _state.update { it.copy(transferWindowsLoading = true) }
            when (val result = transferWindows.fetchOpenTransferWindows()) {
                is com.liordahan.mgsrteam.transfermarket.TransfermarktResult.Success -> {
                    val allWindows = result.data
                    val groups = buildTransferWindowGroups(allWindows)
                    _state.update { it.copy(transferWindows = allWindows, transferWindowGroups = groups, transferWindowsLoading = false) }
                }
                is com.liordahan.mgsrteam.transfermarket.TransfermarktResult.Failed ->
                    _state.update { it.copy(transferWindows = emptyList(), transferWindowGroups = emptyMap(), transferWindowsLoading = false) }
            }
        }
    }

    private fun buildTransferWindowGroups(windows: List<TransferWindow>): Map<Confederation, List<TransferWindow>> {
        val priority = windows.filter { it.countryCode in PRIORITY_COUNTRY_CODES }.sortedBy { it.daysLeft }
        val remaining = windows.filter { it.countryCode !in PRIORITY_COUNTRY_CODES }
            .groupBy { it.confederation }.toSortedMap(compareBy { it.order })
        return buildMap {
            if (priority.isNotEmpty()) put(Confederation.PRIORITY, priority)
            remaining.forEach { (conf, list) -> put(conf, list.sortedBy { it.daysLeft }) }
        }
    }

    // ── My Agent Overview ────────────────────────────────────────────

    private fun recomputeMyOverview() {
        val current = _state.value
        val me = current.currentUserAccount ?: return
        val myEnglishName = me.name?.takeIf { it.isNotBlank() } ?: return

        val myPlayers = _currentPlayers.filter { p -> p.agentInChargeName.equals(myEnglishName, ignoreCase = true) }
        val totalPlayers = myPlayers.size
        val mandateDocProfiles = current.mandateDocProfiles
        val withMandate = myPlayers.count { p -> p.haveMandate || p.tmProfile in mandateDocProfiles || p.id in mandateDocProfiles }
        val freeAgents = myPlayers.count { p ->
            p.currentClub?.clubName.equals("Without Club", true) || p.currentClub?.clubName.equals("Without club", true)
        }
        val expiringContracts = myPlayers.count { isContractExpiringWithinMonths(it.contractExpired, 5) }

        val myAccountId = me.id
        val myPlayerAgentId = myPlayers.firstOrNull()?.agentInChargeId
        val possibleTaskIds = listOfNotNull(myAccountId, myPlayerAgentId).distinct()
        val myTasks = possibleTaskIds.flatMap { id -> current.agentTasks[id].orEmpty() }.distinctBy { it.id }
        val totalTaskCount = myTasks.size
        val completedTaskCount = myTasks.count { it.isCompleted }
        val taskCompletionPercent = if (totalTaskCount > 0) completedTaskCount.toFloat() / totalTaskCount else 0f

        val pending = myTasks.filter { !it.isCompleted }
        val startOfToday = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val overdue = pending.count { it.dueDate in 1..<startOfToday }
        val upcoming = pending.sortedBy { if (it.dueDate > 0) it.dueDate else Long.MAX_VALUE }.take(5)

        val contractAlerts = myPlayers
            .filter { isContractExpiringWithinMonths(it.contractExpired, 3) }
            .mapNotNull { player ->
                val expiry = parseDateFlexible(player.contractExpired ?: return@mapNotNull null) ?: return@mapNotNull null
                val daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), expiry).toInt()
                WomenAgentAlert(
                    playerName = player.fullName ?: "Unknown",
                    detail = "Contract in $daysLeft days",
                    daysLeft = daysLeft,
                    severity = if (daysLeft < 30) WomenAlertSeverity.URGENT else WomenAlertSeverity.WARNING
                )
            }

        val docAlerts = current.documentReminders
            .filter { reminder -> myPlayers.any { it.fullName == reminder.playerName } }
            .map { reminder ->
                WomenAgentAlert(
                    playerName = reminder.playerName,
                    detail = "${reminder.documentType} in ${reminder.daysUntilExpiry ?: 0}d",
                    daysLeft = reminder.daysUntilExpiry ?: 0,
                    severity = if ((reminder.daysUntilExpiry ?: 0) < 7) WomenAlertSeverity.URGENT else WomenAlertSeverity.WARNING
                )
            }

        val overview = WomenAgentOverview(
            totalPlayers = totalPlayers,
            withMandate = withMandate,
            freeAgents = freeAgents,
            expiringContracts = expiringContracts,
            taskCompletionPercent = taskCompletionPercent,
            completedTaskCount = completedTaskCount,
            totalTaskCount = totalTaskCount,
            upcomingTasks = upcoming,
            pendingTaskCount = pending.size,
            overdueTaskCount = overdue,
            alerts = (contractAlerts + docAlerts).sortedBy { it.daysLeft }.take(5)
        )
        _state.update { it.copy(myAgentOverview = overview) }

        viewModelScope.launch(Dispatchers.IO) {
            try {
                // Sync widget with women overview
                com.liordahan.mgsrteam.widget.WidgetUpdateHelper.syncToWidget(
                    appContext.applicationContext,
                    // Convert to shared MyAgentOverview for widget compatibility
                    com.liordahan.mgsrteam.features.home.models.MyAgentOverview(
                        totalPlayers = overview.totalPlayers,
                        withMandate = overview.withMandate,
                        freeAgents = overview.freeAgents,
                        expiringContracts = overview.expiringContracts,
                        taskCompletionPercent = overview.taskCompletionPercent,
                        completedTaskCount = overview.completedTaskCount,
                        totalTaskCount = overview.totalTaskCount,
                        upcomingTasks = upcoming.map { task -> task.toSharedAgentTask() },
                        pendingTaskCount = overview.pendingTaskCount,
                        overdueTaskCount = overview.overdueTaskCount,
                        alerts = (contractAlerts + docAlerts)
                            .sortedBy { it.daysLeft }
                            .take(5)
                            .map { alert ->
                                com.liordahan.mgsrteam.features.home.models.AgentAlert(
                                    playerName = alert.playerName,
                                    detail = alert.detail,
                                    daysLeft = alert.daysLeft,
                                    severity = when (alert.severity) {
                                        WomenAlertSeverity.URGENT -> com.liordahan.mgsrteam.features.home.models.AlertSeverity.URGENT
                                        WomenAlertSeverity.WARNING -> com.liordahan.mgsrteam.features.home.models.AlertSeverity.WARNING
                                        WomenAlertSeverity.INFO -> com.liordahan.mgsrteam.features.home.models.AlertSeverity.WARNING
                                    }
                                )
                            }
                    )
                )
            } catch (_: Exception) { }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private fun isContractExpiringWithinMonths(contractExpired: String?, months: Int): Boolean {
        if (contractExpired.isNullOrEmpty() || contractExpired == "-") return false
        val expiryDate = parseDateFlexible(contractExpired) ?: return false
        val now = LocalDate.now()
        val threshold = now.plusMonths(months.toLong())
        return !expiryDate.isBefore(now) && !expiryDate.isAfter(threshold)
    }

    private fun parseDateFlexible(dateStr: String): LocalDate? {
        val formatters = listOf(
            DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ENGLISH)
        )
        for (formatter in formatters) {
            try { return LocalDate.parse(dateStr, formatter) }
            catch (_: DateTimeParseException) { }
        }
        return null
    }
}
