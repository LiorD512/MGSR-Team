package com.liordahan.mgsrteam.features.home.dashboard

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyHorizontalGrid
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.config.FeatureFlags
import com.liordahan.mgsrteam.features.home.HomeDashboardState
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.notificationcenter.NotificationCenterManager
import com.liordahan.mgsrteam.features.notificationcenter.NotificationCenterSheet
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.BritIcons
import com.liordahan.mgsrteam.ui.components.BritLoader
import com.liordahan.mgsrteam.ui.components.BritMoreItem
import com.liordahan.mgsrteam.ui.components.BritMoreSheetContent
import com.liordahan.mgsrteam.ui.components.BritTab
import com.liordahan.mgsrteam.ui.components.BritTabBar
import com.liordahan.mgsrteam.ui.components.BritTopHeader
import com.liordahan.mgsrteam.ui.components.GrayscalePlayerPhoto
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.PaperGrainOverlay
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britMono
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * BRIT hero Dashboard — a Compose rebuild of the mock's SCREENS.dashboard
 * (docs/mobile-prototype/app.js) using the shared BRIT shell (header + bottom
 * tab bar + More sheet) and the .brit-room editorial design system.
 *
 * ALL data comes from the existing [IHomeScreenViewModel] (players / tasks /
 * feed / accounts / birthdays / pending transfers). This file changes
 * PRESENTATION ONLY — it reuses the same ViewModel + [BirthdaysSection] +
 * [NotificationCenterSheet] as the previous dashboard, and reuses the real
 * platform switch / reload wiring.
 *
 * Section order mirrors the mock:
 *   (a) masthead greeting   (b) brit-signals strip   (c) birthdays/deadlines
 *   (d) OUR ASSETS marquee   (e) Pending Decisions black module
 *   (f) Mandate Watch   (g) Recent Activity feed   (h) Quick Actions grid
 *
 * YOUTH retints via [BritTokens.accentFor] (teal) rather than a separate
 * layout, and reuses the Youth collections through the same ViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BritDashboardScreen(
    navController: NavController,
    viewModel: IHomeScreenViewModel = koinViewModel(),
    platformManager: PlatformManager = koinInject(),
    notificationCenterManager: NotificationCenterManager = koinInject(),
    onSignOut: () -> Unit = {},
) {
    val state by viewModel.dashboardState.collectAsStateWithLifecycle()
    val platform by platformManager.current.collectAsStateWithLifecycle()
    val notifState by notificationCenterManager.state.collectAsStateWithLifecycle()

    var showNotificationCenter by remember { mutableStateOf(false) }
    var showMoreSheet by remember { mutableStateOf(false) }
    val moreSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(state.currentUserAccount?.id) {
        state.currentUserAccount?.id?.let { notificationCenterManager.startListening(it) }
    }

    val (accent, _) = BritTokens.accentFor(platform)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BritTokens.paper),
    ) {
        PaperGrainOverlay()

        Column(modifier = Modifier.fillMaxSize()) {

            // ── Shared BRIT top header ───────────────────────────────────
            BritTopHeader(
                platform = platform,
                pageTitle = "Dashboard",
                hasUnreadNotifications = notifState.unreadCount > 0,
                onBellClick = { showNotificationCenter = true },
                onPlatformSwitch = { target ->
                    platformManager.switchTo(target)
                    viewModel.reloadForPlatformSwitch()
                },
            )

            if (state.isLoading) {
                Box(modifier = Modifier.weight(1f)) { BritLoader() }
            } else {
                val assetPlayers = remember(state.feedEvents) { distinctAssetPlayers(state.feedEvents) }
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    // (a) masthead greeting
                    item { MastheadGreeting(state = state, platform = platform) }

                    // (b) signals strip
                    item { SignalsStrip(state = state) }

                    // (c) birthdays / deadlines — reuse the existing section + data
                    item {
                        BirthdaysSection(
                            todayBirthdays = state.todayBirthdays,
                            upcomingBirthdays = state.upcomingBirthdays,
                            senderName = state.currentUserAccount?.name.orEmpty(),
                            platform = platform,
                        )
                    }

                    // (d) OUR ASSETS grayscale focus marquee
                    if (assetPlayers.isNotEmpty()) {
                        item {
                            ModuleHead("OUR ASSETS", "IN FOCUS", accent) {
                                navController.navigate(Screens.playersRoute())
                            }
                        }
                        item {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                items(assetPlayers) { p ->
                                    FocusCard(
                                        name = p.name,
                                        subtitle = p.club,
                                        imageUrl = p.image,
                                        onClick = {
                                            if (p.navId.isNotBlank()) {
                                                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(p.navId)}")
                                            }
                                        },
                                    )
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                        }
                    }

                    // (e) Pending Decisions — #11110f black module
                    if (state.pendingTransfers.isNotEmpty()) {
                        item { PendingDecisionsModule(state = state) }
                    }

                    // (f) Mandate Watch
                    if (state.documentReminders.isNotEmpty()) {
                        item { MandateWatchModule(state = state, accent = accent) }
                    }

                    // (g) Recent Activity feed
                    if (state.feedEvents.isNotEmpty()) {
                        item { ModuleHead("RECENT", "ACTIVITY", accent, onViewAll = null) }
                        items(state.feedEvents.take(8)) { event ->
                            FeedRow(
                                event = event,
                                onClick = {
                                    val tm = event.playerTmProfile
                                    if (!tm.isNullOrBlank()) {
                                        navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(tm)}")
                                    }
                                },
                            )
                        }
                        item { Spacer(Modifier.height(8.dp)) }
                    }

                    // (h) Quick Actions grid
                    item { ModuleHead("QUICK", "ACTIONS", accent, onViewAll = null) }
                    item { QuickActionsGrid(navController = navController, accent = accent) }
                }
            }

            // ── Shared bottom tab bar ────────────────────────────────────
            BritTabBar(
                platform = platform,
                selectedTab = BritTab.DASHBOARD,
                onTabClick = { tab ->
                    when (tab) {
                        BritTab.DASHBOARD -> Unit
                        BritTab.PLAYERS -> navController.navigate(Screens.playersRoute())
                        BritTab.WAR_ROOM -> navController.navigate(Screens.WarRoomScreen.route)
                        BritTab.TASKS -> if (FeatureFlags.TASKS_ENABLED) {
                            navController.navigate(Screens.TasksScreen.route)
                        }
                    }
                },
                onMoreClick = { showMoreSheet = true },
            )
        }
    }

    // ── Notification center ──────────────────────────────────────────────
    if (showNotificationCenter) {
        NotificationCenterSheet(
            state = notifState,
            onDismiss = { showNotificationCenter = false },
            onMarkAllRead = {
                state.currentUserAccount?.id?.let { notificationCenterManager.markAllRead(it) }
            },
            onNotificationClick = { notif ->
                state.currentUserAccount?.id?.let { accountId ->
                    if (!notif.read) notificationCenterManager.markRead(accountId, notif.id)
                }
                showNotificationCenter = false
                val data = notif.data
                when (notif.type) {
                    "TASK_ASSIGNED", "TASK_REMINDER" ->
                        if (FeatureFlags.TASKS_ENABLED) navController.navigate(Screens.TasksScreen.route)
                    "CHAT_ROOM_TAG" -> navController.navigate(Screens.ChatRoomScreen.route)
                    "NOTE_TAGGED" -> (data["playerId"] as? String)?.takeIf { it.isNotBlank() }?.let {
                        navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(it)}")
                    }
                    "REQUEST_ADDED" -> navController.navigate(Screens.RequestsScreen.route)
                    else -> (data["playerTmProfile"] as? String)?.takeIf { it.isNotBlank() }?.let {
                        navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(it)}")
                    }
                }
            },
        )
    }

    // ── "More" bottom sheet (3-col icon grid + drag handle) ────────────────
    if (showMoreSheet) {
        ModalBottomSheet(
            onDismissRequest = { showMoreSheet = false },
            sheetState = moreSheetState,
            containerColor = BritTokens.card,
            dragHandle = null,
        ) {
            BritMoreSheetContent(
                platform = platform,
                userEmail = state.currentUserAccount?.email.orEmpty(),
                onItemClick = { item ->
                    showMoreSheet = false
                    navigateMoreItem(navController, item)
                },
                onSignOut = {
                    showMoreSheet = false
                    onSignOut()
                },
            )
        }
    }
}

// ── Navigation mapping for the More sheet ────────────────────────────────────

private fun navigateMoreItem(navController: NavController, item: BritMoreItem) {
    val route = when (item) {
        BritMoreItem.SHORTLIST -> Screens.ShortlistScreen.route
        BritMoreItem.SHADOW_TEAMS -> Screens.ShadowTeamsScreen.route
        BritMoreItem.RELEASES -> Screens.ReleasesScreen.route
        BritMoreItem.CLUB_CHANGES -> Screens.ClubChangesScreen.route
        BritMoreItem.CONTRACT_FINISHER -> Screens.ContractFinisherScreen.route
        BritMoreItem.RETURNEES -> Screens.ReturneeScreen.route
        BritMoreItem.CONTACTS -> Screens.ContactsScreen.route
        BritMoreItem.REQUESTS -> Screens.RequestsScreen.route
        BritMoreItem.AI_SCOUT -> Screens.AiScoutScreen.route
        BritMoreItem.TUNNEL -> Screens.ChatRoomScreen.route
        BritMoreItem.MARKET_RADAR -> Screens.MarketRadarScreen.route
    }
    navController.navigate(route)
}

// ── Section composables ──────────────────────────────────────────────────────

@Composable
private fun MastheadGreeting(state: HomeDashboardState, platform: Platform) {
    val greet = when (state.greetingRes) {
        R.string.greeting_good_morning -> "GOOD MORNING"
        R.string.greeting_good_afternoon -> "GOOD AFTERNOON"
        else -> "GOOD EVENING"
    }
    val name = (state.currentUserAccount?.name ?: "").trim().uppercase()
    val dateStr = remember {
        SimpleDateFormat("EEEE, d MMMM", Locale.ENGLISH).format(Date()).uppercase()
    }
    val (accent, _) = BritTokens.accentFor(platform)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(top = 18.dp, bottom = 20.dp),
    ) {
        Text(
            text = "THE ${britRoomDesk(platform)} · DESK OPEN",
            style = britMono(accent, 10.sp, letterSpacing = 1.4.sp),
        )
        Spacer(Modifier.height(14.dp))
        Text(text = "$greet,", style = britDisplay(BritTokens.ink, 44.sp, weight = 600, letterSpacing = (-2).sp))
        Text(
            text = if (name.isNotBlank()) "$name." else "WELCOME.",
            style = britDisplay(accent, 44.sp, weight = 600, letterSpacing = (-2).sp),
        )
        Spacer(Modifier.height(14.dp))
        Text(
            text = "$dateStr · ${state.totalPlayers} PLAYERS UNDER REPRESENTATION",
            style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.8.sp),
        )
    }
}

private fun britRoomDesk(platform: Platform): String = when (platform) {
    Platform.MEN -> "MANAGEMENT ROOM"
    Platform.YOUTH -> "ACADEMY DESK"
}

@Composable
private fun SignalsStrip(state: HomeDashboardState) {
    data class Signal(val label: String, val value: Int, val note: String, val red: Boolean)
    val signals = listOf(
        Signal("PLAYERS", state.totalPlayers, "Under representation", false),
        Signal("MANDATES", state.withMandate, "Open briefs", false),
        Signal("EXPIRING", state.expiringSoon, "Needs attention", state.expiringSoon > 0),
        Signal("FREE", state.freeAgents, "Needs placement", state.freeAgents > 0),
        Signal("REQUESTS", state.requestsCount, "Club briefs", false),
    )
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(bottom = 20.dp),
    ) {
        items(signals) { s ->
            Column(
                modifier = Modifier
                    .width(104.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(BritTokens.card)
                    .border(1.dp, BritTokens.line, RoundedCornerShape(10.dp))
                    .padding(12.dp),
            ) {
                Text(text = s.label, style = britMono(BritTokens.muted, 9.sp, letterSpacing = 1.2.sp))
                Spacer(Modifier.height(6.dp))
                Text(
                    text = s.value.toString().padStart(2, '0'),
                    style = britDisplay(if (s.red) BritTokens.red else BritTokens.ink, 32.sp, weight = 600),
                )
                Spacer(Modifier.height(2.dp))
                Text(text = s.note, style = britBody(BritTokens.muted, 10.sp, weight = 500))
            }
        }
    }
}

@Composable
private fun ModuleHead(
    gold: String,
    rest: String,
    accent: androidx.compose.ui.graphics.Color,
    onViewAll: (() -> Unit)?,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(top = 8.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(modifier = Modifier.weight(1f)) {
            Text(text = "$gold ", style = britDisplay(accent, 18.sp, weight = 600, letterSpacing = 0.5.sp))
            Text(text = rest, style = britDisplay(BritTokens.ink, 18.sp, weight = 600, letterSpacing = 0.5.sp))
        }
        if (onViewAll != null) {
            Text(
                text = "VIEW ALL",
                style = britMono(accent, 9.sp, letterSpacing = 1.2.sp),
                modifier = Modifier
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onViewAll() }
                    .padding(6.dp),
            )
        }
    }
}

@Composable
private fun FocusCard(name: String, subtitle: String, imageUrl: String?, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .width(170.dp)
            .height(220.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { onClick() },
    ) {
        GrayscalePlayerPhoto(imageUrl = imageUrl, name = name, modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(12.dp),
            ) {
                if (subtitle.isNotBlank()) {
                    Text(
                        text = subtitle.uppercase(),
                        style = britMono(BritTokens.goldSoft, 8.sp, letterSpacing = 1.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(4.dp))
                }
                Text(
                    text = name,
                    style = britDisplay(BritTokens.paper, 18.sp, weight = 600),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun PendingDecisionsModule(state: HomeDashboardState) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp, bottom = 12.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(BritTokens.black)
            .padding(16.dp),
    ) {
        Row {
            Text(text = "PENDING ", style = britDisplay(BritTokens.goldSoft, 18.sp, weight = 600, letterSpacing = 0.5.sp))
            Text(text = "DECISIONS", style = britDisplay(BritTokens.paper, 18.sp, weight = 600, letterSpacing = 0.5.sp))
        }
        Spacer(Modifier.height(14.dp))
        state.pendingTransfers.take(5).forEach { tr ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = tr.playerName ?: "Transfer request",
                        style = britBody(BritTokens.paper, 14.sp, weight = 600),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "Agent transfer · ${tr.fromAgentName ?: "—"} → ${tr.toAgentName ?: "—"}",
                        style = britMono(BritTokens.muted2, 9.sp, letterSpacing = 0.6.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(BritTokens.gold)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text(text = "REVIEW", style = britMono(BritTokens.black, 9.sp, letterSpacing = 1.sp))
                }
            }
        }
    }
}

@Composable
private fun MandateWatchModule(state: HomeDashboardState, accent: androidx.compose.ui.graphics.Color) {
    ModuleHead("MANDATE", "WATCH", accent, onViewAll = null)
    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        state.documentReminders.take(5).forEach { r ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 10.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(BritTokens.card)
                    .border(1.dp, BritTokens.line, RoundedCornerShape(10.dp))
                    .padding(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = r.playerName,
                        style = britDisplay(BritTokens.ink, 15.sp, weight = 600),
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val days = r.daysUntilExpiry
                    Text(
                        text = if (r.isMissing || days == null) "MISSING"
                        else "CLOSES ${days}D",
                        style = britMono(BritTokens.red, 9.sp, letterSpacing = 1.sp),
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(text = r.documentType, style = britBody(BritTokens.muted, 11.sp, weight = 500))
            }
        }
    }
}

@Composable
private fun FeedRow(event: FeedEvent, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { onClick() }
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(8.dp)),
        ) {
            GrayscalePlayerPhoto(
                imageUrl = event.playerImage,
                name = event.playerName ?: "?",
                modifier = Modifier.fillMaxSize(),
                scrimAlpha = 0.4f,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = feedText(event),
                style = britBody(BritTokens.ink, 13.sp, weight = 500),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = (event.playerName ?: "").uppercase(),
                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.8.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = feedTag(event),
            style = britMono(BritTokens.gold, 8.sp, letterSpacing = 1.sp),
        )
    }
}

private fun feedText(event: FeedEvent): String = when (event.type) {
    FeedEvent.TYPE_MARKET_VALUE_CHANGE -> "Market value changed ${event.oldValue ?: ""} → ${event.newValue ?: ""}".trim()
    FeedEvent.TYPE_CLUB_CHANGE -> "Transferred ${event.oldValue ?: ""} → ${event.newValue ?: ""}".trim()
    FeedEvent.TYPE_CONTRACT_EXPIRING -> "Contract expiring soon"
    FeedEvent.TYPE_NOTE_ADDED -> "New note added by ${event.extraInfo ?: event.agentName ?: "an agent"}"
    FeedEvent.TYPE_PLAYER_ADDED -> "Added to the roster"
    FeedEvent.TYPE_BECAME_FREE_AGENT -> "Became a free agent"
    FeedEvent.TYPE_MANDATE_UPLOADED -> "Mandate document uploaded"
    FeedEvent.TYPE_MANDATE_EXPIRED -> "Mandate expired"
    else -> event.newValue ?: event.type?.replace('_', ' ')?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "Activity"
}

private fun feedTag(event: FeedEvent): String = when (event.type) {
    FeedEvent.TYPE_MARKET_VALUE_CHANGE -> "VALUE"
    FeedEvent.TYPE_CLUB_CHANGE -> "TRANSFER"
    FeedEvent.TYPE_CONTRACT_EXPIRING -> "CONTRACT"
    FeedEvent.TYPE_NOTE_ADDED, FeedEvent.TYPE_NOTE_DELETED -> "NOTE"
    FeedEvent.TYPE_PLAYER_ADDED -> "ROSTER"
    FeedEvent.TYPE_BECAME_FREE_AGENT -> "FREE"
    FeedEvent.TYPE_MANDATE_UPLOADED, FeedEvent.TYPE_MANDATE_EXPIRED -> "MANDATE"
    else -> "FEED"
}

// ── Quick actions grid ───────────────────────────────────────────────────────

private data class QuickAction(val label: String, val sub: String, val icon: ImageVector, val route: String)

@Composable
private fun QuickActionsGrid(navController: NavController, accent: androidx.compose.ui.graphics.Color) {
    val actions = listOf(
        QuickAction("Our Roster", "under rep.", BritIcons.Roster, Screens.playersRoute()),
        QuickAction("Shortlist", "boards", BritIcons.Shortlist, Screens.ShortlistScreen.route),
        QuickAction("Releases", "free agents", BritIcons.Releases, Screens.ReleasesScreen.route),
        QuickAction("Returnees", "on loan", BritIcons.Returnees, Screens.ReturneeScreen.route),
        QuickAction("War Room", "alpha board", BritIcons.WarRoom, Screens.WarRoomScreen.route),
        QuickAction("AI Scout", "agents live", BritIcons.AiScout, Screens.AiScoutScreen.route),
        QuickAction("Contacts", "network", BritIcons.Contacts, Screens.ContactsScreen.route),
        QuickAction("Requests", "inbox", BritIcons.Requests, Screens.RequestsScreen.route),
        QuickAction("Contract Finisher", "expiring", BritIcons.ContractFinisher, Screens.ContractFinisherScreen.route),
        QuickAction("Tasks", "today", BritIcons.Tasks, Screens.TasksScreen.route),
        QuickAction("The Tunnel", "team chat", BritIcons.Tunnel, Screens.ChatRoomScreen.route),
        QuickAction("Market Radar", "live moves", BritIcons.MarketRadar, Screens.MarketRadarScreen.route),
    )
    // 2 rows x 6, scrolled horizontally — matches the mock's dense quick grid.
    LazyHorizontalGrid(
        rows = GridCells.Fixed(2),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp),
    ) {
        items(actions) { a ->
            Column(
                modifier = Modifier
                    .width(130.dp)
                    .height(100.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(BritTokens.card)
                    .border(1.dp, BritTokens.line, RoundedCornerShape(10.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) {
                        if (a.route == Screens.TasksScreen.route && !FeatureFlags.TASKS_ENABLED) return@clickable
                        navController.navigate(a.route)
                    }
                    .padding(12.dp),
            ) {
                Icon(imageVector = a.icon, contentDescription = a.label, tint = accent, modifier = Modifier.size(20.dp))
                Spacer(Modifier.weight(1f))
                Text(
                    text = a.label,
                    style = britDisplay(BritTokens.ink, 14.sp, weight = 600),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = a.sub, style = britMono(BritTokens.muted, 8.sp, letterSpacing = 0.6.sp))
            }
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

private data class AssetPlayer(val name: String, val club: String, val image: String?, val navId: String)

/** Distinct players surfaced in the feed, used for the OUR ASSETS marquee. */
private fun distinctAssetPlayers(feed: List<FeedEvent>): List<AssetPlayer> =
    feed.filter { !it.playerName.isNullOrBlank() }
        .distinctBy { it.playerName }
        .take(8)
        .map {
            AssetPlayer(
                name = it.playerName ?: "",
                club = it.newValue?.takeIf { v -> it.type == FeedEvent.TYPE_CLUB_CHANGE } ?: "",
                image = it.playerImage,
                navId = it.playerTmProfile ?: "",
            )
        }
