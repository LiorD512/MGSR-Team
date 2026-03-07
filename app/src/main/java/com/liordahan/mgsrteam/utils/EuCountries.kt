package com.liordahan.mgsrteam.utils

/**
 * EU member states — used for the "EU Nat" badge on player cards/detail.
 * Matches the hardcoded fallback list from the web platform.
 */
object EuCountries {

    private val euCountryNames = setOf(
        "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus",
        "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland",
        "France", "Germany", "Greece", "Hungary", "Ireland",
        "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta",
        "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
        "Slovenia", "Spain", "Sweden"
    )

    fun isEuNational(nationality: String?): Boolean {
        if (nationality.isNullOrBlank()) return false
        return euCountryNames.any { it.equals(nationality.trim(), ignoreCase = true) }
    }
}
