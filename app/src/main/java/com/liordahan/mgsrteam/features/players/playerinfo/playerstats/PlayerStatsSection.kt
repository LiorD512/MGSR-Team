package com.liordahan.mgsrteam.features.players.playerinfo.playerstats

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import java.text.NumberFormat
import java.util.Locale

/* ─── Position groups ─────────────────────────────────────────── */

private enum class PosGroup { GK, DEF, FB, MID, ATT_MID, WING, FWD }

private fun positionToGroup(pos: String): PosGroup {
    val p = pos.uppercase().trim()
    return when {
        p in listOf("GK", "GOALKEEPER") -> PosGroup.GK
        p in listOf("CB", "CENTRE-BACK", "CENTER-BACK") -> PosGroup.DEF
        p in listOf("LB", "RB", "LEFT-BACK", "RIGHT-BACK", "LWB", "RWB") -> PosGroup.FB
        p in listOf("DM", "CDM", "DEFENSIVE MIDFIELD") -> PosGroup.MID
        p in listOf("CM", "CENTRAL MIDFIELD") -> PosGroup.MID
        p in listOf("AM", "ATTACKING MIDFIELD", "CAM") -> PosGroup.ATT_MID
        p in listOf("LM", "RM", "LEFT MIDFIELD", "RIGHT MIDFIELD") -> PosGroup.WING
        p in listOf("LW", "RW", "LEFT WINGER", "RIGHT WINGER") -> PosGroup.WING
        p in listOf("CF", "ST", "SS", "CENTRE-FORWARD", "STRIKER", "SECOND STRIKER") -> PosGroup.FWD
        "midfield" in p.lowercase() -> PosGroup.MID
        "attack" in p.lowercase() || "forward" in p.lowercase() -> PosGroup.FWD
        "back" in p.lowercase() || "defence" in p.lowercase() -> PosGroup.DEF
        else -> PosGroup.MID
    }
}

/* ─── Stat definition ─────────────────────────────────────────── */

private data class StatDef(
    val key: String,
    val label: String,
    val labelHe: String,
    val icon: String,
    val max: Float,
    val thresholds: Triple<Float, Float, Float>, // good, great, elite
    val isLowerBetter: Boolean = false,
)

private val GK_STATS = listOf(
    StatDef("api_rating", "Rating", "דירוג", "⭐", 10f, Triple(6.5f, 7f, 7.5f)),
    StatDef("api_saves_per90", "Saves / 90", "הצלות / 90", "🧤", 5f, Triple(2f, 3f, 4f)),
    StatDef("api_conceded", "Goals Conceded", "שערים שספג", "🥅", 40f, Triple(25f, 15f, 8f), isLowerBetter = true),
    StatDef("api_passes_accuracy", "Pass Accuracy", "דיוק מסירות", "🎯", 100f, Triple(55f, 65f, 75f)),
    StatDef("api_duels_won_pct", "Duels Won %", "% מאבקים מוצלחים", "💪", 100f, Triple(40f, 55f, 70f)),
    StatDef("api_blocks_per90", "Blocks / 90", "חסימות / 90", "🛡️", 3f, Triple(0.3f, 0.6f, 1f)),
)

private val DEF_STATS = listOf(
    StatDef("api_rating", "Rating", "דירוג", "⭐", 10f, Triple(6.5f, 7f, 7.5f)),
    StatDef("api_tackles_interceptions_per90", "Tackles+Int / 90", "תיקולים וחטיפות / 90", "🛡️", 8f, Triple(2.5f, 4f, 5.5f)),
    StatDef("api_duels_won_pct", "Duels Won %", "% מאבקים מוצלחים", "💪", 100f, Triple(55f, 65f, 75f)),
    StatDef("api_blocks_per90", "Blocks / 90", "חסימות / 90", "🧱", 3f, Triple(0.5f, 1f, 1.5f)),
    StatDef("api_passes_accuracy", "Pass Accuracy", "דיוק מסירות", "🎯", 100f, Triple(70f, 80f, 88f)),
    StatDef("api_fouls_per90", "Fouls / 90", "עבירות / 90", "⚠️", 3f, Triple(2f, 1.5f, 0.8f), isLowerBetter = true),
)

private val FB_STATS = listOf(
    StatDef("api_rating", "Rating", "דירוג", "⭐", 10f, Triple(6.5f, 7f, 7.5f)),
    StatDef("api_tackles_interceptions_per90", "Tackles+Int / 90", "תיקולים וחטיפות / 90", "🛡️", 6f, Triple(2f, 3f, 4.5f)),
    StatDef("api_key_passes_per90", "Key Passes / 90", "מסירות מפתח / 90", "🔑", 3f, Triple(0.5f, 1f, 1.8f)),
    StatDef("api_dribbles_success_per90", "Dribbles / 90", "כדרורים / 90", "⚡", 3f, Triple(0.5f, 1f, 1.5f)),
    StatDef("api_goal_contributions_per90", "G+A / 90", "שערים+בישולים / 90", "⚽", 0.6f, Triple(0.1f, 0.2f, 0.35f)),
    StatDef("api_duels_won_pct", "Duels Won %", "% מאבקים מוצלחים", "💪", 100f, Triple(50f, 55f, 65f)),
)

private val MID_STATS = listOf(
    StatDef("api_rating", "Rating", "דירוג", "⭐", 10f, Triple(6.5f, 7f, 7.5f)),
    StatDef("api_key_passes_per90", "Key Passes / 90", "מסירות מפתח / 90", "🔑", 3f, Triple(0.8f, 1.5f, 2.5f)),
    StatDef("api_passes_accuracy", "Pass Accuracy", "דיוק מסירות", "🎯", 100f, Triple(72f, 82f, 90f)),
    StatDef("api_tackles_interceptions_per90", "Tackles+Int / 90", "תיקולים וחטיפות / 90", "🛡️", 6f, Triple(1.5f, 3f, 4.5f)),
    StatDef("api_goal_contributions_per90", "G+A / 90", "שערים+בישולים / 90", "⚽", 0.8f, Triple(0.15f, 0.3f, 0.5f)),
    StatDef("api_duels_won_pct", "Duels Won %", "% מאבקים מוצלחים", "💪", 100f, Triple(48f, 55f, 65f)),
)

private val ATT_MID_STATS = listOf(
    StatDef("api_rating", "Rating", "דירוג", "⭐", 10f, Triple(6.5f, 7f, 7.5f)),
    StatDef("api_goal_contributions_per90", "G+A / 90", "שערים+בישולים / 90", "⚽", 1.2f, Triple(0.3f, 0.5f, 0.8f)),
    StatDef("api_key_passes_per90", "Key Passes / 90", "מסירות מפתח / 90", "🔑", 4f, Triple(1f, 2f, 3f)),
    StatDef("api_dribbles_success_per90", "Dribbles / 90", "כדרורים / 90", "⚡", 4f, Triple(0.8f, 1.5f, 2.5f)),
    StatDef("api_shots_per90", "Shots / 90", "בעיטות / 90", "🎯", 4f, Triple(1f, 2f, 3f)),
    StatDef("api_fouled_per90", "Fouled / 90", "עבירות שספג / 90", "⚡", 4f, Triple(1f, 1.8f, 2.5f)),
)

private val WING_STATS = listOf(
    StatDef("api_rating", "Rating", "דירוג", "⭐", 10f, Triple(6.5f, 7f, 7.5f)),
    StatDef("api_goal_contributions_per90", "G+A / 90", "שערים+בישולים / 90", "⚽", 1.2f, Triple(0.25f, 0.45f, 0.7f)),
    StatDef("api_dribbles_success_per90", "Dribbles / 90", "כדרורים / 90", "⚡", 4f, Triple(0.8f, 1.5f, 2.5f)),
    StatDef("api_key_passes_per90", "Key Passes / 90", "מסירות מפתח / 90", "🔑", 3f, Triple(0.8f, 1.5f, 2.5f)),
    StatDef("api_shots_on_target_per90", "Shots on Target / 90", "בעיטות למסגרת / 90", "🎯", 2.5f, Triple(0.5f, 1f, 1.5f)),
    StatDef("api_fouled_per90", "Fouled / 90", "עבירות שספג / 90", "⚡", 4f, Triple(1f, 2f, 3f)),
)

private val FWD_STATS = listOf(
    StatDef("api_rating", "Rating", "דירוג", "⭐", 10f, Triple(6.5f, 7f, 7.5f)),
    StatDef("api_goals_per90", "Goals / 90", "שערים / 90", "⚽", 1f, Triple(0.25f, 0.45f, 0.7f)),
    StatDef("api_goal_contributions_per90", "G+A / 90", "שערים+בישולים / 90", "🔥", 1.5f, Triple(0.35f, 0.6f, 0.9f)),
    StatDef("api_shots_on_target_per90", "Shots on Target / 90", "בעיטות למסגרת / 90", "🎯", 3f, Triple(0.8f, 1.2f, 2f)),
    StatDef("api_goals_per_shot", "Conversion Rate", "אחוז המרה", "💎", 1f, Triple(0.1f, 0.2f, 0.35f)),
    StatDef("api_duels_won_pct", "Duels Won %", "% מאבקים מוצלחים", "💪", 100f, Triple(40f, 50f, 60f)),
)

private fun coreStatsForGroup(group: PosGroup): List<StatDef> = when (group) {
    PosGroup.GK -> GK_STATS
    PosGroup.DEF -> DEF_STATS
    PosGroup.FB -> FB_STATS
    PosGroup.MID -> MID_STATS
    PosGroup.ATT_MID -> ATT_MID_STATS
    PosGroup.WING -> WING_STATS
    PosGroup.FWD -> FWD_STATS
}

/* ─── Color helpers ────────────────────────────────────────────── */

private val ApiGradient = Brush.linearGradient(
    colors = listOf(Color(0xFF00BFA5), Color(0xFF00E5FF)),
    start = Offset(0f, 0f),
    end = Offset(100f, 100f)
)

private val HeaderGlow = Brush.horizontalGradient(
    listOf(
        Color(0xFF00BFA5).copy(alpha = 0.08f),
        Color(0xFF00E5FF).copy(alpha = 0.06f),
        Color.Transparent
    )
)

private fun tierColor(value: Float, thresholds: Triple<Float, Float, Float>, isLowerBetter: Boolean): Color {
    val (good, great, elite) = thresholds
    return if (isLowerBetter) {
        when {
            value <= elite -> Color(0xFFFFD700) // gold
            value <= great -> Color(0xFF66BB6A) // green
            value <= good -> Color(0xFF42A5F5)  // blue
            else -> Color(0xFF78909C)           // grey
        }
    } else {
        when {
            value >= elite -> Color(0xFFFFD700)
            value >= great -> Color(0xFF66BB6A)
            value >= good -> Color(0xFF42A5F5)
            else -> Color(0xFF78909C)
        }
    }
}

private fun ratingColor(rating: Double): Color = when {
    rating >= 7.5 -> Color(0xFFFFD700)
    rating >= 7.0 -> Color(0xFF66BB6A)
    rating >= 6.5 -> Color(0xFF42A5F5)
    else -> Color(0xFF78909C)
}

/* ─── Inaccurate league detection ────────────────────────────── */

private val INACCURATE_DB_LEAGUES = setOf(
    "Liga Portugal 2", "A Division Cyprus", "Veikkausliiga",
    "Premier League Ukraine", "Parva Liga", "Nb I Ungarn",
)
private val INACCURATE_API_LEAGUES = setOf(
    "Segunda Liga", "1. Division", "Veikkausliiga",
    "First League", "NB I",
)

private fun isInaccurateLeague(data: PlayerStatsData): Boolean {
    val dbLeague = data.league
    val apiLeague = data.apiLeague ?: ""
    val apiCountry = (data.apiLeagueCountry ?: "").lowercase()
    return INACCURATE_DB_LEAGUES.contains(dbLeague) ||
            INACCURATE_API_LEAGUES.contains(apiLeague) ||
            (apiLeague == "Premier League" && apiCountry == "ukraine")
}

/* ─── Data accessor by key ─────────────────────────────────────── */

private fun statValue(data: PlayerStatsData, key: String): Double? = when (key) {
    "api_rating" -> data.apiRating
    "api_saves_per90" -> data.apiSavesPer90
    "api_conceded" -> data.apiConceded?.toDouble()
    "api_passes_accuracy" -> data.apiPassesAccuracy
    "api_duels_won_pct" -> data.apiDuelsWonPct
    "api_blocks_per90" -> data.apiBlocksPer90
    "api_tackles_interceptions_per90" -> data.apiTacklesInterceptionsPer90
    "api_fouls_per90" -> data.apiFoulsPer90
    "api_key_passes_per90" -> data.apiKeyPassesPer90
    "api_dribbles_success_per90" -> data.apiDribblesSuccessPer90
    "api_goal_contributions_per90" -> data.apiGoalContributionsPer90
    "api_goals_per90" -> data.apiGoalsPer90
    "api_assists_per90" -> data.apiAssistsPer90
    "api_shots_per90" -> data.apiShotsPer90
    "api_shots_on_target_per90" -> data.apiShotsOnTargetPer90
    "api_goals_per_shot" -> data.apiGoalsPerShot
    "api_fouled_per90" -> data.apiFouledPer90
    else -> null
}

/* ═══════════════════════════════════════════════════════════════════
   Main Section
   ═══════════════════════════════════════════════════════════════════ */

@Composable
fun PlayerStatsSection(
    data: PlayerStatsData?,
    isLoading: Boolean,
    error: String?
) {
    val isRtl = stringResource(R.string.app_locale) == "he"

    // Loading state
    if (isLoading && data == null) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(0.5.dp, PlatformColors.palette.cardBorder)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = Color(0xFF00BFA5),
                    strokeWidth = 2.dp
                )
            }
        }
        return
    }

    // No data / error — don't show anything
    if (data == null) return

    val posGroup = positionToGroup(data.position)
    val coreStats = coreStatsForGroup(posGroup)
    val season = data.apiSeason ?: 2025
    val seasonLabel = "$season/${(season + 1).toString().takeLast(2)}"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .animateContentSize(),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, PlatformColors.palette.cardBorder)
    ) {
        Column {
            // ── Header ──────────────────────────────────────────────
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(HeaderGlow)
            ) {
                // Accent bar
                Box(
                    Modifier
                        .align(Alignment.CenterStart)
                        .width(3.dp)
                        .height(48.dp)
                        .clip(RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp))
                        .background(ApiGradient)
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 14.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // API badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(ApiGradient)
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = "API",
                            style = TextStyle(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                letterSpacing = 1.sp
                            )
                        )
                    }

                    Spacer(Modifier.width(10.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isRtl) "סטטיסטיקות ביצועים" else "Performance Stats",
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                        )
                        Text(
                            text = "${data.apiLeague ?: data.league} · $seasonLabel",
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
                        )
                    }

                    // Rating ring
                    data.apiRating?.takeIf { it > 0 }?.let { rating ->
                        RatingRing(rating = rating)
                    }
                }
            }

            // ── Inaccurate league disclaimer ────────────────────────
            if (isInaccurateLeague(data)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF442200).copy(alpha = 0.3f))
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = if (isRtl)
                            "⚠️ הנתונים לליגה זו עשויים להיות לא מדויקים. שערים, בישולים ודקות עלולים לא לשקף את המציאות."
                        else
                            "⚠️ Data for this league may be inaccurate. Goals, assists and minutes may not reflect actual figures.",
                        style = regularTextStyle(Color(0xFFFFB74D), 11.sp),
                        lineHeight = 16.sp
                    )
                }
            }

            // ── Overview chips ──────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                OverviewChip(
                    label = if (isRtl) "הופעות" else "Apps",
                    value = "${data.apiAppearances ?: 0}",
                    icon = "🏟️"
                )
                OverviewChip(
                    label = if (isRtl) "דקות" else "Mins",
                    value = NumberFormat.getNumberInstance(Locale.US).format(data.apiMinutes ?: 0),
                    icon = "⏱️"
                )
                OverviewChip(
                    label = if (isRtl) "שערים" else "Goals",
                    value = "${data.apiGoals ?: 0}",
                    icon = "⚽"
                )
                OverviewChip(
                    label = if (isRtl) "בישולים" else "Assists",
                    value = "${data.apiAssists ?: 0}",
                    icon = "👟"
                )
            }

            // Divider
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(0.5.dp)
                    .background(PlatformColors.palette.cardBorder.copy(alpha = 0.3f))
            )

            // ── Position-specific core stats ────────────────────────
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp)
            ) {
                Text(
                    text = if (isRtl) "מדדי מפתח לפי עמדה" else "Key Metrics by Position",
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp),
                    modifier = Modifier.padding(bottom = 8.dp, start = 4.dp)
                )

                coreStats.forEach { stat ->
                    if (stat.key == "api_rating") return@forEach // shown as ring
                    val value = statValue(data, stat.key) ?: return@forEach
                    StatBarRow(
                        stat = stat,
                        value = value.toFloat(),
                        isRtl = isRtl
                    )
                }
            }

            // ── Secondary stats (expandable) ────────────────────────
            SecondaryStatsSection(data = data, posGroup = posGroup, isRtl = isRtl)

            // ── Footer ──────────────────────────────────────────────
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(0.5.dp)
                    .background(PlatformColors.palette.cardBorder.copy(alpha = 0.3f))
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${data.apiTeam ?: ""} · API-Football".trimStart(' ', '·', ' '),
                    style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 10.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

/* ─── Overview Chip ────────────────────────────────────────────── */

@Composable
private fun OverviewChip(label: String, value: String, icon: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(horizontal = 4.dp)
    ) {
        Text(text = icon, fontSize = 16.sp)
        Spacer(Modifier.height(2.dp))
        Text(
            text = value,
            style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
        )
        Text(
            text = label,
            style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
        )
    }
}

/* ─── Rating Ring ──────────────────────────────────────────────── */

@Composable
private fun RatingRing(rating: Double) {
    val color = ratingColor(rating)
    val textMeasurer = rememberTextMeasurer()
    val ratingText = String.format(Locale.US, "%.1f", rating)

    Canvas(modifier = Modifier.size(44.dp)) {
        val strokeWidth = 3.dp.toPx()
        val radius = (size.minDimension - strokeWidth) / 2f
        val center = Offset(size.width / 2f, size.height / 2f)

        // Background arc
        drawCircle(
            color = color.copy(alpha = 0.15f),
            radius = radius,
            center = center,
            style = Stroke(width = strokeWidth)
        )

        // Progress arc (rating out of 10)
        val sweep = (rating / 10.0 * 360.0).toFloat()
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = sweep,
            useCenter = false,
            topLeft = Offset(center.x - radius, center.y - radius),
            size = Size(radius * 2, radius * 2),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )

        // Rating text
        val textLayoutResult = textMeasurer.measure(
            text = ratingText,
            style = TextStyle(
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = color
            )
        )
        drawText(
            textLayoutResult = textLayoutResult,
            topLeft = Offset(
                center.x - textLayoutResult.size.width / 2f,
                center.y - textLayoutResult.size.height / 2f
            )
        )
    }
}

/* ─── Stat Bar Row ─────────────────────────────────────────────── */

@Composable
private fun StatBarRow(
    stat: StatDef,
    value: Float,
    isRtl: Boolean
) {
    val color = tierColor(value, stat.thresholds, stat.isLowerBetter)
    val fraction = (value / stat.max).coerceIn(0f, 1f)
    val animatedFraction by animateFloatAsState(
        targetValue = fraction,
        animationSpec = tween(600),
        label = "bar_${stat.key}"
    )

    val displayValue = if (stat.key.endsWith("_pct") || stat.key == "api_passes_accuracy") {
        "${value.toInt()}%"
    } else if (stat.max >= 10f && value == value.toInt().toFloat()) {
        value.toInt().toString()
    } else {
        String.format(Locale.US, "%.2f", value)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Icon
        Text(
            text = stat.icon,
            fontSize = 12.sp,
            modifier = Modifier.width(20.dp)
        )

        // Label
        Text(
            text = if (isRtl) stat.labelHe else stat.label,
            style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
            modifier = Modifier.width(if (isRtl) 130.dp else 120.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        // Bar
        Box(
            modifier = Modifier
                .weight(1f)
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(PlatformColors.palette.cardBorder.copy(alpha = 0.2f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(animatedFraction)
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(color)
            )
        }

        Spacer(Modifier.width(8.dp))

        // Value
        Text(
            text = displayValue,
            style = boldTextStyle(color, 11.sp),
            modifier = Modifier.width(36.dp),
            textAlign = TextAlign.End,
            maxLines = 1
        )
    }
}

/* ─── Secondary Stats (expandable) ─────────────────────────────── */

@Composable
private fun SecondaryStatsSection(
    data: PlayerStatsData,
    posGroup: PosGroup,
    isRtl: Boolean
) {
    val coreKeys = coreStatsForGroup(posGroup).map { it.key }.toSet()

    val secondaryItems = buildList {
        if ("api_goals_per90" !in coreKeys) data.apiGoalsPer90?.let {
            add(Triple("Goals / 90", "שערים / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_assists_per90" !in coreKeys) data.apiAssistsPer90?.let {
            add(Triple("Assists / 90", "בישולים / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_goal_contributions_per90" !in coreKeys) data.apiGoalContributionsPer90?.let {
            add(Triple("G+A / 90", "שערים+בישולים / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_shots_per90" !in coreKeys) data.apiShotsPer90?.let {
            add(Triple("Shots / 90", "בעיטות / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_shots_on_target_per90" !in coreKeys) data.apiShotsOnTargetPer90?.let {
            add(Triple("On Target / 90", "למסגרת / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_goals_per_shot" !in coreKeys) data.apiGoalsPerShot?.let {
            add(Triple("Conversion", "אחוז המרה", "${(it * 100).toInt()}%"))
        }
        if ("api_key_passes_per90" !in coreKeys) data.apiKeyPassesPer90?.let {
            add(Triple("Key Passes / 90", "מסירות מפתח / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_passes_accuracy" !in coreKeys) data.apiPassesAccuracy?.let {
            add(Triple("Pass Accuracy", "דיוק מסירות", "${it.toInt()}%"))
        }
        if ("api_dribbles_success_per90" !in coreKeys) data.apiDribblesSuccessPer90?.let {
            add(Triple("Dribbles / 90", "כדרורים / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_tackles_interceptions_per90" !in coreKeys) data.apiTacklesInterceptionsPer90?.let {
            add(Triple("Tackles+Int / 90", "תיקולים וחטיפות / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_blocks_per90" !in coreKeys) data.apiBlocksPer90?.let {
            add(Triple("Blocks / 90", "חסימות / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_duels_won_pct" !in coreKeys) data.apiDuelsWonPct?.let {
            add(Triple("Duels Won", "מאבקים מוצלחים", "${it.toInt()}%"))
        }
        if ("api_fouled_per90" !in coreKeys) data.apiFouledPer90?.let {
            add(Triple("Fouled / 90", "עבירות שספג / 90", String.format(Locale.US, "%.2f", it)))
        }
        if ("api_fouls_per90" !in coreKeys) data.apiFoulsPer90?.let {
            add(Triple("Fouls / 90", "עבירות / 90", String.format(Locale.US, "%.2f", it)))
        }
        data.apiCardsYellow?.takeIf { it > 0 }?.let {
            add(Triple("Yellow Cards", "כרטיסים צהובים", "$it"))
        }
        data.apiCardsRed?.takeIf { it > 0 }?.let {
            add(Triple("Red Cards", "כרטיסים אדומים", "$it"))
        }
        data.apiPenaltyScored?.takeIf { it > 0 }?.let {
            add(Triple("Penalties Scored", "פנדלים שהובקעו", "$it"))
        }
    }

    if (secondaryItems.isEmpty()) return

    var expanded by remember { mutableStateOf(false) }
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(250),
        label = "chevron"
    )

    Column {
        // Divider
        Box(
            Modifier
                .fillMaxWidth()
                .height(0.5.dp)
                .background(PlatformColors.palette.cardBorder.copy(alpha = 0.3f))
        )

        // Toggle button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = if (isRtl) "כל הסטטיסטיקות" else "All Statistics",
                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
            )
            Icon(
                imageVector = Icons.Default.ExpandMore,
                contentDescription = null,
                modifier = Modifier
                    .size(20.dp)
                    .rotate(chevronRotation),
                tint = PlatformColors.palette.textSecondary
            )
        }

        // Expandable grid
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 12.dp)
            ) {
                secondaryItems.chunked(2).forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        row.forEach { (label, labelHe, value) ->
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(vertical = 3.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = if (isRtl) labelHe else label,
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = value,
                                    style = boldTextStyle(PlatformColors.palette.textPrimary, 11.sp)
                                )
                            }
                        }
                        // Fill empty slot if odd number
                        if (row.size == 1) {
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}
