package com.liordahan.mgsrteam.features.players.playerinfo.gps

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.SsidChart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ── Color palette for GPS section ──
private val GpsGreen = Color(0xFF4CAF50)
private val GpsTeal = Color(0xFF26A69A)
private val GpsBlue = Color(0xFF42A5F5)
private val GpsOrange = Color(0xFFFF9800)
private val GpsRed = Color(0xFFEF5350)
private val GpsPurple = Color(0xFFAB47BC)
private val GpsGold = Color(0xFFFFD54F)

@Composable
fun GpsPerformanceSection(
    summary: GpsSummary?,
    insights: List<GpsInsight>,
    isLoading: Boolean
) {
    if (isLoading) {
        GpsLoadingCard()
        return
    }

    if (summary == null) return

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // ── Header with summary stats ──
            GpsHeaderRow(summary)

            Spacer(Modifier.height(16.dp))

            // ── Quick Stats Grid ──
            GpsQuickStatsGrid(summary)

            Spacer(Modifier.height(16.dp))
            HorizontalDivider(color = PlatformColors.palette.cardBorder, thickness = 0.5.dp)
            Spacer(Modifier.height(16.dp))

            // ── Strengths ──
            val strengths = GpsAnalyzer.getStrengths(insights)
            if (strengths.isNotEmpty()) {
                InsightsSectionTitle(
                    title = stringResource(R.string.gps_strengths),
                    icon = Icons.Default.TrendingUp,
                    color = GpsGreen
                )
                Spacer(Modifier.height(8.dp))
                strengths.forEach { insight ->
                    InsightCard(insight = insight, isStrength = true)
                    Spacer(Modifier.height(6.dp))
                }
            }

            // ── Weaknesses ──
            val weaknesses = GpsAnalyzer.getWeaknesses(insights)
            if (weaknesses.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                InsightsSectionTitle(
                    title = stringResource(R.string.gps_weaknesses),
                    icon = Icons.Default.TrendingDown,
                    color = GpsOrange
                )
                Spacer(Modifier.height(8.dp))
                weaknesses.forEach { insight ->
                    InsightCard(insight = insight, isStrength = false)
                    Spacer(Modifier.height(6.dp))
                }
            }

            // ── Match-by-Match Expandable ──
            if (summary.matchDataList.size > 1) {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = PlatformColors.palette.cardBorder, thickness = 0.5.dp)
                Spacer(Modifier.height(8.dp))
                MatchByMatchSection(summary.matchDataList)
            }
        }
    }
}

@Composable
private fun GpsHeaderRow(summary: GpsSummary) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(listOf(GpsTeal, GpsBlue))
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.SsidChart,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    text = stringResource(R.string.gps_section_title),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
                )
                Text(
                    text = stringResource(R.string.gps_matches_analyzed, summary.matchCount),
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
            }
        }

        // Total stars badge
        if (summary.totalStars > 0) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(GpsGold.copy(alpha = 0.15f))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Star,
                        contentDescription = null,
                        tint = GpsGold,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = "${summary.totalStars}",
                        style = boldTextStyle(GpsGold, 13.sp)
                    )
                }
            }
        }
    }
}

@Composable
private fun GpsQuickStatsGrid(summary: GpsSummary) {
    // 2x3 grid of key metrics
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            QuickStatChip(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.gps_peak_speed),
                value = "${"%.1f".format(summary.peakMaxVelocity)} km/h",
                icon = Icons.Default.Speed,
                color = GpsPurple,
                progress = (summary.peakMaxVelocity / 36.0).toFloat().coerceIn(0f, 1f)
            )
            QuickStatChip(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.gps_avg_distance),
                value = formatDistance(summary.avgTotalDistance),
                icon = Icons.Default.DirectionsRun,
                color = GpsTeal,
                progress = (summary.avgTotalDistance / 13000.0).toFloat().coerceIn(0f, 1f)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            QuickStatChip(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.gps_avg_sprints),
                value = "${summary.avgSprints}",
                icon = Icons.Default.ElectricBolt,
                color = GpsOrange,
                progress = (summary.avgSprints / 20.0).toFloat().coerceIn(0f, 1f)
            )
            QuickStatChip(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.gps_avg_intensity),
                value = "${summary.avgHighIntensityRuns}",
                icon = Icons.Default.FitnessCenter,
                color = GpsBlue,
                progress = (summary.avgHighIntensityRuns / 70.0).toFloat().coerceIn(0f, 1f)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            QuickStatChip(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.gps_work_rate),
                value = "${summary.avgMeteragePerMinute} m/min",
                icon = Icons.Default.Timeline,
                color = GpsGreen,
                progress = (summary.avgMeteragePerMinute / 130.0).toFloat().coerceIn(0f, 1f)
            )
            QuickStatChip(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.gps_total_minutes, summary.totalMinutesPlayed),
                value = "${summary.totalMinutesPlayed} min",
                icon = Icons.Default.DirectionsRun,
                color = PlatformColors.palette.accent,
                progress = 1f
            )
        }
    }
}

@Composable
private fun QuickStatChip(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    icon: ImageVector,
    color: Color,
    progress: Float
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(800),
        label = "stat_progress"
    )
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(color.copy(alpha = 0.08f))
            .padding(12.dp)
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = label,
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = value,
                style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
            )
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = color,
                trackColor = color.copy(alpha = 0.15f)
            )
        }
    }
}

@Composable
private fun InsightsSectionTitle(title: String, icon: ImageVector, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(
            text = title,
            style = boldTextStyle(color, 14.sp)
        )
    }
}

@Composable
private fun InsightCard(insight: GpsInsight, isStrength: Boolean) {
    val accentColor = if (isStrength) GpsGreen else GpsOrange
    val bgColor = accentColor.copy(alpha = 0.06f)
    val iconVec = when (insight.icon) {
        GpsIcon.SPEED -> Icons.Default.Speed
        GpsIcon.DISTANCE -> Icons.Default.DirectionsRun
        GpsIcon.SPRINT -> Icons.Default.ElectricBolt
        GpsIcon.ACCELERATION -> Icons.Default.Speed
        GpsIcon.INTENSITY -> Icons.Default.FitnessCenter
        GpsIcon.STAMINA -> Icons.Default.Timeline
        GpsIcon.DEFAULT -> if (isStrength) Icons.Default.TrendingUp else Icons.Default.TrendingDown
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(iconVec, contentDescription = null, tint = accentColor, modifier = Modifier.size(16.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = insight.title,
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 13.sp)
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = insight.description,
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = insight.value,
                    style = boldTextStyle(accentColor, 14.sp)
                )
                insight.benchmark?.let { bm ->
                    Text(
                        text = bm,
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
                    )
                }
            }
        }
    }
}

@Composable
private fun MatchByMatchSection(matches: List<GpsMatchData>) {
    var expanded by remember { mutableStateOf(false) }
    val rotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        label = "expand_rotation"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable { expanded = !expanded }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = stringResource(R.string.gps_match_details),
            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
        )
        Icon(
            Icons.Default.ExpandMore,
            contentDescription = null,
            modifier = Modifier
                .size(20.dp)
                .rotate(rotation),
            tint = PlatformColors.palette.textSecondary
        )
    }

    AnimatedVisibility(
        visible = expanded,
        enter = expandVertically() + fadeIn(),
        exit = shrinkVertically() + fadeOut()
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            matches.forEach { match ->
                MatchRow(match)
            }
        }
    }
}

@Composable
private fun MatchRow(match: GpsMatchData) {
    val dateStr = match.matchDate?.let {
        SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(it))
    } ?: match.matchDateStr ?: ""

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(PlatformColors.palette.cardBorder.copy(alpha = 0.3f))
            .padding(12.dp)
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = match.matchTitle ?: "Match",
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 13.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "$dateStr · ${match.totalDuration ?: 0} min",
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                    )
                }
                // Stars earned in this match
                val stars = listOf(
                    match.isStarTotalDist, match.isStarHighMpEffsDist, match.isStarHighMpEffs,
                    match.isStarMeteragePerMin, match.isStarAccelerations, match.isStarHighIntensityRuns,
                    match.isStarSprints, match.isStarMaxVelocity
                ).count { it }
                if (stars > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Star, contentDescription = null, tint = GpsGold, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(2.dp))
                        Text(text = "$stars", style = boldTextStyle(GpsGold, 12.sp))
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            // Mini stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                MiniStat(label = "Dist", value = formatDistance(match.totalDistance ?: 0))
                MiniStat(label = "m/min", value = "${match.meteragePerMinute ?: 0}")
                MiniStat(label = "HI", value = "${match.highIntensityRuns ?: 0}")
                MiniStat(label = "Sprint", value = "${match.sprints ?: 0}")
                MiniStat(label = "Max", value = "${"%.1f".format(match.maxVelocity ?: 0.0)}")
            }
        }
    }
}

@Composable
private fun MiniStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = boldTextStyle(PlatformColors.palette.textPrimary, 12.sp)
        )
        Text(
            text = label,
            style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
        )
    }
}

@Composable
private fun GpsLoadingCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(listOf(GpsTeal, GpsBlue))),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.SsidChart,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    text = stringResource(R.string.gps_section_title),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
                )
                Text(
                    text = stringResource(R.string.gps_analyzing),
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
            }
        }
    }
}

private fun formatDistance(meters: Int): String {
    return if (meters >= 1000) "${"%.1f".format(meters / 1000.0)} km" else "$meters m"
}
