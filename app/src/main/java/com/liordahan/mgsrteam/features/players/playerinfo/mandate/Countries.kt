package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import java.util.Locale

/** Country names in English for mandate generation (Transfermarkt-style). */
object Countries {
    val all: List<String> by lazy {
        Locale.getISOCountries()
            .map { Locale("", it).getDisplayCountry(Locale.ENGLISH) }
            .filter { it.isNotBlank() }
            .distinct()
            .sorted()
    }
}
