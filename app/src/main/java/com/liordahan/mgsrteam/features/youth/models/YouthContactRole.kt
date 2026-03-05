package com.liordahan.mgsrteam.features.youth.models

/**
 * Youth-dedicated contact role enum.
 */
enum class YouthContactRole(val displayName: String) {
    UNKNOWN("Unknown"),
    COACH("Coach"),
    ASSISTANT_COACH("Assistant Coach"),
    YOUTH_COORDINATOR("Youth Coordinator"),
    ACADEMY_DIRECTOR("Academy Director"),
    SPORT_DIRECTOR("Sport Director"),
    CEO("CEO"),
    BOARD_MEMBER("Board Member"),
    PRESIDENT("President"),
    SCOUT("Scout"),
    AGENT("Agent"),
    INTERMEDIARY("Intermediary"),
    AGENCY_DIRECTOR("Agency Director");

    companion object {
        fun fromString(value: String?): YouthContactRole? = entries.find {
            it.name.equals(value, ignoreCase = true) || it.displayName.equals(value, ignoreCase = true)
        }
    }
}
