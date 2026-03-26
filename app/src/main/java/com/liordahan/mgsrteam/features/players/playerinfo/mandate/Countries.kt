package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import java.util.Locale

/** Country names in English for mandate generation (Transfermarkt-style). */
object Countries {

    /** Newer JVM/Android locales return "Türkiye" instead of "Turkey". Ensure both are present. */
    private val ALIASES = mapOf(
        "Türkiye" to "Turkey",
    )

    val all: List<String> by lazy {
        val raw = Locale.getISOCountries()
            .map { Locale.Builder().setRegion(it).build().getDisplayCountry(Locale.ENGLISH) }
            .filter { it.isNotBlank() }
            .toMutableSet()
        // Ensure common English names are present even if the JVM uses the new official name
        ALIASES.forEach { (official, common) ->
            if (raw.contains(official) && !raw.contains(common)) raw.add(common)
            if (raw.contains(common) && !raw.contains(official)) raw.add(official)
        }
        raw.sorted()
    }
}
