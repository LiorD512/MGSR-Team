package com.liordahan.mgsrteam.features.players.playerinfo.documents

import java.util.Locale

/**
 * Converts ISO 3166-1 alpha-3 country codes (from MRZ) to English nationality demonyms.
 * Passports display nationality as adjective ("LIBERIAN", "GUINEAN") not country name ("Liberia").
 * Falls back to country name from Locale if demonym not in our map.
 */
object CountryCodeUtils {

    /**
     * Priority demonym map: ISO 3166-1 alpha-3 → English nationality adjective.
     * Covers all countries likely encountered in football/sports passport processing,
     * plus ICAO special codes (refugees, stateless, organizations).
     */
    private val alpha3ToDemonym = mapOf(
        // ── WEST AFRICA (ECOWAS) ──
        "LBR" to "Liberian", "GIN" to "Guinean", "NGA" to "Nigerian", "GHA" to "Ghanaian",
        "CIV" to "Ivorian", "SEN" to "Senegalese", "MLI" to "Malian", "BFA" to "Burkinabe",
        "TGO" to "Togolese", "BEN" to "Beninese", "NER" to "Nigerien", "SLE" to "Sierra Leonean",
        "GMB" to "Gambian", "GNB" to "Bissau-Guinean", "CPV" to "Cape Verdean",
        // ── CENTRAL AFRICA ──
        "CMR" to "Cameroonian", "COD" to "Congolese", "COG" to "Congolese", "GAB" to "Gabonese",
        "TCD" to "Chadian", "CAF" to "Central African", "GNQ" to "Equatorial Guinean",
        // ── EAST AFRICA ──
        "KEN" to "Kenyan", "TZA" to "Tanzanian", "UGA" to "Ugandan", "RWA" to "Rwandan",
        "BDI" to "Burundian", "ETH" to "Ethiopian", "SOM" to "Somali", "ERI" to "Eritrean",
        "DJI" to "Djiboutian", "SSD" to "South Sudanese", "SDN" to "Sudanese",
        // ── SOUTHERN AFRICA ──
        "ZAF" to "South African", "ZWE" to "Zimbabwean", "ZMB" to "Zambian", "MOZ" to "Mozambican",
        "MWI" to "Malawian", "AGO" to "Angolan", "NAM" to "Namibian", "BWA" to "Motswana",
        "LSO" to "Basotho", "SWZ" to "Swazi", "MDG" to "Malagasy",
        // ── NORTH AFRICA ──
        "MAR" to "Moroccan", "DZA" to "Algerian", "TUN" to "Tunisian", "LBY" to "Libyan",
        "EGY" to "Egyptian",
        // ── WESTERN EUROPE ──
        "FRA" to "French", "GBR" to "British", "DEU" to "German", "ESP" to "Spanish",
        "ITA" to "Italian", "PRT" to "Portuguese", "NLD" to "Dutch", "BEL" to "Belgian",
        "CHE" to "Swiss", "AUT" to "Austrian", "IRL" to "Irish", "LUX" to "Luxembourgish",
        // ── NORTHERN EUROPE ──
        "SWE" to "Swedish", "NOR" to "Norwegian", "DNK" to "Danish", "FIN" to "Finnish",
        "ISL" to "Icelandic",
        // ── EASTERN EUROPE ──
        "POL" to "Polish", "CZE" to "Czech", "SVK" to "Slovak", "HUN" to "Hungarian",
        "ROU" to "Romanian", "BGR" to "Bulgarian", "UKR" to "Ukrainian", "BLR" to "Belarusian",
        "MDA" to "Moldovan", "RUS" to "Russian",
        // ── SOUTHEASTERN EUROPE ──
        "SRB" to "Serbian", "HRV" to "Croatian", "BIH" to "Bosnian", "MNE" to "Montenegrin",
        "MKD" to "Macedonian", "SVN" to "Slovenian", "ALB" to "Albanian", "GRC" to "Greek",
        "CYP" to "Cypriot", "TUR" to "Turkish", "XKX" to "Kosovar", "RKS" to "Kosovar",
        // ── MIDDLE EAST ──
        "ISR" to "Israeli", "PSE" to "Palestinian", "JOR" to "Jordanian", "LBN" to "Lebanese",
        "SYR" to "Syrian", "IRQ" to "Iraqi", "IRN" to "Iranian", "SAU" to "Saudi",
        "ARE" to "Emirati", "QAT" to "Qatari", "KWT" to "Kuwaiti", "BHR" to "Bahraini",
        "OMN" to "Omani", "YEM" to "Yemeni",
        // ── CENTRAL/SOUTH ASIA ──
        "IND" to "Indian", "PAK" to "Pakistani", "BGD" to "Bangladeshi", "LKA" to "Sri Lankan",
        "NPL" to "Nepalese", "AFG" to "Afghan", "UZB" to "Uzbek", "KAZ" to "Kazakh",
        "KGZ" to "Kyrgyz", "TJK" to "Tajik", "TKM" to "Turkmen",
        // ── EAST ASIA ──
        "CHN" to "Chinese", "JPN" to "Japanese", "KOR" to "Korean", "PRK" to "North Korean",
        "MNG" to "Mongolian", "TWN" to "Taiwanese",
        // ── SOUTHEAST ASIA ──
        "THA" to "Thai", "VNM" to "Vietnamese", "PHL" to "Filipino", "IDN" to "Indonesian",
        "MYS" to "Malaysian", "SGP" to "Singaporean", "MMR" to "Burmese", "KHM" to "Cambodian",
        "LAO" to "Laotian",
        // ── AMERICAS ──
        "USA" to "American", "CAN" to "Canadian", "MEX" to "Mexican",
        "BRA" to "Brazilian", "ARG" to "Argentine", "COL" to "Colombian", "PER" to "Peruvian",
        "CHL" to "Chilean", "VEN" to "Venezuelan", "ECU" to "Ecuadorian", "BOL" to "Bolivian",
        "PRY" to "Paraguayan", "URY" to "Uruguayan", "GUY" to "Guyanese", "SUR" to "Surinamese",
        "CRI" to "Costa Rican", "PAN" to "Panamanian", "CUB" to "Cuban",
        "DOM" to "Dominican", "HTI" to "Haitian", "JAM" to "Jamaican",
        "TTO" to "Trinidadian", "HND" to "Honduran", "GTM" to "Guatemalan",
        "SLV" to "Salvadoran", "NIC" to "Nicaraguan",
        // ── OCEANIA ──
        "AUS" to "Australian", "NZL" to "New Zealander", "FJI" to "Fijian",
        // ── ICAO SPECIAL CODES ──
        "D" to "German",
        "XXA" to "Stateless", "XXB" to "Refugee", "XXC" to "Refugee",
        "XXX" to "Unspecified", "UNO" to "United Nations",
        "GBD" to "British Overseas Territories Citizen", "GBN" to "British National (Overseas)",
        "GBO" to "British Overseas Citizen", "GBP" to "British Protected Person",
        "GBS" to "British Subject",
        "XEC" to "ECOWAS", "XCO" to "COMESA", "EUE" to "European Union"
    )

    /** Locale-based fallback for country codes not in our demonym map. */
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

    /**
     * Returns English nationality for a 3-letter ISO code.
     * Prefers demonym/adjective ("Liberian") over country name ("Liberia").
     */
    fun alpha3ToCountryName(alpha3: String?): String? {
        if (alpha3.isNullOrBlank()) return null
        val code = alpha3.uppercase().replace("<", "").take(3)
        return alpha3ToDemonym[code] ?: alpha3ToName[code]
    }
}
