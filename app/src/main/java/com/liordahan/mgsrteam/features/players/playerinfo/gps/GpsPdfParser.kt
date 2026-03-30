package com.liordahan.mgsrteam.features.players.playerinfo.gps

import android.graphics.Bitmap
import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.Content
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Parses Catapult GPS match report PDFs using Gemini vision to extract per-player data.
 * Handles the standard 4-page Catapult report format:
 * - Page 1: Summary table with all players
 * - Page 3: Detailed breakdown (A+D Effs, HI dist, sprint zone)
 *
 * Returns all player rows found so each player's document can be created individually.
 */
object GpsPdfParser {

    private const val TAG = "GpsPdfParser"
    private const val MODEL_NAME = "gemini-2.5-flash"

    private val GPS_PROMPT = """You are analyzing a Catapult Sports GPS match report PDF for a football/soccer team.

Extract ALL player data from the tables. The report has:
- Page 1: Main metrics table (Tot Dur, Tot Dist, High MP Effs Dist, High MP Effs, Meterage Per Minute, Acc #, Decel #, High Intensity Runs, Sprints Over 25 kph, Max Vel km/h)
- Page 3: Detailed table (A + D Effs, High Intensity Runs, High Intensity 19.8-25 Tot Dist, High Intensity 19.8-25 Dist %, Sprints Over 25 kph, zone 6 Sprint Tot Dist, zone 6 Sprint Dist %, High MP Effs, High MP Effs Dist)

Stars (★) next to values mean the player was BEST on the team for that metric.

Also extract:
- matchTitle: The match title from header (e.g. "MNFC VS ASHDOD")
- matchDate: The date from header in DD/MM/YYYY format
- teamName: The team name (e.g. "MACCABI NETANYA FC")
- teamAverageTotalDist: From "Average" row total distance
- teamAverageMeteragePerMin: From "Average" row meterage per minute
- teamAverageHighIntensityRuns: From "Average" row high intensity runs
- teamAverageSprints: From "Average" row sprints
- teamAverageMaxVelocity: From "Average" row max velocity

For EACH player return:
{
  "playerName": "Full Name",
  "totalDuration": 101,
  "totalDistance": 12160,
  "highMpEffsDist": 856,
  "highMpEffs": 205,
  "meteragePerMinute": 121,
  "accelerations": 82,
  "decelerations": 93,
  "highIntensityRuns": 30,
  "sprints": 4,
  "maxVelocity": 29.1,
  "adEffs": 175,
  "hiDistTotal": 412,
  "hiDistPercent": 3,
  "sprintDistTotal": 92,
  "sprintDistPercent": 1,
  "isStarTotalDist": true,
  "isStarHighMpEffsDist": false,
  "isStarHighMpEffs": false,
  "isStarMeteragePerMin": false,
  "isStarAccelerations": false,
  "isStarHighIntensityRuns": false,
  "isStarSprints": false,
  "isStarMaxVelocity": false
}

Return ONLY a JSON object:
{
  "matchTitle": "MNFC VS ASHDOD",
  "matchDate": "03/12/2025",
  "teamName": "MACCABI NETANYA FC",
  "teamAverageTotalDist": 7285,
  "teamAverageMeteragePerMin": 107,
  "teamAverageHighIntensityRuns": 32,
  "teamAverageSprints": 8,
  "teamAverageMaxVelocity": 29.8,
  "players": [...]
}

IMPORTANT: Include ALL players from the report. Match page 1 and page 3 data by player name. Use integer values for distances and counts. Use decimal for velocities and percentages.
Return ONLY valid JSON. No markdown, no explanation."""

    /**
     * Detect if a document is a GPS report by checking for Catapult-related keywords.
     */
    fun isGpsReport(text: String): Boolean {
        val lower = text.lowercase()
        val catapultMarkers = listOf(
            "catapult", "tot dur", "tot dist", "meterage per minute",
            "high intensity runs", "sprints (over", "max vel",
            "high mp effs", "acc #", "decel #"
        )
        val matchCount = catapultMarkers.count { lower.contains(it) }
        return matchCount >= 4
    }

    /**
     * Parse GPS data from PDF page bitmaps using Gemini vision.
     * @param pages List of page bitmaps (at least page 1 and page 3)
     * @return Parsed GPS report with all players, or null on failure
     */
    suspend fun parseFromBitmaps(pages: List<Bitmap>): GpsReportResult? = withContext(Dispatchers.IO) {
        try {
            val contentBuilder = Content.Builder()
            pages.forEach { bitmap -> contentBuilder.image(bitmap) }
            contentBuilder.text(GPS_PROMPT)
            val content = contentBuilder.build()

            val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                modelName = MODEL_NAME,
                generationConfig = generationConfig {
                    responseMimeType = "application/json"
                }
            )

            val response = model.generateContent(listOf(content))
            val text = response.text ?: return@withContext null
            parseJsonResponse(text)
        } catch (e: Exception) {
            Log.e(TAG, "Gemini GPS parsing failed", e)
            null
        }
    }

    /**
     * Parse GPS data from raw PDF bytes using Gemini.
     * Preferred if the model supports raw document input.
     */
    suspend fun parseFromBytes(bytes: ByteArray, mimeType: String?): GpsReportResult? = withContext(Dispatchers.IO) {
        try {
            val contentBuilder = Content.Builder()
            contentBuilder.inlineData(bytes, mimeType ?: "application/pdf")
            contentBuilder.text(GPS_PROMPT)
            val content = contentBuilder.build()

            val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                modelName = MODEL_NAME,
                generationConfig = generationConfig {
                    responseMimeType = "application/json"
                }
            )

            val response = model.generateContent(listOf(content))
            val text = response.text ?: return@withContext null
            parseJsonResponse(text)
        } catch (e: Exception) {
            Log.e(TAG, "Gemini GPS bytes parsing failed", e)
            null
        }
    }

    private fun parseJsonResponse(text: String): GpsReportResult? {
        return try {
            val json = JSONObject(text)
            val matchTitle = json.optString("matchTitle", "")
            val matchDateStr = json.optString("matchDate", "")
            val teamName = json.optString("teamName", "")

            val matchDate = try {
                val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.US)
                sdf.parse(matchDateStr)?.time
            } catch (_: Exception) { null }

            val teamAvgDist = json.optInt("teamAverageTotalDist", 0)
            val teamAvgMeterage = json.optInt("teamAverageMeteragePerMin", 0)
            val teamAvgHI = json.optInt("teamAverageHighIntensityRuns", 0)
            val teamAvgSprints = json.optInt("teamAverageSprints", 0)
            val teamAvgMaxVel = json.optDouble("teamAverageMaxVelocity", 0.0)

            val playersArr = json.optJSONArray("players") ?: return null
            val players = mutableListOf<GpsPlayerRow>()

            for (i in 0 until playersArr.length()) {
                val p = playersArr.getJSONObject(i)
                players += GpsPlayerRow(
                    playerName = p.optString("playerName", ""),
                    totalDuration = p.optInt("totalDuration", 0),
                    totalDistance = p.optInt("totalDistance", 0),
                    highMpEffsDist = p.optInt("highMpEffsDist", 0),
                    highMpEffs = p.optInt("highMpEffs", 0),
                    meteragePerMinute = p.optInt("meteragePerMinute", 0),
                    accelerations = p.optInt("accelerations", 0),
                    decelerations = p.optInt("decelerations", 0),
                    highIntensityRuns = p.optInt("highIntensityRuns", 0),
                    sprints = p.optInt("sprints", 0),
                    maxVelocity = p.optDouble("maxVelocity", 0.0),
                    adEffs = p.optInt("adEffs", 0),
                    hiDistTotal = p.optInt("hiDistTotal", 0),
                    hiDistPercent = p.optDouble("hiDistPercent", 0.0),
                    sprintDistTotal = p.optInt("sprintDistTotal", 0),
                    sprintDistPercent = p.optDouble("sprintDistPercent", 0.0),
                    isStarTotalDist = p.optBoolean("isStarTotalDist", false),
                    isStarHighMpEffsDist = p.optBoolean("isStarHighMpEffsDist", false),
                    isStarHighMpEffs = p.optBoolean("isStarHighMpEffs", false),
                    isStarMeteragePerMin = p.optBoolean("isStarMeteragePerMin", false),
                    isStarAccelerations = p.optBoolean("isStarAccelerations", false),
                    isStarHighIntensityRuns = p.optBoolean("isStarHighIntensityRuns", false),
                    isStarSprints = p.optBoolean("isStarSprints", false),
                    isStarMaxVelocity = p.optBoolean("isStarMaxVelocity", false)
                )
            }

            GpsReportResult(
                matchTitle = matchTitle,
                matchDate = matchDate,
                matchDateStr = matchDateStr,
                teamName = teamName,
                teamAverageTotalDist = teamAvgDist,
                teamAverageMeteragePerMin = teamAvgMeterage,
                teamAverageHighIntensityRuns = teamAvgHI,
                teamAverageSprints = teamAvgSprints,
                teamAverageMaxVelocity = teamAvgMaxVel,
                players = players
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse GPS JSON response", e)
            null
        }
    }

    /**
     * Find matching player row by name (fuzzy match).
     * Handles variations like "Momo Djetei" vs "Mohamed Djetei" by matching last name.
     */
    fun findPlayerRow(report: GpsReportResult, playerName: String): GpsPlayerRow? {
        val normalized = playerName.trim().lowercase()
        // Exact match first
        report.players.firstOrNull { it.playerName.trim().lowercase() == normalized }
            ?.let { return it }
        // Last name match
        val lastName = normalized.split(" ").lastOrNull() ?: return null
        return report.players.firstOrNull {
            it.playerName.trim().lowercase().split(" ").lastOrNull() == lastName
        }
    }
}

data class GpsReportResult(
    val matchTitle: String,
    val matchDate: Long?,
    val matchDateStr: String,
    val teamName: String,
    val teamAverageTotalDist: Int,
    val teamAverageMeteragePerMin: Int,
    val teamAverageHighIntensityRuns: Int,
    val teamAverageSprints: Int,
    val teamAverageMaxVelocity: Double,
    val players: List<GpsPlayerRow>
)

data class GpsPlayerRow(
    val playerName: String,
    val totalDuration: Int,
    val totalDistance: Int,
    val highMpEffsDist: Int,
    val highMpEffs: Int,
    val meteragePerMinute: Int,
    val accelerations: Int,
    val decelerations: Int,
    val highIntensityRuns: Int,
    val sprints: Int,
    val maxVelocity: Double,
    val adEffs: Int = 0,
    val hiDistTotal: Int = 0,
    val hiDistPercent: Double = 0.0,
    val sprintDistTotal: Int = 0,
    val sprintDistPercent: Double = 0.0,
    val isStarTotalDist: Boolean = false,
    val isStarHighMpEffsDist: Boolean = false,
    val isStarHighMpEffs: Boolean = false,
    val isStarMeteragePerMin: Boolean = false,
    val isStarAccelerations: Boolean = false,
    val isStarHighIntensityRuns: Boolean = false,
    val isStarSprints: Boolean = false,
    val isStarMaxVelocity: Boolean = false
) {
    fun toGpsMatchData(
        playerTmProfile: String?,
        matchTitle: String,
        matchDate: Long?,
        matchDateStr: String,
        documentId: String?,
        storageUrl: String?,
        teamAvgDist: Int,
        teamAvgMeterage: Int,
        teamAvgHI: Int,
        teamAvgSprints: Int,
        teamAvgMaxVel: Double
    ) = GpsMatchData(
        playerName = playerName,
        playerTmProfile = playerTmProfile,
        matchTitle = matchTitle,
        matchDate = matchDate,
        matchDateStr = matchDateStr,
        documentId = documentId,
        storageUrl = storageUrl,
        totalDuration = totalDuration,
        totalDistance = totalDistance,
        highMpEffsDist = highMpEffsDist,
        highMpEffs = highMpEffs,
        meteragePerMinute = meteragePerMinute,
        accelerations = accelerations,
        decelerations = decelerations,
        highIntensityRuns = highIntensityRuns,
        sprints = sprints,
        maxVelocity = maxVelocity,
        adEffs = adEffs,
        hiDistTotal = hiDistTotal,
        hiDistPercent = hiDistPercent,
        sprintDistTotal = sprintDistTotal,
        sprintDistPercent = sprintDistPercent,
        isStarTotalDist = isStarTotalDist,
        isStarHighMpEffsDist = isStarHighMpEffsDist,
        isStarHighMpEffs = isStarHighMpEffs,
        isStarMeteragePerMin = isStarMeteragePerMin,
        isStarAccelerations = isStarAccelerations,
        isStarHighIntensityRuns = isStarHighIntensityRuns,
        isStarSprints = isStarSprints,
        isStarMaxVelocity = isStarMaxVelocity,
        teamAverageTotalDist = teamAvgDist,
        teamAverageMeteragePerMin = teamAvgMeterage,
        teamAverageHighIntensityRuns = teamAvgHI,
        teamAverageSprints = teamAvgSprints,
        teamAverageMaxVelocity = teamAvgMaxVel,
        createdAt = System.currentTimeMillis()
    )
}
