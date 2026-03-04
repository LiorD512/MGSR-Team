package com.liordahan.mgsrteam.features.platform

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Singleton managing the active MGSR platform (Men / Women / Youth).
 * Persists the choice in SharedPreferences so it survives app restarts.
 *
 * Exposed as a Koin `single` and injected wherever needed (FirebaseHandler,
 * ViewModels, UI Composables).
 */
class PlatformManager(context: Context) {

    companion object {
        private const val PREFS_NAME = "mgsr_platform"
        private const val KEY_PLATFORM = "active_platform"
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _current = MutableStateFlow(loadFromDisk())
    val current: StateFlow<Platform> = _current.asStateFlow()

    /** Quick non-suspending accessor. */
    val value: Platform get() = _current.value

    fun switchTo(platform: Platform) {
        if (_current.value == platform) return
        _current.value = platform
        prefs.edit().putString(KEY_PLATFORM, platform.name).apply()
    }

    /** Convenience helpers */
    val isMen: Boolean get() = value == Platform.MEN
    val isWomen: Boolean get() = value == Platform.WOMEN
    val isYouth: Boolean get() = value == Platform.YOUTH

    private fun loadFromDisk(): Platform {
        val stored = prefs.getString(KEY_PLATFORM, null)
        return try {
            stored?.let { Platform.valueOf(it) } ?: Platform.MEN
        } catch (_: Exception) {
            Platform.MEN
        }
    }
}
