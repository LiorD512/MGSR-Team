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

    private val GPS_PROMPT = """You are a football/soccer GPS data extraction expert. Extract player physical performance data from ANY format — tables, charts, graphs, or any visual layout.

SUPPORTED FORMATS: Catapult, STATSports, K-Sport, InStat, Kinexon, PlayerMaker, club-specific reports, or any GPS/tracking system output.

WHAT TO LOOK FOR (map ANY column to the closest semantic match):
- totalDuration: Minutes played (e.g. "Tot Dur", "Time", "Minutes", "Min", "TEMPO")
- totalDistance: Total distance in meters (e.g. "Tot Dist", "D", "Total Distance", "Dist", "DIST", "DISTÂNCIA TOTAL")
- highMpEffsDist: High-speed running distance in meters, typically >20 km/h (e.g. "High MP Effs Dist", "D > 20 KM/H", "HSR", "HSRD", "High Speed Running", "High Intensity Dist", "DAV", "HIGH METABOLIC LOAD DISTANCE")
- highMpEffs: Count of high-metabolic-power efforts (0 if not available)
- meteragePerMinute: Distance per minute in meters/min — if not shown, compute as totalDistance / totalDuration (e.g. "Meterage Per Minute", "DREL", "Dist/Min", "m/min", "DISTÂNCIA/MIN"). IMPORTANT: this must be a number in m/min (typically 80-130), NOT a percentage.
- accelerations: Number of accelerations (e.g. "Acc #", "Accelerations", "ACEL", "N ACC")
- decelerations: Number of decelerations (e.g. "Decel #", "Decelerations", "DECEL", "N DEC")
- highIntensityRuns: Count of high-intensity running efforts (0 if not shown)
- sprints: Number of sprints, typically at >25 km/h (e.g. "Sprints", "SPR", "N° > 25 KM/H", "Sprint Count")
- maxVelocity: Peak/maximum speed in km/h (e.g. "Max Vel", "SMAX", "Max Speed", "Top Speed", "TOP SPEED")
- sprintDistTotal: Distance covered at sprint speed in meters (e.g. "Sprint Dist", "SPRD", "D > 25 KM/H", "DISTÂNCIA SPRINT")
- hiDistTotal: Distance in high-speed zone just below sprint (e.g. "D 20-25 KM/H", "HSRD", "DAV 19.8-25 km/h", speed zone 4-6 combined)
- hiDistPercent / sprintDistPercent: Percentage of total distance at high/sprint speed (e.g. "DISTÂNCIA ALTA INTENSIDADE %"). 0 if not shown

For CHARTS: read annotated numbers above/beside bars. If no exact numbers, estimate from Y-axis. Speed zone colors: Walk (lowest) → Jog → Run → High Speed Run → Sprint (highest/often red).

TEAM AVERAGES: Look for a row labeled "Average", "Team Average", "TEAM AVERAGE", "AVG", "MÉDIA EQUIPA" or similar. Extract into teamAverage fields. If a "%" column shows values around 100, those are percentage-of-team-average — ignore those columns.

STAR MARKERS: Stars (★), highlights, or colored cells indicating team-best values → set corresponding isStar* field to true.

MATCH INFO:
- matchTitle: Match/game name from header (e.g. "LEON VS FOLGORE", "Vora Vs Tirana")
- matchDate: Date in DD/MM/YYYY format. Look in headers, titles (e.g. "2026_02_21" → "21/02/2026"), or date columns
- teamName: The team or club name

MULTI-MATCH REPORTS: If one player has multiple rows with different dates (one row per match), output EACH ROW as a separate player entry with the same playerName but a different per-row "matchDate" field.

SINGLE-PLAYER REPORTS: Some reports (especially STATSports individual exports) show data for ONE player across MULTIPLE matches. In these reports:
- Each ROW is a MATCH (e.g. "VLLAZNIA 1-0 EGNATIA", "EGNATIA 2-2 ELBASANI"), not a player
- There is NO player name column — the entire report is about one player
- The header/title shows the latest match (e.g. "MATCH DAY - VLLAZNIA 1-0 EGNATIA")
- A summary section shows aggregate stats (total distance, sprints, etc.)
- Charts show per-match bars/lines for each metric
- A data table on the last page has one row per match

For SINGLE-PLAYER REPORTS, set "isSinglePlayerReport": true and output each match row as a player entry where:
- "playerName" = the match title for that row (e.g. "VLLAZNIA 1-0 EGNATIA (MD)")
- All metric fields contain that match's data
Do NOT use the average/summary row — only individual match rows.

For EACH player/row return:
{
  "playerName": "Full Name",
  "totalDuration": 96,
  "totalDistance": 10430,
  "highMpEffsDist": 668,
  "highMpEffs": 0,
  "meteragePerMinute": 108,
  "accelerations": 0,
  "decelerations": 0,
  "highIntensityRuns": 0,
  "sprints": 8,
  "maxVelocity": 31.5,
  "adEffs": 0,
  "hiDistTotal": 500,
  "hiDistPercent": 0,
  "sprintDistTotal": 168,
  "sprintDistPercent": 0,
  "isStarTotalDist": false,
  "isStarHighMpEffsDist": false,
  "isStarHighMpEffs": false,
  "isStarMeteragePerMin": false,
  "isStarAccelerations": false,
  "isStarHighIntensityRuns": false,
  "isStarSprints": false,
  "isStarMaxVelocity": false,
  "matchDate": "21/02/2026"
}

If the report has only one match date for all players, omit the per-player matchDate field.
Set any field to 0 or false if the data is not available in the report.

Return ONLY a JSON object:
{
  "matchTitle": "LEON VS FOLGORE",
  "matchDate": "21/02/2026",
  "teamName": "FOLGORE",
  "isSinglePlayerReport": false,
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
     * Supports Catapult, K-Sport, STATSports and generic GPS/physical data formats.
     */
    fun isGpsReport(text: String): Boolean {
        val lower = text.lowercase()
        val catapultMarkers = listOf(
            "catapult", "tot dur", "tot dist", "meterage per minute",
            "high intensity runs", "sprints (over", "max vel",
            "high mp effs", "acc #", "decel #"
        )
        if (catapultMarkers.count { lower.contains(it) } >= 4) return true
        // K-Sport reports use abbreviated column headers: DIST, HSRD, SPRD, SPR, SPM, N ACC, ACCD, N DEC, DECD, SMAX
        val kSportMarkers = listOf(
            "k-sport", "smax", "hsrd", "sprd", "n acc", "n dec",
            "accd", "decd", "full match"
        )
        if (kSportMarkers.count { lower.contains(it) } >= 3) return true
        val genericMarkers = listOf(
            "total dist", "sprint dist", "high intensity dist",
            "max speed", "accelerations", "decelerations",
            "time (min)", "total distance", "sprint distance",
            "high speed run", "high intensity", "top speed",
            "distance per min", "distance zone", "dynamic stress load",
            "match day", "smax", "drel", "d > 25", "d > 20", "km/h",
            "k-sport", "full match",
            "dist\u00e2ncia total", "dist\u00e2ncia sprint", "top speed (km/h)",
            "carga externa", "metabolic load", "dist\u00e2ncia/min"
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
            val isSinglePlayerReport = json.optBoolean("isSinglePlayerReport", false)

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
                isSinglePlayerReport = isSinglePlayerReport,
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

    /** Levenshtein edit distance between two strings */
    private fun levenshtein(a: String, b: String): Int {
        val m = a.length; val n = b.length
        val dp = IntArray(n + 1) { it }
        for (i in 1..m) {
            var prev = i - 1
            dp[0] = i
            for (j in 1..n) {
                val tmp = dp[j]
                dp[j] = if (a[i - 1] == b[j - 1]) prev else 1 + minOf(prev, dp[j], dp[j - 1])
                prev = tmp
            }
        }
        return dp[n]
    }

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
        // 6. Levenshtein fuzzy spelling — e.g. "Matias" ≈ "Mathias" (edit distance ≤ 2)
        for (part in nameParts) {
            if (part.length < 3) continue
            report.players.firstOrNull {
                val pName = norm(it.playerName)
                val pParts = pName.split(Regex("\\s+"))
                pParts.any { pp ->
                    pp.length >= 3 && levenshtein(part, pp).let { dist ->
                        dist <= 2 && dist.toDouble() / maxOf(part.length, pp.length) <= 0.3
                    }
                }
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
    val isSinglePlayerReport: Boolean = false,
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
