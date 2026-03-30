package com.liordahan.mgsrteam.features.players.playerinfo.gps

/**
 * Analyzes GPS data across multiple matches and produces actionable insights.
 * Compares player metrics against team averages and absolute benchmarks.
 */
object GpsAnalyzer {

    /** Professional football benchmark averages for a full 90-min match */
    private const val BENCHMARK_TOTAL_DISTANCE = 10500     // meters
    private const val BENCHMARK_METERAGE_PER_MIN = 110
    private const val BENCHMARK_HIGH_INTENSITY_RUNS = 50
    private const val BENCHMARK_SPRINTS = 10
    private const val BENCHMARK_MAX_VELOCITY = 30.0        // km/h
    private const val BENCHMARK_HI_DIST_PERCENT = 6.0
    private const val BENCHMARK_SPRINT_DIST_PERCENT = 2.5
    private const val BENCHMARK_ACCELERATIONS = 100
    private const val BENCHMARK_HIGH_MP_EFFS = 250

    fun buildSummary(matches: List<GpsMatchData>): GpsSummary? {
        if (matches.isEmpty()) return null
        val sorted = matches.sortedByDescending { it.matchDate ?: 0L }

        val totalMinutes = sorted.sumOf { it.totalDuration ?: 0 }
        val count = sorted.size

        return GpsSummary(
            matchCount = count,
            totalMinutesPlayed = totalMinutes,
            avgTotalDistance = sorted.mapNotNull { it.totalDistance }.average().toIntOrZero(),
            avgMeteragePerMinute = sorted.mapNotNull { it.meteragePerMinute }.average().toIntOrZero(),
            avgHighMpEffs = sorted.mapNotNull { it.highMpEffs }.average().toIntOrZero(),
            avgHighMpEffsDist = sorted.mapNotNull { it.highMpEffsDist }.average().toIntOrZero(),
            avgAccelerations = sorted.mapNotNull { it.accelerations }.average().toIntOrZero(),
            avgDecelerations = sorted.mapNotNull { it.decelerations }.average().toIntOrZero(),
            avgHighIntensityRuns = sorted.mapNotNull { it.highIntensityRuns }.average().toIntOrZero(),
            avgSprints = sorted.mapNotNull { it.sprints }.average().toIntOrZero(),
            peakMaxVelocity = sorted.mapNotNull { it.maxVelocity }.maxOrNull() ?: 0.0,
            avgMaxVelocity = sorted.mapNotNull { it.maxVelocity }.average(),
            avgHiDistPercent = sorted.mapNotNull { it.hiDistPercent }.average(),
            avgSprintDistPercent = sorted.mapNotNull { it.sprintDistPercent }.average(),
            totalStars = sorted.sumOf { countStars(it) },
            matchDataList = sorted
        )
    }

    /**
     * Produces a list of strengths and weaknesses from the aggregated GPS data.
     * Only considers matches where the player played 45+ minutes for fair comparison.
     */
    fun analyze(matches: List<GpsMatchData>): List<GpsInsight> {
        val significant = matches.filter { (it.totalDuration ?: 0) >= 45 }
        if (significant.isEmpty()) {
            // Fall back to all matches if none are 45+
            return analyzeMatches(matches)
        }
        return analyzeMatches(significant)
    }

    private fun analyzeMatches(matches: List<GpsMatchData>): List<GpsInsight> {
        if (matches.isEmpty()) return emptyList()

        val insights = mutableListOf<GpsInsight>()

        val avgDist = matches.mapNotNull { it.totalDistance }.average()
        val avgMeterage = matches.mapNotNull { it.meteragePerMinute }.average()
        val avgHI = matches.mapNotNull { it.highIntensityRuns }.average()
        val avgSprints = matches.mapNotNull { it.sprints }.average()
        val peakVel = matches.mapNotNull { it.maxVelocity }.maxOrNull() ?: 0.0
        val avgVel = matches.mapNotNull { it.maxVelocity }.average()
        val avgHiPct = matches.mapNotNull { it.hiDistPercent }.average()
        val avgSprintPct = matches.mapNotNull { it.sprintDistPercent }.average()
        val avgAcc = matches.mapNotNull { it.accelerations }.average()
        val avgMpEffs = matches.mapNotNull { it.highMpEffs }.average()
        val starCount = matches.sumOf { countStars(it) }

        // ── STRENGTHS ──

        if (avgMeterage >= BENCHMARK_METERAGE_PER_MIN) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "High Work Rate",
                description = "Covers ${avgMeterage.toInt()} m/min on average — above the pro benchmark of ${BENCHMARK_METERAGE_PER_MIN} m/min",
                value = "${avgMeterage.toInt()} m/min",
                benchmark = "$BENCHMARK_METERAGE_PER_MIN m/min",
                icon = GpsIcon.STAMINA
            )
        }

        if (avgDist >= BENCHMARK_TOTAL_DISTANCE) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "Elite Distance Coverage",
                description = "Averages ${formatDistance(avgDist.toInt())} total distance per match",
                value = formatDistance(avgDist.toInt()),
                benchmark = formatDistance(BENCHMARK_TOTAL_DISTANCE),
                icon = GpsIcon.DISTANCE
            )
        }

        if (peakVel >= BENCHMARK_MAX_VELOCITY) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "Explosive Top Speed",
                description = "Reached ${"%.1f".format(peakVel)} km/h peak velocity across matches",
                value = "${"%.1f".format(peakVel)} km/h",
                benchmark = "${"%.1f".format(BENCHMARK_MAX_VELOCITY)} km/h",
                icon = GpsIcon.SPEED
            )
        }

        if (avgSprints >= BENCHMARK_SPRINTS) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "Strong Sprint Output",
                description = "Averages ${"%.1f".format(avgSprints)} sprints (>25 km/h) per match",
                value = "${"%.1f".format(avgSprints)}",
                benchmark = "$BENCHMARK_SPRINTS",
                icon = GpsIcon.SPRINT
            )
        }

        if (avgHI >= BENCHMARK_HIGH_INTENSITY_RUNS) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "High-Intensity Machine",
                description = "Makes ${"%.0f".format(avgHI)} high-intensity runs per match on average",
                value = "${"%.0f".format(avgHI)}",
                benchmark = "$BENCHMARK_HIGH_INTENSITY_RUNS",
                icon = GpsIcon.INTENSITY
            )
        }

        if (avgAcc >= BENCHMARK_ACCELERATIONS) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "Active Pressing Player",
                description = "Averages ${"%.0f".format(avgAcc)} accelerations per match — shows constant engagement",
                value = "${"%.0f".format(avgAcc)}",
                benchmark = "$BENCHMARK_ACCELERATIONS",
                icon = GpsIcon.ACCELERATION
            )
        }

        if (avgMpEffs >= BENCHMARK_HIGH_MP_EFFS) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "High Metabolic Output",
                description = "Averages ${"%.0f".format(avgMpEffs)} high metabolic power efforts — versatile movement profile",
                value = "${"%.0f".format(avgMpEffs)}",
                benchmark = "$BENCHMARK_HIGH_MP_EFFS",
                icon = GpsIcon.INTENSITY
            )
        }

        if (starCount > 0 && matches.size > 1) {
            insights += GpsInsight(
                type = InsightType.STRENGTH,
                title = "Team Leader in Key Metrics",
                description = "Earned $starCount ★ team-best marks across ${matches.size} matches",
                value = "$starCount ★",
                icon = GpsIcon.DEFAULT
            )
        }

        // ── WEAKNESSES ──

        if (avgMeterage < BENCHMARK_METERAGE_PER_MIN * 0.9) {
            insights += GpsInsight(
                type = InsightType.WEAKNESS,
                title = "Below Average Work Rate",
                description = "Only ${avgMeterage.toInt()} m/min vs $BENCHMARK_METERAGE_PER_MIN benchmark — may need conditioning work",
                value = "${avgMeterage.toInt()} m/min",
                benchmark = "$BENCHMARK_METERAGE_PER_MIN m/min",
                icon = GpsIcon.STAMINA
            )
        }

        if (avgDist < BENCHMARK_TOTAL_DISTANCE * 0.85 && matches.any { (it.totalDuration ?: 0) >= 80 }) {
            insights += GpsInsight(
                type = InsightType.WEAKNESS,
                title = "Low Total Distance",
                description = "Averages ${formatDistance(avgDist.toInt())} when playing 80+ min — below ${formatDistance(BENCHMARK_TOTAL_DISTANCE)} benchmark",
                value = formatDistance(avgDist.toInt()),
                benchmark = formatDistance(BENCHMARK_TOTAL_DISTANCE),
                icon = GpsIcon.DISTANCE
            )
        }

        if (peakVel < BENCHMARK_MAX_VELOCITY * 0.9) {
            insights += GpsInsight(
                type = InsightType.WEAKNESS,
                title = "Lacks Top-End Speed",
                description = "Peak velocity ${"%.1f".format(peakVel)} km/h is below the ${"%.1f".format(BENCHMARK_MAX_VELOCITY)} km/h standard",
                value = "${"%.1f".format(peakVel)} km/h",
                benchmark = "${"%.1f".format(BENCHMARK_MAX_VELOCITY)} km/h",
                icon = GpsIcon.SPEED
            )
        }

        if (avgSprints < BENCHMARK_SPRINTS * 0.5) {
            insights += GpsInsight(
                type = InsightType.WEAKNESS,
                title = "Very Few Sprints",
                description = "Only ${"%.1f".format(avgSprints)} sprints per match — rarely breaks into top gear",
                value = "${"%.1f".format(avgSprints)}",
                benchmark = "$BENCHMARK_SPRINTS",
                icon = GpsIcon.SPRINT
            )
        }

        if (avgHI < BENCHMARK_HIGH_INTENSITY_RUNS * 0.6) {
            insights += GpsInsight(
                type = InsightType.WEAKNESS,
                title = "Low Intensity Running",
                description = "Only ${"%.0f".format(avgHI)} high-intensity runs per match — limited impact in transition",
                value = "${"%.0f".format(avgHI)}",
                benchmark = "$BENCHMARK_HIGH_INTENSITY_RUNS",
                icon = GpsIcon.INTENSITY
            )
        }

        if (avgSprintPct < BENCHMARK_SPRINT_DIST_PERCENT * 0.5) {
            insights += GpsInsight(
                type = InsightType.WEAKNESS,
                title = "Minimal Sprint Distance",
                description = "Sprint zone covers only ${"%.1f".format(avgSprintPct)}% of total distance",
                value = "${"%.1f".format(avgSprintPct)}%",
                benchmark = "${"%.1f".format(BENCHMARK_SPRINT_DIST_PERCENT)}%",
                icon = GpsIcon.SPRINT
            )
        }

        return insights.sortedBy { if (it.type == InsightType.STRENGTH) 0 else 1 }
    }

    fun getStrengths(insights: List<GpsInsight>): List<GpsInsight> =
        insights.filter { it.type == InsightType.STRENGTH }

    fun getWeaknesses(insights: List<GpsInsight>): List<GpsInsight> =
        insights.filter { it.type == InsightType.WEAKNESS }

    private fun countStars(match: GpsMatchData): Int {
        var count = 0
        if (match.isStarTotalDist) count++
        if (match.isStarHighMpEffsDist) count++
        if (match.isStarHighMpEffs) count++
        if (match.isStarMeteragePerMin) count++
        if (match.isStarAccelerations) count++
        if (match.isStarHighIntensityRuns) count++
        if (match.isStarSprints) count++
        if (match.isStarMaxVelocity) count++
        return count
    }

    private fun formatDistance(meters: Int): String {
        return if (meters >= 1000) "${"%.1f".format(meters / 1000.0)} km" else "$meters m"
    }

    private fun Iterable<Int>.average(): Double {
        val list = toList()
        return if (list.isEmpty()) 0.0 else list.sumOf { it.toLong() }.toDouble() / list.size
    }

    private fun Double.toIntOrZero(): Int = if (isNaN()) 0 else toInt()
}
