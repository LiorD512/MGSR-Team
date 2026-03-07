package com.liordahan.mgsrteam.features.warroom

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient
import com.liordahan.mgsrteam.localization.LocaleManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

// ── UI State ────────────────────────────────────────────────────────────────

data class WarRoomUiState(
    // Tab selection
    val selectedTab: WarRoomTab = WarRoomTab.DISCOVERY,

    // Discovery tab
    val discoveryLoading: Boolean = false,
    val candidates: List<DiscoveryCandidate> = emptyList(),
    val discoveryCount: Int = 0,
    val discoveryUpdatedAt: String = "",
    val selectedSourceFilter: String = "all",         // "all", "request_match", "hidden_gem"
    val expandedCandidateUrl: String? = null,          // Which card is expanded
    val discoveryError: String? = null,

    // Scout Agents tab
    val agentsLoading: Boolean = false,
    val scoutProfiles: List<ScoutProfile> = emptyList(),
    val scoutProfilesTotal: Int = 0,
    val selectedAgentFilter: String? = null,            // null = All
    val agentsError: String? = null,

    // Report (full detail)
    val reportLoading: Boolean = false,
    val currentReport: WarRoomReportResponse? = null,
    val reportPlayerUrl: String? = null,
    val reportError: String? = null,

    // Expanded reports inside discovery (loaded on demand)
    val candidateReports: Map<String, WarRoomReportResponse> = emptyMap(),
    val loadingReportUrls: Set<String> = emptySet(),

    // Scout profile feedback (thumbs up/down)
    val scoutFeedback: Map<String, String> = emptyMap()  // profileId -> "up" | "down"
)

enum class WarRoomTab { DISCOVERY, AGENTS, AI_SCOUT }

// ── Interface ───────────────────────────────────────────────────────────────

abstract class IWarRoomViewModel : ViewModel() {
    abstract val uiState: StateFlow<WarRoomUiState>
    abstract fun selectTab(tab: WarRoomTab)
    abstract fun loadDiscovery()
    abstract fun loadScoutProfiles(agentId: String? = null)
    abstract fun setSourceFilter(filter: String)
    abstract fun setAgentFilter(agentId: String?)
    abstract fun toggleCandidateExpanded(transfermarktUrl: String)
    abstract fun loadReport(playerUrl: String, playerName: String?)
    abstract fun clearReport()
    abstract fun setProfileFeedback(profileId: String, feedback: String, agentId: String)
}

// ── Implementation ──────────────────────────────────────────────────────────

class WarRoomViewModel(
    private val apiClient: MgsrWebApiClient,
    private val context: android.content.Context
) : IWarRoomViewModel() {

    companion object {
        private const val TAG = "WarRoomViewModel"
    }

    private val _uiState = MutableStateFlow(WarRoomUiState())
    override val uiState: StateFlow<WarRoomUiState> = _uiState.asStateFlow()

    private val lang: String
        get() = LocaleManager.getSavedLanguage(context)

    private val store = FirebaseFirestore.getInstance()

    init {
        loadDiscovery()
        loadScoutFeedback()
    }

    override fun selectTab(tab: WarRoomTab) {
        _uiState.update { it.copy(selectedTab = tab) }
        // Load data if first visit
        when (tab) {
            WarRoomTab.DISCOVERY -> {
                if (_uiState.value.candidates.isEmpty() && !_uiState.value.discoveryLoading) {
                    loadDiscovery()
                }
            }
            WarRoomTab.AGENTS -> {
                if (_uiState.value.scoutProfiles.isEmpty() && !_uiState.value.agentsLoading) {
                    loadScoutProfiles()
                }
            }
            WarRoomTab.AI_SCOUT -> { /* Content uses its own ViewModel */ }
        }
    }

    override fun loadDiscovery() {
        _uiState.update { it.copy(discoveryLoading = true, discoveryError = null) }

        viewModelScope.launch {
            apiClient.getDiscovery()
                .onSuccess { response ->
                    Log.d(TAG, "Discovery loaded: ${response.count} candidates")
                    _uiState.update {
                        it.copy(
                            discoveryLoading = false,
                            candidates = response.candidates,
                            discoveryCount = response.count,
                            discoveryUpdatedAt = response.updatedAt
                        )
                    }
                }
                .onFailure { e ->
                    Log.e(TAG, "Discovery failed", e)
                    _uiState.update {
                        it.copy(
                            discoveryLoading = false,
                            discoveryError = e.message ?: "Failed to load discovery"
                        )
                    }
                }
        }
    }

    override fun loadScoutProfiles(agentId: String?) {
        _uiState.update { it.copy(agentsLoading = true, agentsError = null) }

        viewModelScope.launch {
            apiClient.getScoutProfiles(agentId)
                .onSuccess { response ->
                    Log.d(TAG, "Scout profiles loaded: ${response.total}")
                    _uiState.update {
                        it.copy(
                            agentsLoading = false,
                            scoutProfiles = response.profiles,
                            scoutProfilesTotal = response.total
                        )
                    }
                }
                .onFailure { e ->
                    Log.e(TAG, "Scout profiles failed", e)
                    _uiState.update {
                        it.copy(
                            agentsLoading = false,
                            agentsError = e.message ?: "Failed to load profiles"
                        )
                    }
                }
        }
    }

    override fun setSourceFilter(filter: String) {
        _uiState.update { it.copy(selectedSourceFilter = filter) }
    }

    override fun setAgentFilter(agentId: String?) {
        _uiState.update { it.copy(selectedAgentFilter = agentId) }
        loadScoutProfiles(agentId)
    }

    override fun toggleCandidateExpanded(transfermarktUrl: String) {
        val current = _uiState.value
        val newExpanded = if (current.expandedCandidateUrl == transfermarktUrl) null else transfermarktUrl

        _uiState.update { it.copy(expandedCandidateUrl = newExpanded) }

        // Load report on demand if expanding and not already loaded
        if (newExpanded != null && !current.candidateReports.containsKey(transfermarktUrl) &&
            !current.loadingReportUrls.contains(transfermarktUrl)
        ) {
            val candidate = current.candidates.find { it.transfermarktUrl == transfermarktUrl }
            loadCandidateReport(transfermarktUrl, candidate)
        }
    }

    private fun loadCandidateReport(playerUrl: String, candidate: DiscoveryCandidate?) {
        _uiState.update { it.copy(loadingReportUrls = it.loadingReportUrls + playerUrl) }

        viewModelScope.launch {
            val request = WarRoomReportRequest(
                playerUrl = playerUrl,
                playerName = candidate?.name,
                lang = lang
            )

            apiClient.getReport(request)
                .onSuccess { report ->
                    // API may not return player info at top level — fill from candidate
                    val enrichedReport = if (report.playerName.isBlank() && candidate != null) {
                        report.copy(
                            playerName = candidate.name,
                            position = report.position.ifBlank { candidate.position },
                            age = if (report.age == 0) candidate.age else report.age,
                            marketValue = report.marketValue.ifBlank { candidate.marketValue },
                            club = report.club.ifBlank { candidate.club },
                            nationality = report.nationality.ifBlank { candidate.nationality }
                        )
                    } else report

                    _uiState.update {
                        it.copy(
                            candidateReports = it.candidateReports + (playerUrl to enrichedReport),
                            loadingReportUrls = it.loadingReportUrls - playerUrl
                        )
                    }
                }
                .onFailure { e ->
                    Log.e(TAG, "Candidate report failed for $playerUrl", e)
                    _uiState.update {
                        it.copy(loadingReportUrls = it.loadingReportUrls - playerUrl)
                    }
                }
        }
    }

    override fun loadReport(playerUrl: String, playerName: String?) {
        _uiState.update { it.copy(reportLoading = true, reportError = null, reportPlayerUrl = playerUrl) }

        viewModelScope.launch {
            val request = WarRoomReportRequest(
                playerUrl = playerUrl,
                playerName = playerName,
                lang = lang
            )

            apiClient.getReport(request)
                .onSuccess { report ->
                    _uiState.update {
                        it.copy(
                            reportLoading = false,
                            currentReport = report
                        )
                    }
                }
                .onFailure { e ->
                    Log.e(TAG, "Report failed", e)
                    _uiState.update {
                        it.copy(
                            reportLoading = false,
                            reportError = e.message ?: "Failed to generate report"
                        )
                    }
                }
        }
    }

    override fun clearReport() {
        _uiState.update { it.copy(currentReport = null, reportPlayerUrl = null, reportError = null) }
    }

    // ── Scout Profile Feedback ───────────────────────────────────────────

    private fun loadScoutFeedback() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        store.collection("ScoutProfileFeedback").document(uid)
            .addSnapshotListener { snap, error ->
                if (error != null || snap == null || !snap.exists()) return@addSnapshotListener
                val feedbackMap = snap.get("feedback") as? Map<*, *> ?: return@addSnapshotListener
                val flat = mutableMapOf<String, String>()
                for ((k, v) in feedbackMap) {
                    val key = k as? String ?: continue
                    when (v) {
                        is String -> flat[key] = v
                        is Map<*, *> -> (v["feedback"] as? String)?.let { flat[key] = it }
                    }
                }
                _uiState.update { it.copy(scoutFeedback = flat) }
            }
    }

    override fun setProfileFeedback(profileId: String, feedback: String, agentId: String) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        // Optimistic UI update
        _uiState.update { it.copy(scoutFeedback = it.scoutFeedback + (profileId to feedback)) }

        viewModelScope.launch {
            try {
                val docRef = store.collection("ScoutProfileFeedback").document(uid)
                val snap = docRef.get().await()
                @Suppress("UNCHECKED_CAST")
                val current = (snap.get("feedback") as? Map<String, Any>)?.toMutableMap() ?: mutableMapOf()
                current[profileId] = mapOf("feedback" to feedback, "agentId" to agentId)
                docRef.set(mapOf("feedback" to current, "updatedAt" to System.currentTimeMillis()), com.google.firebase.firestore.SetOptions.merge()).await()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to set profile feedback", e)
            }
        }
    }
}
