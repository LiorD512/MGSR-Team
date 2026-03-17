package com.liordahan.mgsrteam.features.shortlist

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
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.liordahan.mgsrteam.features.releases.RosterTeammateMatch
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.TeammatesFetcher
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
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
    "FWD" to setOf("ST", "CF", "LW", "RW", "SS", "FORWARD", "CENTRE-FORWARD", "LEFT WINGER", "RIGHT WINGER", "SECOND STRIKER", "WINGER", "STRIKER")
)

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
    mainViewModel: com.liordahan.mgsrteam.IMainViewModel? = null
) {
    val state by viewModel.shortlistFlow.collectAsState()
    val currentPlatform by platformManager.current.collectAsStateWithLifecycle()
    val isWomen = currentPlatform == Platform.WOMEN
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
    val rosterPlayers by playersRepository.playersFlow().collectAsState(initial = emptyList())
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

    val filteredEntries = remember(state.entries, myPlayersOnly, selectedAgentFilter, currentUserName, selectedPosition, withNotesOnly, sortOption, searchQuery) {
        var result = when {
            myPlayersOnly && !currentUserName.isNullOrBlank() ->
                state.entries.filter { it.addedByAgentName.equals(currentUserName, ignoreCase = true) }
            selectedAgentFilter != null ->
                state.entries.filter { it.addedByAgentName.equals(selectedAgentFilter, ignoreCase = true) }
            else -> state.entries
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

        // Sort
        when (sortOption) {
            SortOption.NAME -> result.sortedBy { it.playerName?.lowercase() ?: "" }
            SortOption.AGE -> result.sortedBy { it.playerAge?.replace(Regex("[^0-9]"), "")?.toIntOrNull() ?: 99 }
            SortOption.MARKET_VALUE -> result.sortedByDescending { parseShortlistMarketValue(it.marketValue) }
            else -> result // default: by addedAt (already ordered from repo)
        }
    }

    val listState = rememberLazyListState()
    LaunchedEffect(sortOption, selectedPosition, withNotesOnly) {
        listState.animateScrollToItem(0)
    }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsState()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsState()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsState()
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

    LaunchedEffect(showAddPlayerBottomSheet, addPlayerTmUrl) {
        if (showAddPlayerBottomSheet && !addPlayerTmUrl.isNullOrBlank()) {
            addPlayerViewModel.loadPlayerByTmProfileUrl(addPlayerTmUrl!!)
        }
    }

    LaunchedEffect(isPlayerAdded) {
        if (isPlayerAdded) {
            addPlayerTmUrl?.let { url -> viewModel.removeByUrl(url) }
            showAddPlayerBottomSheet = false
            addPlayerTmUrl = null
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
        containerColor = PlatformColors.palette.background,
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
        Column(
            modifier = Modifier
                .fillMaxSize()
        ) {
            ShortlistHeader(
                isWomen = isWomen,
                isYouth = currentPlatform == Platform.YOUTH,
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

            // ── Search bar (men only) ─────────────────────────────────
            if (currentPlatform == Platform.MEN) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .height(48.dp),
                    placeholder = {
                        Text(
                            text = stringResource(R.string.shortlist_search_placeholder),
                            style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.6f), 13.sp)
                        )
                    },
                    textStyle = regularTextStyle(PlatformColors.palette.textPrimary, 13.sp),
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PlatformColors.palette.accent,
                        unfocusedBorderColor = PlatformColors.palette.cardBorder,
                        cursorColor = PlatformColors.palette.accent,
                        focusedContainerColor = PlatformColors.palette.card,
                        unfocusedContainerColor = PlatformColors.palette.card
                    ),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = PlatformColors.palette.textSecondary,
                            modifier = Modifier.size(20.dp)
                        )
                    },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }, modifier = Modifier.size(20.dp)) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = stringResource(R.string.filter_clear),
                                    tint = PlatformColors.palette.textSecondary
                                )
                            }
                        }
                    }
                )
            }

            // ── Position filter chips ─────────────────────────────────
            ShortlistPositionFilterChips(
                selectedPosition = selectedPosition,
                onChipClick = { pos ->
                    viewModel.setSelectedPosition(if (pos == "All" || pos == selectedPosition) null else pos)
                }
            )

            // ── Quick filter chips ────────────────────────────────────
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.padding(vertical = 4.dp)
            ) {
                if (currentPlatform == Platform.MEN) {
                    item(key = "my_players") {
                        ShortlistQuickFilterChip(
                            label = stringResource(R.string.shortlist_filter_my_players),
                            isSelected = myPlayersOnly,
                            onClick = { viewModel.setMyPlayersOnly(!myPlayersOnly) }
                        )
                    }
                }
                item(key = "with_notes") {
                    ShortlistQuickFilterChip(
                        label = stringResource(R.string.shortlist_filter_with_notes),
                        isSelected = withNotesOnly,
                        onClick = { viewModel.setWithNotesOnly(!withNotesOnly) }
                    )
                }
                if (currentPlatform == Platform.MEN) {
                    item(key = "agent_filter") {
                        ShortlistAgentFilterChip(
                            selectedAgentFilter = selectedAgentFilter,
                            allAccounts = allAccounts,
                            currentUserName = currentUserName,
                            onAgentSelected = { agent ->
                                viewModel.setSelectedAgentFilter(agent)
                            }
                        )
                    }
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
                            val playerUrl = entry.tmProfileUrl
                            val isExpanded = playerUrl == expandedPlayerUrl
                            ShortlistCard(
                                context = context,
                                entry = entry,
                                isWomen = isWomen,
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
                                    if (isWomen || currentPlatform == Platform.YOUTH) {
                                        // Women/Youth: navigate to full AddPlayerScreen with pre-filled data
                                        navController.navigate(
                                            Screens.addPlayerWithTmProfileRoute(Uri.encode(entry.tmProfileUrl))
                                        )
                                    } else {
                                        addPlayerTmUrl = entry.tmProfileUrl
                                        showAddPlayerBottomSheet = true
                                    }
                                },
                                onOpenTm = {
                                    context.startActivity(
                                        Intent(
                                            Intent.ACTION_VIEW,
                                            entry.tmProfileUrl.toUri()
                                        )
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
                    }
                }
            }
        } // end Column

        // ── FAB ──────────────────────────────────────────────────────────
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
        } // end Box

        if (showAddPlayerBottomSheet) {
            val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            ModalBottomSheet(
                onDismissRequest = {
                    showAddPlayerBottomSheet = false
                    addPlayerTmUrl = null
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
                onDismiss = {
                    noteDialogEntry = null
                    noteDialogText = ""
                    noteDialogEditIndex = -1
                },
                onSave = { text ->
                    if (noteDialogMode == "edit" && noteDialogEditIndex >= 0) {
                        viewModel.updateNote(entry.tmProfileUrl, noteDialogEditIndex, text)
                    } else {
                        viewModel.addNote(entry.tmProfileUrl, text)
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
//  HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistHeader(
    isWomen: Boolean = false,
    isYouth: Boolean = false,
    sortOption: SortOption = SortOption.DEFAULT,
    onSortOptionSelected: (SortOption) -> Unit = {},
    onResetSort: () -> Unit = {},
    onBackClicked: () -> Unit
) {
    var sortMenuExpanded by remember { mutableStateOf(false) }
    val platformAccent = PlatformColors.palette.accent

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 12.dp, top = 24.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = PlatformColors.palette.textSecondary,
            modifier = Modifier
                .size(24.dp)
                .clickWithNoRipple { onBackClicked() }
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.shortlist_title),
                style = boldTextStyle(PlatformColors.palette.textPrimary, 26.sp)
            )
            Text(
                text = stringResource(
                    when {
                        isYouth -> R.string.youth_shortlist_subtitle
                        isWomen -> R.string.women_shortlist_subtitle
                        else -> R.string.shortlist_subtitle
                    }
                ),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        // Sort button
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(PlatformColors.palette.card.copy(alpha = 0.8f))
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
                modifier = Modifier.background(PlatformColors.palette.card),
                containerColor = PlatformColors.palette.card
            ) {
                DropdownMenuItem(
                    text = {
                        Text(
                            text = stringResource(R.string.players_reset),
                            style = regularTextStyle(PlatformColors.palette.textPrimary, 13.sp)
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
                                if (sortOption == SortOption.MARKET_VALUE) platformAccent else PlatformColors.palette.textPrimary,
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
                                if (sortOption == SortOption.NAME) platformAccent else PlatformColors.palette.textPrimary,
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
                                if (sortOption == SortOption.AGE) platformAccent else PlatformColors.palette.textPrimary,
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(PlatformColors.palette.card)
            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        ShortlistStatItem(
            value = total.toString(),
            label = stringResource(R.string.players_stat_total),
            accentColor = PlatformColors.palette.accent,
            modifier = Modifier.weight(1f)
        )
        ShortlistStatsStripDivider()
        ShortlistStatItem(
            value = thisWeek.toString(),
            label = stringResource(R.string.shortlist_stat_this_week),
            accentColor = PlatformColors.palette.orange,
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
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(accentColor)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = value,
            style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
        )
        Text(
            text = label,
            style = regularTextStyle(PlatformColors.palette.textSecondary, 9.sp)
        )
    }
}

@Composable
private fun ShortlistStatsStripDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .padding(vertical = 4.dp)
            .background(PlatformColors.palette.cardBorder)
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
    val positions = listOf("All", "GK", "DEF", "MID", "FWD")
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
                targetValue = if (isSelected) PlatformColors.palette.accent else Color.Transparent,
                label = "chipBg"
            )
            val textColor = if (isSelected) PlatformColors.palette.background else PlatformColors.palette.textSecondary
            val borderColor = if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.cardBorder

            Text(
                text = when (position) {
                    "All" -> stringResource(R.string.shortlist_filter_position_all)
                    "GK" -> stringResource(R.string.shortlist_filter_position_gk)
                    "DEF" -> stringResource(R.string.shortlist_filter_position_def)
                    "MID" -> stringResource(R.string.shortlist_filter_position_mid)
                    "FWD" -> stringResource(R.string.shortlist_filter_position_fwd)
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
        targetValue = if (isSelected) PlatformColors.palette.accent else Color.Transparent,
        label = "quickChipBg"
    )
    val textColor = if (isSelected) PlatformColors.palette.background else PlatformColors.palette.textSecondary
    val borderColor = if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.cardBorder

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
    isWomen: Boolean = false,
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
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = PlatformColors.palette.accent,
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
                                .border(2.dp, PlatformColors.palette.cardBorder, CircleShape),
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
                                .border(2.dp, PlatformColors.palette.cardBorder, CircleShape),
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
                        else listOf(PlatformColors.palette.cardBorder, PlatformColors.palette.cardBorder)
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
                                tint = PlatformColors.palette.textSecondary,
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
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
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
                                    .background(PlatformColors.palette.accent.copy(alpha = 0.15f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = pos,
                                    style = boldTextStyle(PlatformColors.palette.accent, 10.sp)
                                )
                            }
                        }
                        release.playerAge?.takeIf { it.isNotBlank() }?.let { age ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(PlatformColors.palette.cardBorder.copy(alpha = 0.5f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "$age${stringResource(R.string.shortlist_years_suffix)}",
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
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
                                        .background(PlatformColors.palette.cardBorder.copy(alpha = 0.5f))
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
                                            style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp),
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
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                        )
                    }
                    Text(
                        text = formatRelativeDate(entry.addedAt),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                    entry.getAddedByDisplayName(context)?.let { agentName ->
                        Text(
                            text = stringResource(R.string.shortlist_added_by, agentName),
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 9.sp),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }

            HorizontalDivider(
                color = PlatformColors.palette.cardBorder.copy(alpha = 0.5f),
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
                    .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
                    .clickWithNoRipple {
                        if (entry.notes.isEmpty()) onAddNote() else onToggleNotesExpand()
                    }
                    .padding(8.dp, 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.EditNote,
                    contentDescription = null,
                    tint = PlatformColors.palette.orange,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (entry.notes.isEmpty())
                        stringResource(R.string.shortlist_notes_tap_to_add)
                    else
                        stringResource(R.string.shortlist_notes_count, entry.notes.size),
                    style = regularTextStyle(PlatformColors.palette.textPrimary, 13.sp)
                )
                Spacer(Modifier.weight(1f))
                if (entry.notes.isNotEmpty()) {
                    Icon(
                        Icons.Default.ExpandMore,
                        contentDescription = if (isNotesExpanded) "Collapse" else "Expand",
                        tint = PlatformColors.palette.textSecondary,
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
                            .background(PlatformColors.palette.orange.copy(alpha = 0.1f))
                            .border(1.dp, PlatformColors.palette.orange.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                            .clickWithNoRipple { onAddNote() }
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Rounded.Add,
                            contentDescription = null,
                            tint = PlatformColors.palette.orange,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.shortlist_notes_add),
                            style = boldTextStyle(PlatformColors.palette.orange, 12.sp)
                        )
                    }
                }
            }

            // Roster teammates section (same as Releases) — men only
            if (!isWomen && !isYouth) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(PlatformColors.palette.background)
                    .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
                    .clickWithNoRipple { onToggleTeammatesExpand() }
                    .padding(8.dp, 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.People,
                    contentDescription = null,
                    tint = PlatformColors.palette.accent,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = when {
                        isTeammatesExpanded && isLoadingTeammates -> stringResource(R.string.releases_roster_teammates_loading)
                        isTeammatesExpanded && rosterTeammates != null -> if (rosterTeammates.size == 1) stringResource(R.string.releases_roster_teammates_one, rosterTeammates.size) else stringResource(R.string.releases_roster_teammates, rosterTeammates.size)
                        else -> stringResource(R.string.releases_roster_teammates_tap)
                    },
                    style = regularTextStyle(PlatformColors.palette.textPrimary, 13.sp)
                )
                Spacer(Modifier.weight(1f))
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = if (isTeammatesExpanded) "Collapse" else "Expand",
                    tint = PlatformColors.palette.textSecondary,
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
                            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = PlatformColors.palette.accent,
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    }
                } else if (rosterTeammates.isNullOrEmpty()) {
                    Text(
                        text = stringResource(R.string.releases_no_roster_teammates),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(PlatformColors.palette.background)
                            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    )
                } else {
                    Column(modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 8.dp)) {
                        rosterTeammates.forEach { match ->
                            ShortlistRosterTeammateRow(
                                player = match.player,
                                matchesPlayedTogether = match.matchesPlayedTogether,
                                onClick = { onRosterTeammateClick(match.player) }
                            )
                        }
                    }
                }
            }
            } // end if (!isWomen)

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
                            style = boldTextStyle(Color(0xFFE1306C), 10.sp)
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
                        .background(PlatformColors.palette.accent.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = stringResource(R.string.shortlist_badge),
                        style = boldTextStyle(PlatformColors.palette.accent, 10.sp)
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
                            tint = PlatformColors.palette.accent
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
    onClick: () -> Unit
) {
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
                style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
            )
            Text(
                text = "${player.age ?: "-"} • ${player.positions?.firstOrNull()?.takeIf { it.isNotBlank() } ?: "-"} • ${player.marketValue ?: "-"} • ${stringResource(R.string.releases_games_together, matchesPlayedTogether)}",
                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp, direction = TextDirection.Ltr),
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = PlatformColors.palette.textSecondary,
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
            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(10.dp))
            .padding(10.dp)
    ) {
        Text(
            text = note.text,
            style = regularTextStyle(PlatformColors.palette.textPrimary, 13.sp),
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
                style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp),
                modifier = Modifier.weight(1f)
            )
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(PlatformColors.palette.cardBorder.copy(alpha = 0.3f))
                    .clickWithNoRipple { onEdit() },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Edit,
                    contentDescription = stringResource(R.string.shortlist_notes_edit),
                    tint = PlatformColors.palette.textSecondary,
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
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var text by remember(initialText) { mutableStateOf(initialText) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Title
                Text(
                    text = stringResource(
                        if (mode == "edit") R.string.shortlist_notes_edit_title
                        else R.string.shortlist_notes_add_title
                    ),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
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

                // Text input
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
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
                                if (text.isNotBlank()) onSave(text.trim())
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
            tint = PlatformColors.palette.textSecondary.copy(alpha = 0.5f),
            modifier = Modifier.size(72.dp)
        )
        Spacer(Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.shortlist_no_players),
            style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = stringResource(R.string.shortlist_empty_hint),
            style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp),
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
                    .background(PlatformColors.palette.accent)
                    .clickWithNoRipple(onClick = onBrowseReleases)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.shortlist_browse_releases),
                    style = boldTextStyle(Color.White, 14.sp)
                )
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(14.dp))
                    .clickWithNoRipple(onClick = onBrowseReturnees)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.shortlist_browse_returnees),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
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
    val bgColor by animateColorAsState(
        targetValue = if (isSelected) PlatformColors.palette.accent else Color.Transparent,
        label = "agentChipBg"
    )
    val textColor = if (isSelected) PlatformColors.palette.background else PlatformColors.palette.textSecondary
    val borderColor = if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.cardBorder

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
            modifier = Modifier.background(PlatformColors.palette.card),
            containerColor = PlatformColors.palette.card
        ) {
            if (isSelected) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.filter_clear), style = boldTextStyle(PlatformColors.palette.accent, 13.sp)) },
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
                            style = if (isThisSelected) boldTextStyle(PlatformColors.palette.accent, 13.sp)
                                    else regularTextStyle(PlatformColors.palette.textPrimary, 13.sp)
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
