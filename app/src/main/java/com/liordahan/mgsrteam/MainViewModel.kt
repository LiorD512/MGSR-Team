package com.liordahan.mgsrteam

import androidx.lifecycle.ViewModel
import com.google.firebase.auth.FirebaseUser
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

abstract class IMainViewModel : ViewModel() {
    abstract val currentUserFlow: StateFlow<FirebaseUser?>
    abstract val showSplashScreen: StateFlow<Boolean>
}

class MainViewModel(
    private val firebaseHandler: FirebaseHandler
) : IMainViewModel() {

    private val _currentUserFlow = MutableStateFlow<FirebaseUser?>(null)
    override val currentUserFlow: StateFlow<FirebaseUser?> = _currentUserFlow

    private val _showSplashScreen = MutableStateFlow(true)
    override val showSplashScreen: StateFlow<Boolean> = _showSplashScreen

    init {
        getCurrentUser()
    }


    private fun getCurrentUser() {
        firebaseHandler.firebaseAuth.currentUser?.let { user ->
            _currentUserFlow.value = user
        } ?: run {
            _currentUserFlow.value = null
        }

        _showSplashScreen.update { false }
    }
}