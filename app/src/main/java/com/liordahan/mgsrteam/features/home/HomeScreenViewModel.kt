package com.liordahan.mgsrteam.features.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.home.models.AgentSummary
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Calendar
import java.util.Locale

// ─── UI State ────────────────────────────────────────────────────────────────

data class HomeDashboardState(
    val userName: String = "",
    val greeting: String = "",

    // stats row
    val totalPlayers: Int = 0,
    val withMandate: Int = 0,
    val expiringSoon: Int = 0,
    val freeAgents: Int = 0,

    // activity feed
    val feedEvents: List<FeedEvent> = emptyList(),
    val selectedFeedFilter: FeedFilter = FeedFilter.ALL,

    // agent summaries
    val agentSummaries: List<AgentSummary> = emptyList(),

    // all agent accounts (from Accounts table)
    val allAccounts: List<Account> = emptyList(),

    // agent tasks
    val agentTasks: Map<String, List<AgentTask>> = emptyMap(),   // agentId -> tasks
    val expandedAgentId: String? = null,

    // document reminders
    val documentReminders: List<DocumentReminder> = emptyList(),

    // loading
    val isLoading: Boolean = true
)

data class DocumentReminder(
    val playerName: String,
    val documentType: String,
    val daysUntilExpiry: Int?,       // null = missing
    val isMissing: Boolean = false
)

enum class FeedFilter(val label: String) {
    ALL("All"),
    VALUE_CHANGES("Value"),
    TRANSFERS("Transfers"),
    NOTES("Notes")
}

// ─── ViewModel ───────────────────────────────────────────────────────────────

abstract class IHomeScreenViewModel : ViewModel() {
    abstract val dashboardState: StateFlow<HomeDashboardState>
    abstract fun selectFeedFilter(filter: FeedFilter)
    abstract fun toggleAgentExpanded(agentId: String)
    abstract fun toggleTaskCompleted(task: AgentTask)
    abstract fun addTask(agentId: String, agentName: String, title: String, dueDate: Long)
    abstract fun deleteTask(task: AgentTask)
}

class HomeScreenViewModel(
    private val firebaseHandler: FirebaseHandler
) : IHomeScreenViewModel() {

    private val _state = MutableStateFlow(HomeDashboardState())
    override val dashboardState: StateFlow<HomeDashboardState> = _state

    /** Must be declared before init{} so the JVM field is initialised before any coroutine reads it. */
    private var _currentPlayers: List<Player> = emptyList()

    init {
        loadGreeting()
        loadAllAccounts()
        listenToPlayers()
        loadFeedEvents()
        loadDocumentReminders()
        listenToAgentTasks()
    }

    // ── Greeting ─────────────────────────────────────────────────────────────

    private fun loadGreeting() {
        viewModelScope.launch {
            val greeting = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
                in 5..11 -> "Good Morning"
                in 12..17 -> "Good Afternoon"
                else -> "Good Evening"
            }
            val name = try {
                val snap = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.accountsTable).get().await()
                val accounts = snap.toObjects(com.liordahan.mgsrteam.features.login.models.Account::class.java)
                accounts.firstOrNull {
                    it.email.equals(firebaseHandler.firebaseAuth.currentUser?.email, true)
                }?.name ?: ""
            } catch (_: Exception) { "" }

            _state.update { it.copy(greeting = greeting, userName = name) }
        }
    }

    // ── All Accounts ─────────────────────────────────────────────────────────

    private fun loadAllAccounts() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val accounts = snapshot.toObjects(Account::class.java)
                _state.update { it.copy(allAccounts = accounts) }
            }
    }

    // ── Players snapshot listener ────────────────────────────────────────────

    private fun listenToPlayers() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
            .addSnapshotListener { snapshot, error ->
                if (error != null || snapshot == null) return@addSnapshotListener
                val players = snapshot.toObjects(Player::class.java)

                val total = players.size
                val freeAgents = players.count {
                    it.currentClub?.clubName.equals("Without Club", true) ||
                        it.currentClub?.clubName.equals("Without club", true)
                }
                val expiring = players.count { isContractExpiringWithinMonths(it.contractExpired, 5) }

                // Agent summaries
                val agentGroups = players.groupBy { it.agentInChargeName ?: "Unassigned" }
                val summaries = agentGroups
                    .filter { it.key != "Unassigned" }
                    .map { (name, list) ->
                        AgentSummary(
                            agentId = list.firstOrNull()?.agentInChargeId,
                            agentName = name,
                            totalPlayers = list.size,
                            withMandate = 0, // filled below once docs loaded
                            expiringContracts = list.count { isContractExpiringWithinMonths(it.contractExpired, 5) },
                            withNotes = list.count { !it.noteList.isNullOrEmpty() }
                        )
                    }

                // store players for live-match matching
                _currentPlayers = players

                _state.update {
                    it.copy(
                        totalPlayers = total,
                        freeAgents = freeAgents,
                        expiringSoon = expiring,
                        agentSummaries = summaries,
                        isLoading = false
                    )
                }

                // Count mandates asynchronously
                countMandates(players)
            }
    }

    private fun countMandates(players: List<Player>) {
        viewModelScope.launch {
            try {
                val docsSnap = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.playerDocumentsTable)
                    .whereEqualTo("type", "mandate")
                    .get().await()
                val docs = docsSnap.toObjects(PlayerDocument::class.java)
                val profilesWithMandateDoc = docs.mapNotNull { it.playerTmProfile }.toSet()
                // Count: player.haveMandate (from switch) OR has mandate document
                val mandateCount = players.count { it.haveMandate || it.tmProfile in profilesWithMandateDoc }

                _state.update { it.copy(withMandate = mandateCount) }

                // Update agent summaries with mandate info
                val agentGroups = players.groupBy { it.agentInChargeName ?: "Unassigned" }
                val updatedSummaries = agentGroups
                    .filter { it.key != "Unassigned" }
                    .map { (name, list) ->
                        AgentSummary(
                            agentId = list.firstOrNull()?.agentInChargeId,
                            agentName = name,
                            totalPlayers = list.size,
                            withMandate = list.count { it.haveMandate || it.tmProfile in profilesWithMandateDoc },
                            expiringContracts = list.count { isContractExpiringWithinMonths(it.contractExpired, 5) },
                            withNotes = list.count { !it.noteList.isNullOrEmpty() }
                        )
                    }
                _state.update { it.copy(agentSummaries = updatedSummaries) }
            } catch (_: Exception) { }
        }
    }

    // ── Feed events ──────────────────────────────────────────────────────────

    private fun loadFeedEvents() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable)
            .orderBy("timestamp", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val events = snapshot.toObjects(FeedEvent::class.java)
                _state.update { it.copy(feedEvents = events) }
            }
    }

    override fun selectFeedFilter(filter: FeedFilter) {
        _state.update { it.copy(selectedFeedFilter = filter) }
    }

    // ── Document reminders ───────────────────────────────────────────────────

    private fun loadDocumentReminders() {
        viewModelScope.launch {
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
            } catch (_: Exception) { }
        }
    }

    private fun findPlayerName(tmProfile: String?): String? {
        return _currentPlayers.firstOrNull { it.tmProfile == tmProfile }?.fullName
    }

    // ── Agent Tasks ──────────────────────────────────────────────────────────

    private fun listenToAgentTasks() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.agentTasksTable)
            .orderBy("createdAt", com.google.firebase.firestore.Query.Direction.ASCENDING)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null) return@addSnapshotListener
                val tasks = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(AgentTask::class.java)?.copy(id = doc.id)
                }
                val grouped = tasks.groupBy { it.agentId }
                _state.update { it.copy(agentTasks = grouped) }
            }
    }

    override fun toggleAgentExpanded(agentId: String) {
        _state.update {
            it.copy(expandedAgentId = if (it.expandedAgentId == agentId) null else agentId)
        }
    }

    override fun toggleTaskCompleted(task: AgentTask) {
        if (task.id.isBlank()) return
        viewModelScope.launch {
            try {
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.agentTasksTable)
                    .document(task.id)
                    .update("isCompleted", !task.isCompleted)
                    .await()
            } catch (e: Exception) {
                android.util.Log.e("HomeVM", "toggleTaskCompleted failed for id=${task.id}", e)
            }
        }
    }

    override fun addTask(agentId: String, agentName: String, title: String, dueDate: Long) {
        viewModelScope.launch {
            try {
                val newTask = AgentTask(
                    agentId = agentId,
                    agentName = agentName,
                    title = title,
                    isCompleted = false,
                    dueDate = dueDate,
                    createdAt = System.currentTimeMillis()
                )
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.agentTasksTable)
                    .add(newTask)
                    .await()
            } catch (_: Exception) { }
        }
    }

    override fun deleteTask(task: AgentTask) {
        viewModelScope.launch {
            try {
                firebaseHandler.firebaseStore
                    .collection(firebaseHandler.agentTasksTable)
                    .document(task.id)
                    .delete()
                    .await()
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
