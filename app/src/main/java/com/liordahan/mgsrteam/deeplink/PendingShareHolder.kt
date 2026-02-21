package com.liordahan.mgsrteam.deeplink

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Process-scoped singleton for pending share/deep link URLs.
 * Survives across activity instances — critical because the share sheet uses
 * FLAG_ACTIVITY_MULTIPLE_TASK and can create new tasks regardless of launchMode.
 * Both MainActivity and HomeScreen read from this to ensure we never lose a share.
 */
object PendingShareHolder {
    private val _pendingAddPlayerTmUrl = MutableStateFlow<String?>(null)
    val pendingAddPlayerTmUrl: StateFlow<String?> = _pendingAddPlayerTmUrl.asStateFlow()

    fun setPendingAddPlayerTmUrl(url: String?) {
        _pendingAddPlayerTmUrl.value = url
    }

    fun takePendingAddPlayerTmUrl(): String? {
        val url = _pendingAddPlayerTmUrl.value
        _pendingAddPlayerTmUrl.value = null
        return url
    }

    fun hasPendingAddPlayerUrl(): Boolean = _pendingAddPlayerTmUrl.value != null
}
