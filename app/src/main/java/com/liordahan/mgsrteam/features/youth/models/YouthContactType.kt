package com.liordahan.mgsrteam.features.youth.models

/**
 * Youth-dedicated contact type enum.
 */
enum class YouthContactType(val displayName: String) {
    CLUB("Club"),
    AGENCY("Agency");

    companion object {
        fun fromString(value: String?): YouthContactType =
            entries.find { it.name.equals(value, ignoreCase = true) } ?: CLUB
    }
}
