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
}