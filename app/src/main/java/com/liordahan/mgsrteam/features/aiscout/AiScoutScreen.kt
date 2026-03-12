package com.liordahan.mgsrteam.features.aiscout

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
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

// ═══════════════════════════════════════════════════════════════════════════════
//  COLOR SYSTEM — matches web mgsr-web/tailwind.config.ts exactly
// ═══════════════════════════════════════════════════════════════════════════════

private val WDark = Color(0xFF0F1923)       // mgsr-dark
private val WCard = Color(0xFF1A2736)       // mgsr-card
private val WBorder = Color(0xFF253545)     // mgsr-border
private val WTeal = Color(0xFF4DB6AC)       // mgsr-teal
private val WText = Color(0xFFE8EAED)       // mgsr-text
private val WMuted = Color(0xFF8C999B)      // mgsr-muted
private val WAmber = Color(0xFFF59E0B)      // amber-500
private val WPurple = Color(0xFFA855F7)     // purple-500
private val WIndigo = Color(0xFF6366F1)     // indigo-500
private val WGreen = Color(0xFF22C55E)      // green-500
private val WRed = Color(0xFFE53935)        // mgsr-red


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
            .background(WDark)
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
    val tabs = listOf(
        AiScoutTab.SCOUT to R.string.ai_scout_tab_scout,
        AiScoutTab.FIND_NEXT to R.string.ai_scout_tab_find_next
    )

    // Matches web: flex gap-1 p-1 rounded-xl bg-mgsr-card border border-mgsr-border
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(WCard)
            .border(1.dp, WBorder, RoundedCornerShape(12.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        tabs.forEach { (tab, labelRes) ->
            val isSelected = selectedTab == tab
            val accentColor = if (tab == AiScoutTab.SCOUT) WTeal else WPurple

            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .then(
                        if (isSelected) Modifier
                            .background(accentColor.copy(alpha = 0.20f))
                            .border(1.dp, accentColor.copy(alpha = 0.30f), RoundedCornerShape(8.dp))
                        else Modifier
                    )
                    .clickable { onTabSelected(tab) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(labelRes),
                    style = boldTextStyle(
                        if (isSelected) accentColor else WMuted,
                        14.sp
                    )
                )
            }
        }
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
                                    WPurple.copy(alpha = 0.3f),
                                    WTeal.copy(alpha = 0.2f)
                                )
                            )
                        )
                        .border(
                            1.dp,
                            WPurple.copy(alpha = 0.3f),
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
                        style = boldTextStyle(WText, 18.sp)
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_hero_subtitle),
                        style = regularTextStyle(WMuted, 12.sp),
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
                    .clip(RoundedCornerShape(16.dp))
                    .background(WCard)
                    .border(1.dp, WBorder, RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                // Section label
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("⚽", fontSize = 13.sp)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_player_label),
                        style = boldTextStyle(WText, 13.sp)
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
                        .background(WDark.copy(alpha = 0.6f))
                        .border(1.dp, WBorder, RoundedCornerShape(14.dp))
                        .padding(horizontal = 14.dp),
                    textStyle = regularTextStyle(WText, 15.sp),
                    singleLine = true,
                    decorationBox = { inner ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxSize()
                        ) {
                            Icon(
                                Icons.Default.Search,
                                contentDescription = null,
                                tint = WMuted.copy(alpha = 0.4f),
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Box(modifier = Modifier.weight(1f)) {
                                if (state.playerName.isEmpty()) {
                                    Text(
                                        stringResource(R.string.ai_scout_find_next_placeholder),
                                        style = regularTextStyle(WMuted.copy(alpha = 0.5f), 14.sp)
                                    )
                                }
                                inner()
                            }
                            if (state.playerName.isNotEmpty()) {
                                Icon(
                                    Icons.Default.Clear,
                                    contentDescription = null,
                                    tint = WMuted.copy(alpha = 0.5f),
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
                                    if (isSelected) WPurple.copy(alpha = 0.2f)
                                    else WDark.copy(alpha = 0.5f)
                                )
                                .border(
                                    1.dp,
                                    if (isSelected) WPurple.copy(alpha = 0.4f)
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
                                    if (isSelected) WPurple else WMuted,
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
                    .clip(RoundedCornerShape(16.dp))
                    .background(WCard)
                    .border(1.dp, WBorder, RoundedCornerShape(16.dp))
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
                            style = regularTextStyle(WMuted, 12.sp)
                        )
                    }
                    // Age badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(WPurple.copy(alpha = 0.15f))
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "≤ ${state.ageMax}",
                            style = boldTextStyle(WPurple, 13.sp)
                        )
                    }
                }
                Slider(
                    value = state.ageMax.toFloat(),
                    onValueChange = { viewModel.updateFindNextAgeMax(it.toInt()) },
                    valueRange = 17f..27f,
                    steps = 9,
                    colors = SliderDefaults.colors(
                        thumbColor = WPurple,
                        activeTrackColor = WPurple.copy(alpha = 0.6f),
                        inactiveTrackColor = WBorder
                    )
                )

                // Divider
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(WBorder.copy(alpha = 0.5f))
                )
                Spacer(Modifier.height(14.dp))

                // Value section
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("💰", fontSize = 13.sp)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_value_max),
                        style = regularTextStyle(WMuted, 12.sp)
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
                                    if (isSelected) WPurple.copy(alpha = 0.2f)
                                    else WDark.copy(alpha = 0.5f)
                                )
                                .border(
                                    1.dp,
                                    if (isSelected) WPurple.copy(alpha = 0.5f)
                                    else Color.Transparent,
                                    RoundedCornerShape(12.dp)
                                )
                                .clickable { viewModel.updateFindNextValueMax(value) }
                                .padding(horizontal = 14.dp, vertical = 8.dp)
                        ) {
                            Text(
                                if (value == 0) stringResource(R.string.ai_scout_find_next_no_limit) else label,
                                style = boldTextStyle(
                                    if (isSelected) WPurple else WText,
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
                        if (!state.isSearching && state.playerName.isNotBlank()) WPurple
                        else WPurple.copy(alpha = 0.3f)
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
                            color = WDark,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            Icons.Default.Search,
                            contentDescription = null,
                            tint = WDark,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_find_next_search_button),
                        style = boldTextStyle(WDark, 15.sp)
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
                        .clip(RoundedCornerShape(16.dp))
                        .background(WPurple.copy(alpha = 0.10f))
                        .border(1.dp, WPurple.copy(alpha = 0.25f), RoundedCornerShape(16.dp))
                        .padding(14.dp)
                ) {
                    Text("⭐", fontSize = 14.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(ref.name, style = boldTextStyle(WText, 16.sp))
                    Text(
                        "${shortenPosition(ref.position)} · ${ref.age} · ${ref.marketValue}",
                        style = regularTextStyle(WMuted, 13.sp)
                    )
                    state.response?.let { r ->
                        if (r.resultCount > 0) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                stringResource(R.string.ai_scout_find_next_found_count, r.resultCount, r.totalCandidatesScanned ?: 0),
                                style = regularTextStyle(WMuted, 12.sp)
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
                    style = regularTextStyle(WMuted, 14.sp),
                    modifier = Modifier.padding(24.dp),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

/* ── Structured explanation parser ─────────────────────── */
private data class ExplanationSections(
    val stats: List<String> = emptyList(),
    val physical: List<String> = emptyList(),
    val strengths: List<String> = emptyList(),
    val fmAttrs: List<String> = emptyList(),
    val insights: List<String> = emptyList()
)

private fun parseExplanationSections(text: String): ExplanationSections {
    val lines = text.split("\n").map { it.trim() }.filter { it.isNotBlank() }
    val stats = mutableListOf<String>()
    val physical = mutableListOf<String>()
    val strengths = mutableListOf<String>()
    val fmAttrs = mutableListOf<String>()
    val insights = mutableListOf<String>()

    for (line in lines) {
        // Skip bio line (redundant with card header)
        if (line.startsWith("Age ", true) || line.startsWith("גיל ")) continue

        // Strengths line (he/en)
        if (line.startsWith("Strengths:", true) || line.startsWith("חוזקות:")) {
            val content = line.replaceFirst(Regex("^(Strengths:|חוזקות:)\\s*", RegexOption.IGNORE_CASE), "")
            strengths.addAll(content.split("|").map { it.trim() }.filter { it.isNotBlank() })
            continue
        }

        // FM line
        if (line.startsWith("FM:", true)) {
            val content = line.replaceFirst(Regex("^FM:\\s*", RegexOption.IGNORE_CASE), "")
            val cleaned = content.replace(Regex("\\(CA\\s*\\d+\\s*[←→➝]\\s*PA\\s*\\d+\\s*\\)"), "").trim()
            fmAttrs.addAll(cleaned.split("|").map { it.trim() }.filter { it.isNotBlank() })
            continue
        }

        // Stats line: has key: number pairs separated by |
        if (Regex("\\w+:\\s*[\\d.,]+").containsMatchIn(line) && "|" in line) {
            val items = line.split("|").map { it.trim() }.filter { it.isNotBlank() }
            for (item in items) {
                if (item.contains("height", true) || item.contains("גובה") ||
                    item.contains("foot", true) || item.contains("רגל")) {
                    physical.add(item)
                } else {
                    stats.add(item)
                }
            }
            continue
        }

        // Remaining → insights
        insights.addAll(line.split("|").map { it.trim() }.filter { it.isNotBlank() })
    }

    return ExplanationSections(stats, physical, strengths, fmAttrs, insights)
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
            .clip(RoundedCornerShape(16.dp))
            .background(WCard)
            .border(1.dp, WBorder, RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            MatchPercentRing(percent = player.findNextScore, size = 48)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = player.name,
                    style = boldTextStyle(WText, 16.sp),
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
                    style = regularTextStyle(WMuted, 13.sp),
                    maxLines = 2
                )
                player.scoutNarrative?.let { narrative ->
                    if (narrative.isNotBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = narrative,
                            style = regularTextStyle(WText, 12.sp),
                            lineHeight = 18.sp
                        )
                    }
                } ?: player.explanation.takeIf { it.isNotBlank() }?.let { exp ->
                    val sec = parseExplanationSections(exp)
                    val hasAnything = sec.stats.isNotEmpty() || sec.strengths.isNotEmpty() || sec.fmAttrs.isNotEmpty() || sec.insights.isNotEmpty()
                    if (hasAnything) {
                        Spacer(Modifier.height(6.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            // Season Stats
                            if (sec.stats.isNotEmpty()) {
                                Text("📊 Stats", style = regularTextStyle(WMuted.copy(alpha = 0.5f), 9.sp))
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalArrangement = Arrangement.spacedBy(3.dp)
                                ) {
                                    sec.stats.forEach { st ->
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(WTeal.copy(alpha = 0.1f))
                                                .border(0.5.dp, WTeal.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text(st, style = regularTextStyle(WTeal.copy(alpha = 0.8f), 10.sp), maxLines = 1)
                                        }
                                    }
                                    sec.physical.forEach { ph ->
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(WDark.copy(alpha = 0.6f))
                                                .border(0.5.dp, WBorder.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text(ph, style = regularTextStyle(WMuted.copy(alpha = 0.7f), 10.sp), maxLines = 1)
                                        }
                                    }
                                }
                            }
                            // Key Strengths
                            if (sec.strengths.isNotEmpty()) {
                                Text("💪 Strengths", style = regularTextStyle(WMuted.copy(alpha = 0.5f), 9.sp))
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalArrangement = Arrangement.spacedBy(3.dp)
                                ) {
                                    sec.strengths.forEach { st ->
                                        val isTop = "✓" in st
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(WGreen.copy(alpha = if (isTop) 0.15f else 0.1f))
                                                .border(0.5.dp, WGreen.copy(alpha = if (isTop) 0.3f else 0.2f), RoundedCornerShape(4.dp))
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text(st, style = regularTextStyle(WGreen.copy(alpha = 0.8f), 10.sp), maxLines = 1)
                                        }
                                    }
                                }
                            }
                            // FM Attributes
                            if (sec.fmAttrs.isNotEmpty()) {
                                Text("🎮 FM", style = regularTextStyle(WMuted.copy(alpha = 0.5f), 9.sp))
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalArrangement = Arrangement.spacedBy(3.dp)
                                ) {
                                    sec.fmAttrs.forEach { attr ->
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(WPurple.copy(alpha = 0.1f))
                                                .border(0.5.dp, WPurple.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text(attr, style = regularTextStyle(WPurple.copy(alpha = 0.8f), 10.sp), maxLines = 1)
                                        }
                                    }
                                }
                            }
                            // Market Insights
                            if (sec.insights.isNotEmpty()) {
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalArrangement = Arrangement.spacedBy(3.dp)
                                ) {
                                    sec.insights.forEach { ins ->
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(WAmber.copy(alpha = 0.1f))
                                                .border(0.5.dp, WAmber.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text("💡 $ins", style = regularTextStyle(WAmber.copy(alpha = 0.8f), 10.sp), maxLines = 1)
                                        }
                                    }
                                }
                            }
                        }
                    }
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
                                    tint = if (isInShortlist) WGreen else WMuted
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
                                colors = ButtonDefaults.textButtonColors(contentColor = WTeal)
                            ) {
                                Icon(
                                    Icons.Default.Link,
                                    contentDescription = null,
                                    tint = WTeal,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = stringResource(R.string.shortlist_open_tm),
                                    style = regularTextStyle(WTeal, 13.sp)
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
            .background(WDark)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.player_info_cd_collapse),
                tint = WText
            )
        }
        Text(
            text = stringResource(R.string.ai_scout_title),
            style = boldTextStyle(WText, 18.sp),
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.width(48.dp))
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
        // Hero — left-aligned like web
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(top = 24.dp, bottom = 16.dp)
            ) {
                Text(
                    text = stringResource(R.string.ai_scout_hero_title),
                    style = boldTextStyle(WText, 26.sp),
                    letterSpacing = (-0.3).sp
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.ai_scout_hero_subtitle),
                    style = regularTextStyle(WMuted, 14.sp),
                    lineHeight = 20.sp
                )
            }
        }

        // Unified search card — textarea + examples + search button (like web)
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
            .background(WCard)
            .border(1.dp, WBorder, RoundedCornerShape(20.dp))
            .padding(16.dp)
    ) {
        // Textarea — multi-line input like web
        BasicTextField(
            value = state.query,
            onValueChange = { viewModel.updateQuery(it) },
            modifier = Modifier
                .fillMaxWidth()
                .height(100.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(WDark.copy(alpha = 0.6f))
                .border(1.dp, WBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
            textStyle = regularTextStyle(WText, 15.sp),
            decorationBox = { innerTextField ->
                Row(modifier = Modifier.fillMaxSize(), verticalAlignment = Alignment.Top) {
                    Box(modifier = Modifier.weight(1f)) {
                        if (state.query.isEmpty()) {
                            Text(
                                text = stringResource(R.string.ai_scout_search_hint),
                                style = regularTextStyle(WMuted.copy(alpha = 0.5f), 14.sp)
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
                                tint = WMuted.copy(alpha = 0.5f),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        )

        // Recording panel
        if (isRecording) {
            Spacer(Modifier.height(12.dp))
            ScoutRecordingContent(
                durationSeconds = recordingDuration,
                onStopClick = { onRecordClick() }
            )
        }

        Spacer(Modifier.height(14.dp))

        // Example chips + Search button row (like web: chips on left, button on right)
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Example chips — wrapping horizontally like web
            ExampleChipsInlineSection(viewModel = viewModel)

            // Bottom row: char count on left, search button on right
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${state.query.length}/500",
                    style = regularTextStyle(WMuted.copy(alpha = 0.4f), 11.sp)
                )

                Row(
                    modifier = Modifier
                        .height(42.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            if (!state.isLoading && state.query.isNotBlank()) WTeal
                            else WTeal.copy(alpha = 0.35f)
                        )
                        .clickable(enabled = !state.isLoading && state.query.isNotBlank()) {
                            viewModel.search()
                        }
                        .padding(horizontal = 22.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = WDark,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = WDark,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.ai_scout_search_button),
                        style = boldTextStyle(WDark, 14.sp)
                    )
                }
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
            .background(WTeal.copy(alpha = 0.08f))
            .border(1.dp, WTeal.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.player_info_recording),
            style = regularTextStyle(WTeal, 16.sp),
            modifier = Modifier.padding(bottom = 16.dp)
        )
        RecordingWaveform(
            barCount = 10,
            color = WTeal,
            barWidth = 6.dp,
            barHeight = 12.dp,
            modifier = Modifier.padding(vertical = 16.dp)
        )
        Text(
            text = "%d:%02d".format(durationSeconds / 60, durationSeconds % 60),
            style = boldTextStyle(WText, 24.sp),
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
            style = regularTextStyle(WMuted, 14.sp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXAMPLE CHIPS (inline — wrapping, inside the search card like web)
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExampleChipsInlineSection(viewModel: IAiScoutViewModel) {
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
    val selectedExamples = remember { allExamples.shuffled().take(4) }

    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        selectedExamples.forEach { (emoji, resId) ->
            val text = stringResource(resId)
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(WDark.copy(alpha = 0.5f))
                    .border(1.dp, WBorder, RoundedCornerShape(10.dp))
                    .clickable { viewModel.useExample(text) }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(emoji, fontSize = 12.sp)
                Spacer(Modifier.width(4.dp))
                Text(
                    text,
                    style = regularTextStyle(WMuted, 12.sp),
                    maxLines = 1
                )
            }
        }
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
                        style = regularTextStyle(WMuted, 40.sp)
                    )
                    Text(
                        text = stringResource(R.string.ai_scout_no_results),
                        style = regularTextStyle(WMuted, 15.sp),
                        textAlign = TextAlign.Center
                    )
                    ActionButton(
                        text = stringResource(R.string.ai_scout_search_again),
                        icon = "🔄",
                        bgColor = WPurple.copy(alpha = 0.1f),
                        borderColor = WPurple.copy(alpha = 0.25f),
                        textColor = WPurple,
                        onClick = { viewModel.clearSearch() }
                    )
                }
            }
        } else {
            // Web-style results header: count on left, buttons on right, border-bottom
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .padding(top = 8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.ai_scout_showing_results, state.results.size, state.requestedTotal),
                            style = boldTextStyle(WText, 14.sp)
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (state.hasMore) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(WTeal.copy(alpha = 0.15f))
                                        .border(1.dp, WTeal.copy(alpha = 0.40f), RoundedCornerShape(8.dp))
                                        .clickable { viewModel.loadMore() }
                                        .padding(horizontal = 12.dp, vertical = 8.dp)
                                ) {
                                    Text(
                                        text = stringResource(R.string.ai_scout_load_all, state.requestedTotal),
                                        style = regularTextStyle(WTeal, 12.sp)
                                    )
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(WAmber.copy(alpha = 0.20f))
                                    .clickable { viewModel.clearSearch() }
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.ai_scout_search_again),
                                    style = regularTextStyle(WAmber, 12.sp)
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    // Border-bottom like web
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(WBorder)
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
                    CircularProgressIndicator(color = WTeal, strokeWidth = 3.dp)
                }
            }
        }

        // Error
        if (state.errorMessage != null && !state.isLoading) {
            item {
                Text(
                    text = state.errorMessage,
                    style = regularTextStyle(WRed, 13.sp),
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
    // Clean card matching web: rounded-2xl border border-mgsr-border bg-mgsr-card
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(WCard)
            .border(1.dp, WBorder, RoundedCornerShape(12.dp))
            .clickable { onEdit() }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Search, null, tint = WTeal, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(10.dp))
        Text(
            text = query,
            style = regularTextStyle(WText, 14.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Icon(Icons.Default.Edit, null, tint = WMuted, modifier = Modifier.size(16.dp))
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERPRETATION BANNER
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun InterpretationBanner(text: String) {
    // Parse interpretation into structured sections for clear display
    val sections = parseInterpretationSections(text)

    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(WCard)
            .border(1.dp, WBorder, RoundedCornerShape(12.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Header
        Text(
            text = stringResource(R.string.ai_scout_interpretation),
            style = boldTextStyle(WTeal, 13.sp)
        )

        // Search query line
        if (sections.searchQuery.isNotBlank()) {
            Text(
                text = "\uD83D\uDD0D  ${sections.searchQuery}",
                style = regularTextStyle(WText, 13.sp),
                lineHeight = 20.sp
            )
        }

        // Translation line
        if (sections.translation.isNotBlank()) {
            Text(
                text = "\uD83D\uDCDD  ${sections.translation}",
                style = regularTextStyle(WMuted, 13.sp),
                lineHeight = 20.sp
            )
        }

        // Results count line
        if (sections.resultsInfo.isNotBlank()) {
            Text(
                text = "\uD83D\uDCCA  ${sections.resultsInfo}",
                style = regularTextStyle(WMuted, 13.sp),
                lineHeight = 20.sp
            )
        }

        // Market filter line
        if (sections.marketFilter.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(WAmber.copy(alpha = 0.10f))
                    .border(1.dp, WAmber.copy(alpha = 0.20f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("\uD83D\uDCB0", fontSize = 12.sp)
                Spacer(Modifier.width(6.dp))
                Text(
                    text = sections.marketFilter,
                    style = regularTextStyle(WAmber, 12.sp),
                    lineHeight = 18.sp
                )
            }
        }

        // Any remaining lines
        sections.other.forEach { line ->
            Text(
                text = line,
                style = regularTextStyle(WText, 13.sp),
                lineHeight = 20.sp
            )
        }
    }
}

/** Parses the AI interpretation text into structured sections for clean display */
private data class InterpretationSections(
    val searchQuery: String = "",
    val translation: String = "",
    val resultsInfo: String = "",
    val marketFilter: String = "",
    val other: List<String> = emptyList()
)

private fun parseInterpretationSections(text: String): InterpretationSections {
    val lines = text.split("\n").map { it.trim() }.filter { it.isNotBlank() }
    var searchQuery = ""
    var translation = ""
    var resultsInfo = ""
    var marketFilter = ""
    val other = mutableListOf<String>()

    for (line in lines) {
        val cleaned = line
            .replace(Regex("^[\\uD83D\\uDD0D\\uD83C\\uDFAF\\uD83D\\uDCCA\\uD83D\\uDCB0🔍🎯📊💰📝]\\s*"), "")
            .trim()
        when {
            line.contains("חיפוש:") || line.contains("Search:", true) ->
                searchQuery = cleaned.removePrefix("חיפוש:").removePrefix("Search:").trim()
            line.contains("תרגום:") || line.contains("Translation:", true) ||
                line.contains("box-to-box", true) || line.contains("Query:", true) ->
                translation = cleaned.removePrefix("תרגום:").removePrefix("Translation:").removePrefix("Query:").trim()
            line.contains("נמצאו") || line.contains("Found", true) ||
                line.contains("תואמים") || line.contains("matches", true) ->
                resultsInfo = cleaned
            line.contains("סינון") || line.contains("Filter", true) ||
                line.contains("שווי שוק") || line.contains("market", true) ||
                line.contains("€") ->
                marketFilter = cleaned
            else -> other.add(cleaned)
        }
    }
    return InterpretationSections(searchQuery, translation, resultsInfo, marketFilter, other)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAGUE INFO BANNER
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun LeagueInfoBanner(info: LeagueInfo) {
    // Matches web: rounded-xl bg-amber-500/15 border-2 border-amber-500/50
    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(WAmber.copy(alpha = 0.15f))
            .border(2.dp, WAmber.copy(alpha = 0.50f), RoundedCornerShape(12.dp))
            .padding(14.dp)
    ) {
        Text(
            text = info.name,
            style = boldTextStyle(WAmber, 14.sp)
        )
        Spacer(Modifier.height(4.dp))
        val details = buildString {
            info.avgValue?.let { append("Avg $it") }
            info.minValue?.let { append(" · Min $it") }
            info.maxValue?.let { append(" · Max $it") }
        }
        if (details.isNotBlank()) {
            Text(details, style = regularTextStyle(WText, 13.sp))
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
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(WCard)
            .border(1.dp, WBorder, RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        // Match ring + name row (like web: flex items-start gap-5)
        val layoutDir = LocalLayoutDirection.current
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            MatchPercentRing(percent = player.matchPercent, size = 48)
            Spacer(Modifier.width(12.dp))
            Text(
                text = player.name,
                style = boldTextStyle(
                    WText, 16.sp,
                    textAlign = if (layoutDir == LayoutDirection.Rtl) TextAlign.Right else TextAlign.Left
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(4.dp))

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
                    style = regularTextStyle(WMuted, 13.sp),
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
                                tint = if (isInShortlist) WGreen else WMuted
                            )
                        }
                        TextButton(
                            onClick = {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(tmUrl)))
                            },
                            modifier = Modifier.height(36.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            colors = ButtonDefaults.textButtonColors(contentColor = WTeal)
                        ) {
                            Icon(
                                Icons.Default.Link,
                                contentDescription = null,
                                tint = WTeal,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.shortlist_open_tm),
                                style = regularTextStyle(WTeal, 13.sp)
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
                    .background(WBorder)
            )
            Spacer(Modifier.height(8.dp))
            val parsed = parseScoutAnalysisStructured(player.scoutAnalysis)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                // ── Scout Notes (scouting insights, profile info) ─────
                parsed.scoutNotes.forEach { item ->
                    Text(
                        text = "• $item",
                        style = regularTextStyle(
                            WText.copy(alpha = 0.85f),
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
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF4FC3F7).copy(alpha = 0.06f))
                            .border(1.dp, Color(0xFF4FC3F7).copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        parsed.realStats.forEach { item ->
                            Text(
                                text = "▸ $item",
                                style = regularTextStyle(
                                    WText,
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
                        style = boldTextStyle(WTeal, 13.sp),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(4.dp))

                    val gridStats = parsed.fmStats.filter { it.value != null }
                    val textStats = parsed.fmStats.filter { it.value == null }

                    if (gridStats.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(WTeal.copy(alpha = 0.06f))
                                .border(1.dp, WTeal.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                                .padding(horizontal = 12.dp, vertical = 8.dp),
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
                                                style = regularTextStyle(WMuted, 12.sp),
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
                                    if (row.size == 1) {
                                        Spacer(Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    }

                    textStats.forEach { item ->
                        Text(
                            text = "• ${item.raw}",
                            style = regularTextStyle(
                                WText,
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
    value >= 85 -> WTeal               // Elite
    value >= 75 -> WGreen              // Good
    value >= 65 -> WAmber              // Decent
    value >= 50 -> Color(0xFFF97316)   // Average (orange-500)
    else -> Color(0xFFE57373)          // Weak (red-ish)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MATCH PERCENT RING
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun MatchPercentRing(percent: Int, size: Int = 50) {
    val ringColor = when {
        percent >= 85 -> WTeal
        percent >= 70 -> WAmber
        else -> WMuted
    }

    Box(
        modifier = Modifier
            .size(size.dp)
            .drawBehind {
                val strokeWidth = 4.dp.toPx()
                val radius = (this.size.minDimension - strokeWidth) / 2

                // Outer glow ring
                drawCircle(
                    color = ringColor.copy(alpha = 0.08f),
                    radius = radius + 4.dp.toPx(),
                )

                // Background circle track
                drawCircle(
                    color = WBorder,
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
            .clip(RoundedCornerShape(8.dp))
            .background(WPurple.copy(alpha = 0.10f))
            .border(1.dp, WPurple.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("FM", style = boldTextStyle(WPurple, 11.sp))
        Spacer(Modifier.width(4.dp))
        ca?.let { Text("$it", style = regularTextStyle(WMuted, 11.sp)) }
        if (ca != null && pa != null) {
            Text("\u200E→\u200E", style = regularTextStyle(WPurple, 11.sp))
        }
        pa?.let { Text("$it", style = boldTextStyle(WText, 11.sp)) }

        tier?.let { tierStr ->
            Spacer(Modifier.width(6.dp))
            val (tierBg, tierColor) = when (tierStr.lowercase()) {
                "gold" -> WAmber.copy(alpha = 0.2f) to WAmber
                else -> WMuted.copy(alpha = 0.2f) to WMuted
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
            .clip(RoundedCornerShape(14.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(14.dp))
            .clickable { onClick() }
            .padding(14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(icon, fontSize = 14.sp)
        Spacer(Modifier.width(6.dp))
        Text(text, style = boldTextStyle(textColor, 14.sp))
    }
}
