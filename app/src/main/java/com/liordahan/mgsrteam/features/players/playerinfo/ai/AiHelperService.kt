package com.liordahan.mgsrteam.features.players.playerinfo.ai

import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.transfermarket.ClubSquadValueFetcher
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
    private val playerSearch: PlayerSearch,
    private val clubSquadValueFetcher: ClubSquadValueFetcher
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

    /**
     * Result of AI hidden gem analysis for a player.
     * Score 0-100: potential as undervalued/hidden gem.
     */
    data class HiddenGemResult(
        val score: Int,
        val reason: String?
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
                val leagueLevelHint = buildLeagueLevelHint(player)
                val prompt = """
                    You are a CHIEF SCOUT with 25+ years at top clubs. Your recommendations define transfer windows. You are creative, experienced, and ruthless about relevance. You never present irrelevant players.
                    
                    TASK: Suggest the top $requestCount TRULY SIMILAR players to the profile below. Every suggestion must pass your bar: "Would I present this to my sporting director as a real alternative?" If not — do not suggest.
                    
                    RELEVANCE IS NON-NEGOTIABLE:
                    - SAME POSITION: Only players who play the EXACT same role (e.g. LW with LW, CF with CF, DM with DM). A DM is NOT similar to an AM. A LW is NOT similar to a CF. No "he can play there" — he must play there regularly.
                    - SIMILAR VALUE: Within the value bracket. No stars from top-5 leagues when the source is €300k. No unknowns when the source is €2m.
                    - SIMILAR AGE: Respect the age constraint. A 22-year-old is not similar to a 30-year-old.
                    - COMPARABLE LEAGUE LEVEL: CRITICAL. A player from Israeli Ligat Ha'Al (€100k–€2m) should be matched with players from similar leagues: Polish Ekstraklasa, Greek Super League, Austrian Bundesliga, Belgian Pro League, Scandinavian leagues, etc. NEVER suggest a La Liga or Premier League starter for a €400k Israeli league player. League level must match.
                    
                    ${similarityFocus}
                    
                    TRANSFER VALUE RULES (non-negotiable):
                    $transferValueRules
                    
                    $leagueLevelHint
                    
                    CRITICAL CONSTRAINTS:
                    $constraints
                    
                    $exclusions
                    
                    CHIEF SCOUT BAR: Only suggest players you would stake your reputation on. No filler. No "close enough." Every name must be a genuine comparable — same position, similar value, similar level. Quality over quantity.
                    
                    FACTUAL ACCURACY: Base suggestions on profile data only. Do NOT invent facts. similarityReason: reference position, value, age — never speculate.
                    
                    Player profile:
                    $playerContext
                    
                    Suggest exactly $requestCount players. Full name EXACTLY as on Transfermarkt. No URLs. Active players 2024-2025.
                    
                    similarityReason: 1-2 sentences in $outputLanguage. Why this player is a REAL comparable — position, value, age, level fit.
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
     * Finds players from the open market (Transfermarkt) that match a club request.
     * Considers: club, league/country, position, age, salary range, transfer fee, foot.
     * Excludes players already in the roster.
     */
    suspend fun findPlayersForRequest(
        request: Request,
        excludeTmProfileUrls: Set<String>,
        languageCode: String = "en"
    ): Result<List<SimilarPlayerSuggestion>> =
        withContext(Dispatchers.IO) {
            try {
                val (minValue, maxValue) = transferFeeToMarketValueRange(request.transferFee)
                val positionGroups = request.position?.let { getPositionGroupsFromCode(it) } ?: emptySet()
                val salaryEuros = request.salaryRange?.let { salaryRangeToEuros(it) }
                Log.d(TAG, """
                    |findPlayersForRequest PARAMS:
                    |  clubName=${request.clubName}
                    |  clubCountry=${request.clubCountry}
                    |  position=${request.position} (groups=$positionGroups)
                    |  age: min=${request.minAge}, max=${request.maxAge}, doesntMatter=${request.ageDoesntMatter}
                    |  salaryRange=${request.salaryRange} -> $salaryEuros
                    |  transferFee=${request.transferFee} -> marketValue €${minValue.toInt()}-€${if (maxValue == Double.MAX_VALUE) "∞" else maxValue.toInt()}${if (request.transferFee?.lowercase()?.contains("free") == true) " (free: uses club squad avg±200k)" else ""}
                    |  dominateFoot=${request.dominateFoot}
                    |  notes=${request.notes}
                    |  excludeRosterCount=${excludeTmProfileUrls.size}
                    |  languageCode=$languageCode
                """.trimMargin())

                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.4f
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

                val requestContext = buildRequestContext(request)
                val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"
                val excludeHint = if (excludeTmProfileUrls.isNotEmpty()) {
                    "CRITICAL: Do NOT suggest players already in the requester's roster. Only suggest players from OTHER clubs who could be signed."
                } else ""
                val leagueExclusionHint = request.clubCountry?.takeIf { it.isNotBlank() }?.let { country ->
                    """
                    SCOUTING VALUE — SAME LEAGUE/COUNTRY EXCLUSION:
                    Do NOT suggest players from the same league or country as the request ($country). The requester can find those players themselves. Your job is to surface players from OTHER leagues and countries — hidden gems, international options, players from different markets. This is the real value of professional scouting. Every suggestion MUST be from a different league/country.
                    """.trimIndent()
                } ?: ""
                val freeHint = if (request.transferFee?.trim()?.lowercase() == "free/free loan") {
                    """
                    FREE TRANSFER: Do NOT suggest low-value players (0-150k). Instead: suggest players with market value similar to ${request.clubName}'s current squad level. Prioritize (a) players whose value fits the club's typical squad value, and (b) players whose contract ends soon with value ±200k of the squad average.
                    """.trimIndent()
                } else ""

                val prompt = """
                    You are a TOP-TIER football scout (Barcelona/Real Madrid level). Accuracy is non-negotiable. Every suggestion will be verified against Transfermarkt; displayed stats (age, market value, position) come from that verification. Your job: suggest players who precisely fit the request.
                    
                    TASK: Perform a full scouting analysis. Suggest 10-12 players who match ALL criteria. Each player will be verified via Transfermarkt — we fetch their REAL age, market value, position, and history. Only suggest players you are confident exist and fit.
                    
                    REQUEST PROFILE:
                    $requestContext
                    
                    $excludeHint
                    $leagueExclusionHint
                    $freeHint
                    
                    FULL SCOUTING CRITERIA — match ALL that apply:
                    - Position: Exact or compatible for the role. Tactical fit: can they play the position in the requested system?
                    - Age: Within requested range
                    - Transfer fee / Market value: Must fit the club's budget
                    - Salary: Wage level aligns with range (values in thousands)
                    - Preferred foot: Match if specified
                    - Club & League: Players from OTHER countries/leagues only — NOT from ${request.clubCountry ?: "the request's country"}. Same level or below in terms of club stature.
                    - Notes: Fit any playing style or experience requirements
                    - Technical profile: Suggest players who fit the club's typical level — technical, positional play, press resistance where relevant
                    
                    CRITICAL — similarityReason RULES:
                    - NEVER include specific numbers: no € amounts, no ages, no market values.
                    - We display verified Transfermarkt data (age, value, position) — your description must NOT repeat or invent stats.
                    - similarityReason: 1-2 sentences in $outputLanguage — QUALITATIVE ONLY. Explain WHY they fit (position fit, value bracket fit, club level fit, playing style). Example: "Fits CF role, value bracket aligns with budget, suitable for Polish league level."
                    
                    ACCURACY: You are a top scout. Suggest only players whose names are EXACTLY as on Transfermarkt. No invented stats. No guesswork.
                    
                    RULES:
                    - Full name EXACTLY as on Transfermarkt. No URLs. Active players 2024-2025.
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text ?: return@withContext Result.failure(
                    IllegalStateException("Empty response from AI")
                )

                val rawSuggestions = parseSimilarPlayersResponse(text)
                Log.d(TAG, "findPlayersForRequest: AI returned ${rawSuggestions.size} raw suggestions")
                val suggestions = verifyAndEnrichForRequest(
                    rawSuggestions = rawSuggestions,
                    request = request,
                    excludeUrls = excludeTmProfileUrls
                )
                Log.d(TAG, "findPlayersForRequest result: ${suggestions.size} players for ${request.clubName}")
                Result.success(suggestions)
            } catch (e: Exception) {
                Log.e(TAG, "findPlayersForRequest failed", e)
                Result.failure(e)
            }
        }

    /** Converts salary range (e.g. "11-15") to euros: 11 = €11,000. */
    private fun salaryRangeToEuros(range: String): String {
        val r = range.trim()
        return when {
            r.startsWith(">") -> {
                val n = r.removePrefix(">").toIntOrNull() ?: return range
                ">€${n * 1000}"
            }
            r.endsWith("+") -> {
                val n = r.removeSuffix("+").toIntOrNull() ?: return range
                "€${n * 1000}+"
            }
            r.contains("-") -> {
                val (a, b) = r.split("-").map { it.trim().toIntOrNull() ?: 0 }
                "€${a * 1000}-€${b * 1000}"
            }
            else -> "€${r.toIntOrNull()?.times(1000) ?: 0}"
        }
    }

    private fun buildRequestContext(request: Request): String {
        val parts = mutableListOf<String>()
        request.clubName?.let { parts.add("Club: $it") }
        request.clubCountry?.let { parts.add("Club country/league: $it") }
        request.position?.let { parts.add("Position: $it") }
        when {
            request.ageDoesntMatter == true -> parts.add("Age: any")
            request.minAge != null && request.maxAge != null -> parts.add("Age: ${request.minAge}-${request.maxAge}")
            else -> {}
        }
        request.dominateFoot?.takeIf { it.isNotBlank() }?.let { parts.add("Preferred foot: $it") }
        request.salaryRange?.takeIf { it.isNotBlank() }?.let { parts.add("Salary range: ${salaryRangeToEuros(it)}") }
        request.transferFee?.takeIf { it.isNotBlank() }?.let { parts.add("Transfer fee / market value: $it") }
        request.notes?.takeIf { it.isNotBlank() }?.let { parts.add("Notes: $it") }
        return parts.joinToString("\n")
    }

    /** Removes AI-invented stats from similarityReason to avoid conflicts with verified Transfermarkt data. */
    private fun sanitizeSimilarityReason(
        reason: String?,
        verifiedAge: String?,
        verifiedValue: String?
    ): String? {
        if (reason.isNullOrBlank()) return null
        val hasInventedStats = Regex("""€[\d.]|million|מיליון|אירו\s*\d|years?\s*(old|\d+)|בגיל\s*\d+|ערך שוק.*\d|market value of""", RegexOption.IGNORE_CASE)
            .containsMatchIn(reason)
        return if (hasInventedStats) null else reason
    }

    /** When source is from Israeli/similar league or low value, exclude suggestions from top-5 leagues. */
    private fun shouldExcludeTop5LeaguesForSimilar(sourceCountry: String?, sourceValue: Double): Boolean {
        val country = sourceCountry?.trim()?.lowercase() ?: return false
        if (country.contains("israel") || country.contains("poland") || country.contains("greece") ||
            country.contains("austria") || country.contains("belgium") || country.contains("scandinav") ||
            country.contains("czech") || country.contains("croatia") || country.contains("cyprus")) return true
        return sourceValue < 500_000
    }

    private fun isTop5League(country: String?): Boolean {
        val c = country?.trim()?.lowercase() ?: return false
        return c.contains("spain") || c.contains("england") || c.contains("italy") ||
            c.contains("germany") || c.contains("france") || c.contains("la liga") ||
            c.contains("premier league") || c.contains("serie a") || c.contains("bundesliga") || c.contains("ligue 1")
    }

    /** Returns true if player's club country matches request country (same league/country — exclude). */
    private fun isSameLeagueOrCountry(requestCountry: String?, playerClubCountry: String?): Boolean {
        val req = requestCountry?.trim()?.lowercase()?.takeIf { it.isNotBlank() } ?: return false
        val player = playerClubCountry?.trim()?.lowercase()?.takeIf { it.isNotBlank() } ?: return false
        if (req == player) return true
        if (req.contains(player) || player.contains(req)) return true
        val aliases = mapOf(
            "israel" to "israeli", "poland" to "polish", "germany" to "deutschland", "england" to "english",
            "spain" to "spanish", "italy" to "italian", "france" to "french", "netherlands" to "dutch",
            "portugal" to "portuguese", "turkey" to "turkish", "greece" to "greek", "belgium" to "belgian"
        )
        val reqNorm = aliases.entries.firstOrNull { req == it.key || req == it.value }?.key ?: req
        val playerNorm = aliases.entries.firstOrNull { player == it.key || player == it.value }?.key ?: player
        return reqNorm == playerNorm
    }

    private fun normalizeTmProfileForExclusion(url: String?): String? {
        if (url.isNullOrBlank()) return null
        val spielerMatch = Regex("""/spieler/(\d+)""", RegexOption.IGNORE_CASE).find(url)
        return spielerMatch?.groupValues?.getOrNull(1)
            ?: url.trim().lowercase().removeSuffix("/")
    }

    private suspend fun verifyAndEnrichForRequest(
        rawSuggestions: List<SimilarPlayerSuggestion>,
        request: Request,
        excludeUrls: Set<String>
    ): List<SimilarPlayerSuggestion> {
        val excludeNormalized = excludeUrls.mapNotNull { normalizeTmProfileForExclusion(it) }.toSet()
        val (minValue, maxValue) = when (request.transferFee?.trim()?.lowercase()) {
            "free/free loan" -> {
                val avgValue = request.clubTmProfile?.let { clubSquadValueFetcher.getAverageSquadValue(it) }
                if (avgValue != null && avgValue > 0) {
                    val center = avgValue.toDouble()
                    Pair(maxOf(0.0, center - 200_000), center + 200_000).also {
                        Log.d(TAG, "Free transfer: club squad avg=€$avgValue, range €${it.first.toInt()}-€${it.second.toInt()}")
                    }
                } else {
                    Pair(0.0, 2_000_000.0).also {
                        Log.d(TAG, "Free transfer: no club squad value, fallback range €0-€2m")
                    }
                }
            }
            else -> transferFeeToMarketValueRange(request.transferFee)
        }
        val minAge = if (request.ageDoesntMatter == true) 16 else (request.minAge ?: 16)
        val maxAge = if (request.ageDoesntMatter == true) 40 else (request.maxAge ?: 40)
        val positionGroups = request.position?.let { getPositionGroupsFromCode(it) } ?: emptySet()
        val reqFoot = request.dominateFoot?.trim()?.lowercase()?.takeIf { it.isNotBlank() }

        val enriched = rawSuggestions.mapNotNull { suggestion ->
            val tmProfile = findBestMatchingProfile(suggestion.name)
            if (tmProfile != null) {
                val url = tmProfile.tmProfile?.takeIf { it.contains("/profil/spieler/", ignoreCase = true) }
                if (url != null && normalizeTmProfileForExclusion(url) in excludeNormalized) return@mapNotNull null  // Exclude roster
                if (isSameLeagueOrCountry(request.clubCountry, tmProfile.currentClub?.clubCountry)) {
                    Log.d(TAG, "Excluded ${suggestion.name}: same league/country as request (${tmProfile.currentClub?.clubCountry})")
                    return@mapNotNull null
                }
                val verifiedPosition = tmProfile.positions?.filterNotNull()?.joinToString(", ")?.takeIf { it.isNotBlank() }
                    ?: tmProfile.positions?.firstOrNull()?.takeIf { it.isNotBlank() }
                val verifiedAge = tmProfile.age
                val verifiedValue = tmProfile.marketValue
                suggestion.copy(
                    name = tmProfile.fullName ?: suggestion.name,
                    position = verifiedPosition,
                    age = verifiedAge,
                    marketValue = verifiedValue,
                    transfermarktUrl = url,
                    similarityReason = sanitizeSimilarityReason(suggestion.similarityReason, verifiedAge, verifiedValue)
                )
            } else null
        }

        var result = enriched.filter {
            meetsRequestConstraints(it, minAge, maxAge, minValue, maxValue, positionGroups, reqFoot) && hasTransferValue(it)
        }
        if (result.isEmpty() && enriched.isNotEmpty()) {
            result = enriched.filter {
                meetsRequestConstraintsRelaxed(it, minAge, maxAge, minValue, maxValue, positionGroups, reqFoot) && hasTransferValue(it)
            }
        }
        Log.d(TAG, "verifyAndEnrichForRequest: raw=${rawSuggestions.size}, enriched=${enriched.size}, afterFilter=${result.size} (minAge=$minAge, maxAge=$maxAge)")
        return result.take(12)
    }

    private fun transferFeeToMarketValueRange(transferFee: String?): Pair<Double, Double> {
        if (transferFee.isNullOrBlank()) return Pair(0.0, Double.MAX_VALUE)
        return when (transferFee.trim().lowercase()) {
            "free/free loan" -> Pair(0.0, 150_000.0)
            "<200" -> Pair(0.0, 200_000.0)
            "300-600" -> Pair(250_000.0, 650_000.0)
            "700-900" -> Pair(650_000.0, 950_000.0)
            "1m+" -> Pair(900_000.0, Double.MAX_VALUE)
            else -> Pair(0.0, Double.MAX_VALUE)
        }
    }

    private fun getPositionGroupsFromCode(position: String): Set<String> {
        val code = position.trim().uppercase()
        return when {
            code == "GK" -> setOf("GK")
            code in setOf("CB", "LB", "RB") -> setOf("defender")
            code in setOf("LW", "RW", "LM", "RM") -> setOf("winger")
            code in setOf("ST", "CF", "SS") -> setOf("striker")
            code in setOf("CM", "DM", "AM") -> setOf("midfielder")
            else -> emptySet()
        }
    }

    private fun meetsRequestConstraints(
        suggestion: SimilarPlayerSuggestion,
        minAge: Int,
        maxAge: Int,
        minValue: Double,
        maxValue: Double,
        positionGroups: Set<String>,
        reqFoot: String?
    ): Boolean {
        suggestion.age?.toIntOrNull()?.let { age ->
            if (age < minAge || age > maxAge) return false
        }
        val value = suggestion.marketValue?.toMarketValueDouble() ?: 0.0
        if (minValue > 0 && maxValue < Double.MAX_VALUE && (value < minValue || value > maxValue)) return false
        if (positionGroups.isNotEmpty() && !positionsOverlap(positionGroups, suggestion.position)) return false
        // Foot filter: SimilarPlayerSuggestion doesn't have foot; AI prompt asks for correct foot
        return true
    }

    private fun meetsRequestConstraintsRelaxed(
        suggestion: SimilarPlayerSuggestion,
        minAge: Int,
        maxAge: Int,
        minValue: Double,
        maxValue: Double,
        positionGroups: Set<String>,
        reqFoot: String?
    ): Boolean {
        suggestion.age?.toIntOrNull()?.let { age ->
            if (age < (minAge - 3).coerceAtLeast(16) || age > maxAge + 5) return false
        }
        val value = suggestion.marketValue?.toMarketValueDouble() ?: 0.0
        if (minValue > 0 && maxValue < Double.MAX_VALUE && value > 0) {
            val relaxedMin = minValue * 0.5
            val relaxedMax = maxValue * 2.0
            if (value < relaxedMin || value > relaxedMax) return false
        }
        if (positionGroups.isNotEmpty() && !positionsOverlap(positionGroups, suggestion.position)) return true  // Relax position
        return true
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
                // Use same config pattern as findSimilarPlayers (which works); avoid maxOutputTokens to use model default
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.4f
                        topP = 0.9f
                    }
                )
                val playerContext = buildPlayerContext(player)
                val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"
                val reportInstructions = buildScoutReportInstructions(options.reportType)

                val prompt = """
                    You are a CHIEF SCOUT with 25+ years at top clubs. Your reports drive transfer decisions. You combine experience, creativity, and ruthless analysis. Write with authority, precision, and tactical insight.
                    
                    TASK: Generate a professional scout report for the following player.
                    
                    $reportInstructions
                    
                    ISRAELI PREMIER LEAGUE (LIGAT HA'AL) — MANDATORY CORE ANALYSIS:
                    This is your PRIMARY market. Every report MUST include a dedicated section analyzing this player's fit for Israel's top division. Be specific and actionable.
                    
                    REQUIRED ELEMENTS:
                    1. LIGAT HA'AL FIT VERDICT: Would this player START / ROTATION / SQUAD / BENEATH for a top-6 Israeli club? State clearly.
                    2. CLUB-SPECIFIC FIT: Which Israeli clubs suit best? Maccabi Haifa, Maccabi Tel Aviv, Hapoel Be'er Sheva, Hapoel Tel Aviv, Beitar Jerusalem, Maccabi Netanya. Explain why each fits or doesn't based on profile (value, age, position, style).
                    3. LEAGUE STANDARD COMPARISON: Typical Ligat Ha'Al level: market values €100k–€2m for starters. Physical and technical demands. League tempo. How does this player compare to typical Israeli league standards for this position?
                    4. TRANSFER FEASIBILITY: Value, contract, club level compatibility. Is this a realistic target for Israeli clubs? Price range for Israeli market.
                    5. RISK/OPPORTUNITY: What would make this player excel or struggle in Ligat Ha'Al?
                    Base analysis on profile data only. Be creative and experienced — you are a chief scout who knows the Israeli market inside out.
                    
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
                    val blockReason = response.promptFeedback?.blockReason?.name
                    val msg = if (blockReason != null) "AI blocked response (reason: $blockReason)" else "Empty response from AI"
                    Log.w(TAG, "generateScoutReport: $msg")
                    return@withContext Result.failure(IllegalStateException(msg))
                }
                Log.d(TAG, "generateScoutReport: success, length=${text.length}")
                Result.success(text)
            } catch (e: Exception) {
                val msg = e.message ?: e.javaClass.simpleName
                Log.e(TAG, "generateScoutReport failed: $msg", e)
                Result.failure(e)
            }
        }

    /**
     * Computes a "hidden gem" score for a player: potential as undervalued talent.
     * Uses profile data: age, value, value trend, contract, club level.
     * Score 0-100 with a short reason.
     */
    suspend fun computeHiddenGemScore(
        player: Player,
        languageCode: String = "en"
    ): Result<HiddenGemResult> =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.3f
                        responseMimeType = "application/json"
                        responseSchema = Schema.obj(
                            mapOf(
                                "score" to Schema.integer(),
                                "reason" to Schema.string()
                            ),
                            optionalProperties = listOf("reason")
                        )
                    }
                )

                val playerContext = buildPlayerContext(player)
                val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"

                val prompt = """
                    You are a CHIEF SCOUT with 25+ years at top clubs. You specialize in finding undervalued talent — "hidden gems" that other agents overlook.

                    TASK: Score this player's potential as a HIDDEN GEM (0-100). A hidden gem is: young, low market value relative to profile, at a solid club, with upside (rising value, contract expiring, etc.). Agents who find these players first have a competitive edge.

                    SCORING GUIDELINES:
                    - 70-100: Strong hidden gem — young (18-24), low value (under €1.5m for Israeli/similar leagues), rising value trend, or contract expiring soon. Would recommend to agents.
                    - 40-69: Moderate potential — some signals (young OR low value OR rising trend) but not all.
                    - 20-39: Weak — established player, high value, or declining trend. Not a hidden gem.
                    - 0-19: Not a hidden gem — veteran, zero transfer value, or profile doesn't fit.

                    Base analysis ONLY on the data provided. NEVER invent facts. If data is missing, score conservatively.

                    Player profile:
                    $playerContext

                    Return JSON: { "score": 0-100, "reason": "1-2 sentences in $outputLanguage explaining why. Reference: age, value, value trend, contract, club level." }
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text ?: return@withContext Result.failure(
                    IllegalStateException("Empty response from AI")
                )

                val json = JSONObject(text)
                val score = json.optInt("score", 0).coerceIn(0, 100)
                val reason = json.optString("reason").takeIf { it.isNotBlank() }
                Log.d(TAG, "computeHiddenGemScore: ${player.fullName} score=$score reason=$reason")
                Result.success(HiddenGemResult(score = score, reason = reason))
            } catch (e: Exception) {
                Log.e(TAG, "computeHiddenGemScore failed", e)
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
                "PRIORITY: Playing style and technical profile — first touch, press resistance, movement patterns, positional play. Suggest players who play the same way. Must still have transfer value and be age-appropriate."
            SimilarPlayersOptions.SimilarityMode.MARKET_VALUE ->
                "PRIORITY: Similar market value bracket — real alternatives in negotiations. Same position, similar age. Ideal for comparing options in a transfer window."
            SimilarPlayersOptions.SimilarityMode.POSITION_PROFILE ->
                "PRIORITY: Same position and tactical role. Players who could slot into the same system. Must have transfer value and be age-appropriate."
            SimilarPlayersOptions.SimilarityMode.ALL_ROUND ->
                "PRIORITY: Balanced — position, market value, age, technical profile, and style. Real opportunities only. Top 10 you would actually sign."
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

    /** League-level context: when source is from Israeli/similar league, suggest only comparable leagues. */
    private fun buildLeagueLevelHint(player: Player): String {
        val country = player.currentClub?.clubCountry?.trim()?.lowercase() ?: return ""
        val value = player.marketValue?.toMarketValueDouble() ?: 0.0
        return when {
            country.contains("israel") || country.contains("israeli") ->
                "LEAGUE LEVEL: This player is from Israeli Ligat Ha'Al. Suggest ONLY players from comparable leagues: Polish Ekstraklasa, Greek Super League, Austrian Bundesliga, Belgian Pro League, Scandinavian leagues, Czech/Slovak, Croatian, Cypriot. NEVER suggest La Liga, Premier League, Serie A, Bundesliga, or Ligue 1 starters — they are not comparable."
            country.contains("poland") || country.contains("polish") ->
                "LEAGUE LEVEL: Polish Ekstraklasa. Suggest players from: Israeli Ligat Ha'Al, Greek, Austrian, Belgian, Scandinavian, Czech leagues. NOT top-5 leagues."
            country.contains("greece") || country.contains("greek") ->
                "LEAGUE LEVEL: Greek Super League. Suggest players from: Israeli, Polish, Austrian, Belgian, Scandinavian leagues. NOT top-5 leagues."
            value < 500_000 ->
                "LEAGUE LEVEL: Low value (under €500k). Suggest players from mid-tier European leagues (Israeli, Polish, Greek, Scandinavian, etc.). NOT top-5 league starters."
            else -> ""
        }
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
                lines.add("EXCLUDE: Players from the same league/country ($country). The user can find those themselves. Suggest ONLY players from OTHER leagues/countries — hidden gems, international options. This is the real value of scouting.")
            }
        }
        return lines.joinToString("\n").ifBlank { "" }
    }

    private fun buildScoutReportInstructions(type: ScoutReportOptions.ScoutReportType): String =
        when (type) {
            ScoutReportOptions.ScoutReportType.EXECUTIVE_SUMMARY ->
                """
                FORMAT: Executive summary (1–2 paragraphs). Decision-makers read this in 30 seconds.
                - Key strengths (2–3 bullet points) — technical, tactical, positional fit
                - Main weakness or area to improve — based on profile only
                - LIGAT HA'AL FIT (mandatory): START / ROTATION / SQUAD verdict. Which Israeli clubs suit (Maccabi Haifa, Maccabi TA, Hapoel BS, etc.)? One sentence.
                - Verdict: SIGN / MONITOR / PASS — with one-line rationale
                Keep it punchy. Be specific. Israeli league fit is the core decision.
                """.trimIndent()
            ScoutReportOptions.ScoutReportType.FULL_TACTICAL ->
                """
                FORMAT: Full tactical scout report (Barcelona/Real Madrid standard).
                Use section headers. Pro-grade detail. Every claim traceable to the profile.
                
                SECTIONS:
                1. Executive Summary — 2–3 sentences: key strengths, main concern, recommendation
                2. Technical Profile — infer from position, height, foot, value: first touch, passing, dribbling, press resistance, weak foot. Use tactical reasoning. Do NOT invent match stats or playing time.
                3. Tactical Fit — best system, role, instructions. Positional play understanding.
                4. Strengths — 3–4 specific points. Technical, physical, tactical. Based on profile.
                5. Weaknesses — 2–3 areas of concern. Age, contract, value trend. Never assume injuries or form.
                6. FIT FOR ISRAELI PREMIER LEAGUE (LIGAT HA'AL) — CORE SECTION: This is the primary market. Analyze: (a) START / ROTATION / SQUAD verdict for top-6 clubs; (b) Club-specific fit: Maccabi Haifa, Maccabi TA, Hapoel BS, Hapoel TA, Beitar, Maccabi Netanya; (c) League standard comparison for position; (d) Transfer feasibility for Israeli market; (e) Risk/opportunity in Ligat Ha'Al context. Be specific and creative.
                7. Market Value & Transfer Suitability — from profile. Ideal buyer profile. Contract context.
                8. Verdict — SIGN / MONITOR / PASS with clear action and rationale.
                """.trimIndent()
            ScoutReportOptions.ScoutReportType.TRANSFER_RECOMMENDATION ->
                """
                FORMAT: Transfer-focused report. What sporting directors need.
                - Current value and contract context (from profile only)
                - Transfer market positioning (comparable deals)
                - FIT FOR ISRAELI PREMIER LEAGUE (LIGAT HA'AL) — CORE: Would Israeli top-division clubs be interested? Which clubs (Maccabi Haifa, Maccabi TA, Hapoel BS, etc.)? START / ROTATION / SQUAD verdict. Price range for Israeli market. Feasibility. Be specific.
                - Suitability: who should buy, why, at what price
                - Risk factors: ONLY contract length, loan status, value trend if in profile. Do NOT mention injury or form unless in data.
                - Recommendation: BUY / NEGOTIATE / PASS with price range if relevant
                Base everything on profile data only. Israeli league fit is the primary lens.
                """.trimIndent()
            ScoutReportOptions.ScoutReportType.YOUTH_POTENTIAL ->
                """
                FORMAT: Youth development / potential report.
                - Current level and ceiling (from age, position, value, club)
                - Development trajectory and key growth areas (tactical reasoning, not invented stats)
                - Comparison to similar profiles at same age
                - FIT FOR ISRAELI PREMIER LEAGUE (LIGAT HA'AL) — CORE: Would they develop well in Ligat Ha'Al? Which Israeli clubs have youth pathways (Maccabi Haifa, Maccabi TA, Hapoel BS, etc.)? Timeline to first-team in Israeli context. START / ROTATION potential when ready.
                - Best environment for development (club type, league)
                - Timeline to first-team readiness (age-based reasoning only)
                Focus on potential from profile data. Do NOT invent minutes, appearances, or form. Israeli league fit is the primary lens.
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

    /** Position constraint: chief scout standard — exact role match. DM≠AM, LW≠CF. */
    private fun buildPositionConstraint(player: Player): String? {
        val positions = player.positions?.filterNotNull()?.map { normalizePositionToCode(it) }?.toSet() ?: return null
        if (positions.isEmpty()) return null
        val acceptable = getSourcePositionGroups(player)
        if (acceptable.isEmpty()) return null
        val desc = when {
            acceptable.size == 1 -> "EXACT same position: ${acceptable.first()}. A ${acceptable.first()} must be matched with another ${acceptable.first()}."
            acceptable.size <= 4 -> "Same role: ${acceptable.joinToString(", ")}. No other positions."
            else -> "Same position group. No defenders for wingers, no wingers for strikers."
        }
        return "Position (non-negotiable): $desc NEVER suggest a DM when the player is an AM, or an AM when the player is a DM. Same for LW vs CF, etc."
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
        val sourceCountry = sourcePlayer.currentClub?.clubCountry?.trim()?.takeIf { it.isNotBlank() }
        val excludeTop5ForSource = shouldExcludeTop5LeaguesForSimilar(sourceCountry, sourceValueDouble)
        val enriched = rawSuggestions.mapNotNull { suggestion ->
            val tmProfile = findBestMatchingProfile(suggestion.name)
            if (tmProfile != null) {
                if (options.excludeSameLeague && sourceCountry != null && isSameLeagueOrCountry(sourceCountry, tmProfile.currentClub?.clubCountry)) return@mapNotNull null
                if (excludeTop5ForSource && isTop5League(tmProfile.currentClub?.clubCountry)) {
                    Log.d(TAG, "Excluded ${suggestion.name}: top-5 league (${tmProfile.currentClub?.clubCountry}) not comparable to source")
                    return@mapNotNull null
                }
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

    /** Tighter range for similar players — chief scout standard: only truly comparable value. */
    private fun computeMarketValueRange(sourceValue: Double): Pair<Double, Double> =
        when {
            sourceValue <= 0 -> Pair(0.0, Double.MAX_VALUE)
            sourceValue < 300_000 -> Pair((sourceValue - 75_000).coerceAtLeast(50_000.0), sourceValue + 75_000)
            sourceValue < 1_000_000 -> Pair((sourceValue - 150_000).coerceAtLeast(0.0), sourceValue + 150_000)
            else -> {
                val delta = (sourceValue * 0.15).coerceAtLeast(150_000.0)
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

    /**
     * Returns acceptable position CODES for matching (chief scout standard).
     * DM ≠ AM: a defensive midfielder is not similar to an attacking midfielder.
     * LW matches LW/RW/LM/RM; DM matches only DM; AM matches only AM; CM matches CM/DM/AM.
     */
    private fun getSourcePositionGroups(player: Player): Set<String> {
        val positions = player.positions?.filterNotNull()?.map { normalizePositionToCode(it) }?.toSet() ?: return emptySet()
        val acceptable = mutableSetOf<String>()
        if (positions.any { it == "GK" }) acceptable.add("GK")
        if (positions.any { it in setOf("CB", "LB", "RB") }) acceptable.addAll(setOf("CB", "LB", "RB"))
        if (positions.any { it in setOf("LW", "RW", "LM", "RM") }) acceptable.addAll(setOf("LW", "RW", "LM", "RM"))
        if (positions.any { it in setOf("ST", "CF", "SS") }) acceptable.addAll(setOf("ST", "CF", "SS"))
        if (positions.any { it in setOf("DM", "CM", "AM") }) {
            val mid = positions.filter { it in setOf("DM", "CM", "AM") }
            when {
                mid.contains("DM") && !mid.contains("CM") && !mid.contains("AM") -> acceptable.add("DM")
                mid.contains("AM") && !mid.contains("CM") && !mid.contains("DM") -> acceptable.add("AM")
                else -> acceptable.addAll(setOf("DM", "CM", "AM"))
            }
        }
        return acceptable
    }

    private fun positionsOverlap(sourceCodes: Set<String>, suggestionPositionRaw: String?): Boolean {
        if (suggestionPositionRaw.isNullOrBlank()) return true
        if (sourceCodes.isEmpty()) return true
        val codes = suggestionPositionRaw
            .split(",")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .map { normalizePositionToCode(it) }
            .filter { it.isNotBlank() }
            .toSet()
        if (codes.isEmpty()) return true
        return codes.any { it in sourceCodes }
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
