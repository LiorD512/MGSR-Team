package com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

/* ─── Color helpers ─────────────────────────────────────────────── */

private fun tierColor(tier: String): Color = when (tier) {
    "world_class" -> Color(0xFFFFD700)
    "elite" -> Color(0xFFB388FF)
    "top_league" -> Color(0xFF42A5F5)
    "solid_pro" -> Color(0xFF4DB6AC)
    "lower_league" -> Color(0xFF8C999B)
    else -> Color(0xFF66BB6A) // prospect / unknown
}

private fun dimBarColor(value: Int): Color = when {
    value >= 85 -> Color(0xFFFFD700)
    value >= 75 -> Color(0xFFB388FF)
    value >= 65 -> Color(0xFF42A5F5)
    value >= 55 -> Color(0xFF4DB6AC)
    else -> Color(0xFF8C999B)
}

private fun attrValueColor(value: Int): Color = when {
    value >= 85 -> Color(0xFFFFD700)
    value >= 75 -> Color(0xFF66BB6A)
    value >= 65 -> Color(0xFF4DB6AC)
    value >= 50 -> Color(0xFFB0BEC5)
    value >= 40 -> Color(0xFF78909C)
    else -> Color(0xFFEF5350)
}

/* ─── Tier string resource mapping ──────────────────────────────── */
@Composable
private fun tierLabel(tier: String): String = when (tier) {
    "world_class" -> stringResource(R.string.fm_tier_world_class)
    "elite" -> stringResource(R.string.fm_tier_elite)
    "top_league" -> stringResource(R.string.fm_tier_top_league)
    "solid_pro" -> stringResource(R.string.fm_tier_solid_pro)
    "lower_league" -> stringResource(R.string.fm_tier_lower_league)
    "prospect" -> stringResource(R.string.fm_tier_prospect)
    else -> stringResource(R.string.fm_tier_unknown)
}

@Composable
private fun dimLabel(key: String): String = when (key) {
    "technical" -> stringResource(R.string.fm_dim_technical)
    "mental" -> stringResource(R.string.fm_dim_mental)
    "physical" -> stringResource(R.string.fm_dim_physical)
    "set_pieces" -> stringResource(R.string.fm_dim_set_pieces)
    "attacking" -> stringResource(R.string.fm_dim_attacking)
    "defending" -> stringResource(R.string.fm_dim_defending)
    "creative" -> stringResource(R.string.fm_dim_creative)
    "aerial" -> stringResource(R.string.fm_dim_aerial)
    "pace_power" -> stringResource(R.string.fm_dim_pace_power)
    "work_ethic" -> stringResource(R.string.fm_dim_work_ethic)
    else -> key.replaceFirstChar { it.uppercase() }
}

@Composable
private fun attrLabel(name: String): String = when (name) {
    "crossing" -> stringResource(R.string.fm_attr_crossing)
    "dribbling" -> stringResource(R.string.fm_attr_dribbling)
    "finishing" -> stringResource(R.string.fm_attr_finishing)
    "first_touch" -> stringResource(R.string.fm_attr_first_touch)
    "heading" -> stringResource(R.string.fm_attr_heading)
    "long_shots" -> stringResource(R.string.fm_attr_long_shots)
    "marking" -> stringResource(R.string.fm_attr_marking)
    "passing" -> stringResource(R.string.fm_attr_passing)
    "tackling" -> stringResource(R.string.fm_attr_tackling)
    "technique" -> stringResource(R.string.fm_attr_technique)
    "aggression" -> stringResource(R.string.fm_attr_aggression)
    "anticipation" -> stringResource(R.string.fm_attr_anticipation)
    "bravery" -> stringResource(R.string.fm_attr_bravery)
    "composure" -> stringResource(R.string.fm_attr_composure)
    "concentration" -> stringResource(R.string.fm_attr_concentration)
    "decisions" -> stringResource(R.string.fm_attr_decisions)
    "determination" -> stringResource(R.string.fm_attr_determination)
    "flair" -> stringResource(R.string.fm_attr_flair)
    "leadership" -> stringResource(R.string.fm_attr_leadership)
    "off_the_ball" -> stringResource(R.string.fm_attr_off_the_ball)
    "positioning" -> stringResource(R.string.fm_attr_positioning)
    "teamwork" -> stringResource(R.string.fm_attr_teamwork)
    "vision" -> stringResource(R.string.fm_attr_vision)
    "work_rate" -> stringResource(R.string.fm_attr_work_rate)
    "acceleration" -> stringResource(R.string.fm_attr_acceleration)
    "agility" -> stringResource(R.string.fm_attr_agility)
    "balance" -> stringResource(R.string.fm_attr_balance)
    "jumping_reach" -> stringResource(R.string.fm_attr_jumping_reach)
    "natural_fitness" -> stringResource(R.string.fm_attr_natural_fitness)
    "pace" -> stringResource(R.string.fm_attr_pace)
    "stamina" -> stringResource(R.string.fm_attr_stamina)
    "strength" -> stringResource(R.string.fm_attr_strength)
    "corners" -> stringResource(R.string.fm_attr_corners)
    "free_kick_taking" -> stringResource(R.string.fm_attr_free_kick_taking)
    "long_throws" -> stringResource(R.string.fm_attr_long_throws)
    "penalty_taking" -> stringResource(R.string.fm_attr_penalty_taking)
    else -> name.replace("_", " ").replaceFirstChar { it.uppercase() }
}

@Composable
private fun posLabel(pos: String): String = when (pos) {
    "ST" -> stringResource(R.string.fm_pos_ST)
    "LW" -> stringResource(R.string.fm_pos_LW)
    "RW" -> stringResource(R.string.fm_pos_RW)
    "AM" -> stringResource(R.string.fm_pos_AM)
    "LM" -> stringResource(R.string.fm_pos_LM)
    "RM" -> stringResource(R.string.fm_pos_RM)
    "CM" -> stringResource(R.string.fm_pos_CM)
    "DM" -> stringResource(R.string.fm_pos_DM)
    "LB" -> stringResource(R.string.fm_pos_LB)
    "RB" -> stringResource(R.string.fm_pos_RB)
    "CB" -> stringResource(R.string.fm_pos_CB)
    "GK" -> stringResource(R.string.fm_pos_GK)
    else -> pos
}

/* ═══════════════════════════════════════════════════════════════════
   Main Section
   ═══════════════════════════════════════════════════════════════════ */

@Composable
fun FmIntelligenceSection(
    data: FmIntelligenceData?,
    isLoading: Boolean,
    error: String?
) {
    if (!isLoading && data == null && error == null) return // silently hide

    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .animateContentSize(),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, PlatformColors.palette.cardBorder)
    ) {
        // Gradient top bar
        Box(
            Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Color(0xFF4DB6AC),
                            Color(0xFF42A5F5),
                            Color(0xFFB388FF),
                            Color(0xFFFFD700)
                        )
                    )
                )
        )

        // Header row  
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "⚽",
                fontSize = 18.sp
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.fm_section_title),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 15.sp)
                )
                if (!expanded && data != null) {
                    Text(
                        text = tierLabel(data.tier) + " · CA ${data.ca}",
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                    )
                }
            }
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = PlatformColors.palette.accent
                )
            } else {
                Icon(
                    imageVector = Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = PlatformColors.palette.textSecondary,
                    modifier = Modifier.rotate(if (expanded) 180f else 0f)
                )
            }
        }

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            when {
                isLoading -> {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(28.dp),
                                strokeWidth = 2.dp,
                                color = PlatformColors.palette.accent
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = stringResource(R.string.fm_loading),
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                            )
                        }
                    }
                }
                error != null -> {
                    Text(
                        text = stringResource(R.string.fm_error),
                        modifier = Modifier.padding(16.dp),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
                    )
                }
                data != null -> {
                    Column {
                        OverviewTab(data)

                        // Footer
                        Text(
                            text = stringResource(R.string.fm_footer),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 10.sp),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}

/* ═══ OVERVIEW TAB ═══════════════════════════════════════════════ */

@Composable
private fun OverviewTab(data: FmIntelligenceData) {
    Column(Modifier.padding(16.dp)) {
        // Hero: CA ring + key info
        Row(verticalAlignment = Alignment.CenterVertically) {
            CaRing(ca = data.ca, tier = data.tier)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                // Tier badge
                val tc = tierColor(data.tier)
                Box(
                    modifier = Modifier
                        .background(tc.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = (if (data.tier == "world_class") "★ " else "") + tierLabel(data.tier),
                        style = boldTextStyle(tc, 12.sp)
                    )
                }
                Spacer(Modifier.height(6.dp))

                // Potential gap
                if (data.potentialGap > 0) {
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF66BB6A).copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = "+${data.potentialGap} ${stringResource(R.string.fm_potential)}",
                            style = boldTextStyle(Color(0xFF66BB6A), 11.sp)
                        )
                    }
                } else {
                    Text(
                        text = stringResource(R.string.fm_at_peak),
                        style = regularTextStyle(Color(0xFFFFC107), 11.sp)
                    )
                }
            }
        }

        Spacer(Modifier.height(14.dp))

        // Stats grid — each on its own row for clarity
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(PlatformColors.palette.card.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            // PA
            InfoRow(label = stringResource(R.string.fm_pa_label), value = "${data.pa}")

            // Foot
            data.foot?.let { foot ->
                if (foot.left > 0 || foot.right > 0) {
                    val footLabel = if (foot.left > foot.right)
                        stringResource(R.string.fm_left_foot)
                    else
                        stringResource(R.string.fm_right_foot)
                    val footValue = if (foot.left > foot.right) foot.left else foot.right
                    InfoRow(label = footLabel, value = "$footValue")
                }
            }

            // Height
            if (data.heightCm > 0) {
                InfoRow(label = stringResource(R.string.fm_height), value = "${data.heightCm} cm")
            }

            // Best position
            data.bestPosition?.let { bp ->
                InfoRow(
                    label = stringResource(R.string.fm_best_fit),
                    value = "${posLabel(bp.position)} (${bp.fit}%)"
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        // Dimension bars
        Text(
            text = stringResource(R.string.fm_ability_dimensions),
            style = boldTextStyle(PlatformColors.palette.textSecondary, 10.sp).copy(letterSpacing = 1.sp),
            modifier = Modifier.padding(bottom = 6.dp)
        )
        val sorted = data.dimensionScores.entries.sortedByDescending { it.value }
        sorted.forEach { (key, value) ->
            DimensionBar(label = dimLabel(key), value = value)
            Spacer(Modifier.height(4.dp))
        }

        Spacer(Modifier.height(16.dp))

        // Top + Weak attributes side by side
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // Top attributes
            Column(
                Modifier
                    .weight(1f)
                    .background(PlatformColors.palette.card.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                    .padding(10.dp)
            ) {
                Text(
                    text = "🔥 ${stringResource(R.string.fm_top_attributes)}",
                    style = boldTextStyle(PlatformColors.palette.textSecondary, 10.sp).copy(letterSpacing = 0.5.sp),
                    modifier = Modifier.padding(bottom = 6.dp)
                )
                data.topAttributes.forEach { attr ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 1.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = attrLabel(attr.name),
                            style = regularTextStyle(PlatformColors.palette.textPrimary, 11.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "${attr.value}",
                            style = boldTextStyle(attrValueColor(attr.value), 11.sp)
                        )
                    }
                }
            }

            // Weak attributes
            Column(
                Modifier
                    .weight(1f)
                    .background(PlatformColors.palette.card.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                    .padding(10.dp)
            ) {
                Text(
                    text = "⚠️ ${stringResource(R.string.fm_weaknesses)}",
                    style = boldTextStyle(PlatformColors.palette.textSecondary, 10.sp).copy(letterSpacing = 0.5.sp),
                    modifier = Modifier.padding(bottom = 6.dp)
                )
                if (data.weakAttributes.isEmpty()) {
                    Text(
                        text = stringResource(R.string.fm_no_weaknesses),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                    )
                } else {
                    data.weakAttributes.forEach { attr ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 1.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = attrLabel(attr.name),
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = "${attr.value}",
                                style = boldTextStyle(attrValueColor(attr.value), 11.sp)
                            )
                        }
                    }
                }
            }
        }
    }
}

/* ─── Sub-composables ──────────────────────────────────────────── */

@Composable
private fun CaRing(ca: Int, tier: String) {
    val color = tierColor(tier)
    val pct = (ca.coerceIn(0, 100)) / 100f

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(80.dp)) {
        Canvas(Modifier.size(80.dp)) {
            val strokeW = 5.dp.toPx()
            // Background ring
            drawArc(
                color = Color(0xFF253545),
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(width = strokeW, cap = StrokeCap.Round),
                topLeft = Offset(strokeW / 2, strokeW / 2),
                size = Size(size.width - strokeW, size.height - strokeW)
            )
            // Progress ring
            drawArc(
                color = color,
                startAngle = -90f,
                sweepAngle = 360f * pct,
                useCenter = false,
                style = Stroke(width = strokeW, cap = StrokeCap.Round),
                topLeft = Offset(strokeW / 2, strokeW / 2),
                size = Size(size.width - strokeW, size.height - strokeW)
            )
        }
        Text(
            text = "$ca",
            style = boldTextStyle(color, 22.sp)
        )
    }
}

@Composable
private fun DimensionBar(label: String, value: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
            modifier = Modifier.width(90.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.End
        )
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .weight(1f)
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Color(0xFF253545))
        ) {
            Box(
                Modifier
                    .fillMaxWidth(value / 100f)
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(dimBarColor(value))
            )
        }
        Spacer(Modifier.width(6.dp))
        Text(
            text = "$value",
            style = boldTextStyle(dimBarColor(value), 11.sp),
            modifier = Modifier.width(24.dp),
            textAlign = TextAlign.End
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
        )
        Text(
            text = value,
            style = boldTextStyle(PlatformColors.palette.textPrimary, 12.sp)
        )
    }
}
