package com.liordahan.mgsrteam.features.shortlist

import com.liordahan.mgsrteam.config.AppConfigManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Whatsapp
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.net.toUri
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.add.SnakeBarMessage
import com.liordahan.mgsrteam.features.add.showSnakeBarMessage
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.liordahan.mgsrteam.features.releases.RosterTeammateMatch
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.TeammatesFetcher
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.GrayscalePlayerPhoto
import com.liordahan.mgsrteam.ui.theme.PaperGrainOverlay
import com.liordahan.mgsrteam.utils.EuCountries
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.theme.PlatformYouthAccent
import com.liordahan.mgsrteam.ui.theme.PlatformYouthSecondary
import com.liordahan.mgsrteam.ui.components.SkeletonPlayerCardList
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.utils.extractPlayerIdFromUrl
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.features.login.models.Account
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

/** Maps position chip labels to both short codes and long-form TM position strings. */
private val shortlistPositionCodes = mapOf(
    "GK"  to setOf("GK", "GOALKEEPER"),
    "DEF" to setOf("CB", "RB", "LB", "CENTRE-BACK", "LEFT-BACK", "RIGHT-BACK", "BACK"),
    "MID" to setOf("CM", "DM", "AM", "MIDFIELD", "DEFENSIVE MIDFIELD", "CENTRAL MIDFIELD", "ATTACKING MIDFIELD", "LEFT MIDFIELD", "RIGHT MIDFIELD"),
    "FWD" to setOf("ST", "CF", "LW", "RW", "SS", "FORWARD", "CENTRE-FORWARD", "LEFT WINGER", "RIGHT WINGER", "SECOND STRIKER", "WINGER", "STRIKER"),
    "CB"  to setOf("CB", "CENTRE-BACK"),
    "RB"  to setOf("RB", "RIGHT-BACK"),
    "LB"  to setOf("LB", "LEFT-BACK"),
    "DM"  to setOf("DM", "DEFENSIVE MIDFIELD"),
    "CM"  to setOf("CM", "CENTRAL MIDFIELD"),
    "AM"  to setOf("AM", "ATTACKING MIDFIELD"),
    "LW"  to setOf("LW", "LEFT WINGER"),
    "RW"  to setOf("RW", "RIGHT WINGER"),
    "CF"  to setOf("CF", "CENTRE-FORWARD"),
    "SS"  to setOf("SS", "SECOND STRIKER")
)

// ── BRIT editorial palette (FEAT-005) ────────────────────────────────────────
// The mock's SCREENS.shortlist (board/ledger editorial cards) + SCREENS.empty
// CTA use the ".brit-room" paper look. The former dark-navy "Men shortlist"
// constants are re-bound to BritTokens so the shortlist boards, cards, notes,
// outreach and empty-state adopt the paper editorial look while ShortlistViewModel
// add/remove/notes/outreach wiring stays intact. Youth keeps PlatformColors
// (teal). Light-gold / subtle-gold text roles map to the readable editorial gold
// and muted so they stay legible on cream; white badge/avatar text sits on
// coloured accents.
private val MenShortlistBg = BritTokens.paper
private val MenShortlistCard = BritTokens.card
private val MenShortlistCardAlt = BritTokens.paper2
private val MenShortlistBorder = BritTokens.line
private val MenShortlistGold = BritTokens.gold
private val MenShortlistGoldSoft = BritTokens.gold
private val MenShortlistBronze = BritTokens.gold
private val MenShortlistTextSubtle = BritTokens.muted

private fun shortlistIsMen(): Boolean = !PlatformColors.palette.isYouth
private fun shortlistCardColor(): Color = if (shortlistIsMen()) MenShortlistCard else PlatformColors.palette.card
private fun shortlistCardAltColor(): Color = if (shortlistIsMen()) MenShortlistCardAlt else PlatformColors.palette.card
private fun shortlistBorderColor(): Color = if (shortlistIsMen()) MenShortlistBorder else PlatformColors.palette.cardBorder
private fun shortlistAccentColor(): Color = if (shortlistIsMen()) MenShortlistGold else PlatformColors.palette.accent
private fun shortlistMutedTextColor(): Color = if (shortlistIsMen()) MenShortlistTextSubtle else PlatformColors.palette.textSecondary

private fun formatShortlistProfileDisplay(entry: ShortlistEntry): String {
    entry.playerName?.takeIf { it.isNotBlank() }?.let { return it }
    val id = extractPlayerIdFromUrl(entry.tmProfileUrl)
    return if (id != null) "Profile #$id" else entry.tmProfileUrl.take(40)
        .let { if (it.length == entry.tmProfileUrl.length) it else "$it…" }
}

@Composable
private fun formatRelativeDate(addedAt: Long): String {
    val dayMs = 24 * 60 * 60 * 1000L
    val todayDayNum = System.currentTimeMillis() / dayMs
    val eventDayNum = addedAt / dayMs
    val calendarDays = (todayDayNum - eventDayNum).toInt()
    val weeks = calendarDays / 7
    return when {
        calendarDays <= 0 -> stringResource(R.string.shortlist_added_today)
        calendarDays == 1 -> stringResource(R.string.shortlist_added_yesterday)
        calendarDays < 7  -> stringResource(R.string.shortlist_added_days_ago, calendarDays)
        weeks == 1        -> stringResource(R.string.shortlist_added_week_ago)
        weeks < 4         -> stringResource(R.string.shortlist_added_weeks_ago, weeks)
        else              -> stringResource(R.string.shortlist_added_months_ago, calendarDays / 30)
    }
}

/** Bare relative date: "today" / "yesterday" / "3 days ago" — no "Added" prefix. */
@Composable
private fun formatBareRelativeDate(timestamp: Long): String {
    val dayMs = 24 * 60 * 60 * 1000L
    val calendarDays = (System.currentTimeMillis() / dayMs - timestamp / dayMs).toInt()
    val weeks = calendarDays / 7
    return when {
        calendarDays <= 0 -> stringResource(R.string.relative_today)
        calendarDays == 1 -> stringResource(R.string.relative_yesterday)
        calendarDays < 7  -> stringResource(R.string.relative_days_ago, calendarDays)
        weeks == 1        -> stringResource(R.string.relative_week_ago)
        weeks < 4         -> stringResource(R.string.relative_weeks_ago, weeks)
        else              -> stringResource(R.string.relative_months_ago, calendarDays / 30)
    }
}

/** Returns the agent display name for the shortlist entry, based on current language. */
private fun ShortlistEntry.getAddedByDisplayName(context: Context): String? {
    val isHebrew = LocaleManager.isHebrew(context)
    return when {
        isHebrew -> (addedByAgentHebrewName ?: addedByAgentName).takeIf { !it.isNullOrBlank() }
        else -> (addedByAgentName ?: addedByAgentHebrewName).takeIf { !it.isNullOrBlank() }
    }
}

/** View mode for the MEN shortlist — mirrors the web `view: 'board' | 'ledger'`. */
private enum class ShortlistView { BOARD, LEDGER }

/**
 * Free-agent detection mirroring shortlistIntelligence.isFreeAgent: no club or
 * "Without Club" / "Vereinslos" / "ללא מועדון".
 */
private fun shortlistIsFreeAgent(clubName: String?): Boolean {
    val c = clubName?.trim()
    if (c.isNullOrEmpty()) return true
    val lower = c.lowercase()
    return lower == "without club" || lower == "vereinslos" || c == "ללא מועדון"
}

/** Compact euro money formatting mirroring the web `fmtValue`. */
private fun fmtShortlistValue(v: Long): String = when {
    v >= 1_000_000L -> {
        val m = v / 1_000_000.0
        if (v % 1_000_000L == 0L) "€${m.toInt()}M" else "€${(Math.round(m * 10) / 10.0)}M"
    }
    v > 0L -> "€${Math.round(v / 1000.0)}K"
    else -> "€0"
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHORTLIST SCREEN
// ═════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShortlistScreen(
    navController: NavController,
    viewModel: IShortlistViewModel = koinViewModel<ShortlistViewModel>(),
    addPlayerViewModel: IAddPlayerViewModel = koinViewModel(),
    playersRepository: IPlayersRepository = koinInject(),
    teammatesFetcher: TeammatesFetcher = koinInject(),
    platformManager: PlatformManager = koinInject(),
    mainViewModel: com.liordahan.mgsrteam.IMainViewModel? = null,
    highlightTmProfile: String? = null
) {
    val state by viewModel.shortlistFlow.collectAsStateWithLifecycle()
    val currentPlatform by platformManager.current.collectAsStateWithLifecycle()
    val isMen = currentPlatform == Platform.MEN
    val context = LocalContext.current
    val oneWeekAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000)
    val thisWeekCount = state.entries.count { it.addedAt >= oneWeekAgo }

    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }
    var entryToDelete by remember { mutableStateOf<ShortlistEntry?>(null) }

    // Notes feature
    var noteDialogEntry by remember { mutableStateOf<ShortlistEntry?>(null) }
    var noteDialogMode by remember { mutableStateOf("add") } // "add" or "edit"
    var noteDialogText by remember { mutableStateOf("") }
    var noteDialogEditIndex by remember { mutableStateOf(-1) }
    var expandedNotesUrl by remember { mutableStateOf<String?>(null) }

    // Instagram outreach state
    var igConfirmUrl by remember { mutableStateOf<String?>(null) }

    // Search by name (men only)
    var searchQuery by remember { mutableStateOf("") }

    // Roster teammates feature (same as Releases)
    val rosterPlayers by playersRepository.playersFlow().collectAsStateWithLifecycle(initialValue = emptyList())
    var expandedPlayerUrl by remember { mutableStateOf<String?>(null) }
    var teammatesCache by remember { mutableStateOf<Map<String, List<RosterTeammateMatch>>>(emptyMap()) }
    var loadingPlayerUrl by remember { mutableStateOf<String?>(null) }

    // My Players filter
    var currentUserName by remember { mutableStateOf<String?>(null) }
    var allAccounts by remember { mutableStateOf<List<Account>>(emptyList()) }
    val firebaseHandler: FirebaseHandler = koinInject()

    // Sort & filter state (from ViewModel — survives navigation)
    val sortOption = state.sortOption
    val selectedPosition = state.selectedPosition
    val withNotesOnly = state.withNotesOnly
    val myPlayersOnly = state.myPlayersOnly
    val selectedAgentFilter = state.selectedAgentFilter

    LaunchedEffect(Unit) {
        val email = FirebaseAuth.getInstance().currentUser?.email ?: return@LaunchedEffect
        try {
            val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
            val accounts = snapshot.toObjects(Account::class.java)
            allAccounts = accounts
            currentUserName = accounts.firstOrNull { it.email?.equals(email, ignoreCase = true) == true }?.name
        } catch (_: Exception) { }
    }

    // Board view is the shortlist default (mirrors the web `view: 'board'`).
    var view by remember { mutableStateOf(ShortlistView.BOARD) }

    // Local derived-only filter chips (mirror the web useMemo filters — NOT store
    // state). EU-only applies EuCountries.isEuNational; free-only mirrors
    // shortlistIntelligence.isFreeAgent. No VM / data-layer change.
    var euOnly by remember { mutableStateOf(false) }
    var freeOnly by remember { mutableStateOf(false) }

    val filteredEntries = remember(state.entries, state.removingUrls, myPlayersOnly, selectedAgentFilter, currentUserName, selectedPosition, withNotesOnly, sortOption, searchQuery, euOnly, freeOnly) {
        var result = when {
            myPlayersOnly && !currentUserName.isNullOrBlank() ->
                state.entries.filter { it.addedByAgentName.equals(currentUserName, ignoreCase = true) }
            selectedAgentFilter != null ->
                state.entries.filter { it.addedByAgentName.equals(selectedAgentFilter, ignoreCase = true) }
            else -> state.entries
        }

        // Hide entries being removed (optimistic removal)
        if (state.removingUrls.isNotEmpty()) {
            result = result.filter { it.tmProfileUrl !in state.removingUrls }
        }

        // Name search (men only)
        val query = searchQuery.trim()
        if (query.isNotEmpty()) {
            result = result.filter { it.playerName?.contains(query, ignoreCase = true) == true }
        }

        // Position filter (supports both short codes like "CB"/"ST" and long-form like "Centre-Back")
        val posFilter = selectedPosition
        if (posFilter != null) {
            val codes = shortlistPositionCodes[posFilter.uppercase()] ?: emptySet()
            result = result.filter { entry ->
                val pos = entry.playerPosition?.uppercase()?.trim() ?: ""
                codes.any { code -> pos == code || pos.contains(code) }
            }
        }

        // With notes filter
        if (withNotesOnly) {
            result = result.filter { it.notes.isNotEmpty() }
        }

        // Derived-only (local) chips — EU nationality + free agent.
        if (euOnly) {
            result = result.filter { EuCountries.isEuNational(it.playerNationality) }
        }
        if (freeOnly) {
            result = result.filter { shortlistIsFreeAgent(it.clubJoinedName) }
        }

        // Sort
        when (sortOption) {
            SortOption.NAME -> result.sortedBy { it.playerName?.lowercase() ?: "" }
            SortOption.AGE -> result.sortedBy { it.playerAge?.replace(Regex("[^0-9]"), "")?.toIntOrNull() ?: 99 }
            SortOption.MARKET_VALUE -> result.sortedByDescending { parseShortlistMarketValue(it.marketValue) }
            else -> result // default: by addedAt (already ordered from repo)
        }
    }

    // ── Derived signals (computed in the Compose layer, mirroring MenShortlist.tsx) ──
    val thirtyDaysAgo = System.currentTimeMillis() - (30L * 24 * 60 * 60 * 1000)
    val monthAdds = remember(state.entries) { state.entries.count { it.addedAt >= thirtyDaysAgo } }
    val totalValueEuros = remember(state.entries) {
        state.entries.sumOf { parseShortlistMarketValue(it.marketValue) }
    }
    val valuedCount = remember(state.entries) {
        state.entries.count { parseShortlistMarketValue(it.marketValue) > 0 }
    }
    val freeCount = remember(state.entries) {
        state.entries.count { shortlistIsFreeAgent(it.clubJoinedName) }
    }
    val activeFilterCount = (if (selectedPosition != null) 1 else 0) +
        (if (myPlayersOnly || selectedAgentFilter != null) 1 else 0) +
        (if (euOnly) 1 else 0) +
        (if (freeOnly) 1 else 0) +
        (if (withNotesOnly) 1 else 0)
    val hasActiveFilters = activeFilterCount > 0 || searchQuery.isNotBlank()

    val listState = rememberLazyListState()
    // Track whether the initial highlight scroll has happened
    var highlightScrollDone by remember { mutableStateOf(highlightTmProfile == null) }

    LaunchedEffect(sortOption, selectedPosition, withNotesOnly) {
        if (highlightScrollDone) {
            listState.animateScrollToItem(0)
        }
    }

    // Scroll to highlighted entry (from dashboard search)
    LaunchedEffect(highlightTmProfile, filteredEntries) {
        if (highlightTmProfile != null && filteredEntries.isNotEmpty()) {
            val index = filteredEntries.indexOfFirst { it.tmProfileUrl == highlightTmProfile }
            if (index >= 0) {
                // Small delay to let the LazyColumn layout settle after data loads
                kotlinx.coroutines.delay(300)
                listState.animateScrollToItem(index)
                highlightScrollDone = true
            }
        }
    }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsStateWithLifecycle()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsStateWithLifecycle()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsStateWithLifecycle()
    val snackBarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(mainViewModel) {
        mainViewModel ?: return@LaunchedEffect
        mainViewModel.pendingShortlistAddTmUrl.collect { url ->
            if (!url.isNullOrBlank()) {
                mainViewModel.clearPendingShortlistAddTmUrl()
                addPlayerTmUrl = url
                showAddPlayerBottomSheet = true
            }
        }
    }

    LaunchedEffect(Unit) {
        addPlayerViewModel.errorMessageFlow.collect { message ->
            if (!message.isNullOrEmpty()) {
                showSnakeBarMessage(
                    scope = scope,
                    snackBarHostState = snackBarHostState,
                    message = message
                )
            }
        }
    }

    var addPlayerFallbackName by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(showAddPlayerBottomSheet, addPlayerTmUrl) {
        if (showAddPlayerBottomSheet && !addPlayerTmUrl.isNullOrBlank()) {
            addPlayerViewModel.loadPlayerByTmProfileUrl(addPlayerTmUrl!!, fallbackName = addPlayerFallbackName)
        }
    }

    LaunchedEffect(isPlayerAdded) {
        if (isPlayerAdded) {
            addPlayerTmUrl?.let { url -> viewModel.removeByUrl(url) }
            showAddPlayerBottomSheet = false
            addPlayerTmUrl = null
            addPlayerFallbackName = null
            addPlayerViewModel.resetAfterAdd()
        }
    }

    // Fetch teammates when user expands a card
    LaunchedEffect(expandedPlayerUrl) {
        val url = expandedPlayerUrl ?: return@LaunchedEffect
        if (url in teammatesCache) return@LaunchedEffect
        loadingPlayerUrl = url
        when (val result = teammatesFetcher.fetchTeammates(url)) {
            is TransfermarktResult.Success -> {
                val rosterIds = rosterPlayers.mapNotNull { extractPlayerIdFromUrl(it.tmProfile) }.toSet()
                val matches = result.data
                    .filter { teammate -> extractPlayerIdFromUrl(teammate.tmProfileUrl) in rosterIds }
                    .mapNotNull { teammate ->
                        val id = extractPlayerIdFromUrl(teammate.tmProfileUrl) ?: return@mapNotNull null
                        rosterPlayers.firstOrNull { extractPlayerIdFromUrl(it.tmProfile) == id }
                            ?.let { RosterTeammateMatch(it, teammate.matchesPlayedTogether) }
                    }
                    .sortedByDescending { it.matchesPlayedTogether }
                teammatesCache = teammatesCache + (url to matches)
            }
            is TransfermarktResult.Failed -> {
                teammatesCache = teammatesCache + (url to emptyList())
            }
        }
        loadingPlayerUrl = null
    }

    // Instagram outreach handler
    val handleInstagramOutreach: (ShortlistEntry) -> Unit = { entry ->
        val handle = entry.instagramHandle
        if (handle != null) {
            val message = resolveOutreachTemplate(
                playerName = entry.playerName,
                agentName = currentUserName,
                playerPosition = entry.playerPosition
            )
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("outreach", message))
            Toast.makeText(
                context,
                context.getString(R.string.shortlist_ig_copied),
                Toast.LENGTH_SHORT
            ).show()
            val dmIntent = Intent(Intent.ACTION_VIEW, Uri.parse(getInstagramDmUrl(handle)))
            context.startActivity(dmIntent)
            igConfirmUrl = entry.tmProfileUrl
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = if (isMen) MenShortlistBg else PlatformColors.palette.background,
        snackbarHost = {
            SnackbarHost(
                hostState = snackBarHostState,
                snackbar = { SnakeBarMessage(message = it.visuals.message) }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
        if (isMen) PaperGrainOverlay()
        // A fully-wired shortlist card (notes + roster-teammates + Instagram
        // outreach + add/remove). Reused by both the editorial MEN board and the
        // Youth list so ALL existing behaviour is preserved in one place.
        val boundCard: @Composable (ShortlistEntry) -> Unit = { entry ->
            val playerUrl = entry.tmProfileUrl
            val isExpanded = playerUrl == expandedPlayerUrl
            ShortlistCard(
                context = context,
                entry = entry,
                isYouth = currentPlatform == Platform.YOUTH,
                rosterTeammates = teammatesCache[playerUrl],
                isLoadingTeammates = loadingPlayerUrl == playerUrl,
                isTeammatesExpanded = isExpanded,
                onToggleTeammatesExpand = {
                    expandedPlayerUrl = if (isExpanded) null else playerUrl
                },
                onRosterTeammateClick = { player ->
                    player.tmProfile?.let { profile ->
                        navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(profile)}")
                    }
                },
                isNotesExpanded = playerUrl == expandedNotesUrl,
                onToggleNotesExpand = {
                    expandedNotesUrl = if (playerUrl == expandedNotesUrl) null else playerUrl
                },
                onAddNote = {
                    noteDialogEntry = entry
                    noteDialogMode = "add"
                    noteDialogText = ""
                    noteDialogEditIndex = -1
                },
                onEditNote = { noteIndex, currentText ->
                    noteDialogEntry = entry
                    noteDialogMode = "edit"
                    noteDialogText = currentText
                    noteDialogEditIndex = noteIndex
                },
                onDeleteNote = { noteIndex ->
                    viewModel.deleteNote(entry.tmProfileUrl, noteIndex)
                },
                onAddToAgency = {
                    if (currentPlatform == Platform.YOUTH) {
                        navController.navigate(
                            Screens.addPlayerWithTmProfileRoute(Uri.encode(entry.tmProfileUrl))
                        )
                    } else {
                        addPlayerTmUrl = entry.tmProfileUrl
                        addPlayerFallbackName = entry.playerName
                        showAddPlayerBottomSheet = true
                    }
                },
                onOpenTm = {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, entry.tmProfileUrl.toUri())
                    )
                },
                onRemove = { entryToDelete = entry },
                igConfirmUrl = igConfirmUrl,
                onInstagramOutreach = { handleInstagramOutreach(entry) },
                onConfirmIgSent = {
                    viewModel.markInstagramSent(entry.tmProfileUrl)
                    igConfirmUrl = null
                },
                onDismissIgConfirm = { igConfirmUrl = null }
            )
        }

        when (currentPlatform) {
            // ── MEN: editorial .brit-room shortlist (web MenShortlist parity) ──
            Platform.MEN -> {
                MenShortlistBody(
                    listState = listState,
                    state = state,
                    filteredEntries = filteredEntries,
                    view = view,
                    onViewChange = { view = it },
                    searchQuery = searchQuery,
                    onSearchChange = { searchQuery = it },
                    selectedPosition = selectedPosition,
                    onPositionGroup = { group ->
                        viewModel.setSelectedPosition(
                            if (group == "All" || group == selectedPosition) null else group
                        )
                    },
                    myPlayersOnly = myPlayersOnly,
                    canFilterMyPlayers = !currentUserName.isNullOrBlank(),
                    onToggleMyPlayers = { viewModel.setMyPlayersOnly(!myPlayersOnly) },
                    euOnly = euOnly,
                    onToggleEu = { euOnly = !euOnly },
                    freeOnly = freeOnly,
                    onToggleFree = { freeOnly = !freeOnly },
                    withNotesOnly = withNotesOnly,
                    onToggleWithNotes = { viewModel.setWithNotesOnly(!withNotesOnly) },
                    sortOption = sortOption,
                    onSort = { viewModel.setSortOption(it) },
                    hasActiveFilters = hasActiveFilters,
                    activeFilterCount = activeFilterCount,
                    onClearFilters = {
                        searchQuery = ""
                        euOnly = false
                        freeOnly = false
                        viewModel.setSelectedPosition(null)
                        viewModel.setWithNotesOnly(false)
                        viewModel.setMyPlayersOnly(false)
                        viewModel.setSelectedAgentFilter(null)
                    },
                    monthAdds = monthAdds,
                    totalValue = totalValueEuros,
                    valuedCount = valuedCount,
                    freeCount = freeCount,
                    context = context,
                    removingUrls = state.removingUrls,
                    onBack = {
                        if (!navController.popBackStack(Screens.DashboardScreen.route, false)) {
                            navController.popBackStack()
                        }
                    },
                    onPlatformSwitch = { target -> platformManager.switchTo(target) },
                    onAdd = { navController.navigate(Screens.addToShortlistRoute()) },
                    onOpenTarget = { entry -> expandedPlayerUrl = if (expandedPlayerUrl == entry.tmProfileUrl) null else entry.tmProfileUrl },
                    onRemove = { entry -> entryToDelete = entry },
                    boundCard = boundCard
                )
            }

            // ── YOUTH: existing card list (teal accent), fully preserved ──
            Platform.YOUTH -> {
                Column(modifier = Modifier.fillMaxSize()) {
                    ShortlistHeader(
                        isYouth = true,
                        sortOption = sortOption,
                        onSortOptionSelected = { viewModel.setSortOption(it) },
                        onResetSort = { viewModel.setSortOption(SortOption.DEFAULT) },
                        onBackClicked = {
                            if (!navController.popBackStack(Screens.DashboardScreen.route, false)) {
                                navController.popBackStack()
                            }
                        }
                    )

                    ShortlistStatsStrip(
                        total = state.entries.size,
                        thisWeek = thisWeekCount
                    )

                    ShortlistPositionFilterChips(
                        selectedPosition = selectedPosition,
                        onChipClick = { pos ->
                            viewModel.setSelectedPosition(if (pos == "All" || pos == selectedPosition) null else pos)
                        }
                    )

                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(vertical = 4.dp)
                    ) {
                        item(key = "with_notes") {
                            ShortlistQuickFilterChip(
                                label = stringResource(R.string.shortlist_filter_with_notes),
                                isSelected = withNotesOnly,
                                onClick = { viewModel.setWithNotesOnly(!withNotesOnly) }
                            )
                        }
                    }

                    when {
                        state.isLoading -> {
                            SkeletonPlayerCardList(modifier = Modifier.fillMaxSize())
                        }
                        state.entries.isEmpty() -> {
                            ShortlistEmptyState(
                                onBrowseReleases = { navController.navigate(Screens.ReleasesScreen.route) },
                                onBrowseReturnees = { navController.navigate(Screens.ReturneeScreen.route) }
                            )
                        }
                        else -> {
                            LazyColumn(
                                state = listState,
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 100.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                items(filteredEntries, key = { it.tmProfileUrl }) { entry ->
                                    boundCard(entry)
                                }
                            }
                        }
                    }
                }

                // Youth add FAB (preserved).
                FloatingActionButton(
                    onClick = { navController.navigate(Screens.addToShortlistRoute()) },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 20.dp, bottom = 56.dp),
                    shape = RoundedCornerShape(18.dp),
                    containerColor = currentPlatform.accent,
                    contentColor = PlatformColors.palette.background
                ) {
                    Icon(
                        imageVector = Icons.Filled.PersonAdd,
                        contentDescription = stringResource(R.string.shortlist_add_player),
                        modifier = Modifier.size(24.dp),
                        tint = Color.White
                    )
                }
            }
        }
        } // end Box

        if (showAddPlayerBottomSheet) {
            val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            ModalBottomSheet(
                onDismissRequest = {
                    showAddPlayerBottomSheet = false
                    addPlayerTmUrl = null
                    addPlayerFallbackName = null
                    addPlayerViewModel.resetAfterAdd()
                },
                sheetState = sheetState,
                containerColor = PlatformColors.palette.card,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                tonalElevation = 8.dp,
                properties = ModalBottomSheetProperties(
                    isAppearanceLightStatusBars = true,
                    isAppearanceLightNavigationBars = true
                )
            ) {
                DarkSystemBarsForBottomSheet()
                when {
                    addPlayerState.value.showPlayerSelectedSearchProgress && selectedPlayer == null -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = PlatformColors.palette.accent)
                        }
                    }
                    selectedPlayer != null -> {
                        AddPlayerContactFormContent(
                            context = context,
                            viewModel = addPlayerViewModel
                        )
                    }
                    else -> {
                        Text(
                            text = stringResource(R.string.shortlist_could_not_load),
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp),
                            modifier = Modifier.padding(24.dp)
                        )
                    }
                }
            }
        }

        entryToDelete?.let { entry ->
            DeleteShortlistDialog(
                onDismissRequest = { entryToDelete = null },
                onRemoveClicked = {
                    viewModel.remove(entry)
                    entryToDelete = null
                }
            )
        }

        noteDialogEntry?.let { entry ->
            NoteDialog(
                context = context,
                entry = entry,
                mode = noteDialogMode,
                initialText = noteDialogText,
                allAccounts = allAccounts,
                currentUserName = currentUserName,
                onDismiss = {
                    noteDialogEntry = null
                    noteDialogText = ""
                    noteDialogEditIndex = -1
                },
                onSave = { text, taggedIds ->
                    if (noteDialogMode == "edit" && noteDialogEditIndex >= 0) {
                        viewModel.updateNote(entry.tmProfileUrl, noteDialogEditIndex, text)
                    } else {
                        viewModel.addNote(
                            entry.tmProfileUrl, text, taggedIds,
                            playerName = entry.playerName,
                            playerImage = entry.playerImage
                        )
                    }
                    noteDialogEntry = null
                    noteDialogText = ""
                    noteDialogEditIndex = -1
                }
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MEN EDITORIAL BODY (.brit-room) — web MenShortlist parity
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun MenShortlistBody(
    listState: androidx.compose.foundation.lazy.LazyListState,
    state: ShortlistUiState,
    filteredEntries: List<ShortlistEntry>,
    view: ShortlistView,
    onViewChange: (ShortlistView) -> Unit,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    selectedPosition: String?,
    onPositionGroup: (String) -> Unit,
    myPlayersOnly: Boolean,
    canFilterMyPlayers: Boolean,
    onToggleMyPlayers: () -> Unit,
    euOnly: Boolean,
    onToggleEu: () -> Unit,
    freeOnly: Boolean,
    onToggleFree: () -> Unit,
    withNotesOnly: Boolean,
    onToggleWithNotes: () -> Unit,
    sortOption: SortOption,
    onSort: (SortOption) -> Unit,
    hasActiveFilters: Boolean,
    activeFilterCount: Int,
    onClearFilters: () -> Unit,
    monthAdds: Int,
    totalValue: Long,
    valuedCount: Int,
    freeCount: Int,
    context: Context,
    removingUrls: Set<String>,
    onBack: () -> Unit,
    onPlatformSwitch: (Platform) -> Unit,
    onAdd: () -> Unit,
    onOpenTarget: (ShortlistEntry) -> Unit,
    onRemove: (ShortlistEntry) -> Unit,
    boundCard: @Composable (ShortlistEntry) -> Unit
) {
    val accent = BritTokens.gold
    val accentSoft = BritTokens.goldSoft

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 48.dp)
    ) {
        item(key = "chrome") {
            com.liordahan.mgsrteam.ui.components.BritTopHeader(
                platform = Platform.MEN,
                pageTitle = stringResource(R.string.shortlist_title),
                hasUnreadNotifications = false,
                onBellClick = {},
                onPlatformSwitch = onPlatformSwitch,
                showBack = true,
                onBackClick = onBack,
                showBell = false
            )
        }

        item(key = "masthead") {
            ShortlistMasthead(
                accent = accent,
                accentSoft = accentSoft,
                view = view,
                onViewChange = onViewChange,
                onAdd = onAdd
            )
        }

        item(key = "signals") {
            ShortlistSignals(
                targetCount = state.entries.size,
                monthAdds = monthAdds,
                totalValue = totalValue,
                valuedCount = valuedCount,
                freeCount = freeCount,
                accent = accent
            )
        }

        item(key = "tray") {
            ShortlistFilterTray(
                searchQuery = searchQuery,
                onSearchChange = onSearchChange,
                selectedPosition = selectedPosition,
                onPositionGroup = onPositionGroup,
                myPlayersOnly = myPlayersOnly,
                canFilterMyPlayers = canFilterMyPlayers,
                onToggleMyPlayers = onToggleMyPlayers,
                euOnly = euOnly,
                onToggleEu = onToggleEu,
                freeOnly = freeOnly,
                onToggleFree = onToggleFree,
                withNotesOnly = withNotesOnly,
                onToggleWithNotes = onToggleWithNotes,
                sortOption = sortOption,
                onSort = onSort,
                hasActiveFilters = hasActiveFilters,
                onClearFilters = onClearFilters,
                accent = accent,
                accentSoft = accentSoft
            )
        }

        item(key = "result_count") {
            ShortlistResultCount(
                visibleCount = filteredEntries.size,
                total = state.entries.size,
                activeFilterCount = activeFilterCount
            )
        }

        when {
            state.isLoading -> {
                item(key = "loader") {
                    SkeletonPlayerCardList(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(600.dp)
                    )
                }
            }
            filteredEntries.isEmpty() -> {
                item(key = "empty") { ShortlistFilteredEmpty() }
            }
            view == ShortlistView.BOARD -> {
                itemsIndexed(
                    items = filteredEntries,
                    key = { _, e -> e.tmProfileUrl }
                ) { index, entry ->
                    Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                        ShortlistBoardCard(
                            index = index,
                            entry = entry,
                            accent = accent,
                            accentSoft = accentSoft,
                            context = context,
                            boundCard = boundCard
                        )
                    }
                }
            }
            else -> {
                item(key = "ledger_head") { ShortlistLedgerHeader() }
                items(
                    items = filteredEntries,
                    key = { it.tmProfileUrl }
                ) { entry ->
                    ShortlistLedgerRow(
                        entry = entry,
                        accent = accent,
                        context = context,
                        isRemoving = entry.tmProfileUrl in removingUrls,
                        onClick = { onOpenTarget(entry) },
                        onRemove = { onRemove(entry) },
                        expandedContent = { boundCard(entry) }
                    )
                }
            }
        }
    }
}

// ── Masthead ─────────────────────────────────────────────────────────────────

@Composable
private fun ShortlistMasthead(
    accent: Color,
    accentSoft: Color,
    view: ShortlistView,
    onViewChange: (ShortlistView) -> Unit,
    onAdd: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(top = 20.dp, bottom = 18.dp)
    ) {
        Text(
            text = stringResource(R.string.shortlist_room_kicker),
            style = com.liordahan.mgsrteam.ui.theme.britMono(accent, 11.sp, letterSpacing = 1.4.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = androidx.compose.ui.text.buildAnnotatedString {
                append(stringResource(R.string.shortlist_room_head_a))
                append(" ")
                pushStyle(androidx.compose.ui.text.SpanStyle(color = accent))
                append(stringResource(R.string.shortlist_room_head_b))
                pop()
            },
            style = com.liordahan.mgsrteam.ui.theme.britDisplay(BritTokens.ink, 44.sp, weight = 600, letterSpacing = (-2).sp)
                .copy(lineHeight = 44.sp)
        )
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ShortlistViewToggle(
                view = view,
                accentSoft = accentSoft,
                onViewChange = onViewChange,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(12.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(BritTokens.black)
                    .clickWithNoRipple { onAdd() }
                    .padding(horizontal = 14.dp, vertical = 9.dp)
            ) {
                Text(
                    text = "+ ${stringResource(R.string.players_add)}",
                    style = com.liordahan.mgsrteam.ui.theme.britMono(accentSoft, 11.sp, letterSpacing = 1.sp)
                )
            }
        }
    }
}

@Composable
private fun ShortlistViewToggle(
    view: ShortlistView,
    accentSoft: Color,
    onViewChange: (ShortlistView) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(8.dp))
            .padding(2.dp)
    ) {
        ShortlistViewToggleButton(
            label = stringResource(R.string.shortlist_view_board),
            active = view == ShortlistView.BOARD,
            accentSoft = accentSoft,
            onClick = { onViewChange(ShortlistView.BOARD) },
            modifier = Modifier.weight(1f)
        )
        ShortlistViewToggleButton(
            label = stringResource(R.string.players_view_ledger),
            active = view == ShortlistView.LEDGER,
            accentSoft = accentSoft,
            onClick = { onViewChange(ShortlistView.LEDGER) },
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ShortlistViewToggleButton(
    label: String,
    active: Boolean,
    accentSoft: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (active) BritTokens.black else Color.Transparent)
            .clickWithNoRipple { onClick() }
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label.uppercase(),
            style = com.liordahan.mgsrteam.ui.theme.britMono(
                if (active) accentSoft else BritTokens.muted,
                9.sp,
                letterSpacing = 1.2.sp
            ),
            textAlign = TextAlign.Center,
            maxLines = 1
        )
    }
}

// ── Signals (3 equal hairline columns) ─────────────────────────────────────────

@Composable
private fun ShortlistSignals(
    targetCount: Int,
    monthAdds: Int,
    totalValue: Long,
    valuedCount: Int,
    freeCount: Int,
    accent: Color
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 22.dp)
    ) {
        HorizontalDivider(thickness = 1.dp, color = BritTokens.line)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(androidx.compose.foundation.layout.IntrinsicSize.Min)
        ) {
            ShortlistSignalColumn(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.shortlist_signal_targets),
                value = targetCount.toString().padStart(2, '0'),
                valueColor = BritTokens.ink,
                note = stringResource(R.string.shortlist_signal_targets_note).replace("{n}", monthAdds.toString())
            )
            ShortlistVerticalHairline()
            ShortlistSignalColumn(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.shortlist_signal_value),
                value = fmtShortlistValue(totalValue),
                valueColor = accent,
                note = stringResource(R.string.players_signal_value_note).replace("{n}", valuedCount.toString())
            )
            ShortlistVerticalHairline()
            ShortlistSignalColumn(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.shortlist_signal_free),
                value = freeCount.toString().padStart(2, '0'),
                valueColor = if (freeCount > 0) accent else BritTokens.ink,
                note = stringResource(R.string.players_signal_free_note)
            )
        }
        HorizontalDivider(thickness = 1.dp, color = BritTokens.line)
    }
}

@Composable
private fun ShortlistSignalColumn(
    modifier: Modifier,
    label: String,
    value: String,
    valueColor: Color,
    note: String
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .padding(vertical = 16.dp, horizontal = 10.dp)
    ) {
        Text(
            text = label.uppercase(),
            style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 0.6.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = value,
            style = com.liordahan.mgsrteam.ui.theme.britDisplay(valueColor, 28.sp, weight = 500, letterSpacing = (-1).sp),
            maxLines = 1
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = note.uppercase(),
            style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 0.5.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun ShortlistVerticalHairline() {
    Box(
        modifier = Modifier
            .fillMaxHeight()
            .width(1.dp)
            .background(BritTokens.line)
    )
}

// ── Filter tray ─────────────────────────────────────────────────────────────

@Composable
private fun ShortlistFilterTray(
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    selectedPosition: String?,
    onPositionGroup: (String) -> Unit,
    myPlayersOnly: Boolean,
    canFilterMyPlayers: Boolean,
    onToggleMyPlayers: () -> Unit,
    euOnly: Boolean,
    onToggleEu: () -> Unit,
    freeOnly: Boolean,
    onToggleFree: () -> Unit,
    withNotesOnly: Boolean,
    onToggleWithNotes: () -> Unit,
    sortOption: SortOption,
    onSort: (SortOption) -> Unit,
    hasActiveFilters: Boolean,
    onClearFilters: () -> Unit,
    accent: Color,
    accentSoft: Color
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(12.dp))
            .padding(14.dp)
    ) {
        ShortlistTraySearch(query = searchQuery, accent = accent, onQueryChange = onSearchChange)

        Spacer(Modifier.height(12.dp))

        ShortlistPositionSegment(
            selected = selectedPosition,
            accentSoft = accentSoft,
            onGroup = onPositionGroup
        )

        Spacer(Modifier.height(12.dp))

        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            ShortlistEditorialChip(
                label = stringResource(R.string.shortlist_filter_my_players),
                active = myPlayersOnly,
                accentSoft = accentSoft,
                enabled = canFilterMyPlayers,
                onClick = onToggleMyPlayers
            )
            ShortlistEditorialChip(
                label = "\uD83C\uDDEA\uD83C\uDDFA " + stringResource(R.string.players_filter_eu_national),
                active = euOnly,
                accentSoft = accentSoft,
                onClick = onToggleEu
            )
            ShortlistEditorialChip(
                label = stringResource(R.string.shortlist_filter_free_agent),
                active = freeOnly,
                accentSoft = accentSoft,
                onClick = onToggleFree
            )
            ShortlistEditorialChip(
                label = stringResource(R.string.shortlist_filter_with_notes),
                active = withNotesOnly,
                accentSoft = accentSoft,
                onClick = onToggleWithNotes
            )
        }

        Spacer(Modifier.height(14.dp))
        HorizontalDivider(thickness = 1.dp, color = BritTokens.line2)
        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = stringResource(R.string.players_sort_label).uppercase(),
                    style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 1.sp)
                )
                ShortlistSortButton(stringResource(R.string.shortlist_sort_added), sortOption == SortOption.DEFAULT, accent) { onSort(SortOption.DEFAULT) }
                ShortlistSortButton(stringResource(R.string.shortlist_sort_market_value), sortOption == SortOption.MARKET_VALUE, accent) { onSort(SortOption.MARKET_VALUE) }
                ShortlistSortButton(stringResource(R.string.shortlist_sort_name), sortOption == SortOption.NAME, accent) { onSort(SortOption.NAME) }
                ShortlistSortButton(stringResource(R.string.shortlist_sort_age), sortOption == SortOption.AGE, accent) { onSort(SortOption.AGE) }
            }
            if (hasActiveFilters) {
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.players_clear_filters) + " ×",
                    style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.red, 11.sp, letterSpacing = 0.8.sp),
                    modifier = Modifier.clickWithNoRipple { onClearFilters() }
                )
            }
        }
    }
}

@Composable
private fun ShortlistTraySearch(
    query: String,
    accent: Color,
    onQueryChange: (String) -> Unit
) {
    val keyboardController = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Filled.Search,
            contentDescription = null,
            tint = BritTokens.muted,
            modifier = Modifier.size(18.dp)
        )
        Spacer(Modifier.width(8.dp))
        Box(modifier = Modifier.weight(1f)) {
            if (query.isEmpty()) {
                Text(
                    text = stringResource(R.string.search_placeholder),
                    style = com.liordahan.mgsrteam.ui.theme.britBody(BritTokens.muted2, 13.sp)
                )
            }
            androidx.compose.foundation.text.BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = com.liordahan.mgsrteam.ui.theme.britBody(BritTokens.ink, 13.sp),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(accent),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    imeAction = androidx.compose.ui.text.input.ImeAction.Done,
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Text
                ),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                    onDone = {
                        keyboardController?.hide()
                        focusManager.clearFocus()
                    }
                ),
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (query.isNotEmpty()) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.players_clear_filters),
                tint = BritTokens.muted,
                modifier = Modifier
                    .size(16.dp)
                    .clickWithNoRipple {
                        onQueryChange("")
                        keyboardController?.hide()
                        focusManager.clearFocus()
                    }
            )
        }
    }
}

@Composable
private fun ShortlistPositionSegment(
    selected: String?,
    accentSoft: Color,
    onGroup: (String) -> Unit
) {
    val groups = listOf("GK", "DEF", "MID", "FWD")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(8.dp))
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        ShortlistSegmentButton(
            label = stringResource(R.string.releases_all),
            active = selected == null,
            accentSoft = accentSoft,
            onClick = { onGroup("All") },
            modifier = Modifier.weight(1f)
        )
        groups.forEach { g ->
            ShortlistSegmentButton(
                label = g,
                active = selected.equals(g, ignoreCase = true),
                accentSoft = accentSoft,
                onClick = { onGroup(g) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun ShortlistSegmentButton(
    label: String,
    active: Boolean,
    accentSoft: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (active) accentSoft else Color.Transparent)
            .clickWithNoRipple { onClick() }
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label.uppercase(),
            style = com.liordahan.mgsrteam.ui.theme.britMono(
                if (active) BritTokens.ink else BritTokens.muted,
                9.sp,
                letterSpacing = 1.sp
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun ShortlistEditorialChip(
    label: String,
    active: Boolean,
    accentSoft: Color,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    val alpha = if (enabled) 1f else 0.4f
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(if (active) BritTokens.black else Color.Transparent)
            .border(
                1.dp,
                if (active) BritTokens.black else BritTokens.line,
                RoundedCornerShape(20.dp)
            )
            .then(if (enabled) Modifier.clickWithNoRipple { onClick() } else Modifier)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(accentSoft.copy(alpha = if (active) 1f else 0.5f * alpha))
        )
        Text(
            text = label,
            style = com.liordahan.mgsrteam.ui.theme.britMono(
                if (active) accentSoft.copy(alpha = alpha) else BritTokens.muted.copy(alpha = alpha),
                9.sp,
                letterSpacing = 0.6.sp
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun ShortlistSortButton(
    label: String,
    active: Boolean,
    accent: Color,
    onClick: () -> Unit
) {
    Text(
        text = label,
        style = com.liordahan.mgsrteam.ui.theme.britMono(
            if (active) accent else BritTokens.muted,
            9.sp,
            letterSpacing = 0.6.sp
        ),
        maxLines = 1,
        modifier = Modifier.clickWithNoRipple { onClick() }
    )
}

// ── Result count + empty ──────────────────────────────────────────────────────

@Composable
private fun ShortlistResultCount(
    visibleCount: Int,
    total: Int,
    activeFilterCount: Int
) {
    val base = stringResource(R.string.shortlist_showing)
        .replace("{n}", visibleCount.toString())
        .replace("{total}", total.toString())
    val text = if (activeFilterCount > 0) {
        base + "  /  " + stringResource(R.string.players_filters_active).replace("{n}", activeFilterCount.toString())
    } else base
    Text(
        text = text.uppercase(),
        style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 0.8.sp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 12.dp)
    )
}

@Composable
private fun ShortlistFilteredEmpty() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 60.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(R.string.shortlist_empty),
            style = com.liordahan.mgsrteam.ui.theme.britBody(BritTokens.muted, 14.sp, weight = 500),
            textAlign = TextAlign.Center
        )
    }
}

// ── Board card (grayscale media + value + foot + actions, expandable detail) ──

@Composable
private fun ShortlistBoardCard(
    index: Int,
    entry: ShortlistEntry,
    accent: Color,
    accentSoft: Color,
    context: Context,
    boundCard: @Composable (ShortlistEntry) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val club = entry.clubJoinedName?.takeIf { it.isNotBlank() && !shortlistIsFreeAgent(it) }
        ?: stringResource(R.string.players_filter_without_club)
    val position = entry.playerPosition?.takeIf { it.isNotBlank() } ?: "—"
    val isEu = EuCountries.isEuNational(entry.playerNationality)
    val isFree = shortlistIsFreeAgent(entry.clubJoinedName)
    val agentName = entry.getAddedByDisplayName(context) ?: "—"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(12.dp))
    ) {
        // Media area
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(170.dp)
                .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                .clickWithNoRipple { expanded = !expanded }
        ) {
            GrayscalePlayerPhoto(
                imageUrl = entry.playerImage,
                name = entry.playerName ?: "—",
                modifier = Modifier.fillMaxSize()
            ) {
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .fillMaxWidth()
                        .padding(10.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Text(
                        text = (index + 1).toString().padStart(2, '0'),
                        style = com.liordahan.mgsrteam.ui.theme.britMono(accentSoft, 11.sp, letterSpacing = 1.sp)
                    )
                    Spacer(Modifier.weight(1f))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        if (isEu) {
                            Text(
                                text = stringResource(R.string.eu_nat_tag),
                                style = com.liordahan.mgsrteam.ui.theme.britMono(accent, 11.sp, letterSpacing = 0.6.sp)
                            )
                        }
                        if (isFree) {
                            Text(
                                text = stringResource(R.string.shortlist_free_tag),
                                style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.green, 11.sp, letterSpacing = 0.6.sp)
                            )
                        }
                    }
                }
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(12.dp)
                ) {
                    Text(
                        text = "$club / $position".uppercase(),
                        style = com.liordahan.mgsrteam.ui.theme.britMono(accentSoft, 11.sp, letterSpacing = 0.8.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = (entry.playerName ?: "—").uppercase(),
                        style = com.liordahan.mgsrteam.ui.theme.britDisplay(BritTokens.paper, 18.sp, weight = 600),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }

        // Body: value row + watcher foot
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(
                text = entry.marketValue?.takeIf { it.isNotBlank() } ?: "—",
                style = com.liordahan.mgsrteam.ui.theme.britDisplay(BritTokens.ink, 20.sp, weight = 600, letterSpacing = (-0.5).sp),
                maxLines = 1
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(accent),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = agentName.firstOrNull()?.uppercase() ?: "?",
                        style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.paper, 11.sp, letterSpacing = 0.sp)
                    )
                }
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "$agentName · ${formatRelativeDate(entry.addedAt)}",
                    style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 0.4.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = if (expanded) "−" else "+",
                    style = com.liordahan.mgsrteam.ui.theme.britMono(accent, 14.sp, letterSpacing = 0.sp),
                    modifier = Modifier.clickWithNoRipple { expanded = !expanded }
                )
            }

            // Actions row — mirrors the web `.brit-sl-actions` TM ↗ / WA pair,
            // shown only for a transfermarkt link (same guard as the web
            // `shareToTeam` / card actions). TM opens the profile; WA shares the
            // TM link to the team via WhatsApp using the existing Intent path.
            if (entry.tmProfileUrl.contains("transfermarkt")) {
                val shareMessage = stringResource(R.string.shortlist_share_message)
                Spacer(Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "TM ↗",
                        style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.ink, 11.sp, letterSpacing = 0.8.sp),
                        modifier = Modifier.clickWithNoRipple {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, entry.tmProfileUrl.toUri())
                            )
                        }
                    )
                    Text(
                        text = stringResource(R.string.shortlist_share_whatsapp),
                        style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.green, 11.sp, letterSpacing = 0.8.sp),
                        modifier = Modifier.clickWithNoRipple {
                            val text = "${entry.tmProfileUrl}\n\n$shareMessage"
                            val uri = "https://api.whatsapp.com/send?text=${Uri.encode(text)}".toUri()
                            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                        }
                    )
                }
            }
        }

        // Expanded detail = the fully-wired card (notes + teammates + outreach + actions)
        if (expanded) {
            HorizontalDivider(thickness = 1.dp, color = BritTokens.line)
            Box(modifier = Modifier.padding(10.dp)) {
                boundCard(entry)
            }
        }
    }
}

// ── Ledger (hairline table) ───────────────────────────────────────────────────

private const val SL_W_TARGET = 2.4f
private const val SL_W_CLUB = 1.5f
private const val SL_W_POS = 1.2f
private const val SL_W_VALUE = 1.2f
private const val SL_W_CHANGE = 0.8f
private const val SL_W_SCOUT = 1.6f
private const val SL_W_ACTION = 1.1f

@Composable
private fun ShortlistLedgerHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(top = 4.dp, bottom = 8.dp)
    ) {
        ShortlistLedgerHeaderCell(stringResource(R.string.shortlist_th_target), SL_W_TARGET)
        ShortlistLedgerHeaderCell(stringResource(R.string.room_th_club), SL_W_CLUB)
        ShortlistLedgerHeaderCell(stringResource(R.string.room_th_position), SL_W_POS)
        ShortlistLedgerHeaderCell(stringResource(R.string.room_th_value), SL_W_VALUE)
        ShortlistLedgerHeaderCell(stringResource(R.string.shortlist_th_change), SL_W_CHANGE)
        ShortlistLedgerHeaderCell(stringResource(R.string.shortlist_th_scout), SL_W_SCOUT)
        ShortlistLedgerHeaderCell(stringResource(R.string.room_th_action), SL_W_ACTION, end = true)
    }
}

@Composable
private fun RowScope.ShortlistLedgerHeaderCell(label: String, weight: Float, end: Boolean = false) {
    Text(
        text = label.uppercase(),
        style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 0.8.sp),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        textAlign = if (end) TextAlign.End else TextAlign.Start,
        modifier = Modifier.weight(weight)
    )
}

@Composable
private fun ShortlistLedgerRow(
    entry: ShortlistEntry,
    accent: Color,
    context: Context,
    isRemoving: Boolean,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    expandedContent: @Composable () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val club = entry.clubJoinedName?.takeIf { it.isNotBlank() && !shortlistIsFreeAgent(it) }
        ?: stringResource(R.string.players_filter_without_club)
    val position = entry.playerPosition?.takeIf { it.isNotBlank() } ?: "—"
    val isEu = EuCountries.isEuNational(entry.playerNationality)
    val isFree = shortlistIsFreeAgent(entry.clubJoinedName)
    val agentName = entry.getAddedByDisplayName(context) ?: "—"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple {
                expanded = !expanded
                onClick()
            }
    ) {
        HorizontalDivider(thickness = 1.dp, color = BritTokens.line)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Target (thumb + name over nationality + age)
            Row(
                modifier = Modifier.weight(SL_W_TARGET),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(6.dp))
                ) {
                    GrayscalePlayerPhoto(
                        imageUrl = entry.playerImage,
                        name = entry.playerName ?: "?",
                        modifier = Modifier.fillMaxSize(),
                        scrimAlpha = 0.3f
                    )
                }
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = entry.playerName ?: "—",
                        style = com.liordahan.mgsrteam.ui.theme.britBody(BritTokens.ink, 12.sp, weight = 700),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = buildString {
                            append((entry.playerNationality ?: "—"))
                            entry.playerAge?.takeIf { it.isNotBlank() }?.let { append(" · $it") }
                        }.uppercase(),
                        style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 0.5.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Text(
                text = club,
                style = com.liordahan.mgsrteam.ui.theme.britBody(BritTokens.muted, 11.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(SL_W_CLUB)
            )
            Text(
                text = position,
                style = com.liordahan.mgsrteam.ui.theme.britBody(BritTokens.ink, 11.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(SL_W_POS)
            )
            Text(
                text = entry.marketValue?.takeIf { it.isNotBlank() } ?: "—",
                style = com.liordahan.mgsrteam.ui.theme.britBody(BritTokens.ink, 11.sp, weight = 600),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(SL_W_VALUE)
            )
            // Change column — no value history on Android ShortlistEntry (deferred).
            Text(
                text = "—",
                style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp),
                maxLines = 1,
                modifier = Modifier.weight(SL_W_CHANGE)
            )
            Text(
                text = "$agentName · ${formatRelativeDate(entry.addedAt)}",
                style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.muted, 11.sp, letterSpacing = 0.3.sp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(SL_W_SCOUT)
            )
            FlowRow(
                modifier = Modifier.weight(SL_W_ACTION),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                if (isEu) {
                    Text(
                        text = stringResource(R.string.eu_nat_tag),
                        style = com.liordahan.mgsrteam.ui.theme.britMono(accent, 11.sp, letterSpacing = 0.4.sp)
                    )
                }
                if (isFree) {
                    Text(
                        text = stringResource(R.string.shortlist_free_tag),
                        style = com.liordahan.mgsrteam.ui.theme.britMono(BritTokens.green, 11.sp, letterSpacing = 0.4.sp)
                    )
                }
                Text(
                    text = "✕",
                    style = com.liordahan.mgsrteam.ui.theme.britMono(
                        if (isRemoving) BritTokens.muted2 else BritTokens.red,
                        10.sp
                    ),
                    modifier = if (isRemoving) Modifier else Modifier.clickWithNoRipple { onRemove() }
                )
            }
        }
        if (expanded) {
            Box(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                expandedContent()
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistHeader(
    isYouth: Boolean = false,
    sortOption: SortOption = SortOption.DEFAULT,
    onSortOptionSelected: (SortOption) -> Unit = {},
    onResetSort: () -> Unit = {},
    onBackClicked: () -> Unit
) {
    var sortMenuExpanded by remember { mutableStateOf(false) }
    val isMen = !isYouth
    val platformAccent = if (isMen) MenShortlistGold else PlatformColors.palette.accent

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 12.dp, top = 24.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textSecondary,
            modifier = Modifier
                .size(24.dp)
                .clickWithNoRipple { onBackClicked() }
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.shortlist_title),
                style = boldTextStyle(if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary, 26.sp)
            )
            Text(
                text = stringResource(
                    if (isYouth) R.string.youth_shortlist_subtitle
                    else R.string.shortlist_subtitle
                ),
                style = regularTextStyle(if (isMen) MenShortlistTextSubtle else PlatformColors.palette.textSecondary, 12.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        // Sort button
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(if (isMen) MenShortlistCardAlt.copy(alpha = 0.95f) else PlatformColors.palette.card.copy(alpha = 0.8f))
                .border(
                    width = if (isMen) 1.dp else 0.dp,
                    color = if (isMen) MenShortlistBorder else Color.Transparent,
                    shape = RoundedCornerShape(8.dp)
                )
                .clickWithNoRipple { sortMenuExpanded = true }
                .padding(12.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.SwapVert,
                contentDescription = stringResource(R.string.shortlist_sort_options),
                tint = platformAccent,
                modifier = Modifier.size(24.dp)
            )
            DropdownMenu(
                expanded = sortMenuExpanded,
                onDismissRequest = { sortMenuExpanded = false },
                modifier = Modifier.background(if (isMen) MenShortlistCard else PlatformColors.palette.card),
                containerColor = if (isMen) MenShortlistCard else PlatformColors.palette.card
            ) {
                DropdownMenuItem(
                    text = {
                        Text(
                            text = stringResource(R.string.players_reset),
                            style = regularTextStyle(if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary, 13.sp)
                        )
                    },
                    onClick = {
                        onResetSort()
                        sortMenuExpanded = false
                    }
                )
                DropdownMenuItem(
                    text = {
                        Text(
                            text = stringResource(R.string.players_sort_market_value),
                            style = regularTextStyle(
                                if (sortOption == SortOption.MARKET_VALUE) platformAccent else if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary,
                                13.sp
                            )
                        )
                    },
                    onClick = {
                        onSortOptionSelected(SortOption.MARKET_VALUE)
                        sortMenuExpanded = false
                    }
                )
                DropdownMenuItem(
                    text = {
                        Text(
                            text = stringResource(R.string.players_sort_name),
                            style = regularTextStyle(
                                if (sortOption == SortOption.NAME) platformAccent else if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary,
                                13.sp
                            )
                        )
                    },
                    onClick = {
                        onSortOptionSelected(SortOption.NAME)
                        sortMenuExpanded = false
                    }
                )
                DropdownMenuItem(
                    text = {
                        Text(
                            text = stringResource(R.string.players_sort_age),
                            style = regularTextStyle(
                                if (sortOption == SortOption.AGE) platformAccent else if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary,
                                13.sp
                            )
                        )
                    },
                    onClick = {
                        onSortOptionSelected(SortOption.AGE)
                        sortMenuExpanded = false
                    }
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS STRIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistStatsStrip(
    total: Int,
    thisWeek: Int
) {
    val isMen = shortlistIsMen()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (isMen) MenShortlistCard else PlatformColors.palette.card)
            .border(1.dp, if (isMen) MenShortlistBorder else PlatformColors.palette.cardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        ShortlistStatItem(
            value = total.toString(),
            label = stringResource(R.string.players_stat_total),
            accentColor = if (isMen) MenShortlistGold else PlatformColors.palette.accent,
            modifier = Modifier.weight(1f)
        )
        ShortlistStatsStripDivider()
        ShortlistStatItem(
            value = thisWeek.toString(),
            label = stringResource(R.string.shortlist_stat_this_week),
            accentColor = if (isMen) MenShortlistBronze else PlatformColors.palette.orange,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ShortlistStatItem(
    value: String,
    label: String,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val isMen = shortlistIsMen()
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(accentColor)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = value,
            style = boldTextStyle(if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary, 18.sp)
        )
        Text(
            text = label,
            style = regularTextStyle(if (isMen) MenShortlistTextSubtle else PlatformColors.palette.textSecondary, 11.sp)
        )
    }
}

@Composable
private fun ShortlistStatsStripDivider() {
    val isMen = shortlistIsMen()
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .padding(vertical = 4.dp)
            .background(if (isMen) MenShortlistBorder else PlatformColors.palette.cardBorder)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  POSITION FILTER CHIPS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistPositionFilterChips(
    selectedPosition: String?,
    onChipClick: (String) -> Unit
) {
    val positions = listOf("All") + AppConfigManager.positions.filterList
    val scrollState = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .horizontalScroll(scrollState),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        positions.forEach { position ->
            val isSelected = if (position == "All") selectedPosition == null
            else position == selectedPosition

            val bgColor by animateColorAsState(
                targetValue = if (isSelected) shortlistAccentColor() else Color.Transparent,
                label = "chipBg"
            )
            val textColor = if (isSelected) if (shortlistIsMen()) MenShortlistBg else PlatformColors.palette.background else shortlistMutedTextColor()
            val borderColor = if (isSelected) shortlistAccentColor() else shortlistBorderColor()

            Text(
                text = when (position) {
                    "All" -> stringResource(R.string.shortlist_filter_position_all)
                    "GK" -> stringResource(R.string.shortlist_filter_position_gk)
                    "CB" -> stringResource(R.string.shortlist_filter_position_cb)
                    "RB" -> stringResource(R.string.shortlist_filter_position_rb)
                    "LB" -> stringResource(R.string.shortlist_filter_position_lb)
                    "DM" -> stringResource(R.string.shortlist_filter_position_dm)
                    "CM" -> stringResource(R.string.shortlist_filter_position_cm)
                    "AM" -> stringResource(R.string.shortlist_filter_position_am)
                    "LW" -> stringResource(R.string.shortlist_filter_position_lw)
                    "RW" -> stringResource(R.string.shortlist_filter_position_rw)
                    "CF" -> stringResource(R.string.shortlist_filter_position_cf)
                    "SS" -> stringResource(R.string.shortlist_filter_position_ss)
                    else -> position
                },
                style = boldTextStyle(textColor, 11.sp),
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(bgColor)
                    .border(1.dp, borderColor, RoundedCornerShape(20.dp))
                    .clickWithNoRipple { onChipClick(position) }
                    .padding(horizontal = 14.dp, vertical = 5.dp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QUICK FILTER CHIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistQuickFilterChip(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val bgColor by animateColorAsState(
        targetValue = if (isSelected) shortlistAccentColor() else Color.Transparent,
        label = "quickChipBg"
    )
    val textColor = if (isSelected) if (shortlistIsMen()) MenShortlistBg else PlatformColors.palette.background else shortlistMutedTextColor()
    val borderColor = if (isSelected) shortlistAccentColor() else shortlistBorderColor()

    Text(
        text = label,
        style = boldTextStyle(textColor, 11.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(20.dp))
            .clickWithNoRipple { onClick() }
            .padding(horizontal = 14.dp, vertical = 5.dp)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  MARKET VALUE PARSER (for sorting)
// ═════════════════════════════════════════════════════════════════════════════

private fun parseShortlistMarketValue(s: String?): Long {
    if (s.isNullOrBlank() || (s.contains("-") && !s.contains("€"))) return 0L
    val cleaned = s.replace("€", "").replace(",", "").trim()
    return when {
        cleaned.contains("m", true) -> ((cleaned.substringBefore("m").substringBefore("M").trim().toDoubleOrNull() ?: 0.0) * 1_000_000).toLong()
        cleaned.contains("k", true) -> ((cleaned.substringBefore("k").substringBefore("K").trim().toDoubleOrNull() ?: 0.0) * 1_000).toLong()
        else -> cleaned.toLongOrNull() ?: 0L
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHORTLIST CARD (rich layout like ReleaseListItem)
// ═════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShortlistCard(
    context: Context,
    entry: ShortlistEntry,
    isYouth: Boolean = false,
    rosterTeammates: List<RosterTeammateMatch>? = null,
    isLoadingTeammates: Boolean = false,
    isTeammatesExpanded: Boolean = false,
    onToggleTeammatesExpand: () -> Unit = {},
    onRosterTeammateClick: (Player) -> Unit = {},
    isNotesExpanded: Boolean = false,
    onToggleNotesExpand: () -> Unit = {},
    onAddNote: () -> Unit = {},
    onEditNote: (noteIndex: Int, currentText: String) -> Unit = { _, _ -> },
    onDeleteNote: (noteIndex: Int) -> Unit = {},
    onAddToAgency: () -> Unit,
    onOpenTm: () -> Unit,
    onRemove: () -> Unit,
    igConfirmUrl: String? = null,
    onInstagramOutreach: () -> Unit = {},
    onConfirmIgSent: () -> Unit = {},
    onDismissIgConfirm: () -> Unit = {}
) {
    var showMenu by remember { mutableStateOf(false) }
    val isMen = shortlistIsMen()
    val cardColor = if (isMen) MenShortlistCard else PlatformColors.palette.card
    val borderColor = if (isMen) MenShortlistBorder else PlatformColors.palette.cardBorder
    val accent = if (isMen) MenShortlistGold else PlatformColors.palette.accent
    val muted = if (isMen) MenShortlistTextSubtle else PlatformColors.palette.textSecondary
    val titleColor = if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary
    val release = entry.toLatestTransferModel()
    Box(modifier = Modifier.fillMaxWidth()) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onOpenTm,
                    onLongClick = { showMenu = true }
                ),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor),
        border = BorderStroke(1.dp, borderColor)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = accent,
                        topLeft = Offset.Zero,
                        size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height)
                    )
                }
        ) {
            // Top row: Avatar + Name/Position/Age/Nationality + Value
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (!release.playerImage.isNullOrBlank()) {
                    var showFallback by remember { mutableStateOf(false) }
                    if (showFallback) {
                        // Initials fallback
                        val initials = release.playerName
                            ?.split(" ")
                            ?.mapNotNull { it.firstOrNull()?.uppercase() }
                            ?.take(2)
                            ?.joinToString("") ?: "?"
                        val gradientColors = if (isYouth) listOf(PlatformYouthAccent, PlatformYouthSecondary)
                            else listOf(PlatformColors.palette.accent, PlatformColors.palette.cardBorder)
                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .clip(CircleShape)
                                .background(Brush.linearGradient(gradientColors))
                                .border(2.dp, borderColor, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = initials,
                                style = boldTextStyle(Color.White, 18.sp)
                            )
                        }
                    } else {
                        AsyncImage(
                            model = release.playerImage,
                            contentDescription = null,
                            modifier = Modifier
                                .size(52.dp)
                                .clip(CircleShape)
                                .border(2.dp, borderColor, CircleShape),
                            contentScale = ContentScale.Crop,
                            onError = { showFallback = true }
                        )
                    }
                } else {
                    // No image at all — initials placeholder
                    val initials = release.playerName
                        ?.split(" ")
                        ?.mapNotNull { it.firstOrNull()?.uppercase() }
                        ?.take(2)
                        ?.joinToString("") ?: "?"
                    val gradientColors = if (isYouth) listOf(PlatformYouthAccent, PlatformYouthSecondary)
                        else listOf(borderColor, borderColor)
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(gradientColors)),
                        contentAlignment = Alignment.Center
                    ) {
                        if (isYouth) {
                            Text(
                                text = initials,
                                style = boldTextStyle(Color.White, 18.sp)
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = muted,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.width(10.dp))

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .align(Alignment.CenterVertically)
                ) {
                    Text(
                        text = formatShortlistProfileDisplay(entry),
                        style = boldTextStyle(titleColor, 14.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    FlowRow(
                        modifier = Modifier.padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        release.playerPosition?.takeIf { it.isNotBlank() }?.let { pos ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(accent.copy(alpha = 0.15f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = pos,
                                    style = boldTextStyle(accent, 11.sp)
                                )
                            }
                        }
                        release.playerAge?.takeIf { it.isNotBlank() }?.let { age ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(borderColor.copy(alpha = 0.5f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "$age${stringResource(R.string.shortlist_years_suffix)}",
                                    style = regularTextStyle(muted, 11.sp)
                                )
                            }
                        }
                        if (!release.playerNationalityFlag.isNullOrBlank() || !release.playerNationality.isNullOrBlank()) {
                            val nat = release.playerNationality?.takeIf { it.isNotBlank() }.orEmpty()
                            val chipContent = @Composable {
                                Row(
                                    modifier = Modifier
                                        .widthIn(max = 140.dp)
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(borderColor.copy(alpha = 0.5f))
                                        .padding(horizontal = 6.dp, vertical = 2.dp),
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    if (!release.playerNationalityFlag.isNullOrBlank()) {
                                        AsyncImage(
                                            model = release.playerNationalityFlag,
                                            contentDescription = release.playerNationality,
                                            modifier = Modifier.size(14.dp).clip(CircleShape),
                                            contentScale = ContentScale.Crop
                                        )
                                    }
                                    if (nat.isNotBlank()) {
                                        Text(
                                            text = nat,
                                            style = regularTextStyle(muted, 11.sp),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                            if (nat.isNotBlank()) {
                                TooltipBox(
                                    positionProvider = TooltipDefaults.rememberTooltipPositionProvider(),
                                    tooltip = { PlainTooltip { Text(nat) } },
                                    state = rememberTooltipState()
                                ) {
                                    chipContent()
                                }
                            } else {
                                chipContent()
                            }
                        }
                    }
                }

                Column(
                    modifier = Modifier.align(Alignment.Top),
                    horizontalAlignment = Alignment.End
                ) {
                    release.marketValue?.takeIf { it.isNotBlank() }?.let { value ->
                        Text(
                            text = value,
                            style = boldTextStyle(titleColor, 14.sp)
                        )
                    }
                    Text(
                        text = formatRelativeDate(entry.addedAt),
                        style = regularTextStyle(muted, 11.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                    entry.getAddedByDisplayName(context)?.let { agentName ->
                        Text(
                            text = stringResource(R.string.shortlist_added_by, agentName),
                            style = regularTextStyle(muted, 11.sp),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }

            HorizontalDivider(
                color = borderColor.copy(alpha = 0.5f),
                thickness = 1.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )

            // ── Notes section ──
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(PlatformColors.palette.background)
                    .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                    .clickWithNoRipple {
                        if (entry.notes.isEmpty()) onAddNote() else onToggleNotesExpand()
                    }
                    .padding(8.dp, 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.EditNote,
                    contentDescription = null,
                    tint = if (isMen) MenShortlistBronze else PlatformColors.palette.orange,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (entry.notes.isEmpty())
                        stringResource(R.string.shortlist_notes_tap_to_add)
                    else
                        stringResource(R.string.shortlist_notes_count, entry.notes.size),
                    style = regularTextStyle(titleColor, 13.sp)
                )
                Spacer(Modifier.weight(1f))
                if (entry.notes.isNotEmpty()) {
                    Icon(
                        Icons.Default.ExpandMore,
                        contentDescription = if (isNotesExpanded) "Collapse" else "Expand",
                        tint = muted,
                        modifier = Modifier
                            .size(20.dp)
                            .graphicsLayer { rotationZ = if (isNotesExpanded) 180f else 0f }
                    )
                }
            }
            if (isNotesExpanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, end = 12.dp, bottom = 8.dp)
                ) {
                    entry.notes.forEachIndexed { idx, note ->
                        ShortlistNoteItem(
                            context = context,
                            note = note,
                            onEdit = { onEditNote(idx, note.text) },
                            onDelete = { onDeleteNote(idx) }
                        )
                    }
                    // Add note button
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background((if (isMen) MenShortlistBronze else PlatformColors.palette.orange).copy(alpha = 0.1f))
                            .border(1.dp, (if (isMen) MenShortlistBronze else PlatformColors.palette.orange).copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                            .clickWithNoRipple { onAddNote() }
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Rounded.Add,
                            contentDescription = null,
                            tint = if (isMen) MenShortlistBronze else PlatformColors.palette.orange,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.shortlist_notes_add),
                            style = boldTextStyle(if (isMen) MenShortlistBronze else PlatformColors.palette.orange, 12.sp)
                        )
                    }
                }
            }

            // Roster teammates section (same as Releases) — men only
            if (!isYouth) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(PlatformColors.palette.background)
                    .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                    .clickWithNoRipple { onToggleTeammatesExpand() }
                    .padding(8.dp, 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.People,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = when {
                        isTeammatesExpanded && isLoadingTeammates -> stringResource(R.string.releases_roster_teammates_loading)
                        isTeammatesExpanded && rosterTeammates != null -> if (rosterTeammates.size == 1) stringResource(R.string.releases_roster_teammates_one, rosterTeammates.size) else stringResource(R.string.releases_roster_teammates, rosterTeammates.size)
                        else -> stringResource(R.string.releases_roster_teammates_tap)
                    },
                    style = regularTextStyle(titleColor, 13.sp)
                )
                Spacer(Modifier.weight(1f))
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = if (isTeammatesExpanded) "Collapse" else "Expand",
                    tint = muted,
                    modifier = Modifier
                        .size(20.dp)
                        .graphicsLayer { rotationZ = if (isTeammatesExpanded) 180f else 0f }
                )
            }
            if (isTeammatesExpanded) {
                if (isLoadingTeammates) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(PlatformColors.palette.background)
                            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = accent,
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    }
                } else if (rosterTeammates.isNullOrEmpty()) {
                    Text(
                        text = stringResource(R.string.releases_no_roster_teammates),
                        style = regularTextStyle(muted, 12.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(PlatformColors.palette.background)
                            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    )
                } else {
                    Column(modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 8.dp)) {
                        rosterTeammates.forEach { match ->
                            ShortlistRosterTeammateRow(
                                player = match.player,
                                matchesPlayedTogether = match.matchesPlayedTogether,
                                targetPlayerName = entry.playerName.orEmpty(),
                                onClick = { onRosterTeammateClick(match.player) }
                            )
                        }
                    }
                }
            }
            } // end if (!isYouth)

            // ── Instagram "sent" badge ──
            if (entry.instagramSentAt != null) {
                Row(
                    modifier = Modifier
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFFE1306C).copy(alpha = 0.15f))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = stringResource(
                                R.string.shortlist_ig_sent,
                                formatBareRelativeDate(entry.instagramSentAt)
                            ),
                            style = boldTextStyle(Color(0xFFE1306C), 11.sp)
                        )
                    }
                }
            }

            // ── Action bar ──
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(accent.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = stringResource(R.string.shortlist_badge),
                            style = boldTextStyle(accent, 11.sp)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    // Instagram DM button
                    if (!entry.instagramHandle.isNullOrBlank()) {
                        IconButton(
                            onClick = onInstagramOutreach,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                painter = InstagramIconPainter(),
                                contentDescription = stringResource(
                                    R.string.shortlist_ig_dm,
                                    entry.instagramHandle
                                ),
                                tint = Color(0xFFE1306C),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    IconButton(
                        onClick = onAddToAgency,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.PersonAdd,
                            contentDescription = stringResource(R.string.shortlist_add_to_agency),
                            tint = accent
                        )
                    }
                }
            }

            // ── Instagram DM confirmation bar ──
            if (igConfirmUrl == entry.tmProfileUrl) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFE1306C).copy(alpha = 0.06f))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        painter = InstagramIconPainter(),
                        contentDescription = null,
                        tint = Color(0xFFE1306C),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = stringResource(R.string.shortlist_ig_confirm_question),
                        style = regularTextStyle(Color(0xFFE1306C).copy(alpha = 0.8f), 12.sp),
                        modifier = Modifier.weight(1f)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(100.dp))
                            .background(Color(0xFFE1306C).copy(alpha = 0.2f))
                            .border(1.dp, Color(0xFFE1306C).copy(alpha = 0.25f), RoundedCornerShape(100.dp))
                            .clickWithNoRipple { onConfirmIgSent() }
                            .padding(horizontal = 12.dp, vertical = 5.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.shortlist_ig_confirm_yes),
                            style = boldTextStyle(Color(0xFFE1306C), 11.sp)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(100.dp))
                            .clickWithNoRipple { onDismissIgConfirm() }
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.shortlist_ig_confirm_no),
                            style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 11.sp)
                        )
                    }
                }
            }
        }
    }
    DropdownMenu(
        expanded = showMenu,
        onDismissRequest = { showMenu = false },
        modifier = Modifier.background(PlatformColors.palette.card),
        containerColor = PlatformColors.palette.card,
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        DropdownMenuItem(
            text = {
                Text(
                    text = stringResource(R.string.shortlist_remove),
                    style = regularTextStyle(PlatformColors.palette.red, 14.sp)
                )
            },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = PlatformColors.palette.red
                )
            },
            onClick = {
                showMenu = false
                onRemove()
            }
        )
    }
    }
}

@Composable
private fun ShortlistRosterTeammateRow(
    player: Player,
    matchesPlayedTogether: Int,
    targetPlayerName: String = "",
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val playerPhone = player.getPlayerPhoneNumber()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 6.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(PlatformColors.palette.background)
            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
            .clickWithNoRipple { onClick() }
            .padding(10.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        player.profileImage?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = null,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop
            )
        } ?: run {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(PlatformColors.palette.cardBorder),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    (player.fullName?.take(2) ?: "?").uppercase(),
                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                player.fullName ?: "Unknown",
                style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = listOfNotNull(
                    player.positions?.firstOrNull()?.takeIf { it.isNotBlank() },
                    player.age?.let { "$it" },
                    player.marketValue?.takeIf { it.isNotBlank() }
                ).joinToString(" · ").ifEmpty { "—" },
                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp, direction = TextDirection.Ltr),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            text = stringResource(R.string.releases_games_together, matchesPlayedTogether),
            style = boldTextStyle(PlatformColors.palette.blue, 11.sp),
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(PlatformColors.palette.blue.copy(alpha = 0.1f))
                .padding(horizontal = 8.dp, vertical = 3.dp),
            maxLines = 1
        )
        if (playerPhone != null) {
            val firstName = player.fullName?.split(" ")?.firstOrNull().orEmpty()
            val message = "Hey $firstName,\nHope everything is well at your side.\nI need your help with something.\nAny chance you have $targetPlayerName contact number?\nThank you!"
            Icon(
                Icons.Default.Whatsapp,
                contentDescription = "WhatsApp $firstName",
                tint = Color(0xFF25D366),
                modifier = Modifier
                    .size(22.dp)
                    .clickWithNoRipple {
                        val digits = playerPhone.replace(Regex("[^0-9]"), "")
                        val uri = "https://wa.me/$digits?text=${Uri.encode(message)}".toUri()
                        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                    }
            )
            Spacer(Modifier.width(8.dp))
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = shortlistMutedTextColor(),
            modifier = Modifier.size(20.dp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  NOTE ITEM
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistNoteItem(
    context: Context,
    note: ShortlistNote,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val isMen = shortlistIsMen()
    val muted = shortlistMutedTextColor()
    val border = shortlistBorderColor()
    val titleColor = if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary
    val isHebrew = LocaleManager.isHebrew(context)
    val authorName = if (isHebrew)
        (note.createdByHebrewName ?: note.createdBy).orEmpty()
    else
        (note.createdBy ?: note.createdByHebrewName).orEmpty()
    val daysAgo = run {
        val dayMs = 24 * 60 * 60 * 1000L
        (System.currentTimeMillis() / dayMs - note.createdAt / dayMs).toInt()
    }
    val timeLabel = when {
        daysAgo <= 0 -> stringResource(R.string.shortlist_added_today)
        daysAgo == 1 -> stringResource(R.string.shortlist_added_yesterday)
        else -> stringResource(R.string.shortlist_notes_days_ago, daysAgo)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(PlatformColors.palette.background)
            .border(1.dp, border, RoundedCornerShape(10.dp))
            .padding(10.dp)
    ) {
        Text(
            text = note.text,
            style = regularTextStyle(titleColor, 13.sp),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(6.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = buildString {
                    if (authorName.isNotBlank()) append("$authorName · ")
                    append(timeLabel)
                },
                style = regularTextStyle(muted, 11.sp),
                modifier = Modifier.weight(1f)
            )
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(border.copy(alpha = 0.3f))
                    .clickWithNoRipple { onEdit() },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Edit,
                    contentDescription = stringResource(R.string.shortlist_notes_edit),
                    tint = muted,
                    modifier = Modifier.size(16.dp)
                )
            }
            Spacer(Modifier.width(6.dp))
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(PlatformColors.palette.red.copy(alpha = 0.1f))
                    .clickWithNoRipple { onDelete() },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = stringResource(R.string.shortlist_notes_delete),
                    tint = PlatformColors.palette.red.copy(alpha = 0.7f),
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  NOTE DIALOG (Add / Edit)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun NoteDialog(
    context: Context,
    entry: ShortlistEntry,
    mode: String,
    initialText: String,
    allAccounts: List<Account>,
    currentUserName: String?,
    onDismiss: () -> Unit,
    onSave: (String, List<String>) -> Unit
) {
    var text by remember(initialText) { mutableStateOf(initialText) }
    val isHebrew = LocaleManager.isHebrew(context)

    // Agent mention state
    val taggedAgentIds = remember { mutableStateListOf<String>() }
    var showMentionDropdown by remember { mutableStateOf(false) }
    var mentionQuery by remember { mutableStateOf("") }
    var mentionStartIndex by remember { mutableStateOf(-1) }
    val filteredMentionAccounts = remember(allAccounts, currentUserName, mentionQuery) {
        val accounts = allAccounts.filter { !it.name.equals(currentUserName, ignoreCase = true) }
        if (mentionQuery.isBlank()) accounts
        else accounts.filter {
            val displayName = if (isHebrew) (it.hebrewName ?: it.name).orEmpty() else it.name.orEmpty()
            displayName.contains(mentionQuery, ignoreCase = true)
        }
    }

    val isMen = shortlistIsMen()
    val modalSurface = if (isMen) BritTokens.card else PlatformColors.palette.card
    val modalBorder = if (isMen) BritTokens.line else PlatformColors.palette.cardBorder
    val modalTitleColor = if (isMen) BritTokens.ink else PlatformColors.palette.textPrimary

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(if (isMen) 14.dp else 20.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            colors = CardDefaults.cardColors(containerColor = modalSurface),
            border = BorderStroke(1.dp, modalBorder)
        ) {
            // Editorial 4px gold top border (web .brit-sl-modal) for MEN.
            if (isMen) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .background(BritTokens.gold)
                )
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Title — Oswald display for MEN, bold for Youth.
                Text(
                    text = stringResource(
                        if (mode == "edit") R.string.shortlist_notes_edit_title
                        else R.string.shortlist_notes_add_title
                    ),
                    style = if (isMen)
                        com.liordahan.mgsrteam.ui.theme.britDisplay(modalTitleColor, 22.sp, weight = 600, letterSpacing = (-0.5).sp)
                    else
                        boldTextStyle(modalTitleColor, 18.sp)
                )
                Spacer(Modifier.height(12.dp))

                // Player context
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(PlatformColors.palette.background)
                        .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!entry.playerImage.isNullOrBlank()) {
                        AsyncImage(
                            model = entry.playerImage,
                            contentDescription = null,
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(PlatformColors.palette.cardBorder),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                tint = PlatformColors.palette.textSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(
                            text = formatShortlistProfileDisplay(entry),
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 13.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        val subtitle = listOfNotNull(entry.playerPosition, entry.clubJoinedName)
                            .filter { it.isNotBlank() }.joinToString(" · ")
                        if (subtitle.isNotBlank()) {
                            Text(
                                text = subtitle,
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // @ Mention agent suggestions dropdown
                if (showMentionDropdown && filteredMentionAccounts.isNotEmpty()) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 200.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = PlatformColors.palette.background
                        ),
                        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
                    ) {
                        LazyColumn {
                            items(filteredMentionAccounts) { account ->
                                val displayName = if (isHebrew) {
                                    account.hebrewName ?: account.name
                                } else {
                                    account.name
                                } ?: ""
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickWithNoRipple {
                                            if (mentionStartIndex >= 0) {
                                                val before = text.substring(0, mentionStartIndex)
                                                val cursorPos = text.length
                                                val after = if (cursorPos < text.length) text.substring(cursorPos) else ""
                                                val insertion = "@$displayName "
                                                text = "$before$insertion$after"
                                                if (account.id != null && !taggedAgentIds.contains(account.id)) {
                                                    taggedAgentIds.add(account.id!!)
                                                }
                                            }
                                            showMentionDropdown = false
                                            mentionQuery = ""
                                            mentionStartIndex = -1
                                        }
                                        .padding(horizontal = 16.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Person,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp),
                                        tint = PlatformColors.palette.accent
                                    )
                                    Spacer(Modifier.width(12.dp))
                                    Text(
                                        text = displayName,
                                        style = regularTextStyle(
                                            PlatformColors.palette.textPrimary,
                                            14.sp
                                        )
                                    )
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }

                // Text input
                OutlinedTextField(
                    value = text,
                    onValueChange = { newText ->
                        text = newText
                        // Detect @ mention
                        val lastAt = newText.lastIndexOf('@')
                        if (lastAt >= 0) {
                            val afterAt = newText.substring(lastAt + 1)
                            if (!afterAt.contains('\n') && afterAt.length < 30) {
                                mentionStartIndex = lastAt
                                mentionQuery = afterAt
                                showMentionDropdown = true
                            } else {
                                showMentionDropdown = false
                                mentionQuery = ""
                                mentionStartIndex = -1
                            }
                        } else {
                            showMentionDropdown = false
                            mentionQuery = ""
                            mentionStartIndex = -1
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    placeholder = {
                        Text(
                            text = stringResource(R.string.shortlist_notes_placeholder),
                            style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.6f), 14.sp)
                        )
                    },
                    textStyle = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PlatformColors.palette.orange,
                        unfocusedBorderColor = PlatformColors.palette.cardBorder,
                        cursorColor = PlatformColors.palette.orange,
                        focusedContainerColor = PlatformColors.palette.background,
                        unfocusedContainerColor = PlatformColors.palette.background
                    )
                )

                Spacer(Modifier.height(20.dp))

                // Actions
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(100.dp))
                            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(100.dp))
                            .clickWithNoRipple { onDismiss() }
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 13.sp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(100.dp))
                            .background(
                                if (text.isNotBlank()) PlatformColors.palette.orange
                                else PlatformColors.palette.orange.copy(alpha = 0.4f)
                            )
                            .clickWithNoRipple {
                                if (text.isNotBlank()) onSave(text.trim(), taggedAgentIds.toList())
                            }
                            .padding(horizontal = 20.dp, vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.shortlist_notes_save),
                            style = boldTextStyle(Color.White, 13.sp)
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE SHORTLIST DIALOG
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun DeleteShortlistDialog(
    onDismissRequest: () -> Unit,
    onRemoveClicked: () -> Unit
) {
    Dialog(onDismissRequest = onDismissRequest) {
        Card(
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.shortlist_remove_confirm),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp),
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(24.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    Box(
                        modifier = Modifier
                            .background(
                                PlatformColors.palette.card,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(100.dp))
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDismissRequest() }
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                PlatformColors.palette.red,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.shortlist_remove),
                            style = boldTextStyle(Color.White, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onRemoveClicked() }
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  EMPTY STATE
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistEmptyState(
    onBrowseReleases: () -> Unit,
    onBrowseReturnees: () -> Unit
) {
    val isMen = shortlistIsMen()
    val accent = if (isMen) MenShortlistGold else PlatformColors.palette.accent
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.BookmarkBorder,
            contentDescription = null,
            tint = shortlistMutedTextColor().copy(alpha = 0.5f),
            modifier = Modifier.size(72.dp)
        )
        Spacer(Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.shortlist_no_players),
            style = boldTextStyle(if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary, 18.sp),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = stringResource(R.string.shortlist_empty_hint),
            style = regularTextStyle(shortlistMutedTextColor(), 13.sp),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(28.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(accent)
                    .clickWithNoRipple(onClick = onBrowseReleases)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.shortlist_browse_releases),
                    style = boldTextStyle(if (isMen) MenShortlistBg else Color.White, 14.sp)
                )
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .border(1.dp, shortlistBorderColor(), RoundedCornerShape(14.dp))
                    .clickWithNoRipple(onClick = onBrowseReturnees)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.shortlist_browse_returnees),
                    style = boldTextStyle(if (isMen) MenShortlistGoldSoft else PlatformColors.palette.textPrimary, 14.sp)
                )
            }
        }
    }
}

@Composable
private fun ShortlistAgentFilterChip(
    selectedAgentFilter: String?,
    allAccounts: List<Account>,
    currentUserName: String?,
    onAgentSelected: (String?) -> Unit
) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val isSelected = selectedAgentFilter != null
    val accent = shortlistAccentColor()
    val muted = shortlistMutedTextColor()
    val card = shortlistCardColor()
    val defaultText = if (shortlistIsMen()) MenShortlistGoldSoft else PlatformColors.palette.textPrimary
    val bgColor by animateColorAsState(
        targetValue = if (isSelected) accent else Color.Transparent,
        label = "agentChipBg"
    )
    val textColor = if (isSelected) {
        if (shortlistIsMen()) MenShortlistBg else PlatformColors.palette.background
    } else {
        muted
    }
    val borderColor = if (isSelected) accent else shortlistBorderColor()

    val filteredAccounts = allAccounts.filter { !it.name.equals(currentUserName, ignoreCase = true) }

    val chipLabel = if (selectedAgentFilter != null) {
        val account = filteredAccounts.firstOrNull { it.name.equals(selectedAgentFilter, ignoreCase = true) }
        account?.getDisplayName(context) ?: selectedAgentFilter
    } else {
        stringResource(R.string.shortlist_filter_agent)
    }

    Box {
        Text(
            text = chipLabel + " ▾",
            style = boldTextStyle(textColor, 11.sp),
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(bgColor)
                .border(1.dp, borderColor, RoundedCornerShape(20.dp))
                .clickWithNoRipple { expanded = true }
                .padding(horizontal = 14.dp, vertical = 5.dp)
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.background(card),
            containerColor = card
        ) {
            if (isSelected) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.filter_clear), style = boldTextStyle(accent, 13.sp)) },
                    onClick = {
                        onAgentSelected(null)
                        expanded = false
                    }
                )
            }
            filteredAccounts.forEach { account ->
                val displayName = account.getDisplayName(context)
                val isThisSelected = account.name.equals(selectedAgentFilter, ignoreCase = true)
                DropdownMenuItem(
                    text = {
                        Text(
                            text = displayName,
                            style = if (isThisSelected) boldTextStyle(accent, 13.sp)
                                    else regularTextStyle(defaultText, 13.sp)
                        )
                    },
                    onClick = {
                        onAgentSelected(account.name)
                        expanded = false
                    }
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  INSTAGRAM ICON
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun InstagramIconPainter(): Painter {
    val igVector = remember {
        ImageVector.Builder(
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).addPath(
            pathData = PathParser().parsePathString(
                "M12,2.163c3.204,0 3.584,0.012 4.85,0.07c3.252,0.148 4.771,1.691 4.919,4.919c0.058,1.265 0.069,1.645 0.069,4.849c0,3.205 -0.012,3.584 -0.069,4.849c-0.149,3.225 -1.664,4.771 -4.919,4.919c-1.266,0.058 -1.644,0.07 -4.85,0.07c-3.204,0 -3.584,-0.012 -4.849,-0.07c-3.26,-0.149 -4.771,-1.699 -4.919,-4.92c-0.058,-1.265 -0.07,-1.644 -0.07,-4.849c0,-3.204 0.013,-3.583 0.07,-4.849c0.149,-3.227 1.664,-4.771 4.919,-4.919c1.266,-0.057 1.645,-0.069 4.849,-0.069zM12,0C8.741,0 8.333,0.014 7.053,0.072C2.695,0.272 0.273,2.69 0.073,7.052C0.014,8.333 0,8.741 0,12c0,3.259 0.014,3.668 0.072,4.948c0.2,4.358 2.618,6.78 6.98,6.98C8.333,23.986 8.741,24 12,24c3.259,0 3.668,-0.014 4.948,-0.072c4.354,-0.2 6.782,-2.618 6.979,-6.98C23.986,15.668 24,15.259 24,12c0,-3.259 -0.014,-3.667 -0.072,-4.947c-0.196,-4.354 -2.617,-6.78 -6.979,-6.98C15.668,0.014 15.259,0 12,0zM12,5.838a6.162,6.162 0,1 0,0 12.324a6.162,6.162 0,0 0,0 -12.324zM12,16a4,4 0,1 1,0 -8a4,4 0,0 1,0 8zM18.406,4.155a1.44,1.44 0,1 0,0 2.881a1.44,1.44 0,0 0,0 -2.881z"
            ).toNodes(),
            fill = androidx.compose.ui.graphics.SolidColor(Color.Black)
        ).build()
    }
    return rememberVectorPainter(igVector)
}
