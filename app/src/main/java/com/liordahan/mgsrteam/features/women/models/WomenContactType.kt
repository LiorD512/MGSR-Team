package com.liordahan.mgsrteam.features.women.models

/**
 * Women-dedicated contact type enum.
 */
enum class WomenContactType(val displayName: String) {
    CLUB("Club"),
    AGENCY("Agency");

    companion object {
        fun fromString(value: String?): WomenContactType =
            entries.find { it.name.equals(value, ignoreCase = true) } ?: CLUB
    }
}
