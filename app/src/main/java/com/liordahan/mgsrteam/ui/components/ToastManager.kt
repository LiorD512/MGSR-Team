package com.liordahan.mgsrteam.ui.components

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

object ToastManager {

    private val scope = CoroutineScope(Dispatchers.Main.immediate + SupervisorJob())

    private val _toastFlow = MutableStateFlow<ToastMessage?>(null)
    val toastFlow: StateFlow<ToastMessage?> = _toastFlow.asStateFlow()

    fun show(
        message: String,
        type: ToastType = ToastType.Neutral,
        durationMs: Long = when (type) {
            ToastType.Error -> 4000L
            else -> 3000L
        }
    ) {
        scope.launch {
            _toastFlow.value = ToastMessage(message = message, type = type, durationMs = durationMs)
            delay(durationMs)
            _toastFlow.value = null
        }
    }

    fun showSuccess(message: String) = show(message, ToastType.Success)
    fun showError(message: String) = show(message, ToastType.Error)
    fun showInfo(message: String) = show(message, ToastType.Info)
}
