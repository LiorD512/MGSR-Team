package com.liordahan.mgsrteam.features.players.playerinfo.ai

import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.transfermarket.ClubSquadValueFetcher
import com.liordahan.mgsrteam.transfermarket.LatestReleases
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktPlayerDetails
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * AI Helper service using Firebase AI (Gemini) to find similar players.
 * Now enhanced with a local scouting server for faster, data-driven results.
 * Falls back to Gemini AI when the server is unavailable.
 *
 * Prerequisites: Enable Firebase AI Logic in Firebase Console:
 * https://console.firebase.google.com/project/_/ailogic
 */
class AiHelperService(
    private val playerSearch: PlayerSearch,
    private val clubSquadValueFetcher: ClubSquadValueFetcher,
    private val latestReleases: LatestReleases,
    private val scoutApiClient: com.liordahan.mgsrteam.features.scouting.ScoutApiClient? = null
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
        val similarityReason: String?,
        val playingStyle: String? = null,
        val matchPercent: Int? = null,
        val scoutAnalysis: String? = null,
        val league: String? = null,
        val club: String? = null,
        val nationality: String? = null,
        val height: String? = null,
        val contractEnd: String? = null,
        val foot: String? = null,
        val scoreBreakdown: ScoreBreakdown? = null
    ) {
        data class ScoreBreakdown(
            val clubFit: Int?,
            val realism: Int?,
            val noteFit: Int?
        )
    }

    suspend fun findSimilarPlayers(
        player: Player,
        languageCode: String = "en",
        options: SimilarPlayersOptions = SimilarPlayersOptions(),
        excludeNames: List<String> = emptyList()
    ): Result<List<SimilarPlayerSuggestion>> =
        withContext(Dispatchers.IO) {
            // Try scouting server first (fast, data-driven)
            val tmUrl = player.tmProfile?.takeIf { it.isNotBlank() }
            Log.d(TAG, """┌── findSimilarPlayers ──
                |│ Player: ${player.fullName}
                |│ TM URL: $tmUrl
                |│ Server available: ${scoutApiClient != null}
                |│ Excluding: ${excludeNames.size} players
                |└──────────────────────────────""".trimMargin())
            if (scoutApiClient != null && tmUrl != null) {
                val serverResult = scoutApiClient.findSimilarPlayers(tmUrl, lang = languageCode, excludeNames = excludeNames)
                if (serverResult.isSuccess) {
                    val results = serverResult.getOrDefault(emptyList())
                    if (results.isNotEmpty()) {
                        Log.d(TAG, "✅ findSimilarPlayers: SERVER returned ${results.size} results for ${player.fullName}")
                        return@withContext Result.success(results)
                    } else {
                        Log.w(TAG, "⚠️ findSimilarPlayers: server returned EMPTY list, falling back to AI")
                    }
                } else {
                    Log.w(TAG, "❌ findSimilarPlayers: server FAILED, falling back to AI", serverResult.exceptionOrNull())
                }
            } else {
                Log.d(TAG, "⏭️ findSimilarPlayers: skipping server (client=${scoutApiClient != null}, tmUrl=$tmUrl)")
            }

            // Fallback to Gemini AI
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
     * Server path: Tries the scouting server first for data-driven results.
     * FAST path: For "Free/Free loan" requests, uses Transfermarkt LatestReleases (free agents) directly — no AI.
     * AI path: For other requests, uses Gemini + parallel verification with rate-limited TM fetches.
     */
    suspend fun findPlayersForRequest(
        request: Request,
        excludeTmProfileUrls: Set<String>,
        languageCode: String = "en"
    ): Result<List<SimilarPlayerSuggestion>> =
        withContext(Dispatchers.IO) {
            // Try scouting server first
            if (scoutApiClient != null) {
                Log.d(TAG, "┌── findPlayersForRequest: trying SERVER for ${request.clubName}")
                val serverResult = tryServerForRequest(request, excludeTmProfileUrls, languageCode)
                if (serverResult != null && serverResult.isNotEmpty()) {
                    val filtered = serverResult.filter { s ->
                        s.transfermarktUrl == null || s.transfermarktUrl !in excludeTmProfileUrls
                    }
                    Log.d(TAG, "✅ findPlayersForRequest: SERVER returned ${serverResult.size} results (${filtered.size} after filtering) for ${request.clubName}")
                    return@withContext Result.success(filtered.take(10))
                } else {
                    Log.w(TAG, "❌ findPlayersForRequest: server returned ${serverResult?.size ?: "null"}, falling back to AI")
                }
            } else {
                Log.d(TAG, "⏭️ findPlayersForRequest: no server client, using AI path")
            }

            try {
                val positionGroups = request.position?.let { getPositionGroupsFromCode(it) } ?: emptySet()
                Log.d(TAG, """
                    |findPlayersForRequest PARAMS:
                    |  clubName=${request.clubName}
                    |  clubCountry=${request.clubCountry}
                    |  position=${request.position} (groups=$positionGroups)
                    |  transferFee=${request.transferFee}
                    |  excludeRosterCount=${excludeTmProfileUrls.size}
                """.trimMargin())

                // FAST PATH: Free/Free loan — use Transfermarkt free agents directly (no AI, ~2–5s)
                if (request.transferFee?.trim()?.lowercase() == "free/free loan" && positionGroups.isNotEmpty()) {
                    val tmFirst = fetchFreeAgentsForRequest(request, excludeTmProfileUrls, positionGroups)
                    if (tmFirst.isNotEmpty()) {
                        Log.d(TAG, "findPlayersForRequest: Transfermarkt-first returned ${tmFirst.size} free agents")
                        return@withContext Result.success(tmFirst.take(12))
                    }
                }

                // AI PATH: Gemini suggests names, then parallel verification
                val (minValue, maxValue) = transferFeeToMarketValueRange(request.transferFee)
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.3f  // Lower for more accurate, less hallucinated names
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
                    "Do NOT suggest players already in the requester's roster."
                } else ""
                val leagueExclusionHint = request.clubCountry?.takeIf { it.isNotBlank() }?.let { country ->
                    "Do NOT suggest players from $country. Suggest ONLY from OTHER leagues/countries."
                } ?: ""

                val positionCode = request.position?.trim()?.uppercase()?.takeIf { it.isNotBlank() }
                val positionLongName = positionCode?.let { positionCodeToLongName(it) } ?: ""
                val positionExclusions = positionCode?.let { positionExclusionsForPrompt(it) } ?: ""
                val positionBlock = if (positionLongName.isNotBlank()) """
                    POSITION (NON-NEGOTIABLE): Only $positionLongName ($positionCode). $positionExclusions
                """.trimIndent() else ""

                val prompt = """
                    You are a football scout. Suggest exactly 18 players who match this request. Names must be EXACTLY as on Transfermarkt (2024-2025 active players). No URLs.
                    
                    REQUEST: $requestContext
                    $positionBlock
                    $excludeHint
                    $leagueExclusionHint
                    
                    RULES: Full name only. similarityReason: 1-2 sentences in $outputLanguage, qualitative only (no €, no ages). Suggest players you are confident exist on Transfermarkt.
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

    /**
     * Same as findPlayersForRequest but emits results progressively.
     * Tries scouting server first (instant results), falls back to AI path.
     */
    fun findPlayersForRequestAsFlow(
        request: Request,
        excludeTmProfileUrls: Set<String>,
        languageCode: String = "en"
    ): Flow<List<SimilarPlayerSuggestion>> = channelFlow {
        withContext(Dispatchers.IO) {
            // Try scouting server first (instant results)
            if (scoutApiClient != null) {
                Log.d(TAG, "┌── findPlayersForRequestAsFlow: trying SERVER for ${request.clubName}")
                val serverResult = tryServerForRequest(request, excludeTmProfileUrls, languageCode)
                if (serverResult != null && serverResult.isNotEmpty()) {
                    val filtered = serverResult.filter { s ->
                        s.transfermarktUrl == null || s.transfermarktUrl !in excludeTmProfileUrls
                    }.take(10)
                    Log.d(TAG, "✅ findPlayersForRequestAsFlow: SERVER returned ${serverResult.size} results (${filtered.size} after filtering)")
                    send(filtered)
                    return@withContext
                } else {
                    Log.w(TAG, "❌ findPlayersForRequestAsFlow: server returned ${serverResult?.size ?: "null"}, falling back to AI")
                }
            } else {
                Log.d(TAG, "⏭️ findPlayersForRequestAsFlow: no server client, using AI path")
            }

            val positionGroups = request.position?.let { getPositionGroupsFromCode(it) } ?: emptySet()
            // FAST PATH: Free/Free loan
            if (request.transferFee?.trim()?.lowercase() == "free/free loan" && positionGroups.isNotEmpty()) {
                val tmFirst = fetchFreeAgentsForRequest(request, excludeTmProfileUrls, positionGroups)
                if (tmFirst.isNotEmpty()) {
                    send(tmFirst.take(12))
                    return@withContext
                }
            }
            // AI PATH: emit as we verify
            send(emptyList())
            val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                modelName = "gemini-2.5-flash",
                generationConfig = generationConfig {
                    temperature = 0.3f
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
                                    optionalProperties = listOf("position", "age", "marketValue", "similarityReason")
                                )
                            )
                        )
                    )
                }
            )
            val requestContext = buildRequestContext(request)
            val outputLanguage = if (languageCode == "he" || languageCode == "iw") "Hebrew" else "English"
            val excludeHint = if (excludeTmProfileUrls.isNotEmpty()) "Do NOT suggest players already in the requester's roster." else ""
            val leagueExclusionHint = request.clubCountry?.takeIf { it.isNotBlank() }?.let { "Do NOT suggest players from $it. Suggest ONLY from OTHER leagues/countries." } ?: ""
            val positionCode = request.position?.trim()?.uppercase()?.takeIf { it.isNotBlank() }
            val positionLongName = positionCode?.let { positionCodeToLongName(it) } ?: ""
            val positionExclusions = positionCode?.let { positionExclusionsForPrompt(it) } ?: ""
            val positionBlock = if (positionLongName.isNotBlank()) "POSITION (NON-NEGOTIABLE): Only $positionLongName ($positionCode). $positionExclusions" else ""
            val prompt = """
                You are a football scout. Suggest exactly 18 players who match this request. Names must be EXACTLY as on Transfermarkt (2024-2025 active players). No URLs.
                REQUEST: $requestContext
                $positionBlock
                $excludeHint
                $leagueExclusionHint
                RULES: Full name only. similarityReason: 1-2 sentences in $outputLanguage, qualitative only. Suggest players you are confident exist on Transfermarkt.
            """.trimIndent()
            val response = model.generateContent(prompt)
            val text = response.text ?: return@withContext
            val rawSuggestions = parseSimilarPlayersResponse(text)
            if (rawSuggestions.isEmpty()) return@withContext
            val channel = Channel<SimilarPlayerSuggestion?>(Channel.UNLIMITED)
            val accumulated = mutableListOf<SimilarPlayerSuggestion>()
            val sem = Semaphore(8)
            launch {
                rawSuggestions.map { suggestion ->
                    async {
                        sem.withPermit {
                            val r = verifyOneSuggestionForRequest(suggestion, request, excludeTmProfileUrls)
                            channel.send(r)
                        }
                    }
                }.awaitAll()
                channel.close()
            }
            for (r in channel) {
                if (r != null) {
                    accumulated.add(r)
                    send(accumulated.take(12).toList())
                }
            }
        }
    }.flowOn(Dispatchers.IO)

    private suspend fun verifyOneSuggestionForRequest(
        suggestion: SimilarPlayerSuggestion,
        request: Request,
        excludeUrls: Set<String>,
        allowSameLeague: Boolean = false
    ): SimilarPlayerSuggestion? {
        val positionGroups = request.position?.let { getPositionGroupsFromCode(it) } ?: emptySet()
        val excludeNormalized = excludeUrls.mapNotNull { normalizeTmProfileForExclusion(it) }.toSet()
        val tmProfile = findBestMatchingProfileForRequest(suggestion.name, positionGroups) ?: return null
        val url = tmProfile.tmProfile?.takeIf { it.contains("/profil/spieler/", ignoreCase = true) } ?: return null
        if (normalizeTmProfileForExclusion(url) in excludeNormalized) return null
        if (!allowSameLeague && isSameLeagueOrCountry(request.clubCountry, tmProfile.currentClub?.clubCountry)) return null
        val (minValue, maxValue) = when (request.transferFee?.trim()?.lowercase()) {
            "free/free loan" -> request.clubTmProfile?.let { clubSquadValueFetcher.getAverageSquadValue(it) }?.let { avg ->
                Pair(maxOf(0.0, avg - 200_000.0), (avg + 200_000).toDouble())
            } ?: Pair(0.0, 2_000_000.0)
            else -> transferFeeToMarketValueRange(request.transferFee)
        }
        val minAge = if (request.ageDoesntMatter == true) 16 else (request.minAge ?: 16)
        val maxAge = if (request.ageDoesntMatter == true) 40 else (request.maxAge ?: 40)
        val reqFoot = request.dominateFoot?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        val enriched = suggestion.copy(
            name = tmProfile.fullName ?: suggestion.name,
            position = tmProfile.positions?.filterNotNull()?.joinToString(", ")?.takeIf { it.isNotBlank() } ?: tmProfile.positions?.firstOrNull(),
            age = tmProfile.age,
            marketValue = tmProfile.marketValue,
            transfermarktUrl = url,
            similarityReason = sanitizeSimilarityReason(suggestion.similarityReason, tmProfile.age, tmProfile.marketValue)
        )
        if (!hasTransferValue(enriched)) return null
        if (!meetsRequestConstraints(enriched, minAge, maxAge, minValue, maxValue, positionGroups, reqFoot) &&
            !meetsRequestConstraintsRelaxed(enriched, minAge, maxAge, minValue, maxValue, positionGroups, reqFoot)) return null
        return enriched
    }

    /** Transfermarkt-first: fetch free agents (LatestReleases) and filter by position, age, league. Very fast. */
    private suspend fun fetchFreeAgentsForRequest(
        request: Request,
        excludeUrls: Set<String>,
        positionGroups: Set<String>
    ): List<SimilarPlayerSuggestion> {
        val (minValue, maxValue) = when (request.transferFee?.trim()?.lowercase()) {
            "free/free loan" -> {
                val avgValue = request.clubTmProfile?.let { clubSquadValueFetcher.getAverageSquadValue(it) }
                if (avgValue != null && avgValue > 0) {
                    val center = avgValue.toDouble()
                    Pair(maxOf(0, (center - 200_000).toInt()), (center + 200_000).toInt())
                } else Pair(150_000, 2_000_000)
            }
            else -> Pair(0, 2_000_000)
        }
        val minAge = if (request.ageDoesntMatter == true) 16 else (request.minAge ?: 16)
        val maxAge = if (request.ageDoesntMatter == true) 40 else (request.maxAge ?: 40)
        val excludeNormalized = excludeUrls.mapNotNull { normalizeTmProfileForExclusion(it) }.toSet()

        return when (val result = latestReleases.getLatestReleases(minValue, maxValue, maxRetries = 2, forceEnrichAll = false)) {
            is TransfermarktResult.Success -> {
                val filtered = result.data.filterNotNull()
                    .filter { model ->
                        val url = model.playerUrl ?: return@filter false
                        normalizeTmProfileForExclusion(url) !in excludeNormalized
                    }
                    .filter { model ->
                        val pos = model.playerPosition?.let { normalizePositionToCode(it) }
                        pos != null && positionGroups.contains(pos)
                    }
                    .filter { model ->
                        val age = model.playerAge?.toIntOrNull() ?: return@filter true
                        age in minAge..maxAge
                    }
                    .mapNotNull { model ->
                        val url = model.playerUrl?.takeIf { it.contains("/profil/spieler/", ignoreCase = true) } ?: return@mapNotNull null
                        SimilarPlayerSuggestion(
                            name = model.playerName ?: "Unknown",
                            position = model.playerPosition,
                            age = model.playerAge,
                            marketValue = model.marketValue,
                            transfermarktUrl = url,
                            similarityReason = null
                        )
                    }
                filtered.take(12)
            }
            is TransfermarktResult.Failed -> emptyList()
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

        // PARALLEL verification: 8 concurrent TM requests (was sequential = very slow)
        val sem = Semaphore(8)
        val enriched = coroutineScope {
            rawSuggestions.map { suggestion ->
                async {
                    sem.withPermit {
                        val tmProfile = findBestMatchingProfileForRequest(suggestion.name, positionGroups)
                        if (tmProfile != null) {
                            val url = tmProfile.tmProfile?.takeIf { it.contains("/profil/spieler/", ignoreCase = true) }
                            if (url != null && normalizeTmProfileForExclusion(url) in excludeNormalized) return@async null
                            if (isSameLeagueOrCountry(request.clubCountry, tmProfile.currentClub?.clubCountry)) {
                                Log.d(TAG, "Excluded ${suggestion.name}: same league/country (${tmProfile.currentClub?.clubCountry})")
                                return@async null
                            }
                            val verifiedPosition = tmProfile.positions?.filterNotNull()?.joinToString(", ")?.takeIf { it.isNotBlank() }
                                ?: tmProfile.positions?.firstOrNull()?.takeIf { it.isNotBlank() }
                            suggestion.copy(
                                name = tmProfile.fullName ?: suggestion.name,
                                position = verifiedPosition,
                                age = tmProfile.age,
                                marketValue = tmProfile.marketValue,
                                transfermarktUrl = url,
                                similarityReason = sanitizeSimilarityReason(suggestion.similarityReason, tmProfile.age, tmProfile.marketValue)
                            )
                        } else null
                    }
                }
            }.awaitAll().filterNotNull()
        }

        var result = enriched.filter {
            meetsRequestConstraints(it, minAge, maxAge, minValue, maxValue, positionGroups, reqFoot) && hasTransferValue(it)
        }
        if (result.isEmpty() && enriched.isNotEmpty()) {
            result = enriched.filter {
                meetsRequestConstraintsRelaxed(it, minAge, maxAge, minValue, maxValue, positionGroups, reqFoot) && hasTransferValue(it)
            }
        }
        Log.d(TAG, "verifyAndEnrichForRequest: raw=${rawSuggestions.size}, enriched=${enriched.size}, afterFilter=${result.size}")
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

    /**
     * Try the scouting server to find players matching a request.
     * Returns null if the server is unavailable or returns no results.
     */
    private suspend fun tryServerForRequest(request: Request, excludeUrls: Set<String> = emptySet(), lang: String = "en"): List<SimilarPlayerSuggestion>? {
        val api = scoutApiClient ?: return null
        return try {
            Log.d(TAG, """┌── tryServerForRequest ──
                |│ Club: ${request.clubName} (${request.clubCountry})
                |│ Club TM: ${request.clubTmProfile}
                |│ Position: ${request.position}
                |│ Age: ${request.minAge} - ${request.maxAge}
                |│ Foot: ${request.dominateFoot}
                |│ Transfer Fee: ${request.transferFee}
                |│ Salary Range: ${request.salaryRange}
                |│ Notes: ${request.notes}
                |│ Exclude URLs: ${excludeUrls.size}
                |│ Lang: $lang
                |└──────────────────────────────""".trimMargin())
            val result = api.findPlayersForRequest(
                position = request.position,
                ageMin = request.minAge,
                ageMax = request.maxAge,
                foot = request.dominateFoot?.takeIf { it.isNotBlank() && it.lowercase() != "doesn't matter" },
                notes = request.notes,
                transferFee = request.transferFee,
                salaryRange = request.salaryRange,
                requestId = request.id,
                excludeUrls = excludeUrls,
                lang = lang,
                sortBy = "score",
                limit = 15,
                // Club context for professional scouting
                clubUrl = request.clubTmProfile,
                clubName = request.clubName,
                clubCountry = request.clubCountry,
            )
            val players = result.getOrNull()
            Log.d(TAG, "tryServerForRequest result: ${players?.size ?: "null"} players")
            players
        } catch (e: Exception) {
            Log.w(TAG, "tryServerForRequest failed", e)
            null
        }
    }

    /**
     * Returns acceptable position CODES for a request (used with positionsOverlap).
     * CF ≠ CB: Center Forward must NOT match Center Back. Same position role only.
     */
    private fun getPositionGroupsFromCode(position: String): Set<String> {
        val code = position.trim().uppercase()
        return when {
            code == "GK" -> setOf("GK")
            code in setOf("CB", "LB", "RB") -> setOf("CB", "LB", "RB")
            code in setOf("LW", "RW", "LM", "RM") -> setOf("LW", "RW", "LM", "RM")
            code in setOf("ST", "CF", "SS") -> setOf("ST", "CF", "SS")
            code in setOf("CM", "DM", "AM") -> {
                when (code) {
                    "DM" -> setOf("DM")
                    "AM" -> setOf("AM")
                    else -> setOf("CM", "DM", "AM")
                }
            }
            else -> emptySet()
        }
    }

    /** Long name for position code — used in AI prompts for clarity. CF ≠ CB. */
    private fun positionCodeToLongName(code: String): String {
        return when (code.trim().uppercase()) {
            "GK" -> "Goalkeeper"
            "CB" -> "Centre Back"
            "LB" -> "Left Back"
            "RB" -> "Right Back"
            "DM" -> "Defensive Midfield"
            "CM" -> "Central Midfield"
            "AM" -> "Attacking Midfield"
            "RW" -> "Right Winger"
            "LW" -> "Left Winger"
            "CF" -> "Centre Forward"
            "ST" -> "Striker"
            "SS" -> "Second Striker"
            "RM" -> "Right Midfield"
            "LM" -> "Left Midfield"
            "LWB" -> "Left Wing-Back"
            "RWB" -> "Right Wing-Back"
            else -> code
        }
    }

    /** Explicit exclusions for position — e.g. for CF: "NOT Centre Back, NOT Defender". */
    private fun positionExclusionsForPrompt(code: String): String {
        val upper = code.trim().uppercase()
        return when {
            upper in setOf("CF", "ST", "SS") -> "NEVER suggest Centre Back (CB), Left Back (LB), Right Back (RB), or any defender. ONLY forwards: Centre Forward, Striker, Second Striker."
            upper in setOf("CB", "LB", "RB") -> "NEVER suggest Centre Forward (CF), Striker (ST), or any forward. ONLY defenders: Centre Back, Left Back, Right Back."
            upper in setOf("DM", "CM", "AM") -> when (upper) {
                "DM" -> "NEVER suggest Attacking Midfield (AM) or forwards. ONLY Defensive Midfield (DM)."
                "AM" -> "NEVER suggest Defensive Midfield (DM) or defenders. ONLY Attacking Midfield (AM)."
                else -> "ONLY midfielders: Central, Defensive, or Attacking Midfield."
            }
            upper in setOf("LW", "RW", "LM", "RM") -> "NEVER suggest Centre Forward (CF), Striker (ST), or Centre Back (CB). ONLY wingers: Left/Right Winger, Left/Right Midfield."
            upper == "GK" -> "ONLY Goalkeepers. No outfield players."
            else -> ""
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
        // Position is NON-NEGOTIABLE even in relaxed mode — CF ≠ CB, never accept wrong position
        if (positionGroups.isNotEmpty() && !positionsOverlap(positionGroups, suggestion.position)) return false
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
                    
                    Write the report in $outputLanguage. Use clear numbered section headers (e.g. "1. Executive Summary", "2. Technical Profile"). Do NOT use markdown asterisks (**bold**) or hashtags — use plain text only. Be specific about what the data shows. Avoid generic fluff. Your verdict should be actionable. Never fabricate facts.
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
     * Optimized for request matching: pre-filters search results by position before fetching profile.
     * Fetches only 1 profile (best match) instead of 5 — much faster.
     */
    private suspend fun findBestMatchingProfileForRequest(
        playerName: String,
        positionGroups: Set<String>
    ): TransfermarktPlayerDetails? = withContext(Dispatchers.IO) {
        when (val result = playerSearch.getSearchResults(playerName)) {
            is TransfermarktResult.Success -> {
                val candidates = result.data.filter { it.tmProfile?.contains("/profil/spieler/", ignoreCase = true) == true }
                if (candidates.isEmpty()) {
                    val swapped = swapNameOrder(playerName)
                    if (swapped != playerName) {
                        when (val retry = playerSearch.getSearchResults(swapped)) {
                            is TransfermarktResult.Success -> {
                                val retryCandidates = retry.data.filter { it.tmProfile?.contains("/profil/spieler/", ignoreCase = true) == true }
                                pickBestMatchForRequest(playerName, retryCandidates, positionGroups)
                            }
                            is TransfermarktResult.Failed -> null
                        }
                    } else null
                } else {
                    pickBestMatchForRequest(playerName, candidates, positionGroups)
                }
            }
            is TransfermarktResult.Failed -> {
                val swapped = swapNameOrder(playerName)
                if (swapped != playerName) {
                    when (val retry = playerSearch.getSearchResults(swapped)) {
                        is TransfermarktResult.Success -> {
                            val candidates = retry.data.filter { it.tmProfile?.contains("/profil/spieler/", ignoreCase = true) == true }
                            pickBestMatchForRequest(playerName, candidates, positionGroups)
                        }
                        is TransfermarktResult.Failed -> null
                    }
                } else null
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

    /** Optimized: pre-filter by position from search result, fetch only 1 profile. */
    private suspend fun pickBestMatchForRequest(
        playerName: String,
        candidates: List<PlayerSearchModel>,
        positionGroups: Set<String>
    ): TransfermarktPlayerDetails? {
        if (candidates.isEmpty()) return null
        // Pre-filter by position from search result (no profile fetch)
        val positionFiltered = if (positionGroups.isNotEmpty()) {
            candidates.filter { model ->
                val pos = model.playerPosition?.let { normalizePositionToCode(it) }
                pos != null && positionGroups.contains(pos)
            }
        } else candidates
        val toCheck = if (positionFiltered.isNotEmpty()) positionFiltered else candidates
        // Fetch only the first/best candidate's profile (was 5 before)
        val best = toCheck.maxByOrNull { computeNameMatchScoreFromSearch(playerName, it) }
            ?: toCheck.firstOrNull()
        return best?.let {
            try { playerSearch.getPlayerBasicInfo(it) } catch (e: Exception) {
                Log.w(TAG, "Failed to fetch profile for ${it.playerName}", e)
                null
            }
        }
    }

    private fun computeNameMatchScoreFromSearch(expectedName: String, model: PlayerSearchModel): Int {
        val profileName = model.playerName?.lowercase() ?: ""
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
