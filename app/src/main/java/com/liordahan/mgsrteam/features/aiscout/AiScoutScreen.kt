package com.liordahan.mgsrteam.features.aiscout

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.ui.components.ToastManager
import android.Manifest
import android.content.pm.PackageManager
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.core.content.ContextCompat
import com.liordahan.mgsrteam.features.players.playerinfo.notes.VoiceNoteRecorder
import com.liordahan.mgsrteam.ui.components.RecordingWaveform
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

private val SyneFamily = FontFamily(Font(R.font.takeaway_sans_bold, FontWeight.Bold))

private enum class AiScoutTab { SCOUT, FIND_NEXT }

/**
 * AI Scout content body — tabs + content. Can be used standalone (with top bar) or embedded in War Room.
 */
@Composable
fun AiScoutContentBody(
    navController: NavController,
    viewModel: IAiScoutViewModel = koinViewModel(),
    showTopBar: Boolean = true,
    onBack: (() -> Unit)? = null
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val findNextState by viewModel.findNextState.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableStateOf(AiScoutTab.SCOUT) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        if (showTopBar) {
            AiScoutTopBar(onBack = onBack ?: { navController.popBackStack(); kotlin.Unit })
        }

        // Tab Row
        AiScoutTabBar(
            selectedTab = selectedTab,
            onTabSelected = { selectedTab = it }
        )

        // Tab Content
        when (selectedTab) {
            AiScoutTab.SCOUT -> {
                if (!state.hasSearched) {
                    AiScoutEmptyState(state = state, viewModel = viewModel)
                } else {
                    AiScoutResultsState(state = state, viewModel = viewModel)
                }
            }
            AiScoutTab.FIND_NEXT -> {
                FindNextTabContent(state = findNextState, viewModel = viewModel)
            }
        }
    }
}

@Composable
fun AiScoutScreen(
    navController: NavController,
    viewModel: IAiScoutViewModel = koinViewModel()
) {
    AiScoutContentBody(
        navController = navController,
        viewModel = viewModel,
        showTopBar = true,
        onBack = { navController.popBackStack() }
    )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB BAR
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AiScoutTabBar(selectedTab: AiScoutTab, onTabSelected: (AiScoutTab) -> Unit) {
    TabRow(
        selectedTabIndex = if (selectedTab == AiScoutTab.SCOUT) 0 else 1,
        containerColor = HomeDarkCard,
        contentColor = HomeTealAccent,
        indicator = { tabPositions ->
            TabRowDefaults.SecondaryIndicator(
                modifier = Modifier.tabIndicatorOffset(tabPositions[if (selectedTab == AiScoutTab.SCOUT) 0 else 1]),
                color = HomeTealAccent,
                height = 3.dp
            )
        },
        divider = {
            Box(Modifier.fillMaxWidth().height(1.dp).background(HomeDarkCardBorder))
        }
    ) {
        Tab(
            selected = selectedTab == AiScoutTab.SCOUT,
            onClick = { onTabSelected(AiScoutTab.SCOUT) },
            text = {
                Text(
                    stringResource(R.string.ai_scout_tab_scout),
                    style = boldTextStyle(
                        if (selectedTab == AiScoutTab.SCOUT) HomeTealAccent else HomeTextSecondary,
                        14.sp
                    )
                )
            }
        )
        Tab(
            selected = selectedTab == AiScoutTab.FIND_NEXT,
            onClick = { onTabSelected(AiScoutTab.FIND_NEXT) },
            text = {
                Text(
                    stringResource(R.string.ai_scout_tab_find_next),
                    style = boldTextStyle(
                        if (selectedTab == AiScoutTab.FIND_NEXT) HomePurpleAccent else HomeTextSecondary,
                        14.sp
                    )
                )
            }
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FIND NEXT TAB
// ═══════════════════════════════════════════════════════════════════════════════

private val FIND_NEXT_EXAMPLE_PLAYERS = listOf(
    "Mohamed Salah", "Erling Haaland", "Jude Bellingham",
    "Florian Wirtz", "Bukayo Saka", "Phil Foden", "Rodri"
)

private val VALUE_PRESETS = listOf(
    500_000 to "€500K",
    1_000_000 to "€1M",
    3_000_000 to "€3M",
    5_000_000 to "€5M",
    10_000_000 to "€10M",
    0 to "No limit"
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FindNextTabContent(state: FindNextUiState, viewModel: IAiScoutViewModel) {
    val context = LocalContext.current
    val shortlistRepository: ShortlistRepository = koinInject()
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
    var justAddedUrls by remember { mutableStateOf<Set<String>>(emptySet()) }
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsState(initial = emptySet())
    val coroutineScope = rememberCoroutineScope()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        // Compact hero
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(
                                    HomePurpleAccent.copy(alpha = 0.3f),
                                    HomeTealAccent.copy(alpha = 0.2f)
                                )
                            )
                        )
                        .border(
                            1.dp,
                            HomePurpleAccent.copy(alpha = 0.3f),
                            RoundedCornerShape(12.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text("🧠", fontSize = 22.sp)
                }
                Spacer(Modifier.width(14.dp))
                Column {
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_hero_title),
                        style = boldTextStyle(HomeTextPrimary, 18.sp)
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_hero_subtitle),
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        maxLines = 2,
                        lineHeight = 16.sp
                    )
                }
            }
        }

        // Player name input section
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        Brush.verticalGradient(
                            listOf(HomeDarkCard, HomeDarkCard.copy(alpha = 0.85f))
                        )
                    )
                    .border(1.dp, HomePurpleAccent.copy(alpha = 0.12f), RoundedCornerShape(20.dp))
                    .padding(16.dp)
            ) {
                // Section label
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("⚽", fontSize = 13.sp)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_player_label),
                        style = boldTextStyle(HomeTextPrimary, 13.sp)
                    )
                }
                Spacer(Modifier.height(10.dp))

                // Text field with search icon
                BasicTextField(
                    value = state.playerName,
                    onValueChange = { viewModel.updateFindNextPlayerName(it) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(HomeDarkBackground.copy(alpha = 0.6f))
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp))
                        .padding(horizontal = 14.dp),
                    textStyle = regularTextStyle(HomeTextPrimary, 15.sp),
                    singleLine = true,
                    decorationBox = { inner ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxSize()
                        ) {
                            Icon(
                                Icons.Default.Search,
                                contentDescription = null,
                                tint = HomeTextSecondary.copy(alpha = 0.4f),
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Box(modifier = Modifier.weight(1f)) {
                                if (state.playerName.isEmpty()) {
                                    Text(
                                        stringResource(R.string.ai_scout_find_next_placeholder),
                                        style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.5f), 14.sp)
                                    )
                                }
                                inner()
                            }
                            if (state.playerName.isNotEmpty()) {
                                Icon(
                                    Icons.Default.Clear,
                                    contentDescription = null,
                                    tint = HomeTextSecondary.copy(alpha = 0.5f),
                                    modifier = Modifier
                                        .size(18.dp)
                                        .clickable { viewModel.updateFindNextPlayerName("") }
                                )
                            }
                        }
                    }
                )

                // Example players as horizontal scroll
                Spacer(Modifier.height(10.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(FIND_NEXT_EXAMPLE_PLAYERS) { name ->
                        val isSelected = state.playerName == name
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(
                                    if (isSelected) HomePurpleAccent.copy(alpha = 0.2f)
                                    else HomeDarkBackground.copy(alpha = 0.5f)
                                )
                                .border(
                                    1.dp,
                                    if (isSelected) HomePurpleAccent.copy(alpha = 0.4f)
                                    else Color.Transparent,
                                    RoundedCornerShape(20.dp)
                                )
                                .clickable { viewModel.updateFindNextPlayerName(name) }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                name,
                                style = boldTextStyle(
                                    if (isSelected) HomePurpleAccent else HomeTextSecondary,
                                    12.sp
                                ),
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(12.dp)) }

        // Filters section (age + value)
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        Brush.verticalGradient(
                            listOf(HomeDarkCard, HomeDarkCard.copy(alpha = 0.85f))
                        )
                    )
                    .border(1.dp, HomeTealAccent.copy(alpha = 0.08f), RoundedCornerShape(20.dp))
                    .padding(16.dp)
            ) {
                // Age section
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("📅", fontSize = 13.sp)
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.ai_scout_find_next_age_max, state.ageMax),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                    // Age badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(HomePurpleAccent.copy(alpha = 0.15f))
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "≤ ${state.ageMax}",
                            style = boldTextStyle(HomePurpleAccent, 13.sp)
                        )
                    }
                }
                Slider(
                    value = state.ageMax.toFloat(),
                    onValueChange = { viewModel.updateFindNextAgeMax(it.toInt()) },
                    valueRange = 17f..27f,
                    steps = 9,
                    colors = SliderDefaults.colors(
                        thumbColor = HomePurpleAccent,
                        activeTrackColor = HomePurpleAccent.copy(alpha = 0.6f),
                        inactiveTrackColor = HomeDarkCardBorder
                    )
                )

                // Divider
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(HomeDarkCardBorder.copy(alpha = 0.5f))
                )
                Spacer(Modifier.height(14.dp))

                // Value section
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("💰", fontSize = 13.sp)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_value_max),
                        style = regularTextStyle(HomeTextSecondary, 12.sp)
                    )
                }
                Spacer(Modifier.height(10.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    VALUE_PRESETS.forEach { (value, label) ->
                        val isSelected = state.valueMax == value
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    if (isSelected) HomePurpleAccent.copy(alpha = 0.2f)
                                    else HomeDarkBackground.copy(alpha = 0.5f)
                                )
                                .border(
                                    1.dp,
                                    if (isSelected) HomePurpleAccent.copy(alpha = 0.5f)
                                    else Color.Transparent,
                                    RoundedCornerShape(12.dp)
                                )
                                .clickable { viewModel.updateFindNextValueMax(value) }
                                .padding(horizontal = 14.dp, vertical = 8.dp)
                        ) {
                            Text(
                                if (value == 0) stringResource(R.string.ai_scout_find_next_no_limit) else label,
                                style = boldTextStyle(
                                    if (isSelected) HomePurpleAccent else HomeTextPrimary,
                                    12.sp
                                )
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }

        // Search button — full width
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .height(52.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        if (!state.isSearching && state.playerName.isNotBlank())
                            Brush.horizontalGradient(
                                listOf(HomePurpleAccent, HomePurpleAccent.copy(alpha = 0.8f))
                            )
                        else Brush.horizontalGradient(
                            listOf(
                                HomePurpleAccent.copy(alpha = 0.3f),
                                HomePurpleAccent.copy(alpha = 0.2f)
                            )
                        )
                    )
                    .clickable(enabled = !state.isSearching && state.playerName.isNotBlank()) {
                        viewModel.findNextSearch()
                    },
                contentAlignment = Alignment.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (state.isSearching) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = HomeDarkBackground,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            Icons.Default.Search,
                            contentDescription = null,
                            tint = HomeDarkBackground,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_search_button),
                        style = boldTextStyle(HomeDarkBackground, 15.sp)
                    )
                }
            }
        }

        // Error
        if (state.errorMessage != null) {
            item {
                Text(
                    text = state.errorMessage!!,
                    style = regularTextStyle(Color(0xFFE53935), 13.sp),
                    modifier = Modifier.padding(16.dp)
                )
            }
        }

        // Reference player
        state.response?.referencePlayer?.let { ref ->
            item {
                Column(
                    modifier = Modifier
                        .padding(16.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(HomePurpleAccent.copy(alpha = 0.1f))
                        .border(1.dp, HomePurpleAccent.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                        .padding(12.dp)
                ) {
                    Text("⭐", fontSize = 14.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(ref.name, style = boldTextStyle(HomeTextPrimary, 16.sp))
                    Text(
                        "${shortenPosition(ref.position)} · ${ref.age} · ${ref.marketValue}",
                        style = regularTextStyle(HomeTextSecondary, 13.sp)
                    )
                    state.response?.let { r ->
                        if (r.resultCount > 0) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                stringResource(R.string.ai_scout_find_next_found_count, r.resultCount, r.totalCandidatesScanned ?: 0),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                }
            }
        }

        // Results
        state.response?.results?.let { results ->
            items(results, key = { it.url.ifBlank { it.name } }) { player ->
                val tmUrl = player.transfermarktUrl
                val profileUrl = tmUrl.ifBlank { player.url }
                FindNextPlayerCard(
                    player = player,
                    context = context,
                    profileUrl = profileUrl,
                    transfermarktUrl = tmUrl,
                    isInShortlist = tmUrl.isNotBlank() && (tmUrl in shortlistUrls || tmUrl in justAddedUrls),
                    isShortlistPending = tmUrl in shortlistPendingUrls,
                    onAddToShortlistClick = if (tmUrl.isNotBlank()) {
                        {
                            coroutineScope.launch {
                                val inList = tmUrl in shortlistUrls || tmUrl in justAddedUrls
                                if (inList) {
                                    shortlistRepository.removeFromShortlist(tmUrl)
                                    justAddedUrls = justAddedUrls - tmUrl
                                } else {
                                    when (shortlistRepository.addToShortlistFromForm(
                                        tmProfileUrl = tmUrl,
                                        playerName = player.name,
                                        playerPosition = player.position,
                                        playerAge = player.age,
                                        playerNationality = player.citizenship,
                                        clubJoinedName = player.club,
                                        marketValue = player.marketValue,
                                        playerImage = null
                                    )) {
                                        is ShortlistRepository.AddToShortlistResult.Added ->
                                            justAddedUrls = justAddedUrls + tmUrl
                                        is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist ->
                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_shortlist))
                                        is ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_roster))
                                    }
                                }
                            }
                        }
                    } else null
                )
            }
        }

        // No results
        if (state.response != null && state.response!!.results.isEmpty() && state.errorMessage == null) {
            item {
                Text(
                    text = stringResource(R.string.ai_scout_find_next_no_results),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    modifier = Modifier.padding(24.dp),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

private fun shortenPosition(pos: String): String {
    if (pos.isBlank()) return "—"
    return when {
        pos.contains("Centre-Forward") || pos.contains("Center-Forward") -> "CF"
        pos.contains("Second Striker") -> "SS"
        pos.contains("Centre-Back") || pos.contains("Center-Back") -> "CB"
        pos.contains("Left-Back") -> "LB"
        pos.contains("Right-Back") -> "RB"
        pos.contains("Defensive Midfield") -> "DM"
        pos.contains("Central Midfield") -> "CM"
        pos.contains("Attacking Midfield") -> "AM"
        pos.contains("Left Wing") || pos.contains("Left Winger") -> "LW"
        pos.contains("Right Wing") || pos.contains("Right Winger") -> "RW"
        pos.contains("Goalkeeper") -> "GK"
        else -> pos.split(" - ").lastOrNull() ?: pos
    }
}

@Composable
private fun FindNextPlayerCard(
    player: FindNextResult,
    context: android.content.Context,
    profileUrl: String,
    transfermarktUrl: String,
    isInShortlist: Boolean,
    isShortlistPending: Boolean,
    onAddToShortlistClick: (() -> Unit)?
) {
    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            MatchPercentRing(percent = player.findNextScore, size = 50)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = player.name,
                    style = boldTextStyle(HomeTextPrimary, 16.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = buildString {
                        append(player.age)
                        append(" · ")
                        append(shortenPosition(player.position))
                        append(" · ")
                        append(player.marketValue)
                        append(" · ")
                        append(player.club ?: player.league)
                    },
                    style = regularTextStyle(HomeTextSecondary, 13.sp),
                    maxLines = 2
                )
                player.scoutNarrative?.let { narrative ->
                    if (narrative.isNotBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = narrative,
                            style = regularTextStyle(HomeTextPrimary, 12.sp),
                            lineHeight = 18.sp
                        )
                    }
                } ?: player.explanation.takeIf { it.isNotBlank() }?.let { exp ->
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = exp,
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        lineHeight = 18.sp
                    )
                }

                // Action buttons: Add to shortlist + Open Transfermarkt
                if (profileUrl.isNotBlank() || onAddToShortlistClick != null) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        onAddToShortlistClick?.let { onAdd ->
                            IconButton(
                                onClick = { onAdd() },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    imageVector = if (isInShortlist) Icons.Default.Bookmark else Icons.Default.BookmarkAdd,
                                    contentDescription = if (isInShortlist) stringResource(R.string.shortlist_in_shortlist) else stringResource(R.string.shortlist_add_to_shortlist),
                                    tint = if (isInShortlist) HomeGreenAccent else HomeTextSecondary
                                )
                            }
                        }
                        if (profileUrl.isNotBlank()) {
                            TextButton(
                                onClick = {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(profileUrl)))
                                },
                                modifier = Modifier.height(36.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                                colors = ButtonDefaults.textButtonColors(contentColor = HomeTealAccent)
                            ) {
                                Icon(
                                    Icons.Default.Link,
                                    contentDescription = null,
                                    tint = HomeTealAccent,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = stringResource(R.string.shortlist_open_tm),
                                    style = regularTextStyle(HomeTealAccent, 13.sp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AiScoutTopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(HomeDarkCard)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.player_info_cd_collapse),
                tint = HomeTealAccent
            )
        }
        Text(
            text = stringResource(R.string.ai_scout_title),
            style = boldTextStyle(HomeTextPrimary, 18.sp),
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.width(48.dp)) // Balance the back button
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AiScoutEmptyState(state: AiScoutUiState, viewModel: IAiScoutViewModel) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        // Hero
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    HomeTealAccent.copy(alpha = 0.2f),
                                    HomePurpleAccent.copy(alpha = 0.15f)
                                )
                            )
                        )
                        .border(1.dp, HomeTealAccent.copy(alpha = 0.3f), RoundedCornerShape(20.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("🔍", fontSize = 28.sp)
                }
                Spacer(Modifier.height(16.dp))
                Text(
                    text = stringResource(R.string.ai_scout_hero_title),
                    style = boldTextStyle(HomeTextPrimary, 24.sp),
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.ai_scout_hero_subtitle),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    textAlign = TextAlign.Center,
                    lineHeight = 20.sp
                )
            }
        }

        // Search Box
        item {
            SearchInputBox(state = state, viewModel = viewModel)
        }

        // Error message
        if (state.errorMessage != null) {
            item {
                Text(
                    text = state.errorMessage,
                    style = regularTextStyle(Color(0xFFE53935), 13.sp),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
        }

        // Example Chips
        item {
            ExampleChipsSection(viewModel = viewModel)
        }

        // Radar illustration
        item {
            RadarIllustration()
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SEARCH INPUT BOX
// ═══════════════════════════════════════════════════════════════════════════════

private fun appendToQuery(current: String, addition: String): String {
    val trimmed = addition.trim()
    if (trimmed.isBlank()) return current
    val separator = if (current.isBlank()) "" else " "
    return (current + separator + trimmed).take(500)
}

@Composable
private fun SearchInputBox(state: AiScoutUiState, viewModel: IAiScoutViewModel) {
    val context = LocalContext.current
    val view = LocalView.current
    var isRecording by remember { mutableStateOf(false) }
    var recordingDuration by remember { mutableStateOf(0) }
    val speechRecognizer = remember { VoiceNoteRecorder.createSpeechRecognizer(context) }

    LaunchedEffect(isRecording) {
        if (!isRecording) return@LaunchedEffect
        recordingDuration = 0
        while (true) {
            delay(1000)
            recordingDuration += 1
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            val recognizer = speechRecognizer ?: return@rememberLauncherForActivityResult
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: android.os.Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { isRecording = false }
                override fun onError(error: Int) { isRecording = false }
                override fun onResults(results: android.os.Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    matches?.firstOrNull()?.takeIf { it.isNotBlank() }?.let { transcribed ->
                        viewModel.updateQuery(appendToQuery(state.query, transcribed))
                    }
                    isRecording = false
                }
                override fun onPartialResults(partialResults: android.os.Bundle?) {}
                override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
            })
            recognizer.startListening(VoiceNoteRecorder.createRecognizerIntent(context))
            isRecording = true
        }
    }

    DisposableEffect(speechRecognizer) {
        onDispose { speechRecognizer?.destroy() }
    }

    fun onRecordClick() {
        if (!VoiceNoteRecorder.isAvailable(context)) return
        if (!VoiceNoteRecorder.hasRecordAudioPermission(context)) {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        if (isRecording) {
            speechRecognizer?.stopListening()
            isRecording = false
        } else {
            val recognizer = speechRecognizer ?: return
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: android.os.Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { isRecording = false }
                override fun onError(error: Int) { isRecording = false }
                override fun onResults(results: android.os.Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    matches?.firstOrNull()?.takeIf { it.isNotBlank() }?.let { transcribed ->
                        viewModel.updateQuery(appendToQuery(state.query, transcribed))
                    }
                    isRecording = false
                }
                override fun onPartialResults(partialResults: android.os.Bundle?) {}
                override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
            })
            recognizer.startListening(VoiceNoteRecorder.createRecognizerIntent(context))
            isRecording = true
        }
    }

    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.verticalGradient(
                    listOf(HomeDarkCard, HomeDarkCard.copy(alpha = 0.9f))
                )
            )
            .border(1.5.dp, HomeTealAccent.copy(alpha = 0.15f), RoundedCornerShape(20.dp))
            .padding(16.dp)
    ) {
        // Search label
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                tint = HomeTealAccent.copy(alpha = 0.6f),
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = stringResource(R.string.ai_scout_search_hint).split(":").firstOrNull() ?: "",
                style = regularTextStyle(HomeTealAccent.copy(alpha = 0.6f), 11.sp),
                letterSpacing = 0.5.sp
            )
        }

        Spacer(Modifier.height(8.dp))

        BasicTextField(
            value = state.query,
            onValueChange = { viewModel.updateQuery(it) },
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(HomeDarkBackground.copy(alpha = 0.5f))
                .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                .padding(12.dp),
            textStyle = regularTextStyle(HomeTextPrimary, 15.sp),
            decorationBox = { innerTextField ->
                Row(modifier = Modifier.fillMaxSize(), verticalAlignment = Alignment.Top) {
                    Box(modifier = Modifier.weight(1f)) {
                        if (state.query.isEmpty()) {
                            Text(
                                text = stringResource(R.string.ai_scout_search_hint),
                                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 14.sp)
                            )
                        }
                        innerTextField()
                    }
                    if (!isRecording) {
                        IconButton(
                            onClick = { onRecordClick() },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Default.Mic,
                                contentDescription = stringResource(R.string.ai_scout_voice_hint),
                                tint = HomeTextSecondary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        )

        // Recording panel (same as add-note)
        if (isRecording) {
            Spacer(Modifier.height(12.dp))
            ScoutRecordingContent(
                durationSeconds = recordingDuration,
                onStopClick = { onRecordClick() }
            )
        }

        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Character count
            Text(
                text = "${state.query.length}/500",
                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.5f), 11.sp)
            )

            // Search button
            Row(
                modifier = Modifier
                    .height(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        if (!state.isLoading && state.query.isNotBlank()) HomeTealAccent
                        else HomeTealAccent.copy(alpha = 0.4f)
                    )
                    .clickable(enabled = !state.isLoading && state.query.isNotBlank()) {
                        viewModel.search()
                    }
                    .padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = HomeDarkBackground,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = HomeDarkBackground,
                        modifier = Modifier.size(16.dp)
                    )
                }
                Spacer(Modifier.width(6.dp))
                Text(
                    text = stringResource(R.string.ai_scout_search_button),
                    style = boldTextStyle(HomeDarkBackground, 14.sp)
                )
            }
        }
    }
}

@Composable
private fun ScoutRecordingContent(
    durationSeconds: Int,
    onStopClick: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "scout_stop_pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable<Float>(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(HomeTealAccent.copy(alpha = 0.08f))
            .border(1.dp, HomeTealAccent.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.player_info_recording),
            style = regularTextStyle(HomeTealAccent, 16.sp),
            modifier = Modifier.padding(bottom = 16.dp)
        )
        RecordingWaveform(
            barCount = 10,
            color = HomeTealAccent,
            barWidth = 6.dp,
            barHeight = 12.dp,
            modifier = Modifier.padding(vertical = 16.dp)
        )
        Text(
            text = "%d:%02d".format(durationSeconds / 60, durationSeconds % 60),
            style = boldTextStyle(HomeTextPrimary, 24.sp),
            modifier = Modifier.padding(vertical = 8.dp)
        )
        Box(
            modifier = Modifier
                .size(80.dp)
                .graphicsLayer { scaleX = pulseScale; scaleY = pulseScale }
                .clip(CircleShape)
                .background(Color(0xFFE53935).copy(alpha = 0.2f))
                .clickable(onClick = onStopClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Stop,
                contentDescription = stringResource(R.string.player_info_stop_recording),
                modifier = Modifier.size(40.dp),
                tint = Color(0xFFE53935)
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.requests_tap_to_stop),
            style = regularTextStyle(HomeTextSecondary, 14.sp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXAMPLE CHIPS
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun ExampleChipsSection(viewModel: IAiScoutViewModel) {
    // All possible examples with emojis
    val allExamples = listOf(
        "⚡" to R.string.ai_scout_example_1,
        "🎯" to R.string.ai_scout_example_2,
        "🛡️" to R.string.ai_scout_example_3,
        "🏃" to R.string.ai_scout_example_4,
        "🧤" to R.string.ai_scout_example_5,
        "🌍" to R.string.ai_scout_example_6,
        "↔️" to R.string.ai_scout_example_7,
        "💪" to R.string.ai_scout_example_8,
        "✨" to R.string.ai_scout_example_9,
        "🔥" to R.string.ai_scout_example_10,
        "🔄" to R.string.ai_scout_example_11,
        "🛡️" to R.string.ai_scout_example_12
    )

    // Pick 4 random examples each time this screen is composed
    val selectedExamples = remember { allExamples.shuffled().take(4) }

    Column(modifier = Modifier.padding(top = 20.dp)) {
        Text(
            text = stringResource(R.string.ai_scout_try_examples),
            style = regularTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 0.dp),
            letterSpacing = 0.5.sp
        )
        Spacer(Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(selectedExamples) { (emoji, resId) ->
                val text = stringResource(resId)
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(HomeDarkCard)
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
                        .clickable { viewModel.useExample(text) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(emoji, fontSize = 14.sp)
                    Spacer(Modifier.width(4.dp))
                    Text(text, style = regularTextStyle(HomeTextPrimary, 13.sp), maxLines = 1)
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RADAR ILLUSTRATION
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun RadarIllustration() {
    val infiniteTransition = rememberInfiniteTransition(label = "radar")
    val sweepAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "sweep"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(100.dp)
                .drawBehind {
                    val center = Offset(size.width / 2, size.height / 2)
                    val tealAlpha = HomeTealAccent.copy(alpha = 0.15f)

                    // Radar circles
                    drawCircle(tealAlpha, radius = size.minDimension / 2, style = Stroke(1.dp.toPx()))
                    drawCircle(tealAlpha, radius = size.minDimension / 3, style = Stroke(1.dp.toPx()))
                    drawCircle(tealAlpha, radius = size.minDimension / 6, style = Stroke(1.dp.toPx()))

                    // Sweep line
                    val sweepRad = Math.toRadians(sweepAngle.toDouble())
                    val lineEnd = Offset(
                        center.x + (size.minDimension / 2) * kotlin.math.cos(sweepRad).toFloat(),
                        center.y + (size.minDimension / 2) * kotlin.math.sin(sweepRad).toFloat()
                    )
                    drawLine(HomeTealAccent.copy(alpha = 0.4f), center, lineEnd, strokeWidth = 1.5.dp.toPx())
                }
        )

        Spacer(Modifier.height(16.dp))

        Text(
            text = stringResource(R.string.ai_scout_powered_title),
            style = boldTextStyle(HomeTextPrimary, 14.sp),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.ai_scout_powered_subtitle),
            style = regularTextStyle(HomeTextSecondary, 13.sp),
            textAlign = TextAlign.Center,
            lineHeight = 18.sp
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RESULTS STATE
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun AiScoutResultsState(state: AiScoutUiState, viewModel: IAiScoutViewModel) {
    val context = LocalContext.current
    val shortlistRepository: ShortlistRepository = koinInject()
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
    var justAddedUrls by remember { mutableStateOf<Set<String>>(emptySet()) }
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsState(initial = emptySet())
    val coroutineScope = rememberCoroutineScope()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        // Collapsed search bar
        item {
            CollapsedSearchBar(query = state.query, onEdit = { viewModel.clearSearch() })
        }

        // Interpretation
        if (state.interpretation.isNotBlank()) {
            item {
                InterpretationBanner(text = state.interpretation)
            }
        }

        // League Info
        state.leagueInfo?.let { info ->
            item {
                LeagueInfoBanner(info = info)
            }
        }

        // Results count / No results
        if (!state.isLoading && state.results.isEmpty()) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "🔍",
                        style = regularTextStyle(HomeTextSecondary, 40.sp)
                    )
                    Text(
                        text = stringResource(R.string.ai_scout_no_results),
                        style = regularTextStyle(HomeTextSecondary, 15.sp),
                        textAlign = TextAlign.Center
                    )
                    ActionButton(
                        text = stringResource(R.string.ai_scout_search_again),
                        icon = "🔄",
                        bgColor = HomePurpleAccent.copy(alpha = 0.1f),
                        borderColor = HomePurpleAccent.copy(alpha = 0.25f),
                        textColor = HomePurpleAccent,
                        onClick = { viewModel.clearSearch() }
                    )
                }
            }
        } else {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = stringResource(R.string.ai_scout_showing_results, state.results.size, state.requestedTotal),
                        style = regularTextStyle(HomeTextSecondary, 13.sp)
                    )
                }
            }
        }

        // Player result cards
        items(state.results, key = { it.transfermarktUrl.ifBlank { it.name } }) { player ->
            val tmUrl = player.transfermarktUrl
            PlayerResultCard(
                player = player,
                shortlistUrls = shortlistUrls,
                shortlistPendingUrls = shortlistPendingUrls,
                justAddedUrls = justAddedUrls,
                shortlistRepository = shortlistRepository,
                onJustAdded = { justAddedUrls = justAddedUrls + it },
                onJustRemoved = { justAddedUrls = justAddedUrls - it }
            )
        }

        // Loading indicator
        if (state.isLoading) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = HomeTealAccent, strokeWidth = 3.dp)
                }
            }
        }

        // Load more / Search again buttons
        if (!state.isLoading && state.results.isNotEmpty()) {
            item {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (state.hasMore) {
                        ActionButton(
                            text = stringResource(R.string.ai_scout_load_all, state.requestedTotal),
                            icon = "📋",
                            bgColor = HomeTealAccent.copy(alpha = 0.15f),
                            borderColor = HomeTealAccent.copy(alpha = 0.3f),
                            textColor = HomeTealAccent,
                            onClick = { viewModel.loadMore() }
                        )
                    }
                    ActionButton(
                        text = stringResource(R.string.ai_scout_search_again),
                        icon = "🔄",
                        bgColor = HomePurpleAccent.copy(alpha = 0.1f),
                        borderColor = HomePurpleAccent.copy(alpha = 0.25f),
                        textColor = HomePurpleAccent,
                        onClick = { viewModel.clearSearch() }
                    )
                }
            }
        }

        // Error
        if (state.errorMessage != null && !state.isLoading) {
            item {
                Text(
                    text = state.errorMessage,
                    style = regularTextStyle(Color(0xFFE53935), 13.sp),
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COLLAPSED SEARCH BAR
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun CollapsedSearchBar(query: String, onEdit: () -> Unit) {
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
            .clickable { onEdit() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Search, null, tint = HomeTealAccent, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(10.dp))
        Text(
            text = query,
            style = regularTextStyle(HomeTextPrimary, 14.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Icon(Icons.Default.Edit, null, tint = HomeTealAccent, modifier = Modifier.size(16.dp))
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERPRETATION BANNER
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun InterpretationBanner(text: String) {
    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(HomeOrangeAccent.copy(alpha = 0.08f))
            .border(1.dp, HomeOrangeAccent.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
            .padding(10.dp)
    ) {
        Text(
            text = stringResource(R.string.ai_scout_interpretation),
            style = boldTextStyle(HomeOrangeAccent, 11.sp),
            letterSpacing = 0.5.sp
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = text,
            style = regularTextStyle(HomeTextPrimary, 13.sp),
            lineHeight = 18.sp
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAGUE INFO BANNER
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun LeagueInfoBanner(info: LeagueInfo) {
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(HomeTealAccent.copy(alpha = 0.08f))
            .border(1.dp, HomeTealAccent.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("🏟️", fontSize = 14.sp)
        Spacer(Modifier.width(8.dp))
        Column {
            Text(info.name, style = boldTextStyle(HomeTealAccent, 12.sp))
            val details = buildString {
                info.avgValue?.let { append("Avg $it") }
                info.minValue?.let { append(" · Min $it") }
                info.maxValue?.let { append(" · Max $it") }
            }
            if (details.isNotBlank()) {
                Text(details, style = regularTextStyle(HomeTextSecondary, 12.sp))
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SCOUT ANALYSIS PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Structured parse result for scout analysis text.
 * Separates the jumbled blob into three clean categories:
 *  - scoutNotes: scouting insight lines (profile, league context, recommendations)
 *  - realStats:  fbref / real-world per-90 stats and percentile data
 *  - fmStats:    Football Manager attribute scores (positioning: 80, tackling: 75, CA/PA)
 */
private data class ParsedAnalysis(
    val scoutNotes: List<String>,
    val realStats: List<String>,
    val fmStats: List<FmStatItem>
)

/** A single FM stat with a label and numeric value for grid display */
private data class FmStatItem(
    val label: String,
    val value: Int?,
    val raw: String   // fallback: the full text if we can't parse label:value
)

/**
 * Parses scout analysis text into structured sections.
 * The scout server sends one big blob mixing scouting insight, fbref stats,
 * and FM attributes. This function classifies each line into the right bucket.
 */
private fun parseScoutAnalysisStructured(text: String): ParsedAnalysis {
    val fmSuffixRegex = Regex("""\s*[:\u058A\uFF1A]?\s*FM\s*$""", RegexOption.IGNORE_CASE)

    // ── Comprehensive FM attribute keywords ──────────────────────────
    // Every Football Manager attribute name in Hebrew and English.
    val fmKeywords = listOf(
        // Hebrew FM technical
        "תיקול", "תיקולים", "כדרור", "מסירה", "מסירות", "צנטורים", "כדרור",
        "סיום", "שליטה בכדור", "טכניקה", "כדורים ארוכים", "זריקה ארוכה",
        "ראש", "נגיחות", "כישרון", "פנדלים", "בעיטות חופשיות",
        // Hebrew FM mental
        "אגרסיביות", "אומץ", "ריכוז", "החלטות", "נחישות", "ראייה",
        "יצירתיות", "מנהיגות", "קור רוח", "עבודה ללא כדור", "קצב עבודה",
        "אנטיציפציה", "מיצוב", "מיקום", "פלייר",
        // Hebrew FM physical
        "כוח", "חוזק", "מהירות", "האצה", "סיבולת", "כושר", "זריזות",
        "קפיצה", "איזון", "כושר גופני",
        // Hebrew FM GK
        "תפיסה", "בעיטה", "חלוקת כדורים", "מיקום שוער", "רפלקסים",
        "יציאה אחד על אחד", "יציאה",
        // Hebrew other FM terms
        "כיסוי", "ציונים", "הגנה", "התקפה",
        // English FM technical
        "tackling", "dribbling", "passing", "crossing", "finishing",
        "first touch", "technique", "long shots", "long throws",
        "heading", "free kick", "penalty", "corners", "marking",
        // English FM mental
        "aggression", "bravery", "composure", "concentration", "decisions",
        "determination", "flair", "vision", "creativity", "leadership",
        "off the ball", "work rate", "teamwork", "anticipation", "positioning",
        // English FM physical
        "strength", "pace", "acceleration", "stamina", "fitness", "agility",
        "jumping", "balance", "natural fitness",
        // English FM GK
        "handling", "kicking", "reflexes", "one on ones", "command of area",
        "communication", "eccentricity", "rushing out", "throwing",
        // Other
        "overall", "potential",
    )

    // ── fbref / real-stat patterns ────────────────────────────────────
    // per-90 stats, percentile mentions, or stats with /90 suffix
    val realStatPatterns = listOf(
        Regex("""/90""", RegexOption.IGNORE_CASE),                      // tackles/90, interceptions/90
        Regex("""אחוזון\s*\d+"""),                                     // (אחוזון 96)
        Regex("""percentile\s*\d+""", RegexOption.IGNORE_CASE),         // percentile 96
        Regex("""(?:top|bottom)\s*\d+\s*%""", RegexOption.IGNORE_CASE), // top 5%
        Regex("""יירוטים"""),                                           // interceptions (real stats term)
        Regex("""(?:xG|xA|npxG|SCA|GCA)\b"""),                         // advanced metrics
        Regex("""קילומטרים|km\b""", RegexOption.IGNORE_CASE),          // distance covered
        Regex("""חוזקות\s*:"""),                                        // "חוזקות:" is a fbref section header
    )

    // ── CA/PA pattern (FM ability scores) ─────────────────────────────
    val caPaPattern = Regex("""CA\s*\d+|PA\s*\d+|\bCA\b|\bPA\b""", RegexOption.IGNORE_CASE)

    // ── FM-style "label: number" or "label number" (short, 1–3 words + score) ──
    val fmLabelValuePattern = Regex("""^(.{2,25}?)\s*[:：]\s*(\d{1,3})\s*$""")
    val fmLabelValueNoColon = Regex("""^([א-ת\s]{2,20})\s+(\d{1,3})\s*$""")

    // ── Classification ──────────────────────────────────────────────
    val scoutNotes = mutableListOf<String>()
    val realStats = mutableListOf<String>()
    val fmStats = mutableListOf<FmStatItem>()

    for (line in text.split("\n")) {
        val trimmed = line.trim()
        if (trimmed.isBlank()) continue
        for (part in trimmed.split("|").map { it.trim() }.filter { it.isNotBlank() }) {
            val hadFmSuffix = fmSuffixRegex.containsMatchIn(part)
            // Strip FM suffix AND any stray "FM" / ":FM" / "FM:" in the middle of the text
            val cleaned = fmSuffixRegex.replace(part, "").trim()
                .replace(Regex("""\s*[:：]?\s*FM\s*[:：]?\s*""", RegexOption.IGNORE_CASE), " ")
                .replace(Regex("""\s{2,}"""), " ").trim()
            if (cleaned.isBlank()) continue

            // 1) Check for CA/PA (always FM)
            val hasCaPa = caPaPattern.containsMatchIn(cleaned)

            // 2) Check real-stat patterns (fbref)
            val isRealStat = !hasCaPa && realStatPatterns.any { it.containsMatchIn(cleaned) }

            // 3) Check FM keyword match
            val matchesFmKeyword = fmKeywords.any { kw ->
                cleaned.contains(kw, ignoreCase = true)
            }

            // 4) Check FM label:value format  (e.g. "מיקום: 80", "כוח 85")
            val labelValueMatch = fmLabelValuePattern.find(cleaned)
                ?: fmLabelValueNoColon.find(cleaned)

            when {
                isRealStat -> {
                    realStats.add(cleaned)
                }
                hasCaPa || hadFmSuffix -> {
                    // CA/PA line — try to extract as FM stat
                    fmStats.add(parseFmStatItem(cleaned))
                }
                matchesFmKeyword -> {
                    fmStats.add(parseFmStatItem(cleaned))
                }
                labelValueMatch != null && !isRealStat -> {
                    // Short label + number — likely FM if the label is short
                    val label = labelValueMatch.groupValues[1].trim()
                    val value = labelValueMatch.groupValues[2].toIntOrNull()
                    if (value != null && value in 1..200) {
                        fmStats.add(FmStatItem(label, value, cleaned))
                    } else {
                        scoutNotes.add(cleaned)
                    }
                }
                else -> {
                    scoutNotes.add(cleaned)
                }
            }
        }
    }
    return ParsedAnalysis(scoutNotes, realStats, fmStats)
}

/** Parse a single line into an FmStatItem, trying to extract label:value */
private fun parseFmStatItem(text: String): FmStatItem {
    // Try "label: 80" or "label 80"
    val m = Regex("""^(.+?)\s*[:：]\s*(\d{1,3})\s*$""").find(text)
        ?: Regex("""^(.+?)\s+(\d{1,3})\s*$""").find(text)
    return if (m != null) {
        // Strip any residual "FM" from the label
        val label = m.groupValues[1].trim()
            .replace(Regex("""\s*[:：]?\s*FM\s*[:：]?\s*""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""\s{2,}"""), " ").trim()
        FmStatItem(label, m.groupValues[2].toIntOrNull(), text)
    } else {
        val label = text
            .replace(Regex("""\s*[:：]?\s*FM\s*[:：]?\s*""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""\s{2,}"""), " ").trim()
        FmStatItem(label, null, text)
    }
}

/**
 * Legacy wrapper — returns (regular, fmOnly) pair for backward compatibility.
 * Merges scoutNotes + realStats into "regular", fmStats raw text into "fmOnly".
 */
private fun parseScoutAnalysisBullets(text: String): Pair<List<String>, List<String>> {
    val parsed = parseScoutAnalysisStructured(text)
    val regular = parsed.scoutNotes + parsed.realStats
    val fmOnly = parsed.fmStats.map { it.raw }
    return regular to fmOnly
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER RESULT CARD
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerResultCard(
    player: ScoutPlayerResult,
    shortlistUrls: Set<String>,
    shortlistPendingUrls: Set<String>,
    justAddedUrls: Set<String>,
    shortlistRepository: ShortlistRepository,
    onJustAdded: (String) -> Unit,
    onJustRemoved: (String) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val tmUrl = player.transfermarktUrl
    val isInShortlist = tmUrl.isNotBlank() && (tmUrl in shortlistUrls || tmUrl in justAddedUrls)
    val isShortlistPending = tmUrl in shortlistPendingUrls

    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        // Circle first in reading order: left in LTR, right in RTL; then name
        val layoutDir = LocalLayoutDirection.current
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // First child = start = left in LTR, right in RTL → circle is first in reading order
            MatchPercentRing(percent = player.matchPercent, size = 50)
            Spacer(Modifier.width(10.dp))
            Text(
                text = player.name,
                // Use layout-direction-aware alignment so the name sits close to the
                // score circle even when the text content is LTR in an RTL layout.
                style = boldTextStyle(
                    HomeTextPrimary, 16.sp,
                    textAlign = if (layoutDir == LayoutDirection.Rtl) TextAlign.Right else TextAlign.Left
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(6.dp))

        Column(modifier = Modifier.fillMaxWidth()) {
                // Meta row: age · position · value · club · nationality (like web)
                Text(
                    text = buildString {
                        append(if (player.age > 0) player.age.toString() else "—")
                        append(" · ")
                        append(shortenPosition(player.position))
                        append(" · ")
                        append(player.marketValue.ifBlank { "—" })
                        if (player.club.isNotBlank()) {
                            append(" · ")
                            append(player.club)
                        }
                        if (player.nationality.isNotBlank()) {
                            append(" · ")
                            append(player.nationality)
                        }
                    },
                    style = regularTextStyle(HomeTextSecondary, 13.sp),
                    maxLines = 2
                )

                // FM badge (CA/PA, tier)
                if (player.fmCurrentAbility != null || player.fmPotentialAbility != null) {
                    Spacer(Modifier.height(6.dp))
                    FmBadge(
                        ca = player.fmCurrentAbility,
                        pa = player.fmPotentialAbility,
                        tier = player.fmTier
                    )
                }

                // Action buttons: Add to shortlist + Open Transfermarkt
                if (tmUrl.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = {
                                if (isShortlistPending) return@IconButton
                                coroutineScope.launch {
                                    val inList = tmUrl in shortlistUrls || tmUrl in justAddedUrls
                                    if (inList) {
                                        shortlistRepository.removeFromShortlist(tmUrl)
                                        onJustRemoved(tmUrl)
                                    } else {
                                        when (shortlistRepository.addToShortlistFromForm(
                                            tmProfileUrl = tmUrl,
                                            playerName = player.name,
                                            playerPosition = player.position,
                                            playerAge = if (player.age > 0) player.age.toString() else null,
                                            playerNationality = player.nationality,
                                            clubJoinedName = player.club,
                                            marketValue = player.marketValue,
                                            playerImage = player.imageUrl
                                        )) {
                                            is ShortlistRepository.AddToShortlistResult.Added ->
                                                onJustAdded(tmUrl)
                                            is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist ->
                                                ToastManager.showInfo(context.getString(R.string.add_player_already_in_shortlist))
                                            is ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                                ToastManager.showInfo(context.getString(R.string.add_player_already_in_roster))
                                        }
                                    }
                                }
                            },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = if (isInShortlist) Icons.Default.Bookmark else Icons.Default.BookmarkAdd,
                                contentDescription = if (isInShortlist) stringResource(R.string.shortlist_in_shortlist) else stringResource(R.string.shortlist_add_to_shortlist),
                                tint = if (isInShortlist) HomeGreenAccent else HomeTextSecondary
                            )
                        }
                        TextButton(
                            onClick = {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(tmUrl)))
                            },
                            modifier = Modifier.height(36.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            colors = ButtonDefaults.textButtonColors(contentColor = HomeTealAccent)
                        ) {
                            Icon(
                                Icons.Default.Link,
                                contentDescription = null,
                                tint = HomeTealAccent,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.shortlist_open_tm),
                                style = regularTextStyle(HomeTealAccent, 13.sp)
                            )
                        }
                    }
                }
        }

        // Scout analysis — structured into 3 sections: Scout Notes → Real Stats → FM Stats
        if (player.scoutAnalysis.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(HomeDarkCardBorder.copy(alpha = 0.6f))
            )
            Spacer(Modifier.height(8.dp))
            val parsed = parseScoutAnalysisStructured(player.scoutAnalysis)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                // ── Scout Notes (scouting insights, profile info) ─────
                parsed.scoutNotes.forEach { item ->
                    Text(
                        text = "• $item",
                        style = regularTextStyle(
                            HomeTextPrimary,
                            13.sp,
                            direction = TextDirection.Content
                        ),
                        lineHeight = 20.sp,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                // ── Real Stats (fbref per-90, percentiles) ────────────
                if (parsed.realStats.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "📊  " + stringResource(R.string.ai_scout_real_stats),
                        style = boldTextStyle(Color(0xFF4FC3F7), 13.sp),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(4.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF4FC3F7).copy(alpha = 0.06f))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        parsed.realStats.forEach { item ->
                            Text(
                                text = "▸ $item",
                                style = regularTextStyle(
                                    HomeTextPrimary,
                                    12.sp,
                                    direction = TextDirection.Content
                                ),
                                lineHeight = 18.sp,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }

                // ── FM Stats (game attributes in a 2-column grid) ─────
                if (parsed.fmStats.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "🎮  " + stringResource(R.string.ai_scout_fm_stats),
                        style = boldTextStyle(HomeTealAccent, 13.sp),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(4.dp))

                    // Separate stats with numeric values (grid) from text-only (bullets)
                    val gridStats = parsed.fmStats.filter { it.value != null }
                    val textStats = parsed.fmStats.filter { it.value == null }

                    if (gridStats.isNotEmpty()) {
                        // 2-column grid for label:value FM stats
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(HomeTealAccent.copy(alpha = 0.06f))
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            gridStats.chunked(2).forEach { row ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    row.forEach { stat ->
                                        Row(
                                            modifier = Modifier.weight(1f),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                text = stat.label,
                                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                                modifier = Modifier.weight(1f)
                                            )
                                            Text(
                                                text = stat.value.toString(),
                                                style = boldTextStyle(
                                                    fmStatColor(stat.value!!),
                                                    12.sp
                                                ),
                                                modifier = Modifier.padding(start = 4.dp, end = 8.dp)
                                            )
                                        }
                                    }
                                    // Pad empty cell if odd number
                                    if (row.size == 1) {
                                        Spacer(Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    }

                    // Text-only FM items (CA/PA lines, complex entries)
                    textStats.forEach { item ->
                        Text(
                            text = "• ${item.raw}",
                            style = regularTextStyle(
                                HomeTextPrimary,
                                12.sp,
                                direction = TextDirection.Content
                            ),
                            lineHeight = 18.sp,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}

/** Color-code FM stat values: red <50, meh 50-64, decent 65-74, good 75-84, great 85+ */
@Composable
private fun fmStatColor(value: Int): Color = when {
    value >= 85 -> HomeTealAccent       // Elite
    value >= 75 -> HomeGreenAccent      // Good
    value >= 65 -> Color(0xFFFFC107)    // Decent (amber)
    value >= 50 -> HomeOrangeAccent     // Average
    else -> Color(0xFFE57373)           // Weak (red-ish)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MATCH PERCENT RING
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun MatchPercentRing(percent: Int, size: Int = 50) {
    val ringColor = when {
        percent >= 85 -> HomeTealAccent
        percent >= 70 -> HomeOrangeAccent
        else -> HomeTextSecondary
    }

    Box(
        modifier = Modifier
            .size(size.dp)
            .drawBehind {
                val strokeWidth = 4.dp.toPx()
                val radius = (this.size.minDimension - strokeWidth) / 2

                // Background circle
                drawCircle(
                    color = HomeDarkCardBorder,
                    radius = radius,
                    style = Stroke(strokeWidth)
                )

                // Progress arc
                drawArc(
                    color = ringColor,
                    startAngle = -90f,
                    sweepAngle = 360f * (percent / 100f),
                    useCenter = false,
                    style = Stroke(strokeWidth, cap = StrokeCap.Round)
                )
            },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "${percent}%",
            style = boldTextStyle(ringColor, 13.sp),
            textAlign = TextAlign.Center
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FM BADGE
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
fun FmBadge(ca: Int?, pa: Int?, tier: String?) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(HomePurpleAccent.copy(alpha = 0.12f))
            .border(1.dp, HomePurpleAccent.copy(alpha = 0.25f), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("FM", style = boldTextStyle(HomePurpleAccent, 11.sp))
        Spacer(Modifier.width(4.dp))
        ca?.let { Text("$it", style = regularTextStyle(HomeTextSecondary, 11.sp)) }
        if (ca != null && pa != null) {
            Text("\u200E→\u200E", style = regularTextStyle(HomePurpleAccent, 11.sp))
        }
        pa?.let { Text("$it", style = boldTextStyle(HomeTextPrimary, 11.sp)) }

        tier?.let { tierStr ->
            Spacer(Modifier.width(6.dp))
            val (tierBg, tierColor) = when (tierStr.lowercase()) {
                "gold" -> HomeOrangeAccent.copy(alpha = 0.2f) to HomeOrangeAccent
                else -> HomeTextSecondary.copy(alpha = 0.2f) to HomeTextSecondary
            }
            Text(
                text = tierStr,
                style = boldTextStyle(tierColor, 10.sp),
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(tierBg)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACTION BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun ActionButton(
    text: String,
    icon: String,
    bgColor: Color,
    borderColor: Color,
    textColor: Color,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(icon, fontSize = 14.sp)
        Spacer(Modifier.width(6.dp))
        Text(text, style = boldTextStyle(textColor, 14.sp))
    }
}
