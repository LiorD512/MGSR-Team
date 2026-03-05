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
import androidx.compose.material.icons.filled.RequestQuote
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.FeedFilter
import com.liordahan.mgsrteam.features.home.HomeDashboardState
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.home.models.MyAgentOverview
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.WomenColors
import com.liordahan.mgsrteam.ui.theme.WomenDesignSystem
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.compose.koinInject

/**
 * ═══════════════════════════════════════════════════════════════════
 *  ATHENA — Women's Dashboard Components
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Distinct from the men's platform:
 *  • Glowing gradient-bordered stat cards
 *  • Diagonal athena gradient chips
 *  • Orchid/gold color language
 *  • Empowering athlete-first terminology
 *  • Animated glow effects
 * ═══════════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════════════════════
//  WOMEN GREETING TAGLINE
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun WomenGreetingTagline(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.women_dashboard_greeting_tagline),
        style = WomenDesignSystem.empowermentQuote,
        modifier = modifier.padding(horizontal = 20.dp)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  WOMEN STATS ROW — Glowing gradient stat cards
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun WomenStatsRow(state: HomeDashboardState, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        WomenStatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.People,
            value = state.totalPlayers.toString(),
            label = stringResource(R.string.women_stat_athletes),
            accentColor = WomenColors.Orchid,
            glowColor = WomenColors.Orchid
        )
        WomenStatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.Handshake,
            value = state.withMandate.toString(),
            label = stringResource(R.string.women_stat_represented),
            accentColor = WomenColors.Gold,
            glowColor = WomenColors.Gold
        )
        WomenStatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.PersonOff,
            value = state.freeAgents.toString(),
            label = stringResource(R.string.women_stat_available),
            accentColor = WomenColors.RoseCoral,
            glowColor = WomenColors.RoseCoral
        )
        WomenStatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.RequestQuote,
            value = state.requestsCount.toString(),
            label = stringResource(R.string.women_stat_inquiries),
            accentColor = WomenColors.OrchidLight,
            glowColor = WomenColors.OrchidLight
        )
    }
}

@Composable
private fun WomenStatCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String,
    accentColor: Color,
    glowColor: Color
) {
    // Subtle pulsing glow animation
    val infiniteTransition = rememberInfiniteTransition(label = "stat_glow")
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.08f,
        targetValue = 0.20f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = WomenDesignSystem.GLOW_PULSE_DURATION_MS,
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow_alpha"
    )

    Card(
        modifier = modifier
            .border(
                width = 1.dp,
                brush = Brush.linearGradient(
                    colors = listOf(
                        glowColor.copy(alpha = glowAlpha),
                        glowColor.copy(alpha = glowAlpha * 0.3f)
                    )
                ),
                shape = WomenDesignSystem.CardShape
            ),
        shape = WomenDesignSystem.CardShape,
        colors = CardDefaults.cardColors(containerColor = WomenColors.CardSurface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(WomenDesignSystem.StatShimmerGradient)
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Gradient-tinted icon circle
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
                style = WomenDesignSystem.statValue
            )
            Text(
                text = label.uppercase(),
                style = WomenDesignSystem.statLabel
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  WOMEN QUICK ACTIONS — Athena gradient chips with glow borders
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun WomenQuickActionsRow(navController: NavController, modifier: Modifier = Modifier) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = modifier.padding(vertical = 14.dp)
    ) {
        item {
            WomenQuickChip(
                icon = Icons.Default.Star,
                label = stringResource(R.string.women_quick_athletes),
                color = WomenColors.Orchid,
                hasGlow = true,
                onClick = {
                    navController.navigate(Screens.PlayersScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            WomenQuickChip(
                icon = Icons.Default.Visibility,
                label = stringResource(R.string.women_quick_watchlist),
                color = WomenColors.Gold,
                onClick = {
                    navController.navigate(Screens.ShortlistScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            WomenQuickChip(
                icon = Icons.Default.ContactPhone,
                label = stringResource(R.string.women_quick_connections),
                color = WomenColors.RoseCoralLight,
                onClick = {
                    navController.navigate(Screens.ContactsScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            WomenQuickChip(
                icon = Icons.Default.EmojiEvents,
                label = stringResource(R.string.women_quick_inquiries),
                color = WomenColors.OrchidLight,
                onClick = {
                    navController.navigate(Screens.RequestsScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            WomenQuickChip(
                icon = Icons.Default.CheckCircle,
                label = stringResource(R.string.women_quick_goals),
                color = WomenColors.Success,
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
private fun WomenQuickChip(
    icon: ImageVector,
    label: String,
    color: Color,
    hasGlow: Boolean = false,
    onClick: () -> Unit
) {
    val chipBg = if (hasGlow) {
        WomenDesignSystem.ChipSelectedGradient
    } else {
        Brush.horizontalGradient(
            listOf(color.copy(alpha = 0.15f), color.copy(alpha = 0.08f))
        )
    }

    Row(
        modifier = Modifier
            .clip(WomenDesignSystem.ChipShape)
            .background(chipBg)
            .then(
                if (hasGlow) Modifier.border(
                    1.dp,
                    Brush.horizontalGradient(
                        listOf(
                            WomenColors.Orchid.copy(alpha = 0.5f),
                            WomenColors.Gold.copy(alpha = 0.3f)
                        )
                    ),
                    WomenDesignSystem.ChipShape
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
//  WOMEN AGENT HUB — Command center with orchid/gold visuals
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun WomenAgentHubSection(
    overview: MyAgentOverview,
    navController: NavController,
    onTaskToggle: (AgentTask) -> Unit
) {
    Column(modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)) {

        // ── Header with athena accent ──────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.women_hub_title),
                style = WomenDesignSystem.sectionHeader,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = stringResource(R.string.women_my_hub_view_my_players),
                style = boldTextStyle(WomenColors.Orchid, 12.sp),
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { navController.navigate(Screens.playersRoute(myPlayersOnly = true)) }
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        Spacer(Modifier.height(4.dp))

        // Gradient accent bar (orchid → gold)
        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .width(50.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(WomenDesignSystem.AthenaGradient)
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
                            WomenColors.Orchid.copy(alpha = 0.3f),
                            WomenColors.Gold.copy(alpha = 0.15f)
                        )
                    ),
                    WomenDesignSystem.CardShape
                ),
            shape = WomenDesignSystem.CardShape,
            colors = CardDefaults.cardColors(containerColor = WomenColors.CardSurface)
        ) {
            Row(
                modifier = Modifier
                    .background(WomenDesignSystem.StatShimmerGradient)
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Orchid-themed completion ring
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(72.dp)
                ) {
                    WomenMandateRing(
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
                            style = boldTextStyle(WomenColors.Orchid, 11.sp),
                            textAlign = TextAlign.Center,
                            maxLines = 1
                        )
                        Text(
                            text = stringResource(R.string.women_hub_tasks_completed),
                            style = regularTextStyle(WomenColors.TextSecondary, 8.sp),
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
                        WomenHubStatItem(
                            overview.totalPlayers.toString(),
                            stringResource(R.string.women_hub_athletes),
                            WomenColors.Orchid
                        )
                        WomenHubStatItem(
                            overview.withMandate.toString(),
                            stringResource(R.string.women_hub_represented),
                            WomenColors.Gold
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        WomenHubStatItem(
                            overview.freeAgents.toString(),
                            stringResource(R.string.women_hub_available),
                            WomenColors.RoseCoral
                        )
                        WomenHubStatItem(
                            overview.expiringContracts.toString(),
                            stringResource(R.string.women_hub_expiring),
                            WomenColors.Warning
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Inspire quote (rotates)
        val quotes = listOf(
            R.string.women_inspire_quote_1,
            R.string.women_inspire_quote_2,
            R.string.women_inspire_quote_3
        )
        val quoteIndex = remember { (System.currentTimeMillis() / 30_000).toInt() % quotes.size }
        Text(
            text = "\"${stringResource(quotes[quoteIndex])}\"",
            style = WomenDesignSystem.empowermentQuote,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun WomenHubStatItem(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, style = boldTextStyle(color, 18.sp))
        Text(
            text = label.uppercase(),
            style = WomenDesignSystem.statLabel
        )
    }
}

/** Orchid → Gold ring chart for task completion. */
@Composable
private fun WomenMandateRing(
    percentage: Float,
    modifier: Modifier = Modifier
) {
    val orchid = WomenColors.Orchid
    val gold = WomenColors.Gold
    val track = WomenColors.CardBorder

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

        // Progress — orchid to gold gradient effect via color interpolation
        val sweepAngle = 360f * percentage.coerceIn(0f, 1f)
        if (sweepAngle > 0f) {
            drawArc(
                brush = Brush.sweepGradient(
                    colors = listOf(orchid, gold, orchid)
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
//  WOMEN FEED SECTION HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun WomenFeedSectionHeader(
    selectedFilter: FeedFilter,
    onFilterSelected: (FeedFilter) -> Unit
) {
    Column(modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 10.dp)) {
        Text(
            text = stringResource(R.string.women_feed_title),
            style = WomenDesignSystem.sectionHeader
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FeedFilter.entries.forEach { filter ->
                val isSelected = filter == selectedFilter
                val bgColor by animateColorAsState(
                    targetValue = if (isSelected) WomenColors.Orchid else Color.Transparent,
                    label = "womenFilterBg"
                )
                val textColor = if (isSelected) WomenColors.Background else WomenColors.TextSecondary

                Text(
                    text = stringResource(filter.labelRes),
                    style = boldTextStyle(textColor, 12.sp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(bgColor)
                        .then(
                            if (!isSelected) Modifier.border(
                                1.dp,
                                WomenColors.CardBorder,
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
//  WOMEN EMPTY STATE — Empowering messaging
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun WomenAgentEmptyState(modifier: Modifier = Modifier) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .border(
                1.dp,
                Brush.linearGradient(
                    listOf(
                        WomenColors.Orchid.copy(alpha = 0.2f),
                        WomenColors.Gold.copy(alpha = 0.1f)
                    )
                ),
                WomenDesignSystem.CardShape
            ),
        shape = WomenDesignSystem.CardShape,
        colors = CardDefaults.cardColors(containerColor = WomenColors.CardSurface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(WomenDesignSystem.StatShimmerGradient)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Trophy icon with glow
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.radialGradient(
                            listOf(
                                WomenColors.Gold.copy(alpha = 0.25f),
                                WomenColors.Orchid.copy(alpha = 0.1f)
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.EmojiEvents,
                    contentDescription = null,
                    tint = WomenColors.Gold,
                    modifier = Modifier.size(32.dp)
                )
            }

            Spacer(Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.women_empty_state_title),
                style = WomenDesignSystem.cardTitle,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.women_empty_state_subtitle),
                style = WomenDesignSystem.bodySecondary,
                textAlign = TextAlign.Center
            )
        }
    }
}
