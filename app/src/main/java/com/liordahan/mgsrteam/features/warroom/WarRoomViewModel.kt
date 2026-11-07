package com.liordahan.mgsrteam.features.warroom

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.aiscout.MgsrWebApiClient
import com.liordahan.mgsrteam.firebase.SharedCallables
import com.liordahan.mgsrteam.localization.LocaleManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
    val discoveryError: String? = null,

    // Scout Agents tab
    val agentsLoading: Boolean = false,
    val scoutProfiles: List<ScoutProfile> = emptyList(),
    val scoutProfilesTotal: Int = 0,
    val selectedAgentFilter: String? = null,            // null = All
    val selectedAgentPositionFilter: String? = null,    // null = All positions
    val agentsError: String? = null,
    val agentRotationPage: Int = 0,                       // rotation page for 10-per-agent display

    // Scout profile feedback (thumbs up/down)
    val scoutFeedback: Map<String, String> = emptyMap(),  // profileId -> "up" | "down"
    /** Profile IDs where feedback is currently being saved to server. */
    val savingFeedbackIds: Set<String> = emptySet()
)

enum class WarRoomTab { DISCOVERY, AGENTS, AI_SCOUT, FIND_NEXT }

// ── Interface ───────────────────────────────────────────────────────────────

abstract class IWarRoomViewModel : ViewModel() {
    abstract val uiState: StateFlow<WarRoomUiState>
    abstract fun selectTab(tab: WarRoomTab)
    abstract fun loadDiscovery()
    abstract fun loadScoutProfiles(agentId: String? = null)
    abstract fun setSourceFilter(filter: String)
    abstract fun setAgentFilter(agentId: String?)
    abstract fun setAgentPositionFilter(position: String?)
    abstract fun setProfileFeedback(profileId: String, feedback: String, agentId: String)
    abstract fun rotateAgentProfiles()
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
    private var feedbackListenerRegistration: ListenerRegistration? = null

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
            WarRoomTab.FIND_NEXT -> { /* Content uses its own ViewModel */ }
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
        _uiState.update { it.copy(selectedAgentFilter = agentId, agentRotationPage = 0) }
    }

    override fun setAgentPositionFilter(position: String?) {
        _uiState.update { it.copy(selectedAgentPositionFilter = position, agentRotationPage = 0) }
    }

    override fun rotateAgentProfiles() {
        _uiState.update { it.copy(agentRotationPage = it.agentRotationPage + 1) }
    }

    // ── Scout Profile Feedback ───────────────────────────────────────────

    private fun loadScoutFeedback() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        feedbackListenerRegistration?.remove()
        feedbackListenerRegistration = store.collection("ScoutProfileFeedback").document(uid)
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

    override fun onCleared() {
        super.onCleared()
        feedbackListenerRegistration?.remove()
    }

    override fun setProfileFeedback(profileId: String, feedback: String, agentId: String) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        // Optimistic UI update
        _uiState.update { it.copy(
            scoutFeedback = it.scoutFeedback + (profileId to feedback),
            savingFeedbackIds = it.savingFeedbackIds + profileId
        ) }

        viewModelScope.launch {
            try {
                SharedCallables.scoutProfileFeedbackSet(uid, profileId, feedback, agentId)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to set profile feedback", e)
            } finally {
                _uiState.update { it.copy(savingFeedbackIds = it.savingFeedbackIds - profileId) }
            }
        }
    }
}
