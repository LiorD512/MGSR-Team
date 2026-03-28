package com.liordahan.mgsrteam.utils

import com.liordahan.mgsrteam.config.AppConfigManager

/**
 * EU member states — used for the "EU Nat" badge on player cards/detail.
 * Data is fetched from Firestore remote config (with hardcoded fallbacks).
 */
object EuCountries {

    fun isEuNational(nationality: String?): Boolean {
        if (nationality.isNullOrBlank()) return false
        return AppConfigManager.euCountries.contains(nationality.trim().lowercase())
    }

    fun isEuNational(nationalities: List<String>?, fallbackNationality: String? = null): Boolean {
        val list = nationalities?.takeIf { it.isNotEmpty() } ?: listOfNotNull(fallbackNationality)
        return list.any { isEuNational(it) }
    }
}
