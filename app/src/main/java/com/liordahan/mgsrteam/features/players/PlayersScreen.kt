package com.liordahan.mgsrteam.features.players

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.StickyNote2
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.add.SnakeBarMessage
import com.liordahan.mgsrteam.features.add.showSnakeBarMessage
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.isFreeAgent
import com.liordahan.mgsrteam.utils.EuCountries
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.liordahan.mgsrteam.features.players.ui.RosterEmptyState
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.WomenGradientFab
import com.liordahan.mgsrteam.ui.components.WomenRosterEmptyState
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.theme.PlatformWomenAccent
import com.liordahan.mgsrteam.ui.theme.PlatformWomenSecondary
import com.liordahan.mgsrteam.ui.theme.PlatformYouthAccent
import com.liordahan.mgsrteam.ui.theme.PlatformYouthSecondary
import com.liordahan.mgsrteam.features.players.filters.FootFilterOption
import com.liordahan.mgsrteam.ui.components.SkeletonPlayerCardList
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

// ═════════════════════════════════════════════════════════════════════════════
//  PLAYERS SCREEN — Variant A (Enhanced Roster View)
// ═════════════════════════════════════════════════════════════════════════════

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
    val currentPlatform by platformManager.current.collectAsStateWithLifecycle()

    LaunchedEffect(initialMyPlayersOnly) {
        viewModel.applyInitialMyPlayersOnlyIfNeeded(initialMyPlayersOnly)
    }

    var searchQuery by remember { mutableStateOf(viewModel.playersFlow.value.searchQuery) }
    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsState()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsState()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsState()
    val snackBarHostState = remember { SnackbarHostState() }

    // Consume pending URL from Share/View intent (mainViewModel is null when navigated from FAB)
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
    val showEmptyState by remember(playersState) {
        mutableStateOf(playersState.visibleList.isEmpty() && !playersState.showPageLoader)
    }
    val listState = rememberLazyListState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PlatformColors.palette.background)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {

            // ── Header ───────────────────────────────────────────────────
            PlayersHeader(
                onBackClicked = { navController.popBackStack() },
                sortOption = playersState.sortOption,
                onSortOptionSelected = { viewModel.setSortOption(it) },
                onResetSort = { viewModel.resetSortOption() },
                platform = currentPlatform,
                showSort = currentPlatform == Platform.MEN
            )

            // ── Stats Strip ──────────────────────────────────────────────
            StatsStrip(
                total = playersState.totalPlayers,
                mandate = playersState.mandateCount,
                expiring = playersState.expiringCount,
                free = playersState.freeAgentCount,
                isWomen = currentPlatform == Platform.WOMEN,
                isYouth = currentPlatform == Platform.YOUTH
            )

            // ── Search Bar ───────────────────────────────────────────────
            PlayersSearchBar(
                query = searchQuery,
                onQueryChange = { newQuery ->
                    searchQuery = newQuery
                    viewModel.updateSearchQuery(newQuery)
                },
                onClear = {
                    searchQuery = ""
                    viewModel.updateSearchQuery("")
                },
                isWomen = currentPlatform == Platform.WOMEN
            )

            // ── Position Filter Chips ────────────────────────────────────
            PositionFilterChips(
                selectedPositions = playersState.selectedPositions.mapNotNull { it.name },
                onChipClick = { positionName -> viewModel.setPositionFilterByChip(positionName) },
                platform = currentPlatform
            )

            // ── Quick Filter Chips (hidden for Women & Youth) ─────────────
            if (currentPlatform == Platform.MEN) {
            QuickFilterChips(
                freeAgentsSelected = playersState.quickFilterFreeAgents,
                contractExpiringSelected = playersState.quickFilterContractExpiring,
                withMandateSelected = playersState.quickFilterWithMandate,
                myPlayersOnlySelected = playersState.quickFilterMyPlayersOnly,
                selectedAgentFilter = playersState.selectedAgentFilter,
                allAccounts = playersState.allAccounts,
                currentUserName = playersState.currentUserName,
                loanPlayersOnlySelected = playersState.quickFilterLoanPlayersOnly,
                withoutRegisteredAgentSelected = playersState.quickFilterWithoutRegisteredAgent,
                withNotesOnlySelected = playersState.isWithNotesChecked,
                euNationalSelected = playersState.quickFilterEuNational,
                offeredNoFeedbackSelected = playersState.quickFilterOfferedNoFeedback,
                footFilterOption = playersState.footFilterOption,
                onFreeAgentsClick = { viewModel.toggleQuickFilterFreeAgents() },
                onContractExpiringClick = { viewModel.toggleQuickFilterContractExpiring() },
                onWithMandateClick = { viewModel.toggleQuickFilterWithMandate() },
                onMyPlayersOnlyClick = { viewModel.toggleQuickFilterMyPlayersOnly() },
                onAgentFilterSelected = { viewModel.setSelectedAgentFilter(it) },
                onLoanPlayersOnlyClick = { viewModel.toggleQuickFilterLoanPlayersOnly() },
                onWithoutRegisteredAgentClick = { viewModel.toggleQuickFilterWithoutRegisteredAgent() },
                onWithNotesOnlyClick = { viewModel.toggleQuickFilterWithNotesOnly() },
                onEuNationalClick = { viewModel.toggleQuickFilterEuNational() },
                onOfferedNoFeedbackClick = { viewModel.toggleQuickFilterOfferedNoFeedback() },
                onFootFilterClick = { viewModel.setFootFilterOption(it) }
            )
            }

            // ── Content ──────────────────────────────────────────────────
            when {
                playersState.showPageLoader -> {
                    SkeletonPlayerCardList(modifier = Modifier.fillMaxSize())
                }

                showEmptyState -> {
                    if (currentPlatform == Platform.WOMEN) {
                        WomenRosterEmptyState(
                            onAddPlayerClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") },
                            onResetFiltersClicked = {
                                searchQuery = ""
                                viewModel.removeAllFilters()
                            }
                        )
                    } else {
                        RosterEmptyState(
                            onAddPlayerClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") },
                            onResetFiltersClicked = {
                                searchQuery = ""
                                viewModel.removeAllFilters()
                            }
                        )
                    }
                }

                else -> {
                    LazyColumn(
                        state = listState,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(
                            top = 4.dp,
                            bottom = 100.dp,
                            start = 16.dp,
                            end = 16.dp
                        ),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        // Expiring Alert Banner (men only)
                        if (currentPlatform == Platform.MEN && playersState.expiringSoonPlayers.isNotEmpty()) {
                            item(key = "expiring_alert") {
                                ExpiringAlertBanner(
                                    count = playersState.expiringSoonPlayers.size,
                                    players = playersState.expiringSoonPlayers,
                                    onPlayerClick = { player ->
                                        val rawId = if (currentPlatform == Platform.MEN) player.tmProfile else player.id
                                        val encodedId = Uri.encode(rawId) ?: return@ExpiringAlertBanner
                                        navController.navigate("${Screens.PlayerInfoScreen.route}/$encodedId")
                                    }
                                )
                            }
                        }

                        // Mandate Section (men only)
                        if (currentPlatform == Platform.MEN && playersState.playersWithMandate.isNotEmpty()) {
                            item(key = "mandate_section") {
                                MandateAlertBanner(
                                    playersWithMandate = playersState.playersWithMandate,
                                    onPlayerClick = { pwm ->
                                        val rawId = if (currentPlatform == Platform.MEN) pwm.player.tmProfile else pwm.player.id
                                        val encodedId = Uri.encode(rawId) ?: return@MandateAlertBanner
                                        navController.navigate("${Screens.PlayerInfoScreen.route}/$encodedId")
                                    }
                                )
                            }
                        }

                        // Player Cards
                        itemsIndexed(
                            items = playersState.visibleList,
                            key = { index: Int, player: Player ->
                                "${player.id ?: player.tmProfile ?: (player.fullName ?: "p-${player.hashCode()}")}-$index"
                            }
                        ) { _: Int, player: Player ->
                            PlayerCardVariantA(
                                player = player,
                                allAccounts = playersState.allAccounts,
                                onPlayerClick = {
                                    val rawId = if (currentPlatform == Platform.MEN) {
                                        player.tmProfile
                                    } else {
                                        player.id
                                    }
                                    val encodedId = Uri.encode(rawId) ?: return@PlayerCardVariantA
                                    navController.navigate("${Screens.PlayerInfoScreen.route}/$encodedId")
                                },
                                platform = currentPlatform
                            )
                        }
                    }
                }
            }
        }

        // ── FAB ──────────────────────────────────────────────────────────
        if (currentPlatform == Platform.WOMEN) {
            WomenGradientFab(
                onClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 20.dp, bottom = 56.dp)
            )
        } else {
            FloatingActionButton(
                onClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 20.dp, bottom = 56.dp),
                shape = RoundedCornerShape(18.dp),
                containerColor = currentPlatform.accent,
                contentColor = PlatformColors.palette.background
            ) {
                Icon(
                    imageVector = Icons.Filled.PersonAdd,
                    contentDescription = stringResource(R.string.players_add_player),
                    modifier = Modifier.size(24.dp),
                    tint = Color.White
                )
            }
        }

        // ── Snackbar for add-player errors ────────────────────────────────
        SnackbarHost(
            hostState = snackBarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp)
        ) { data ->
            SnakeBarMessage(message = data.visuals.message)
        }

        // ── Add Player bottom sheet (from Share/View intent) ───────────────
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
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HEADER (with Sort action in Top App Bar)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayersHeader(
    onBackClicked: () -> Unit,
    sortOption: SortOption,
    onSortOptionSelected: (SortOption) -> Unit,
    onResetSort: () -> Unit,
    platform: Platform = Platform.MEN,
    showSort: Boolean = true
) {
    var sortMenuExpanded by remember { mutableStateOf(false) }
    val sortContentDesc = stringResource(R.string.players_sort_options)
    val platformAccent = platform.accent

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 4.dp),
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
        Text(
            text = when (platform) {
                Platform.WOMEN -> stringResource(R.string.women_roster_title)
                Platform.YOUTH -> stringResource(R.string.youth_roster_title)
                else -> stringResource(R.string.players_roster_title)
            },
            style = boldTextStyle(PlatformColors.palette.textPrimary, 26.sp)
        )
        // ── Platform badge (only show for Women/Youth) ──
        if (platform != Platform.MEN) {
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        brush = platform.gradient
                    )
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(
                    text = "${platform.emoji} ${stringResource(platform.labelRes)}",
                    style = boldTextStyle(Color.White, 11.sp)
                )
            }
        }
        Spacer(modifier = Modifier.weight(1f))

        if (showSort) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(PlatformColors.palette.card.copy(alpha = 0.8f))
                .clickWithNoRipple { sortMenuExpanded = true }
                .padding(12.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.SwapVert,
                contentDescription = sortContentDesc,
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
                                if (sortOption == SortOption.MARKET_VALUE) PlatformColors.palette.accent else PlatformColors.palette.textPrimary,
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
                                if (sortOption == SortOption.NAME) PlatformColors.palette.accent else PlatformColors.palette.textPrimary,
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
                                if (sortOption == SortOption.AGE) PlatformColors.palette.accent else PlatformColors.palette.textPrimary,
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
        } // end if (showSort)
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS STRIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun StatsStrip(total: Int, mandate: Int, expiring: Int, free: Int, isWomen: Boolean = false, isYouth: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(PlatformColors.palette.card)
            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        StatsStripItem(
            value = total.toString(),
            label = stringResource(R.string.players_stat_total),
            accentColor = PlatformColors.palette.accent,
            modifier = Modifier.weight(1f)
        )
        if (!isWomen && !isYouth) {
            StatsStripDivider()
            StatsStripItem(
                value = mandate.toString(),
                label = stringResource(R.string.stat_mandate),
                accentColor = PlatformColors.palette.blue,
                modifier = Modifier.weight(1f)
            )
            StatsStripDivider()
            StatsStripItem(
                value = expiring.toString(),
                label = stringResource(R.string.agent_stat_expiring),
                accentColor = PlatformColors.palette.orange,
                modifier = Modifier.weight(1f)
            )
            StatsStripDivider()
            StatsStripItem(
                value = free.toString(),
                label = stringResource(R.string.stat_free),
                accentColor = PlatformColors.palette.red,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun StatsStripItem(
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
private fun StatsStripDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .padding(vertical = 4.dp)
            .background(PlatformColors.palette.cardBorder)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  SEARCH BAR
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayersSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    isWomen: Boolean = false
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    TextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(14.dp)),
        placeholder = {
            Text(
                text = stringResource(
                    if (isWomen) R.string.women_players_screen_hint else R.string.players_screen_hint
                ),
                style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 13.sp)
            )
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = PlatformColors.palette.textSecondary,
                modifier = Modifier.size(20.dp)
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.players_clear),
                    tint = PlatformColors.palette.textSecondary,
                    modifier = Modifier
                        .size(18.dp)
                        .clickWithNoRipple {
                            onClear()
                            keyboardController?.hide()
                            focusManager.clearFocus()
                        }
                )
            }
        },
        textStyle = regularTextStyle(PlatformColors.palette.textPrimary, 13.sp),
        singleLine = true,
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
        colors = TextFieldDefaults.colors(
            focusedContainerColor = PlatformColors.palette.card,
            unfocusedContainerColor = PlatformColors.palette.card,
            cursorColor = PlatformColors.palette.accent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent
        )
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  POSITION FILTER CHIPS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PositionFilterChips(
    selectedPositions: List<String>,
    onChipClick: (String) -> Unit,
    platform: Platform = Platform.MEN
) {
    val positions = listOf("All", "GK", "DEF", "MID", "FWD")
    val isAllSelected = selectedPositions.isEmpty()
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
            val isSelected = if (position == "All") isAllSelected
            else selectedPositions.any { it.equals(position, ignoreCase = true) }

            val bgColor by animateColorAsState(
                targetValue = if (isSelected) PlatformColors.palette.accent else Color.Transparent,
                label = "chipBg"
            )
            val textColor = if (isSelected) PlatformColors.palette.background else PlatformColors.palette.textSecondary
            val borderColor = if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.cardBorder

            Text(
                text = when (position) {
                    "All" -> stringResource(R.string.players_filter_all)
                    "GK" -> stringResource(
                        if (platform == Platform.WOMEN) R.string.women_filter_position_gk
                        else R.string.players_filter_position_gk
                    )
                    "DEF" -> stringResource(
                        if (platform == Platform.WOMEN) R.string.women_filter_position_def
                        else R.string.players_filter_position_def
                    )
                    "MID" -> stringResource(
                        if (platform == Platform.WOMEN) R.string.women_filter_position_mid
                        else R.string.players_filter_position_mid
                    )
                    "FWD" -> stringResource(
                        if (platform == Platform.WOMEN) R.string.women_filter_position_fwd
                        else R.string.players_filter_position_fwd
                    )
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
//  QUICK FILTER CHIPS (Free Agents, Contract Expiring, My Players Only)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun QuickFilterChips(
    freeAgentsSelected: Boolean,
    contractExpiringSelected: Boolean,
    withMandateSelected: Boolean,
    myPlayersOnlySelected: Boolean,
    selectedAgentFilter: String?,
    allAccounts: List<Account>,
    currentUserName: String?,
    loanPlayersOnlySelected: Boolean,
    withoutRegisteredAgentSelected: Boolean,
    withNotesOnlySelected: Boolean,
    euNationalSelected: Boolean,
    offeredNoFeedbackSelected: Boolean,
    footFilterOption: FootFilterOption,
    onFreeAgentsClick: () -> Unit,
    onContractExpiringClick: () -> Unit,
    onWithMandateClick: () -> Unit,
    onMyPlayersOnlyClick: () -> Unit,
    onAgentFilterSelected: (String?) -> Unit,
    onLoanPlayersOnlyClick: () -> Unit,
    onWithoutRegisteredAgentClick: () -> Unit,
    onWithNotesOnlyClick: () -> Unit,
    onEuNationalClick: () -> Unit,
    onOfferedNoFeedbackClick: () -> Unit,
    onFootFilterClick: (FootFilterOption) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        item(key = "free_agents") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_free_agents),
                isSelected = freeAgentsSelected,
                onClick = onFreeAgentsClick
            )
        }
        item(key = "contract_expiring") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_contract_expiring),
                isSelected = contractExpiringSelected,
                onClick = onContractExpiringClick
            )
        }
        item(key = "with_mandate") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_with_mandate),
                isSelected = withMandateSelected,
                onClick = onWithMandateClick
            )
        }
        item(key = "my_players") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_my_players_only),
                isSelected = myPlayersOnlySelected,
                onClick = onMyPlayersOnlyClick
            )
        }
        item(key = "loan_players") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_loan_players_only),
                isSelected = loanPlayersOnlySelected,
                onClick = onLoanPlayersOnlyClick
            )
        }
        item(key = "without_registered_agent") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_without_registered_agent),
                isSelected = withoutRegisteredAgentSelected,
                onClick = onWithoutRegisteredAgentClick
            )
        }
        item(key = "eu_national") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_eu_national),
                isSelected = euNationalSelected,
                onClick = onEuNationalClick
            )
        }
        item(key = "offered_no_feedback") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_offered_no_feedback),
                isSelected = offeredNoFeedbackSelected,
                onClick = onOfferedNoFeedbackClick
            )
        }
        item(key = "with_notes") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_with_notes),
                isSelected = withNotesOnlySelected,
                onClick = onWithNotesOnlyClick
            )
        }
        item(key = "foot_left") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_foot_left),
                isSelected = footFilterOption == FootFilterOption.LEFT,
                onClick = { onFootFilterClick(FootFilterOption.LEFT) }
            )
        }
        item(key = "foot_right") {
            QuickFilterChip(
                label = stringResource(R.string.players_filter_foot_right),
                isSelected = footFilterOption == FootFilterOption.RIGHT,
                onClick = { onFootFilterClick(FootFilterOption.RIGHT) }
            )
        }
        item(key = "agent_filter") {
            AgentFilterChip(
                selectedAgentFilter = selectedAgentFilter,
                allAccounts = allAccounts,
                currentUserName = currentUserName,
                onAgentSelected = onAgentFilterSelected
            )
        }
    }
}

@Composable
private fun QuickFilterChip(
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

@Composable
private fun AgentFilterChip(
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
        stringResource(R.string.players_filter_agent)
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
//  EXPIRING ALERT BANNER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ExpiringAlertBanner(
    count: Int,
    players: List<Player>,
    onPlayerClick: (Player) -> Unit
) {
    var isExpanded by remember { mutableStateOf(false) }
    var displayPlayers by remember { mutableStateOf<List<Player>>(emptyList()) }
    LaunchedEffect(isExpanded, players) {
        if (isExpanded) displayPlayers = players.shuffled().take(5)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { isExpanded = !isExpanded },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
    ) {
        Column {
            // Banner header with left accent
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .drawBehind {
                        drawRect(
                            color = Color(0xFFFF9800),
                            topLeft = Offset.Zero,
                            size = Size(
                                width = 3.dp.toPx(),
                                height = size.height
                            )
                        )
                    }
                    .padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.Warning,
                    contentDescription = null,
                    tint = PlatformColors.palette.orange,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.players_expiring_soon_count, count),
                        style = boldTextStyle(PlatformColors.palette.orange, 12.sp)
                    )
                    Text(
                        text = stringResource(R.string.players_expiring_action_needed),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(PlatformColors.palette.orange.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = count.toString(),
                        style = boldTextStyle(PlatformColors.palette.orange, 11.sp)
                    )
                }
                Spacer(Modifier.width(4.dp))
                Icon(
                    imageVector = if (isExpanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    tint = PlatformColors.palette.textSecondary,
                    modifier = Modifier.size(18.dp)
                )
            }

            // Expandable player list
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(animationSpec = tween(250)) + fadeIn(),
                exit = shrinkVertically(animationSpec = tween(200)) + fadeOut()
            ) {
                Column(
                    modifier = Modifier.padding(
                        start = 14.dp,
                        end = 14.dp,
                        bottom = 10.dp
                    )
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(PlatformColors.palette.cardBorder)
                    )
                    Spacer(Modifier.height(8.dp))
                    displayPlayers.forEach { player ->
                        ExpiringPlayerRow(player = player, onClick = { onPlayerClick(player) })
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MANDATE SECTION BANNER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun MandateAlertBanner(
    playersWithMandate: List<PlayerWithMandateExpiry>,
    onPlayerClick: (PlayerWithMandateExpiry) -> Unit
) {
    var isExpanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { isExpanded = !isExpanded },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .drawBehind {
                        drawRect(
                            color = PlatformColors.palette.blue,
                            topLeft = Offset.Zero,
                            size = Size(
                                width = 3.dp.toPx(),
                                height = size.height
                            )
                        )
                    }
                    .padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.VerifiedUser,
                    contentDescription = null,
                    tint = PlatformColors.palette.blue,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.players_with_mandate_count, playersWithMandate.size),
                        style = boldTextStyle(PlatformColors.palette.blue, 12.sp)
                    )
                    Text(
                        text = stringResource(R.string.players_with_mandate_subtitle),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(PlatformColors.palette.blue.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = playersWithMandate.size.toString(),
                        style = boldTextStyle(PlatformColors.palette.blue, 11.sp)
                    )
                }
                Spacer(Modifier.width(4.dp))
                Icon(
                    imageVector = if (isExpanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    tint = PlatformColors.palette.textSecondary,
                    modifier = Modifier.size(18.dp)
                )
            }

            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(animationSpec = tween(250)) + fadeIn(),
                exit = shrinkVertically(animationSpec = tween(200)) + fadeOut()
            ) {
                Column(
                    modifier = Modifier.padding(
                        start = 14.dp,
                        end = 14.dp,
                        bottom = 10.dp
                    )
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(PlatformColors.palette.cardBorder)
                    )
                    Spacer(Modifier.height(8.dp))
                    playersWithMandate.forEach { pwm ->
                        MandatePlayerRow(pwm = pwm, onClick = { onPlayerClick(pwm) })
                    }
                }
            }
        }
    }
}

@Composable
private fun MandatePlayerRow(pwm: PlayerWithMandateExpiry, onClick: () -> Unit) {
    val player = pwm.player
    val expiryStr = pwm.mandateExpiryAt?.let { ts ->
        java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.US).format(java.util.Date(ts))
    }
    Box(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple { onClick() }
                .padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = player.profileImage,
                contentDescription = null,
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = player.fullName ?: "",
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 13.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (player.isOnLoan) {
                        OnLoanPill(text = stringResource(R.string.players_on_loan))
                    }
                }
                Text(
                    text = player.currentClub?.clubName ?: "",
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (pwm.validLeagues.isNotEmpty()) {
                    Text(
                        text = pwm.validLeagues.joinToString(", "),
                        style = regularTextStyle(PlatformColors.palette.blue, 10.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            if (expiryStr != null) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(PlatformColors.palette.blue.copy(alpha = 0.12f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = stringResource(R.string.players_mandate_expires, expiryStr),
                        style = boldTextStyle(PlatformColors.palette.blue, 10.sp)
                    )
                }
            }
        }
    }
}

@Composable
private fun ExpiringPlayerRow(player: Player, onClick: () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple { onClick() }
                .padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = player.profileImage,
                contentDescription = null,
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = player.fullName ?: "",
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 13.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (player.isOnLoan) {
                        OnLoanPill(text = stringResource(R.string.players_on_loan))
                    }
                }
                Text(
                    text = player.currentClub?.clubName ?: "",
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(PlatformColors.palette.orange.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    text = when {
                        player.contractExpired.isNullOrBlank() || player.contractExpired == "-" ||
                            player.contractExpired.equals("Unknown", ignoreCase = true) ->
                            stringResource(R.string.players_contract_not_available)
                        else -> player.contractExpired.orEmpty()
                    },
                    style = boldTextStyle(PlatformColors.palette.orange, 10.sp)
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  PLAYER CARD — Variant A
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerCardVariantA(
    player: Player,
    allAccounts: List<com.liordahan.mgsrteam.features.login.models.Account>,
    onPlayerClick: () -> Unit,
    platform: Platform = Platform.MEN
) {
    val context = LocalContext.current
    val isFreeAgent = player.isFreeAgent
    val isExpiring = remember(player.contractExpired) {
        isContractExpiringSoon(player.contractExpired)
    }
    val hasMandate = player.haveMandate
    val hasNotes = !player.notes.isNullOrEmpty() || !player.noteList.isNullOrEmpty()
    val noteCount = player.noteList?.size ?: if (!player.notes.isNullOrEmpty()) 1 else 0

    // Color-coded left border — platform-aware default
    val borderColor = when {
        isFreeAgent -> PlatformColors.palette.red
        isExpiring -> PlatformColors.palette.orange
        hasMandate -> PlatformColors.palette.blue
        else -> platform.accent
    }

    // Market value trend
    val valueTrend = remember(player.marketValueHistory) {
        computeValueTrend(player.marketValueHistory)
    }

    Box(modifier = Modifier.fillMaxWidth()) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple { onPlayerClick() },
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .drawBehind {
                    // Left color accent bar
                    drawRect(
                        color = borderColor,
                        topLeft = Offset.Zero,
                        size = Size(
                            width = 3.dp.toPx(),
                            height = size.height
                        )
                    )
                }
        ) {
            // ── Top Row: Avatar + Info + Value ──────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 6.dp),
                verticalAlignment = Alignment.Top
            ) {
                // Avatar with status dot
                Box(contentAlignment = Alignment.BottomEnd) {
                    if (platform == Platform.WOMEN) {
                        // Women: show image with beautiful initials fallback
                        var showFallback by remember { mutableStateOf(player.profileImage.isNullOrBlank()) }
                        if (showFallback) {
                            // Gradient initials placeholder
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(CircleShape)
                                    .background(
                                        Brush.linearGradient(
                                            colors = listOf(PlatformWomenAccent, PlatformWomenSecondary)
                                        )
                                    )
                                    .border(2.dp, PlatformWomenAccent.copy(alpha = 0.4f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = player.fullName
                                        ?.split(" ")
                                        ?.mapNotNull { it.firstOrNull()?.uppercase() }
                                        ?.take(2)
                                        ?.joinToString("") ?: "?",
                                    style = boldTextStyle(Color.White, 18.sp)
                                )
                            }
                        } else {
                            AsyncImage(
                                model = player.profileImage,
                                contentDescription = null,
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(CircleShape)
                                    .border(2.dp, PlatformWomenAccent.copy(alpha = 0.4f), CircleShape),
                                contentScale = ContentScale.Crop,
                                onError = { showFallback = true }
                            )
                        }
                    } else if (platform == Platform.YOUTH) {
                        // Youth: initials fallback on cyan→violet gradient
                        var showFallback by remember { mutableStateOf(player.profileImage.isNullOrBlank()) }
                        if (showFallback) {
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(CircleShape)
                                    .background(
                                        Brush.linearGradient(
                                            colors = listOf(PlatformYouthAccent, PlatformYouthSecondary)
                                        )
                                    )
                                    .border(2.dp, PlatformYouthAccent.copy(alpha = 0.4f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = player.fullName
                                        ?.split(" ")
                                        ?.mapNotNull { it.firstOrNull()?.uppercase() }
                                        ?.take(2)
                                        ?.joinToString("") ?: "?",
                                    style = boldTextStyle(Color.White, 18.sp)
                                )
                            }
                        } else {
                            AsyncImage(
                                model = player.profileImage,
                                contentDescription = null,
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(CircleShape)
                                    .border(2.dp, PlatformYouthAccent.copy(alpha = 0.4f), CircleShape),
                                contentScale = ContentScale.Crop,
                                onError = { showFallback = true }
                            )
                        }
                    } else {
                        AsyncImage(
                            model = player.profileImage,
                            contentDescription = null,
                            modifier = Modifier
                                .size(52.dp)
                                .clip(CircleShape)
                                .border(2.dp, PlatformColors.palette.cardBorder, CircleShape),
                            contentScale = ContentScale.Crop
                        )
                    }
                    // Status indicator dot
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(PlatformColors.palette.card)
                            .padding(2.dp)
                            .clip(CircleShape)
                            .background(
                                when {
                                    isFreeAgent -> PlatformColors.palette.red
                                    isExpiring -> PlatformColors.palette.orange
                                    else -> PlatformColors.palette.green
                                }
                            )
                    )
                }

                Spacer(Modifier.width(10.dp))

                // Player info
                Column(modifier = Modifier.weight(1f)) {
                    // Name + flag
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = player.fullName ?: "",
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                    }

                    // Hebrew name for Youth players
                    if (platform == Platform.YOUTH && !player.fullNameHe.isNullOrBlank()) {
                        Text(
                            text = player.fullNameHe,
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier.padding(top = 4.dp)
                    ) {

                        AsyncImage(
                            model = player.nationalityFlag,
                            contentDescription = null,
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape),
                            contentScale = ContentScale.Fit
                        )

                        Text(
                            text = player.nationality ?: "",
                            style = regularTextStyle(PlatformColors.palette.textPrimary, 12.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )

                        if (platform == Platform.MEN && EuCountries.isEuNational(player.nationalities, player.nationality)) {
                            Text(
                                text = stringResource(R.string.eu_nat_badge),
                                style = boldTextStyle(Color.White, 8.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(Color(0xFF1565C0))
                                    .padding(horizontal = 4.dp, vertical = 1.dp)
                            )
                        }
                    }

                    // Club
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 4.dp)
                    ) {
                        if (!isFreeAgent && player.currentClub?.clubLogo != null) {
                            AsyncImage(
                                model = player.currentClub.clubLogo,
                                contentDescription = null,
                                modifier = Modifier
                                    .size(14.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                                contentScale = ContentScale.Fit
                            )
                            Spacer(Modifier.width(5.dp))
                        }
                        Text(
                            text = if (isFreeAgent) stringResource(R.string.players_free_agent) else (player.currentClub?.clubName
                                ?: ""),
                            style = if (isFreeAgent) boldTextStyle(PlatformColors.palette.red, 11.sp)
                            else regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // Tags: age, positions, height — FlowRow for wrapping when crowded
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
                    ) {
                        if (!player.age.isNullOrBlank()) {
                            PlayerTag(text = stringResource(
                                if (platform == Platform.WOMEN) R.string.women_players_age_format else R.string.players_age_format,
                                player.age.trim()
                            ))
                        }
                        player.positions?.filterNotNull()?.take(2)?.forEach { pos ->
                            PlayerTag(
                                text = pos,
                                isPosition = true
                            )
                        }
                        if (!player.height.isNullOrBlank() && !player.height.equals("Unknown", ignoreCase = true)) {
                            PlayerTag(text = player.height)
                        }

                        // Youth-specific tags
                        if (platform == Platform.YOUTH) {
                            if (!player.ageGroup.isNullOrBlank()) {
                                PlayerTag(
                                    text = player.ageGroup.orEmpty(),
                                    tagColor = PlatformYouthAccent.copy(alpha = 0.15f),
                                    textColor = PlatformYouthAccent
                                )
                            }
                        }

                        // Women-specific indicator
                        if (platform == Platform.WOMEN && !player.soccerDonnaUrl.isNullOrBlank()) {
                            PlayerTag(
                                text = "SD",
                                tagColor = PlatformWomenAccent.copy(alpha = 0.15f),
                                textColor = PlatformWomenAccent
                            )
                        }
                    }
                }

                // Market value + trend
                Column(
                    horizontalAlignment = Alignment.End,
                    modifier = Modifier.padding(start = 8.dp, top = 2.dp)
                ) {
                    val valueColor = when {
                        valueTrend > 0 -> PlatformColors.palette.green
                        valueTrend < 0 -> PlatformColors.palette.red
                        else -> PlatformColors.palette.textPrimary
                    }
                    val displayValue = player.marketValue.takeIf { !it.isNullOrBlank() }?.let {
                        if (platform == Platform.WOMEN) SoccerDonnaSearch.normalizeSoccerDonnaMarketValue(it) else it
                    } ?: "--"
                    Text(
                        text = displayValue,
                        style = boldTextStyle(valueColor, 14.sp)
                    )
                    if (valueTrend != 0) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(1.dp),
                            modifier = Modifier.padding(top = 1.dp)
                        ) {
                            Icon(
                                imageVector = if (valueTrend > 0) Icons.AutoMirrored.Filled.TrendingUp
                                else Icons.AutoMirrored.Filled.TrendingDown,
                                contentDescription = null,
                                tint = if (valueTrend > 0) PlatformColors.palette.green else PlatformColors.palette.red,
                                modifier = Modifier.size(12.dp)
                            )
                            Text(
                                text = if (valueTrend > 0) "+${valueTrend}%" else "${valueTrend}%",
                                style = boldTextStyle(
                                    if (valueTrend > 0) PlatformColors.palette.green else PlatformColors.palette.red,
                                    9.sp
                                )
                            )
                        }
                    }
                }
            }

            // ── Bottom Row: Badges (aligned with content: avatar 52 + spacer 10 = 62 from row start) ──
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 74.dp, end = 12.dp, bottom = 10.dp, top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                    if (player.isOnLoan) {
                        OnLoanPill(text = stringResource(R.string.players_on_loan))
                    }

                    if (hasMandate) {
                        PlayerBadge(
                            icon = Icons.Filled.Handshake,
                            text = stringResource(R.string.stat_mandate),
                            backgroundColor = PlatformColors.palette.blue.copy(alpha = 0.15f),
                            contentColor = PlatformColors.palette.blue
                        )
                    }

                    if (isExpiring) {
                        PlayerBadge(
                            icon = Icons.Filled.Schedule,
                            text = stringResource(R.string.players_expiring_badge),
                            backgroundColor = PlatformColors.palette.orange.copy(alpha = 0.15f),
                            contentColor = PlatformColors.palette.orange
                        )
                    }

                    if (isFreeAgent) {
                        PlayerBadge(
                            icon = Icons.Filled.PersonOff,
                            text = stringResource(R.string.players_free_agent),
                            backgroundColor = PlatformColors.palette.red.copy(alpha = 0.15f),
                            contentColor = PlatformColors.palette.red
                        )
                    }

                    PlayerBadge(
                        icon = Icons.Filled.CalendarMonth,
                        text = when {
                            player.contractExpired.isNullOrBlank() || player.contractExpired == "-" ||
                                player.contractExpired.equals("Unknown", ignoreCase = true) ->
                                stringResource(R.string.players_contract_not_available)
                            else -> player.contractExpired.orEmpty()
                        },
                        backgroundColor = Color.White.copy(alpha = 0.05f),
                        contentColor = PlatformColors.palette.textSecondary
                    )

                    if (hasNotes && noteCount > 0) {
                        PlayerBadge(
                            icon = Icons.AutoMirrored.Filled.StickyNote2,
                            text = noteCount.toString(),
                            backgroundColor = PlatformColors.palette.purple.copy(alpha = 0.12f),
                            contentColor = PlatformColors.palette.purple
                        )
                    }

                    if (!player.agentInChargeName.isNullOrBlank()) {
                        val rawAgentName = player.agentInChargeName.orEmpty()
                        val agentDisplayName = when {
                            rawAgentName.equals("Unknown", ignoreCase = true) ->
                                stringResource(R.string.player_info_unknown)
                            else -> allAccounts
                                .find { it.name.equals(rawAgentName, ignoreCase = true) }
                                ?.getDisplayName(context)
                                ?: rawAgentName
                        }
                        PlayerBadge(
                            icon = Icons.Filled.Person,
                            text = agentDisplayName,
                            backgroundColor = PlatformColors.palette.accent.copy(alpha = 0.15f),
                            contentColor = PlatformColors.palette.accent
                        )
                    }

                    // Date added badge — men only
                    if (platform == Platform.MEN && (player.createdAt ?: 0L) > 0L) {
                        PlayerBadge(
                            icon = Icons.Filled.CalendarMonth,
                            text = stringResource(
                                R.string.player_info_added_on,
                                java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale.getDefault()).format(java.util.Date(player.createdAt!!))
                            ),
                            backgroundColor = Color.White.copy(alpha = 0.05f),
                            contentColor = PlatformColors.palette.textSecondary
                        )
                    }
                }
        }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  ON LOAN PILL (Option C — inline badge)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun OnLoanPill(
    text: String,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(PlatformColors.palette.purple, Color(0xFF7B1FA2))
                )
            )
            .padding(horizontal = 6.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = boldTextStyle(Color.White, 9.sp),
            maxLines = 1
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  VALUE CHANGE SPARKLINE
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun MarketValueSparkline(
    history: List<com.liordahan.mgsrteam.features.players.models.MarketValueEntry>?,
    valueTrend: Int,
    modifier: Modifier = Modifier
) {
    data class MvPoint(val value: Double, val label: String)

    val sorted = remember(history) {
        history?.filter { it.value != null && it.date != null }
            ?.sortedBy { it.date }
            ?.mapNotNull { entry ->
                val d = entry.value?.toMarketValueDouble() ?: return@mapNotNull null
                MvPoint(d, entry.value!!)
            }
            ?: emptyList()
    }

    if (sorted.size < 2) return
    if (sorted.map { it.value }.distinct().size < 2) return

    val lineColor = when {
        valueTrend > 0 -> PlatformColors.palette.green
        valueTrend < 0 -> PlatformColors.palette.red
        else -> PlatformColors.palette.accent
    }

    val values = sorted.map { it.value }
    val minVal = values.minOrNull() ?: 0.0
    val maxVal = values.maxOrNull() ?: 1.0
    val range = (maxVal - minVal).coerceAtLeast(1.0)
    val firstLabel = sorted.first().label
    val lastLabel = sorted.last().label

    Column(modifier = modifier.padding(horizontal = 14.dp)) {
        // --- Chart ---
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(lineColor.copy(alpha = 0.06f))
                .border(0.5.dp, lineColor.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
        ) {
            val pad = 6.dp
            Canvas(modifier = Modifier.matchParentSize().padding(pad)) {
                val w = size.width
                val h = size.height
                val pts = values.mapIndexed { i, v ->
                    val x = (i.toFloat() / (values.size - 1).coerceAtLeast(1)) * w
                    val y = h - ((v - minVal) / range * h).toFloat()
                    Offset(x, y)
                }

                // Peak dashed reference line
                val peakY = h - ((maxVal - minVal) / range * h).toFloat()
                drawLine(
                    color = lineColor.copy(alpha = 0.18f),
                    start = Offset(0f, peakY),
                    end = Offset(w, peakY),
                    strokeWidth = 1f,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f))
                )

                // Gradient fill under curve
                val fillPath = Path().apply {
                    moveTo(pts.first().x, h)
                    for (idx in pts.indices) {
                        if (idx == 0) {
                            lineTo(pts[idx].x, pts[idx].y)
                        } else {
                            val prev = pts[idx - 1]
                            val cur = pts[idx]
                            val cx = (prev.x + cur.x) / 2f
                            cubicTo(cx, prev.y, cx, cur.y, cur.x, cur.y)
                        }
                    }
                    lineTo(pts.last().x, h)
                    close()
                }
                drawPath(
                    path = fillPath,
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            lineColor.copy(alpha = 0.30f),
                            lineColor.copy(alpha = 0.08f),
                            lineColor.copy(alpha = 0.0f)
                        ),
                        startY = pts.minOf { it.y },
                        endY = h
                    )
                )

                // Smooth curve line
                if (pts.size >= 2) {
                    val linePath = Path().apply {
                        moveTo(pts.first().x, pts.first().y)
                        for (idx in 1 until pts.size) {
                            val prev = pts[idx - 1]
                            val cur = pts[idx]
                            val cx = (prev.x + cur.x) / 2f
                            cubicTo(cx, prev.y, cx, cur.y, cur.x, cur.y)
                        }
                    }
                    drawPath(
                        path = linePath,
                        color = lineColor,
                        style = Stroke(
                            width = 2.5.dp.toPx(),
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round
                        )
                    )
                }

                // Endpoint glow dot
                val last = pts.last()
                drawCircle(
                    color = lineColor.copy(alpha = 0.20f),
                    radius = 6.dp.toPx(),
                    center = last
                )
                drawCircle(
                    color = lineColor,
                    radius = 3.5.dp.toPx(),
                    center = last
                )
                drawCircle(
                    color = Color.White,
                    radius = 1.5.dp.toPx(),
                    center = last
                )
            }
        }

        // --- Value labels: first → last ---
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 3.dp, start = 2.dp, end = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = firstLabel,
                style = regularTextStyle(
                    PlatformColors.palette.textSecondary.copy(alpha = 0.6f),
                    8.sp
                )
            )
            Text(
                text = lastLabel,
                style = boldTextStyle(lineColor, 8.sp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHARED SMALL COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerTag(
    text: String,
    isPosition: Boolean = false,
    tagColor: Color? = null,
    textColor: Color? = null
) {
    val resolvedTextColor = textColor ?: if (isPosition) PlatformColors.palette.accent else PlatformColors.palette.textSecondary
    val resolvedBgColor = tagColor ?: if (isPosition) PlatformColors.palette.accent.copy(alpha = 0.15f) else Color.White.copy(alpha = 0.05f)

    Text(
        text = text,
        style = boldTextStyle(
            color = resolvedTextColor,
            fontSize = 10.sp
        ),
        softWrap = false,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(resolvedBgColor)
            .padding(horizontal = 8.dp, vertical = 2.dp)
    )
}

@Composable
private fun PlayerBadge(
    icon: ImageVector,
    text: String,
    backgroundColor: Color,
    contentColor: Color
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .padding(horizontal = 6.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = contentColor,
            modifier = Modifier.size(11.dp)
        )
        Text(
            text = text,
            style = boldTextStyle(contentColor, 9.sp),
            maxLines = 1
        )
    }
}


private fun isContractExpiringSoon(contractExpired: String?): Boolean {
    if (contractExpired.isNullOrBlank() || contractExpired == "-") return false
    return try {
        val formatters = listOf(
            java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy", java.util.Locale.ENGLISH),
            java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy", java.util.Locale.ENGLISH),
            java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy", java.util.Locale.ENGLISH)
        )
        var expiryDate: java.time.LocalDate? = null
        for (fmt in formatters) {
            try {
                expiryDate = java.time.LocalDate.parse(contractExpired, fmt)
                break
            } catch (_: Exception) {
            }
        }
        if (expiryDate == null) return false
        val now = java.time.LocalDate.now()
        val threshold = now.plusMonths(5)
        !expiryDate.isBefore(now) && !expiryDate.isAfter(threshold)
    } catch (_: Exception) {
        false
    }
}

private fun computeValueTrend(history: List<com.liordahan.mgsrteam.features.players.models.MarketValueEntry>?): Int {
    if (history.isNullOrEmpty() || history.size < 2) return 0
    val sorted = history.sortedBy { it.date ?: 0L }
    val prev = sorted[sorted.size - 2].value?.toMarketValueDouble() ?: return 0
    val current = sorted.last().value?.toMarketValueDouble() ?: return 0
    if (prev == 0.0) return 0
    val pct = ((current - prev) / prev * 100).toInt()
    return pct.coerceIn(-99, 999)
}

private fun String.toMarketValueDouble(): Double {
    val lower = this.lowercase().trim().removePrefix("€").replace(",", "")
    return when {
        lower.endsWith("k") -> lower.removeSuffix("k").toDoubleOrNull()?.times(1_000) ?: 0.0
        lower.endsWith("m") -> lower.removeSuffix("m").toDoubleOrNull()?.times(1_000_000) ?: 0.0
        else -> lower.toDoubleOrNull() ?: 0.0
    }
}
