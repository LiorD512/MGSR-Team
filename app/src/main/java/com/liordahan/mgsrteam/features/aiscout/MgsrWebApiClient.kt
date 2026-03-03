package com.liordahan.mgsrteam.features.aiscout

import android.util.Log
import com.liordahan.mgsrteam.features.warroom.DiscoveryCandidate
import com.liordahan.mgsrteam.features.warroom.DiscoveryResponse
import com.liordahan.mgsrteam.features.warroom.MarketReport
import com.liordahan.mgsrteam.features.warroom.ScoutProfile
import com.liordahan.mgsrteam.features.warroom.ScoutProfilesResponse
import com.liordahan.mgsrteam.features.warroom.StatsReport
import com.liordahan.mgsrteam.features.warroom.SynthesisReport
import com.liordahan.mgsrteam.features.warroom.TacticsReport
import com.liordahan.mgsrteam.features.warroom.WarRoomReportRequest
import com.liordahan.mgsrteam.features.warroom.WarRoomReportResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import com.liordahan.mgsrteam.localization.LocaleManager
import java.io.IOException
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * API client for the AI Scout search and War Room endpoints.
 * Calls the Next.js API routes on the MGSR web backend.
 *
 * For local testing, point BASE_URL to localhost:3000 or the Vercel deployment.
 */
class MgsrWebApiClient(
    private val context: android.content.Context,
    private val baseUrl: String = DEFAULT_BASE_URL
) {

    companion object {
        private const val TAG = "MgsrWebApiClient"

        // For local testing change to "http://10.0.2.2:3000" (Android emulator → host)
        // For production use the Vercel URL
        const val DEFAULT_BASE_URL = "https://mgsr-team.vercel.app"
    }

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(5, 1, TimeUnit.MINUTES))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)   // AI calls can be slow
        .build()

    // ─── AI Scout Search ───────────────────────────────────────────────────

    suspend fun searchPlayers(request: AiScoutSearchRequest): Result<AiScoutSearchResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val json = JSONObject().apply {
                    put("query", request.query)
                    put("lang", request.lang)
                    put("initial", request.initial)
                    if (request.excludeUrls.isNotEmpty()) {
                        put("excludeUrls", JSONArray(request.excludeUrls))
                    }
                }

                val body = json.toString().toRequestBody("application/json".toMediaType())
                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/scout/search")
                    .post(body)
                    .build()

                Log.d(TAG, "Searching players: ${request.query}")
                val response = client.newCallAsync(httpRequest)
                val responseBody = response.body?.string()
                    ?: throw IOException("Empty response from scout search")

                if (!response.isSuccessful) {
                    throw IOException("Scout search failed: ${response.code} — $responseBody")
                }

                parseScoutSearchResponse(responseBody)
            }
        }

    // ─── Find Next (Find Me The Next...) ────────────────────────────────────

    suspend fun findNext(request: FindNextRequest): Result<FindNextResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val params = buildString {
                    append("player_name=${java.net.URLEncoder.encode(request.playerName, "UTF-8")}")
                    append("&age_max=${request.ageMax}")
                    append("&lang=${request.lang}")
                    append("&limit=15")
                    if (request.valueMax > 0) {
                        append("&value_max=${request.valueMax}")
                    }
                }

                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/scout/find-next?$params")
                    .get()
                    .build()

                Log.d(TAG, "Find Next: ${request.playerName}")
                val response = client.newCallAsync(httpRequest)
                val responseBody = response.body?.string()
                    ?: throw IOException("Empty response from find-next")

                if (!response.isSuccessful) {
                    throw IOException("Find Next failed: ${response.code} — $responseBody")
                }

                parseFindNextResponse(responseBody)
            }
        }

    // ─── War Room Discovery ────────────────────────────────────────────────

    suspend fun getDiscovery(): Result<DiscoveryResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/war-room/discovery")
                    .get()
                    .build()

                Log.d(TAG, "Fetching War Room discovery")
                val response = client.newCallAsync(httpRequest)
                val responseBody = response.body?.string()
                    ?: throw IOException("Empty response from discovery")

                if (!response.isSuccessful) {
                    throw IOException("Discovery failed: ${response.code} — $responseBody")
                }

                parseDiscoveryResponse(responseBody)
            }
        }

    // ─── Scout Profiles (Agent Tab) ────────────────────────────────────────

    suspend fun getScoutProfiles(agentId: String? = null): Result<ScoutProfilesResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val url = buildString {
                    append("$baseUrl/api/war-room/scout-profiles")
                    if (!agentId.isNullOrBlank()) append("?agentId=$agentId")
                }

                val httpRequest = Request.Builder()
                    .url(url)
                    .get()
                    .build()

                Log.d(TAG, "Fetching scout profiles${agentId?.let { " for agent=$it" } ?: ""}")
                val response = client.newCallAsync(httpRequest)
                val responseBody = response.body?.string()
                    ?: throw IOException("Empty response from scout-profiles")

                if (!response.isSuccessful) {
                    throw IOException("Scout profiles failed: ${response.code} — $responseBody")
                }

                parseScoutProfilesResponse(responseBody)
            }
        }

    // ─── War Room Report ───────────────────────────────────────────────────

    suspend fun getReport(request: WarRoomReportRequest): Result<WarRoomReportResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val json = JSONObject().apply {
                    put("player_url", request.playerUrl)
                    request.playerName?.let { put("player_name", it) }
                    put("lang", request.lang)
                }

                val body = json.toString().toRequestBody("application/json".toMediaType())
                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/war-room/report")
                    .post(body)
                    .build()

                Log.d(TAG, "Generating report for ${request.playerUrl}")
                val response = client.newCallAsync(httpRequest)
                val responseBody = response.body?.string()
                    ?: throw IOException("Empty response from war-room report")

                if (!response.isSuccessful) {
                    throw IOException("Report failed: ${response.code} — $responseBody")
                }

                parseReportResponse(responseBody)
            }
        }

    // ─── Private Parsing ───────────────────────────────────────────────────

    private fun parseFindNextResponse(json: String): FindNextResponse {
        val obj = JSONObject(json)
        val refObj = obj.optJSONObject("reference_player")
        val referencePlayer = refObj?.let { r ->
            ReferencePlayer(
                name = r.optString("name", "Unknown"),
                position = r.optString("position", ""),
                age = r.optString("age", ""),
                marketValue = r.optString("market_value", ""),
                league = r.optString("league", ""),
                club = r.optString("club", ""),
                foot = r.optString("foot", ""),
                height = r.optString("height", ""),
                nationality = r.optString("nationality", ""),
                playingStyle = r.optString("playing_style", null).takeIf { !it.isNullOrBlank() },
                url = r.optString("url", "")
            )
        }

        val sigArr = obj.optJSONArray("signature_stats")
        val signatureStats = mutableListOf<SignatureStat>()
        if (sigArr != null) {
            for (i in 0 until sigArr.length()) {
                val s = sigArr.getJSONObject(i)
                signatureStats.add(
                    SignatureStat(
                        statKey = s.optString("stat_key", ""),
                        label = s.optString("label", s.optString("label_en", "")),
                        percentile = s.optInt("percentile", 0),
                        value = s.optDouble("value", 0.0)
                    )
                )
            }
        }

        val resultsArr = obj.optJSONArray("results") ?: JSONArray()
        val results = mutableListOf<FindNextResult>()
        for (i in 0 until resultsArr.length()) {
            val p = resultsArr.getJSONObject(i)
            val url = p.optString("url", "")
            val tmUrl = p.optString("transfermarkt_url", p.optString("tm_profile_url", "")).takeIf { it.isNotBlank() }
                ?: url.takeIf { it.contains("transfermarkt", ignoreCase = true) }
                ?: ""
            results.add(
                FindNextResult(
                    name = p.optString("name", "Unknown"),
                    position = p.optString("position", ""),
                    age = p.optString("age", ""),
                    marketValue = p.optString("market_value", ""),
                    url = url,
                    transfermarktUrl = tmUrl,
                    league = p.optString("league", ""),
                    club = p.optString("club", null).takeIf { !it.isNullOrBlank() },
                    citizenship = p.optString("citizenship", ""),
                    foot = p.optString("foot", ""),
                    height = p.optString("height", ""),
                    contract = p.optString("contract", ""),
                    playingStyle = p.optString("playing_style", null).takeIf { !it.isNullOrBlank() },
                    findNextScore = p.optInt("find_next_score", 0),
                    signatureMatch = p.optInt("signature_match", 0),
                    styleMatchBonus = p.optInt("style_match_bonus", 0),
                    valueGapBonus = p.optInt("value_gap_bonus", 0),
                    contractBonus = p.optInt("contract_bonus", 0),
                    ageBonus = p.optInt("age_bonus", 0),
                    explanation = p.optString("explanation", ""),
                    scoutNarrative = p.optString("scout_narrative", null).takeIf { !it.isNullOrBlank() }
                )
            )
        }

        return FindNextResponse(
            referencePlayer = referencePlayer,
            signatureStats = signatureStats.ifEmpty { null },
            results = results,
            resultCount = obj.optInt("result_count", results.size),
            totalCandidatesScanned = obj.optInt("total_candidates_scanned", 0).takeIf { it > 0 },
            error = obj.optString("error", null).takeIf { !it.isNullOrBlank() }
        )
    }

    private fun parseScoutSearchResponse(json: String): AiScoutSearchResponse {
        val obj = JSONObject(json)
        val results = mutableListOf<ScoutPlayerResult>()
        val arr = obj.optJSONArray("results") ?: JSONArray()

        for (i in 0 until arr.length()) {
            val p = arr.getJSONObject(i)
            // Scout server returns snake_case; support both
            val age = p.optInt("age", 0).takeIf { it > 0 }
                ?: p.optString("age", "").toIntOrNull() ?: 0
            val marketValue = p.optString("marketValue", "").ifBlank {
                p.optString("market_value", "")
            }
            val club = p.optString("club", "").ifBlank {
                p.optString("currentClub", p.optString("current_club", ""))
            }
            val nationality = p.optString("nationality", "").ifBlank {
                p.optString("country", p.optString("citizenship", ""))
            }
            val transfermarktUrl = p.optString("transfermarktUrl", "").ifBlank {
                p.optString("tmProfileUrl", p.optString("url", ""))
            }
            val matchPercent = p.optInt("matchPercent", -1).takeIf { it >= 0 }
                ?: p.optInt("score", -1).takeIf { it >= 0 }
                ?: p.optInt("smart_score", -1).takeIf { it >= 0 }
                ?: p.optInt("scouting_score", -1).takeIf { it >= 0 }
                ?: (p.optDouble("similarity_score", -1.0).takeIf { it >= 0 }?.times(100)?.toInt())
                ?: 0
            val scoutAnalysis = p.optString("scoutAnalysis", "").ifBlank {
                p.optString("analysis", p.optString("explanation", ""))
            }
            results.add(
                ScoutPlayerResult(
                    name = p.optString("name", "Unknown"),
                    position = p.optString("position", ""),
                    age = age,
                    marketValue = marketValue,
                    club = club,
                    nationality = nationality,
                    transfermarktUrl = transfermarktUrl,
                    matchPercent = matchPercent.coerceIn(0, 100),
                    scoutAnalysis = scoutAnalysis,
                    fmCurrentAbility = p.optIntOrNull("fmCurrentAbility") ?: p.optIntOrNull("fmCa") ?: p.optIntOrNull("fm_ca"),
                    fmPotentialAbility = p.optIntOrNull("fmPotentialAbility") ?: p.optIntOrNull("fmPa") ?: p.optIntOrNull("fm_pa"),
                    fmTier = (p.optString("fmTier", "").ifBlank { p.optString("fm_tier", "") }).takeIf { it.isNotBlank() },
                    imageUrl = (p.optString("imageUrl", "").ifBlank { p.optString("image_url", "") }).takeIf { it.isNotBlank() },
                    scoreBreakdown = p.optJSONObject("scoreBreakdown")?.let { sb ->
                        ScoreBreakdown(
                            clubFit = sb.optIntOrNull("clubFit"),
                            realism = sb.optIntOrNull("realism"),
                            noteFit = sb.optIntOrNull("noteFit")
                        )
                    } ?: p.optJSONObject("score_breakdown")?.let { sb ->
                        ScoreBreakdown(
                            clubFit = sb.optIntOrNull("clubFit") ?: sb.optIntOrNull("club_fit"),
                            realism = sb.optIntOrNull("realism") ?: sb.optIntOrNull("realism_score"),
                            noteFit = sb.optIntOrNull("noteFit") ?: sb.optIntOrNull("note_fit_score")
                        )
                    }
                )
            )
        }

        val leagueInfo = obj.optJSONObject("leagueInfo")?.let { li ->
            LeagueInfo(
                name = li.optString("name", ""),
                avgValue = li.optString("avgValue", null),
                minValue = li.optString("minValue", null),
                maxValue = li.optString("maxValue", null)
            )
        }

        return AiScoutSearchResponse(
            results = results,
            interpretation = obj.optString("interpretation", ""),
            query = obj.optString("query", ""),
            leagueInfo = leagueInfo,
            hasMore = obj.optBoolean("hasMore", false),
            requestedTotal = obj.optInt("requestedTotal", results.size),
            searchMethod = obj.optString("searchMethod", "")
        )
    }

    private fun parseDiscoveryResponse(json: String): DiscoveryResponse {
        val obj = JSONObject(json)
        val candidates = mutableListOf<DiscoveryCandidate>()
        val arr = obj.optJSONArray("candidates") ?: JSONArray()

        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            candidates.add(
                DiscoveryCandidate(
                    name = c.optString("name", "Unknown"),
                    position = c.optString("position", ""),
                    age = c.optInt("age", 0),
                    marketValue = c.optString("marketValue", ""),
                    transfermarktUrl = c.optString("transfermarktUrl", ""),
                    club = c.optString("club", c.optString("currentClub", "")),
                    nationality = c.optString("nationality", ""),
                    source = c.optString("source", "general"),
                    sourceLabel = c.optString("sourceLabel", ""),
                    hiddenGemScore = c.optIntOrNull("hiddenGemScore"),
                    hiddenGemReason = parseHiddenGemReason(c),
                    fmPotentialAbility = c.optIntOrNull("fmPa") ?: c.optIntOrNull("fmPotentialAbility"),
                    fmCurrentAbility = c.optIntOrNull("fmCa") ?: c.optIntOrNull("fmCurrentAbility"),
                    fmGap = c.optIntOrNull("fmGap") ?: c.optIntOrNull("fmPotentialGap"),
                    goalsPerNinety = c.optDoubleOrNull("fbrefGoalsPer90") ?: c.optDoubleOrNull("goalsPerNinety") ?: c.optDoubleOrNull("gPer90"),
                    assistsPerNinety = c.optDoubleOrNull("fbrefAssistsPer90") ?: c.optDoubleOrNull("assistsPerNinety") ?: c.optDoubleOrNull("aPer90"),
                    scoutNarrative = c.optString("scoutNarrative", null),
                    matchScore = c.optIntOrNull("matchScore"),
                    profileType = c.optString("profileType", null),
                    agentId = c.optString("agentId", null),
                    imageUrl = c.optString("profileImage", c.optString("imageUrl", null))
                )
            )
        }

        return DiscoveryResponse(
            candidates = candidates,
            count = obj.optInt("count", candidates.size),
            updatedAt = obj.optString("updatedAt", "")
        )
    }

    private fun parseScoutProfilesResponse(json: String): ScoutProfilesResponse {
        val obj = JSONObject(json)
        val profiles = mutableListOf<ScoutProfile>()
        val arr = obj.optJSONArray("profiles") ?: JSONArray()

        val isHebrew = LocaleManager.isHebrew(context)

        for (i in 0 until arr.length()) {
            val p = arr.getJSONObject(i)

            // Build explanation: prefer locale-aware scoutExplanation, fall back to matchReason
            val matchReason = p.optString("matchReason", "")
            val scoutExplanation = if (isHebrew) p.optString("scoutExplanationHe", "") else p.optString("scoutExplanationEn", "")
            val explanation = scoutExplanation.ifBlank { matchReason }

            profiles.add(
                ScoutProfile(
                    id = p.optString("id", ""),
                    name = p.optString("playerName", p.optString("name", "Unknown")),
                    position = p.optString("position", ""),
                    age = p.optInt("age", 0),
                    marketValue = p.optString("marketValue", ""),
                    club = p.optString("club", ""),
                    nationality = p.optString("nationality", ""),
                    transfermarktUrl = p.optString("tmProfileUrl", p.optString("transfermarktUrl", "")),
                    agentId = p.optString("agentId", ""),
                    agentName = p.optString("agentName", p.optString("agentId", "")),
                    agentNameHe = p.optString("agentNameHe", p.optString("agentName", p.optString("agentId", ""))),
                    matchScore = p.optInt("matchScore", 0),
                    profileType = p.optString("profileType", ""),
                    profileTypeLabel = if (isHebrew) p.optString("profileTypeLabelHe", p.optString("profileTypeLabel", p.optString("profileType", ""))) else p.optString("profileTypeLabel", p.optString("profileType", "")),
                    explanation = explanation,
                    imageUrl = p.optString("profileImage", null)
                )
            )
        }

        return ScoutProfilesResponse(
            profiles = profiles,
            total = obj.optInt("totalCount", obj.optInt("total", profiles.size))
        )
    }

    private fun parseReportResponse(json: String): WarRoomReportResponse {
        val obj = JSONObject(json)

        Log.d(TAG, "Report response keys: ${obj.keys().asSequence().toList()}")

        val synthesisObj = obj.optJSONObject("synthesis") ?: JSONObject()
        val statsObj = obj.optJSONObject("stats") ?: JSONObject()
        val marketObj = obj.optJSONObject("market") ?: JSONObject()
        val tacticsObj = obj.optJSONObject("tactics") ?: JSONObject()

        // API returns snake_case fields and player info is NOT at top level.
        // recommendation, confidence, oneLiner, timeline live inside synthesis.
        return WarRoomReportResponse(
            playerName = obj.optString("playerName", obj.optString("player_name", "")),
            position = obj.optString("position", ""),
            age = obj.optInt("age", 0),
            marketValue = obj.optString("marketValue", obj.optString("market_value", "")),
            club = obj.optString("club", ""),
            nationality = obj.optString("nationality", ""),
            recommendation = synthesisObj.optString("recommendation", obj.optString("recommendation", "MONITOR")),
            confidencePercent = synthesisObj.optInt("confidence_level", synthesisObj.optInt("confidencePercent", obj.optInt("confidencePercent", 0))),
            oneLiner = synthesisObj.optString("one_liner", synthesisObj.optString("oneLiner", obj.optString("oneLiner", ""))),
            timeline = synthesisObj.optString("action_timeline", synthesisObj.optString("timeline", obj.optString("timeline", ""))),
            synthesis = SynthesisReport(
                summary = synthesisObj.optString("executive_summary", synthesisObj.optString("summary", "")),
                risks = synthesisObj.optJSONArray("key_risks")?.toStringList()
                    ?: synthesisObj.optJSONArray("risks")?.toStringList() ?: emptyList(),
                opportunities = synthesisObj.optJSONArray("key_opportunities")?.toStringList()
                    ?: synthesisObj.optJSONArray("opportunities")?.toStringList() ?: emptyList()
            ),
            stats = StatsReport(
                analysis = statsObj.optString("summary", statsObj.optString("analysis", "")),
                strengths = statsObj.optJSONArray("strengths")?.toStringList() ?: emptyList(),
                weaknesses = statsObj.optJSONArray("weaknesses")?.toStringList() ?: emptyList(),
                keyMetrics = statsObj.optJSONArray("key_metrics")?.toStringList()
                    ?: statsObj.optJSONArray("keyMetrics")?.toStringList() ?: emptyList()
            ),
            market = MarketReport(
                analysis = marketObj.optString("summary", marketObj.optString("analysis", "")),
                marketPosition = marketObj.optString("market_position", marketObj.optString("marketPosition", "")),
                currentValue = marketObj.optString("current_value", marketObj.optString("currentValue", "")),
                comparableRange = marketObj.optString("comparable_range", marketObj.optString("comparableRange", "")),
                contractLeverage = marketObj.optString("contract_leverage", marketObj.optString("contractLeverage", "")),
                suggestedBid = marketObj.optString("suggested_bid", marketObj.optString("suggestedBid", ""))
            ),
            tactics = TacticsReport(
                analysis = tacticsObj.optString("summary", tacticsObj.optString("analysis", "")),
                bestRole = tacticsObj.optString("best_role", tacticsObj.optString("bestRole", "")),
                bestSystem = tacticsObj.optString("best_system", tacticsObj.optString("bestSystem", "")),
                leagueFit = tacticsObj.optString("ligat_haal_fit", tacticsObj.optString("league_fit", tacticsObj.optString("leagueFit", ""))),
                comparison = tacticsObj.optString("comparison_player", tacticsObj.optString("comparison", "")),
                bestClubFit = tacticsObj.optJSONArray("club_fit")?.toStringList()
                    ?: tacticsObj.optJSONArray("bestClubFit")?.toStringList() ?: emptyList()
            )
        )
    }

    // ─── Extension helpers ─────────────────────────────────────────────────

    /** hiddenGemReason can be a string OR {he, en} object */
    private fun parseHiddenGemReason(c: JSONObject): String? {
        if (!c.has("hiddenGemReason") || c.isNull("hiddenGemReason")) return null
        return try {
            val obj = c.optJSONObject("hiddenGemReason")
            if (obj != null) {
                val isHebrew = LocaleManager.isHebrew(context)
                if (isHebrew) obj.optString("he", obj.optString("en", "")) else obj.optString("en", "")
            } else {
                c.optString("hiddenGemReason", null)
            }
        } catch (_: Exception) {
            c.optString("hiddenGemReason", null)
        }
    }

    private fun JSONObject.optIntOrNull(key: String): Int? =
        if (has(key) && !isNull(key)) optInt(key) else null

    private fun JSONObject.optDoubleOrNull(key: String): Double? =
        if (has(key) && !isNull(key)) optDouble(key).takeIf { !it.isNaN() } else null

    private fun JSONArray.toStringList(): List<String> {
        val list = mutableListOf<String>()
        for (i in 0 until length()) {
            list.add(optString(i, ""))
        }
        return list
    }

    private suspend fun OkHttpClient.newCallAsync(request: Request): Response =
        suspendCancellableCoroutine { cont ->
            val call = newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onResponse(call: Call, response: Response) {
                    cont.resume(response)
                }
                override fun onFailure(call: Call, e: IOException) {
                    cont.resumeWithException(e)
                }
            })
        }
}
