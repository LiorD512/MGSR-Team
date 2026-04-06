package com.liordahan.mgsrteam.features.players.playerinfo.playerstats

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
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

data class PlayerStatsData(
    val name: String = "",
    val position: String = "",
    val league: String = "",
    val club: String = "",
    val age: String = "",
    val apiMatched: Boolean = false,
    val apiRating: Double? = null,
    val apiAppearances: Int? = null,
    val apiLineups: Int? = null,
    val apiMinutes: Int? = null,
    val apiGoals: Int? = null,
    val apiAssists: Int? = null,
    val apiConceded: Int? = null,
    val apiSaves: Int? = null,
    val apiShotsTotal: Int? = null,
    val apiShotsOn: Int? = null,
    val apiPassesTotal: Int? = null,
    val apiPassesKey: Int? = null,
    val apiPassesAccuracy: Double? = null,
    val apiTackles: Int? = null,
    val apiBlocks: Int? = null,
    val apiInterceptions: Int? = null,
    val apiDuelsTotal: Int? = null,
    val apiDuelsWon: Int? = null,
    val apiDribblesAttempts: Int? = null,
    val apiDribblesSuccess: Int? = null,
    val apiFoulsDrawn: Int? = null,
    val apiFoulsCommitted: Int? = null,
    val apiCardsYellow: Int? = null,
    val apiCardsRed: Int? = null,
    val apiPenaltyScored: Int? = null,
    val apiPenaltyMissed: Int? = null,
    // Per-90 stats
    val apiGoalsPer90: Double? = null,
    val apiAssistsPer90: Double? = null,
    val apiGoalContributionsPer90: Double? = null,
    val apiShotsPer90: Double? = null,
    val apiShotsOnTargetPer90: Double? = null,
    val apiGoalsPerShot: Double? = null,
    val apiKeyPassesPer90: Double? = null,
    val apiTacklesInterceptionsPer90: Double? = null,
    val apiFoulsPer90: Double? = null,
    val apiFouledPer90: Double? = null,
    val apiDribblesSuccessPer90: Double? = null,
    val apiDuelsWonPct: Double? = null,
    val apiSavesPer90: Double? = null,
    val apiBlocksPer90: Double? = null,
    // Meta
    val apiTeam: String? = null,
    val apiLeague: String? = null,
    val apiLeagueCountry: String? = null,
    val apiPhoto: String? = null,
    val apiSeason: Int? = null,
)

class PlayerStatsApiClient(
    private val baseUrl: String = DEFAULT_BASE_URL
) {
    companion object {
        private const val TAG = "PlayerStatsApi"
        const val DEFAULT_BASE_URL = "https://football-scout-server-l38w.onrender.com"
    }

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(5, 1, TimeUnit.MINUTES))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .addInterceptor(com.liordahan.mgsrteam.utils.ResponseSizeLimitInterceptor())
        .build()

    suspend fun getPlayerStats(playerUrl: String): PlayerStatsData? = withContext(Dispatchers.IO) {
        val encoded = java.net.URLEncoder.encode(playerUrl, "UTF-8")
        val url = "$baseUrl/player_stats?url=$encoded"
        Log.d(TAG, "Fetching player stats: $url")

        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .build()

        var lastException: Exception? = null
        // Retry once on 502/503 (Render cold start)
        for (attempt in 1..2) {
            try {
                val response = client.newCallAsync(request)
                val body = response.body?.string()

                if (response.code in listOf(502, 503) && attempt < 2) {
                    Log.w(TAG, "Got ${response.code}, retrying (attempt $attempt)...")
                    continue
                }
                if (!response.isSuccessful || body == null) {
                    Log.e(TAG, "HTTP ${response.code} for $url")
                    return@withContext null
                }

                val json = JSONObject(body)
                if (!json.optBoolean("api_matched", false)) {
                    Log.d(TAG, "Player not matched in API-Football")
                    return@withContext null
                }

                return@withContext parseStats(json)
            } catch (e: Exception) {
                lastException = e
                if (attempt < 2) {
                    Log.w(TAG, "Request failed, retrying...", e)
                } else {
                    Log.e(TAG, "getPlayerStats failed after retries", e)
                }
            }
        }
        null
    }

    private fun parseStats(json: JSONObject): PlayerStatsData {
        return PlayerStatsData(
            name = json.optString("name", ""),
            position = json.optString("position", ""),
            league = json.optString("league", ""),
            club = json.optString("club", ""),
            age = json.optString("age", ""),
            apiMatched = json.optBoolean("api_matched", false),
            apiRating = json.optNullDouble("api_rating"),
            apiAppearances = json.optNullInt("api_appearances"),
            apiLineups = json.optNullInt("api_lineups"),
            apiMinutes = json.optNullInt("api_minutes"),
            apiGoals = json.optNullInt("api_goals"),
            apiAssists = json.optNullInt("api_assists"),
            apiConceded = json.optNullInt("api_conceded"),
            apiSaves = json.optNullInt("api_saves"),
            apiShotsTotal = json.optNullInt("api_shots_total"),
            apiShotsOn = json.optNullInt("api_shots_on"),
            apiPassesTotal = json.optNullInt("api_passes_total"),
            apiPassesKey = json.optNullInt("api_passes_key"),
            apiPassesAccuracy = json.optNullDouble("api_passes_accuracy"),
            apiTackles = json.optNullInt("api_tackles"),
            apiBlocks = json.optNullInt("api_blocks"),
            apiInterceptions = json.optNullInt("api_interceptions"),
            apiDuelsTotal = json.optNullInt("api_duels_total"),
            apiDuelsWon = json.optNullInt("api_duels_won"),
            apiDribblesAttempts = json.optNullInt("api_dribbles_attempts"),
            apiDribblesSuccess = json.optNullInt("api_dribbles_success"),
            apiFoulsDrawn = json.optNullInt("api_fouls_drawn"),
            apiFoulsCommitted = json.optNullInt("api_fouls_committed"),
            apiCardsYellow = json.optNullInt("api_cards_yellow"),
            apiCardsRed = json.optNullInt("api_cards_red"),
            apiPenaltyScored = json.optNullInt("api_penalty_scored"),
            apiPenaltyMissed = json.optNullInt("api_penalty_missed"),
            apiGoalsPer90 = json.optNullDouble("api_goals_per90"),
            apiAssistsPer90 = json.optNullDouble("api_assists_per90"),
            apiGoalContributionsPer90 = json.optNullDouble("api_goal_contributions_per90"),
            apiShotsPer90 = json.optNullDouble("api_shots_per90"),
            apiShotsOnTargetPer90 = json.optNullDouble("api_shots_on_target_per90"),
            apiGoalsPerShot = json.optNullDouble("api_goals_per_shot"),
            apiKeyPassesPer90 = json.optNullDouble("api_key_passes_per90"),
            apiTacklesInterceptionsPer90 = json.optNullDouble("api_tackles_interceptions_per90"),
            apiFoulsPer90 = json.optNullDouble("api_fouls_per90"),
            apiFouledPer90 = json.optNullDouble("api_fouled_per90"),
            apiDribblesSuccessPer90 = json.optNullDouble("api_dribbles_success_per90"),
            apiDuelsWonPct = json.optNullDouble("api_duels_won_pct"),
            apiSavesPer90 = json.optNullDouble("api_saves_per90"),
            apiBlocksPer90 = json.optNullDouble("api_blocks_per90"),
            apiTeam = json.optNullString("api_team"),
            apiLeague = json.optNullString("api_league"),
            apiLeagueCountry = json.optNullString("api_league_country"),
            apiPhoto = json.optNullString("api_photo"),
            apiSeason = json.optNullInt("api_season"),
        )
    }

    private fun JSONObject.optNullDouble(key: String): Double? =
        if (has(key) && !isNull(key)) optDouble(key).takeIf { !it.isNaN() } else null

    private fun JSONObject.optNullInt(key: String): Int? =
        if (has(key) && !isNull(key)) optInt(key) else null

    private fun JSONObject.optNullString(key: String): String? =
        if (has(key) && !isNull(key)) optString(key).takeIf { it.isNotEmpty() } else null

    private suspend fun OkHttpClient.newCallAsync(request: Request): Response =
        suspendCancellableCoroutine { cont ->
            val call = newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }
                override fun onResponse(call: Call, response: Response) {
                    if (cont.isActive) cont.resume(response)
                }
            })
        }
}
