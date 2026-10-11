package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.liordahan.mgsrteam.R
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.config.FeatureFlags
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono

/**
 * Shared editorial "BRIT" chrome — a Compose port of the mock's `buildShell`
 * (docs/mobile-prototype/app.js) + the `.app-header` / `.tabbar` / `.more-sheet`
 * styling (styles.css). These are REUSABLE across every hero + breadth screen
 * (FEAT-004 hero surfaces + FEAT-005 breadth screens) so the whole app shares
 * one chrome.
 *
 * The components here are intentionally stateless/hoisted: callers pass the
 * current platform + page title + the navigation callbacks. Nothing here owns
 * data or performs navigation itself.
 */

// ── Tab bar model ──────────────────────────────────────────────────────────

/** A primary bottom-tab (Dashboard / Players / War Room / Tasks). */
enum class BritTab(val label: String, val icon: ImageVector) {
    DASHBOARD("Dashboard", BritIcons.Dashboard),
    PLAYERS("Players", BritIcons.Players),
    WAR_ROOM("War Room", BritIcons.WarRoom),
    TASKS("Tasks", BritIcons.Tasks),
}

/** A "More" bottom-sheet entry — mirrors app.js MORE_ITEMS. */
enum class BritMoreItem(val label: String, val icon: ImageVector) {
    SHORTLIST("Shortlist", BritIcons.Shortlist),
    SHADOW_TEAMS("Shadow Teams", BritIcons.WarRoom),
    RELEASES("Releases", BritIcons.Releases),
    CLUB_CHANGES("Club Changes", BritIcons.ClubChanges),
    CONTRACT_FINISHER("Contract Finisher", BritIcons.ContractFinisher),
    RETURNEES("Returnees", BritIcons.Returnees),
    CONTACTS("Contacts", BritIcons.Contacts),
    REQUESTS("Requests", BritIcons.Requests),
    AI_SCOUT("AI Scout", BritIcons.AiScout),
    TUNNEL("The Tunnel", BritIcons.Tunnel),
    MARKET_RADAR("Market Radar", BritIcons.MarketRadar),
}

/** Workspace label per platform — mirrors app.js DESK (Women dropped). */
fun britDeskLabel(platform: Platform): String = when (platform) {
    Platform.MEN -> "MANAGEMENT ROOM"
    Platform.YOUTH -> "ACADEMY DESK"
}

/** Short platform kicker — mirrors app.js PLATFORM_LABEL (Women dropped). */
fun britPlatformLabel(platform: Platform): String = when (platform) {
    Platform.MEN -> "MEN"
    Platform.YOUTH -> "ACADEMY"
}

// ── Top header ───────────────────────────────────────────────────────────────

/**
 * Editorial top header: optional back chevron, BRIT circle mark, workspace
 * kicker + desk label, notification bell (with unread dot), and the 2-way
 * platform switch. Matches `.app-header` in the mock.
 */
@Composable
fun BritTopHeader(
    platform: Platform,
    pageTitle: String,
    hasUnreadNotifications: Boolean,
    onBellClick: () -> Unit,
    onPlatformSwitch: (Platform) -> Unit,
    modifier: Modifier = Modifier,
    showBack: Boolean = false,
    onBackClick: () -> Unit = {},
    onMenuClick: (() -> Unit)? = null,
    showBell: Boolean = true,
) {
    val (accent, _) = BritTokens.accentFor(platform)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(BritTokens.paper)
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showBack) {
            Icon(
                imageVector = BritIcons.Back,
                contentDescription = "Back",
                tint = BritTokens.ink,
                modifier = Modifier
                    .size(24.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onBackClick() },
            )
            Spacer(Modifier.width(12.dp))
        }

        BritMark(accent = accent, modifier = Modifier.size(40.dp))

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "BRIT · ${britPlatformLabel(platform)}",
                style = britMono(accent, 9.sp, letterSpacing = 1.6.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = if (pageTitle.isNotBlank()) pageTitle.uppercase() else britDeskLabel(platform),
                style = britDisplay(BritTokens.ink, 15.sp, weight = 600, letterSpacing = 0.5.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Spacer(Modifier.width(8.dp))

        if (onMenuClick != null) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onMenuClick() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = BritIcons.More,
                    contentDescription = "Menu",
                    tint = BritTokens.ink,
                    modifier = Modifier.size(22.dp),
                )
            }
        }

        if (showBell) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onBellClick() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = BritIcons.Bell,
                    contentDescription = "Notifications",
                    tint = BritTokens.ink,
                    modifier = Modifier.size(22.dp),
                )
                if (hasUnreadNotifications) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(BritTokens.red)
                    )
                }
            }
        }

        Spacer(Modifier.width(8.dp))

        BritPlatformSwitch(platform = platform, onSwitch = onPlatformSwitch)
    }
}

/** BRIT Sport Group circle logo — the real black+gold crest (same asset the
 *  web uses, /brit_circle_black_gold.svg). [accent] is kept for call-site
 *  compatibility but the vector carries its own colours. */
@Composable
fun BritMark(accent: Color, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.brit_circle_black_gold),
        contentDescription = "BRIT Sport Group",
        contentScale = ContentScale.Fit,
        modifier = modifier.clip(CircleShape),
    )
}

// ── 2-way platform switch (editorial) ────────────────────────────────────────

/**
 * Editorial 2-segment platform switch (Men / Youth) matching the mock's
 * `.plat-switch`. The mock renders a 3-way M/A/W control, but the delivered
 * Android is Men + Youth only (Women was removed in FEAT-002), so this is a
 * strict 2-segment control with a sliding gold (teal for Youth) thumb.
 */
@Composable
fun BritPlatformSwitch(
    platform: Platform,
    onSwitch: (Platform) -> Unit,
    modifier: Modifier = Modifier,
) {
    val platforms = Platform.entries
    val density = LocalDensity.current
    val segmentWidth = 78.dp
    val height = 30.dp
    val selectedIndex = platforms.indexOf(platform)
    val (accent, _) = BritTokens.accentFor(platform)

    val thumbOffset: Dp by animateDpAsState(
        targetValue = segmentWidth * selectedIndex,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "brit_plat_thumb",
    )

    // Web .brit-platform-switch: rounded dark pill, sliding gold/teal thumb,
    // each option = a dot + uppercase label; active text goes ink.
    Box(
        modifier = modifier
            .width(segmentWidth * platforms.size)
            .height(height)
            .clip(RoundedCornerShape(999.dp))
            .background(BritTokens.black.copy(alpha = 0.6f))
            .border(1.dp, BritTokens.line, RoundedCornerShape(999.dp))
            .padding(3.dp),
    ) {
        // Sliding thumb (half the pill).
        Box(
            modifier = Modifier
                .offset { IntOffset(with(density) { thumbOffset.roundToPx() }, 0) }
                .width(segmentWidth - 6.dp)
                .fillMaxHeight()
                .clip(RoundedCornerShape(999.dp))
                .background(accent)
        )
        Row(modifier = Modifier.fillMaxSize()) {
            platforms.forEach { p ->
                val isSelected = p == platform
                val label = when (p) {
                    Platform.MEN -> "MEN"
                    Platform.YOUTH -> "ACADEMY"
                }
                val content = if (isSelected) BritTokens.ink else BritTokens.muted2
                Row(
                    modifier = Modifier
                        .width(segmentWidth)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(999.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { if (!isSelected) onSwitch(p) },
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(content.copy(alpha = if (isSelected) 1f else 0.5f)),
                    )
                    Spacer(Modifier.width(7.dp))
                    Text(
                        text = label,
                        style = britDisplay(content, 11.sp, weight = 600, letterSpacing = 0.7.sp),
                    )
                }
            }
        }
    }
}

// ── Bottom tab bar ───────────────────────────────────────────────────────────

/** Bottom tab bar (Dashboard / Players / War Room / Tasks + More). */
@Composable
fun BritTabBar(
    platform: Platform,
    selectedTab: BritTab?,
    onTabClick: (BritTab) -> Unit,
    onMoreClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (accent, _) = BritTokens.accentFor(platform)
    Column(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(BritTokens.line)
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(BritTokens.card)
                .navigationBarsPadding()
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // The Tasks tab is gated behind FeatureFlags.TASKS_ENABLED. While the
            // flag is off, hide the tab entirely so we never render an inert
            // control that silently does nothing on tap. When the flag is on,
            // the full set of primary tabs (incl. Tasks) is shown and routes
            // normally.
            val tabs = BritTab.entries.filter {
                it != BritTab.TASKS || FeatureFlags.TASKS_ENABLED
            }
            tabs.forEach { tab ->
                BritTabCell(
                    label = tab.label,
                    icon = tab.icon,
                    selected = tab == selectedTab,
                    accent = accent,
                    onClick = { onTabClick(tab) },
                )
            }
            BritTabCell(
                label = "More",
                icon = BritIcons.More,
                selected = false,
                accent = accent,
                onClick = onMoreClick,
            )
        }
    }
}

@Composable
private fun BritTabCell(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    accent: Color,
    onClick: () -> Unit,
) {
    val tint = if (selected) accent else BritTokens.muted
    Column(
        modifier = Modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { onClick() }
            .padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(imageVector = icon, contentDescription = label, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            style = britMono(tint, 9.sp, letterSpacing = 0.5.sp, textAlign = TextAlign.Center),
            maxLines = 1,
        )
    }
}

// ── "More" bottom sheet content (3-col icon grid + drag handle) ──────────────

/**
 * Content of the "More" bottom sheet: a drag handle, a header, and a 3-column
 * icon grid of [BritMoreItem]s, plus a sign-out footer. Host this inside the
 * caller's bottom-sheet container (e.g. `ModalBottomSheet`). Matches the mock's
 * `.more-sheet` / `.more-grid`.
 */
@Composable
fun BritMoreSheetContent(
    platform: Platform,
    userEmail: String,
    onItemClick: (BritMoreItem) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val (accent, _) = BritTokens.accentFor(platform)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(BritTokens.card)
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Drag handle.
        Box(
            modifier = Modifier
                .padding(top = 10.dp, bottom = 12.dp)
                .width(40.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(BritTokens.line)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                text = "MORE",
                style = britDisplay(BritTokens.ink, 22.sp, weight = 600, letterSpacing = 0.5.sp),
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = britDeskLabel(platform),
                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 1.4.sp),
            )
        }

        Spacer(Modifier.height(16.dp))

        // 3-column grid rendered as chunked rows (avoids nesting a lazy grid
        // inside a Column, which has no bounded height here).
        BritMoreItem.entries.chunked(3).forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                rowItems.forEach { item ->
                    Box(modifier = Modifier.weight(1f)) {
                        BritMoreCell(item = item, accent = accent, onClick = { onItemClick(item) })
                    }
                }
                // Pad the final short row so cells keep a consistent width.
                repeat(3 - rowItems.size) { Spacer(Modifier.weight(1f)) }
            }
            Spacer(Modifier.height(10.dp))
        }

        Spacer(Modifier.height(6.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(BritTokens.line)
        )
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = userEmail,
                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.6.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "SIGN OUT",
                style = britMono(BritTokens.red, 10.sp, letterSpacing = 1.sp),
                modifier = Modifier
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onSignOut() }
                    .padding(8.dp),
            )
        }
    }
}

@Composable
private fun BritMoreCell(
    item: BritMoreItem,
    accent: Color,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(BritTokens.paper)
            .border(1.dp, BritTokens.line, RoundedCornerShape(10.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { onClick() }
            .padding(vertical = 16.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = item.icon,
            contentDescription = item.label,
            tint = accent,
            modifier = Modifier.size(24.dp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = item.label,
            style = britMono(BritTokens.ink, 9.sp, letterSpacing = 0.5.sp, textAlign = TextAlign.Center),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
