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

    suspend fun findSimilarPlayers(player: Player, languageCode: String = "en"): Result<List<SimilarPlayerSuggestion>> =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
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
                val ageConstraint = buildAgeRangeConstraint(player)
                val valueConstraint = buildMarketValueRangeConstraint(player)
                val positionConstraint = buildPositionConstraint(player)
                val constraints = listOfNotNull(ageConstraint, valueConstraint, positionConstraint)
                    .joinToString("\n")
                    .ifBlank { "Consider age (±2 years), positions (same role), and market value range when suggesting similar players." }
                val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"
                val prompt = """
                    You are a football scout assistant. Find 8-12 similar professional football (soccer) players to this player.
                    
                    Player profile:
                    $playerContext
                    
                    STRICT REQUIREMENTS (you MUST follow these):
                    $constraints
                    
                    CRITICAL: Suggest ONLY players who have a profile on Transfermarkt.com. Prefer well-known players from top leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, etc.) or established national team players. Avoid obscure players from lower divisions who may not be on Transfermarkt.
                    For each player, provide the full name EXACTLY as it appears on Transfermarkt (e.g. "Lionel Messi" not "Messi"). Use standard spelling.
                    Do NOT provide URLs. Focus on current active players (2024-2025 season).
                    
                    IMPORTANT: Write the similarityReason field in $outputLanguage. The app language is $outputLanguage.
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text ?: return@withContext Result.failure(
                    IllegalStateException("Empty response from AI")
                )

                val rawSuggestions = parseSimilarPlayersResponse(text)
                val suggestions = verifyAndEnrichWithTransfermarkt(rawSuggestions, player, languageCode)
                Log.d(TAG, "findSimilarPlayers result: $suggestions")
                Result.success(suggestions)
            } catch (e: Exception) {
                Log.e(TAG, "findSimilarPlayers failed", e)
                Result.failure(e)
            }
        }

    /**
     * Generates a short, strong, targeted scout report for the player.
     */
    suspend fun generateScoutReport(player: Player, languageCode: String = "en"): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash"
                )
                val playerContext = buildPlayerContext(player)
                val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"
                val prompt = """
                    You are one of the best football scouts in the world with 20 years of experience behind you. You have the most updated data and analysis tools to assess players.
                    
                    Generate a short, strong and aim-to-target scout report on the following player. Include everything clubs need to know about him.
                    
                    Player profile:
                    $playerContext
                    
                    Write the report in $outputLanguage. Keep it concise but impactful (2-4 paragraphs). Focus on strengths, playing style, market value context, and transfer suitability.
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
        player.marketValue?.let { parts.add("Market value: $it") }
        player.nationality?.let { parts.add("Nationality: $it") }
        player.currentClub?.clubName?.let { parts.add("Current club: $it") }
        player.description?.takeIf { it.isNotBlank() }?.let { parts.add("Description: $it") }
        player.tmProfile?.let { parts.add("Transfermarkt: $it") }
        return parts.joinToString("\n")
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
     * Uses TM data for market value, age, positions. Filters by constraints.
     * Progressive relaxation: if strict filter yields 0 results, retry with relaxed filters.
     */
    private suspend fun verifyAndEnrichWithTransfermarkt(
        rawSuggestions: List<SimilarPlayerSuggestion>,
        sourcePlayer: Player,
        languageCode: String
    ): List<SimilarPlayerSuggestion> {
        val sourceAge = sourcePlayer.age?.toIntOrNull()
        val sourceValueDouble = sourcePlayer.marketValue?.toMarketValueDouble() ?: 0.0
        val (minValue, maxValue) = computeMarketValueRange(sourceValueDouble)
        val sourcePositionGroups = getSourcePositionGroups(sourcePlayer)
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
        var result = enriched.filter { meetsConstraints(it, sourceAge, minValue, maxValue, sourcePositionGroups) }
        if (result.isEmpty() && enriched.isNotEmpty()) {
            Log.d(TAG, "Strict filter yielded 0 results; retrying with relaxed constraints")
            result = enriched.filter { meetsConstraintsRelaxed(it, sourceAge, minValue, maxValue, sourcePositionGroups) }
        }
        result.forEach { Log.d(TAG, "Similar player: ${it.name} age=${it.age} value=${it.marketValue} pos=${it.position}") }
        return result
    }

    private fun meetsConstraints(
        suggestion: SimilarPlayerSuggestion,
        sourceAge: Int?,
        minValue: Double,
        maxValue: Double,
        sourcePositionGroups: Set<String>
    ): Boolean {
        sourceAge?.let { age ->
            val suggestionAge = suggestion.age?.toIntOrNull() ?: return@meetsConstraints false
            if (suggestionAge < (age - 2) || suggestionAge > (age + 2)) return false
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
