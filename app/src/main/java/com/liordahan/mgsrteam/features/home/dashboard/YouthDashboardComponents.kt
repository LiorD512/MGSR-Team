package com.liordahan.mgsrteam.features.home.dashboard

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContactPhone
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.FeedFilter
import com.liordahan.mgsrteam.features.home.HomeDashboardState
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.home.models.MyAgentOverview
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.YouthColors
import com.liordahan.mgsrteam.ui.theme.YouthDesignSystem
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

/**
 * ═══════════════════════════════════════════════════════════════════
 *  NOVA — Youth Platform Dashboard Components
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Design language: Electric • Fresh • Rising
 *  • Neon-glow pulsing stat cards (cyan ↔ violet cycle)
 *  • Vertical "rising" gradients (bottom → top)
 *  • Cyan/violet/lime tri-color spectrum
 *  • Future-forward language ("Prospects", "Rising Stars", "Academy")
 *  • 16dp rounded shapes with neon border effects
 * ═══════════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════════════════════
//  YOUTH GREETING TAGLINE — "Rising stars start here"
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun YouthGreetingTagline(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.youth_dashboard_greeting_tagline),
        style = YouthDesignSystem.risingStarQuote,
        modifier = modifier.padding(horizontal = 20.dp)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  YOUTH STATS ROW — Neon-glow stat cards with electric pulse
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun YouthStatsRow(state: HomeDashboardState, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        YouthStatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.School,
            value = state.totalPlayers.toString(),
            label = stringResource(R.string.youth_stat_prospects),
            accentColor = YouthColors.Cyan,
            glowColor = YouthColors.Cyan
        )
        YouthStatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.RequestQuote,
            value = state.requestsCount.toString(),
            label = stringResource(R.string.youth_stat_inquiries),
            accentColor = YouthColors.Violet,
            glowColor = YouthColors.Violet
        )
    }
}

@Composable
private fun YouthStatCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String,
    accentColor: Color,
    glowColor: Color
) {
    // Neon pulsing glow animation — faster/brighter than women for youthful energy
    val infiniteTransition = rememberInfiniteTransition(label = "youth_stat_glow")
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.10f,
        targetValue = 0.30f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = YouthDesignSystem.NEON_FLICKER_DURATION_MS,
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Reverse
        ),
        label = "youth_glow_alpha"
    )

    Card(
        modifier = modifier
            .border(
                width = 1.dp,
                brush = Brush.verticalGradient(
                    colors = listOf(
                        glowColor.copy(alpha = glowAlpha * 0.3f),
                        glowColor.copy(alpha = glowAlpha)
                    )
                ),
                shape = YouthDesignSystem.CardShape
            ),
        shape = YouthDesignSystem.CardShape,
        colors = CardDefaults.cardColors(containerColor = YouthColors.CardSurface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(YouthDesignSystem.StatShimmerGradient)
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Neon-tinted icon circle
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(16.dp)
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = value,
                style = YouthDesignSystem.statValue
            )
            Text(
                text = label.uppercase(),
                style = YouthDesignSystem.statLabel
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  YOUTH QUICK ACTIONS — Neon gradient chips with electric borders
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun YouthQuickActionsRow(navController: NavController, modifier: Modifier = Modifier) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = modifier.padding(vertical = 14.dp)
    ) {
        item {
            YouthQuickChip(
                icon = Icons.Default.School,
                label = stringResource(R.string.youth_quick_prospects),
                color = YouthColors.Cyan,
                hasGlow = true,
                onClick = {
                    navController.navigate(Screens.PlayersScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            YouthQuickChip(
                icon = Icons.Default.Visibility,
                label = stringResource(R.string.youth_quick_watchlist),
                color = YouthColors.Violet,
                onClick = {
                    navController.navigate(Screens.ShortlistScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            YouthQuickChip(
                icon = Icons.Default.ContactPhone,
                label = stringResource(R.string.youth_quick_connections),
                color = YouthColors.Lime,
                onClick = {
                    navController.navigate(Screens.ContactsScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            YouthQuickChip(
                icon = Icons.Default.EmojiEvents,
                label = stringResource(R.string.youth_quick_inquiries),
                color = YouthColors.VioletLight,
                onClick = {
                    navController.navigate(Screens.RequestsScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            YouthQuickChip(
                icon = Icons.Default.CheckCircle,
                label = stringResource(R.string.youth_quick_goals),
                color = YouthColors.LimeLight,
                onClick = {
                    navController.navigate(Screens.TasksScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
    }
}

@Composable
private fun YouthQuickChip(
    icon: ImageVector,
    label: String,
    color: Color,
    hasGlow: Boolean = false,
    onClick: () -> Unit
) {
    val chipBg = if (hasGlow) {
        YouthDesignSystem.ChipSelectedGradient
    } else {
        Brush.horizontalGradient(
            listOf(color.copy(alpha = 0.15f), color.copy(alpha = 0.08f))
        )
    }

    Row(
        modifier = Modifier
            .clip(YouthDesignSystem.ChipShape)
            .background(chipBg)
            .then(
                if (hasGlow) Modifier.border(
                    1.dp,
                    Brush.horizontalGradient(
                        listOf(
                            YouthColors.Cyan.copy(alpha = 0.5f),
                            YouthColors.Violet.copy(alpha = 0.3f)
                        )
                    ),
                    YouthDesignSystem.ChipShape
                ) else Modifier
            )
            .clickWithNoRipple { onClick() }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = label,
            style = boldTextStyle(color, 12.sp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  YOUTH AGENT HUB — Rising star command center with cyan/violet visuals
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun YouthAgentHubSection(
    overview: MyAgentOverview,
    navController: NavController,
    onTaskToggle: (AgentTask) -> Unit
) {
    Column(modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)) {

        // ── Header with nova accent ──────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.youth_hub_title),
                style = YouthDesignSystem.sectionHeader,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = stringResource(R.string.youth_my_hub_view_my_players),
                style = boldTextStyle(YouthColors.Cyan, 12.sp),
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { navController.navigate(Screens.playersRoute(myPlayersOnly = true)) }
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        Spacer(Modifier.height(4.dp))

        // Nova gradient accent bar (cyan → violet)
        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .width(50.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(YouthDesignSystem.NovaHorizontalGradient)
        )
        Spacer(Modifier.height(14.dp))

        // ── Stats Card with completion ring ─────────────────────────────
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .border(
                    1.dp,
                    Brush.linearGradient(
                        listOf(
                            YouthColors.Cyan.copy(alpha = 0.3f),
                            YouthColors.Violet.copy(alpha = 0.15f)
                        )
                    ),
                    YouthDesignSystem.CardShape
                ),
            shape = YouthDesignSystem.CardShape,
            colors = CardDefaults.cardColors(containerColor = YouthColors.CardSurface)
        ) {
            Row(
                modifier = Modifier
                    .background(YouthDesignSystem.StatShimmerGradient)
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Nova-themed completion ring (cyan → violet sweep)
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(72.dp)
                ) {
                    YouthCompletionRing(
                        percentage = overview.taskCompletionPercent,
                        modifier = Modifier.fillMaxSize()
                    )
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp)
                    ) {
                        Text(
                            text = "${overview.completedTaskCount}/${overview.totalTaskCount}",
                            style = boldTextStyle(YouthColors.Cyan, 11.sp),
                            textAlign = TextAlign.Center,
                            maxLines = 1
                        )
                        Text(
                            text = stringResource(R.string.youth_hub_tasks_completed),
                            style = regularTextStyle(YouthColors.TextSecondary, 8.sp),
                            textAlign = TextAlign.Center,
                            maxLines = 1
                        )
                    }
                }

                Spacer(Modifier.width(16.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        YouthHubStatItem(
                            overview.totalPlayers.toString(),
                            stringResource(R.string.youth_hub_prospects),
                            YouthColors.Cyan
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Rising star quotes (rotates every 30s)
        val quotes = listOf(
            R.string.youth_inspire_quote_1,
            R.string.youth_inspire_quote_2,
            R.string.youth_inspire_quote_3
        )
        val quoteIndex = remember { (System.currentTimeMillis() / 30_000).toInt() % quotes.size }
        Text(
            text = "\"${stringResource(quotes[quoteIndex])}\"",
            style = YouthDesignSystem.risingStarQuote,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun YouthHubStatItem(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, style = boldTextStyle(color, 18.sp))
        Text(
            text = label.uppercase(),
            style = YouthDesignSystem.statLabel
        )
    }
}

/** Cyan → Violet ring chart for task completion. */
@Composable
private fun YouthCompletionRing(
    percentage: Float,
    modifier: Modifier = Modifier
) {
    val cyan = YouthColors.Cyan
    val violet = YouthColors.Violet
    val track = YouthColors.CardBorder

    Canvas(modifier = modifier) {
        val stroke = 6.dp.toPx()
        val radius = (size.minDimension - stroke) / 2
        val topLeft = Offset(
            (size.width - radius * 2) / 2,
            (size.height - radius * 2) / 2
        )
        val arcSize = Size(radius * 2, radius * 2)

        // Track
        drawArc(
            color = track,
            startAngle = -90f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )

        // Progress — cyan to violet gradient sweep (rising energy)
        val sweepAngle = 360f * percentage.coerceIn(0f, 1f)
        if (sweepAngle > 0f) {
            drawArc(
                brush = Brush.sweepGradient(
                    colors = listOf(cyan, violet, cyan)
                ),
                startAngle = -90f,
                sweepAngle = sweepAngle,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  YOUTH FEED SECTION HEADER — neon filter chips
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun YouthFeedSectionHeader(
    selectedFilter: FeedFilter,
    onFilterSelected: (FeedFilter) -> Unit
) {
    Column(modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 10.dp)) {
        Text(
            text = stringResource(R.string.youth_feed_title),
            style = YouthDesignSystem.sectionHeader
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FeedFilter.entries.forEach { filter ->
                val isSelected = filter == selectedFilter
                val bgColor by animateColorAsState(
                    targetValue = if (isSelected) YouthColors.Cyan else Color.Transparent,
                    label = "youthFilterBg"
                )
                val textColor = if (isSelected) YouthColors.Background else YouthColors.TextSecondary

                Text(
                    text = stringResource(filter.labelRes),
                    style = boldTextStyle(textColor, 12.sp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(bgColor)
                        .then(
                            if (!isSelected) Modifier.border(
                                1.dp,
                                YouthColors.CardBorder,
                                RoundedCornerShape(16.dp)
                            ) else Modifier
                        )
                        .clickable { onFilterSelected(filter) }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  YOUTH EMPTY STATE — Energizing "future starts now" messaging
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun YouthAgentEmptyState(modifier: Modifier = Modifier) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .border(
                1.dp,
                Brush.linearGradient(
                    listOf(
                        YouthColors.Cyan.copy(alpha = 0.2f),
                        YouthColors.Violet.copy(alpha = 0.1f)
                    )
                ),
                YouthDesignSystem.CardShape
            ),
        shape = YouthDesignSystem.CardShape,
        colors = CardDefaults.cardColors(containerColor = YouthColors.CardSurface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(YouthDesignSystem.StatShimmerGradient)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Rocket icon with neon glow
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.radialGradient(
                            listOf(
                                YouthColors.Cyan.copy(alpha = 0.25f),
                                YouthColors.Violet.copy(alpha = 0.1f)
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.RocketLaunch,
                    contentDescription = null,
                    tint = YouthColors.Cyan,
                    modifier = Modifier.size(32.dp)
                )
            }

            Spacer(Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.youth_empty_state_title),
                style = YouthDesignSystem.cardTitle,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.youth_empty_state_subtitle),
                style = YouthDesignSystem.bodySecondary,
                textAlign = TextAlign.Center
            )
        }
    }
}
