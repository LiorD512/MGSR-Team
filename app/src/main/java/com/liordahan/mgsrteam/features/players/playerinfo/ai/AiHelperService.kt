package com.liordahan.mgsrteam.features.players.playerinfo.ai

import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktPlayerDetails
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * AI Helper service using Firebase AI (Gemini) to find similar players.
 * Transfermarkt URLs are verified by searching Transfermarkt - AI-generated URLs are not trusted.
 *
 * Prerequisites: Enable Firebase AI Logic in Firebase Console:
 * https://console.firebase.google.com/project/_/ailogic
 */
class AiHelperService(
    private val playerSearch: PlayerSearch
) {

    companion object {
        private const val TAG = "AiHelperService"
    }

    data class SimilarPlayerSuggestion(
        val name: String,
        val position: String?,
        val age: String?,
        val marketValue: String?,
        val transfermarktUrl: String?,
        val similarityReason: String?
    )

    suspend fun findSimilarPlayers(
        player: Player,
        languageCode: String = "en",
        options: SimilarPlayersOptions = SimilarPlayersOptions()
    ): Result<List<SimilarPlayerSuggestion>> =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.4f  // Slightly lower to reduce invented facts in similarityReason
                        responseMimeType = "application/json"
                        responseSchema = Schema.obj(
                            mapOf(
                                "similarPlayers" to Schema.array(
                                    Schema.obj(
                                        mapOf(
                                            "name" to Schema.string(),
                                            "position" to Schema.string(),
                                            "age" to Schema.string(),
                                            "marketValue" to Schema.string(),
                                            "similarityReason" to Schema.string()
                                        ),
                                        optionalProperties = listOf(
                                            "position", "age", "marketValue",
                                            "similarityReason"
                                        )
                                    )
                                )
                            )
                        )
                    }
                )

                val playerContext = buildPlayerContext(player)
                val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"
                val constraints = buildSimilarPlayersConstraints(player, options)
                val similarityFocus = buildSimilarityFocus(options.similarityMode)
                val exclusions = buildExclusions(player, options)
                val targetCount = options.count.coerceIn(5, 15)
                val requestCount = (targetCount + 3).coerceAtMost(15)  // Request extra; filter may drop some

                val transferValueRules = buildTransferValueRules(player)
                val prompt = """
                    You are the sporting director of a professional club. Your job: find REAL transfer opportunities — players you would actually sign.
                    
                    TASK: Suggest the top $requestCount similar players to the profile below. These must be players YOU would sign for your club. ${similarityFocus}
                    
                    TRANSFER VALUE RULES (non-negotiable):
                    $transferValueRules
                    
                    CRITICAL CONSTRAINTS:
                    $constraints
                    
                    $exclusions
                    
                    QUALITY BAR: Every suggestion must have REAL transfer potential. Consider: market value (must have resale/transfer value), age (younger = more upside; 33+ with no value = useless), playing style fit. No filler. No players past their prime with zero market value. Prioritize: similar position + similar value bracket + age-appropriate + style fit.
                    
                    FACTUAL ACCURACY: Base suggestions on profile data only. Do NOT invent facts. For similarityReason: reference position, style, value, age — never speculate about injuries or playing time.
                    
                    Player profile:
                    $playerContext
                    
                    Suggest exactly $requestCount players with a Transfermarkt profile. Full name EXACTLY as on Transfermarkt (e.g. "Lionel Messi" not "Messi"). No URLs. Active players 2024-2025.
                    
                    similarityReason: 1-2 sentences in $outputLanguage. Why this player is a real opportunity — position, value, age, style fit.
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text ?: return@withContext Result.failure(
                    IllegalStateException("Empty response from AI")
                )

                val rawSuggestions = parseSimilarPlayersResponse(text)
                val suggestions = verifyAndEnrichWithTransfermarkt(rawSuggestions, player, languageCode, options)
                Log.d(TAG, "findSimilarPlayers result: $suggestions")
                Result.success(suggestions)
            } catch (e: Exception) {
                Log.e(TAG, "findSimilarPlayers failed", e)
                Result.failure(e)
            }
        }

    /**
     * Generates a professional scout report for the player.
     * Report structure and focus depend on [options.reportType].
     */
    suspend fun generateScoutReport(
        player: Player,
        languageCode: String = "en",
        options: ScoutReportOptions = ScoutReportOptions()
    ): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.3f  // Lower = less creative, fewer factual errors
                        topP = 0.85f
                    }
                )
                val playerContext = buildPlayerContext(player)
                val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"
                val reportInstructions = buildScoutReportInstructions(options.reportType)

                val prompt = """
                    You are a senior football scout with 20+ years of experience at top European clubs. Your reports are used by sporting directors and recruitment teams for transfer decisions. Write with authority, precision, and tactical insight.
                    
                    TASK: Generate a professional scout report for the following player.
                    
                    $reportInstructions
                    
                    FACTUAL ACCURACY (non-negotiable — a pro scout never gets this wrong):
                    - Base the report ONLY on the data provided in the player profile below. You have NO other data.
                    - NEVER invent, assume, or infer: playing time, minutes played, injuries, career gaps, "hasn't played for X months/years", recent form, last season stats, or any fact not explicitly in the profile.
                    - If the profile does not mention playing time, injuries, or recent activity — do NOT write about them. Omit those sections entirely.
                    - When discussing strengths/weaknesses, base them on: position, age, height, foot, market value, club, contract, nationality. Use tactical reasoning, not invented facts.
                    - If uncertain about any fact, omit it. A wrong claim destroys credibility. "Data not available" is better than a false claim.
                    
                    Player profile (this is your ONLY data source — no other fields exist):
                    $playerContext
                    
                    Note: If a field is missing above (e.g. no contract, no description), do not invent it. Work with what is provided.
                    
                    Write the report in $outputLanguage. Use clear section headers where appropriate. Be specific about what the data shows. Avoid generic fluff. Your verdict should be actionable. Never fabricate facts.
                """.trimIndent()
                val response = model.generateContent(prompt)
                val text = response.text?.trim()
                if (text.isNullOrBlank()) {
                    return@withContext Result.failure(IllegalStateException("Empty response from AI"))
                }
                Log.d(TAG, "generateScoutReport: success, length=${text.length}")
                Result.success(text)
            } catch (e: Exception) {
                Log.e(TAG, "generateScoutReport failed", e)
                Result.failure(e)
            }
        }

    private fun buildPlayerContext(player: Player): String {
        val parts = mutableListOf<String>()
        player.fullName?.let { parts.add("Name: $it") }
        player.age?.let { parts.add("Age: $it") }
        player.positions?.filterNotNull()?.joinToString(", ")?.let { parts.add("Positions: $it") }
        player.height?.let { parts.add("Height: $it") }
        player.foot?.let { parts.add("Preferred foot: $it") }
        player.marketValue?.let { parts.add("Market value: $it") }
        player.marketValueHistory?.takeIf { it.isNotEmpty() }?.let { history ->
            val recent = history.takeLast(3).joinToString(" → ") { it.value ?: "?" }
            parts.add("Market value trend: $recent")
        }
        player.nationality?.let { parts.add("Nationality: $it") }
        player.currentClub?.clubName?.let { parts.add("Current club: $it") }
        player.currentClub?.clubCountry?.let { parts.add("Club country/league: $it") }
        player.contractExpired?.let { parts.add("Contract: $it") }
        player.isOnLoan?.takeIf { it }?.let { parts.add("On loan: yes") }
        player.agency?.let { parts.add("Agency: $it") }
        player.description?.takeIf { it.isNotBlank() }?.let { parts.add("Description: $it") }
        player.tmProfile?.let { parts.add("Transfermarkt: $it") }
        return parts.joinToString("\n")
    }

    private fun buildSimilarityFocus(mode: SimilarPlayersOptions.SimilarityMode): String =
        when (mode) {
            SimilarPlayersOptions.SimilarityMode.PLAYING_STYLE ->
                "PRIORITY: Playing style and technical profile. But every suggestion must still have transfer value and be age-appropriate."
            SimilarPlayersOptions.SimilarityMode.MARKET_VALUE ->
                "PRIORITY: Similar market value bracket — real alternatives in negotiations. Same position, similar age."
            SimilarPlayersOptions.SimilarityMode.POSITION_PROFILE ->
                "PRIORITY: Same position and tactical role. Must have transfer value and be age-appropriate."
            SimilarPlayersOptions.SimilarityMode.ALL_ROUND ->
                "PRIORITY: Balanced — position, market value, age, and style. Real opportunities only."
        }

    private fun buildSimilarPlayersConstraints(player: Player, options: SimilarPlayersOptions): String {
        val lines = mutableListOf<String>()
        when (options.ageRange) {
            SimilarPlayersOptions.AgeRangePreference.STRICT -> buildAgeRangeConstraint(player)?.let { lines.add(it) }
            SimilarPlayersOptions.AgeRangePreference.RELAXED -> {
                val age = player.age?.toIntOrNull()
                if (age != null) {
                    val min = (age - 5).coerceAtLeast(16)
                    val max = age + 5
                    lines.add("Age range: $min–$max years (relaxed ±5 from player age $age)")
                }
            }
            SimilarPlayersOptions.AgeRangePreference.ANY -> lines.add("Age: no restriction")
        }
        buildMarketValueRangeConstraint(player)?.let { lines.add(it) }
        buildPositionConstraint(player)?.let { lines.add(it) }
        return lines.joinToString("\n").ifBlank { "None specified." }
    }

    /** Rules to avoid suggesting players with no transfer value (33+ with €0, etc.). */
    private fun buildTransferValueRules(player: Player): String {
        val valueStr = player.marketValue
        val valueDouble = valueStr?.toMarketValueDouble() ?: 0.0
        return """
            - NEVER suggest players aged 33 or older with zero or negligible market value (under €200k). They have no transfer value.
            - NEVER suggest players with zero market value — they are not real transfer opportunities.
            - Every player must have meaningful market value (minimum €100k unless the source player is in that range).
            - Players 30+ must have at least €200k value to be worth considering.
            - Prioritize players with resale potential: younger, or established value in a similar bracket to the source (${valueStr ?: "see profile"}).
        """.trimIndent()
    }

    private fun buildExclusions(player: Player, options: SimilarPlayersOptions): String {
        val lines = mutableListOf<String>()
        if (options.excludeSameClub) {
            player.currentClub?.clubName?.let { club ->
                lines.add("EXCLUDE: Players from $club (same club).")
            }
        }
        if (options.excludeSameLeague) {
            player.currentClub?.clubCountry?.let { country ->
                lines.add("EXCLUDE: Players from the same league/country ($country) when possible.")
            }
        }
        return lines.joinToString("\n").ifBlank { "" }
    }

    private fun buildScoutReportInstructions(type: ScoutReportOptions.ScoutReportType): String =
        when (type) {
            ScoutReportOptions.ScoutReportType.EXECUTIVE_SUMMARY ->
                """
                FORMAT: Executive summary (1–2 paragraphs).
                - Key strengths (2–3 bullet points)
                - Main weakness or area to improve
                - Verdict: recommend / monitor / pass, with one-line rationale
                Keep it punchy. Decision-makers read this in 30 seconds.
                """.trimIndent()
            ScoutReportOptions.ScoutReportType.FULL_TACTICAL ->
                """
                FORMAT: Full tactical scout report.
                - Executive summary (2–3 sentences)
                - Strengths: technical, physical, tactical — infer from position, height, foot, style; do NOT invent match stats or playing time
                - Weaknesses: areas of concern based on profile (e.g. age, contract) — never assume injuries or form
                - Tactical fit: best system, role, instructions
                - Tendencies: movement, decision-making — based on position and role only
                - Market value assessment: from profile data
                - Transfer suitability: ideal buyer profile, contract context
                - Final recommendation with clear action
                Use section headers. 4–6 paragraphs total. Pro-grade detail. Every claim must be traceable to the profile.
                """.trimIndent()
            ScoutReportOptions.ScoutReportType.TRANSFER_RECOMMENDATION ->
                """
                FORMAT: Transfer-focused report.
                - Current value and contract context (from profile only)
                - Transfer market positioning (comparable deals)
                - Suitability: who should buy, why, at what price
                - Risk factors: ONLY mention contract length, loan status, or value trend if in the profile. Do NOT mention injury or form unless explicitly in the data.
                - Recommendation: buy / negotiate / pass, with price range if relevant
                Focus on what sporting directors need. Base everything on profile data only.
                """.trimIndent()
            ScoutReportOptions.ScoutReportType.YOUTH_POTENTIAL ->
                """
                FORMAT: Youth development / potential report.
                - Current level and ceiling (from age, position, value, club)
                - Development trajectory and key growth areas (tactical reasoning, not invented stats)
                - Comparison to similar profiles at same age
                - Best environment for development (club type, league)
                - Timeline to first-team readiness (age-based reasoning only)
                Focus on potential from profile data. Do NOT invent minutes, appearances, or form.
                """.trimIndent()
        }

    /** Age range: ±2 years. E.g. 28 → 26–30. */
    private fun buildAgeRangeConstraint(player: Player): String? {
        val age = player.age?.toIntOrNull() ?: return null
        val minAge = (age - 2).coerceAtLeast(16)
        val maxAge = age + 2
        return "Age range: $minAge–$maxAge years (player is $age, so suggest only players aged $minAge to $maxAge)"
    }

    /** Market value range: ±€100k for values under €500k, ±20% for higher. E.g. €300k → €200k–€400k. */
    private fun buildMarketValueRangeConstraint(player: Player): String? {
        val valueStr = player.marketValue ?: return null
        val valueDouble = valueStr.toMarketValueDouble()
        if (valueDouble <= 0) return null
        val (minVal, maxVal) = when {
            valueDouble < 500_000 -> Pair(valueDouble - 100_000, valueDouble + 100_000)
            else -> {
                val delta = (valueDouble * 0.2).coerceAtLeast(100_000.0)
                Pair(valueDouble - delta, valueDouble + delta)
            }
        }
        val minStr = formatMarketValue(minVal.coerceAtLeast(0.0))
        val maxStr = formatMarketValue(maxVal)
        return "Market value range: $minStr–$maxStr (player valued $valueStr, so suggest only players within this value range)"
    }

    private fun String.toMarketValueDouble(): Double {
        val lower = this.lowercase().trim().removePrefix("€").replace(",", "")
        return when {
            lower.endsWith("k") -> lower.removeSuffix("k").toDoubleOrNull()?.times(1_000) ?: 0.0
            lower.endsWith("m") -> lower.removeSuffix("m").toDoubleOrNull()?.times(1_000_000) ?: 0.0
            else -> lower.toDoubleOrNull() ?: 0.0
        }
    }

    private fun formatMarketValue(value: Double): String =
        when {
            value >= 1_000_000 -> "€${(value / 1_000_000).let { if (it == it.toLong().toDouble()) it.toLong() else it }}M"
            value >= 1_000 -> "€${(value / 1_000).toInt()}k"
            else -> "€${value.toInt()}"
        }

    /** Position constraint: suggest only players in the same position group. Uses: GK, CB, LB, RB, DM, CM, AM, RW, LW, CF, ST, RM, LM. */
    private fun buildPositionConstraint(player: Player): String? {
        val positions = player.positions?.filterNotNull()?.map { normalizePositionToCode(it) }?.toSet() ?: return null
        if (positions.isEmpty()) return null
        val groups = mutableListOf<String>()
        if (positions.any { it == "GK" }) groups.add("goalkeeper (GK)")
        if (positions.any { it in setOf("CB", "LB", "RB") }) groups.add("defender (CB, LB, RB)")
        if (positions.any { it in setOf("LW", "RW", "LM", "RM") }) groups.add("winger (LW, RW, LM, RM)")
        if (positions.any { it in setOf("ST", "CF", "SS") }) groups.add("striker (ST, CF)")
        if (positions.any { it in setOf("CM", "DM", "AM") }) groups.add("midfielder (CM, DM, AM)")
        if (groups.isEmpty()) return null
        return "Position: suggest ONLY players who play in the same role: ${groups.joinToString(" or ")}. NEVER suggest defenders when the player is a winger, or wingers when the player is a defender, etc."
    }

    /**
     * For each AI suggestion: search Transfermarkt directly (TM-first, no web research).
     * Uses TM data for market value, age, positions. Filters by constraints from options.
     * Progressive relaxation: if strict filter yields 0 results, retry with relaxed filters.
     */
    private suspend fun verifyAndEnrichWithTransfermarkt(
        rawSuggestions: List<SimilarPlayerSuggestion>,
        sourcePlayer: Player,
        languageCode: String,
        options: SimilarPlayersOptions = SimilarPlayersOptions()
    ): List<SimilarPlayerSuggestion> {
        val sourceAge = sourcePlayer.age?.toIntOrNull()
        val sourceValueDouble = sourcePlayer.marketValue?.toMarketValueDouble() ?: 0.0
        val (minValue, maxValue) = computeMarketValueRange(sourceValueDouble)
        val sourcePositionGroups = getSourcePositionGroups(sourcePlayer)
        val ageDelta = when (options.ageRange) {
            SimilarPlayersOptions.AgeRangePreference.STRICT -> 2
            SimilarPlayersOptions.AgeRangePreference.RELAXED -> 5
            SimilarPlayersOptions.AgeRangePreference.ANY -> Int.MAX_VALUE
        }
        val enriched = rawSuggestions.mapNotNull { suggestion ->
            val tmProfile = findBestMatchingProfile(suggestion.name)
            if (tmProfile != null) {
                suggestion.copy(
                    name = tmProfile.fullName ?: suggestion.name,
                    position = tmProfile.positions?.filterNotNull()?.joinToString(", ")?.takeIf { it.isNotBlank() }
                        ?: tmProfile.positions?.firstOrNull()?.takeIf { it.isNotBlank() },
                    age = tmProfile.age,
                    marketValue = tmProfile.marketValue,
                    transfermarktUrl = tmProfile.tmProfile?.takeIf { it.contains("/profil/spieler/", ignoreCase = true) }
                )
            } else {
                null
            }
        }
        // Filter: constraints + transfer value (no 33+ with €0, no zero-value players)
        var result = enriched.filter {
            hasTransferValue(it) && meetsConstraints(it, sourceAge, minValue, maxValue, sourcePositionGroups, ageDelta)
        }
        if (result.isEmpty() && enriched.isNotEmpty()) {
            Log.d(TAG, "Strict filter yielded 0 results; retrying with relaxed constraints")
            result = enriched.filter {
                hasTransferValue(it) && meetsConstraintsRelaxed(it, sourceAge, minValue, maxValue, sourcePositionGroups)
            }
        }
        // If still empty, allow low-value but never 33+ with €0
        if (result.isEmpty() && enriched.isNotEmpty()) {
            result = enriched.filter { hasTransferValue(it) }
        }
        val targetCount = options.count.coerceIn(5, 15)
        result = result.take(targetCount)
        result.forEach { Log.d(TAG, "Similar player: ${it.name} age=${it.age} value=${it.marketValue} pos=${it.position}") }
        return result
    }

    /** Exclude players with no transfer value: 33+ with €0/low value, or zero value. */
    private fun hasTransferValue(suggestion: SimilarPlayerSuggestion): Boolean {
        val value = suggestion.marketValue?.toMarketValueDouble() ?: 0.0
        val age = suggestion.age?.toIntOrNull()
        if (value <= 0) return false  // No market value = not a real opportunity
        if (age != null && age >= 33 && value < 200_000) return false  // 33+ with <€200k = useless on TM
        return true
    }

    private fun meetsConstraints(
        suggestion: SimilarPlayerSuggestion,
        sourceAge: Int?,
        minValue: Double,
        maxValue: Double,
        sourcePositionGroups: Set<String>,
        ageDelta: Int = 2
    ): Boolean {
        if (ageDelta < Int.MAX_VALUE) {
            sourceAge?.let { age ->
                val suggestionAge = suggestion.age?.toIntOrNull() ?: return@meetsConstraints false
                if (suggestionAge < (age - ageDelta) || suggestionAge > (age + ageDelta)) return false
            }
        }
        val suggestionValue = suggestion.marketValue?.toMarketValueDouble() ?: 0.0
        if (minValue > 0 && maxValue > 0 && (suggestionValue < minValue || suggestionValue > maxValue)) return false
        if (sourcePositionGroups.isNotEmpty()) {
            if (!positionsOverlap(sourcePositionGroups, suggestion.position)) return false
        }
        return true
    }

    /** Relaxed: age ±5, value ±50%, position optional. Used when strict filter yields 0. */
    private fun meetsConstraintsRelaxed(
        suggestion: SimilarPlayerSuggestion,
        sourceAge: Int?,
        minValue: Double,
        maxValue: Double,
        sourcePositionGroups: Set<String>
    ): Boolean {
        sourceAge?.let { age ->
            val suggestionAge = suggestion.age?.toIntOrNull() ?: return true // No age data - allow
            if (suggestionAge < (age - 5) || suggestionAge > (age + 5)) return false
        }
        val suggestionValue = suggestion.marketValue?.toMarketValueDouble() ?: 0.0
        if (minValue > 0 && maxValue > 0 && suggestionValue > 0) {
            val relaxedMin = minValue * 0.5
            val relaxedMax = maxValue * 2.0
            if (suggestionValue < relaxedMin || suggestionValue > relaxedMax) return false
        }
        if (sourcePositionGroups.isNotEmpty()) {
            if (!positionsOverlap(sourcePositionGroups, suggestion.position)) return false
        }
        return true
    }

    private fun computeMarketValueRange(sourceValue: Double): Pair<Double, Double> =
        when {
            sourceValue <= 0 -> Pair(0.0, Double.MAX_VALUE)
            sourceValue < 500_000 -> Pair((sourceValue - 100_000).coerceAtLeast(0.0), sourceValue + 100_000)
            else -> {
                val delta = (sourceValue * 0.2).coerceAtLeast(100_000.0)
                Pair(sourceValue - delta, sourceValue + delta)
            }
        }

    /** Position codes per user spec: GK, CB, LB, RB, DM, CM, AM, RW, LW, CF, ST, RM, LM */
    private fun normalizePositionToCode(raw: String): String {
        val upper = raw.uppercase().trim()
        return when {
            upper == "GK" || upper.contains("GOALKEEPER") -> "GK"
            upper == "CB" || upper.contains("CENTRE BACK") || upper.contains("CENTER BACK") -> "CB"
            upper == "LB" || upper.contains("LEFT BACK") -> "LB"
            upper == "RB" || upper.contains("RIGHT BACK") -> "RB"
            upper == "DM" || upper.contains("DEFENSIVE MIDFIELD") -> "DM"
            upper == "CM" || upper.contains("CENTRAL MIDFIELD") || upper.contains("CENTRE MIDFIELD") -> "CM"
            upper == "AM" || upper.contains("ATTACKING MIDFIELD") -> "AM"
            upper == "RW" || upper.contains("RIGHT WINGER") -> "RW"
            upper == "LW" || upper.contains("LEFT WINGER") -> "LW"
            upper == "CF" || upper.contains("CENTRE FORWARD") || upper.contains("CENTER FORWARD") -> "CF"
            upper == "ST" || upper.contains("STRIKER") -> "ST"
            upper == "RM" || upper.contains("RIGHT MIDFIELD") -> "RM"
            upper == "LM" || upper.contains("LEFT MIDFIELD") -> "LM"
            upper == "SS" || upper.contains("SECOND STRIKER") -> "SS"
            else -> upper
        }
    }

    private fun getSourcePositionGroups(player: Player): Set<String> {
        val positions = player.positions?.filterNotNull()?.map { normalizePositionToCode(it) }?.toSet() ?: return emptySet()
        val groups = mutableSetOf<String>()
        if (positions.any { it == "GK" }) groups.add("GK")
        if (positions.any { it in setOf("CB", "LB", "RB") }) groups.add("defender")
        if (positions.any { it in setOf("LW", "RW", "LM", "RM") }) groups.add("winger")
        if (positions.any { it in setOf("ST", "CF", "SS") }) groups.add("striker")
        if (positions.any { it in setOf("CM", "DM", "AM") }) groups.add("midfielder")
        return groups
    }

    private fun positionsOverlap(sourceGroups: Set<String>, suggestionPositionRaw: String?): Boolean {
        if (suggestionPositionRaw.isNullOrBlank()) return true // No position data - don't filter out
        val codes = suggestionPositionRaw
            .split(",")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .map { normalizePositionToCode(it) }
            .filter { it.isNotBlank() }
            .toSet()
        if (codes.isEmpty()) return true
        return sourceGroups.any { group ->
            when (group) {
                "GK" -> codes.contains("GK")
                "defender" -> codes.any { it in setOf("CB", "LB", "RB") }
                "winger" -> codes.any { it in setOf("LW", "RW", "LM", "RM") }
                "striker" -> codes.any { it in setOf("ST", "CF", "SS") }
                "midfielder" -> codes.any { it in setOf("CM", "DM", "AM") }
                else -> false
            }
        }
    }

    /**
     * Search Transfermarkt, fetch full profiles, return best name match.
     * Tries "Firstname Lastname" first; if no results, tries "Lastname Firstname".
     */
    private suspend fun findBestMatchingProfile(playerName: String): TransfermarktPlayerDetails? = withContext(Dispatchers.IO) {
        when (val result = playerSearch.getSearchResults(playerName)) {
            is TransfermarktResult.Success -> {
                val candidates = result.data.filter { it.tmProfile?.contains("/profil/spieler/", ignoreCase = true) == true }
                if (candidates.isNotEmpty()) {
                    pickBestMatch(playerName, candidates)
                } else {
                    val swapped = swapNameOrder(playerName)
                    if (swapped != playerName) {
                        when (val retry = playerSearch.getSearchResults(swapped)) {
                            is TransfermarktResult.Success -> {
                                val retryCandidates = retry.data.filter { it.tmProfile?.contains("/profil/spieler/", ignoreCase = true) == true }
                                if (retryCandidates.isNotEmpty()) pickBestMatch(playerName, retryCandidates) else null
                            }
                            is TransfermarktResult.Failed -> null
                        }
                    } else null
                }
            }
            is TransfermarktResult.Failed -> {
                val swapped = swapNameOrder(playerName)
                if (swapped != playerName) {
                    when (val retry = playerSearch.getSearchResults(swapped)) {
                        is TransfermarktResult.Success -> {
                            val candidates = retry.data.filter { it.tmProfile?.contains("/profil/spieler/", ignoreCase = true) == true }
                            pickBestMatch(playerName, candidates)
                        }
                        is TransfermarktResult.Failed -> null
                    }
                } else null
            }
        }
    }

    private fun swapNameOrder(name: String): String {
        val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        return if (parts.size >= 2) "${parts.last()} ${parts.dropLast(1).joinToString(" ")}" else name
    }

    private suspend fun pickBestMatch(playerName: String, candidates: List<PlayerSearchModel>): TransfermarktPlayerDetails? {
        val scored = candidates.take(5).mapNotNull { searchModel ->
            try {
                val details = playerSearch.getPlayerBasicInfo(searchModel)
                details to computeNameMatchScore(playerName, details)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to fetch profile for ${searchModel.playerName}", e)
                null
            }
        }
        return scored.maxByOrNull { it.second }?.first ?: candidates.firstOrNull()?.let {
            try { playerSearch.getPlayerBasicInfo(it) } catch (_: Exception) { null }
        }
    }

    private fun computeNameMatchScore(expectedName: String, profile: TransfermarktPlayerDetails): Int {
        val profileName = profile.fullName?.lowercase() ?: ""
        val expectedLower = expectedName.lowercase()
        if (profileName == expectedLower) return 100
        if (profileName.contains(expectedLower) || expectedLower.contains(profileName)) return 80
        val expectedParts = expectedLower.split(Regex("\\s+")).filter { it.length > 2 }
        val matchCount = expectedParts.count { profileName.contains(it) }
        return when {
            matchCount == expectedParts.size -> 70
            matchCount >= 1 -> 50
            else -> 20
        }
    }

    private fun parseSimilarPlayersResponse(jsonText: String): List<SimilarPlayerSuggestion> {
        return try {
            val json = JSONObject(jsonText)
            val array = json.optJSONArray("similarPlayers") ?: return emptyList()
            val list = mutableListOf<SimilarPlayerSuggestion>()
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                list.add(
                    SimilarPlayerSuggestion(
                        name = obj.optString("name", "").takeIf { it.isNotBlank() } ?: "Unknown",
                        position = obj.optString("position", "").takeIf { it.isNotBlank() },
                        age = obj.optString("age", "").takeIf { it.isNotBlank() },
                        marketValue = obj.optString("marketValue", "").takeIf { it.isNotBlank() },
                        transfermarktUrl = null, // Will be verified via Transfermarkt search
                        similarityReason = obj.optString("similarityReason", "").takeIf { it.isNotBlank() }
                    )
                )
            }
            list
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse AI response: $jsonText", e)
            emptyList()
        }
    }
}
