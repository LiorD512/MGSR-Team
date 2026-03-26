package com.liordahan.mgsrteam.features.home

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.models.AgentAlert
import com.liordahan.mgsrteam.features.home.models.AgentSummary
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.home.models.AlertSeverity
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.home.models.MyAgentOverview
import com.liordahan.mgsrteam.features.home.dashboard.BirthdayPlayer
import com.liordahan.mgsrteam.features.home.dashboard.buildBirthdayPlayers
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.isFreeAgent
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.Confederation
import com.liordahan.mgsrteam.transfermarket.PRIORITY_COUNTRY_CODES
import com.liordahan.mgsrteam.transfermarket.TransferWindow
import com.liordahan.mgsrteam.transfermarket.TransferWindows
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
import java.util.Calendar
import java.util.Locale

// ─── UI State ────────────────────────────────────────────────────────────────

data class HomeDashboardState(
    val currentUserAccount: Account? = null,
    @param:StringRes val greetingRes: Int = R.string.greeting_good_morning,

    // stats row
    val totalPlayers: Int = 0,
    val withMandate: Int = 0,
    val expiringSoon: Int = 0,
    val freeAgents: Int = 0,
    val requestsCount: Int = 0,

    // activity feed
    val feedEvents: List<FeedEvent> = emptyList(),
    val selectedFeedFilter: FeedFilter = FeedFilter.ALL,
    val isFeedExpanded: Boolean = false,

    // my personal overview (current logged-in agent)
    val myAgentOverview: MyAgentOverview? = null,

    // agent summaries
    val agentSummaries: List<AgentSummary> = emptyList(),

    // all agent accounts (from Accounts table)
    val allAccounts: List<Account> = emptyList(),

    // agent tasks
    val agentTasks: Map<String, List<AgentTask>> = emptyMap(),   // agentId -> tasks
    val expandedAgentId: String? = null,

    // mandate document profiles (tmProfiles that have a mandate doc uploaded)
    val mandateDocProfiles: Set<String> = emptySet(),

    // mandate switch state by tmProfile (for feed event cards)
    val mandateStatusByTmProfile: Map<String, Boolean> = emptyMap(),

    // document reminders
    val documentReminders: List<DocumentReminder> = emptyList(),

    // team overview
    val isTeamOverviewExpanded: Boolean = false,

    // transfer windows (open worldwide)
    val transferWindows: List<TransferWindow> = emptyList(),
    val transferWindowGroups: Map<Confederation, List<TransferWindow>> = emptyMap(),
    val expandedConfederations: Set<Confederation> = setOf(Confederation.PRIORITY),
    val transferWindowsLoading: Boolean = false,

    // pending agent transfers
    val pendingTransfers: List<com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest> = emptyList(),

    // birthdays
    val todayBirthdays: List<BirthdayPlayer> = emptyList(),
    val upcomingBirthdays: List<BirthdayPlayer> = emptyList(),

    // loading
    val isLoading: Boolean = true
)

data class DocumentReminder(
    val playerName: String,
    val documentType: String,
    val daysUntilExpiry: Int?,       // null = missing
    val isMissing: Boolean = false
)

enum class FeedFilter(@param:StringRes val labelRes: Int) {
    ALL(R.string.feed_filter_all),
    VALUE_CHANGES(R.string.feed_filter_value),
    TRANSFERS(R.string.feed_filter_transfers),
    NOTES(R.string.feed_filter_notes)
}

// ─── ViewModel ───────────────────────────────────────────────────────────────

abstract class IHomeScreenViewModel : ViewModel() {
    abstract val dashboardState: StateFlow<HomeDashboardState>
    /** Checks if player exists in DB; calls onResult(true) if exists, onResult(false) if deleted. */
    abstract fun checkPlayerExists(tmProfile: String, onResult: (Boolean) -> Unit)
    /** Finds a Women/Youth player by name and returns its document ID, or null if not found. */
    abstract fun findPlayerDocIdByName(playerName: String, onResult: (String?) -> Unit)
    /** Updates player's mandate switch (haveMandate) by tmProfile. */
    abstract fun updatePlayerMandate(tmProfile: String, hasMandate: Boolean)
    abstract fun selectFeedFilter(filter: FeedFilter)
    abstract fun toggleFeedExpanded()
    abstract fun toggleAgentExpanded(agentId: String)
    abstract fun toggleTaskCompleted(task: AgentTask)
    abstract fun addTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int = 0, notes: String = "", playerId: String = "", playerName: String = "", playerTmProfile: String = "", templateId: String = "")
    abstract fun updateTask(task: AgentTask)
    abstract fun deleteTask(task: AgentTask)
    abstract fun toggleTransferWindowGroup(confederation: Confederation)
    abstract fun toggleTeamOverview()
    abstract fun refreshTransferWindows()
    /** Called from UI when user switches MGSR platform (Men / Women / Youth). */
    abstract fun reloadForPlatformSwitch()
    /** Resolves a Firestore doc ID to the correct nav ID for PlayerInfoScreen (tmProfile for Men, doc ID for Women/Youth). */
    abstract fun resolvePlayerNavId(docId: String, onResult: (String?) -> Unit)
}

class HomeScreenViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val transferWindows: TransferWindows,
    private val appContext: android.content.Context,
    private val platformManager: com.liordahan.mgsrteam.features.platform.PlatformManager
) : IHomeScreenViewModel() {

    private val _state = MutableStateFlow(HomeDashboardState())
    override val dashboardState: StateFlow<HomeDashboardState> = _state

    /** Must be declared before init{} so the JVM field is initialised before any coroutine reads it. */
    @Volatile
    private var _currentPlayers: List<Player> = emptyList()

    private val listenerRegistrations = mutableListOf<ListenerRegistration>()

    init {
        loadGreeting()
        loadAllAccounts()
        listenToPlayers()
        listenToRequests()
        loadFeedEvents()
        listenToAgentTasks()
        listenToPendingTransfers()
        loadTransferWindowsDeferred()
        ensureLoadingClearedWithinTimeout()
    }

    // ── Platform switch ─────────────────────────────────────────────────────

    /**
     * Tears down all platform-dependent Firestore listeners and re-subscribes
     * against the new collections. Called *after* [PlatformManager.switchTo()].
     */
    override fun reloadForPlatformSwitch() {
        // Remove old listeners
        listenerRegistrations.forEach { it.remove() }
        listenerRegistrations.clear()
        _currentPlayers = emptyList()
        // Reset state (keep greeting & accounts)
        _state.update {
            it.copy(
                totalPlayers = 0, withMandate = 0, expiringSoon = 0,
                freeAgents = 0, requestsCount = 0,
                feedEvents = emptyList(), agentSummaries = emptyList(),
                agentTasks = emptyMap(), documentReminders = emptyList(),
                mandateDocProfiles = emptySet(), mandateStatusByTmProfile = emptyMap(),
                myAgentOverview = null, isLoading = true
            )
        }
        // Re-subscribe with new collection names
        loadAllAccounts()
        listenToPlayers()
        listenToRequests()
        loadFeedEvents()
        listenToAgentTasks()
        listenToPendingTransfers()
        ensureLoadingClearedWithinTimeout()
    }

    /** Fallback: clear loading if FeedEvents/Players listeners are slow (e.g. offline). */
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

    override fun resolvePlayerNavId(docId: String, onResult: (String?) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val navId = try {
                val isNonMen = platformManager.current.value != com.liordahan.mgsrteam.features.platform.Platform.MEN
                if (isNonMen) {
                    // Women/Youth — doc ID is the nav ID
                    docId
                } else {
                    // Men — look up the doc and get tmProfile
                    val doc = firebaseHandler.firebaseStore
                        .collection(firebaseHandler.playersTable)
                        .document(docId)
                        .get()
                        .await()
                    doc.getString("tmProfile") ?: docId
                }
            } catch (_: Exception) { null }
            withContext(Dispatchers.Main) { onResult(navId) }
        }
    }

    override fun checkPlayerExists(tmProfile: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val exists = try {
                val isNonMen = platformManager.current.value != com.liordahan.mgsrteam.features.platform.Platform.MEN
                if (isNonMen) {
                    // Women / Youth — tmProfile is actually the Firestore document ID
                    firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                        .document(tmProfile).get().await().exists()
                } else {
                    firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                        .whereEqualTo("tmProfile", tmProfile).get().await().documents.isNotEmpty()
                }
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

    override fun updatePlayerMandate(tmProfile: String, hasMandate: Boolean) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val snap = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playersTable)
                    .whereEqualTo("tmProfile", tmProfile)
                    .get()
                    .await()
                val doc = snap.documents.firstOrNull() ?: return@launch
                doc.reference.update("haveMandate", hasMandate).await()
            } catch (e: Exception) {
                android.util.Log.e("HomeVM", "updatePlayerMandate failed for $tmProfile", e)
            }
        }
    }

    // ── Greeting ─────────────────────────────────────────────────────────────

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
                        .whereEqualTo("email", currentEmail)
                        .limit(1)
                        .get()
                        .await()
                    val doc = snap.documents.firstOrNull()
                    doc?.toObject(Account::class.java)?.copy(id = doc.id)
                }
            } catch (_: Exception) { null }

            _state.update { it.copy(greetingRes = greetingRes, currentUserAccount = currentAccount) }
            recomputeMyOverview()
        }
    }

    // ── All Accounts ─────────────────────────────────────────────────────────

    private fun loadAllAccounts() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val accounts = snapshot.toObjects(Account::class.java)
                _state.update { it.copy(allAccounts = accounts) }
            }
        listenerRegistrations.add(reg)
    }

    // ── Players snapshot listener ────────────────────────────────────────────

    private fun listenToPlayers() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .addSnapshotListener { snapshot, error ->
                if (error != null || snapshot == null) return@addSnapshotListener
                val players = snapshot.toObjects(Player::class.java)
                viewModelScope.launch(Dispatchers.Default) {
                    val total = players.size
                    val freeAgents = players.count { it.isFreeAgent }
                    val expiring = players.count { isContractExpiringWithinMonths(it.contractExpired, 5) }

                    val agentGroups = players.groupBy { it.agentInChargeName ?: "Unassigned" }
                    val summaries = agentGroups
                        .filter { it.key != "Unassigned" }
                        .map { (name, list) ->
                            AgentSummary(
                                agentId = list.firstOrNull()?.agentInChargeId,
                                agentName = name,
                                totalPlayers = list.size,
                                withMandate = 0,
                                expiringContracts = list.count { isContractExpiringWithinMonths(it.contractExpired, 5) },
                                withNotes = list.count { !it.noteList.isNullOrEmpty() }
                            )
                        }

                    _currentPlayers = players

                    // Birthdays
                    val currentPlatform = platformManager.current.value
                    val (today, upcoming) = buildBirthdayPlayers(players, currentPlatform)


                    val mandateStatusByTmProfile = players
                        .filter { it.tmProfile != null }
                        .associate { it.tmProfile!! to it.haveMandate }
                    _state.update {
                        it.copy(
                            totalPlayers = total,
                            freeAgents = freeAgents,
                            expiringSoon = expiring,
                            agentSummaries = summaries,
                            mandateStatusByTmProfile = mandateStatusByTmProfile,
                            todayBirthdays = today,
                            upcomingBirthdays = upcoming
                        )
                    }
                    recomputeMyOverview()

                    loadDocumentReminders()
                    countMandates(players)
                }
            }
        listenerRegistrations.add(reg)
    }

    private fun countMandates(players: List<Player>) {
        viewModelScope.launch(Dispatchers.IO) {
            // Query mandate documents; fall back to empty set so haveMandate still counts
            val now = System.currentTimeMillis()
            val profilesWithMandateDoc: Set<String> = try {
                // Query all mandate docs and filter client-side.
                // Firestore whereEqualTo("expired", false) skips docs where 'expired' field
                // is missing, causing count mismatches vs the player list.
                val docsSnap = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playerDocumentsTable)
                    .whereEqualTo("type", DocumentType.MANDATE.name)
                    .get().await()
                val docs = docsSnap.toObjects(PlayerDocument::class.java)
                docs.filter { !it.expired && (it.expiresAt == null || it.expiresAt >= now) }
                    .filter { it.playerTmProfile != null }
                    .mapNotNull { it.playerTmProfile }.toSet()
            } catch (_: Exception) { emptySet() }

            // For Women/Youth, mandate docs store Firestore doc ID as playerTmProfile,
            // so also match by player.id (Firestore doc ID).
            val mandateCount = players.count { it.haveMandate || it.tmProfile in profilesWithMandateDoc || it.id in profilesWithMandateDoc }

            _state.update { it.copy(withMandate = mandateCount, mandateDocProfiles = profilesWithMandateDoc) }

            // Update agent summaries with mandate info
            val agentGroups = players.groupBy { it.agentInChargeName ?: "Unassigned" }
            val updatedSummaries = agentGroups
                .filter { it.key != "Unassigned" }
                .map { (name, list) ->
                    AgentSummary(
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

    // ── Requests count ───────────────────────────────────────────────────────

    private fun listenToRequests() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.clubRequestsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val count = snapshot.size()
                _state.update { it.copy(requestsCount = count) }
            }
        listenerRegistrations.add(reg)
    }

    // ── Pending agent transfers ──────────────────────────────────────────────

    private fun listenToPendingTransfers() {
        val reg = firebaseHandler.firebaseStore
            .collection(com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.COLLECTION)
            .whereEqualTo("status", com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.STATUS_PENDING)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val transfers = snapshot.toObjects(
                    com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest::class.java
                )
                _state.update { it.copy(pendingTransfers = transfers) }
            }
        listenerRegistrations.add(reg)
    }

    // ── Feed events ──────────────────────────────────────────────────────────

    private fun loadFeedEvents() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable)
            .orderBy("timestamp", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val events = snapshot.toObjects(FeedEvent::class.java)
                val deduped = events.distinctBy {
                    "${it.type}_${it.playerTmProfile}_${it.oldValue}_${it.newValue}"
                }
                _state.update {
                    it.copy(
                        feedEvents = deduped,
                        isLoading = false
                    )
                }
            }
        listenerRegistrations.add(reg)
    }

    override fun selectFeedFilter(filter: FeedFilter) {
        _state.update { it.copy(selectedFeedFilter = filter) }
    }

    override fun toggleFeedExpanded() {
        _state.update { it.copy(isFeedExpanded = !it.isFeedExpanded) }
    }

    // ── Document reminders ───────────────────────────────────────────────────

    private fun loadDocumentReminders() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val snap = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playerDocumentsTable)
                    .get().await()
                val docs = snap.toObjects(PlayerDocument::class.java)
                val now = System.currentTimeMillis()
                val thirtyDaysMs = 30L * 24 * 60 * 60 * 1000

                val reminders = docs
                    .filter { doc ->
                        val expires = doc.expiresAt ?: return@filter false
                        expires - now in 0..thirtyDaysMs
                    }
                    .mapNotNull { doc ->
                        val playerName = findPlayerName(doc.playerTmProfile) ?: return@mapNotNull null
                        val daysLeft = ((doc.expiresAt!! - now) / (24 * 60 * 60 * 1000)).toInt()
                        DocumentReminder(
                            playerName = playerName,
                            documentType = doc.documentType.displayName,
                            daysUntilExpiry = daysLeft
                        )
                    }
                    .sortedBy { it.daysUntilExpiry }
                    .take(5)

                _state.update { it.copy(documentReminders = reminders) }
                recomputeMyOverview()
            } catch (e: Exception) {
                android.util.Log.e("HomeVM", "loadDocumentReminders failed", e)
            }
        }
    }

    private fun findPlayerName(tmProfile: String?): String? {
        return _currentPlayers.firstOrNull { it.tmProfile == tmProfile }?.fullName
    }

    // ── Agent Tasks ──────────────────────────────────────────────────────────

    private fun listenToAgentTasks() {
        val reg = firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
            .orderBy("createdAt", com.google.firebase.firestore.Query.Direction.ASCENDING)
            .limit(100)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val tasks = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(AgentTask::class.java)?.copy(id = doc.id)
                }
                val grouped = tasks.groupBy { it.agentId }
                _state.update { it.copy(agentTasks = grouped) }
                recomputeMyOverview()
            }
        listenerRegistrations.add(reg)
    }

    override fun toggleAgentExpanded(agentId: String) {
        _state.update {
            it.copy(expandedAgentId = if (it.expandedAgentId == agentId) null else agentId)
        }
    }

    override fun toggleTaskCompleted(task: AgentTask) {
        if (task.id.isBlank()) return
        val nowCompleted = !task.isCompleted
        // Optimistic update: flip state and sync widget immediately
        _state.update { state ->
            val list = state.agentTasks[task.agentId].orEmpty()
            val updated = list.map { if (it.id == task.id) it.copy(isCompleted = nowCompleted) else it }
            state.copy(agentTasks = state.agentTasks + (task.agentId to updated))
        }
        recomputeMyOverview()
        viewModelScope.launch {
            try {
                val data = mapOf(
                    "isCompleted" to nowCompleted,
                    "completedAt" to if (nowCompleted) System.currentTimeMillis() else 0L
                )
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.agentTasksTable)
                    .document(task.id)
                    .update(data)
                    .await()
            } catch (e: Exception) {
                android.util.Log.e("HomeVM", "toggleTaskCompleted failed for id=${task.id}", e)
            }
        }
    }

    override fun addTask(agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String, playerId: String, playerName: String, playerTmProfile: String, templateId: String) {
        viewModelScope.launch {
            val currentAccount = _state.value.currentUserAccount
            val createdByAgentId = currentAccount?.id ?: ""
            val createdByAgentName = currentAccount?.let { it.getDisplayName(appContext) } ?: ""
            val newTask = AgentTask(
                agentId = agentId,
                agentName = agentName,
                title = title,
                isCompleted = false,
                dueDate = dueDate,
                createdAt = System.currentTimeMillis(),
                priority = priority,
                notes = notes,
                createdByAgentId = createdByAgentId,
                createdByAgentName = createdByAgentName,
                playerId = playerId,
                playerName = playerName,
                playerTmProfile = playerTmProfile,
                templateId = templateId
            )
            // Optimistic update: add to state and sync widget immediately (before Firestore)
            _state.update { state ->
                val existing = state.agentTasks[agentId].orEmpty()
                state.copy(agentTasks = state.agentTasks + (agentId to (existing + newTask)))
            }
            recomputeMyOverview()
            try {
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.agentTasksTable)
                    .add(newTask)
                    .await()
            } catch (e: Exception) {
                android.util.Log.e("HomeVM", "addTask failed", e)
            }
        }
    }

    override fun updateTask(task: AgentTask) {
        if (task.id.isBlank()) return
        // Optimistic update: apply changes and sync widget immediately
        _state.update { state ->
            val list = state.agentTasks[task.agentId].orEmpty()
            val updated = list.map { if (it.id == task.id) task else it }
            state.copy(agentTasks = state.agentTasks + (task.agentId to updated))
        }
        recomputeMyOverview()
        viewModelScope.launch {
            try {
                val data = mapOf(
                    "title" to task.title,
                    "agentId" to task.agentId,
                    "agentName" to task.agentName,
                    "dueDate" to task.dueDate,
                    "priority" to task.priority,
                    "notes" to task.notes,
                    "isCompleted" to task.isCompleted,
                    "completedAt" to task.completedAt
                )
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.agentTasksTable)
                    .document(task.id)
                    .update(data)
                    .await()
            } catch (e: Exception) {
                android.util.Log.e("HomeVM", "updateTask failed for id=${task.id}", e)
            }
        }
    }

    override fun deleteTask(task: AgentTask) {
        // Optimistic update: remove from state and sync widget immediately
        _state.update { state ->
            val list = state.agentTasks[task.agentId].orEmpty().filter { it.id != task.id }
            state.copy(agentTasks = state.agentTasks + (task.agentId to list))
        }
        recomputeMyOverview()
        viewModelScope.launch {
            try {
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.agentTasksTable)
                    .document(task.id)
                    .delete()
                    .await()
            } catch (e: Exception) {
                android.util.Log.e("HomeVM", "deleteTask failed for id=${task.id}", e)
            }
        }
    }

    // ── Transfer Windows ───────────────────────────────────────────────────────

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

    override fun refreshTransferWindows() {
        loadTransferWindows()
    }

    /** Defer transfer windows load so initial Firestore fetches complete first. */
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
                    _state.update {
                        it.copy(
                            transferWindows = allWindows,
                            transferWindowGroups = groups,
                            transferWindowsLoading = false
                        )
                    }
                }
                is com.liordahan.mgsrteam.transfermarket.TransfermarktResult.Failed ->
                    _state.update {
                        it.copy(
                            transferWindows = emptyList(),
                            transferWindowGroups = emptyMap(),
                            transferWindowsLoading = false
                        )
                    }
            }
        }
    }

    private fun buildTransferWindowGroups(
        windows: List<TransferWindow>
    ): Map<Confederation, List<TransferWindow>> {
        val priority = windows
            .filter { it.countryCode in PRIORITY_COUNTRY_CODES }
            .sortedBy { it.daysLeft }

        val remaining = windows
            .filter { it.countryCode !in PRIORITY_COUNTRY_CODES }
            .groupBy { it.confederation }
            .toSortedMap(compareBy { it.order })

        return buildMap {
            if (priority.isNotEmpty()) put(Confederation.PRIORITY, priority)
            remaining.forEach { (conf, list) ->
                put(conf, list.sortedBy { it.daysLeft })
            }
        }
    }

    // ── My Agent Overview (recomputed whenever underlying data changes) ─────

    private fun recomputeMyOverview() {
        val current = _state.value
        val me = current.currentUserAccount ?: return
        val myEnglishName = me.name?.takeIf { it.isNotBlank() } ?: return

        // Players are matched by English name stored in agentInChargeName
        val myPlayers = _currentPlayers.filter { p ->
            p.agentInChargeName.equals(myEnglishName, ignoreCase = true)
        }

        val totalPlayers = myPlayers.size
        val mandateDocProfiles = current.mandateDocProfiles
        val withMandate = myPlayers.count { p ->
            p.haveMandate || p.tmProfile in mandateDocProfiles || p.id in mandateDocProfiles
        }
        val freeAgents = myPlayers.count { it.isFreeAgent }
        val expiringContracts = myPlayers.count { isContractExpiringWithinMonths(it.contractExpired, 5) }

        // Tasks are stored with Account.id OR agentInChargeId from Player
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
        val upcoming = pending
            .sortedBy { if (it.dueDate > 0) it.dueDate else Long.MAX_VALUE }
            .take(5)

        val contractAlerts = myPlayers
            .filter { isContractExpiringWithinMonths(it.contractExpired, 3) }
            .mapNotNull { player ->
                val expiry = parseDateFlexible(player.contractExpired ?: return@mapNotNull null) ?: return@mapNotNull null
                val daysLeft = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), expiry).toInt()
                AgentAlert(
                    playerName = player.fullName ?: "Unknown",
                    detail = "Contract in $daysLeft days",
                    daysLeft = daysLeft,
                    severity = if (daysLeft < 30) AlertSeverity.URGENT else AlertSeverity.WARNING
                )
            }

        val docAlerts = current.documentReminders
            .filter { reminder -> myPlayers.any { it.fullName == reminder.playerName } }
            .map { reminder ->
                AgentAlert(
                    playerName = reminder.playerName,
                    detail = "${reminder.documentType} in ${reminder.daysUntilExpiry ?: 0}d",
                    daysLeft = reminder.daysUntilExpiry ?: 0,
                    severity = if ((reminder.daysUntilExpiry ?: 0) < 7) AlertSeverity.URGENT else AlertSeverity.WARNING
                )
            }

        val overview = MyAgentOverview(
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

        // Sync to home screen widget whenever overview changes (tasks, players, etc.)
        viewModelScope.launch(Dispatchers.IO) {
            try {
                com.liordahan.mgsrteam.widget.WidgetUpdateHelper.syncToWidget(
                    appContext.applicationContext,
                    overview
                )
            } catch (_: Exception) { }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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
