package com.liordahan.mgsrteam.features.players

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.add.SnakeBarMessage
import com.liordahan.mgsrteam.features.add.showSnakeBarMessage
import com.liordahan.mgsrteam.features.players.filters.FootFilterOption
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.isFreeAgent
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.BritTopHeader
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.GrayscalePlayerPhoto
import com.liordahan.mgsrteam.ui.components.SkeletonPlayerCardList
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.PaperGrainOverlay
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.combinedClickWithNoRipple
import com.liordahan.mgsrteam.utils.EuCountries
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

// ═════════════════════════════════════════════════════════════════════════════
//  PLAYERS SCREEN — "Light Management Room" (.brit-room) ROSTER
//
//  A Compose rebuild of the web MEN roster (mgsr-web/src/components/MenPlayers.tsx)
//  restyled into the shared BRIT editorial design system, matched to the bar of
//  fidelity set by features/home/dashboard/BritDashboardScreen.kt:
//    • masthead  — brit-kicker + two-tone Oswald "The roster." title + view
//      toggle (Gallery / Ledger) + "+ Add" action
//    • signals   — four hairline-separated columns (Roster / Managed value /
//      Under mandate / Free agents) framed by top+bottom hairlines
//    • tray      — editorial search, position group segment, toggle filter chips,
//      sort row + clear-filters
//    • views     — GALLERY (grayscale cards, default) + TABLE/LEDGER (hairline rows)
//
//  ALL filter/sort/search behaviour still flows through the existing
//  [IPlayersViewModel]; navigation + the add-player bottom sheet wiring are
//  preserved. YOUTH re-tints via [BritTokens.accentFor] (teal) and reuses the
//  same layout. EU-passport count and the managed-value total are derived in the
//  Compose layer (not on the VM) exactly like the web signals.
// ═════════════════════════════════════════════════════════════════════════════

/** View mode for the roster — mirrors the web `view: 'table' | 'gallery'`. */
private enum class RosterView { GALLERY, TABLE }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayersScreen(
    navController: NavController,
    mainViewModel: IMainViewModel? = null,
    initialMyPlayersOnly: Boolean = false,
    viewModel: IPlayersViewModel = koinViewModel(),
    addPlayerViewModel: IAddPlayerViewModel = koinViewModel(),
    platformManager: PlatformManager = koinInject()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val playersState by viewModel.playersFlow.collectAsStateWithLifecycle()
    val platform by platformManager.current.collectAsStateWithLifecycle()
    val (accent, accentSoft) = BritTokens.accentFor(platform)

    LaunchedEffect(initialMyPlayersOnly) {
        viewModel.applyInitialMyPlayersOnlyIfNeeded(initialMyPlayersOnly)
    }

    var searchQuery by remember { mutableStateOf(viewModel.playersFlow.value.searchQuery) }
    // Web roster defaults to 'gallery'. Pure UI state (presentation only).
    var view by remember { mutableStateOf(RosterView.GALLERY) }
    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }
    var notesPreviewPlayer by remember { mutableStateOf<Player?>(null) }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsStateWithLifecycle()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsStateWithLifecycle()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsStateWithLifecycle()
    val snackBarHostState = remember { SnackbarHostState() }

    // Consume pending URL from Share/View intent (mainViewModel is null from FAB).
    LaunchedEffect(mainViewModel) {
        mainViewModel ?: return@LaunchedEffect
        mainViewModel.pendingAddPlayerTmUrl.collect { url ->
            if (!url.isNullOrBlank()) {
                mainViewModel.clearPendingAddPlayerTmUrl()
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

    LaunchedEffect(showAddPlayerBottomSheet, addPlayerTmUrl) {
        if (showAddPlayerBottomSheet && !addPlayerTmUrl.isNullOrBlank()) {
            addPlayerViewModel.loadPlayerByTmProfileUrl(addPlayerTmUrl!!)
        }
    }

    LaunchedEffect(isPlayerAdded) {
        if (isPlayerAdded) {
            showAddPlayerBottomSheet = false
            addPlayerTmUrl = null
            addPlayerViewModel.resetAfterAdd()
        }
    }

    // ── Derived signals (computed in the Compose layer, not on the VM) ──
    val euCount = remember(playersState.playersList) {
        playersState.playersList.count {
            EuCountries.isEuNational(it.nationalities, it.nationality)
        }
    }
    val valuedCount = remember(playersState.playersList) {
        playersState.playersList.count { parseMarketValue(it.marketValue) > 0 }
    }
    val totalValue = remember(playersState.playersList) {
        playersState.playersList.sumOf { parseMarketValue(it.marketValue) }
    }
    // Mandate signal derived in the Compose layer (haveMandate field only), to
    // mirror the web exactly: MenPlayers.tsx computes
    // mandateCount = players.filter(p => p.haveMandate).length. The VM's
    // playersState.mandateCount additionally counts a mandate-document map and can
    // diverge from the web number, so the roster "Under mandate" signal uses the
    // field-only count here (same approach as the EU and managed-value signals).
    val mandateCount = remember(playersState.playersList) {
        playersState.playersList.count { it.haveMandate }
    }

    val activeFilterCount = remember(playersState) { computeActiveFilterCount(playersState) }
    val hasActiveFilters = activeFilterCount > 0 || searchQuery.isNotBlank()

    val goToPlayer: (Player) -> Unit = { player ->
        val rawId = when (platform) {
            Platform.MEN -> player.tmProfile
            Platform.YOUTH -> player.id
        }
        val encodedId = Uri.encode(rawId)
        if (encodedId != null) {
            navController.navigate("${Screens.PlayerInfoScreen.route}/$encodedId")
        }
    }
    val openAddPlayer: () -> Unit = { navController.navigate("${Screens.AddPlayerScreen.route}/") }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BritTokens.paper)
    ) {
        PaperGrainOverlay()

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 36.dp)
        ) {
            // Shared BRIT top header (chrome) — back nav + platform switch.
            item(key = "chrome") {
                BritTopHeader(
                    platform = platform,
                    pageTitle = stringResource(R.string.nav_players),
                    hasUnreadNotifications = false,
                    onBellClick = {},
                    onPlatformSwitch = { target -> platformManager.switchTo(target) },
                    showBack = true,
                    onBackClick = { navController.popBackStack() },
                    showBell = false
                )
            }

            // (a) masthead ──────────────────────────────────────────────
            item(key = "masthead") {
                RosterMasthead(
                    platform = platform,
                    accent = accent,
                    accentSoft = accentSoft,
                    view = view,
                    onViewChange = { view = it },
                    onAdd = openAddPlayer
                )
            }

            // (b) signals strip ─────────────────────────────────────────
            item(key = "signals") {
                RosterSignals(
                    rosterCount = playersState.playersList.size,
                    euCount = euCount,
                    totalValue = totalValue,
                    valuedCount = valuedCount,
                    mandateCount = mandateCount,
                    freeCount = playersState.freeAgentCount,
                    accent = accent
                )
            }

            // (c) filter tray ───────────────────────────────────────────
            item(key = "tray") {
                RosterFilterTray(
                    state = playersState,
                    searchQuery = searchQuery,
                    accent = accent,
                    accentSoft = accentSoft,
                    hasActiveFilters = hasActiveFilters,
                    onSearchChange = { q ->
                        searchQuery = q
                        viewModel.updateSearchQuery(q)
                    },
                    onPositionGroup = { viewModel.setPositionFilterByChip(it) },
                    onToggleMyPlayers = { viewModel.toggleQuickFilterMyPlayersOnly() },
                    onToggleEuNational = { viewModel.toggleQuickFilterEuNational() },
                    onToggleWithMandate = { viewModel.toggleQuickFilterWithMandate() },
                    onToggleFreeAgents = { viewModel.toggleQuickFilterFreeAgents() },
                    onToggleContractExpiring = { viewModel.toggleQuickFilterContractExpiring() },
                    onToggleLoanPlayers = { viewModel.toggleQuickFilterLoanPlayersOnly() },
                    onToggleWithNotes = { viewModel.toggleQuickFilterWithNotesOnly() },
                    onToggleWithoutAgent = { viewModel.toggleQuickFilterWithoutRegisteredAgent() },
                    onToggleFoot = { viewModel.setFootFilterOption(it) },
                    onToggleOfferedNoFeedback = { viewModel.toggleQuickFilterOfferedNoFeedback() },
                    onToggleInterestedInIsrael = { viewModel.toggleQuickFilterInterestedInIsrael() },
                    onToggleTaggedInNotes = { viewModel.toggleQuickFilterTaggedInNotes() },
                    onSort = { viewModel.setSortOption(it) },
                    onClearFilters = {
                        searchQuery = ""
                        viewModel.removeAllFilters()
                    }
                )
            }

            // (d) result-count line ─────────────────────────────────────
            item(key = "result_count") {
                RosterResultCount(
                    visibleCount = playersState.visibleList.size,
                    total = playersState.totalPlayers,
                    activeFilterCount = activeFilterCount
                )
            }

            // (e) content ───────────────────────────────────────────────
            when {
                playersState.showPageLoader -> {
                    item(key = "loader") {
                        SkeletonPlayerCardList(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(600.dp)
                        )
                    }
                }

                playersState.visibleList.isEmpty() -> {
                    item(key = "empty") { RosterFilteredEmpty() }
                }

                view == RosterView.GALLERY -> {
                    // Emit the 2-column gallery as chunked Rows directly into the outer
                    // LazyColumn (same idiom the dashboard uses for its grids). This keeps
                    // composition lazy — only the on-screen rows build — and avoids nesting
                    // a scrollable grid of unbounded height inside the LazyColumn.
                    val galleryRows = playersState.visibleList.chunked(2)
                    item(key = "gallery_top") { Spacer(Modifier.height(4.dp)) }
                    itemsIndexed(
                        items = galleryRows,
                        key = { _, pair ->
                            val first = pair.first()
                            "row_" + (first.id ?: first.tmProfile ?: first.hashCode().toString())
                        }
                    ) { rowIndex, pair ->
                        RosterGalleryRow(
                            players = pair,
                            rowIndex = rowIndex,
                            accent = accent,
                            accentSoft = accentSoft,
                            onPlayerClick = goToPlayer,
                            onNotesLongPress = { notesPreviewPlayer = it }
                        )
                    }
                    item(key = "gallery_bottom") { Spacer(Modifier.height(4.dp)) }
                }

                else -> {
                    item(key = "ledger_head") { LedgerHeaderRow() }
                    items(
                        items = playersState.visibleList,
                        key = { p -> p.id ?: p.tmProfile ?: (p.fullName ?: p.hashCode().toString()) }
                    ) { player ->
                        LedgerRow(
                            player = player,
                            accent = accent,
                            onClick = { goToPlayer(player) }
                        )
                    }
                }
            }
        }

        // ── Snackbar for add-player errors ─────────────────────────────
        SnackbarHost(
            hostState = snackBarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp)
        ) { data ->
            SnakeBarMessage(message = data.visuals.message)
        }

        // ── Notes preview bottom sheet (long-press on a gallery card) ──
        notesPreviewPlayer?.let { player ->
            NotesPreviewBottomSheet(
                player = player,
                accent = accent,
                onDismiss = { notesPreviewPlayer = null },
                onViewAllNotes = {
                    notesPreviewPlayer = null
                    goToPlayer(player)
                }
            )
        }

        // ── Add Player bottom sheet (from Share/View intent) ───────────
        if (showAddPlayerBottomSheet) {
            val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            ModalBottomSheet(
                onDismissRequest = {
                    showAddPlayerBottomSheet = false
                    addPlayerTmUrl = null
                    addPlayerViewModel.resetAfterAdd()
                },
                sheetState = sheetState,
                containerColor = BritTokens.card,
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
                            CircularProgressIndicator(color = accent)
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
                            style = britBody(BritTokens.muted, 14.sp),
                            modifier = Modifier.padding(24.dp)
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MASTHEAD
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun RosterMasthead(
    platform: Platform,
    accent: Color,
    accentSoft: Color,
    view: RosterView,
    onViewChange: (RosterView) -> Unit,
    onAdd: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(top = 20.dp, bottom = 18.dp)
    ) {
        // brit-kicker (mono, accent)
        Text(
            text = stringResource(R.string.room_kicker),
            style = britMono(accent, 11.sp, letterSpacing = 1.4.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(Modifier.height(12.dp))
        // Two-tone Oswald title: "The roster." with "roster." in accent.
        Text(
            text = buildAnnotatedString {
                append(stringResource(R.string.players_room_head_a))
                append(" ")
                pushStyle(SpanStyle(color = accent))
                append(stringResource(R.string.players_room_head_b))
                pop()
            },
            style = britDisplay(BritTokens.ink, 44.sp, weight = 600, letterSpacing = (-2).sp)
                .copy(lineHeight = 44.sp)
        )
        Spacer(Modifier.height(16.dp))

        // Actions cluster: view toggle + "+ Add".
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ViewToggle(
                view = view,
                accentSoft = accentSoft,
                onViewChange = onViewChange,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(12.dp))
            // "+ Add" editorial action.
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(BritTokens.black)
                    .clickWithNoRipple { onAdd() }
                    .padding(horizontal = 14.dp, vertical = 9.dp)
            ) {
                Text(
                    text = "+ ${stringResource(R.string.players_add)}",
                    style = britMono(accentSoft, 11.sp, letterSpacing = 1.sp)
                )
            }
        }
    }
}

/** Segmented view toggle — Gallery (Board) / Table (Ledger). Active = black bg
 *  + accentSoft text, matching the web `.brit-view-toggle button.active`. */
@Composable
private fun ViewToggle(
    view: RosterView,
    accentSoft: Color,
    onViewChange: (RosterView) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(8.dp))
            .padding(2.dp)
    ) {
        ViewToggleButton(
            label = stringResource(R.string.shortlist_view_board),
            active = view == RosterView.GALLERY,
            accentSoft = accentSoft,
            onClick = { onViewChange(RosterView.GALLERY) },
            modifier = Modifier.weight(1f)
        )
        ViewToggleButton(
            label = stringResource(R.string.players_view_ledger),
            active = view == RosterView.TABLE,
            accentSoft = accentSoft,
            onClick = { onViewChange(RosterView.TABLE) },
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ViewToggleButton(
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
            style = britMono(
                if (active) accentSoft else BritTokens.muted,
                9.sp,
                letterSpacing = 1.2.sp
            ),
            textAlign = TextAlign.Center,
            maxLines = 1
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SIGNALS STRIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun RosterSignals(
    rosterCount: Int,
    euCount: Int,
    totalValue: Double,
    valuedCount: Int,
    mandateCount: Int,
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
                .height(IntrinsicSize.Min)
        ) {
            SignalColumn(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.room_signal_roster),
                value = rosterCount.toString().padStart(2, '0'),
                valueColor = BritTokens.ink,
                note = stringResource(R.string.room_signal_roster_note).replace("{n}", euCount.toString())
            )
            VerticalHairline()
            SignalColumn(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.players_signal_value),
                value = formatValue(totalValue),
                valueColor = accent,
                note = stringResource(R.string.players_signal_value_note).replace("{n}", valuedCount.toString())
            )
            VerticalHairline()
            SignalColumn(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.players_signal_mandate),
                value = mandateCount.toString().padStart(2, '0'),
                valueColor = BritTokens.ink,
                note = stringResource(R.string.players_signal_mandate_note)
                    .replace("{n}", (rosterCount - mandateCount).coerceAtLeast(0).toString())
            )
            VerticalHairline()
            SignalColumn(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.players_signal_free),
                value = freeCount.toString().padStart(2, '0'),
                valueColor = if (freeCount > 0) accent else BritTokens.ink,
                note = stringResource(R.string.players_signal_free_note)
            )
        }
        HorizontalDivider(thickness = 1.dp, color = BritTokens.line)
    }
}

@Composable
private fun SignalColumn(
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
            style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.6.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = value,
            style = britDisplay(valueColor, 28.sp, weight = 500, letterSpacing = (-1).sp),
            maxLines = 1
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = note.uppercase(),
            style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.5.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun VerticalHairline() {
    Box(
        modifier = Modifier
            .fillMaxHeight()
            .width(1.dp)
            .background(BritTokens.line)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  FILTER TRAY
// ═════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RosterFilterTray(
    state: PlayersUiState,
    searchQuery: String,
    accent: Color,
    accentSoft: Color,
    hasActiveFilters: Boolean,
    onSearchChange: (String) -> Unit,
    onPositionGroup: (String) -> Unit,
    onToggleMyPlayers: () -> Unit,
    onToggleEuNational: () -> Unit,
    onToggleWithMandate: () -> Unit,
    onToggleFreeAgents: () -> Unit,
    onToggleContractExpiring: () -> Unit,
    onToggleLoanPlayers: () -> Unit,
    onToggleWithNotes: () -> Unit,
    onToggleWithoutAgent: () -> Unit,
    onToggleFoot: (FootFilterOption) -> Unit,
    onToggleOfferedNoFeedback: () -> Unit,
    onToggleInterestedInIsrael: () -> Unit,
    onToggleTaggedInNotes: () -> Unit,
    onSort: (SortOption) -> Unit,
    onClearFilters: () -> Unit
) {
    val selectedGroups = state.selectedPositions.mapNotNull { it.name }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(12.dp))
            .padding(14.dp)
    ) {
        // (a) search field ──────────────────────────────────────────────
        TraySearchField(
            query = searchQuery,
            accent = accent,
            onQueryChange = onSearchChange
        )

        Spacer(Modifier.height(12.dp))

        // (b) position group segment ───────────────────────────────────
        PositionGroupSegment(
            selectedGroups = selectedGroups,
            accentSoft = accentSoft,
            onGroup = onPositionGroup
        )

        Spacer(Modifier.height(12.dp))

        // (c) toggle filter chips ──────────────────────────────────────
        val footLeft = state.footFilterOption == FootFilterOption.LEFT
        val footRight = state.footFilterOption == FootFilterOption.RIGHT
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FilterChip(
                label = stringResource(R.string.players_filter_my_players_only),
                active = state.quickFilterMyPlayersOnly,
                accentSoft = accentSoft,
                enabled = state.currentUserName != null,
                onClick = onToggleMyPlayers
            )
            FilterChip(
                label = "\uD83C\uDDEA\uD83C\uDDFA " + stringResource(R.string.players_filter_eu_national),
                active = state.quickFilterEuNational,
                accentSoft = accentSoft,
                onClick = onToggleEuNational
            )
            FilterChip(
                label = stringResource(R.string.players_filter_with_mandate),
                active = state.quickFilterWithMandate,
                accentSoft = accentSoft,
                onClick = onToggleWithMandate
            )
            FilterChip(
                label = stringResource(R.string.players_filter_free_agents),
                active = state.quickFilterFreeAgents,
                accentSoft = accentSoft,
                onClick = onToggleFreeAgents
            )
            FilterChip(
                label = stringResource(R.string.players_filter_contract_expiring),
                active = state.quickFilterContractExpiring,
                accentSoft = accentSoft,
                onClick = onToggleContractExpiring
            )
            FilterChip(
                label = stringResource(R.string.players_filter_loan_players_only),
                active = state.quickFilterLoanPlayersOnly,
                accentSoft = accentSoft,
                onClick = onToggleLoanPlayers
            )
            FilterChip(
                label = stringResource(R.string.players_filter_with_notes),
                active = state.isWithNotesChecked,
                accentSoft = accentSoft,
                onClick = onToggleWithNotes
            )
            FilterChip(
                label = stringResource(R.string.players_filter_without_registered_agent),
                active = state.quickFilterWithoutRegisteredAgent,
                accentSoft = accentSoft,
                onClick = onToggleWithoutAgent
            )
            FilterChip(
                label = stringResource(R.string.players_filter_foot_left),
                active = footLeft,
                accentSoft = accentSoft,
                onClick = { onToggleFoot(if (footLeft) FootFilterOption.NONE else FootFilterOption.LEFT) }
            )
            FilterChip(
                label = stringResource(R.string.players_filter_foot_right),
                active = footRight,
                accentSoft = accentSoft,
                onClick = { onToggleFoot(if (footRight) FootFilterOption.NONE else FootFilterOption.RIGHT) }
            )
            FilterChip(
                label = stringResource(R.string.players_filter_offered_no_feedback),
                active = state.quickFilterOfferedNoFeedback,
                accentSoft = accentSoft,
                onClick = onToggleOfferedNoFeedback
            )
            FilterChip(
                label = "\uD83C\uDDEE\uD83C\uDDF1 " + stringResource(R.string.players_filter_interested_in_israel),
                active = state.quickFilterInterestedInIsrael,
                accentSoft = accentSoft,
                onClick = onToggleInterestedInIsrael
            )
            FilterChip(
                label = stringResource(R.string.players_filter_tagged_in_notes),
                active = state.quickFilterTaggedInNotes,
                accentSoft = accentSoft,
                enabled = state.currentUserAccountId != null,
                onClick = onToggleTaggedInNotes
            )
        }

        Spacer(Modifier.height(14.dp))
        HorizontalDivider(thickness = 1.dp, color = BritTokens.line2)
        Spacer(Modifier.height(12.dp))

        // (d) sort row + (e) clear filters ─────────────────────────────
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
                    style = britMono(BritTokens.muted, 11.sp, letterSpacing = 1.sp)
                )
                SortButton(
                    label = stringResource(R.string.players_sort_default),
                    active = state.sortOption == SortOption.DEFAULT,
                    accent = accent,
                    onClick = { onSort(SortOption.DEFAULT) }
                )
                SortButton(
                    label = stringResource(R.string.players_sort_age),
                    active = state.sortOption == SortOption.AGE,
                    accent = accent,
                    onClick = { onSort(SortOption.AGE) }
                )
                SortButton(
                    label = stringResource(R.string.players_sort_market_value),
                    active = state.sortOption == SortOption.MARKET_VALUE,
                    accent = accent,
                    onClick = { onSort(SortOption.MARKET_VALUE) }
                )
                SortButton(
                    label = stringResource(R.string.players_sort_name),
                    active = state.sortOption == SortOption.NAME,
                    accent = accent,
                    onClick = { onSort(SortOption.NAME) }
                )
            }
            if (hasActiveFilters) {
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.players_clear_filters) + " ×",
                    style = britMono(BritTokens.red, 11.sp, letterSpacing = 0.8.sp),
                    modifier = Modifier.clickWithNoRipple { onClearFilters() }
                )
            }
        }
    }
}

@Composable
private fun TraySearchField(
    query: String,
    accent: Color,
    onQueryChange: (String) -> Unit
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
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
                    style = britBody(BritTokens.muted2, 13.sp)
                )
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = britBody(BritTokens.ink, 13.sp),
                cursorBrush = SolidColor(accent),
                keyboardOptions = KeyboardOptions(
                    imeAction = ImeAction.Done,
                    keyboardType = KeyboardType.Text
                ),
                keyboardActions = KeyboardActions(
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

/** All + GK/DEF/MID/FWD group segment. Active = accentSoft bg + ink text
 *  (web `.brit-segment button.active`). Wired to setPositionFilterByChip. */
@Composable
private fun PositionGroupSegment(
    selectedGroups: List<String>,
    accentSoft: Color,
    onGroup: (String) -> Unit
) {
    val groups = listOf("GK", "DEF", "MID", "FWD")
    val isAll = selectedGroups.isEmpty()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(8.dp))
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        SegmentButton(
            label = stringResource(R.string.releases_all),
            active = isAll,
            accentSoft = accentSoft,
            onClick = { onGroup("All") },
            modifier = Modifier.weight(1f)
        )
        groups.forEach { g ->
            SegmentButton(
                label = g,
                active = selectedGroups.any { it.equals(g, ignoreCase = true) },
                accentSoft = accentSoft,
                onClick = { onGroup(g) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun SegmentButton(
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
            style = britMono(
                if (active) BritTokens.ink else BritTokens.muted,
                9.sp,
                letterSpacing = 1.sp
            ),
            maxLines = 1
        )
    }
}

/** Editorial toggle chip (.brit-chip): active = black bg + accentSoft text with a
 *  leading accent dot. */
@Composable
private fun FilterChip(
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
            .then(
                if (enabled) Modifier.clickWithNoRipple { onClick() } else Modifier
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(5.dp)
                .clip(RoundedCornerShape(50))
                .background(accentSoft.copy(alpha = if (active) 1f else 0.5f * alpha))
        )
        Text(
            text = label,
            style = britMono(
                if (active) accentSoft.copy(alpha = alpha) else BritTokens.muted.copy(alpha = alpha),
                9.sp,
                letterSpacing = 0.6.sp
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun SortButton(
    label: String,
    active: Boolean,
    accent: Color,
    onClick: () -> Unit
) {
    Text(
        text = label,
        style = britMono(
            if (active) accent else BritTokens.muted,
            9.sp,
            letterSpacing = 0.6.sp
        ),
        maxLines = 1,
        modifier = Modifier.clickWithNoRipple { onClick() }
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  RESULT COUNT + EMPTY STATE
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun RosterResultCount(
    visibleCount: Int,
    total: Int,
    activeFilterCount: Int
) {
    val base = stringResource(R.string.players_showing)
        .replace("{n}", visibleCount.toString())
        .replace("{total}", total.toString())
    val text = if (activeFilterCount > 0) {
        base + "  /  " + stringResource(R.string.players_filters_active)
            .replace("{n}", activeFilterCount.toString())
    } else {
        base
    }
    Text(
        text = text.uppercase(),
        style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.8.sp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 12.dp)
    )
}

@Composable
private fun RosterFilteredEmpty() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 60.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(R.string.players_empty_filtered),
            style = britBody(BritTokens.muted, 14.sp, weight = 500),
            textAlign = TextAlign.Center
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  GALLERY VIEW
// ═════════════════════════════════════════════════════════════════════════════

/** One row of the 2-column gallery, emitted directly into the outer LazyColumn
 *  (see the content section). Rendering the gallery as chunked Rows keeps
 *  composition lazy — only on-screen rows build — and avoids nesting a
 *  scrollable grid of unbounded height inside the LazyColumn. `players` holds the
 *  one or two cards for this row; `rowIndex` gives the 2-digit card index that
 *  the web shows (01, 02, …). */
@Composable
private fun RosterGalleryRow(
    players: List<Player>,
    rowIndex: Int,
    accent: Color,
    accentSoft: Color,
    onPlayerClick: (Player) -> Unit,
    onNotesLongPress: (Player) -> Unit
) {
    val cardHeight = 230.dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        players.forEachIndexed { col, player ->
            Box(modifier = Modifier.weight(1f)) {
                GalleryCard(
                    player = player,
                    index = rowIndex * 2 + col,
                    accent = accent,
                    accentSoft = accentSoft,
                    cardHeight = cardHeight,
                    onClick = { onPlayerClick(player) },
                    onLongPress = { onNotesLongPress(player) }
                )
            }
        }
        // Keep the single trailing card at half-width (don't let it stretch to
        // the full row) by padding the empty second column.
        if (players.size == 1) {
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GalleryCard(
    player: Player,
    index: Int,
    accent: Color,
    accentSoft: Color,
    cardHeight: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
    onLongPress: () -> Unit
) {
    val hasNotes = !player.notes.isNullOrEmpty() || !player.noteList.isNullOrEmpty()
    val flags = playerFlags(player).filter { it.kind != FlagKind.MANDATE }
    val agentName = agentDisplayName(player.agentInChargeName)
    val club = clubDisplay(player)
    val positions = player.positions?.filterNotNull()?.filter { it.isNotBlank() }?.joinToString(" / ") ?: "—"

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(cardHeight)
            .clip(RoundedCornerShape(12.dp))
            .combinedClickWithNoRipple(
                onClick = onClick,
                onLongClick = { if (hasNotes) onLongPress() }
            )
    ) {
        GrayscalePlayerPhoto(
            imageUrl = player.profileImage,
            name = player.fullName ?: "—",
            modifier = Modifier.fillMaxSize()
        ) {
            // Top row: index + flags.
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .padding(10.dp),
                verticalAlignment = Alignment.Top
            ) {
                Text(
                    text = (index + 1).toString().padStart(2, '0'),
                    style = britMono(accentSoft, 11.sp, letterSpacing = 1.sp)
                )
                Spacer(Modifier.weight(1f))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    flags.forEach { f ->
                        Text(
                            text = f.label,
                            style = britMono(flagColor(f.kind, accent), 11.sp, letterSpacing = 0.6.sp)
                        )
                    }
                }
            }

            // Agent-in-charge badge (just below the top row).
            if (agentName.isNotBlank()) {
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(top = 30.dp, start = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .clip(RoundedCornerShape(50))
                            .background(accent),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = agentName.first().uppercase(),
                            style = britMono(BritTokens.paper, 11.sp, letterSpacing = 0.sp)
                        )
                    }
                    Text(
                        text = agentName,
                        style = britMono(BritTokens.paper.copy(alpha = 0.85f), 11.sp, letterSpacing = 0.4.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Bottom copy block.
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(12.dp)
            ) {
                Text(
                    text = "$club / $positions".uppercase(),
                    style = britMono(accentSoft, 11.sp, letterSpacing = 0.8.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = (player.fullName ?: "—").uppercase(),
                    style = britDisplay(BritTokens.paper, 18.sp, weight = 600),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    text = buildString {
                        append(player.marketValue?.takeIf { it.isNotBlank() } ?: "—")
                        player.age?.takeIf { it.isNotBlank() }?.let { append(" · $it") }
                    },
                    style = britMono(BritTokens.paper.copy(alpha = 0.8f), 11.sp, letterSpacing = 0.6.sp),
                    maxLines = 1
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TABLE / LEDGER VIEW
// ═════════════════════════════════════════════════════════════════════════════

// Column weights shared by the ledger header + rows.
private const val W_PLAYER = 2.4f
private const val W_CLUB = 1.6f
private const val W_POS = 1.4f
private const val W_AGE = 0.7f
private const val W_VALUE = 1.2f
private const val W_AGENT = 1.4f
private const val W_SIGNALS = 1.6f

@Composable
private fun LedgerHeaderRow() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(top = 4.dp, bottom = 8.dp)
    ) {
        LedgerHeaderCell(stringResource(R.string.room_th_player), W_PLAYER)
        LedgerHeaderCell(stringResource(R.string.room_th_club), W_CLUB)
        LedgerHeaderCell(stringResource(R.string.room_th_position), W_POS)
        LedgerHeaderCell(stringResource(R.string.players_th_age), W_AGE)
        LedgerHeaderCell(stringResource(R.string.room_th_value), W_VALUE)
        LedgerHeaderCell(stringResource(R.string.players_th_agent), W_AGENT)
        LedgerHeaderCell(stringResource(R.string.players_th_signals), W_SIGNALS, end = true)
    }
}

@Composable
private fun RowScope.LedgerHeaderCell(label: String, weight: Float, end: Boolean = false) {
    Text(
        text = label.uppercase(),
        style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.8.sp),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        textAlign = if (end) TextAlign.End else TextAlign.Start,
        modifier = Modifier.weight(weight)
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LedgerRow(
    player: Player,
    accent: Color,
    onClick: () -> Unit
) {
    val positions = player.positions?.filterNotNull()?.filter { it.isNotBlank() }?.take(3) ?: emptyList()
    val agentName = agentDisplayName(player.agentInChargeName)
    val flags = playerFlags(player)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { onClick() }
    ) {
        HorizontalDivider(thickness = 1.dp, color = BritTokens.line)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Player (thumb + name/nationality)
            Row(
                modifier = Modifier.weight(W_PLAYER),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(6.dp))
                ) {
                    GrayscalePlayerPhoto(
                        imageUrl = player.profileImage,
                        name = player.fullName ?: "?",
                        modifier = Modifier.fillMaxSize(),
                        scrimAlpha = 0.3f
                    )
                }
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = player.fullName ?: "—",
                        style = britBody(BritTokens.ink, 12.sp, weight = 700),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = (player.nationality ?: "—").uppercase(),
                        style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.5.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            // Club
            Text(
                text = clubDisplay(player),
                style = britBody(BritTokens.muted, 11.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(W_CLUB)
            )
            // Position tags
            FlowRow(
                modifier = Modifier.weight(W_POS),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                if (positions.isEmpty()) {
                    Text("—", style = britMono(BritTokens.muted, 11.sp))
                } else {
                    positions.forEach { pos ->
                        Text(
                            text = pos.uppercase(),
                            style = britMono(BritTokens.ink, 11.sp, letterSpacing = 0.4.sp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .border(1.dp, BritTokens.line, RoundedCornerShape(4.dp))
                                .padding(horizontal = 4.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            // Age
            Text(
                text = player.age?.takeIf { it.isNotBlank() } ?: "—",
                style = britBody(BritTokens.ink, 11.sp),
                maxLines = 1,
                modifier = Modifier.weight(W_AGE)
            )
            // Value
            Text(
                text = player.marketValue?.takeIf { it.isNotBlank() } ?: "—",
                style = britBody(BritTokens.ink, 11.sp, weight = 600),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(W_VALUE)
            )
            // Agent
            Text(
                text = agentName.ifBlank { "—" },
                style = britBody(BritTokens.muted, 11.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(W_AGENT)
            )
            // Signals / flags
            FlowRow(
                modifier = Modifier.weight(W_SIGNALS),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                if (flags.isEmpty()) {
                    Text("—", style = britMono(BritTokens.muted, 11.sp))
                } else {
                    flags.forEach { f ->
                        Text(
                            text = f.label,
                            style = britMono(flagColor(f.kind, accent), 11.sp, letterSpacing = 0.4.sp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .border(1.dp, flagColor(f.kind, accent).copy(alpha = 0.5f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 4.dp, vertical = 2.dp)
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  NOTES PREVIEW BOTTOM SHEET (long-press on gallery card)
// ═════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotesPreviewBottomSheet(
    player: Player,
    accent: Color,
    onDismiss: () -> Unit,
    onViewAllNotes: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val sdf = remember { java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale.getDefault()) }

    val allNotes = remember(player.notes, player.noteList) {
        val list = mutableListOf<NotesModel>()
        player.noteList?.let { list.addAll(it) }
        if (list.isEmpty() && !player.notes.isNullOrEmpty()) {
            list.add(NotesModel(notes = player.notes, createBy = null, createdAt = player.createdAt ?: 0L))
        }
        list.sortedByDescending { it.createdAt ?: 0L }
    }
    val previewNotes = allNotes.take(3)
    val totalCount = allNotes.size

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = BritTokens.card,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = 12.dp)
                    .width(32.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(BritTokens.muted.copy(alpha = 0.4f))
            )
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(8.dp))
                ) {
                    GrayscalePlayerPhoto(
                        imageUrl = player.profileImage,
                        name = player.fullName ?: "?",
                        modifier = Modifier.fillMaxSize(),
                        scrimAlpha = 0.3f
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = player.fullName ?: "",
                        style = britDisplay(BritTokens.ink, 16.sp, weight = 600),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = buildString {
                            player.currentClub?.clubName?.let { append(it) }
                            player.positions?.filterNotNull()?.firstOrNull()?.let {
                                if (isNotEmpty()) append(" · ")
                                append(it)
                            }
                        },
                        style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.6.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = "$totalCount",
                    style = britDisplay(accent, 18.sp, weight = 600)
                )
            }

            HorizontalDivider(thickness = 1.dp, color = BritTokens.line)
            Spacer(Modifier.height(14.dp))

            previewNotes.forEach { note ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(BritTokens.paper2.copy(alpha = 0.5f))
                        .padding(12.dp)
                ) {
                    Text(
                        text = note.notes ?: "",
                        style = britBody(BritTokens.ink, 13.sp),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!note.createBy.isNullOrBlank()) {
                            Icon(
                                imageVector = Icons.Filled.Person,
                                contentDescription = null,
                                tint = BritTokens.muted,
                                modifier = Modifier.size(12.dp)
                            )
                            Spacer(Modifier.width(3.dp))
                            Text(
                                text = note.createBy,
                                style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.4.sp),
                                modifier = Modifier.weight(1f, fill = false)
                            )
                            Spacer(Modifier.width(8.dp))
                        }
                        note.createdAt?.takeIf { it > 0 }?.let {
                            Text(
                                text = sdf.format(java.util.Date(it)),
                                style = britMono(BritTokens.muted, 11.sp, letterSpacing = 0.4.sp)
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.player_info_notes) + " →",
                style = britMono(accent, 11.sp, letterSpacing = 1.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple { onViewAllNotes() }
                    .padding(vertical = 10.dp),
                textAlign = TextAlign.Center
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHARED PRESENTATION HELPERS
// ═════════════════════════════════════════════════════════════════════════════

private enum class FlagKind { EU, MANDATE, FREE, EXP, LOAN }

private data class PlayerFlag(val kind: FlagKind, val label: String)

/** Builds the ordered flag list for a player — mirrors MenPlayers.tsx playerFlags.
 *  (EU → Mandate → Free/Exp → Loan). Labels follow the web wording. */
@Composable
private fun playerFlags(player: Player): List<PlayerFlag> {
    val out = mutableListOf<PlayerFlag>()
    if (EuCountries.isEuNational(player.nationalities, player.nationality)) {
        out.add(PlayerFlag(FlagKind.EU, stringResource(R.string.eu_nat_tag)))
    }
    if (player.haveMandate) out.add(PlayerFlag(FlagKind.MANDATE, "Mandate"))
    if (player.isFreeAgent) {
        out.add(PlayerFlag(FlagKind.FREE, "Free"))
    } else if (isContractExpiringWithin6Months(player.contractExpired)) {
        out.add(PlayerFlag(FlagKind.EXP, "Exp"))
    }
    if (player.isOnLoan) out.add(PlayerFlag(FlagKind.LOAN, "Loan"))
    return out
}

/** Flag chip colours matching the web .brit-tag variants:
 *  eu=gold/accent, mandate=green, free/exp=red, loan=muted. */
private fun flagColor(kind: FlagKind, accent: Color): Color = when (kind) {
    FlagKind.EU -> accent
    FlagKind.MANDATE -> BritTokens.green
    FlagKind.FREE, FlagKind.EXP -> BritTokens.red
    FlagKind.LOAN -> BritTokens.muted
}

private fun clubDisplay(player: Player): String {
    val c = player.currentClub?.clubName
    if (c.isNullOrBlank()) return "—"
    if (c.equals("Without Club", ignoreCase = true) || c.equals("Vereinslos", ignoreCase = true)) {
        return "Without Club"
    }
    return c
}

private fun agentDisplayName(name: String?): String {
    val n = name?.trim()
    if (n.isNullOrBlank() || n.equals("unknown", ignoreCase = true)) return ""
    return n
}

/** Compact euro market-value label — mirrors MenPlayers.tsx fmtValue. */
private fun formatValue(v: Double): String = when {
    v >= 1_000_000 -> {
        val m = v / 1_000_000
        if (v % 1_000_000.0 == 0.0) "€${m.toInt()}M" else "€%.2fM".format(m)
    }
    v > 0 -> "€${Math.round(v / 1000.0)}K"
    else -> "€0"
}

/** Market-value parser mirroring MenPlayers.tsx parseMarketValue (handles the
 *  k/m suffix + currency/comma stripping). */
private fun parseMarketValue(value: String?): Double {
    if (value.isNullOrBlank()) return 0.0
    val cleaned = value.replace(Regex("[€\$£,\\s]"), "").lowercase()
    val match = Regex("^([\\d.]+)(k|m)?\$").find(cleaned) ?: return 0.0
    val num = match.groupValues[1].toDoubleOrNull() ?: return 0.0
    return when (match.groupValues[2]) {
        "m" -> num * 1_000_000
        "k" -> num * 1_000
        else -> num
    }
}

/** Contract-expiry check within 6 months — mirrors the web + VM predicate,
 *  used only for the "Exp" presentation flag. */
private fun isContractExpiringWithin6Months(contractExpired: String?): Boolean {
    if (contractExpired.isNullOrBlank() || contractExpired == "-") return false
    val formatters = listOf(
        java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy", java.util.Locale.ENGLISH),
        java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy", java.util.Locale.ENGLISH),
        java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy", java.util.Locale.ENGLISH)
    )
    var date: java.time.LocalDate? = null
    for (fmt in formatters) {
        try {
            date = java.time.LocalDate.parse(contractExpired, fmt)
            break
        } catch (_: Exception) {
        }
    }
    val expiry = date ?: return false
    val now = java.time.LocalDate.now()
    val threshold = now.plusMonths(6)
    return !expiry.isBefore(now) && !expiry.isAfter(threshold)
}

/** Count of active filters — mirrors MenPlayers.tsx activeFilterCount over the
 *  controls the Android VM actually represents (group position + toggle chips +
 *  foot). The web's specific/secondary position + region are not represented on
 *  the VM, so they are intentionally excluded here. */
private fun computeActiveFilterCount(state: PlayersUiState): Int {
    var count = 0
    if (state.selectedPositions.isNotEmpty()) count++
    val toggles = listOf(
        state.quickFilterFreeAgents,
        state.quickFilterContractExpiring,
        state.quickFilterWithMandate,
        state.quickFilterMyPlayersOnly,
        state.quickFilterLoanPlayersOnly,
        state.quickFilterWithoutRegisteredAgent,
        state.isWithNotesChecked,
        state.quickFilterEuNational,
        state.quickFilterOfferedNoFeedback,
        state.quickFilterInterestedInIsrael,
        state.quickFilterTaggedInNotes
    )
    count += toggles.count { it }
    if (state.footFilterOption != FootFilterOption.NONE) count++
    // NOTE: the per-agent filter (setSelectedAgentFilter) is intentionally NOT
    // counted here. The web roster (MenPlayers.tsx) has no per-agent dropdown —
    // only a "My Players Only" chip — so the roster screen never sets
    // selectedAgentFilter. Counting it would let the active-filter badge report a
    // filter the UI can neither show nor clear. The VM method is left intact for
    // other callers; this screen simply does not drive or count it.
    return count
}
