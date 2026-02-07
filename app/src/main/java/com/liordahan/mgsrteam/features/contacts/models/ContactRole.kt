package com.liordahan.mgsrteam.features.contacts.models

enum class ContactRole(val displayName: String) {
    UNKNOWN("Unknown"),
    COACH("Coach"),
    SPORT_DIRECTOR("Sport Director"),
    CEO("CEO"),
    PRESIDENT("President"),
    SCOUT("Scout");

    companion object {
        fun fromString(value: String?): ContactRole? = entries.find {
            it.name.equals(value, ignoreCase = true) || it.displayName.equals(value, ignoreCase = true)
        }
    }
}
