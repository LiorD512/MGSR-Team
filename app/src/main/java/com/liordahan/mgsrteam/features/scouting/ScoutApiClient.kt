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
        // Default for local testing (Android emulator → host machine)
        const val DEFAULT_BASE_URL = "http://10.0.2.2:8123"
        // For physical device on same Wi-Fi, use the machine's IP
        // const val DEFAULT_BASE_URL = "http://192.168.x.x:8123"
    }

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(5, 1, TimeUnit.MINUTES))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
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
     * Calls /recruitment with filters.
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
        excludeUrls: Set<String> = emptySet(),
        lang: String = "en",
        sortBy: String = "score",
        limit: Int = 15
    ): Result<List<AiHelperService.SimilarPlayerSuggestion>> = runCatching {
        val params = buildList {
            position?.let { add("position=${encode(it)}") }
            ageMin?.let { add("age_min=$it") }
            ageMax?.let { add("age_max=$it") }
            foot?.let { add("foot=${encode(it)}") }
            valueMax?.let { add("value_max=$it") }
            notes?.takeIf { it.isNotBlank() }?.let { add("notes=${encode(it)}") }
            transferFee?.takeIf { it.isNotBlank() }?.let { add("transfer_fee=${encode(it)}") }
            if (excludeUrls.isNotEmpty()) {
                add("exclude_urls=${encode(excludeUrls.joinToString(","))}")
            }
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
            |│ valueMax: $valueMax
            |│ notes: $notes
            |│ transferFee: $transferFee
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
     * Parse server results JSON into the SimilarPlayerSuggestion type used by existing UI.
     */
    private fun parseSimilarPlayerSuggestions(json: JSONObject): List<AiHelperService.SimilarPlayerSuggestion> {
        val arr = json.optJSONArray("results") ?: return emptyList()
        return (0 until arr.length()).map { i ->
            val p = arr.getJSONObject(i)
            val name = p.optString("name", "")
            val position = p.optString("position", "")
            val age = p.optString("age", "")
            val marketValue = p.optString("market_value", "")
            val url = p.optString("url", "")
            val league = p.optString("league", "")
            val scoutingScore = p.optDouble("scouting_score", 0.0)
            val smartScore = p.optDouble("smart_score", 0.0)
            val simScore = p.optDouble("similarity_score", 0.0)

            // Build a reason from available stats
            val playingStyle = p.optString("playing_style", "").takeIf { it.isNotBlank() }
            val explanation = p.optString("explanation", "").takeIf { it.isNotBlank() }
            val effectiveScore = when {
                smartScore > 0 -> smartScore.toInt()
                simScore > 0 -> (simScore * 100).toInt()
                scoutingScore > 0 -> scoutingScore.toInt()
                else -> null
            }

            // Build compact reason (shown in collapsed header or inline)
            val reason = buildString {
                if (playingStyle != null) append(playingStyle)
                if (league.isNotBlank()) {
                    if (isNotBlank()) append(" · ")
                    append(league)
                }
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
                scoutAnalysis = explanation
            )
        }
    }

}
