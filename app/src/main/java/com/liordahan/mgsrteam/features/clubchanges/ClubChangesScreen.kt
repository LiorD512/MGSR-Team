package com.liordahan.mgsrteam.features.clubchanges

import android.net.Uri
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.BritIcons
import com.liordahan.mgsrteam.ui.components.BritTopHeader
import com.liordahan.mgsrteam.ui.components.GrayscalePlayerPhoto
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.PaperGrainOverlay
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * CLUB CHANGES — the mock's SCREENS.clubChanges "who moved where" editorial
 * feed. Mirrors the web club-change-notifications page by reading CLUB_CHANGE
 * FeedEvents (joined to the roster) via [ClubChangesViewModel]. Each row shows
 * the grayscale player portrait, name + position/age/value, the from → to move,
 * and a "when" caption. Roster-matched moves open the player dossier.
 */
@Composable
fun ClubChangesScreen(
    navController: NavController,
    viewModel: IClubChangesViewModel = koinViewModel(),
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
                pageTitle = "Club Changes",
                hasUnreadNotifications = false,
                onBellClick = {},
                onPlatformSwitch = { platformManager.switchTo(it) },
                showBack = true,
                onBackClick = { navController.popBackStack() },
            )

            when {
                state.isLoading -> ClubChangesLoading()
                state.items.isEmpty() -> ClubChangesEmpty(accent = accent)
                else -> ClubChangesFeed(
                    state = state,
                    platform = platform,
                    accent = accent,
                    onOpenPlayer = { playerId ->
                        navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(playerId)}")
                    },
                )
            }
        }
    }
}

// ── Masthead ────────────────────────────────────────────────────────────────

@Composable
private fun ClubChangesMasthead(platform: Platform, accent: Color) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
        Text(
            text = "WHO MOVED WHERE · ${platformLabel(platform)}",
            style = britMono(accent, 10.sp, letterSpacing = 2.2.sp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "CLUB",
            style = britDisplay(BritTokens.ink, 34.sp, weight = 600, letterSpacing = 0.5.sp),
        )
        Text(
            text = "CHANGES.",
            style = britDisplay(accent, 34.sp, weight = 600, letterSpacing = 0.5.sp),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "EVERY MOVE OPENS A DOOR",
            style = britMono(BritTokens.muted, 9.sp, letterSpacing = 1.6.sp),
        )
    }
}

@Composable
private fun ClubChangesSignals(state: ClubChangesUiState, accent: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Signal(label = "MOVES", value = state.items.size, accent = accent, modifier = Modifier.weight(1f))
        Signal(label = "FROM ROSTER", value = state.rosterCount, accent = accent, modifier = Modifier.weight(1f))
        Signal(label = "NEW TODAY", value = state.newTodayCount, accent = accent, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun Signal(label: String, value: Int, accent: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(BritTokens.card)
            .border(1.dp, BritTokens.line, RoundedCornerShape(10.dp))
            .padding(vertical = 12.dp, horizontal = 12.dp),
    ) {
        Text(text = label, style = britMono(BritTokens.muted, 8.sp, letterSpacing = 1.4.sp))
        Spacer(Modifier.height(4.dp))
        Text(
            text = value.toString().padStart(2, '0'),
            style = britDisplay(accent, 26.sp, weight = 600),
        )
    }
}

// ── Feed ──────────────────────────────────────────────────────────────────

@Composable
private fun ClubChangesFeed(
    state: ClubChangesUiState,
    platform: Platform,
    accent: Color,
    onOpenPlayer: (String) -> Unit,
) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { ClubChangesMasthead(platform = platform, accent = accent) }
        item { ClubChangesSignals(state = state, accent = accent) }
        items(state.items, key = { it.playerUrl }) { item ->
            ClubChangeCard(item = item, accent = accent, onOpenPlayer = onOpenPlayer)
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun ClubChangeCard(
    item: ClubChangeItem,
    accent: Color,
    onOpenPlayer: (String) -> Unit,
) {
    val clickable = item.isRoster && !item.rosterPlayerId.isNullOrBlank()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 7.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(BritTokens.card)
            .border(1.dp, if (item.isRoster) accent.copy(alpha = 0.4f) else BritTokens.line, RoundedCornerShape(12.dp))
            .then(
                if (clickable) Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { onOpenPlayer(item.rosterPlayerId!!) } else Modifier
            )
            .padding(14.dp),
    ) {
        // Badge + player head.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(8.dp)),
            ) {
                GrayscalePlayerPhoto(
                    imageUrl = item.displayImage,
                    name = item.displayName,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.displayName,
                    style = britDisplay(BritTokens.ink, 17.sp, weight = 600, letterSpacing = 0.3.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    text = metaLine(item),
                    style = britBody(BritTokens.muted, 12.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(8.dp))
            ClubChangeBadge(isRoster = item.isRoster, accent = accent)
        }

        Spacer(Modifier.height(12.dp))

        // From → To transfer row.
        Row(verticalAlignment = Alignment.CenterVertically) {
            ClubCell(label = "FROM", name = item.oldClub, modifier = Modifier.weight(1f))
            Icon(
                imageVector = BritIcons.ClubChanges,
                contentDescription = null,
                tint = accent,
                modifier = Modifier
                    .padding(horizontal = 10.dp)
                    .size(18.dp),
            )
            ClubCell(label = "TO", name = item.newClub, modifier = Modifier.weight(1f))
        }

        Spacer(Modifier.height(10.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "MOVED · ${formatTimestamp(item.timestamp)}",
                style = britMono(BritTokens.muted, 8.sp, letterSpacing = 1.2.sp),
            )
            Spacer(Modifier.weight(1f))
            if (clickable) {
                Text(
                    text = "OPEN PLAYER →",
                    style = britMono(accent, 8.sp, letterSpacing = 1.2.sp),
                )
            }
        }
    }
}

@Composable
private fun ClubCell(label: String, name: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(text = label, style = britMono(BritTokens.muted, 8.sp, letterSpacing = 1.4.sp))
        Spacer(Modifier.height(3.dp))
        Text(
            text = name,
            style = britBody(BritTokens.ink, 14.sp, weight = 600),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ClubChangeBadge(isRoster: Boolean, accent: Color) {
    val tone = if (isRoster) accent else BritTokens.muted
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(tone.copy(alpha = 0.12f))
            .border(1.dp, tone.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
            .padding(horizontal = 7.dp, vertical = 3.dp),
    ) {
        Text(
            text = if (isRoster) "ROSTER" else "MARKET",
            style = britMono(tone, 8.sp, letterSpacing = 1.2.sp),
        )
    }
}

// ── States ──────────────────────────────────────────────────────────────────

@Composable
private fun ClubChangesLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        com.liordahan.mgsrteam.ui.components.BritLoader(
            title = "CLUB CHANGES",
            subtitle = "TRACKING MOVEMENTS",
        )
    }
}

@Composable
private fun ClubChangesEmpty(accent: Color) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = BritIcons.ClubChanges,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(44.dp),
            )
            Spacer(Modifier.height(18.dp))
            Text(
                text = "NO MOVES YET",
                style = britDisplay(BritTokens.ink, 24.sp, weight = 600, letterSpacing = 0.5.sp, textAlign = TextAlign.Center),
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "When players change clubs, every move lands here — straight from the feed.",
                style = britBody(BritTokens.muted, 14.sp, textAlign = TextAlign.Center),
            )
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

private fun metaLine(item: ClubChangeItem): String {
    val parts = buildList {
        item.displayPosition?.let { add(it) }
        item.displayAge?.let { add("Age $it") }
        item.displayMarketValue?.let { add(it) }
    }
    return if (parts.isEmpty()) "—" else parts.joinToString(" · ")
}

private fun formatTimestamp(timestamp: Long?): String {
    if (timestamp == null || timestamp <= 0L) return "—"
    return SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()).format(Date(timestamp))
}

private fun platformLabel(platform: Platform): String = when (platform) {
    Platform.MEN -> "MEN"
    Platform.YOUTH -> "ACADEMY"
}
