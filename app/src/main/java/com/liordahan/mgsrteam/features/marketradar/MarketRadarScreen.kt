package com.liordahan.mgsrteam.features.marketradar

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.ui.components.BritIcons
import com.liordahan.mgsrteam.ui.components.BritTopHeader
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.PaperGrainOverlay
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

/**
 * MARKET RADAR — the mock's SCREENS.marketRadar "live moves" editorial feed,
 * wired to the web's Early Market Radar (/api/market-radar via
 * [MarketRadarApiClient]). Each row shows a toned pulse tick, the detected
 * player / headline, the situation move, and a "when" caption, matching the
 * mock's `.radar-row`. Loading / empty / error states included.
 */
@Composable
fun MarketRadarScreen(
    navController: NavController,
    viewModel: IMarketRadarViewModel = koinViewModel(),
    platformManager: PlatformManager = koinInject(),
) {
    val platform by platformManager.current.collectAsStateWithLifecycle()
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val (accent, _) = BritTokens.accentFor(platform)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BritTokens.paper),
    ) {
        PaperGrainOverlay()
        Column(modifier = Modifier.fillMaxSize()) {
            BritTopHeader(
                platform = platform,
                pageTitle = "Market Radar",
                hasUnreadNotifications = false,
                onBellClick = {},
                onPlatformSwitch = { platformManager.switchTo(it) },
                showBack = true,
                onBackClick = { navController.popBackStack() },
            )

            when {
                state.isLoading -> MarketRadarLoading()
                state.errorMessage != null && state.items.isEmpty() ->
                    MarketRadarError(message = state.errorMessage!!, accent = accent, onRetry = { viewModel.retry() })
                state.items.isEmpty() -> MarketRadarEmpty(accent = accent, onRefresh = { viewModel.retry() })
                else -> MarketRadarFeed(
                    items = state.items,
                    platform = platform,
                    accent = accent,
                )
            }
        }
    }
}

// ── Masthead ────────────────────────────────────────────────────────────────

@Composable
private fun MarketRadarMasthead(platform: Platform, accent: Color) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
        Text(
            text = "LIVE MOVES · ${platformLabel(platform)}",
            style = britMono(accent, 10.sp, letterSpacing = 2.2.sp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "MARKET",
            style = britDisplay(BritTokens.ink, 34.sp, weight = 600, letterSpacing = 0.5.sp),
        )
        Text(
            text = "RADAR.",
            style = britDisplay(accent, 34.sp, weight = 600, letterSpacing = 0.5.sp),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "THE LEAGUES YOU WATCH · IN REAL TIME",
            style = britMono(BritTokens.muted, 9.sp, letterSpacing = 1.6.sp),
        )
    }
}

// ── Feed ──────────────────────────────────────────────────────────────────

@Composable
private fun MarketRadarFeed(
    items: List<MarketRadarItem>,
    platform: Platform,
    accent: Color,
) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { MarketRadarMasthead(platform = platform, accent = accent) }
        item { LivePill(count = items.size, accent = accent) }
        items(items, key = { it.id }) { radar ->
            RadarRow(radar = radar, accent = accent)
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun LivePill(count: Int, accent: Color) {
    val transition = rememberInfiniteTransition(label = "radar_pulse")
    val pulse by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse),
        label = "radar_pulse_alpha",
    )
    Row(
        modifier = Modifier
            .padding(horizontal = 20.dp)
            .padding(bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .graphicsLayer { alpha = pulse }
                .clip(CircleShape)
                .background(accent)
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = "LIVE · $count ${if (count == 1) "MOVE" else "MOVES"} TODAY",
            style = britMono(BritTokens.ink, 10.sp, letterSpacing = 1.8.sp),
        )
    }
}

@Composable
private fun RadarRow(radar: MarketRadarItem, accent: Color) {
    val toneColor = toneColor(radar.signalType?.tone, accent)
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(toneColor)
            )
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = radar.detectedPlayer?.name?.takeIf { it.isNotBlank() } ?: radar.headline,
                    style = britDisplay(BritTokens.ink, 17.sp, weight = 600, letterSpacing = 0.3.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    text = radarMoveLine(radar),
                    style = britBody(BritTokens.muted, 13.sp),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                radar.signalType?.let { sig ->
                    Spacer(Modifier.height(5.dp))
                    SignalChip(label = sig.label, tone = toneColor)
                }
            }
            Spacer(Modifier.width(10.dp))
            Text(
                text = radar.timeAgo.ifBlank { radar.dateFormatted }.uppercase(),
                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 1.2.sp),
            )
        }
        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .fillMaxWidth()
                .height(1.dp)
                .background(BritTokens.line2)
        )
    }
}

@Composable
private fun SignalChip(label: String, tone: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(tone.copy(alpha = 0.12f))
            .border(1.dp, tone.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
            .padding(horizontal = 7.dp, vertical = 3.dp),
    ) {
        Text(
            text = label.uppercase(),
            style = britMono(tone, 8.sp, letterSpacing = 1.2.sp),
        )
    }
}

/** Build the mock's `move` subtitle from the detected player + situation. */
private fun radarMoveLine(radar: MarketRadarItem): String {
    val player = radar.detectedPlayer
    val facts = buildList {
        player?.club?.let { add(it) }
        player?.position?.let { add(it) }
        player?.age?.let { add("Age $it") }
        player?.marketValue?.let { add(it) }
    }
    val lead = radar.summary.ifBlank { radar.signalReason }.ifBlank { radar.headline }
    return if (facts.isEmpty()) lead else "${facts.joinToString(" · ")} — $lead"
}

// ── States ──────────────────────────────────────────────────────────────────

@Composable
private fun MarketRadarLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        com.liordahan.mgsrteam.ui.components.BritLoader(
            title = "MARKET RADAR",
            subtitle = "SCANNING THE WIRE",
        )
    }
}

@Composable
private fun MarketRadarEmpty(accent: Color, onRefresh: () -> Unit) {
    StateMessage(
        icon = BritIcons.MarketRadar,
        accent = accent,
        title = "NO LIVE MOVES",
        body = "The radar found no new disruptions in the leagues you watch. Pull the latest wire again shortly.",
        actionLabel = "REFRESH THE WIRE",
        onAction = onRefresh,
    )
}

@Composable
private fun MarketRadarError(message: String, accent: Color, onRetry: () -> Unit) {
    StateMessage(
        icon = BritIcons.MarketRadar,
        accent = accent,
        title = "THE WIRE WENT QUIET",
        body = message,
        actionLabel = "TRY AGAIN",
        onAction = onRetry,
    )
}

@Composable
private fun StateMessage(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    accent: Color,
    title: String,
    body: String,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = accent, modifier = Modifier.size(44.dp))
            Spacer(Modifier.height(18.dp))
            Text(
                text = title,
                style = britDisplay(BritTokens.ink, 24.sp, weight = 600, letterSpacing = 0.5.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center),
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = body,
                style = britBody(BritTokens.muted, 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center),
            )
            Spacer(Modifier.height(20.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(accent)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onAction() }
                    .padding(horizontal = 20.dp, vertical = 12.dp),
            ) {
                Text(
                    text = actionLabel,
                    style = britMono(BritTokens.paper, 10.sp, letterSpacing = 1.6.sp),
                )
            }
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

private fun toneColor(tone: RadarTone?, accent: Color): Color = when (tone) {
    RadarTone.GOLD -> accent
    RadarTone.BLUE -> BritTokens.blue
    RadarTone.AMBER -> BritTokens.amber
    RadarTone.GREEN -> BritTokens.green
    RadarTone.RED -> BritTokens.red
    RadarTone.MUTED, null -> BritTokens.muted
}

private fun platformLabel(platform: Platform): String = when (platform) {
    Platform.MEN -> "MEN"
    Platform.YOUTH -> "ACADEMY"
}
