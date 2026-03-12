package com.liordahan.mgsrteam.features.scouting

import android.util.Log
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * HTTP client for the football scouting server.
 * Talks to the local Python FastAPI server running on the configured host.
 */
class ScoutApiClient(private val baseUrl: String = DEFAULT_BASE_URL) {

    companion object {
        private const val TAG = "ScoutApiClient"
        // Production server on Render
        const val DEFAULT_BASE_URL = "https://football-scout-server-l38w.onrender.com"
        // For local testing (Android emulator → host machine):
        // const val DEFAULT_BASE_URL = "http://10.0.2.2:8123"
    }

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(5, 1, TimeUnit.MINUTES))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .addInterceptor(com.liordahan.mgsrteam.utils.ResponseSizeLimitInterceptor())
        .build()

    // ── Similar players (for PlayerInfo screen) ──

    /**
     * Find players similar to the given Transfermarkt profile URL.
     * Calls /similar_players?player_url=...
     * Returns results mapped to the existing SimilarPlayerSuggestion type.
     */
    suspend fun findSimilarPlayers(tmProfileUrl: String, lang: String = "en", excludeNames: List<String> = emptyList()): Result<List<AiHelperService.SimilarPlayerSuggestion>> = runCatching {
        val urlBuilder = StringBuilder("$baseUrl/similar_players?player_url=${encode(tmProfileUrl)}&lang=${encode(lang)}")
        if (excludeNames.isNotEmpty()) {
            urlBuilder.append("&exclude=${encode(excludeNames.joinToString(","))}")
        }
        val url = urlBuilder.toString()
        Log.d(TAG, """┌── findSimilarPlayers REQUEST ──
            |│ URL: $url
            |│ tmProfileUrl: $tmProfileUrl
            |└──────────────────────────────""".trimMargin())
        val json = fetch(url)
        val results = parseSimilarPlayerSuggestions(json)
        Log.d(TAG, """┌── findSimilarPlayers RESPONSE ──
            |│ Status: SUCCESS
            |│ Results count: ${results.size}
            |│ Raw JSON keys: ${json.keys().asSequence().toList()}
            |${results.mapIndexed { i, r -> "│ [$i] ${r.name} | ${r.position} | age ${r.age} | ${r.marketValue} | reason: ${r.similarityReason?.take(80)}" }.joinToString("\n")}
            |└──────────────────────────────""".trimMargin())
        results
    }.also { result ->
        if (result.isFailure) {
            Log.e(TAG, "findSimilarPlayers FAILED for $tmProfileUrl", result.exceptionOrNull())
        }
    }

    // ── Recruitment search (for Requests screen) ──

    /**
     * Find players matching request criteria (position, age, foot, value).
     * Calls /recruitment with filters + club context for professional scouting.
     * Returns results mapped to the existing SimilarPlayerSuggestion type.
     */
    suspend fun findPlayersForRequest(
        position: String? = null,
        ageMin: Int? = null,
        ageMax: Int? = null,
        foot: String? = null,
        valueMax: Double? = null,
        notes: String? = null,
        transferFee: String? = null,
        salaryRange: String? = null,
        requestId: String? = null,
        excludeUrls: Set<String> = emptySet(),
        lang: String = "en",
        sortBy: String = "score",
        limit: Int = 15,
        // Club context for professional scouting
        clubUrl: String? = null,
        clubName: String? = null,
        clubCountry: String? = null,
    ): Result<List<AiHelperService.SimilarPlayerSuggestion>> = runCatching {
        val params = buildList {
            position?.let { add("position=${encode(it)}") }
            ageMin?.let { add("age_min=$it") }
            ageMax?.let { add("age_max=$it") }
            foot?.let { add("foot=${encode(it)}") }
            valueMax?.let { add("value_max=$it") }
            notes?.takeIf { it.isNotBlank() }?.let { add("notes=${encode(it)}") }
            transferFee?.takeIf { it.isNotBlank() }?.let { add("transfer_fee=${encode(it)}") }
            salaryRange?.takeIf { it.isNotBlank() }?.let { add("salary_range=${encode(it)}") }
            requestId?.takeIf { it.isNotBlank() }?.let { add("request_id=${encode(it)}") }
            if (excludeUrls.isNotEmpty()) {
                add("exclude_urls=${encode(excludeUrls.joinToString(","))}")
            }
            // Club context params
            clubUrl?.takeIf { it.isNotBlank() }?.let { add("club_url=${encode(it)}") }
            clubName?.takeIf { it.isNotBlank() }?.let { add("club_name=${encode(it)}") }
            clubCountry?.takeIf { it.isNotBlank() }?.let { add("club_country=${encode(it)}") }
            add("lang=$lang")
            add("sort_by=$sortBy")
            add("limit=$limit")
        }
        val url = "$baseUrl/recruitment?${params.joinToString("&")}"
        Log.d(TAG, """┌── findPlayersForRequest REQUEST ──
            |│ URL: $url
            |│ position: $position
            |│ ageMin: $ageMin, ageMax: $ageMax
            |│ foot: $foot
            |│ notes: $notes
            |│ transferFee: $transferFee
            |│ salaryRange: $salaryRange
            |│ requestId: $requestId
            |│ club: $clubName ($clubCountry) | URL: $clubUrl
            |│ lang: $lang, sortBy: $sortBy, limit: $limit
            |└──────────────────────────────""".trimMargin())
        val json = fetch(url)
        val results = parseSimilarPlayerSuggestions(json)
        Log.d(TAG, """┌── findPlayersForRequest RESPONSE ──
            |│ Status: SUCCESS
            |│ Results count: ${results.size}
            |│ Raw JSON keys: ${json.keys().asSequence().toList()}
            |${results.mapIndexed { i, r -> "│ [$i] ${r.name} | ${r.position} | age ${r.age} | ${r.marketValue} | reason: ${r.similarityReason?.take(80)}" }.joinToString("\n")}
            |└──────────────────────────────""".trimMargin())
        results
    }.also { result ->
        if (result.isFailure) {
            Log.e(TAG, "findPlayersForRequest FAILED", result.exceptionOrNull())
        }
    }

    // ── private helpers ──

    /**
     * Fetch FM Intelligence data for a player.
     * Calls /fm_intelligence?player_name=...&club=...&age=...
     * Returns null if no data is found.
     */
    suspend fun getFmIntelligence(
        playerName: String,
        club: String? = null,
        age: String? = null
    ): JSONObject? = try {
        val params = buildList {
            add("player_name=${encode(playerName)}")
            club?.takeIf { it.isNotBlank() }?.let { add("club=${encode(it)}") }
            age?.takeIf { it.isNotBlank() }?.let { add("age=${encode(it)}") }
        }
        val url = "$baseUrl/fm_intelligence?${params.joinToString("&")}"
        Log.d(TAG, "getFmIntelligence: $url")
        val json = fetch(url)
        if (json.has("error")) null else json
    } catch (e: Exception) {
        Log.e(TAG, "getFmIntelligence failed for $playerName", e)
        null
    }

    private suspend fun fetch(url: String): JSONObject {
        val html = executeRequest(url)
        return JSONObject(html)
    }

    private suspend fun executeRequest(url: String): String =
        suspendCancellableCoroutine { continuation ->
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .build()
            val call = client.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use { resp ->
                        try {
                            if (!resp.isSuccessful) throw IOException("HTTP ${resp.code} for $url")
                            val body = resp.body?.string() ?: throw IOException("Empty body")
                            continuation.resume(body)
                        } catch (e: Exception) {
                            if (continuation.isActive) continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }

    private fun encode(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    /**
     * Normalize Transfermarkt full position strings to short position codes.
     * e.g. "Midfield - Attacking Midfield" → "AM", "Attack - Centre-Forward" → "CF"
     */
    private fun normalizePositionToCode(rawPosition: String): String {
        val lower = rawPosition.lowercase().trim()

        // Direct short code check
        val directMap = mapOf(
            "goalkeeper" to "GK", "gk" to "GK",
            "centre-back" to "CB", "center-back" to "CB", "cb" to "CB",
            "right-back" to "RB", "rb" to "RB",
            "left-back" to "LB", "lb" to "LB",
            "defensive midfield" to "DM", "dm" to "DM", "cdm" to "DM",
            "central midfield" to "CM", "cm" to "CM",
            "attacking midfield" to "AM", "am" to "AM",
            "left midfield" to "LM", "lm" to "LM",
            "right midfield" to "RM", "rm" to "RM",
            "left winger" to "LW", "lw" to "LW",
            "right winger" to "RW", "rw" to "RW",
            "centre-forward" to "CF", "center-forward" to "CF", "cf" to "CF",
            "second striker" to "SS", "ss" to "SS",
            "striker" to "ST", "st" to "ST",
        )

        // Try direct match
        directMap[lower]?.let { return it }

        // Try "Group - Specific" format: "Midfield - Attacking Midfield"
        val specific = lower.substringAfter(" - ", "").trim()
        if (specific.isNotEmpty()) {
            directMap[specific]?.let { return it }
        }

        // Keyword fallback
        return when {
            "goalkeeper" in lower || "keeper" in lower -> "GK"
            "centre-back" in lower || "center-back" in lower -> "CB"
            "right-back" in lower || "right back" in lower -> "RB"
            "left-back" in lower || "left back" in lower -> "LB"
            "defensive mid" in lower -> "DM"
            "attacking mid" in lower -> "AM"
            "central mid" in lower -> "CM"
            "left mid" in lower -> "LM"
            "right mid" in lower -> "RM"
            "left wing" in lower -> "LW"
            "right wing" in lower -> "RW"
            "centre-forward" in lower || "center-forward" in lower -> "CF"
            "second striker" in lower -> "SS"
            "striker" in lower -> "ST"
            "forward" in lower -> "CF"
            "midfield" in lower -> "CM"
            "defender" in lower || "defence" in lower || "defense" in lower -> "CB"
            else -> rawPosition.trim()
        }
    }

    /**
     * Map league names to their country for display (league · country).
     */
    private fun leagueCountry(league: String): String? {
        val lower = league.lowercase()
        return when {
            lower.contains("championship") || lower.contains("premier league") && lower.contains("eng") -> "England"
            lower.contains("bundesliga") || lower.contains("2 bundesliga") || lower == "2. bundesliga" -> "Germany"
            lower.contains("ligue 2") || lower.contains("championnat national") || lower.contains("ligue 1") -> "France"
            lower.contains("liga portugal") -> "Portugal"
            lower.contains("eredivisie") -> "Netherlands"
            lower.contains("jupiler") || lower.contains("pro league") -> "Belgium"
            lower.contains("süper lig") || lower.contains("super lig") || lower == "1. lig" || lower == "1 lig" -> "Turkey"
            lower.contains("scottish") || lower.contains("premiership") && lower.contains("scot") -> "Scotland"
            lower.contains("superliga") && lower.contains("serb") -> "Serbia"
            lower.contains("hnl") -> "Croatia"
            lower.contains("prva liga") && lower.contains("slov") -> "Slovenia"
            lower.contains("super league") && lower.contains("gre") -> "Greece"
            lower.contains("ekstraklasa") -> "Poland"
            lower.contains("liga 1") && lower.contains("rum") -> "Romania"
            lower.contains("liga i") && (lower.contains("rom") || lower.contains("rum")) -> "Romania"
            lower.contains("parva liga") -> "Bulgaria"
            lower.contains("fortuna liga") || lower.contains("czech") -> "Czech Republic"
            lower.contains("niké liga") || lower.contains("nike liga") -> "Slovakia"
            lower.contains("nb i") || lower.contains("otp") -> "Hungary"
            lower.contains("premier league") && lower.contains("ukr") -> "Ukraine"
            lower.contains("bundesliga") && lower.contains("öster") -> "Austria"
            lower.contains("bundesliga") && lower.contains("aust") -> "Austria"
            lower.contains("super league") && lower.contains("schwe") -> "Switzerland"
            lower.contains("super league") && lower.contains("swiss") -> "Switzerland"
            lower.contains("superligaen") || lower.contains("denmark") -> "Denmark"
            lower.contains("allsvenskan") -> "Sweden"
            lower.contains("eliteserien") -> "Norway"
            lower.contains("veikkausliiga") -> "Finland"
            lower.contains("liga profesional") || lower.contains("superliga") && lower.contains("arg") -> "Argentina"
            lower.contains("primera división") && lower.contains("urug") -> "Uruguay"
            lower.contains("mls") || lower.contains("major league soccer") -> "USA"
            lower.contains("liga mx") -> "Mexico"
            lower.contains("j1 league") || lower.contains("j.league") -> "Japan"
            lower.contains("liga betplay") || lower.contains("colombi") -> "Colombia"
            lower.contains("brasileirão") || lower.contains("brasileirao") -> "Brazil"
            lower.contains("primera") && lower.contains("chile") -> "Chile"
            else -> null
        }
    }

    /**
     * Normalize raw citizenship string:
     * - Transfermarkt uses multi-space separation for dual nationality ("Morocco  Germany")
     * - Normalize to " · " bullet separator.
     */
    private fun normalizeCitizenship(raw: String): String {
        return raw.trim()
            .split("\\s{2,}".toRegex())  // Split on 2+ spaces
            .filter { it.isNotBlank() }
            .joinToString(" · ")
    }

    /**
     * Parse server results JSON into the SimilarPlayerSuggestion type used by existing UI.
     */
    private fun parseSimilarPlayerSuggestions(json: JSONObject): List<AiHelperService.SimilarPlayerSuggestion> {
        val arr = json.optJSONArray("results") ?: return emptyList()
        return (0 until arr.length()).map { i ->
            val p = arr.getJSONObject(i)
            val name = p.optString("name", "")
            val rawPosition = p.optString("position", "")
            val position = normalizePositionToCode(rawPosition)
            val age = p.optString("age", "")
            val marketValue = p.optString("market_value", "")
            val url = p.optString("url", "")
            val rawLeague = p.optString("league", "").takeIf { it.isNotBlank() }
            val country = rawLeague?.let { leagueCountry(it) }
            val league = if (rawLeague != null && country != null) "$rawLeague · $country" else rawLeague
            val club = p.optString("club", "").takeIf { it.isNotBlank() }
            val rawCitizenship = p.optString("citizenship", "").takeIf { it.isNotBlank() }
            val nationality = rawCitizenship?.let { normalizeCitizenship(it) }
            val height = p.optString("height", "").takeIf { it.isNotBlank() }
            val contract = p.optString("contract", "").takeIf { it.isNotBlank() }
            val foot = p.optString("foot", "").takeIf { it.isNotBlank() }
            val scoutingScore = p.optDouble("scouting_score", 0.0)
            val smartScore = p.optDouble("smart_score", 0.0)
            val simScore = p.optDouble("similarity_score", 0.0)

            val playingStyle = p.optString("playing_style", "").takeIf { it.isNotBlank() }
            val serverExplanation = p.optString("explanation", "").takeIf { it.isNotBlank() }
            val clubFit = p.optInt("club_fit_score", -1).takeIf { it >= 0 }
            val realism = p.optInt("realism_score", -1).takeIf { it >= 0 }
            val noteFit = p.optInt("note_fit_score", -1).takeIf { it >= 0 }
            val effectiveScore = when {
                smartScore > 0 -> smartScore.toInt()
                simScore > 0 -> (simScore * 100).toInt()
                scoutingScore > 0 -> scoutingScore.toInt()
                else -> null
            }

            val scoreBreakdown = if (clubFit != null || realism != null || noteFit != null) {
                AiHelperService.SimilarPlayerSuggestion.ScoreBreakdown(
                    clubFit = clubFit,
                    realism = realism,
                    noteFit = noteFit
                )
            } else null

            val scoutAnalysis = serverExplanation
            val reason = buildString {
                if (playingStyle != null) append(playingStyle)
                if (effectiveScore != null) {
                    if (isNotBlank()) append(" · ")
                    append("Match: $effectiveScore%")
                }
            }

            AiHelperService.SimilarPlayerSuggestion(
                name = name,
                position = position,
                age = age,
                marketValue = marketValue,
                transfermarktUrl = url,
                similarityReason = reason.ifBlank { null },
                playingStyle = playingStyle,
                matchPercent = effectiveScore,
                scoutAnalysis = scoutAnalysis,
                league = league,
                club = club,
                nationality = nationality,
                height = height,
                contractEnd = contract,
                foot = foot,
                scoreBreakdown = scoreBreakdown
            )
        }
    }

}
