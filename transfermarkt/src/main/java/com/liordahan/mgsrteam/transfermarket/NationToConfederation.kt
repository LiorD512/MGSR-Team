package com.liordahan.mgsrteam.transfermarket

/**
 * Maps country/nation names (as returned by Transfermarkt) to FIFA confederation.
 * Used for filtering contract finishers by region (UEFA, AFC, CAF, etc.).
 */
object NationToConfederation {

    private val COUNTRY_TO_CONFEDERATION: Map<String, Confederation> = buildMap {
        // UEFA - Europe
        listOf(
            "England", "Germany", "Spain", "Italy", "France", "Netherlands", "Portugal",
            "Belgium", "Turkey", "Russia", "Israel", "Scotland", "Greece", "Austria",
            "Switzerland", "Poland", "Ukraine", "Czech Republic", "Czechia", "Denmark",
            "Sweden", "Norway", "Romania", "Bulgaria", "Croatia", "Serbia", "Hungary",
            "Slovakia", "Slovenia", "Cyprus", "Finland", "Iceland", "Bosnia-Herzegovina",
            "Bosnia and Herzegovina", "North Macedonia", "Macedonia", "Albania", "Montenegro",
            "Luxembourg", "Malta", "Ireland", "Republic of Ireland", "Wales", "Northern Ireland",
            "Belarus", "Georgia", "Armenia", "Azerbaijan", "Kazakhstan", "Moldova",
            "Lithuania", "Estonia", "Latvia", "Kosovo", "Andorra", "Faroe Islands",
            "Liechtenstein", "San Marino", "Gibraltar", "Türkiye"
        ).forEach { put(it, Confederation.UEFA) }
        // AFC - Asia
        listOf(
            "Saudi Arabia", "United Arab Emirates", "UAE", "Qatar", "China", "Japan",
            "South Korea", "Korea, South", "Iran", "India", "Australia", "Thailand",
            "Malaysia", "Vietnam", "Indonesia", "Uzbekistan", "Iraq", "Kuwait", "Oman",
            "Bahrain", "Jordan", "Syria", "Lebanon", "Philippines", "Singapore",
            "Hong Kong", "Chinese Taipei", "Taiwan", "Bangladesh", "Nepal", "Sri Lanka",
            "Palestine", "Yemen", "Tajikistan", "Turkmenistan", "Kyrgyzstan", "Myanmar",
            "Maldives", "Afghanistan"
        ).forEach { put(it, Confederation.AFC) }
        // CONMEBOL - South America
        listOf(
            "Brazil", "Argentina", "Colombia", "Chile", "Peru", "Ecuador", "Uruguay",
            "Paraguay", "Bolivia", "Venezuela"
        ).forEach { put(it, Confederation.CONMEBOL) }
        // CONCACAF - North/Central America
        listOf(
            "Mexico", "United States", "USA", "Canada", "Costa Rica", "Honduras",
            "Panama", "Jamaica", "Trinidad and Tobago", "Trinidad & Tobago", "Guatemala",
            "El Salvador", "Nicaragua", "Cuba", "Dominican Republic", "Haiti",
            "Curaçao", "Curacao", "Suriname"
        ).forEach { put(it, Confederation.CONCACAF) }
        // CAF - Africa
        listOf(
            "Egypt", "Morocco", "Tunisia", "South Africa", "Nigeria", "Algeria",
            "Ghana", "Senegal", "Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire",
            "Cameroon", "Kenya", "Zimbabwe", "Zambia", "Angola", "DR Congo",
            "Congo DR", "Mali", "Tanzania", "Ethiopia", "Libya", "Sudan", "Uganda",
            "Togo", "Benin", "Burkina Faso", "Niger", "Guinea", "Madagascar",
            "Mauritius", "Botswana", "Namibia", "Mozambique", "Rwanda"
        ).forEach { put(it, Confederation.CAF) }
        // OFC - Oceania
        listOf(
            "New Zealand", "Fiji", "Papua New Guinea", "Solomon Islands"
        ).forEach { put(it, Confederation.OFC) }
    }

    /**
     * Returns the confederation for the given country/nation name, or null if unknown.
     * Performs case-insensitive lookup and trims whitespace.
     * Handles multi-nationality strings (e.g. "France Mali") by using the first country.
     */
    fun getConfederation(countryName: String?): Confederation? {
        val normalized = countryName?.trim()?.takeIf { it.isNotBlank() } ?: return null
        // Try full string first
        lookup(normalized)?.let { return it }
        // Multi-nationality: "France Mali" or "France, Mali" - try first segment
        val first = normalized.split(",", " ", "&", "/").firstOrNull()?.trim()?.takeIf { it.isNotBlank() }
        if (first != null) lookup(first)?.let { return it }
        return null
    }

    private fun lookup(name: String): Confederation? =
        COUNTRY_TO_CONFEDERATION[name]
            ?: COUNTRY_TO_CONFEDERATION.entries.firstOrNull { (key, _) ->
                key.equals(name, ignoreCase = true)
            }?.value
}
