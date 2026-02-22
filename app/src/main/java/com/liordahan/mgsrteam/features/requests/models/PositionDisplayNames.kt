package com.liordahan.mgsrteam.features.requests.models

import android.content.Context
import com.liordahan.mgsrteam.localization.LocaleManager

/**
 * Maps short position codes to long display names for the request position header.
 * Supports Hebrew when app locale is Hebrew (like CountryNameTranslator in contacts).
 */
object PositionDisplayNames {

    private val shortToLong = mapOf(
        "GK" to "GOALKEEPER",
        "CB" to "CENTER BACK",
        "RB" to "RIGHT BACK",
        "LB" to "LEFT BACK",
        "DM" to "DEFENSIVE MIDFIELDER",
        "CM" to "CENTRAL MIDFIELDER",
        "AM" to "ATTACKING MIDFIELDER",
        "LM" to "LEFT MIDFIELDER",
        "RM" to "RIGHT MIDFIELDER",
        "LW" to "LEFT WINGER",
        "RW" to "RIGHT WINGER",
        "CF" to "CENTER FORWARD",
        "ST" to "STRIKER",
        "SS" to "SECOND STRIKER",
        "CDM" to "DEFENSIVE MIDFIELDER",
        "LWB" to "LEFT WING BACK",
        "RWB" to "RIGHT WING BACK",
        "DEF" to "DEFENDER",
        "MID" to "MIDFIELDER",
        "FWD" to "FORWARD"
    )

    private val shortToHebrew = mapOf(
        "GK" to "שוער",
        "CB" to "בלם",
        "RB" to "מגן ימני",
        "LB" to "מגן שמאלי",
        "DM" to "קשר אחורי",
        "CM" to "קשר מרכזי",
        "AM" to "קשר התקפי",
        "LM" to "קשר שמאלי",
        "RM" to "קשר ימני",
        "LW" to "כנף שמאל",
        "RW" to "כנף ימין",
        "CF" to "חלוץ מרכזי",
        "ST" to "חלוץ",
        "SS" to "חלוץ שני",
        "CDM" to "קשר 50/50",
        "LWB" to "כנף אחורי שמאלי",
        "RWB" to "כנף אחורי ימני",
        "DEF" to "מגן",
        "MID" to "קשר",
        "FWD" to "חלוץ"
    )

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
