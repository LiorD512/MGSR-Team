package com.liordahan.mgsrteam.features.home.dashboard

import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.BookmarkRemove
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ContactPhone
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.DocumentReminder
import com.liordahan.mgsrteam.features.home.FeedFilter
import com.liordahan.mgsrteam.features.home.HomeDashboardState
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.features.home.models.AgentAlert
import com.liordahan.mgsrteam.features.home.models.AgentSummary
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.home.models.AlertSeverity
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.home.models.MyAgentOverview
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.widget.WidgetUpdateHelper
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.Confederation
import com.liordahan.mgsrteam.transfermarket.TransferWindow
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeAmberAccent
import com.liordahan.mgsrteam.ui.theme.HomeRoseAccent
import com.liordahan.mgsrteam.ui.theme.WarRoomAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeYellowAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.WomenColors
import com.liordahan.mgsrteam.ui.theme.YouthColors
import com.liordahan.mgsrteam.ui.components.SkeletonDashboardLayout
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.utils.datePickerMillisToLocalMidnight
import com.liordahan.mgsrteam.utils.daysBetweenCalendarDays
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.features.platform.PlatformSwitcher
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

// ═════════════════════════════════════════════════════════════════════════════
//  DASHBOARD SCREEN
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun DashboardScreen(
    navController: NavController,
    viewModel: IHomeScreenViewModel = koinViewModel(),
    platformManager: PlatformManager = koinInject()
) {
    val state by viewModel.dashboardState.collectAsStateWithLifecycle()
    val currentPlatform by platformManager.current.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val isHebrew = LocaleManager.isHebrew(context)
    var showLanguageDialog by remember { mutableStateOf(false) }
    var showAddTaskSheet by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.refreshTransferWindows()
    }

    val isWomenPlatform = currentPlatform == Platform.WOMEN
    val isYouthPlatform = currentPlatform == Platform.YOUTH
    val dashboardBg by animateColorAsState(
        targetValue = when {
            isWomenPlatform -> WomenColors.Background
            isYouthPlatform -> YouthColors.Background
            else -> HomeDarkBackground
        },
        animationSpec = tween(durationMillis = 450, easing = FastOutSlowInEasing),
        label = "dashboard_bg"
    )
    val dividerAccent1 by animateColorAsState(
        targetValue = currentPlatform.accent,
        animationSpec = tween(400, easing = FastOutSlowInEasing),
        label = "divider_c1"
    )
    val dividerAccent2 by animateColorAsState(
        targetValue = currentPlatform.accentSecondary,
        animationSpec = tween(400, easing = FastOutSlowInEasing),
        label = "divider_c2"
    )

    // ── Platform switch glow sweep ─────────────────────────────────
    val sweepProgress = remember { Animatable(0f) }
    var prevPlatformOrdinal by remember { mutableStateOf(currentPlatform.ordinal) }
    var platformSwitchInit by remember { mutableStateOf(false) }
    LaunchedEffect(currentPlatform) {
        if (!platformSwitchInit) {
            platformSwitchInit = true
            prevPlatformOrdinal = currentPlatform.ordinal
            return@LaunchedEffect
        }
        prevPlatformOrdinal = currentPlatform.ordinal
        sweepProgress.snapTo(0f)
        sweepProgress.animateTo(1f, tween(600, easing = FastOutSlowInEasing))
    }
    val sweepAccentColor = currentPlatform.accent

    if (state.isLoading) {
        SkeletonDashboardLayout(
            modifier = Modifier
                .fillMaxSize()
                .background(dashboardBg)
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(dashboardBg)
            .drawWithContent {
                drawContent()
                val progress = sweepProgress.value
                if (progress > 0.001f && progress < 0.999f) {
                    // Layer 1: Full-screen color wash (peaks at 22% alpha)
                    val washAlpha = if (progress < 0.3f) {
                        (progress / 0.3f) * 0.22f
                    } else {
                        ((1f - progress) / 0.7f) * 0.22f
                    }
                    drawRect(color = sweepAccentColor.copy(alpha = washAlpha))

                    // Layer 2: Bright accent sweep line
                    val sweepY = size.height * progress
                    val bandHeight = size.height * 0.12f
                    val topEdge = sweepY - bandHeight / 2f
                    drawRect(
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                sweepAccentColor.copy(alpha = 0.40f),
                                sweepAccentColor.copy(alpha = 0.65f),
                                sweepAccentColor.copy(alpha = 0.40f),
                                Color.Transparent
                            ),
                            startY = topEdge,
                            endY = topEdge + bandHeight
                        )
                    )
                }
            }
    ) {
        // ── Sticky top section (does NOT scroll) ─────────────────────────
        GreetingHeader(
            state = state,
            isHebrew = isHebrew,
            onLanguageClick = { showLanguageDialog = true }
        )

        // ── Platform tagline (animated) ──────────────────────────────────
        AnimatedContent(
            targetState = currentPlatform,
            transitionSpec = {
                val forward = targetState.ordinal > initialState.ordinal
                val enter = fadeIn(tween(350)) +
                    slideInHorizontally(tween(400, easing = FastOutSlowInEasing)) { if (forward) it / 3 else -it / 3 } +
                    scaleIn(tween(400, easing = FastOutSlowInEasing), initialScale = 0.90f)
                val exit = fadeOut(tween(250)) +
                    slideOutHorizontally(tween(300, easing = FastOutSlowInEasing)) { if (forward) -it / 3 else it / 3 } +
                    scaleOut(tween(300, easing = FastOutSlowInEasing), targetScale = 0.90f)
                enter.togetherWith(exit)
            },
            label = "tagline"
        ) { platform ->
            when (platform) {
                Platform.WOMEN -> Column {
                    WomenGreetingTagline()
                    Spacer(Modifier.height(4.dp))
                }
                Platform.YOUTH -> Column {
                    YouthGreetingTagline()
                    Spacer(Modifier.height(4.dp))
                }
                else -> Column {
                    Text(
                        text = stringResource(R.string.men_dashboard_greeting_tagline),
                        style = boldTextStyle(HomeTealAccent.copy(alpha = 0.7f), 13.sp),
                        letterSpacing = 0.8.sp,
                        modifier = Modifier.padding(horizontal = 20.dp)
                    )
                    Spacer(Modifier.height(4.dp))
                }
            }
        }

        // ── Platform switcher (Men / Women / Youth) ─────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            PlatformSwitcher(
                platformManager = platformManager,
                onSwitch = { platform ->
                    platformManager.switchTo(platform)
                    viewModel.reloadForPlatformSwitch()
                }
            )
        }

        // ── Animated platform accent divider ─────────────────────────────
        Spacer(Modifier.height(2.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth(0.45f)
                .height(2.dp)
                .align(Alignment.CenterHorizontally)
                .background(
                    brush = Brush.horizontalGradient(
                        listOf(
                            Color.Transparent,
                            dividerAccent1.copy(alpha = 0.7f),
                            dividerAccent2.copy(alpha = 0.7f),
                            Color.Transparent,
                        )
                    ),
                    shape = RoundedCornerShape(1.dp)
                )
        )
        Spacer(Modifier.height(6.dp))

        // ── All content below switcher (one cohesive animated transition) ──
        AnimatedContent(
            targetState = currentPlatform,
            transitionSpec = {
                val forward = targetState.ordinal > initialState.ordinal
                val enter = fadeIn(tween(400, easing = FastOutSlowInEasing)) +
                    slideInHorizontally(tween(500, easing = FastOutSlowInEasing)) { if (forward) it / 3 else -it / 3 } +
                    scaleIn(
                        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
                        initialScale = 0.88f
                    )
                val exit = fadeOut(tween(300, easing = FastOutSlowInEasing)) +
                    slideOutHorizontally(tween(400, easing = FastOutSlowInEasing)) { if (forward) -it / 3 else it / 3 } +
                    scaleOut(tween(350, easing = FastOutSlowInEasing), targetScale = 0.88f)
                enter.togetherWith(exit)
            },
            modifier = Modifier.weight(1f),
            label = "platform_content"
        ) { platform ->
            val isWomen = platform == Platform.WOMEN
            val isYouth = platform == Platform.YOUTH

            val filteredEvents = remember(state.feedEvents, state.selectedFeedFilter, isYouth) {
                val base = if (isYouth) {
                    state.feedEvents.filter { event ->
                        event.type != FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB &&
                        event.type != FeedEvent.TYPE_BECAME_FREE_AGENT &&
                        event.type != FeedEvent.TYPE_MANDATE_EXPIRED &&
                        event.type != FeedEvent.TYPE_MANDATE_UPLOADED &&
                        event.type != FeedEvent.TYPE_MANDATE_SWITCHED_ON &&
                        event.type != FeedEvent.TYPE_MANDATE_SWITCHED_OFF &&
                        event.type != FeedEvent.TYPE_MARKET_VALUE_CHANGE &&
                        event.type != FeedEvent.TYPE_CONTRACT_EXPIRING
                    }
                } else state.feedEvents
                base.filterByType(state.selectedFeedFilter)
            }

            val platformLazyState = rememberLazyListState()
            LaunchedEffect(state.myAgentOverview) {
                state.myAgentOverview?.let { overview ->
                    WidgetUpdateHelper.syncToWidget(context, overview)
                }
            }

            Column(modifier = Modifier.fillMaxSize()) {
                // ── Stats & Quick Actions ─────────────────────────────────
                when (platform) {
                    Platform.WOMEN -> {
                        WomenStatsRow(state)
                        WomenQuickActionsRow(navController = navController)
                    }
                    Platform.YOUTH -> {
                        YouthStatsRow(state)
                        YouthQuickActionsRow(navController = navController)
                    }
                    else -> {
                        StatsRow(state, platform)
                        QuickActionsRow(navController = navController, platform = platform)
                    }
                }

                // ── Scrollable section ────────────────────────────────────
                LazyColumn(
                    state = platformLazyState,
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentPadding = PaddingValues(bottom = 64.dp)
                ) {
                    // ── My Agent Hub ───────────────────────────────────
                    item {
                        val overview = state.myAgentOverview
                        when (platform) {
                            Platform.WOMEN -> when {
                                overview != null && overview.totalPlayers > 0 -> {
                                    WomenAgentHubSection(
                                        overview = overview,
                                        navController = navController,
                                        onTaskToggle = { viewModel.toggleTaskCompleted(it) }
                                    )
                                }
                                overview != null -> WomenAgentEmptyState()
                                else -> MyBoardLoadingPlaceholder()
                            }
                            Platform.YOUTH -> when {
                                overview != null && overview.totalPlayers > 0 -> {
                                    YouthAgentHubSection(
                                        overview = overview,
                                        navController = navController,
                                        onTaskToggle = { viewModel.toggleTaskCompleted(it) }
                                    )
                                }
                                overview != null -> YouthAgentEmptyState()
                                else -> MyBoardLoadingPlaceholder()
                            }
                            else -> when {
                                overview != null && overview.totalPlayers > 0 -> {
                                    MyAgentHubSection(
                                        overview = overview,
                                        navController = navController,
                                        onTaskToggle = { viewModel.toggleTaskCompleted(it) }
                                    )
                                }
                                overview != null -> MyAgentEmptyState()
                                else -> MyBoardLoadingPlaceholder()
                            }
                        }
                    }

                    // ── Activity Feed ─────────────────────────────────────
                    item {
                        when (platform) {
                            Platform.WOMEN -> WomenFeedSectionHeader(
                                selectedFilter = state.selectedFeedFilter,
                                onFilterSelected = { viewModel.selectFeedFilter(it) }
                            )
                            Platform.YOUTH -> YouthFeedSectionHeader(
                                selectedFilter = state.selectedFeedFilter,
                                onFilterSelected = { viewModel.selectFeedFilter(it) }
                            )
                            else -> FeedSectionHeader(
                                selectedFilter = state.selectedFeedFilter,
                                onFilterSelected = { viewModel.selectFeedFilter(it) }
                            )
                        }
                    }

                    if (filteredEvents.isEmpty()) {
                        item {
                            Text(
                                text = stringResource(
                                    when (platform) {
                                        Platform.WOMEN -> R.string.women_feed_empty
                                        Platform.YOUTH -> R.string.youth_feed_empty
                                        else -> R.string.feed_empty
                                    }
                                ),
                                style = regularTextStyle(
                                    when (platform) {
                                        Platform.WOMEN -> WomenColors.TextSecondary
                                        Platform.YOUTH -> YouthColors.TextSecondary
                                        else -> HomeTextSecondary
                                    },
                            13.sp,
                            textAlign = TextAlign.Center
                        ),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 32.dp, horizontal = 16.dp)
                            )
                        }
                    } else {
                        items(
                            filteredEvents.take(if (state.isFeedExpanded) filteredEvents.size else 15),
                            key = { it.id ?: it.hashCode() }
                        ) { event ->
                            FeedEventCard(
                                event = event,
                                navController = navController,
                                allAccounts = state.allAccounts,
                                isWomenPlatform = isWomen,
                                isYouthPlatform = isYouth,
                        onNavigateToPlayer = { tmProfile, autoRefresh ->
                            viewModel.checkPlayerExists(tmProfile) { exists ->
                                if (exists) {
                                    val route = "${Screens.PlayerInfoScreen.route}/${android.net.Uri.encode(tmProfile)}" +
                                        if (autoRefresh) "?autoRefresh=true" else ""
                                    navController.navigate(route)
                                } else {
                                    ToastManager.showError(
                                        context.getString(
                                            when (platform) {
                                                Platform.WOMEN -> R.string.feed_women_player_deleted_error
                                                Platform.YOUTH -> R.string.feed_youth_player_deleted_error
                                                else -> R.string.feed_player_deleted_error
                                            }
                                        )
                                    )
                                }
                            }
                        },
                        onNavigateToPlayerByName = { playerName ->
                            viewModel.findPlayerDocIdByName(playerName) { docId ->
                                if (docId != null) {
                                    val route = "${Screens.PlayerInfoScreen.route}/${android.net.Uri.encode(docId)}"
                                    navController.navigate(route)
                                } else {
                                    ToastManager.showError(
                                        context.getString(
                                            when (platform) {
                                                Platform.WOMEN -> R.string.feed_women_player_deleted_error
                                                Platform.YOUTH -> R.string.feed_youth_player_deleted_error
                                                else -> R.string.feed_player_deleted_error
                                            }
                                        )
                                    )
                                }
                            }
                        }
                    )
                }
                        if (filteredEvents.size > 15) {
                            item(key = "feed_show_more_less") {
                                FeedShowMoreLessButton(
                                    isExpanded = state.isFeedExpanded,
                                    onToggle = { viewModel.toggleFeedExpanded() }
                                )
                            }
                        }
                    }

                    // ── Team Overview (collapsible) ───────────────────────────
                    if (state.agentSummaries.isNotEmpty()) {
                        item {
                            TeamOverviewSection(
                                agents = state.agentSummaries,
                                allAccounts = state.allAccounts,
                                isExpanded = state.isTeamOverviewExpanded,
                                onToggle = { viewModel.toggleTeamOverview() }
                            )
                        }
                    }

                    // ── Agent Tasks Summary Widget ──────────────────────────────
                    item {
                        TasksSummaryWidget(
                            agentTasks = state.agentTasks,
                            accounts = state.allAccounts,
                            navController = navController,
                            onViewAllClick = { navController.navigate(Screens.TasksScreen.route) },
                            onAddTaskClick = { showAddTaskSheet = true },
                            onTaskClick = { task ->
                                navController.navigate(Screens.taskDetailRoute(task.id))
                            },
                            onToggleTask = { viewModel.toggleTaskCompleted(it) }
                        )
                    }

                    // ── Transfer Windows — hidden for women & youth ──────────────
                    if (!isWomen && !isYouth) {
                        item {
                            TransferWindowsSectionHeader(totalCount = state.transferWindows.size)
                        }
                        when {
                            state.transferWindowsLoading -> {
                                item {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 24.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(28.dp),
                                            color = HomeTealAccent,
                                            strokeWidth = 2.dp
                                        )
                                    }
                                }
                            }
                            state.transferWindowGroups.isEmpty() -> {
                                item {
                                    Text(
                                        text = stringResource(R.string.transfer_windows_empty),
                                        style = regularTextStyle(HomeTextSecondary, 13.sp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 20.dp, vertical = 16.dp)
                                    )
                                }
                            }
                            else -> {
                                state.transferWindowGroups.forEach { (confederation, windows) ->
                                    val isExpanded = confederation in state.expandedConfederations
                                    item(key = "tw_header_${confederation.name}") {
                                        TransferWindowGroupHeader(
                                            confederation = confederation,
                                            count = windows.size,
                                            isExpanded = isExpanded,
                                            closingSoonCount = windows.count { (it.daysLeft ?: Int.MAX_VALUE) <= 7 },
                                            onToggle = { viewModel.toggleTransferWindowGroup(confederation) }
                                        )
                                    }
                                    if (isExpanded) {
                                        items(
                                            items = windows,
                                            key = { "tw_${confederation.name}_${it.countryName}" }
                                        ) { window ->
                                            TransferWindowRow(
                                                window = window,
                                                modifier = Modifier.padding(horizontal = 20.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // ── Document Reminders ───────────────────────────────────────
                    if (state.documentReminders.isNotEmpty()) {
                        item { DocumentRemindersSection(state.documentReminders) }
                    }
                } // LazyColumn
            } // Column(fillMaxSize)
        } // AnimatedContent
    } // outer Column

    // ── Language change dialog ───────────────────────────────────────────
    if (showLanguageDialog) {
        val targetLanguageName = if (isHebrew) {
            stringResource(R.string.language_english)
        } else {
            stringResource(R.string.language_hebrew)
        }

        LanguageChangeDialog(
            targetLanguageName = targetLanguageName,
            isHebrew = isHebrew,
            onConfirm = {
                val newLang = if (isHebrew) LocaleManager.LANG_ENGLISH else LocaleManager.LANG_HEBREW
                LocaleManager.saveLanguage(context, newLang)
                LocaleManager.applyLocale(context)
            },
            onDismiss = { showLanguageDialog = false }
        )
    }

    if (showAddTaskSheet) {
        com.liordahan.mgsrteam.features.home.tasks.AddTaskBottomSheet(
            accounts = state.allAccounts,
            onDismiss = { showAddTaskSheet = false },
            onConfirm = { agentId, agentName, title, dueDate, priority, notes ->
                viewModel.addTask(agentId, agentName, title, dueDate, priority, notes)
                showAddTaskSheet = false
            }
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LANGUAGE CHANGE DIALOG
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun LanguageChangeDialog(
    targetLanguageName: String,
    isHebrew: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Flag icon
                Image(
                    painter = painterResource(
                        if (isHebrew) R.drawable.use_flag else R.drawable.israel_flag
                    ),
                    contentDescription = null,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                )

                Spacer(Modifier.height(16.dp))

                Text(
                    text = stringResource(R.string.language_change_title),
                    style = boldTextStyle(HomeTextPrimary, 18.sp)
                )

                Spacer(Modifier.height(12.dp))

                Text(
                    text = stringResource(R.string.language_change_message, targetLanguageName),
                    style = regularTextStyle(HomeTextSecondary, 14.sp, textAlign = TextAlign.Center)
                )

                Spacer(Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(
                            stringResource(R.string.cancel),
                            style = boldTextStyle(HomeTextSecondary, 14.sp)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeTealAccent)
                            .clickWithNoRipple { onConfirm() }
                            .padding(horizontal = 24.dp, vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            stringResource(R.string.language_confirm),
                            style = boldTextStyle(HomeDarkBackground, 14.sp)
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  GREETING
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun GreetingHeader(
    state: HomeDashboardState,
    isHebrew: Boolean,
    onLanguageClick: () -> Unit
) {
    val context = LocalContext.current
    val userName = state.currentUserAccount?.getDisplayName(context)?.takeIf { it.isNotBlank() }
        ?: stringResource(R.string.greeting_agent_default)
    val dateStr = SimpleDateFormat("EEEE, MMM d, yyyy", Locale.getDefault()).format(Date())

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${stringResource(state.greetingRes)},",
                    style = regularTextStyle(HomeTextSecondary, 16.sp)
                )
                Text(
                    text = userName,
                    style = boldTextStyle(HomeTextPrimary, 26.sp)
                )
            }
            // ── Language flag button ─────────────────────────────────

            Image(
                painter = painterResource(
                    if (isHebrew) R.drawable.use_flag else R.drawable.israel_flag
                ),
                contentDescription = stringResource(R.string.language_switch_cd),
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .clickWithNoRipple { onLanguageClick() },
                contentScale = ContentScale.Fit
            )
        }

        Text(
            text = dateStr,
            style = regularTextStyle(HomeTextSecondary, 13.sp),
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS ROW
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun StatsRow(state: HomeDashboardState, platform: Platform = Platform.MEN) {
    val accent = platform.accent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.People,
            value = state.totalPlayers.toString(),
            label = stringResource(R.string.stat_players),
            accentColor = accent
        )
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.Handshake,
            value = state.withMandate.toString(),
            label = stringResource(R.string.stat_mandate),
            accentColor = HomeBlueAccent
        )
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.PersonOff,
            value = state.freeAgents.toString(),
            label = stringResource(R.string.stat_free),
            accentColor = HomeRedAccent
        )
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.RequestQuote,
            value = state.requestsCount.toString(),
            label = stringResource(R.string.stat_requests),
            accentColor = HomePurpleAccent
        )
    }
}

@Composable
private fun StatCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String,
    accentColor: Color
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = value,
                style = boldTextStyle(HomeTextPrimary, 20.sp)
            )
            Text(
                text = label,
                style = regularTextStyle(HomeTextSecondary, 11.sp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QUICK ACTIONS
// ═════════════════════════════════════════════════════════════════════════════

/** Quick action keys: only actions relevant to the current platform are shown. */
private enum class QuickActionKey {
    PLAYERS,
    SHORTLIST,
    RELEASES,
    CONTRACT_FINISHER,
    RETURNEES,
    WAR_ROOM,
    CONTACTS,
    REQUESTS,
    SHADOW_TEAMS,
    TASKS,
}

/** Which quick actions to show per platform (aligned with web dashboard). */
private fun quickActionsFor(platform: Platform): Set<QuickActionKey> = when (platform) {
    Platform.MEN -> setOf(
        QuickActionKey.PLAYERS,
        QuickActionKey.SHORTLIST,
        QuickActionKey.RELEASES,
        QuickActionKey.CONTRACT_FINISHER,
        QuickActionKey.RETURNEES,
        QuickActionKey.WAR_ROOM,
        QuickActionKey.CONTACTS,
        QuickActionKey.REQUESTS,
        QuickActionKey.SHADOW_TEAMS,
    )
    Platform.WOMEN -> setOf(
        QuickActionKey.PLAYERS,
        QuickActionKey.SHORTLIST,
        QuickActionKey.CONTACTS,
        QuickActionKey.REQUESTS,
        QuickActionKey.TASKS,
    )
    Platform.YOUTH -> setOf(
        QuickActionKey.PLAYERS,
        QuickActionKey.SHORTLIST,
        QuickActionKey.CONTACTS,
        QuickActionKey.REQUESTS,
        QuickActionKey.TASKS,
    )
}

@Composable
private fun QuickActionsRow(navController: NavController, platform: Platform = Platform.MEN) {
    val actions = quickActionsFor(platform)
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(vertical = 14.dp)
    ) {
        if (QuickActionKey.PLAYERS in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.People,
                    label = stringResource(R.string.quick_action_players),
                    color = platform.accent,
                    onClick = {
                        navController.navigate(Screens.PlayersScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.SHORTLIST in actions) {
            item {
                QuickActionChip(
                    icon = Icons.AutoMirrored.Filled.List,
                    label = stringResource(R.string.quick_action_shortlist),
                    color = HomeBlueAccent,
                    onClick = {
                        navController.navigate(Screens.ShortlistScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.RELEASES in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.Search,
                    label = stringResource(R.string.quick_action_releases),
                    color = HomeOrangeAccent,
                    onClick = {
                        navController.navigate(Screens.ReleasesScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.CONTRACT_FINISHER in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.CalendarToday,
                    label = stringResource(
                        if (java.util.Calendar.getInstance().get(java.util.Calendar.MONTH) + 1 in 2..9)
                            R.string.quick_action_contract_finisher_summer
                        else
                            R.string.quick_action_contract_finisher_winter
                    ),
                    color = HomeAmberAccent,
                    onClick = {
                        navController.navigate(Screens.ContractFinisherScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.RETURNEES in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.Autorenew,
                    label = stringResource(R.string.quick_action_returnees),
                    color = HomeRedAccent,
                    onClick = {
                        navController.navigate(Screens.ReturneeScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.WAR_ROOM in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.Psychology,
                    label = stringResource(R.string.quick_action_war_room),
                    color = WarRoomAccent,
                    onClick = {
                        navController.navigate(Screens.WarRoomScreen.route) {
                            launchSingleTop = true
                        }
                    },
                    gradientBg = Brush.horizontalGradient(
                        colors = listOf(
                            WarRoomAccent.copy(alpha = 0.25f),
                            WarRoomAccent.copy(alpha = 0.12f)
                        )
                    )
                )
            }
        }
        if (QuickActionKey.CONTACTS in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.ContactPhone,
                    label = stringResource(R.string.quick_action_contacts),
                    color = HomeYellowAccent,
                    onClick = {
                        navController.navigate(Screens.ContactsScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.REQUESTS in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.RequestQuote,
                    label = stringResource(R.string.quick_action_requests),
                    color = HomePurpleAccent,
                    onClick = {
                        navController.navigate(Screens.RequestsScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.SHADOW_TEAMS in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.SportsSoccer,
                    label = stringResource(R.string.quick_action_shadow_teams),
                    color = HomeGreenAccent,
                    onClick = {
                        navController.navigate(Screens.ShadowTeamsScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
        if (QuickActionKey.TASKS in actions) {
            item {
                QuickActionChip(
                    icon = Icons.Default.CheckCircle,
                    label = stringResource(R.string.tasks_title),
                    color = platform.accent,
                    onClick = {
                        navController.navigate(Screens.TasksScreen.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun QuickActionChip(
    icon: ImageVector,
    label: String,
    color: Color,
    onClick: () -> Unit,
    gradientBg: Brush? = null
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .then(
                if (gradientBg != null) Modifier.background(gradientBg)
                else Modifier.background(color.copy(alpha = 0.15f))
            )
            .then(
                if (gradientBg != null) Modifier.border(
                    1.dp,
                    color.copy(alpha = 0.4f),
                    RoundedCornerShape(20.dp)
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
        Text(text = label, style = boldTextStyle(color, 12.sp))
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  ACTIVITY FEED
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun FeedSectionHeader(
    selectedFilter: FeedFilter,
    onFilterSelected: (FeedFilter) -> Unit
) {
    Column(modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 10.dp)) {
        Text(
            text = stringResource(R.string.feed_recent_updates),
            style = boldTextStyle(HomeTextPrimary, 18.sp)
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FeedFilter.entries.forEach { filter ->
                val isSelected = filter == selectedFilter
                val bgColor by animateColorAsState(
                    targetValue = if (isSelected) HomeTealAccent else Color.Transparent,
                    label = "filterBg"
                )
                val textColor = if (isSelected) HomeDarkBackground else HomeTextSecondary

                Text(
                    text = stringResource(filter.labelRes),
                    style = boldTextStyle(textColor, 12.sp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(bgColor)
                        .then(
                            if (!isSelected) Modifier.border(
                                1.dp,
                                HomeDarkCardBorder,
                                RoundedCornerShape(16.dp)
                            ) else Modifier
                        )
                        .clickWithNoRipple { onFilterSelected(filter) }
                        .padding(horizontal = 14.dp, vertical = 6.dp)
                )
            }
        }
    }
}

@Composable
private fun FeedShowMoreLessButton(
    isExpanded: Boolean,
    onToggle: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(HomeDarkCardBorder.copy(alpha = 0.5f))
            .clickWithNoRipple { onToggle() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(
                if (isExpanded) R.string.feed_show_less else R.string.feed_show_all
            ),
            style = boldTextStyle(HomeTealAccent, 14.sp)
        )
    }
}

@Composable
private fun FeedEventCard(
    event: FeedEvent,
    navController: NavController,
    allAccounts: List<com.liordahan.mgsrteam.features.login.models.Account> = emptyList(),
    isWomenPlatform: Boolean = false,
    isYouthPlatform: Boolean = false,
    onNavigateToPlayer: (tmProfile: String, autoRefresh: Boolean) -> Unit = { _, _ -> },
    onNavigateToPlayerByName: (playerName: String) -> Unit = {}
) {
    val (icon, accentColor, title) = when (event.type) {
        FeedEvent.TYPE_MARKET_VALUE_CHANGE -> {
            val isDrop = isMarketValueDrop(event.oldValue, event.newValue)
            if (isDrop) {
                Triple(Icons.AutoMirrored.Filled.TrendingDown, HomeRedAccent, stringResource(R.string.feed_market_value_update))
            } else {
                Triple(Icons.AutoMirrored.Filled.TrendingUp, HomeGreenAccent, stringResource(R.string.feed_market_value_update))
            }
        }
        FeedEvent.TYPE_CLUB_CHANGE -> Triple(Icons.Default.SwapHoriz, HomeBlueAccent, stringResource(R.string.feed_club_change))
        FeedEvent.TYPE_BECAME_FREE_AGENT -> Triple(Icons.Default.PersonOff, HomeRedAccent, stringResource(
            when { isWomenPlatform -> R.string.feed_women_became_free_agent; isYouthPlatform -> R.string.feed_youth_became_free_agent; else -> R.string.feed_became_free_agent }
        ))
        FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB -> Triple(Icons.Default.PersonOff, HomeOrangeAccent, stringResource(
            when { isWomenPlatform -> R.string.feed_women_new_release; isYouthPlatform -> R.string.feed_youth_new_release; else -> R.string.feed_new_release }
        ))
        FeedEvent.TYPE_MANDATE_EXPIRED -> Triple(Icons.Default.Warning, HomeRedAccent, stringResource(R.string.feed_mandate_expired))
        FeedEvent.TYPE_MANDATE_UPLOADED -> Triple(Icons.Default.Description, HomeTealAccent, stringResource(R.string.feed_mandate_uploaded))
        FeedEvent.TYPE_MANDATE_SWITCHED_ON -> Triple(Icons.Default.Description, HomeTealAccent, stringResource(R.string.feed_mandate_switched_on))
        FeedEvent.TYPE_MANDATE_SWITCHED_OFF -> Triple(Icons.Default.Warning, HomeRedAccent, stringResource(R.string.feed_mandate_switched_off))
        FeedEvent.TYPE_CONTRACT_EXPIRING -> Triple(Icons.Default.Warning, HomeOrangeAccent, stringResource(R.string.feed_contract_expiring))
        FeedEvent.TYPE_NOTE_ADDED -> Triple(Icons.AutoMirrored.Filled.NoteAdd, HomeRoseAccent, stringResource(R.string.feed_new_note))
        FeedEvent.TYPE_NOTE_DELETED -> Triple(Icons.Default.Delete, HomeRedAccent, stringResource(R.string.feed_note_deleted))
        FeedEvent.TYPE_PLAYER_ADDED -> Triple(Icons.Default.Add, HomeTealAccent, stringResource(
            when { isWomenPlatform -> R.string.feed_women_player_added; isYouthPlatform -> R.string.feed_youth_player_added; else -> R.string.feed_player_added }
        ))
        FeedEvent.TYPE_PLAYER_DELETED -> Triple(Icons.Default.Delete, HomeRedAccent, stringResource(
            when { isWomenPlatform -> R.string.feed_women_player_deleted; isYouthPlatform -> R.string.feed_youth_player_deleted; else -> R.string.feed_player_deleted }
        ))
        FeedEvent.TYPE_SHORTLIST_ADDED -> Triple(Icons.Default.BookmarkAdd, HomeBlueAccent, stringResource(
            when { isWomenPlatform -> R.string.feed_women_shortlist_added; isYouthPlatform -> R.string.feed_youth_shortlist_added; else -> R.string.feed_shortlist_added }
        ))
        FeedEvent.TYPE_SHORTLIST_REMOVED -> Triple(Icons.Default.BookmarkRemove, HomeRedAccent, stringResource(
            when { isWomenPlatform -> R.string.feed_women_shortlist_removed; isYouthPlatform -> R.string.feed_youth_shortlist_removed; else -> R.string.feed_shortlist_removed }
        ))
        FeedEvent.TYPE_REQUEST_ADDED -> Triple(Icons.Default.RequestQuote, HomePurpleAccent, stringResource(R.string.feed_request_added))
        FeedEvent.TYPE_REQUEST_DELETED -> Triple(Icons.Default.Delete, HomeRedAccent, stringResource(R.string.feed_request_deleted))
        FeedEvent.TYPE_PLAYER_OFFERED_TO_CLUB -> Triple(Icons.Default.Handshake, HomeTealAccent, stringResource(
            when { isWomenPlatform -> R.string.feed_women_player_offered_to_club; isYouthPlatform -> R.string.feed_youth_player_offered_to_club; else -> R.string.feed_player_offered_to_club }
        ))
        else -> Triple(Icons.Default.Notifications, HomeTextSecondary, stringResource(R.string.feed_update))
    }

    val context = LocalContext.current
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickWithNoRipple {
                when {
                    event.type == FeedEvent.TYPE_REQUEST_ADDED ||
                    event.type == FeedEvent.TYPE_REQUEST_DELETED ->
                        navController.navigate(Screens.RequestsScreen.route)
                    event.type == FeedEvent.TYPE_PLAYER_OFFERED_TO_CLUB && event.playerTmProfile != null ->
                        onNavigateToPlayer(event.playerTmProfile, false)
                    event.type == FeedEvent.TYPE_SHORTLIST_ADDED ||
                    event.type == FeedEvent.TYPE_SHORTLIST_REMOVED ->
                        navController.navigate(Screens.ShortlistScreen.route)
                    event.type == FeedEvent.TYPE_PLAYER_DELETED ->
                        navController.navigate(Screens.PlayersScreen.route)
                    event.playerTmProfile != null -> {
                        val tm = event.playerTmProfile
                        when {
                            event.type == FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB && event.extraInfo == "NOT_IN_DATABASE" ->
                                context.startActivity(Intent(Intent.ACTION_VIEW, tm.toUri()))
                            event.type == FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB && event.extraInfo == "IN_DATABASE" ->
                                onNavigateToPlayer(tm, true)
                            event.type == FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB ->
                                navController.navigate("${Screens.AddPlayerScreen.route}/${Uri.encode(tm)}")
                            else ->
                                onNavigateToPlayer(tm, false)
                        }
                    }
                    // Fallback for Women/Youth events with null playerTmProfile — find by name
                    event.playerName != null -> {
                        onNavigateToPlayerByName(event.playerName)
                    }
                }
            },
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Icon
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = boldTextStyle(accentColor, 11.sp)
                )
                Spacer(Modifier.height(2.dp))

                // Main text
                when (event.type) {
                    FeedEvent.TYPE_MARKET_VALUE_CHANGE -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        val newValueDisplay = when {
                            event.newValue.isNullOrBlank() -> stringResource(R.string.feed_market_value_no_value)
                            event.newValue == "€0" -> stringResource(R.string.feed_market_value_no_value)
                            event.newValue == "-" -> stringResource(R.string.feed_market_value_no_value)
                            event.newValue.toMarketValueDouble() == 0.0 -> stringResource(R.string.feed_market_value_no_value)
                            else -> event.newValue
                        }
                        Text(
                            text = stringResource(
                                R.string.feed_value_changed,
                                event.oldValue ?: "?",
                                newValueDisplay
                            ),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                    FeedEvent.TYPE_BECAME_FREE_AGENT -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        Text(
                            text = stringResource(
                                if (isWomenPlatform) R.string.feed_women_released_from else R.string.feed_released_from,
                                event.oldValue ?: "?"
                            ),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                    FeedEvent.TYPE_CLUB_CHANGE -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        Text(
                            text = stringResource(
                                if (isWomenPlatform) R.string.feed_women_moved_from_to else R.string.feed_moved_from_to,
                                event.oldValue ?: "?",
                                event.newValue ?: "?"
                            ),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                    FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        if (event.extraInfo == "NOT_IN_DATABASE") {
                            Text(
                                text = stringResource(R.string.feed_new_release_not_in_db),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_MANDATE_EXPIRED -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        Text(
                            text = stringResource(R.string.feed_mandate_expired),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                        event.agentName?.let { agent ->
                            val agentDisplayName = allAccounts.find { it.name.equals(agent, ignoreCase = true) || it.hebrewName?.equals(agent, ignoreCase = true) == true }
                                ?.getDisplayName(context) ?: agent
                            Text(
                                text = stringResource(R.string.feed_mandate_marked_by, agentDisplayName),
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                        }
                        event.mandateExpiryAt?.let { expiryAt ->
                            val expiryStr = SimpleDateFormat("dd/MM/yyyy", Locale.US).format(Date(expiryAt))
                            Text(
                                text = stringResource(R.string.feed_mandate_expires, expiryStr),
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_MANDATE_UPLOADED -> {
                        Text(
                            text = stringResource(
                                R.string.feed_mandate_uploaded_by,
                                event.agentName?.let { raw ->
                                    allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                        ?.getDisplayName(context) ?: raw
                                } ?: stringResource(R.string.greeting_agent_default),
                                event.playerName ?: ""
                            ),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        event.mandateExpiryAt?.let { expiryAt ->
                            val expiryStr = SimpleDateFormat("dd/MM/yyyy", Locale.US).format(Date(expiryAt))
                            Text(
                                text = stringResource(R.string.feed_mandate_expires, expiryStr),
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_MANDATE_SWITCHED_ON,
                    FeedEvent.TYPE_MANDATE_SWITCHED_OFF -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        } ?: stringResource(R.string.greeting_agent_default)
                        Text(
                            text = stringResource(
                                R.string.feed_mandate_switched_by,
                                agentDisplayName,
                                event.playerName ?: ""
                            ),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        event.mandateExpiryAt?.let { expiryAt ->
                            val expiryStr = SimpleDateFormat("dd/MM/yyyy", Locale.US).format(Date(expiryAt))
                            Text(
                                text = stringResource(R.string.feed_mandate_expires, expiryStr),
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_NOTE_ADDED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        } ?: stringResource(R.string.greeting_agent_default)
                        Text(
                            text = stringResource(
                                R.string.feed_note_added_by,
                                agentDisplayName,
                                event.playerName ?: ""
                            ),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        event.extraInfo?.let {
                            Text(
                                text = it,
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    FeedEvent.TYPE_NOTE_DELETED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        } ?: stringResource(R.string.greeting_agent_default)
                        Text(
                            text = stringResource(
                                R.string.feed_note_deleted_by,
                                agentDisplayName,
                                event.playerName ?: ""
                            ),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        event.extraInfo?.let {
                            Text(
                                text = it,
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    FeedEvent.TYPE_SHORTLIST_ADDED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        }
                        Text(
                            text = event.playerName ?: stringResource(R.string.feed_update),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        agentDisplayName?.let {
                            Text(
                                text = stringResource(if (isWomenPlatform) R.string.feed_women_added_by else R.string.feed_added_by, it),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_SHORTLIST_REMOVED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        }
                        Text(
                            text = event.playerName ?: stringResource(R.string.feed_update),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        agentDisplayName?.let {
                            Text(
                                text = stringResource(if (isWomenPlatform) R.string.feed_women_removed_by else R.string.feed_removed_by, it),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_REQUEST_ADDED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        }
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        val parts = buildList {
                            event.newValue?.takeIf { it.isNotBlank() }?.let { add(it) }
                            agentDisplayName?.takeIf { it.isNotBlank() }?.let {
                                add(stringResource(if (isWomenPlatform) R.string.feed_women_added_by else R.string.feed_added_by, it))
                            }
                        }
                        if (parts.isNotEmpty()) {
                            Text(
                                text = parts.joinToString(" • "),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_REQUEST_DELETED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        }
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        val parts = buildList {
                            event.newValue?.takeIf { it.isNotBlank() }?.let { add(it) }
                            agentDisplayName?.takeIf { it.isNotBlank() }?.let {
                                add(stringResource(if (isWomenPlatform) R.string.feed_women_deleted_by else R.string.feed_deleted_by, it))
                            }
                        }
                        if (parts.isNotEmpty()) {
                            Text(
                                text = parts.joinToString(" • "),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_PLAYER_OFFERED_TO_CLUB -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        }
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        val parts = buildList {
                            event.newValue?.takeIf { it.isNotBlank() }?.let { add(stringResource(if (isWomenPlatform) R.string.feed_women_offered_to else R.string.feed_offered_to, it)) }
                            agentDisplayName?.takeIf { it.isNotBlank() }?.let {
                                add(stringResource(if (isWomenPlatform) R.string.feed_women_offered_by else R.string.feed_offered_by, it))
                            }
                        }
                        if (parts.isNotEmpty()) {
                            Text(
                                text = parts.joinToString(" • "),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                        event.extraInfo?.takeIf { it.isNotBlank() }?.let { feedback ->
                            Text(
                                text = "\"$feedback\"",
                                style = regularTextStyle(HomeTextSecondary, 11.sp),
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }
                    FeedEvent.TYPE_PLAYER_ADDED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        }
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        agentDisplayName?.let {
                            Text(
                                text = stringResource(if (isWomenPlatform) R.string.feed_women_added_by else R.string.feed_added_by, it),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                    FeedEvent.TYPE_PLAYER_DELETED -> {
                        val agentDisplayName = event.agentName?.let { raw ->
                            allAccounts.find { it.name.equals(raw, ignoreCase = true) || it.hebrewName?.equals(raw, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: raw
                        }
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        agentDisplayName?.let {
                            Text(
                                text = stringResource(if (isWomenPlatform) R.string.feed_women_deleted_by else R.string.feed_deleted_by, it),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                    else -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        event.extraInfo?.let {
                            Text(
                                text = it,
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                }
            }

            // Timestamp
            val timeAgo = formatTimeAgo(event.timestamp)
            Text(
                text = timeAgo,
                style = regularTextStyle(HomeTextSecondary, 10.sp)
            )
        }
    }
}

private fun isMarketValueDrop(oldValue: String?, newValue: String?): Boolean {
    // Treat null/blank as 0: no market value = 0, so drop to 0 should show red
    val oldNum = (oldValue ?: "").toMarketValueDouble()
    val newNum = (newValue ?: "").toMarketValueDouble()
    return newNum < oldNum
}

private fun String.toMarketValueDouble(): Double {
    val lower = this.lowercase().trim().removePrefix("€").replace(",", "")
    return when {
        lower.endsWith("k") -> lower.removeSuffix("k").toDoubleOrNull()?.times(1_000) ?: 0.0
        lower.endsWith("m") -> lower.removeSuffix("m").toDoubleOrNull()?.times(1_000_000) ?: 0.0
        else -> lower.toDoubleOrNull() ?: 0.0
    }
}

@Composable
private fun formatTimeAgo(timestamp: Long?): String {
    if (timestamp == null) return ""
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    val minutes = TimeUnit.MILLISECONDS.toMinutes(diff)
    val hours = TimeUnit.MILLISECONDS.toHours(diff)
    val days = TimeUnit.MILLISECONDS.toDays(diff)
    return when {
        minutes < 1 -> stringResource(R.string.time_just_now)
        minutes < 60 -> stringResource(R.string.time_minutes_ago, minutes)
        hours < 24 -> stringResource(R.string.time_hours_ago, hours)
        days < 7 -> stringResource(R.string.time_days_ago, days)
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(timestamp))
    }
}

private fun List<FeedEvent>.filterByType(filter: FeedFilter): List<FeedEvent> {
    return when (filter) {
        FeedFilter.ALL -> this
        FeedFilter.VALUE_CHANGES -> filter { it.type == FeedEvent.TYPE_MARKET_VALUE_CHANGE }
        FeedFilter.TRANSFERS -> filter {
            it.type == FeedEvent.TYPE_CLUB_CHANGE ||
                it.type == FeedEvent.TYPE_BECAME_FREE_AGENT ||
                it.type == FeedEvent.TYPE_NEW_RELEASE_FROM_CLUB
        }
        FeedFilter.NOTES -> filter {
            it.type == FeedEvent.TYPE_NOTE_ADDED || it.type == FeedEvent.TYPE_NOTE_DELETED
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MY AGENT HUB  (personalised dashboard for the logged-in agent)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun MyAgentHubSection(
    overview: MyAgentOverview,
    navController: NavController,
    onTaskToggle: (AgentTask) -> Unit
) {
    Column(modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)) {

        // ── Header ─────────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.my_hub_title),
                style = boldTextStyle(HomeTextPrimary, 18.sp),
                modifier = Modifier.weight(1f)
            )
            val isWomen = koinInject<PlatformManager>().current.value == Platform.WOMEN
            Text(
                text = stringResource(if (isWomen) R.string.women_my_hub_view_my_players else R.string.my_hub_view_my_players),
                style = boldTextStyle(HomeTealAccent, 12.sp),
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { navController.navigate(Screens.playersRoute(myPlayersOnly = true)) }
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .width(40.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(HomeTealAccent)
        )
        Spacer(Modifier.height(14.dp))

        // ── Stats Card with Task Ring ───────────────────────────────────
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(72.dp)
                ) {
                    MandateRingChart(
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
                            style = boldTextStyle(HomeTealAccent, 11.sp),
                            textAlign = TextAlign.Center,
                            maxLines = 1
                        )
                        Text(
                            text = stringResource(R.string.my_hub_tasks_done),
                            style = regularTextStyle(HomeTextSecondary, 8.sp),
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
                        HubStatItem(overview.totalPlayers.toString(), stringResource(R.string.my_hub_players), HomeBlueAccent)
                        HubStatItem(overview.withMandate.toString(), stringResource(R.string.my_hub_mandate), HomeGreenAccent)
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        HubStatItem(overview.freeAgents.toString(), stringResource(R.string.my_hub_free), HomeOrangeAccent)
                        HubStatItem(overview.expiringContracts.toString(), stringResource(R.string.my_hub_expiring), HomeRedAccent)
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // ── Upcoming Tasks ─────────────────────────────────────────────
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.CalendarToday,
                            contentDescription = null,
                            tint = HomeBlueAccent,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.my_hub_upcoming_tasks),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (overview.overdueTaskCount > 0) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(HomeRedAccent.copy(alpha = 0.15f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.my_hub_overdue_tasks, overview.overdueTaskCount),
                                    style = boldTextStyle(HomeRedAccent, 10.sp)
                                )
                            }
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            text = stringResource(R.string.my_hub_view_all_tasks),
                            style = boldTextStyle(HomeTealAccent, 12.sp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { navController.navigate(Screens.TasksScreen.route) }
                                .padding(horizontal = 4.dp, vertical = 2.dp)
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))

                if (overview.upcomingTasks.isEmpty()) {
                    Text(
                        text = stringResource(R.string.my_hub_no_tasks),
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                } else {
                    overview.upcomingTasks.forEach { task ->
                        HubTaskRow(
                            task = task,
                            navController = navController,
                            onToggle = { onTaskToggle(task) },
                            onClick = { navController.navigate(Screens.taskDetailRoute(task.id)) }
                        )
                    }
                    if (overview.pendingTaskCount > overview.upcomingTasks.size) {
                        Text(
                            text = stringResource(R.string.my_hub_pending_tasks, overview.pendingTaskCount),
                            style = regularTextStyle(HomeTextSecondary, 11.sp),
                            modifier = Modifier.padding(top = 6.dp)
                        )
                    }
                }
            }
        }

        // ── Alerts ─────────────────────────────────────────────────────
        if (overview.alerts.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.Warning,
                            contentDescription = null,
                            tint = HomeOrangeAccent,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.my_hub_attention),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    overview.alerts.forEach { alert ->
                        HubAlertRow(alert)
                    }
                }
            }
        }
    }
}

@Composable
private fun MyBoardLoadingPlaceholder() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(32.dp),
                color = HomeTealAccent,
                strokeWidth = 2.dp
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.my_hub_title),
                style = boldTextStyle(HomeTextSecondary, 14.sp)
            )
        }
    }
}

@Composable
private fun MyAgentEmptyState() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                Icons.Filled.People,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier.size(40.dp)
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.my_hub_no_players),
                style = boldTextStyle(HomeTextPrimary, 16.sp)
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.my_hub_no_players_hint),
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                textAlign = TextAlign.Center
            )
        }
    }
}

// ── Hub Sub-components ──────────────────────────────────────────────────────

@Composable
private fun MandateRingChart(percentage: Float, modifier: Modifier = Modifier) {
    val tealColor = HomeTealAccent
    val trackColor = HomeDarkCardBorder
    Canvas(modifier = modifier) {
        val strokeWidth = 8.dp.toPx()
        val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
        val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)

        drawArc(
            color = trackColor,
            startAngle = -90f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
        drawArc(
            color = tealColor,
            startAngle = -90f,
            sweepAngle = 360f * percentage.coerceIn(0f, 1f),
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
    }
}

@Composable
private fun HubStatItem(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(64.dp)) {
        Text(text = value, style = boldTextStyle(color, 18.sp))
        Text(text = label, style = regularTextStyle(HomeTextSecondary, 10.sp))
    }
}

@Composable
private fun HubTaskRow(
    task: AgentTask,
    navController: NavController,
    onToggle: () -> Unit,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = task.isCompleted,
            onCheckedChange = { onToggle() },
            colors = CheckboxDefaults.colors(
                checkedColor = HomeTealAccent,
                uncheckedColor = HomeTextSecondary
            ),
            modifier = Modifier.size(20.dp)
        )
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = task.title,
                style = regularTextStyle(HomeTextPrimary, 13.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textDecoration = if (task.isCompleted) TextDecoration.LineThrough else TextDecoration.None
            )
            if (task.playerName.isNotBlank() && (task.playerTmProfile.isNotBlank() || task.playerId.isNotBlank())) {
                Spacer(Modifier.height(2.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(HomeTealAccent.copy(alpha = 0.2f))
                        .clickable {
                            val navId = task.playerTmProfile.takeIf { it.isNotBlank() } ?: task.playerId
                            navController.navigate("${Screens.PlayerInfoScreen.route}/${android.net.Uri.encode(navId)}")
                        }
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = task.playerName,
                        style = boldTextStyle(HomeTealAccent, 10.sp),
                        maxLines = 1
                    )
                }
            }
        }
        if (task.dueDate > 0) {
            Spacer(Modifier.width(8.dp))
            val dueDateText = formatDueDate(task.dueDate)
            val dueColor = dueDateColor(task.dueDate, task.isCompleted)
            Text(text = dueDateText, style = regularTextStyle(dueColor, 11.sp))
        }
    }
}

@Composable
private fun HubAlertRow(alert: AgentAlert) {
    val alertColor = when (alert.severity) {
        AlertSeverity.URGENT -> HomeRedAccent
        AlertSeverity.WARNING -> HomeOrangeAccent
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(alertColor)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = alert.playerName,
            style = boldTextStyle(HomeTextPrimary, 12.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = alert.detail,
            style = regularTextStyle(alertColor, 11.sp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEAM OVERVIEW  (collapsible section showing all agents)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun TeamOverviewSection(
    agents: List<AgentSummary>,
    allAccounts: List<Account>,
    isExpanded: Boolean,
    onToggle: () -> Unit
) {
    val context = LocalContext.current
    val chevronRotation by animateFloatAsState(
        targetValue = if (isExpanded) 180f else 0f,
        animationSpec = tween(250),
        label = "teamChevron"
    )

    Column(modifier = Modifier.padding(top = 16.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(HomeTealAccent.copy(alpha = 0.08f))
                .clickable { onToggle() }
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Filled.People,
                contentDescription = null,
                tint = HomeTealAccent,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.team_overview_title),
                style = boldTextStyle(HomeTextPrimary, 15.sp),
                modifier = Modifier.weight(1f)
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(HomeTealAccent.copy(alpha = 0.15f))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    text = stringResource(R.string.team_overview_agents_count, agents.size),
                    style = boldTextStyle(HomeTealAccent, 11.sp)
                )
            }
            Spacer(Modifier.width(6.dp))
            Icon(
                Icons.Filled.KeyboardArrowDown,
                contentDescription = if (isExpanded) stringResource(R.string.collapse) else stringResource(R.string.expand),
                tint = HomeTextSecondary,
                modifier = Modifier
                    .size(20.dp)
                    .rotate(chevronRotation)
            )
        }

        AnimatedVisibility(
            visible = isExpanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(agents, key = { it.agentId ?: it.agentName }) { agent ->
                    TeamAgentCard(agent = agent, allAccounts = allAccounts, context = context)
                }
            }
        }
    }
}

@Composable
private fun TeamAgentCard(
    agent: AgentSummary,
    allAccounts: List<Account>,
    context: android.content.Context
) {
    val agentDisplayName = allAccounts
        .find { it.name.equals(agent.agentName, ignoreCase = true) || it.hebrewName?.equals(agent.agentName, ignoreCase = true) == true }
        ?.getDisplayName(context)
        ?: agent.agentName

    Card(
        modifier = Modifier.width(220.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(HomeTealAccent.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = agentDisplayName.take(1).uppercase(),
                        style = boldTextStyle(HomeTealAccent, 14.sp)
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    text = agentDisplayName,
                    style = boldTextStyle(HomeTextPrimary, 14.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = stringResource(R.string.agent_players_managed, agent.totalPlayers),
                style = regularTextStyle(HomeTextSecondary, 12.sp)
            )
            Spacer(Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                MiniStat(value = agent.withMandate.toString(), label = stringResource(R.string.agent_stat_mandate), color = HomeBlueAccent)
                MiniStat(value = agent.expiringContracts.toString(), label = stringResource(R.string.agent_stat_expiring), color = HomeOrangeAccent)
                MiniStat(value = agent.withNotes.toString(), label = stringResource(R.string.agent_stat_notes), color = HomePurpleAccent)
            }
        }
    }
}

@Composable
private fun MiniStat(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, style = boldTextStyle(color, 14.sp))
        Text(text = label, style = regularTextStyle(HomeTextSecondary, 9.sp))
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TRANSFER WINDOWS  (Open worldwide)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun TransferWindowsSectionHeader(totalCount: Int) {
    Column(modifier = Modifier.padding(top = 20.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.transfer_windows_title),
                style = boldTextStyle(HomeTextPrimary, 18.sp),
                modifier = Modifier.weight(1f)
            )
            if (totalCount > 0) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(HomeTealAccent.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = totalCount.toString(),
                        style = boldTextStyle(HomeTealAccent, 12.sp)
                    )
                }
            }
        }

        Spacer(Modifier.height(4.dp))

        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .width(40.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(HomeTealAccent)
        )

        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun TransferWindowGroupHeader(
    confederation: Confederation,
    count: Int,
    isExpanded: Boolean,
    closingSoonCount: Int,
    onToggle: () -> Unit
) {
    val chevronRotation by animateFloatAsState(
        targetValue = if (isExpanded) 180f else 0f,
        animationSpec = tween(250),
        label = "twChevron"
    )

    val accentColor = when (confederation) {
        Confederation.PRIORITY -> HomeTealAccent
        Confederation.UEFA -> HomeBlueAccent
        Confederation.CONMEBOL -> HomeGreenAccent
        Confederation.CONCACAF -> HomeOrangeAccent
        Confederation.AFC -> HomePurpleAccent
        Confederation.CAF -> Color(0xFFFDD835)
        Confederation.OFC -> HomeTextSecondary
    }

    val displayName = when (confederation) {
        Confederation.PRIORITY -> stringResource(R.string.transfer_windows_group_priority)
        Confederation.UEFA -> stringResource(R.string.transfer_windows_group_uefa)
        Confederation.CONMEBOL -> stringResource(R.string.transfer_windows_group_conmebol)
        Confederation.CONCACAF -> stringResource(R.string.transfer_windows_group_concacaf)
        Confederation.AFC -> stringResource(R.string.transfer_windows_group_afc)
        Confederation.CAF -> stringResource(R.string.transfer_windows_group_caf)
        Confederation.OFC -> stringResource(R.string.transfer_windows_group_ofc)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(accentColor.copy(alpha = 0.08f))
            .clickable { onToggle() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (confederation == Confederation.PRIORITY) {
            Text(text = "★ ", style = boldTextStyle(accentColor, 14.sp))
        }

        Text(
            text = displayName,
            style = boldTextStyle(HomeTextPrimary, 14.sp),
            modifier = Modifier.weight(1f)
        )

        if (closingSoonCount > 0 && !isExpanded) {
            Box(
                modifier = Modifier
                    .padding(end = 8.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(HomeRedAccent.copy(alpha = 0.15f))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = stringResource(R.string.transfer_windows_closing_soon, closingSoonCount),
                    style = boldTextStyle(HomeRedAccent, 10.sp)
                )
            }
        }

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(accentColor.copy(alpha = 0.15f))
                .padding(horizontal = 6.dp, vertical = 2.dp)
        ) {
            Text(
                text = count.toString(),
                style = boldTextStyle(accentColor, 11.sp)
            )
        }

        Spacer(Modifier.width(6.dp))

        Icon(
            imageVector = Icons.Default.KeyboardArrowDown,
            contentDescription = if (isExpanded) stringResource(R.string.collapse) else stringResource(R.string.expand),
            tint = HomeTextSecondary,
            modifier = Modifier
                .size(20.dp)
                .rotate(chevronRotation)
        )
    }
}

@Composable
private fun TransferWindowRow(
    window: TransferWindow,
    modifier: Modifier = Modifier
) {
    val isClosingSoon = (window.daysLeft ?: Int.MAX_VALUE) <= 7
    val daysColor = when {
        isClosingSoon -> HomeRedAccent
        (window.daysLeft ?: Int.MAX_VALUE) <= 14 -> HomeOrangeAccent
        else -> HomeTealAccent
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(HomeDarkCard)
            .border(
                1.dp,
                if (isClosingSoon) HomeRedAccent.copy(alpha = 0.3f) else HomeDarkCardBorder,
                RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (window.flagUrl != null) {
                Box(
                    modifier = Modifier
                        .shadow(3.dp, CircleShape)
                        .size(22.dp)
                        .clip(CircleShape)
                ) {
                    AsyncImage(
                        model = window.flagUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
                Spacer(Modifier.width(10.dp))
            }
            Text(
                text = window.countryName,
                style = boldTextStyle(HomeTextPrimary, 14.sp)
            )
        }
        window.daysLeft?.let { days ->
            if (isClosingSoon) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(HomeRedAccent.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = stringResource(R.string.transfer_windows_days_left, days),
                        style = boldTextStyle(HomeRedAccent, 12.sp)
                    )
                }
            } else {
                Text(
                    text = stringResource(R.string.transfer_windows_days_left, days),
                    style = regularTextStyle(daysColor, 13.sp)
                )
            }
        } ?: run {
            Text(
                text = stringResource(R.string.transfer_windows_open),
                style = regularTextStyle(HomeTextSecondary, 12.sp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TASKS SUMMARY WIDGET (Dashboard compact card)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun TasksSummaryWidget(
    agentTasks: Map<String, List<AgentTask>>,
    accounts: List<Account>,
    navController: NavController,
    onViewAllClick: () -> Unit,
    onAddTaskClick: () -> Unit,
    onTaskClick: (AgentTask) -> Unit,
    onToggleTask: (AgentTask) -> Unit
) {
    val allTasks = remember(agentTasks) { agentTasks.values.flatten() }
    val now = System.currentTimeMillis()

    val incompleteTasks = allTasks.filter { !it.isCompleted }
    val dueToday = incompleteTasks.count { it.dueDate > 0L && daysBetweenCalendarDays(it.dueDate, now) == 0 }
    val overdue = incompleteTasks.count { it.dueDate > 0L && daysBetweenCalendarDays(it.dueDate, now) < 0 }
    val total = allTasks.size

    val urgentTasks = remember(incompleteTasks) {
        incompleteTasks
            .filter { it.dueDate > 0L }
            .sortedBy { it.dueDate }
            .take(3)
    }

    Column(modifier = Modifier.padding(top = 20.dp)) {
        // Section header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.tasks_overview),
                style = boldTextStyle(HomeTextPrimary, 18.sp),
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .width(40.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(HomeTealAccent)
        )

        Spacer(Modifier.height(14.dp))

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Stat pills row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatPill(
                        value = dueToday.toString(),
                        label = stringResource(R.string.tasks_due_today),
                        color = HomeOrangeAccent,
                        modifier = Modifier.weight(1f)
                    )
                    StatPill(
                        value = overdue.toString(),
                        label = stringResource(R.string.tasks_overdue),
                        color = HomeRedAccent,
                        modifier = Modifier.weight(1f)
                    )
                    StatPill(
                        value = total.toString(),
                        label = stringResource(R.string.tasks_total),
                        color = HomeTextSecondary,
                        modifier = Modifier.weight(1f)
                    )
                }

                if (urgentTasks.isNotEmpty()) {
                    Spacer(Modifier.height(14.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(HomeDarkCardBorder)
                    )
                    Spacer(Modifier.height(10.dp))

                    urgentTasks.forEach { task ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { onTaskClick(task) }
                                .padding(vertical = 6.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Priority dot
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(
                                        when (task.priority) {
                                            2 -> HomeRedAccent
                                            1 -> HomeOrangeAccent
                                            else -> HomeGreenAccent
                                        }
                                    )
                            )
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = task.title,
                                    style = regularTextStyle(HomeTextPrimary, 13.sp),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (task.agentName.isNotBlank()) {
                                    Text(
                                        text = task.agentName,
                                        style = regularTextStyle(HomeTextSecondary, 10.sp),
                                        maxLines = 1
                                    )
                                }
                                if (task.playerName.isNotBlank() && (task.playerTmProfile.isNotBlank() || task.playerId.isNotBlank())) {
                                    Spacer(Modifier.height(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(HomeTealAccent.copy(alpha = 0.2f))
                                            .clickable {
                                                val navId = task.playerTmProfile.takeIf { it.isNotBlank() } ?: task.playerId
                                                navController.navigate("${Screens.PlayerInfoScreen.route}/${android.net.Uri.encode(navId)}")
                                            }
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = task.playerName,
                                            style = boldTextStyle(HomeTealAccent, 10.sp),
                                            maxLines = 1
                                        )
                                    }
                                }
                            }
                            if (task.dueDate > 0L) {
                                val dueDateStr = formatDueDate(task.dueDate)
                                val dueDateClr = dueDateColor(task.dueDate, task.isCompleted)
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(dueDateClr.copy(alpha = 0.15f))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = dueDateStr,
                                        style = boldTextStyle(dueDateClr, 10.sp)
                                    )
                                }
                            }
                        }
                    }
                } else if (total == 0) {
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = stringResource(R.string.tasks_empty_hint),
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                }

                Spacer(Modifier.height(14.dp))

                // Action row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // View All button
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeTealAccent.copy(alpha = 0.12f))
                            .clickable { onViewAllClick() }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.tasks_view_all),
                            style = boldTextStyle(HomeTealAccent, 13.sp)
                        )
                    }

                    // Add task button
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(HomeTealAccent)
                            .clickable { onAddTaskClick() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = stringResource(R.string.agent_add_task),
                            tint = HomeDarkBackground,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatPill(
    value: String,
    label: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.1f))
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = value, style = boldTextStyle(color, 18.sp))
        Spacer(Modifier.height(2.dp))
        Text(text = label, style = regularTextStyle(color, 10.sp))
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  OLD AGENT TASKS  (keeping as reference, can be removed later)
// ═════════════════════════════════════════════════════════════════════════════

private val agentColors = listOf(
    HomeTealAccent, HomeBlueAccent, HomeOrangeAccent,
    HomePurpleAccent, HomeGreenAccent, HomeRedAccent
)

@Composable
private fun AgentTasksSection(
    accounts: List<Account>,
    agentTasks: Map<String, List<AgentTask>>,
    expandedAgentId: String?,
    onToggleExpanded: (String) -> Unit,
    onToggleTask: (AgentTask) -> Unit,
    onAddTask: (agentId: String, agentName: String, title: String, dueDate: Long) -> Unit,
    onDeleteTask: (AgentTask) -> Unit
) {
    var showAddDialogForAccount by remember { mutableStateOf<Account?>(null) }

    Column(modifier = Modifier.padding(top = 20.dp)) {
        // Section header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.agent_tasks_title),
                style = boldTextStyle(HomeTextPrimary, 18.sp),
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(4.dp))

        // Teal accent line
        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .width(40.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(HomeTealAccent)
        )

        Spacer(Modifier.height(14.dp))

        // Agent cards — one per account
        accounts.forEachIndexed { index, account ->
            val accountId = account.id ?: return@forEachIndexed
            val tasks = agentTasks[accountId] ?: emptyList()
            val isExpanded = expandedAgentId == accountId
            val accentColor = agentColors[index % agentColors.size]

            ExpandableAgentTaskCard(
                account = account,
                tasks = tasks,
                isExpanded = isExpanded,
                accentColor = accentColor,
                onToggleExpanded = { onToggleExpanded(accountId) },
                onToggleTask = onToggleTask,
                onAddTaskClick = { showAddDialogForAccount = account },
                onDeleteTask = onDeleteTask
            )

            if (index < accounts.lastIndex) {
                Spacer(Modifier.height(10.dp))
            }
        }
    }

    // Add-task dialog
    showAddDialogForAccount?.let { account ->
        val context = LocalContext.current
        AddTaskDialog(
            agentName = account.getDisplayName(context).ifEmpty { stringResource(R.string.greeting_agent_default) },
            onDismiss = { showAddDialogForAccount = null },
            onConfirm = { title, dueDate ->
                onAddTask(account.id ?: "", account.getDisplayName(context).ifEmpty { account.name ?: "" }, title, dueDate)
                showAddDialogForAccount = null
            }
        )
    }
}

// ── Expandable Card ──────────────────────────────────────────────────────────

@Composable
private fun ExpandableAgentTaskCard(
    account: Account,
    tasks: List<AgentTask>,
    isExpanded: Boolean,
    accentColor: Color,
    onToggleExpanded: () -> Unit,
    onToggleTask: (AgentTask) -> Unit,
    onAddTaskClick: () -> Unit,
    onDeleteTask: (AgentTask) -> Unit
) {
    val context = LocalContext.current
    val agentName = account.getDisplayName(context).ifEmpty { stringResource(R.string.greeting_agent_default) }
    val completedCount = tasks.count { it.isCompleted }
    val totalCount = tasks.size
    val progress = if (totalCount > 0) completedCount.toFloat() / totalCount else 0f

    val chevronRotation by animateFloatAsState(
        targetValue = if (isExpanded) 180f else 0f,
        animationSpec = tween(250),
        label = "chevron"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column {
            // ── Header (always visible) ──────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple { onToggleExpanded() }
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Avatar
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = agentName.take(1).uppercase(),
                        style = boldTextStyle(accentColor, 16.sp)
                    )
                }

                Spacer(Modifier.width(12.dp))

                // Name + subtitle
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = agentName,
                        style = boldTextStyle(HomeTextPrimary, 15.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (totalCount > 0) {
                        Text(
                            text = stringResource(R.string.agent_tasks_done, completedCount, totalCount),
                            style = regularTextStyle(HomeTextSecondary, 11.sp)
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.agent_no_tasks),
                            style = regularTextStyle(HomeTextSecondary, 11.sp)
                        )
                    }
                }

                // Circular progress ring
                if (totalCount > 0) {
                    CircularProgressRing(
                        progress = progress,
                        text = "$completedCount/$totalCount",
                        accentColor = accentColor,
                        modifier = Modifier.size(42.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                }

                // Chevron
                Icon(
                    imageVector = Icons.Default.KeyboardArrowDown,
                    contentDescription = if (isExpanded) stringResource(R.string.collapse) else stringResource(R.string.expand),
                    tint = HomeTextSecondary,
                    modifier = Modifier
                        .size(22.dp)
                        .rotate(chevronRotation)
                )
            }

            // ── Expanded content ─────────────────────────────────────────
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(animationSpec = tween(250)),
                exit = shrinkVertically(animationSpec = tween(250))
            ) {
                Column {
                    // Divider
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp)
                            .height(1.dp)
                            .background(HomeDarkCardBorder)
                    )

                    // Task list
                    if (tasks.isEmpty()) {
                        Text(
                            text = stringResource(R.string.agent_no_tasks_hint),
                            style = regularTextStyle(HomeTextSecondary, 12.sp),
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 16.dp)
                        )
                    } else {
                        Column(modifier = Modifier.padding(top = 4.dp, bottom = 4.dp)) {
                            // Show incomplete first, then completed
                            val sortedTasks = tasks.sortedWith(
                                compareBy<AgentTask> { it.isCompleted }.thenBy { it.dueDate }
                            )
                            sortedTasks.forEach { task ->
                                TaskRow(
                                    task = task,
                                    onToggle = { onToggleTask(task) },
                                    onDelete = { onDeleteTask(task) }
                                )
                            }
                        }
                    }

                    // Progress bar
                    if (totalCount > 0) {
                        val animatedProgress by animateFloatAsState(
                            targetValue = progress,
                            animationSpec = tween(400),
                            label = "progress"
                        )
                        LinearProgressIndicator(
                            progress = { animatedProgress },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = accentColor,
                            trackColor = HomeDarkCardBorder,
                        )
                        Spacer(Modifier.height(8.dp))
                    }

                    // + Add Task button
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 14.dp, end = 14.dp, bottom = 12.dp, top = 4.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(HomeTealAccent.copy(alpha = 0.12f))
                                .clickWithNoRipple { onAddTaskClick() }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = stringResource(R.string.agent_add_task),
                                tint = HomeTealAccent,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = stringResource(R.string.agent_add_task),
                                style = boldTextStyle(HomeTealAccent, 12.sp)
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Task Row ─────────────────────────────────────────────────────────────────

@Composable
private fun TaskRow(
    task: AgentTask,
    onToggle: () -> Unit,
    onDelete: () -> Unit
) {
    val dueDateStr = formatDueDate(task.dueDate)
    val dueDateColor = dueDateColor(task.dueDate, task.isCompleted)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 1.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = task.isCompleted,
            onCheckedChange = { onToggle() },
            colors = CheckboxDefaults.colors(
                checkedColor = HomeTealAccent,
                uncheckedColor = HomeTextSecondary,
                checkmarkColor = HomeDarkBackground
            ),
            modifier = Modifier.size(36.dp)
        )

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = task.title,
                style = if (task.isCompleted) {
                    regularTextStyle(
                        HomeTextSecondary.copy(alpha = 0.5f), 13.sp,
                        decoration = TextDecoration.LineThrough
                    )
                } else {
                    regularTextStyle(HomeTextPrimary, 13.sp)
                },
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        // Due-date chip
        if (task.dueDate > 0L) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(dueDateColor.copy(alpha = 0.15f))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    text = dueDateStr,
                    style = boldTextStyle(dueDateColor, 10.sp)
                )
            }
        }

        Spacer(Modifier.width(4.dp))

        // Delete
        Icon(
            imageVector = Icons.Default.Close,
            contentDescription = stringResource(R.string.delete_task),
            tint = HomeTextSecondary.copy(alpha = 0.4f),
            modifier = Modifier
                .size(18.dp)
                .clickWithNoRipple { onDelete() }
        )
    }
}

// ── Circular Progress Ring ───────────────────────────────────────────────────

@Composable
private fun CircularProgressRing(
    progress: Float,
    text: String,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(500),
        label = "ringProgress"
    )

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val stroke = 4.dp.toPx()
            val padding = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)

            // Track
            drawArc(
                color = HomeDarkCardBorder,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(padding, padding),
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round)
            )

            // Progress arc
            drawArc(
                color = accentColor,
                startAngle = -90f,
                sweepAngle = animatedProgress * 360f,
                useCenter = false,
                topLeft = Offset(padding, padding),
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round)
            )
        }

        Text(
            text = text,
            style = boldTextStyle(HomeTextPrimary, 9.sp)
        )
    }
}

// ── Add Task Dialog ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddTaskDialog(
    agentName: String,
    onDismiss: () -> Unit,
    onConfirm: (title: String, dueDate: Long) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var selectedDate by remember { mutableStateOf(0L) }
    var showDatePicker by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                // Title
                Text(
                    text = stringResource(R.string.agent_new_task_for, agentName),
                    style = boldTextStyle(HomeTextPrimary, 16.sp)
                )
                Spacer(Modifier.height(16.dp))

                // Task name field
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    placeholder = {
                        Text(
                            stringResource(R.string.agent_task_description_hint),
                            style = regularTextStyle(HomeTextSecondary, 14.sp)
                        )
                    },
                    textStyle = regularTextStyle(HomeTextPrimary, 14.sp),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = HomeTealAccent,
                        unfocusedBorderColor = HomeDarkCardBorder,
                        cursorColor = HomeTealAccent,
                        focusedContainerColor = HomeDarkBackground,
                        unfocusedContainerColor = HomeDarkBackground
                    ),
                    singleLine = true
                )

                Spacer(Modifier.height(12.dp))

                // Due date picker button
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                        .background(HomeDarkBackground)
                        .clickWithNoRipple { showDatePicker = true }
                        .padding(horizontal = 14.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.CalendarToday,
                        contentDescription = null,
                        tint = if (selectedDate > 0) HomeTealAccent else HomeTextSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = if (selectedDate > 0L) {
                            SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(selectedDate))
                        } else {
                            stringResource(R.string.agent_select_due_date)
                        },
                        style = regularTextStyle(
                            if (selectedDate > 0) HomeTextPrimary else HomeTextSecondary,
                            14.sp
                        )
                    )
                }

                Spacer(Modifier.height(20.dp))

                // Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(
                            stringResource(R.string.cancel),
                            style = boldTextStyle(HomeTextSecondary, 13.sp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (title.isNotBlank()) HomeTealAccent
                                else HomeTealAccent.copy(alpha = 0.3f)
                            )
                            .then(
                                if (title.isNotBlank()) Modifier.clickWithNoRipple {
                                    onConfirm(title.trim(), selectedDate)
                                } else Modifier
                            )
                            .padding(horizontal = 20.dp, vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            stringResource(R.string.agent_add_task),
                            style = boldTextStyle(HomeDarkBackground, 13.sp)
                        )
                    }
                }
            }
        }
    }

    // Date picker dialog
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { selectedDate = datePickerMillisToLocalMidnight(it) }
                    showDatePicker = false
                }) {
                    Text(stringResource(R.string.ok), style = boldTextStyle(HomeTealAccent, 14.sp))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(R.string.cancel), style = boldTextStyle(HomeTextSecondary, 14.sp))
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

// ── Due-date helpers ─────────────────────────────────────────────────────────

@Composable
private fun formatDueDate(epochMillis: Long): String {
    if (epochMillis <= 0L) return ""
    val now = System.currentTimeMillis()
    val diffDays = daysBetweenCalendarDays(epochMillis, now)
    return when {
        diffDays < -1 -> stringResource(R.string.due_overdue, -diffDays)
        diffDays == -1 -> stringResource(R.string.due_yesterday)
        diffDays == 0 -> stringResource(R.string.due_today)
        diffDays == 1 -> stringResource(R.string.due_tomorrow)
        diffDays <= 7 -> SimpleDateFormat("EEEE", Locale.getDefault()).format(Date(epochMillis))
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(epochMillis))
    }
}

private fun dueDateColor(epochMillis: Long, isCompleted: Boolean): Color {
    if (isCompleted) return HomeGreenAccent
    if (epochMillis <= 0L) return HomeTextSecondary
    val now = System.currentTimeMillis()
    val diffDays = daysBetweenCalendarDays(epochMillis, now)
    return when {
        diffDays < 0 -> HomeRedAccent
        diffDays <= 2 -> HomeOrangeAccent
        diffDays <= 7 -> Color(0xFFFDD835) // yellow
        else -> HomeTextSecondary
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DOCUMENT REMINDERS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun DocumentRemindersSection(reminders: List<DocumentReminder>) {
    Column(
        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Description,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = stringResource(R.string.document_reminders_title),
                style = boldTextStyle(HomeTextPrimary, 16.sp)
            )
        }
        Spacer(Modifier.height(10.dp))

        reminders.forEach { reminder ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val dotColor = when {
                    reminder.isMissing -> HomeRedAccent
                    (reminder.daysUntilExpiry ?: 0) <= 7 -> HomeRedAccent
                    (reminder.daysUntilExpiry ?: 0) <= 15 -> HomeOrangeAccent
                    else -> Color(0xFFFDD835) // yellow
                }

                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(dotColor)
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = reminder.playerName,
                    style = boldTextStyle(HomeTextPrimary, 13.sp)
                )
                Text(
                    text = " – ",
                    style = regularTextStyle(HomeTextSecondary, 13.sp)
                )
                Text(
                    text = if (reminder.isMissing) {
                        stringResource(R.string.document_missing, reminder.documentType)
                    } else {
                        stringResource(R.string.document_expires_in, reminder.documentType, reminder.daysUntilExpiry ?: 0)
                    },
                    style = regularTextStyle(HomeTextSecondary, 13.sp),
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}
