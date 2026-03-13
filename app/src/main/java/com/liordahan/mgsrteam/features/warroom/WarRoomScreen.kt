package com.liordahan.mgsrteam.features.warroom

import com.liordahan.mgsrteam.ui.components.ShortlistPillButton
import com.liordahan.mgsrteam.ui.components.shortlistPillState
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.aiscout.AiScoutContentBody
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.localization.CountryNameTranslator
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.ui.components.ToastManager
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import coil.compose.SubcomposeAsyncImage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ═══════════════════════════════════════════════════════════════════════════════
//  COLOR SYSTEM — War Room "Mission Control" palette
// ═══════════════════════════════════════════════════════════════════════════════

private val WrIndigo = Color(0xFF6366F1)
private val WrIndigoLight = Color(0xFF93A0FF)
private val WrIndigoDim = Color(0xFF4F46E5)
private val WrIndigoBg = Color(0x1A6366F1)
private val WrIndigoBorder = Color(0x406366F1)

private val WrSurface = Color(0xFF111827)
private val WrSurfaceElevated = Color(0xFF1A2235)
private val WrSurfaceBorder = Color(0xFF283044)

private val WrGem = Color(0xFFF59E0B)
private val WrGemBg = Color(0x1AF59E0B)
private val WrMatch = Color(0xFF10B981)
private val WrMatchBg = Color(0x1A10B981)
private val WrAgent = Color(0xFF8B5CF6)
private val WrAgentBg = Color(0x1A8B5CF6)

private val WrScoreExcellent = Color(0xFF10B981)
private val WrScoreGood = Color(0xFF3B82F6)
private val WrScoreMedium = Color(0xFFF59E0B)
private val WrScoreLow = Color(0xFFEF4444)

private const val TM_IMAGE_BASE = "https://img.a.transfermarkt.technology/portrait/medium/"
private const val TM_DEFAULT_IMAGE = "${TM_IMAGE_BASE}0.jpg"

private fun translateNationalityDisplay(nationality: String, context: android.content.Context): String {
    if (nationality.isBlank()) return ""
    val parts = nationality
        .split(Regex("\\s*[·]\\s*|\\s{2,}"))
        .map { it.trim() }
        .filter { it.isNotBlank() }
    if (parts.isEmpty()) return nationality
    return parts.joinToString(" · ") { CountryNameTranslator.getDisplayName(context, it) }
}

private fun getPlayerImageUrl(profileImage: String?, transfermarktUrl: String): String {
    if (!profileImage.isNullOrBlank()) return profileImage.trim()
    val id = extractPlayerIdFromUrl(transfermarktUrl)
    if (id != null) return "${TM_IMAGE_BASE}${id}.jpg"
    return TM_DEFAULT_IMAGE
}

private fun extractPlayerIdFromUrl(url: String): String? {
    if (url.isBlank()) return null
    val parts = url.trim().split("/")
    for (i in parts.indices.reversed()) {
        val p = parts[i].lowercase()
        if (p == "spieler" || p == "player") {
            val id = parts.getOrNull(i + 1)
            return if (id != null && id.all { it.isDigit() }) id else null
        }
    }
    val last = parts.lastOrNull()
    return if (last != null && last.all { it.isDigit() }) last else null
}

private fun scoreColor(score: Int): Color = when {
    score >= 80 -> WrScoreExcellent
    score >= 60 -> WrScoreGood
    score >= 40 -> WrScoreMedium
    else -> WrScoreLow
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WarRoomScreen(
    navController: NavController,
    viewModel: IWarRoomViewModel = koinViewModel(),
    initialTab: WarRoomTab? = null
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()

    val pagerState = rememberPagerState(
        initialPage = initialTab?.ordinal ?: 0,
        pageCount = { 3 }
    )

    // Sync pager → ViewModel tab
    LaunchedEffect(pagerState.currentPage) {
        val tab = WarRoomTab.entries[pagerState.currentPage]
        viewModel.selectTab(tab)
    }

    if (initialTab != null) {
        LaunchedEffect(initialTab) {
            pagerState.scrollToPage(initialTab.ordinal)
        }
    }

    // Bottom sheet for report preview
    var reportSheetCandidate by remember { mutableStateOf<DiscoveryCandidate?>(null) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    if (reportSheetCandidate != null) {
        val candidate = reportSheetCandidate!!
        val report = state.candidateReports[candidate.transfermarktUrl]
        val isLoading = state.loadingReportUrls.contains(candidate.transfermarktUrl)

        ModalBottomSheet(
            onDismissRequest = { reportSheetCandidate = null },
            sheetState = sheetState,
            containerColor = WrSurface,
            contentColor = HomeTextPrimary,
            dragHandle = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        Modifier
                            .padding(top = 12.dp, bottom = 4.dp)
                            .width(40.dp)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(
                                Brush.horizontalGradient(
                                    listOf(
                                        WrIndigo.copy(alpha = 0.4f),
                                        WrIndigoLight.copy(alpha = 0.6f),
                                        WrIndigo.copy(alpha = 0.4f)
                                    )
                                )
                            )
                    )
                    // Subtle glow line under handle
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                            .height(1.dp)
                            .background(
                                Brush.horizontalGradient(
                                    listOf(
                                        Color.Transparent,
                                        WrIndigo.copy(alpha = 0.15f),
                                        Color.Transparent
                                    )
                                )
                            )
                    )
                }
            }
        ) {
            ReportBottomSheetContent(
                candidate = candidate,
                report = report,
                isLoading = isLoading,
                onFullReport = {
                    reportSheetCandidate = null
                    navController.navigate(
                        Screens.fullReportRoute(Uri.encode(candidate.transfermarktUrl), candidate.name)
                    ) { launchSingleTop = true }
                }
            )
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
            .drawBehind {
                // Ambient purple glow — top-left (like web hero gradient)
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            WrIndigo.copy(alpha = 0.08f),
                            Color.Transparent
                        ),
                        center = Offset(size.width * 0.2f, 0f),
                        radius = size.width * 0.9f
                    )
                )
                // Subtle indigo glow — top-right
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            WrIndigoDim.copy(alpha = 0.05f),
                            Color.Transparent
                        ),
                        center = Offset(size.width * 0.85f, size.height * 0.15f),
                        radius = size.width * 0.6f
                    )
                )
                // Deep bottom fade for depth
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            WrSurface.copy(alpha = 0.5f)
                        ),
                        startY = size.height * 0.7f,
                        endY = size.height
                    )
                )
            }
            .navigationBarsPadding()
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Command Center Header
            CommandHeader(
                selectedTab = state.selectedTab,
                onBack = {
                    if (!navController.popBackStack(Screens.DashboardScreen.route, false)) {
                        navController.popBackStack()
                    }
                },
                onTabSelected = { tab ->
                    coroutineScope.launch { pagerState.animateScrollToPage(tab.ordinal) }
                }
            )

            // Swipeable pager content
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
                beyondViewportPageCount = 1
            ) { page ->
                when (page) {
                    0 -> DiscoveryTab(
                        state = state,
                        viewModel = viewModel,
                        navController = navController,
                        onShowReport = { candidate ->
                            reportSheetCandidate = candidate
                            if (!state.candidateReports.containsKey(candidate.transfermarktUrl) &&
                                !state.loadingReportUrls.contains(candidate.transfermarktUrl)
                            ) {
                                viewModel.toggleCandidateExpanded(candidate.transfermarktUrl)
                            }
                        }
                    )
                    1 -> AgentsTab(state = state, viewModel = viewModel, navController = navController)
                    2 -> AiScoutContentBody(navController = navController, showTopBar = false)
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMMAND HEADER — Gradient top bar with integrated tab selector
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun CommandHeader(
    selectedTab: WarRoomTab,
    onBack: () -> Unit,
    onTabSelected: (WarRoomTab) -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "header_pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                val gradient = Brush.verticalGradient(
                    colors = listOf(
                        WrIndigoDim.copy(alpha = 0.30f),
                        WrIndigo.copy(alpha = 0.08f),
                        HomeDarkBackground
                    )
                )
                drawRect(gradient)
                // Glowing bottom edge line
                drawLine(
                    brush = Brush.horizontalGradient(
                        listOf(
                            Color.Transparent,
                            WrIndigo.copy(alpha = 0.35f),
                            WrIndigoLight.copy(alpha = 0.20f),
                            Color.Transparent
                        )
                    ),
                    start = Offset(0f, size.height),
                    end = Offset(size.width, size.height),
                    strokeWidth = 1.5.dp.toPx()
                )
            }
    ) {
        // Top row: back + title + live indicator
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 4.dp, end = 16.dp, top = 24.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                    tint = WrIndigoLight,
                    modifier = Modifier.size(22.dp)
                )
            }

            Text(
                text = stringResource(R.string.war_room_title),
                style = boldTextStyle(HomeTextPrimary, 22.sp),
                letterSpacing = (-0.3).sp
            )

            Spacer(Modifier.weight(1f))

            // Live pulse dot
            Box(contentAlignment = Alignment.Center) {
                Canvas(modifier = Modifier.size(12.dp)) {
                    // Outer glow ring
                    drawCircle(
                        color = WrScoreExcellent.copy(alpha = pulseAlpha * 0.3f),
                        radius = size.minDimension / 2
                    )
                    // Mid ring
                    drawCircle(
                        color = WrScoreExcellent.copy(alpha = pulseAlpha * 0.6f),
                        radius = size.minDimension / 3f
                    )
                    // Core dot
                    drawCircle(
                        color = WrScoreExcellent,
                        radius = size.minDimension / 5f
                    )
                }
            }
            Spacer(Modifier.width(6.dp))
            Text(
                "LIVE",
                style = boldTextStyle(WrScoreExcellent, 10.sp),
                letterSpacing = 1.5.sp
            )
        }

        // Segmented tab selector
        SegmentedTabBar(selectedTab = selectedTab, onTabSelected = onTabSelected)

        Spacer(Modifier.height(4.dp))
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SEGMENTED TAB BAR — Pill-style tab selector
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun SegmentedTabBar(selectedTab: WarRoomTab, onTabSelected: (WarRoomTab) -> Unit) {
    val tabs = listOf(
        WarRoomTab.DISCOVERY to R.string.war_room_tab_discovery,
        WarRoomTab.AGENTS to R.string.war_room_tab_agents,
        WarRoomTab.AI_SCOUT to R.string.war_room_tab_ai_scout
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(WrSurface)
            .border(1.dp, WrSurfaceBorder.copy(alpha = 0.6f), RoundedCornerShape(14.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        tabs.forEach { (tab, labelRes) ->
            val isSelected = selectedTab == tab
            val bgColor by animateColorAsState(
                targetValue = if (isSelected) WrIndigo.copy(alpha = 0.30f) else Color.Transparent,
                label = "tab_bg"
            )
            val textColor by animateColorAsState(
                targetValue = if (isSelected) WrIndigoLight else HomeTextSecondary.copy(alpha = 0.7f),
                label = "tab_text"
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(11.dp))
                    .then(
                        if (isSelected) Modifier
                            .background(
                                Brush.verticalGradient(
                                    listOf(
                                        WrIndigo.copy(alpha = 0.25f),
                                        WrIndigo.copy(alpha = 0.12f)
                                    )
                                )
                            )
                            .border(1.dp, WrIndigoBorder, RoundedCornerShape(11.dp))
                        else Modifier.background(bgColor)
                    )
                    .clickable { onTabSelected(tab) }
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(labelRes),
                    style = boldTextStyle(textColor, 13.sp),
                    letterSpacing = if (isSelected) 0.3.sp else 0.sp
                )
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DISCOVERY TAB
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun DiscoveryTab(
    state: WarRoomUiState,
    viewModel: IWarRoomViewModel,
    navController: NavController,
    onShowReport: (DiscoveryCandidate) -> Unit
) {
    val context = LocalContext.current
    val shortlistRepository: ShortlistRepository = koinInject()
    val playersRepository: IPlayersRepository = koinInject()
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
    val rosterPlayers by playersRepository.playersFlow().collectAsState(initial = emptyList())
    val rosterIds = remember(rosterPlayers) {
        rosterPlayers.mapNotNull { extractPlayerIdFromUrl(it.tmProfile ?: "") }.toSet()
    }
    val shortlistIds = remember(shortlistUrls) {
        shortlistUrls.mapNotNull { extractPlayerIdFromUrl(it) }.toSet()
    }
    var justAddedUrls by remember { mutableStateOf<Set<String>>(emptySet()) }
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsState(initial = emptySet())
    val coroutineScope = rememberCoroutineScope()

    val filteredCandidates = (if (state.selectedSourceFilter == "all") {
        state.candidates
    } else {
        state.candidates.filter { it.source == state.selectedSourceFilter }
    }).filter { candidate ->
        val id = extractPlayerIdFromUrl(candidate.transfermarktUrl)
        id == null || (id !in rosterIds && id !in shortlistIds)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        // ── Hero section: AI discovery intelligence banner ──
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                WrIndigo.copy(alpha = 0.12f),
                                WrIndigoDim.copy(alpha = 0.06f),
                                WrSurfaceElevated
                            )
                        )
                    )
                    .drawBehind {
                        // Decorative radial glow — mimics web radar decoration
                        drawCircle(
                            color = WrIndigo.copy(alpha = 0.04f),
                            radius = size.width * 0.5f,
                            center = Offset(size.width * 0.8f, size.height * 0.2f)
                        )
                        drawCircle(
                            color = WrIndigo.copy(alpha = 0.02f),
                            radius = size.width * 0.3f,
                            center = Offset(size.width * 0.8f, size.height * 0.2f)
                        )
                    }
                    .border(1.dp, WrIndigoBorder.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
                    .padding(16.dp)
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(
                                            WrIndigo.copy(alpha = 0.25f),
                                            WrIndigoDim.copy(alpha = 0.15f)
                                        )
                                    )
                                )
                                .border(1.dp, WrIndigoBorder, RoundedCornerShape(10.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("⚡", style = boldTextStyle(WrIndigoLight, 16.sp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                stringResource(R.string.war_room_discovery_title),
                                style = boldTextStyle(HomeTextPrimary, 16.sp),
                                letterSpacing = (-0.2).sp
                            )
                            Text(
                                stringResource(R.string.war_room_discovery_subtitle),
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                maxLines = 2,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }
            }
        }

        // Status bar
        item {
            DiscoveryStatusBar(
                count = state.discoveryCount,
                updatedAt = state.discoveryUpdatedAt,
                onRefresh = { viewModel.loadDiscovery() }
            )
        }

        // Filter chips
        item {
            DiscoveryFilters(
                selected = state.selectedSourceFilter,
                onSelect = { viewModel.setSourceFilter(it) }
            )
        }

        // Loading
        if (state.discoveryLoading) {
            item { LoadingState(color = WrIndigo) }
        }

        // Error
        state.discoveryError?.let { error ->
            item {
                ErrorBanner(message = error, onRetry = { viewModel.loadDiscovery() })
            }
        }

        // Player cards
        items(filteredCandidates, key = { it.transfermarktUrl.ifBlank { it.name } }) { candidate ->
            val tmUrl = candidate.transfermarktUrl
            val isInShortlist = tmUrl.isNotBlank() && (tmUrl in shortlistUrls || tmUrl in justAddedUrls)
            val isShortlistPending = tmUrl in shortlistPendingUrls
            DiscoveryPlayerCard(
                candidate = candidate,
                isInShortlist = isInShortlist,
                isShortlistPending = isShortlistPending,
                onShowReport = { onShowReport(candidate) },
                onAddToShortlist = if (tmUrl.isNotBlank()) {
                    {
                        coroutineScope.launch {
                            val inList = tmUrl in shortlistUrls || tmUrl in justAddedUrls
                            if (inList) {
                                shortlistRepository.removeFromShortlist(tmUrl)
                                justAddedUrls = justAddedUrls - tmUrl
                            } else {
                                when (shortlistRepository.addToShortlistFromForm(
                                    tmProfileUrl = tmUrl,
                                    playerName = candidate.name,
                                    playerPosition = candidate.position,
                                    playerAge = candidate.age.toString(),
                                    playerNationality = candidate.nationality,
                                    clubJoinedName = candidate.club,
                                    marketValue = candidate.marketValue,
                                    playerImage = candidate.imageUrl
                                )) {
                                    is ShortlistRepository.AddToShortlistResult.Added -> {
                                        justAddedUrls = justAddedUrls + tmUrl
                                        ToastManager.showSuccess(context.getString(R.string.shortlist_player_added_toast, candidate.name))
                                    }
                                    is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist ->
                                        ToastManager.showInfo(context.getString(R.string.add_player_already_in_shortlist))
                                    is ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                        ToastManager.showInfo(context.getString(R.string.add_player_already_in_roster))
                                }
                            }
                        }
                    }
                } else null,
                onOpenTm = {
                    if (tmUrl.isNotBlank()) {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(tmUrl)))
                    }
                }
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DISCOVERY STATUS BAR
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun DiscoveryStatusBar(count: Int, updatedAt: String, onRefresh: () -> Unit) {
    val formattedDate = if (updatedAt.isNotBlank()) {
        val ts = updatedAt.toLongOrNull()
        if (ts != null) {
            val sdf = SimpleDateFormat("dd/MM HH:mm", Locale.getDefault())
            sdf.format(Date(ts))
        } else updatedAt
    } else ""

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(WrSurfaceElevated.copy(alpha = 0.6f))
            .border(1.dp, WrSurfaceBorder.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Player count badge
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(
                    Brush.horizontalGradient(
                        listOf(WrIndigoBg, WrIndigo.copy(alpha = 0.04f))
                    )
                )
                .border(1.dp, WrIndigoBorder.copy(alpha = 0.8f), RoundedCornerShape(12.dp))
                .padding(horizontal = 14.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("$count", style = boldTextStyle(WrIndigoLight, 14.sp))
            Spacer(Modifier.width(4.dp))
            Text(
                stringResource(R.string.war_room_discovery_title).lowercase(),
                style = regularTextStyle(HomeTextSecondary, 11.sp)
            )
        }

        if (formattedDate.isNotBlank()) {
            Spacer(Modifier.width(8.dp))
            Text(formattedDate, style = regularTextStyle(HomeTextSecondary, 11.sp))
        }

        Spacer(Modifier.weight(1f))

        IconButton(onClick = onRefresh, modifier = Modifier.size(40.dp)) {
            Icon(
                Icons.Default.Refresh,
                contentDescription = stringResource(R.string.war_room_refresh),
                tint = HomeTextSecondary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DISCOVERY FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun DiscoveryFilters(selected: String, onSelect: (String) -> Unit) {
    Column(modifier = Modifier.padding(bottom = 4.dp)) {
        // Subtle section divider line
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 4.dp)
                .height(1.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Color.Transparent,
                            WrSurfaceBorder.copy(alpha = 0.4f),
                            WrIndigo.copy(alpha = 0.15f),
                            WrSurfaceBorder.copy(alpha = 0.4f),
                            Color.Transparent
                        )
                    )
                )
        )

        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(vertical = 6.dp)
        ) {
        val filters = listOf(
            "all" to R.string.war_room_filter_all,
            "request_match" to R.string.war_room_filter_requests,
            "hidden_gem" to R.string.war_room_filter_gems
        )
        items(filters, key = { it.first }) { (key, labelRes) ->
            val isActive = selected == key
            val (accentColor, bgColor) = when (key) {
                "request_match" -> WrMatch to WrMatchBg
                "hidden_gem" -> WrGem to WrGemBg
                else -> WrIndigo to WrIndigoBg
            }

            val displayBg by animateColorAsState(
                if (isActive) bgColor else Color.Transparent, label = "filter_bg"
            )
            val displayBorder by animateColorAsState(
                if (isActive) accentColor.copy(alpha = 0.4f) else WrSurfaceBorder, label = "filter_border"
            )
            val displayText by animateColorAsState(
                if (isActive) accentColor else HomeTextSecondary, label = "filter_text"
            )

            Text(
                text = stringResource(labelRes),
                style = boldTextStyle(displayText, 12.sp),
                letterSpacing = 0.2.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(22.dp))
                    .background(displayBg)
                    .border(1.dp, displayBorder, RoundedCornerShape(22.dp))
                    .clickable { onSelect(key) }
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            )
        }
        }

        // Section divider before player cards
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 2.dp)
                .height(1.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Color.Transparent,
                            WrSurfaceBorder.copy(alpha = 0.3f),
                            Color.Transparent
                        )
                    )
                )
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DISCOVERY PLAYER CARD — Premium hero layout with animated score ring + glow
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DiscoveryPlayerCard(
    candidate: DiscoveryCandidate,
    isInShortlist: Boolean,
    isShortlistPending: Boolean,
    onShowReport: () -> Unit,
    onAddToShortlist: (() -> Unit)?,
    onOpenTm: () -> Unit
) {
    val context = LocalContext.current
    val sourceAccent = when (candidate.source) {
        "request_match" -> WrMatch
        "hidden_gem" -> WrGem
        "agent_pick" -> WrAgent
        else -> WrIndigo
    }
    val matchScore = candidate.matchScore ?: 0

    // Animated score sweep
    val animatedSweep by animateFloatAsState(
        targetValue = matchScore * 3.6f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "score_sweep"
    )

    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(WrSurfaceElevated)
            .drawBehind {
                // Radial glow from source accent at top-left
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            sourceAccent.copy(alpha = 0.09f),
                            Color.Transparent
                        ),
                        center = Offset(0f, 0f),
                        radius = size.width * 0.7f
                    )
                )
                // Subtle bottom edge highlight
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            WrSurfaceBorder.copy(alpha = 0.15f)
                        ),
                        startY = size.height * 0.85f,
                        endY = size.height
                    )
                )
            }
            .border(1.dp, sourceAccent.copy(alpha = 0.15f), RoundedCornerShape(20.dp))
    ) {
        // Source accent strip at top — gradient fade
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.5.dp)
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            sourceAccent,
                            sourceAccent.copy(alpha = 0.6f),
                            sourceAccent.copy(alpha = 0.15f),
                            Color.Transparent
                        )
                    )
                )
        )

        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                // Player image with enhanced score ring + outer glow
                Box(contentAlignment = Alignment.Center) {
                    if (matchScore > 0) {
                        val ringColor = scoreColor(matchScore)
                        Canvas(modifier = Modifier.size(76.dp)) {
                            // Outer glow ring
                            drawArc(
                                color = ringColor.copy(alpha = 0.08f),
                                startAngle = 0f,
                                sweepAngle = 360f,
                                useCenter = false,
                                style = Stroke(width = 12.dp.toPx())
                            )
                            // Background track
                            drawArc(
                                color = ringColor.copy(alpha = 0.08f),
                                startAngle = -90f,
                                sweepAngle = 360f,
                                useCenter = false,
                                style = Stroke(width = 3.5.dp.toPx(), cap = StrokeCap.Round)
                            )
                            // Animated score arc
                            drawArc(
                                color = ringColor,
                                startAngle = -90f,
                                sweepAngle = animatedSweep,
                                useCenter = false,
                                style = Stroke(width = 3.5.dp.toPx(), cap = StrokeCap.Round)
                            )
                        }
                    }

                    SubcomposeAsyncImage(
                        model = getPlayerImageUrl(candidate.imageUrl, candidate.transfermarktUrl),
                        contentDescription = candidate.name,
                        modifier = Modifier
                            .size(58.dp)
                            .clip(CircleShape),
                        contentScale = ContentScale.Crop,
                        loading = { PlayerInitials(candidate.name, 58.dp) },
                        error = { PlayerInitials(candidate.name, 58.dp) }
                    )

                    // Score label badge
                    if (matchScore > 0) {
                        val sColor = scoreColor(matchScore)
                        Text(
                            text = "$matchScore",
                            style = boldTextStyle(sColor, 9.sp),
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .offset(x = 2.dp, y = 2.dp)
                                .clip(CircleShape)
                                .background(WrSurfaceElevated)
                                .border(1.dp, sColor.copy(alpha = 0.5f), CircleShape)
                                .padding(horizontal = 5.dp, vertical = 2.dp)
                        )
                    }
                }

                Spacer(Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = candidate.name,
                        style = boldTextStyle(HomeTextPrimary, 17.sp),
                        letterSpacing = (-0.2).sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Spacer(Modifier.height(6.dp))

                    // Position + Age + Value
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PositionChip(candidate.position)
                        Spacer(Modifier.width(8.dp))
                        Text("${candidate.age}", style = boldTextStyle(HomeTextSecondary, 13.sp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            candidate.marketValue,
                            style = boldTextStyle(WrIndigoLight, 12.sp)
                        )
                    }

                    Spacer(Modifier.height(5.dp))

                    // Club + Nationality
                    Text(
                        text = buildString {
                            append(candidate.club)
                            if (candidate.nationality.isNotBlank()) {
                                append(" · ")
                                append(translateNationalityDisplay(candidate.nationality, context))
                            }
                        },
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // Source badge + Stats
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                SourceTag(source = candidate.source, label = candidate.sourceLabel)

                if (candidate.goalsPerNinety != null) {
                    StatChip("G/90", String.format("%.2f", candidate.goalsPerNinety))
                }
                if (candidate.assistsPerNinety != null) {
                    StatChip("A/90", String.format("%.2f", candidate.assistsPerNinety))
                }
                if (candidate.fmPotentialAbility != null || candidate.fmCurrentAbility != null) {
                    val ca = candidate.fmCurrentAbility?.toString() ?: "?"
                    val pa = candidate.fmPotentialAbility?.toString() ?: "?"
                    StatChip("FM", "$ca\u200E→\u200E$pa")
                }
            }

            // Hidden gem reason — enhanced
            candidate.hiddenGemReason?.let { reason ->
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            Brush.horizontalGradient(
                                listOf(
                                    WrGem.copy(alpha = 0.10f),
                                    WrGem.copy(alpha = 0.04f)
                                )
                            )
                        )
                        .border(1.dp, WrGem.copy(alpha = 0.20f), RoundedCornerShape(14.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Text("💎", style = regularTextStyle(HomeTextPrimary, 15.sp))
                    Spacer(Modifier.width(8.dp))
                    Text(reason, style = regularTextStyle(HomeTextPrimary, 12.sp), lineHeight = 18.sp)
                }
            }

            // Scout narrative preview
            candidate.scoutNarrative?.let { narrative ->
                if (candidate.hiddenGemReason == null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = narrative,
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        lineHeight = 17.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Action bar
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                onAddToShortlist?.let { onAdd ->
                    ShortlistPillButton(
                        state = shortlistPillState(isInShortlist, isShortlistPending),
                        onClick = { onAdd() },
                    )
                }

                ActionPill(
                    icon = {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, null, tint = HomeBlueAccent, modifier = Modifier.size(16.dp))
                    },
                    label = "TM",
                    labelColor = HomeBlueAccent,
                    onClick = onOpenTm
                )

                Spacer(Modifier.weight(1f))

                // Report button — prominent gradient CTA
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            Brush.horizontalGradient(
                                listOf(WrIndigo.copy(alpha = 0.40f), WrIndigoDim.copy(alpha = 0.22f))
                            )
                        )
                        .border(1.dp, WrIndigoBorder, RoundedCornerShape(14.dp))
                        .clickable { onShowReport() }
                        .padding(horizontal = 20.dp, vertical = 11.dp)
                ) {
                    Text(
                        "🧠 ${stringResource(R.string.war_room_view_report)}",
                        style = boldTextStyle(WrIndigoLight, 13.sp)
                    )
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  REPORT BOTTOM SHEET
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReportBottomSheetContent(
    candidate: DiscoveryCandidate,
    report: WarRoomReportResponse?,
    isLoading: Boolean,
    onFullReport: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 40.dp)
    ) {
        // Player header
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SubcomposeAsyncImage(
                    model = getPlayerImageUrl(candidate.imageUrl, candidate.transfermarktUrl),
                    contentDescription = candidate.name,
                    modifier = Modifier.size(48.dp).clip(CircleShape),
                    contentScale = ContentScale.Crop,
                    loading = { PlayerInitials(candidate.name, 48.dp) },
                    error = { PlayerInitials(candidate.name, 48.dp) }
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(candidate.name, style = boldTextStyle(HomeTextPrimary, 16.sp))
                    Text(
                        "${candidate.position} · ${candidate.age} · ${candidate.marketValue}",
                        style = regularTextStyle(HomeTextSecondary, 12.sp)
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        if (isLoading) {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(
                            color = WrIndigo,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            stringResource(R.string.war_room_generating_report),
                            style = regularTextStyle(HomeTextSecondary, 13.sp)
                        )
                    }
                }
            }
        } else if (report != null) {
            // Recommendation
            item {
                ReportRecommendationBar(rec = report.recommendation, confidence = report.confidencePercent)
                Spacer(Modifier.height(16.dp))
            }

            // Synthesis
            item {
                ReportSection(
                    icon = "🧠",
                    title = stringResource(R.string.war_room_synthesis),
                    accentColor = WrIndigo,
                    content = report.synthesis.summary
                )
                Spacer(Modifier.height(8.dp))
            }

            // Risks & Opportunities
            if (report.synthesis.risks.isNotEmpty() || report.synthesis.opportunities.isNotEmpty()) {
                item {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        report.synthesis.risks.forEach { risk ->
                            TagChip("⚠ $risk", HomeRedAccent, HomeRedAccent.copy(alpha = 0.1f))
                        }
                        report.synthesis.opportunities.forEach { opp ->
                            TagChip("✓ $opp", HomeGreenAccent, HomeGreenAccent.copy(alpha = 0.1f))
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }

            // Agent sections
            item {
                ReportSection("📊", stringResource(R.string.war_room_stats_agent), HomeTealAccent, report.stats.analysis)
                Spacer(Modifier.height(8.dp))
                ReportSection("💰", stringResource(R.string.war_room_market_agent), HomeOrangeAccent, report.market.analysis)
                Spacer(Modifier.height(8.dp))
                ReportSection("⚽", stringResource(R.string.war_room_tactics_agent), HomeBlueAccent, report.tactics.analysis)
                Spacer(Modifier.height(16.dp))
            }

            // Full report CTA
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(
                            Brush.horizontalGradient(
                                listOf(WrIndigo.copy(alpha = 0.35f), WrIndigoDim.copy(alpha = 0.18f))
                            )
                        )
                        .border(1.dp, WrIndigoBorder, RoundedCornerShape(16.dp))
                        .clickable { onFullReport() }
                        .padding(vertical = 15.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        stringResource(R.string.war_room_full_report),
                        style = boldTextStyle(WrIndigoLight, 14.sp)
                    )
                }
            }
        } else {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(R.string.war_room_generating_report),
                        style = regularTextStyle(HomeTextSecondary, 13.sp)
                    )
                }
            }
        }
    }
}

@Composable
private fun ReportRecommendationBar(rec: String, confidence: Int) {
    val (bgColor, textColor, icon) = when (rec.uppercase()) {
        "SIGN" -> Triple(HomeGreenAccent, HomeGreenAccent, "✓")
        "MONITOR" -> Triple(HomeOrangeAccent, HomeOrangeAccent, "👁")
        "PASS" -> Triple(HomeRedAccent, HomeRedAccent, "✗")
        else -> Triple(HomeTextSecondary, HomeTextSecondary, "—")
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                Brush.horizontalGradient(
                    listOf(
                        bgColor.copy(alpha = 0.10f),
                        textColor.copy(alpha = 0.05f)
                    )
                )
            )
            .drawBehind {
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            bgColor.copy(alpha = 0.10f),
                            Color.Transparent
                        ),
                        center = Offset(0f, size.height / 2),
                        radius = size.width * 0.5f
                    )
                )
            }
            .border(1.dp, bgColor.copy(alpha = 0.25f), RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(icon, style = boldTextStyle(textColor, 18.sp))
            Spacer(Modifier.width(10.dp))
            Column {
                Text(rec.uppercase(), style = boldTextStyle(textColor, 16.sp))
                Text(
                    stringResource(R.string.war_room_recommendation),
                    style = regularTextStyle(HomeTextSecondary, 10.sp)
                )
            }
        }

        Column(horizontalAlignment = Alignment.End) {
            Text("$confidence%", style = boldTextStyle(textColor, 20.sp))
            Text(
                stringResource(R.string.war_room_confidence),
                style = regularTextStyle(HomeTextSecondary, 10.sp)
            )
        }
    }
}

@Composable
private fun ReportSection(icon: String, title: String, accentColor: Color, content: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(WrSurfaceElevated)
            .drawBehind {
                // Subtle accent glow
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            accentColor.copy(alpha = 0.04f),
                            Color.Transparent
                        ),
                        endY = size.height * 0.4f
                    )
                )
            }
            .border(1.dp, accentColor.copy(alpha = 0.10f), RoundedCornerShape(14.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawLine(
                        color = accentColor,
                        start = Offset(0f, 0f),
                        end = Offset(0f, size.height),
                        strokeWidth = 4.dp.toPx()
                    )
                }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(icon, style = regularTextStyle(HomeTextPrimary, 14.sp))
            Spacer(Modifier.width(8.dp))
            Text(title, style = boldTextStyle(accentColor, 11.sp), letterSpacing = 0.8.sp)
        }
        Text(
            text = content,
            style = regularTextStyle(HomeTextPrimary, 13.sp),
            lineHeight = 19.sp,
            modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
            maxLines = 4,
            overflow = TextOverflow.Ellipsis
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AGENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AgentsTab(state: WarRoomUiState, viewModel: IWarRoomViewModel, navController: NavController) {
    val context = LocalContext.current
    val shortlistRepository: ShortlistRepository = koinInject()
    val playersRepository: IPlayersRepository = koinInject()
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
    val rosterPlayers by playersRepository.playersFlow().collectAsState(initial = emptyList())
    val rosterIds = remember(rosterPlayers) {
        rosterPlayers.mapNotNull { extractPlayerIdFromUrl(it.tmProfile ?: "") }.toSet()
    }
    val shortlistIds = remember(shortlistUrls) {
        shortlistUrls.mapNotNull { extractPlayerIdFromUrl(it) }.toSet()
    }
    var justAddedUrls by remember { mutableStateOf<Set<String>>(emptySet()) }
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsState(initial = emptySet())
    val coroutineScope = rememberCoroutineScope()

    val filteredScoutProfiles = remember(state.scoutProfiles, rosterIds, shortlistIds) {
        state.scoutProfiles.filter { profile ->
            val id = extractPlayerIdFromUrl(profile.transfermarktUrl)
            id == null || (id !in rosterIds && id !in shortlistIds)
        }
    }
    val groupedProfiles = filteredScoutProfiles.groupBy { it.agentId to it.agentName }
    val isHebrew = Locale.getDefault().language.let { it == "iw" || it == "he" }
    val sortLocale = if (isHebrew) Locale("he") else Locale.getDefault()

    // Compute display names first so we can sort by them
    val agentDisplayNames = remember(groupedProfiles.keys.toSet(), state.scoutProfiles, isHebrew) {
        groupedProfiles.keys.associate { (agentId, agentName) ->
            val key = agentId to agentName
            val hebrewName = if (isHebrew) {
                groupedProfiles[key]?.firstOrNull()?.agentNameHe?.takeIf { it.isNotBlank() }
            } else null
            val displayName = hebrewName ?: run {
                val resKey = "war_room_agent_${agentName.lowercase().replace(" ", "_")}"
                val resId = context.resources.getIdentifier(resKey, "string", context.packageName)
                if (resId != 0) context.getString(resId) else agentName
            }
            key to displayName
        }
    }

    // Sort agents alphabetically by display name (locale-aware)
    val uniqueAgents = remember(groupedProfiles.keys.toSet(), agentDisplayNames, sortLocale) {
        groupedProfiles.keys.sortedWith(compareBy(java.text.Collator.getInstance(sortLocale)) {
            agentDisplayNames[it] ?: it.second
        })
    }

    // Visible profiles based on agent filter (client-side)
    val visibleGroupedProfiles = if (state.selectedAgentFilter == null) {
        groupedProfiles
    } else {
        groupedProfiles.filter { (key, _) -> key.first == state.selectedAgentFilter }
    }

    val maxProfilesPerAgent = 5
    val rotationPage = state.agentRotationPage
    // Slice each agent's profiles based on rotation page (wrapping)
    val paginatedProfiles = remember(visibleGroupedProfiles, rotationPage) {
        visibleGroupedProfiles.mapValues { (_, profiles) ->
            if (profiles.size <= maxProfilesPerAgent) profiles
            else {
                val totalPages = (profiles.size + maxProfilesPerAgent - 1) / maxProfilesPerAgent
                val page = rotationPage % totalPages
                val start = page * maxProfilesPerAgent
                profiles.subList(start, minOf(start + maxProfilesPerAgent, profiles.size))
            }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        // ── Hero section: Agent Network intelligence banner ──
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                WrAgent.copy(alpha = 0.10f),
                                WrSurfaceElevated,
                                WrMatch.copy(alpha = 0.04f)
                            )
                        )
                    )
                    .drawBehind {
                        // Decorative concentric rings (radar feel)
                        val cx = size.width * 0.85f
                        val cy = size.height * 0.3f
                        drawCircle(
                            color = WrAgent.copy(alpha = 0.03f),
                            radius = size.width * 0.35f,
                            center = Offset(cx, cy),
                            style = Stroke(width = 1f)
                        )
                        drawCircle(
                            color = WrAgent.copy(alpha = 0.02f),
                            radius = size.width * 0.22f,
                            center = Offset(cx, cy),
                            style = Stroke(width = 0.8f)
                        )
                        drawCircle(
                            color = WrAgent.copy(alpha = 0.04f),
                            radius = size.width * 0.10f,
                            center = Offset(cx, cy)
                        )
                    }
                    .border(1.dp, WrAgent.copy(alpha = 0.20f), RoundedCornerShape(20.dp))
                    .padding(16.dp)
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(
                                            WrAgent.copy(alpha = 0.25f),
                                            WrMatch.copy(alpha = 0.10f)
                                        )
                                    )
                                )
                                .border(1.dp, WrAgent.copy(alpha = 0.3f), RoundedCornerShape(10.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("🌐", style = boldTextStyle(WrAgent, 16.sp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                stringResource(R.string.war_room_agent_network_title),
                                style = boldTextStyle(HomeTextPrimary, 16.sp),
                                letterSpacing = (-0.2).sp
                            )
                            Text(
                                stringResource(R.string.war_room_agent_network_desc),
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                maxLines = 2,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }
            }
        }

        // Status bar
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(WrSurfaceElevated.copy(alpha = 0.6f))
                    .border(1.dp, WrSurfaceBorder.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Agent profiles count badge
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(
                            Brush.horizontalGradient(
                                listOf(WrAgentBg, WrAgent.copy(alpha = 0.05f))
                            )
                        )
                        .border(1.dp, WrAgent.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("${state.scoutProfilesTotal}", style = boldTextStyle(WrAgent, 14.sp))
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.war_room_profiles), style = regularTextStyle(HomeTextSecondary, 11.sp))
                }

                Spacer(Modifier.weight(1f))

                IconButton(
                    onClick = { viewModel.rotateAgentProfiles() },
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(Icons.Default.Refresh, null, tint = HomeTextSecondary, modifier = Modifier.size(20.dp))
                }
            }
        }

        // Agent filter carousel
        // Agent filter carousel
        item {
            // Section divider
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp, vertical = 4.dp)
                    .height(1.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                Color.Transparent,
                                WrSurfaceBorder.copy(alpha = 0.4f),
                                WrAgent.copy(alpha = 0.15f),
                                WrSurfaceBorder.copy(alpha = 0.4f),
                                Color.Transparent
                            )
                        )
                    )
            )

            AgentFilterCarousel(
                agents = uniqueAgents,
                agentDisplayNames = agentDisplayNames,
                selectedAgentId = state.selectedAgentFilter,
                onSelect = { viewModel.setAgentFilter(it) }
            )

            // Divider after filters
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp, vertical = 4.dp)
                    .height(1.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                Color.Transparent,
                                WrSurfaceBorder.copy(alpha = 0.3f),
                                Color.Transparent
                            )
                        )
                    )
            )
        }

        // Rotation hint disclaimer
        item {
            Text(
                text = stringResource(R.string.war_room_agent_rotation_hint),
                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 11.sp),
                lineHeight = 15.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 4.dp)
            )
        }

        // Loading
        if (state.agentsLoading) {
            item { LoadingState(color = WrAgent) }
        }

        // Error
        state.agentsError?.let { error ->
            item { ErrorBanner(message = error, onRetry = { viewModel.loadScoutProfiles(state.selectedAgentFilter) }) }
        }

        // Agent sections (alphabetical)
        paginatedProfiles.entries.sortedWith(compareBy(java.text.Collator.getInstance(sortLocale)) {
            agentDisplayNames[it.key] ?: it.key.second
        }).forEach { (key, profiles) ->
            val (agentId, agentName) = key
            val totalForAgent = visibleGroupedProfiles[key]?.size ?: profiles.size
            val totalPages = (totalForAgent + maxProfilesPerAgent - 1) / maxProfilesPerAgent
            val currentPage = if (totalForAgent <= maxProfilesPerAgent) 0 else rotationPage % totalPages

            item(key = "header_$agentId") {
                AgentSectionHeader(
                    name = agentDisplayNames[agentId to agentName] ?: agentName,
                    count = profiles.size,
                    totalCount = totalForAgent,
                    page = currentPage + 1,
                    totalPages = totalPages
                )
            }

            items(profiles, key = { it.id }) { profile ->
                val tmUrl = profile.transfermarktUrl
                val isInShortlist = tmUrl.isNotBlank() && (tmUrl in shortlistUrls || tmUrl in justAddedUrls)
                val isShortlistPending = tmUrl in shortlistPendingUrls
                AgentProfileCard(
                    profile = profile,
                    isInShortlist = isInShortlist,
                    isShortlistPending = isShortlistPending,
                    feedback = state.scoutFeedback[profile.id],
                    onTmClick = {
                        if (profile.transfermarktUrl.isNotBlank()) {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(profile.transfermarktUrl)))
                        }
                    },
                    onAddToShortlist = if (tmUrl.isNotBlank()) {
                        {
                            coroutineScope.launch {
                                val inList = tmUrl in shortlistUrls || tmUrl in justAddedUrls
                                if (inList) {
                                    shortlistRepository.removeFromShortlist(tmUrl)
                                    justAddedUrls = justAddedUrls - tmUrl
                                } else {
                                    when (shortlistRepository.addToShortlistFromForm(
                                        tmProfileUrl = tmUrl,
                                        playerName = profile.name,
                                        playerPosition = profile.position,
                                        playerAge = profile.age.toString(),
                                        playerNationality = profile.nationality,
                                        clubJoinedName = profile.club,
                                        marketValue = profile.marketValue,
                                        playerImage = profile.imageUrl
                                    )) {
                                        is ShortlistRepository.AddToShortlistResult.Added -> {
                                            justAddedUrls = justAddedUrls + tmUrl
                                            ToastManager.showSuccess(context.getString(R.string.shortlist_player_added_toast, profile.name))
                                        }
                                        is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist ->
                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_shortlist))
                                        is ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_roster))
                                    }
                                }
                            }
                        }
                    } else null,
                    onFeedback = { fb -> viewModel.setProfileFeedback(profile.id, fb, profile.agentId) }
                )
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AGENT FILTER CAROUSEL — Circular avatars
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AgentFilterCarousel(
    agents: List<Pair<String, String>>,
    agentDisplayNames: Map<Pair<String, String>, String>,
    selectedAgentId: String?,
    onSelect: (String?) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            AgentAvatar(
                name = stringResource(R.string.war_room_all_agents),
                initial = "⚡",
                isSelected = selectedAgentId == null,
                accentColor = WrIndigo,
                onClick = { onSelect(null) }
            )
        }

        items(agents, key = { it.first }) { (agentId, agentName) ->
            val displayName = agentDisplayNames[agentId to agentName] ?: agentName
            AgentAvatar(
                name = displayName,
                initial = displayName.take(2).uppercase(),
                isSelected = selectedAgentId == agentId,
                accentColor = WrAgent,
                onClick = { onSelect(agentId) }
            )
        }
    }
}

@Composable
private fun AgentAvatar(
    name: String,
    initial: String,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit
) {
    val borderColor by animateColorAsState(
        if (isSelected) accentColor else WrSurfaceBorder, label = "avatar_border"
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(64.dp)
            .clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(
                    if (isSelected)
                        Brush.radialGradient(
                            listOf(accentColor.copy(alpha = 0.20f), accentColor.copy(alpha = 0.08f))
                        )
                    else Brush.linearGradient(listOf(WrSurface, WrSurface))
                )
                .border(2.dp, borderColor, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initial,
                style = boldTextStyle(
                    if (isSelected) accentColor else HomeTextSecondary,
                    if (initial.length <= 2) 14.sp else 16.sp
                )
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = name,
            style = regularTextStyle(
                if (isSelected) accentColor else HomeTextSecondary,
                10.sp
            ),
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AGENT SECTION HEADER
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AgentSectionHeader(name: String, count: Int, totalCount: Int = count, page: Int = 1, totalPages: Int = 1) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Animated glow dot
            val infiniteTransition = rememberInfiniteTransition(label = "agent_dot")
            val dotAlpha by infiniteTransition.animateFloat(
                initialValue = 0.5f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(1500, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "dot_alpha"
            )
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(WrAgent.copy(alpha = dotAlpha))
            )
            Spacer(Modifier.width(10.dp))
            Text(
                name,
                style = boldTextStyle(HomeTextPrimary, 16.sp),
                letterSpacing = (-0.2).sp,
                modifier = Modifier.weight(1f)
            )
            if (totalPages > 1) {
                Text(
                    text = "$page/$totalPages",
                    style = regularTextStyle(HomeTextSecondary, 10.sp),
                    modifier = Modifier.padding(end = 6.dp)
                )
            }
            Text(
                text = "$count/$totalCount",
                style = boldTextStyle(WrAgent, 12.sp),
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(WrAgentBg)
                    .border(1.dp, WrAgent.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            )
        }
        Spacer(Modifier.height(8.dp))
        // Gradient underline
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            WrAgent.copy(alpha = 0.30f),
                            WrAgent.copy(alpha = 0.08f),
                            Color.Transparent
                        )
                    )
                )
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AGENT PROFILE CARD — Premium layout with agent accent glow
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AgentProfileCard(
    profile: ScoutProfile,
    isInShortlist: Boolean,
    isShortlistPending: Boolean,
    feedback: String?,
    onTmClick: () -> Unit,
    onAddToShortlist: (() -> Unit)?,
    onFeedback: (String) -> Unit
) {
    val context = LocalContext.current
    val matchScore = profile.matchScore
    val sColor = scoreColor(matchScore)

    // Animated score sweep
    val animatedSweep by animateFloatAsState(
        targetValue = matchScore * 3.6f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "agent_score_sweep"
    )

    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 5.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(WrSurfaceElevated)
            .drawBehind {
                // Subtle radial glow from top-right (agent accent)
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            WrAgent.copy(alpha = 0.06f),
                            Color.Transparent
                        ),
                        center = Offset(size.width, 0f),
                        radius = size.width * 0.6f
                    )
                )
                // Subtle bottom edge highlight
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            WrSurfaceBorder.copy(alpha = 0.12f)
                        ),
                        startY = size.height * 0.85f,
                        endY = size.height
                    )
                )
            }
            .border(1.dp, WrAgent.copy(alpha = 0.12f), RoundedCornerShape(20.dp))
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            // Player image with score ring
            Box(contentAlignment = Alignment.Center) {
                if (matchScore > 0) {
                    Canvas(modifier = Modifier.size(58.dp)) {
                        // Outer glow
                        drawArc(
                            color = sColor.copy(alpha = 0.06f),
                            startAngle = 0f,
                            sweepAngle = 360f,
                            useCenter = false,
                            style = Stroke(width = 8.dp.toPx())
                        )
                        // Track
                        drawArc(
                            color = sColor.copy(alpha = 0.1f),
                            startAngle = -90f,
                            sweepAngle = 360f,
                            useCenter = false,
                            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                        )
                        // Animated arc
                        drawArc(
                            color = sColor,
                            startAngle = -90f,
                            sweepAngle = animatedSweep,
                            useCenter = false,
                            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                        )
                    }
                }

                SubcomposeAsyncImage(
                    model = getPlayerImageUrl(profile.imageUrl, profile.transfermarktUrl),
                    contentDescription = profile.name,
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(12.dp)),
                    contentScale = ContentScale.Crop,
                    loading = { PlayerInitials(profile.name, 46.dp) },
                    error = { PlayerInitials(profile.name, 46.dp) }
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                // Name + score badge
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = profile.name,
                        style = boldTextStyle(HomeTextPrimary, 16.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )

                    Spacer(Modifier.width(8.dp))

                    // Score pill with animated bar
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(sColor.copy(alpha = 0.1f))
                            .border(1.dp, sColor.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            stringResource(R.string.war_room_match_score),
                            style = regularTextStyle(sColor.copy(alpha = 0.7f), 9.sp)
                        )
                        Spacer(Modifier.width(4.dp))
                        LinearProgressIndicator(
                            progress = { profile.matchScore / 100f },
                            modifier = Modifier
                                .width(36.dp)
                                .height(3.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = sColor,
                            trackColor = sColor.copy(alpha = 0.15f),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text("${profile.matchScore}", style = boldTextStyle(sColor, 13.sp))
                    }
                }

                Spacer(Modifier.height(4.dp))

                Text(
                    text = "${profile.age} · ${profile.position} · ${profile.marketValue} · ${profile.club}",
                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(Modifier.height(6.dp))

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (profile.profileTypeLabel.isNotBlank()) {
                        TagChip(profile.profileTypeLabel.uppercase(), WrAgent, WrAgentBg)
                    }
                    if (profile.nationality.isNotBlank()) {
                        TagChip(
                            translateNationalityDisplay(profile.nationality, context).uppercase(),
                            HomeBlueAccent,
                            HomeBlueAccent.copy(alpha = 0.1f)
                        )
                    }
                }

                if (profile.explanation.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = profile.explanation,
                        style = regularTextStyle(HomeTextPrimary, 12.sp),
                        lineHeight = 17.sp,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(WrSurface)
                            .border(1.dp, WrSurfaceBorder, RoundedCornerShape(10.dp))
                            .padding(10.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Actions
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            onAddToShortlist?.let { onAdd ->
                ShortlistPillButton(
                    state = shortlistPillState(isInShortlist, isShortlistPending),
                    onClick = { onAdd() },
                )
            }
            ActionPill(
                icon = {
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, null, tint = HomeBlueAccent, modifier = Modifier.size(16.dp))
                },
                label = "TM",
                labelColor = HomeBlueAccent,
                onClick = onTmClick
            )

            Spacer(Modifier.weight(1f))

            FeedbackButton(
                isActive = feedback == "up",
                activeColor = HomeGreenAccent,
                icon = Icons.Default.ThumbUp,
                onClick = { onFeedback("up") }
            )
            FeedbackButton(
                isActive = feedback == "down",
                activeColor = HomeRedAccent,
                icon = Icons.Default.ThumbDown,
                onClick = { onFeedback("down") }
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED COMPOSABLES — Design System
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerInitials(name: String, size: androidx.compose.ui.unit.Dp) {
    val initials = name.split(" ")
        .take(2)
        .mapNotNull { it.firstOrNull()?.uppercase() }
        .joinToString("")

    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(WrSurfaceBorder),
        contentAlignment = Alignment.Center
    ) {
        Text(initials, style = boldTextStyle(HomeTextSecondary, (size.value / 3.5f).sp))
    }
}

@Composable
private fun PositionChip(position: String) {
    Text(
        text = position,
        style = boldTextStyle(WrIndigoLight, 11.sp),
        letterSpacing = 0.3.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(
                Brush.horizontalGradient(
                    listOf(WrIndigoBg, WrIndigo.copy(alpha = 0.08f))
                )
            )
            .border(1.dp, WrIndigoBorder, RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

@Composable
private fun SourceTag(source: String, label: String) {
    val clubName = if (label.startsWith("Matches ")) label.removePrefix("Matches ") else ""
    val translatedLabel = when (source) {
        "request_match" -> stringResource(R.string.war_room_source_request_match, clubName.ifBlank { "" })
        "hidden_gem" -> stringResource(R.string.war_room_source_hidden_gem)
        "agent_pick" -> stringResource(R.string.war_room_source_agent_pick)
        else -> stringResource(R.string.war_room_source_discovery)
    }
    val (textColor, bgColor) = when (source) {
        "request_match" -> WrMatch to WrMatchBg
        "hidden_gem" -> WrGem to WrGemBg
        "agent_pick" -> WrAgent to WrAgentBg
        else -> WrIndigo to WrIndigoBg
    }

    Text(
        text = translatedLabel,
        style = boldTextStyle(textColor, 10.sp),
        letterSpacing = 0.4.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .padding(horizontal = 8.dp, vertical = 3.dp)
    )
}

@Composable
private fun StatChip(label: String, value: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(WrSurface)
            .border(1.dp, WrSurfaceBorder, RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = regularTextStyle(HomeTextSecondary, 10.sp))
        Spacer(Modifier.width(4.dp))
        Text(value, style = boldTextStyle(WrIndigoLight, 10.sp))
    }
}

@Composable
private fun TagChip(text: String, textColor: Color, bgColor: Color) {
    Text(
        text = text,
        style = boldTextStyle(textColor, 10.sp),
        letterSpacing = 0.3.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .padding(horizontal = 8.dp, vertical = 3.dp)
    )
}

@Composable
private fun ActionPill(
    icon: @Composable () -> Unit,
    label: String? = null,
    labelColor: Color = HomeTextSecondary,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .height(42.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(WrSurface)
            .border(1.dp, WrSurfaceBorder.copy(alpha = 0.7f), RoundedCornerShape(14.dp))
            .clickable { onClick() }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        icon()
        if (label != null) {
            Spacer(Modifier.width(5.dp))
            Text(label, style = boldTextStyle(labelColor, 12.sp))
        }
    }
}

@Composable
private fun FeedbackButton(
    isActive: Boolean,
    activeColor: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit
) {
    IconButton(onClick = onClick, modifier = Modifier.size(40.dp)) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (isActive) activeColor else HomeTextSecondary,
            modifier = Modifier.size(18.dp)
        )
    }
}

@Composable
private fun LoadingState(color: Color) {
    val infiniteTransition = rememberInfiniteTransition(label = "shimmer")
    val shimmerAlpha by infiniteTransition.animateFloat(
        initialValue = 0.25f,
        targetValue = 0.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "shimmer_alpha"
    )

    Column {
        repeat(3) { index ->
            Column(
                modifier = Modifier
                    .padding(horizontal = 16.dp, vertical = 6.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(WrSurfaceElevated)
                    .border(1.dp, color.copy(alpha = 0.06f), RoundedCornerShape(20.dp))
            ) {
                // Top accent shimmer strip
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .background(color.copy(alpha = shimmerAlpha * 0.3f))
                )

                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Circle placeholder
                        Box(
                            modifier = Modifier
                                .size(68.dp)
                                .clip(CircleShape)
                                .background(WrSurfaceBorder.copy(alpha = shimmerAlpha))
                        )
                        Spacer(Modifier.width(14.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            // Name placeholder
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(if (index % 2 == 0) 0.55f else 0.7f)
                                    .height(16.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(WrSurfaceBorder.copy(alpha = shimmerAlpha))
                            )
                            Spacer(Modifier.height(8.dp))
                            // Details placeholder
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.85f)
                                    .height(12.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(WrSurfaceBorder.copy(alpha = shimmerAlpha * 0.7f))
                            )
                            Spacer(Modifier.height(8.dp))
                            // Sub-detail placeholder
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.5f)
                                    .height(12.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(WrSurfaceBorder.copy(alpha = shimmerAlpha * 0.5f))
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    // Tag chips placeholder
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        repeat(3) {
                            Box(
                                modifier = Modifier
                                    .width(if (it == 0) 72.dp else 50.dp)
                                    .height(22.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(WrSurfaceBorder.copy(alpha = shimmerAlpha * 0.5f))
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String, onRetry: () -> Unit) {
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HomeRedAccent.copy(alpha = 0.06f))
            .drawBehind {
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            HomeRedAccent.copy(alpha = 0.06f),
                            Color.Transparent
                        ),
                        center = Offset(0f, size.height / 2),
                        radius = size.width * 0.5f
                    )
                )
            }
            .border(1.dp, HomeRedAccent.copy(alpha = 0.18f), RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(message, style = regularTextStyle(HomeRedAccent, 13.sp), modifier = Modifier.weight(1f))
        Spacer(Modifier.width(8.dp))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(
                    Brush.horizontalGradient(
                        listOf(HomeRedAccent.copy(alpha = 0.2f), HomeRedAccent.copy(alpha = 0.1f))
                    )
                )
                .border(1.dp, HomeRedAccent.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                .clickable { onRetry() }
                .padding(horizontal = 14.dp, vertical = 7.dp)
        ) {
            Text(stringResource(R.string.war_room_refresh), style = boldTextStyle(HomeRedAccent, 12.sp))
        }
    }
}