package com.liordahan.mgsrteam

import androidx.lifecycle.ViewModel
import com.google.firebase.auth.FirebaseUser
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

abstract class IMainViewModel : ViewModel() {
    abstract val currentUserFlow: StateFlow<FirebaseUser?>
    abstract val isReady: StateFlow<Boolean>
    abstract val pendingDeepLinkPlayerId: StateFlow<String?>
    abstract fun setPendingDeepLinkPlayerId(playerId: String?)
    abstract fun clearPendingDeepLink()
    /** Transfermarkt player URL from Share/View intent — when set, navigate to Players and show add-player sheet. */
    abstract val pendingAddPlayerTmUrl: StateFlow<String?>
    abstract fun setPendingAddPlayerTmUrl(url: String?)
    abstract fun clearPendingAddPlayerTmUrl()
    /** Transfermarkt URL for Add to Shortlist — when set, navigate to Shortlist and show add sheet. */
    abstract val pendingShortlistAddTmUrl: StateFlow<String?>
    abstract fun setPendingShortlistAddTmUrl(url: String?)
    abstract fun clearPendingShortlistAddTmUrl()
    /** When set, navigate to Tasks screen (e.g. from task notification tap). */
    abstract val pendingOpenTasksScreen: StateFlow<Boolean>
    abstract fun setPendingOpenTasksScreen(value: Boolean)
    /** When set, navigate to Players screen (My Players). */
    abstract val pendingOpenPlayersScreen: StateFlow<Boolean>
    abstract fun setPendingOpenPlayersScreen(value: Boolean)
    /** When set, navigate to Add Player screen. */
    abstract val pendingOpenAddPlayerScreen: StateFlow<Boolean>
    abstract fun setPendingOpenAddPlayerScreen(value: Boolean)
    abstract fun signOut()
}

class MainViewModel(
    private val firebaseHandler: FirebaseHandler
) : IMainViewModel() {

    private val _currentUserFlow = MutableStateFlow<FirebaseUser?>(null)
    override val currentUserFlow: StateFlow<FirebaseUser?> = _currentUserFlow

    private val _isReady = MutableStateFlow(false)
    override val isReady: StateFlow<Boolean> = _isReady

    private val _pendingDeepLinkPlayerId = MutableStateFlow<String?>(null)
    override val pendingDeepLinkPlayerId: StateFlow<String?> = _pendingDeepLinkPlayerId

    private val _pendingAddPlayerTmUrl = MutableStateFlow<String?>(null)
    override val pendingAddPlayerTmUrl: StateFlow<String?> = _pendingAddPlayerTmUrl

    override fun setPendingDeepLinkPlayerId(playerId: String?) {
        _pendingDeepLinkPlayerId.value = playerId
    }

    override fun clearPendingDeepLink() {
        _pendingDeepLinkPlayerId.value = null
    }

    override fun setPendingAddPlayerTmUrl(url: String?) {
        _pendingAddPlayerTmUrl.value = url
    }

    override fun clearPendingAddPlayerTmUrl() {
        _pendingAddPlayerTmUrl.value = null
    }

    private val _pendingShortlistAddTmUrl = MutableStateFlow<String?>(null)
    override val pendingShortlistAddTmUrl: StateFlow<String?> = _pendingShortlistAddTmUrl

    override fun setPendingShortlistAddTmUrl(url: String?) {
        _pendingShortlistAddTmUrl.value = url
    }

    override fun clearPendingShortlistAddTmUrl() {
        _pendingShortlistAddTmUrl.value = null
    }

    private val _pendingOpenTasksScreen = MutableStateFlow(false)
    override val pendingOpenTasksScreen: StateFlow<Boolean> = _pendingOpenTasksScreen

    override fun setPendingOpenTasksScreen(value: Boolean) {
        _pendingOpenTasksScreen.value = value
    }

    private val _pendingOpenPlayersScreen = MutableStateFlow(false)
    override val pendingOpenPlayersScreen: StateFlow<Boolean> = _pendingOpenPlayersScreen

    override fun setPendingOpenPlayersScreen(value: Boolean) {
        _pendingOpenPlayersScreen.value = value
    }

    private val _pendingOpenAddPlayerScreen = MutableStateFlow(false)
    override val pendingOpenAddPlayerScreen: StateFlow<Boolean> = _pendingOpenAddPlayerScreen

    override fun setPendingOpenAddPlayerScreen(value: Boolean) {
        _pendingOpenAddPlayerScreen.value = value
    }

    init {
        getCurrentUser()
    }

    private fun getCurrentUser() {
        firebaseHandler.firebaseAuth.currentUser?.let { user ->
            _currentUserFlow.value = user
        } ?: run {
            _currentUserFlow.value = null
        }
        _isReady.value = true
    }

    override fun signOut() {
        firebaseHandler.firebaseAuth.signOut()
        _currentUserFlow.value = null
    }
}
