package com.liordahan.mgsrteam.features.contacts.models

enum class ContactType(val displayName: String) {
    CLUB("Club"),
    AGENCY("Agency");

    companion object {
        fun fromString(value: String?): ContactType =
            entries.find { it.name.equals(value, ignoreCase = true) } ?: CLUB
    }
}
