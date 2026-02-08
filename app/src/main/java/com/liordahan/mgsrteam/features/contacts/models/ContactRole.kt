package com.liordahan.mgsrteam.features.contacts.models

enum class ContactRole(val displayName: String) {
    UNKNOWN("Unknown"),
    COACH("Coach"),
    ASSISTANT_COACH("Assistant Coach"),
    SPORT_DIRECTOR("Sport Director"),
    CEO("CEO"),
    BOARD_MEMBER("Board Member"),
    PRESIDENT("President"),
    SCOUT("Scout");

    companion object {
        fun fromString(value: String?): ContactRole? = entries.find {
            it.name.equals(value, ignoreCase = true) || it.displayName.equals(value, ignoreCase = true)
        }
    }
}
