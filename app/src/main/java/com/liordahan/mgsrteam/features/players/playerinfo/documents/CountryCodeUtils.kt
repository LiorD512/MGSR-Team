package com.liordahan.mgsrteam.features.players.playerinfo.documents

import java.util.Locale

/**
 * Converts ISO 3166-1 alpha-3 country codes (e.g. from passport MRZ) to English country names.
 */
object CountryCodeUtils {

    private val alpha3ToName: Map<String, String> by lazy {
        buildMap {
            for (code in Locale.getISOCountries()) {
                try {
                    val locale = Locale.Builder().setRegion(code).build()
                    val alpha3 = locale.isO3Country
                    val name = locale.getDisplayCountry(Locale.ENGLISH)
                    if (alpha3.isNotBlank() && name.isNotBlank()) {
                        put(alpha3, name)
                    }
                } catch (_: Exception) { }
            }
        }
    }

    fun alpha3ToCountryName(alpha3: String?): String? {
        if (alpha3.isNullOrBlank()) return null
        return alpha3ToName[alpha3.uppercase().take(3)]
    }
}
