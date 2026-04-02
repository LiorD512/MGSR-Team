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

    private val GPS_PROMPT = """You are analyzing a football/soccer GPS or physical performance match report.

This may be a Catapult Sports report, a club-specific report, or a VISUAL CHART/GRAPH showing player performance data.

DATA SOURCES — extract from ANY of these:
1. TABLES with columns (Total Dist, Sprint Dist, Max Speed, etc.)
2. BAR CHARTS showing per-player distance with speed zone breakdowns (Walk, Jog, Run, High Speed Run, Sprint)
3. ANNOTATED CHARTS where exact values are written above/beside bars
4. Team comparison charts showing multiple players' metrics side by side
5. Any other visual format showing player physical performance data

For CHARTS: read the annotated numbers (e.g. "11374" above a bar). If no exact numbers, estimate from the Y-axis scale. The speed zone colors in charts map to: Walk = lowest speed, Jog, Run, High Speed Run, Sprint = highest speed.

For bar charts with speed zone breakdowns, map the data as follows:
- Total bar height / annotated total → totalDistance
- Sprint zone (highest speed, often red) → sprintDistTotal
- High Speed Run zone → hiDistTotal / highMpEffsDist
- If an "AVG" value is shown → use it for teamAverageTotalDist
- matchTitle: derive from team names (e.g. "FCSB vs UTA Arad")

Extract ALL player data. Different report formats may have different column names — map them to the standardized output fields below.

Common column mappings:
- "Tot Dur" / "Time (min)" / "Minutes" → totalDuration
- "Tot Dist" / "Total Dist" / "Total Distance" → totalDistance (in meters)
- "High MP Effs Dist" / "High Intensity Dist" → highMpEffsDist
- "High MP Effs" / "High Intensity" → highMpEffs
- "Meterage Per Minute" → meteragePerMinute (compute as totalDistance/totalDuration if not present)
- "Acc #" / "Accelerations" → accelerations
- "Decel #" / "Decelerations" → decelerations
- "High Intensity Runs" → highIntensityRuns
- "Sprints Over 25 kph" / "Sprint Dist" → sprints (count) / sprintDistTotal (distance in meters)
- "Max Vel" / "Max Speed" / "Top Speed" → maxVelocity (in km/h)

Stars (★) next to values mean the player was BEST on the team for that metric.

Also extract:
- matchTitle: The match title from header (e.g. "MNFC VS ASHDOD")
- matchDate: The date from header in DD/MM/YYYY format. If multiple dates, use the most recent.
- teamName: The team or club name
- teamAverageTotalDist: From "Average" row total distance (0 if not available)
- teamAverageMeteragePerMin: From "Average" row meterage per minute (0 if not available)
- teamAverageHighIntensityRuns: From "Average" row high intensity runs (0 if not available)
- teamAverageSprints: From "Average" row sprints (0 if not available)
- teamAverageMaxVelocity: From "Average" row max velocity (0 if not available)

If the report has multiple matches per player (one row per match date), treat EACH ROW as a separate player entry with the same playerName but different dates. Use the row date as matchDate for each.

For EACH player/row return:
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
  "isStarTotalDist": false,
  "isStarHighMpEffsDist": false,
  "isStarHighMpEffs": false,
  "isStarMeteragePerMin": false,
  "isStarAccelerations": false,
  "isStarHighIntensityRuns": false,
  "isStarSprints": false,
  "isStarMaxVelocity": false,
  "matchDate": "17/08/2025"
}

If the report has only one match date for all players, omit the per-player matchDate field.
Set any field to 0 or false if the data is not available in the report.

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

IMPORTANT: Include ALL players/rows from the report. Use integer values for distances and counts. Use decimal for velocities and percentages.
Return ONLY valid JSON. No markdown, no explanation."""

    /**
     * Detect if a document is a GPS report by checking for physical-performance keywords.
     * Supports Catapult reports and generic GPS/physical data formats.
     */
    fun isGpsReport(text: String): Boolean {
        val lower = text.lowercase()
        val catapultMarkers = listOf(
            "catapult", "tot dur", "tot dist", "meterage per minute",
            "high intensity runs", "sprints (over", "max vel",
            "high mp effs", "acc #", "decel #"
        )
        if (catapultMarkers.count { lower.contains(it) } >= 4) return true
        val genericMarkers = listOf(
            "total dist", "sprint dist", "high intensity dist",
            "max speed", "accelerations", "decelerations",
            "time (min)", "total distance", "sprint distance",
            "high speed run", "high intensity", "top speed"
        )
        return genericMarkers.count { lower.contains(it) } >= 3
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
                    isStarMaxVelocity = p.optBoolean("isStarMaxVelocity", false),
                    perRowMatchDate = p.optString("matchDate", null)
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

    /** Strip diacritical marks (accents) — e.g. "Poulolö" → "poulolo" */
    private fun stripAccents(s: String): String =
        java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
            .replace(Regex("[\\u0300-\\u036f]"), "")

    /**
     * Find matching player row by name (fuzzy match).
     * Handles variations like "Momo Djetei" vs "Mohamed Djetei" by matching last name.
     */
    fun findPlayerRow(report: GpsReportResult, playerName: String): GpsPlayerRow? {
        val normalized = stripAccents(playerName.trim().lowercase())
        val nameParts = normalized.split(Regex("\\s+"))
        val lastName = nameParts.lastOrNull() ?: ""
        val firstName = nameParts.firstOrNull() ?: ""

        fun norm(s: String) = stripAccents(s.trim().lowercase())

        // 1. Last name match first — charts often show only last name
        if (lastName.isNotEmpty()) {
            report.players.firstOrNull {
                val pName = norm(it.playerName)
                val pParts = pName.split(Regex("\\s+"))
                pName == lastName || pParts.lastOrNull() == lastName || pParts.firstOrNull() == lastName
            }?.let { return it }
        }
        // 2. Exact full name match
        report.players.firstOrNull { norm(it.playerName) == normalized }
            ?.let { return it }
        // 3. First name match (chart shows first name only, e.g. "Paulo" for "Paulo Henrique")
        if (firstName.isNotEmpty() && firstName != lastName) {
            report.players.firstOrNull {
                val pName = norm(it.playerName)
                pName == firstName || pName.split(Regex("\\s+")).firstOrNull() == firstName
            }?.let { return it }
        }
        // 4. Partial contains match (handles "Popescu37" matching "Popescu")
        for (part in nameParts) {
            if (part.length < 3) continue
            report.players.firstOrNull {
                val pName = norm(it.playerName)
                pName.contains(part) || part.contains(pName)
            }?.let { return it }
        }
        // 5. Fuzzy initial match — "F. Poulolo" or "F Poulolo" matching "Florent Poulolo"
        if (firstName.isNotEmpty() && lastName.isNotEmpty()) {
            val initial = firstName[0]
            report.players.firstOrNull {
                val pName = norm(it.playerName)
                val pParts = pName.split(Regex("[\\s.]+")).filter { p -> p.isNotEmpty() }
                if (pParts.size >= 2) {
                    val pFirst = pParts.first()
                    val pLast = pParts.last()
                    (pFirst.length == 1 && pFirst[0] == initial && pLast == lastName) ||
                        (pLast.length == 1 && pLast[0] == initial && pFirst == lastName)
                } else false
            }?.let { return it }
        }
        return null
    }

    /**
     * Find ALL matching player rows — handles multi-match reports where the same
     * player appears once per match date (e.g. Leixões SC individual reports).
     */
    fun findAllPlayerRows(report: GpsReportResult, playerName: String): List<GpsPlayerRow> {
        val first = findPlayerRow(report, playerName) ?: return emptyList()
        val matchedName = stripAccents(first.playerName.trim().lowercase())
        val all = report.players.filter { stripAccents(it.playerName.trim().lowercase()) == matchedName }
        return if (all.isNotEmpty()) all else listOf(first)
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
    val isStarMaxVelocity: Boolean = false,
    /** Per-row match date for multi-match reports (DD/MM/YYYY string) */
    val perRowMatchDate: String? = null
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
