package com.liordahan.mgsrteam.features.players.playerinfo.gps

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

/**
 * Single-match GPS data for a player extracted from a Catapult GPS report PDF.
 */
@Keep
data class GpsMatchData(
    @DocumentId
    val id: String? = null,
    val playerTmProfile: String? = null,
    val playerName: String? = null,
    val matchTitle: String? = null,       // e.g. "MNFC vs Ashdod"
    val matchDate: Long? = null,          // epoch ms
    val matchDateStr: String? = null,     // original date string e.g. "03/12/2025"
    val documentId: String? = null,       // ref to PlayerDocument that originated this
    val storageUrl: String? = null,       // link to original PDF
    val totalDuration: Int? = null,       // minutes
    val totalDistance: Int? = null,        // meters
    val highMpEffsDist: Int? = null,      // High metabolic power efforts distance (m)
    val highMpEffs: Int? = null,          // High metabolic power efforts count
    val meteragePerMinute: Int? = null,
    val accelerations: Int? = null,
    val decelerations: Int? = null,
    val highIntensityRuns: Int? = null,
    val sprints: Int? = null,             // over 25 kph
    val maxVelocity: Double? = null,      // km/h
    val adEffs: Int? = null,              // acceleration + deceleration efforts combined
    val hiDistTotal: Int? = null,         // high intensity (19.8-25) total dist
    val hiDistPercent: Double? = null,    // high intensity dist %
    val sprintDistTotal: Int? = null,     // zone 6 sprint total dist
    val sprintDistPercent: Double? = null, // zone 6 sprint dist %
    val isStarTotalDist: Boolean = false,
    val isStarHighMpEffsDist: Boolean = false,
    val isStarHighMpEffs: Boolean = false,
    val isStarMeteragePerMin: Boolean = false,
    val isStarAccelerations: Boolean = false,
    val isStarHighIntensityRuns: Boolean = false,
    val isStarSprints: Boolean = false,
    val isStarMaxVelocity: Boolean = false,
    val teamAverageTotalDist: Int? = null,
    val teamAverageMeteragePerMin: Int? = null,
    val teamAverageHighIntensityRuns: Int? = null,
    val teamAverageSprints: Int? = null,
    val teamAverageMaxVelocity: Double? = null,
    val createdAt: Long? = null
)

/**
 * Aggregated GPS summary across multiple matches for a player.
 * Computed client-side from individual GpsMatchData entries.
 */
data class GpsSummary(
    val matchCount: Int,
    val totalMinutesPlayed: Int,
    val avgTotalDistance: Int,
    val avgMeteragePerMinute: Int,
    val avgHighMpEffs: Int,
    val avgHighMpEffsDist: Int,
    val avgAccelerations: Int,
    val avgDecelerations: Int,
    val avgHighIntensityRuns: Int,
    val avgSprints: Int,
    val peakMaxVelocity: Double,
    val avgMaxVelocity: Double,
    val avgHiDistPercent: Double,
    val avgSprintDistPercent: Double,
    val totalStars: Int,
    val matchDataList: List<GpsMatchData>
)

/**
 * A single analysis insight — either positive (strength) or negative (weakness).
 */
data class GpsInsight(
    val type: InsightType,
    val title: String,
    val description: String,
    val value: String,
    val benchmark: String? = null,
    val icon: GpsIcon = GpsIcon.DEFAULT
)

enum class InsightType { STRENGTH, WEAKNESS }

enum class GpsIcon {
    SPEED, DISTANCE, SPRINT, ACCELERATION, INTENSITY, STAMINA, DEFAULT
}
