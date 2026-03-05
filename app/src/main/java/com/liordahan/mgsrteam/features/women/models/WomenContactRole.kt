package com.liordahan.mgsrteam.features.women.models

/**
 * Women-dedicated contact role enum.
 */
enum class WomenContactRole(val displayName: String) {
    UNKNOWN("Unknown"),
    COACH("Coach"),
    ASSISTANT_COACH("Assistant Coach"),
    SPORT_DIRECTOR("Sport Director"),
    CEO("CEO"),
    BOARD_MEMBER("Board Member"),
    PRESIDENT("President"),
    SCOUT("Scout"),
    AGENT("Agent"),
    INTERMEDIARY("Intermediary"),
    AGENCY_DIRECTOR("Agency Director");

    companion object {
        fun fromString(value: String?): WomenContactRole? = entries.find {
            it.name.equals(value, ignoreCase = true) || it.displayName.equals(value, ignoreCase = true)
        }
    }
}
