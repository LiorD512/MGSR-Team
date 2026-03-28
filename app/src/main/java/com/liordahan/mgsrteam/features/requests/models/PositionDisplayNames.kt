package com.liordahan.mgsrteam.features.requests.models

import android.content.Context
import com.liordahan.mgsrteam.config.AppConfigManager
import com.liordahan.mgsrteam.localization.LocaleManager

/**
 * Maps short position codes to long display names for the request position header.
 * Data is fetched from Firestore remote config (with hardcoded fallbacks).
 */
object PositionDisplayNames {

    private val shortToLong: Map<String, String>
        get() = AppConfigManager.positions.displayEN

    private val shortToHebrew: Map<String, String>
        get() = AppConfigManager.positions.displayHE

    /**
     * Returns the long display name for a position code, or the original if not found.
     */
    fun toLongName(shortPosition: String?): String {
        if (shortPosition.isNullOrBlank()) return shortPosition ?: ""
        val upper = shortPosition.trim().uppercase()
        return shortToLong[upper] ?: shortPosition.trim()
    }

    /**
     * Returns the display name for a position code in the user's locale.
     * Hebrew when app is in Hebrew, otherwise English (like CountryNameTranslator in contacts).
     */
    fun getDisplayName(context: Context, shortPosition: String?): String {
        if (shortPosition.isNullOrBlank()) return shortPosition ?: ""
        val upper = shortPosition.trim().uppercase()
        return if (LocaleManager.isHebrew(context)) {
            shortToHebrew[upper] ?: shortToLong[upper] ?: shortPosition.trim()
        } else {
            shortToLong[upper] ?: shortPosition.trim()
        }
    }
}
