package com.liordahan.mgsrteam

import androidx.lifecycle.ViewModel
import com.google.firebase.auth.FirebaseUser
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

abstract class IMainViewModel : ViewModel() {
    abstract val currentUserFlow: StateFlow<FirebaseUser?>
    abstract val showVideoSplash: StateFlow<Boolean>
    abstract val pendingDeepLinkPlayerId: StateFlow<String?>
    abstract fun setPendingDeepLinkPlayerId(playerId: String?)
    abstract fun clearPendingDeepLink()
    abstract fun dismissVideoSplash()
}

class MainViewModel(
    private val firebaseHandler: FirebaseHandler
) : IMainViewModel() {

    private val _currentUserFlow = MutableStateFlow<FirebaseUser?>(null)
    override val currentUserFlow: StateFlow<FirebaseUser?> = _currentUserFlow

    private val _showVideoSplash = MutableStateFlow(true)
    override val showVideoSplash: StateFlow<Boolean> = _showVideoSplash

    private val _pendingDeepLinkPlayerId = MutableStateFlow<String?>(null)
    override val pendingDeepLinkPlayerId: StateFlow<String?> = _pendingDeepLinkPlayerId

    override fun setPendingDeepLinkPlayerId(playerId: String?) {
        _pendingDeepLinkPlayerId.value = playerId
    }

    override fun clearPendingDeepLink() {
        _pendingDeepLinkPlayerId.value = null
    }

    override fun dismissVideoSplash() {
        _showVideoSplash.value = false
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
    }
}