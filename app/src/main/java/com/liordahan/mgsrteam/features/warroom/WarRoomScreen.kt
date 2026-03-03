package com.liordahan.mgsrteam.features.warroom

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.localization.CountryNameTranslator
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel
import coil.compose.SubcomposeAsyncImage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Purple theme for War Room
private val WarPurple = Color(0xFFA855F7)
private val WarPurpleBg = Color(0x1AA855F7)
private val WarPurpleBorder = Color(0x40A855F7)

private const val TM_IMAGE_BASE = "https://img.a.transfermarkt.technology/portrait/medium/"
private const val TM_DEFAULT_IMAGE = "${TM_IMAGE_BASE}0.jpg"

/**
 * Translate nationality string (may contain multiple countries, e.g. "Brazil · Germany")
 * to the current app locale (e.g. Hebrew) using CountryNameTranslator.
 */
private fun translateNationalityDisplay(nationality: String, context: android.content.Context): String {
    if (nationality.isBlank()) return ""
    val parts = nationality
        .split(Regex("\\s*[·]\\s*|\\s{2,}"))  // " · " or 2+ spaces (dual nationality)
        .map { it.trim() }
        .filter { it.isNotBlank() }
    if (parts.isEmpty()) return nationality
    return parts.joinToString(" · ") { CountryNameTranslator.getDisplayName(context, it) }
}

/**
 * Derive Transfermarkt portrait URL from profileImage or transfermarktUrl.
 * Same logic as the web app's getPlayerImageUrl.
 */
private fun getPlayerImageUrl(profileImage: String?, transfermarktUrl: String): String {
    if (!profileImage.isNullOrBlank()) return profileImage.trim()
    val id = extractPlayerIdFromUrl(transfermarktUrl)
    if (id != null) return "${TM_IMAGE_BASE}${id}.jpg"
    return TM_DEFAULT_IMAGE
}

/** Extract numeric player ID from Transfermarkt URL. */
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

@Composable
fun WarRoomScreen(
    navController: NavController,
    viewModel: IWarRoomViewModel = koinViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        // Top Bar
        WarRoomTopBar(onBack = {
            if (!navController.popBackStack(Screens.DashboardScreen.route, false)) {
                navController.popBackStack()
            }
        })

        // Tab Row
        WarRoomTabBar(
            selectedTab = state.selectedTab,
            onTabSelected = { viewModel.selectTab(it) }
        )

        // Tab Content
        when (state.selectedTab) {
            WarRoomTab.DISCOVERY -> DiscoveryTab(state = state, viewModel = viewModel, navController = navController)
            WarRoomTab.AGENTS -> AgentsTab(state = state, viewModel = viewModel, navController = navController)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun WarRoomTopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(HomeDarkCard)
            .padding(start = 12.dp, end = 12.dp, top = 48.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clickWithNoRipple { onBack() },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
                tint = HomeTealAccent,
                modifier = Modifier.size(24.dp)
            )
        }
        Text(
            text = stringResource(R.string.war_room_title),
            style = boldTextStyle(HomeTextPrimary, 18.sp),
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.width(48.dp))
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB BAR
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun WarRoomTabBar(selectedTab: WarRoomTab, onTabSelected: (WarRoomTab) -> Unit) {
    TabRow(
        selectedTabIndex = if (selectedTab == WarRoomTab.DISCOVERY) 0 else 1,
        containerColor = HomeDarkCard,
        contentColor = WarPurple,
        indicator = { tabPositions ->
            TabRowDefaults.SecondaryIndicator(
                modifier = Modifier.tabIndicatorOffset(tabPositions[if (selectedTab == WarRoomTab.DISCOVERY) 0 else 1]),
                color = WarPurple,
                height = 3.dp
            )
        },
        divider = {
            Box(Modifier.fillMaxWidth().height(1.dp).background(HomeDarkCardBorder))
        }
    ) {
        Tab(
            selected = selectedTab == WarRoomTab.DISCOVERY,
            onClick = { onTabSelected(WarRoomTab.DISCOVERY) },
            text = {
                Text(
                    stringResource(R.string.war_room_tab_discovery),
                    style = boldTextStyle(
                        if (selectedTab == WarRoomTab.DISCOVERY) WarPurple else HomeTextSecondary,
                        14.sp
                    )
                )
            }
        )
        Tab(
            selected = selectedTab == WarRoomTab.AGENTS,
            onClick = { onTabSelected(WarRoomTab.AGENTS) },
            text = {
                Text(
                    stringResource(R.string.war_room_tab_agents),
                    style = boldTextStyle(
                        if (selectedTab == WarRoomTab.AGENTS) WarPurple else HomeTextSecondary,
                        14.sp
                    )
                )
            }
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DISCOVERY TAB
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DiscoveryTab(state: WarRoomUiState, viewModel: IWarRoomViewModel, navController: NavController) {
    val filteredCandidates = if (state.selectedSourceFilter == "all") {
        state.candidates
    } else {
        state.candidates.filter { it.source == state.selectedSourceFilter }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        // Hero
        item {
            Column(modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 12.dp)) {
                Text(
                    text = stringResource(R.string.war_room_discovery_title),
                    style = boldTextStyle(HomeTextPrimary, 22.sp)
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.war_room_discovery_subtitle),
                    style = regularTextStyle(HomeTextSecondary, 13.sp),
                    lineHeight = 18.sp
                )
            }
        }

        // Meta badges
        item {
            val playersCountText = stringResource(R.string.war_room_players_count, state.discoveryCount)

            // Format timestamp outside try-catch (composable calls not allowed in try-catch)
            val formattedDate = if (state.discoveryUpdatedAt.isNotBlank()) {
                val ts = state.discoveryUpdatedAt.toLongOrNull()
                if (ts != null) {
                    val sdf = SimpleDateFormat("dd/MM/yy HH:mm", Locale.getDefault())
                    sdf.format(Date(ts))
                } else state.discoveryUpdatedAt
            } else ""
            val updatedText = if (formattedDate.isNotBlank()) {
                stringResource(R.string.war_room_updated, formattedDate)
            } else ""

            FlowRow(
                modifier = Modifier.padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (updatedText.isNotBlank()) {
                    MetaBadge(text = updatedText, color = HomeTealAccent)
                }
                MetaBadge(text = playersCountText, color = WarPurple)

                // Refresh button
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(8.dp))
                        .clickable { viewModel.loadDiscovery() }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Refresh, null, tint = HomeTextSecondary, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.war_room_refresh), style = regularTextStyle(HomeTextSecondary, 11.sp))
                }
            }
        }

        // Source filters
        item {
            Spacer(Modifier.height(12.dp))
            val filterAll = stringResource(R.string.war_room_filter_all)
            val filterRequests = stringResource(R.string.war_room_filter_requests)
            val filterGems = stringResource(R.string.war_room_filter_gems)
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                val filters = listOf(
                    "all" to filterAll,
                    "request_match" to filterRequests,
                    "hidden_gem" to filterGems
                )
                items(filters) { (key, label) ->
                    SourceChip(
                        text = label,
                        isActive = state.selectedSourceFilter == key,
                        onClick = { viewModel.setSourceFilter(key) }
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        // Loading
        if (state.discoveryLoading) {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = WarPurple, strokeWidth = 3.dp)
                }
            }
        }

        // Error
        state.discoveryError?.let { error ->
            item {
                Text(error, style = regularTextStyle(HomeRedAccent, 13.sp), modifier = Modifier.padding(16.dp))
            }
        }

        // Candidate cards
        items(filteredCandidates, key = { it.transfermarktUrl.ifBlank { it.name } }) { candidate ->
            CandidateCard(
                candidate = candidate,
                isExpanded = state.expandedCandidateUrl == candidate.transfermarktUrl,
                report = state.candidateReports[candidate.transfermarktUrl],
                isReportLoading = state.loadingReportUrls.contains(candidate.transfermarktUrl),
                onToggle = { viewModel.toggleCandidateExpanded(candidate.transfermarktUrl) },
                onFullReport = {
                    navController.navigate(Screens.fullReportRoute(Uri.encode(candidate.transfermarktUrl), candidate.name)) {
                        launchSingleTop = true
                    }
                }
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CANDIDATE CARD
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CandidateCard(
    candidate: DiscoveryCandidate,
    isExpanded: Boolean,
    report: WarRoomReportResponse?,
    isReportLoading: Boolean,
    onToggle: () -> Unit,
    onFullReport: () -> Unit
) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HomeDarkCard)
            .border(
                1.dp,
                if (isExpanded) WarPurpleBorder else HomeDarkCardBorder,
                RoundedCornerShape(14.dp)
            )
            .clickable { onToggle() }
            .animateContentSize()
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            // Player image from Transfermarkt
            SubcomposeAsyncImage(
                model = getPlayerImageUrl(candidate.imageUrl, candidate.transfermarktUrl),
                contentDescription = candidate.name,
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(12.dp)),
                contentScale = ContentScale.Crop,
                loading = {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeDarkCardBorder),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = candidate.name.split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString(""),
                            style = boldTextStyle(HomeTextSecondary, 16.sp)
                        )
                    }
                },
                error = {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeDarkCardBorder),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = candidate.name.split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString(""),
                            style = boldTextStyle(HomeTextSecondary, 16.sp)
                        )
                    }
                }
            )

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                // Name
                Text(
                    text = candidate.name,
                    style = boldTextStyle(HomeTextPrimary, 15.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(Modifier.height(4.dp))

                // Meta line 1: age · position · value
                Text(
                    text = "${candidate.age} · ${candidate.position} · ${candidate.marketValue}",
                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                // Meta line 2: club · nationality
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

                Spacer(Modifier.height(6.dp))

                // Source badge (translated)
                TranslatedSourceBadge(source = candidate.source, label = candidate.sourceLabel)

                // Stats pills
                if (candidate.goalsPerNinety != null || candidate.fmCurrentAbility != null) {
                    Spacer(Modifier.height(6.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        candidate.goalsPerNinety?.let {
                            StatPill("G/90", String.format("%.2f", it))
                        }
                        candidate.assistsPerNinety?.let {
                            StatPill("A/90", String.format("%.2f", it))
                        }
                        if (candidate.fmCurrentAbility != null || candidate.fmPotentialAbility != null) {
                            val caStr = candidate.fmCurrentAbility?.toString() ?: "?"
                            val paStr = candidate.fmPotentialAbility?.toString() ?: "?"
                            StatPill("FM", "${paStr}→${caStr}")
                        }
                    }
                }

                // Hidden gem reason
                candidate.hiddenGemReason?.let { reason ->
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "💎 $reason",
                        style = regularTextStyle(HomeOrangeAccent, 12.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(HomeOrangeAccent.copy(alpha = 0.06f))
                            .border(1.dp, HomeOrangeAccent.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                            .padding(8.dp),
                        lineHeight = 16.sp
                    )
                }
            }
        }

        // Expand hint (single report link)
        Spacer(Modifier.height(8.dp))
        Text(
            text = if (isExpanded) "${stringResource(R.string.war_room_view_report)} ▲" else "${stringResource(R.string.war_room_view_report)} ▼",
            style = regularTextStyle(WarPurple, 12.sp),
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.End
        )

        // Expanded report content
        AnimatedVisibility(
            visible = isExpanded,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            Column {
                Spacer(Modifier.height(14.dp))
                Box(Modifier.fillMaxWidth().height(1.dp).background(HomeDarkCardBorder))
                Spacer(Modifier.height(14.dp))

                if (isReportLoading) {
                    Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = WarPurple, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                            Spacer(Modifier.height(8.dp))
                            Text(stringResource(R.string.war_room_generating_report), style = regularTextStyle(HomeTextSecondary, 12.sp))
                        }
                    }
                } else if (report != null) {
                    // Synthesis box
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(WarPurpleBg)
                            .border(1.dp, WarPurpleBorder, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    ) {
                        Text("🧠 " + stringResource(R.string.war_room_synthesis), style = boldTextStyle(WarPurple, 11.sp), letterSpacing = 0.5.sp)
                        Spacer(Modifier.height(6.dp))
                        Text(report.synthesis.summary, style = regularTextStyle(HomeTextPrimary, 13.sp), lineHeight = 18.sp)

                        Spacer(Modifier.height(8.dp))
                        RecommendationBadge(rec = report.recommendation, confidence = report.confidencePercent)

                        if (report.synthesis.risks.isNotEmpty() || report.synthesis.opportunities.isNotEmpty()) {
                            Spacer(Modifier.height(10.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                report.synthesis.risks.forEach { risk ->
                                    RiskPill(text = "⚠ $risk")
                                }
                                report.synthesis.opportunities.forEach { opp ->
                                    OpportunityPill(text = "✓ $opp")
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    // Mini agent cards
                    AgentMiniCard("📊", stringResource(R.string.war_room_stats_agent), report.stats.analysis)
                    Spacer(Modifier.height(8.dp))
                    AgentMiniCard("💰", stringResource(R.string.war_room_market_agent), report.market.analysis)
                    Spacer(Modifier.height(8.dp))
                    AgentMiniCard("⚽", stringResource(R.string.war_room_tactics_agent), report.tactics.analysis)
                } else {
                    // No report yet — just show scout narrative if available
                    candidate.scoutNarrative?.let { narrative ->
                        Text(narrative, style = regularTextStyle(HomeTextPrimary, 13.sp), lineHeight = 18.sp)
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Action buttons
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (candidate.transfermarktUrl.isNotBlank()) {
                        SmallActionButton(
                            text = "↗ TM",
                            color = HomeBlueAccent,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(candidate.transfermarktUrl)))
                            }
                        )
                    }
                    SmallActionButton(
                        text = "⭐ " + stringResource(R.string.war_room_shortlist),
                        color = HomeTealAccent,
                        modifier = Modifier.weight(1f),
                        onClick = { /* TODO: Add to shortlist */ }
                    )
                }

                // Full report link
                if (report != null) {
                    Spacer(Modifier.height(8.dp))
                    SmallActionButton(
                        text = stringResource(R.string.war_room_full_report),
                        color = WarPurple,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = onFullReport
                    )
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AGENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AgentsTab(state: WarRoomUiState, viewModel: IWarRoomViewModel, navController: NavController) {
    val context = LocalContext.current

    // Group profiles by agent
    val groupedProfiles = state.scoutProfiles.groupBy { it.agentId to it.agentName }
    val uniqueAgents = groupedProfiles.keys.toList()

    // Agent display names via string resources (follows app locale like tabs "סוכנים", "תגליות")
    val agentDisplayNames = remember(uniqueAgents, state.scoutProfiles) {
        uniqueAgents.associate { (agentId, agentName) ->
            val key = agentId to agentName
            val resKey = "war_room_agent_${agentName.lowercase().replace(" ", "_")}"
            val resId = context.resources.getIdentifier(resKey, "string", context.packageName)
            val displayName = if (resId != 0) context.getString(resId) else agentName
            key to displayName
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        // Info banner
        item {
            Column(
                modifier = Modifier
                    .padding(16.dp, 12.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(WarPurpleBg)
                    .border(1.dp, WarPurpleBorder, RoundedCornerShape(12.dp))
                    .padding(12.dp)
            ) {
                Text(
                    "🌐 " + stringResource(R.string.war_room_agent_network_title),
                    style = boldTextStyle(WarPurple, 14.sp)
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.war_room_agent_network_desc),
                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                    lineHeight = 16.sp
                )
            }
        }

        // Meta bar
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${state.scoutProfilesTotal} " + stringResource(R.string.war_room_profiles),
                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                )
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(8.dp))
                        .clickable { viewModel.loadScoutProfiles(state.selectedAgentFilter) }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Refresh, null, tint = HomeTextSecondary, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.war_room_refresh), style = regularTextStyle(HomeTextSecondary, 11.sp))
                }
            }
        }

        // Agent filter chips
        item {
            Spacer(Modifier.height(10.dp))
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                item {
                    SourceChip(
                        text = stringResource(R.string.war_room_all_agents),
                        isActive = state.selectedAgentFilter == null,
                        onClick = { viewModel.setAgentFilter(null) }
                    )
                }
                items(uniqueAgents) { (agentId, agentName) ->
                    SourceChip(
                        text = agentDisplayNames[agentId to agentName] ?: agentName,
                        isActive = state.selectedAgentFilter == agentId,
                        onClick = { viewModel.setAgentFilter(agentId) }
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
        }

        // Loading
        if (state.agentsLoading) {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = WarPurple, strokeWidth = 3.dp)
                }
            }
        }

        // Error
        state.agentsError?.let { error ->
            item {
                Text(error, style = regularTextStyle(HomeRedAccent, 13.sp), modifier = Modifier.padding(16.dp))
            }
        }

        // Agent sections
        groupedProfiles.forEach { (key, profiles) ->
            val (agentId, agentName) = key

            // Section header
            item(key = "header_$agentId") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(agentDisplayNames[agentId to agentName] ?: agentName, style = boldTextStyle(HomeTextPrimary, 15.sp), modifier = Modifier.weight(1f))
                    Text(
                        text = "${profiles.size}",
                        style = boldTextStyle(WarPurple, 11.sp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(WarPurpleBg)
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            // Profile cards
            items(profiles, key = { it.id }) { profile ->
                ProfileCard(profile = profile, onTmClick = {
                    if (profile.transfermarktUrl.isNotBlank()) {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(profile.transfermarktUrl)))
                    }
                })
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PROFILE CARD (Agent tab)
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileCard(profile: ScoutProfile, onTmClick: () -> Unit) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 5.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            // Player image from Transfermarkt
            SubcomposeAsyncImage(
                model = getPlayerImageUrl(profile.imageUrl, profile.transfermarktUrl),
                contentDescription = profile.name,
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp)),
                contentScale = ContentScale.Crop,
                loading = {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeDarkCardBorder),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = profile.name.split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString(""),
                            style = boldTextStyle(HomeTextSecondary, 14.sp)
                        )
                    }
                },
                error = {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeDarkCardBorder),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = profile.name.split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString(""),
                            style = boldTextStyle(HomeTextSecondary, 14.sp)
                        )
                    }
                }
            )

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                // Name + score
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = profile.name,
                        style = boldTextStyle(HomeTextPrimary, 14.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )

                    Spacer(Modifier.width(8.dp))

                    // Score bar + value
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LinearProgressIndicator(
                            progress = { profile.matchScore / 100f },
                            modifier = Modifier
                                .width(60.dp)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = HomeTealAccent,
                            trackColor = HomeDarkCardBorder,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "${profile.matchScore}",
                            style = boldTextStyle(HomeTealAccent, 11.sp)
                        )
                    }
                }

                Spacer(Modifier.height(2.dp))

                // Meta
                Text(
                    text = buildString {
                        append(profile.age)
                        append(" · ")
                        append(profile.position)
                        append(" · ")
                        append(profile.marketValue)
                        append(" · ")
                        append(profile.club)
                    },
                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                )

                Spacer(Modifier.height(6.dp))

                // Type badge
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (profile.profileTypeLabel.isNotBlank()) {
                        TypeBadge(text = profile.profileTypeLabel, color = WarPurple)
                    }
                    if (profile.nationality.isNotBlank()) {
                        TypeBadge(text = translateNationalityDisplay(profile.nationality, context), color = HomeBlueAccent)
                    }
                }

                // Explanation
                if (profile.explanation.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = profile.explanation,
                        style = regularTextStyle(HomeTextPrimary, 12.sp),
                        lineHeight = 16.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(HomeDarkCardBorder.copy(alpha = 0.5f))
                            .padding(8.dp)
                    )
                }
            }
        }

        // Actions
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SmallActionButton(text = "↗ TM", color = HomeBlueAccent, onClick = onTmClick)
            SmallActionButton(text = "⭐ " + stringResource(R.string.war_room_shortlist), color = HomeTealAccent, onClick = { })
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.ThumbUp, null, tint = HomeTextSecondary, modifier = Modifier.size(16.dp))
            }
            IconButton(onClick = { }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.ThumbDown, null, tint = HomeTextSecondary, modifier = Modifier.size(16.dp))
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED COMPOSABLES
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun MetaBadge(text: String, color: Color) {
    Text(
        text = text,
        style = regularTextStyle(color, 11.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

@Composable
private fun SourceChip(text: String, isActive: Boolean, onClick: () -> Unit) {
    Text(
        text = text,
        style = boldTextStyle(if (isActive) WarPurple else HomeTextSecondary, 12.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (isActive) WarPurpleBg else HomeDarkCard)
            .border(1.dp, if (isActive) WarPurpleBorder else HomeDarkCardBorder, RoundedCornerShape(10.dp))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 7.dp)
    )
}

@Composable
private fun SourceBadge(source: String, label: String) {
    val (bgColor, textColor) = when (source) {
        "request_match" -> HomeTealAccent.copy(alpha = 0.2f) to HomeTealAccent
        "hidden_gem" -> HomeOrangeAccent.copy(alpha = 0.2f) to HomeOrangeAccent
        "agent_pick" -> WarPurple.copy(alpha = 0.15f) to WarPurple
        else -> WarPurple.copy(alpha = 0.15f) to WarPurple
    }

    Text(
        text = label.ifBlank { source.replace("_", " ").uppercase() },
        style = boldTextStyle(textColor, 10.sp),
        letterSpacing = 0.5.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor)
            .padding(horizontal = 8.dp, vertical = 2.dp)
    )
}

@Composable
private fun TranslatedSourceBadge(source: String, label: String) {
    // Extract the club name from "Matches ClubName" if present
    val clubName = if (label.startsWith("Matches ")) label.removePrefix("Matches ") else ""

    val translatedLabel = when (source) {
        "request_match" -> stringResource(R.string.war_room_source_request_match, clubName.ifBlank { "" })
        "hidden_gem" -> stringResource(R.string.war_room_source_hidden_gem)
        "agent_pick" -> stringResource(R.string.war_room_source_agent_pick)
        else -> stringResource(R.string.war_room_source_discovery)
    }

    SourceBadge(source = source, label = translatedLabel)
}

@Composable
private fun StatPill(label: String, value: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(HomeDarkCardBorder.copy(alpha = 0.8f))
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(label, style = regularTextStyle(HomeTextSecondary, 11.sp))
        Spacer(Modifier.width(4.dp))
        Text(value, style = boldTextStyle(HomeTextPrimary, 11.sp))
    }
}

@Composable
private fun RecommendationBadge(rec: String, confidence: Int) {
    val (bgColor, textColor) = when (rec.uppercase()) {
        "SIGN" -> HomeGreenAccent.copy(alpha = 0.15f) to HomeGreenAccent
        "MONITOR" -> HomeOrangeAccent.copy(alpha = 0.15f) to HomeOrangeAccent
        "PASS" -> HomeRedAccent.copy(alpha = 0.15f) to HomeRedAccent
        else -> HomeTextSecondary.copy(alpha = 0.15f) to HomeTextSecondary
    }

    Text(
        text = "${if (rec.uppercase() == "SIGN") "✓" else if (rec.uppercase() == "PASS") "✗" else "👁"} $rec — ${confidence}%",
        style = boldTextStyle(textColor, 13.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .padding(horizontal = 12.dp, vertical = 6.dp)
    )
}

@Composable
private fun RiskPill(text: String) {
    Text(
        text = text,
        style = regularTextStyle(HomeRedAccent, 11.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(HomeRedAccent.copy(alpha = 0.1f))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    )
}

@Composable
private fun OpportunityPill(text: String) {
    Text(
        text = text,
        style = regularTextStyle(HomeGreenAccent, 11.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(HomeGreenAccent.copy(alpha = 0.1f))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    )
}

@Composable
private fun TypeBadge(text: String, color: Color) {
    Text(
        text = text.uppercase(),
        style = boldTextStyle(color, 10.sp),
        letterSpacing = 0.4.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(color.copy(alpha = 0.2f))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    )
}

@Composable
private fun AgentMiniCard(icon: String, title: String, content: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(HomeDarkBackground)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
            .padding(10.dp)
    ) {
        Text("$icon $title", style = boldTextStyle(HomeTextSecondary, 11.sp), letterSpacing = 0.4.sp)
        Spacer(Modifier.height(4.dp))
        Text(content, style = regularTextStyle(HomeTextPrimary, 12.sp), lineHeight = 16.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun SmallActionButton(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Text(
        text = text,
        style = boldTextStyle(color, 12.sp),
        textAlign = TextAlign.Center,
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.12f))
            .border(1.dp, color.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 6.dp)
    )
}
