package com.liordahan.mgsrteam.features.players

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.automirrored.filled.StickyNote2
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.PlayerListFilterBottomSheet
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getAgentPhoneNumber
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.features.players.sort.PlayerListSortBottomSheet
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.*
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel

// ═════════════════════════════════════════════════════════════════════════════
//  PLAYERS SCREEN — Variant A (Enhanced Roster View)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun PlayersScreen(
    viewModel: IPlayersViewModel = koinViewModel(),
    navController: NavController
) {
    val context = LocalContext.current
    val playersState by viewModel.playersFlow.collectAsStateWithLifecycle()

    var userName by remember { mutableStateOf("") }
    var searchQuery by remember { mutableStateOf(viewModel.playersFlow.value.searchQuery) }
    var showFilterBottomSheet by remember { mutableStateOf(false) }
    var showSortBottomSheet by remember { mutableStateOf(false) }
    val showEmptyState by remember(playersState) {
        mutableStateOf(playersState.visibleList.isEmpty() && !playersState.showPageLoader)
    }
    val listState = rememberLazyListState()

    val numberOfFilters by remember(playersState) {
        derivedStateOf {
            playersState.selectedPositions.size +
                    playersState.selectedAccounts.size +
                    (if (playersState.contractFilterOption != ContractFilterOption.NONE) 1 else 0) +
                    (if (playersState.isWithNotesChecked) 1 else 0)
        }
    }

    BackHandler {
        ActivityCompat.finishAffinity(context as Activity)
    }

    LaunchedEffect(Unit) {
        userName = viewModel.getCurrentUserName() ?: ""
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {

            // ── Header ───────────────────────────────────────────────────
            PlayersHeader(userName = userName)

            // ── Stats Strip ──────────────────────────────────────────────
            StatsStrip(
                total = playersState.totalPlayers,
                mandate = playersState.mandateCount,
                expiring = playersState.expiringCount,
                free = playersState.freeAgentCount
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
                }
            )

            // ── Filter Chips ─────────────────────────────────────────────
            PositionFilterChips(
                selectedPositions = playersState.selectedPositions.mapNotNull { it.name },
                onChipClick = { /* Handled by existing filter bottom sheet */ }
            )

            // ── Sort / Filter Toolbar ────────────────────────────────────
            SortFilterToolbar(
                sortOption = playersState.sortOption,
                numberOfFilters = numberOfFilters,
                onSortClick = { showSortBottomSheet = true },
                onFilterClick = { showFilterBottomSheet = true }
            )

            // ── Content ──────────────────────────────────────────────────
            when {
                playersState.showPageLoader -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = HomeTealAccent,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(44.dp)
                        )
                    }
                }

                showEmptyState -> {
                    EmptyState(
                        text = "No players found",
                        onResetFiltersClicked = {
                            searchQuery = ""
                            viewModel.removeAllFilters()
                        }
                    )
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
                        // Expiring Alert Banner
                        if (playersState.expiringSoonPlayers.isNotEmpty()) {
                            item(key = "expiring_alert") {
                                ExpiringAlertBanner(
                                    count = playersState.expiringSoonPlayers.size,
                                    players = playersState.expiringSoonPlayers,
                                    onPlayerClick = { player ->
                                        val encodedId = Uri.encode(player.tmProfile)
                                        navController.navigate("${Screens.PlayerInfoScreen.route}/$encodedId")
                                    }
                                )
                            }
                        }

                        // Player Cards
                        items(
                            items = playersState.visibleList,
                            key = { it.tmProfile ?: (it.fullName ?: "p-${it.hashCode()}") }
                        ) { player ->
                            PlayerCardVariantA(
                                player = player,
                                onPlayerClick = {
                                    val encodedId = Uri.encode(player.tmProfile)
                                    navController.navigate("${Screens.PlayerInfoScreen.route}/$encodedId")
                                },
                                onPhoneClick = {
                                    val phone = player.getPlayerPhoneNumber()
                                        ?: player.getAgentPhoneNumber()
                                    if (!phone.isNullOrBlank()) {
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                        context.startActivity(intent)
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }

        // ── FAB ──────────────────────────────────────────────────────────
        FloatingActionButton(
            onClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 20.dp, bottom = 24.dp),
            shape = RoundedCornerShape(18.dp),
            containerColor = HomeTealAccent,
            contentColor = HomeDarkBackground
        ) {
            Icon(
                imageVector = Icons.Filled.PersonAdd,
                contentDescription = "Add Player",
                modifier = Modifier.size(24.dp)
            )
        }

        // ── Bottom Sheets ────────────────────────────────────────────────
        if (showFilterBottomSheet) {
            PlayerListFilterBottomSheet(
                modifier = Modifier.align(Alignment.BottomEnd),
                selectedPositionList = playersState.selectedPositions,
                selectedAgentList = playersState.selectedAccounts,
                selectedContractFilterOption = playersState.contractFilterOption,
                isWithNotesChecked = playersState.isWithNotesChecked,
                onDismiss = { showFilterBottomSheet = false }
            )
        }

        if (showSortBottomSheet) {
            PlayerListSortBottomSheet(
                modifier = Modifier.align(Alignment.BottomEnd),
                selectedSortOption = playersState.sortOption,
                onDismissRequest = { showSortBottomSheet = false }
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayersHeader(userName: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 4.dp)
    ) {
        Text(
            text = "My Roster",
            style = boldTextStyle(HomeTextPrimary, 26.sp)
        )
        if (userName.isNotBlank()) {
            Text(
                text = "Welcome, $userName",
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS STRIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun StatsStrip(total: Int, mandate: Int, expiring: Int, free: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        StatsStripItem(
            value = total.toString(),
            label = "Total",
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        StatsStripDivider()
        StatsStripItem(
            value = mandate.toString(),
            label = "Mandate",
            accentColor = HomeBlueAccent,
            modifier = Modifier.weight(1f)
        )
        StatsStripDivider()
        StatsStripItem(
            value = expiring.toString(),
            label = "Expiring",
            accentColor = HomeOrangeAccent,
            modifier = Modifier.weight(1f)
        )
        StatsStripDivider()
        StatsStripItem(
            value = free.toString(),
            label = "Free",
            accentColor = HomeRedAccent,
            modifier = Modifier.weight(1f)
        )
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
            style = boldTextStyle(HomeTextPrimary, 18.sp)
        )
        Text(
            text = label,
            style = regularTextStyle(HomeTextSecondary, 9.sp)
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
            .background(HomeDarkCardBorder)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  SEARCH BAR
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayersSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit
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
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp)),
        placeholder = {
            Text(
                text = "Search players, clubs...",
                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.5f), 13.sp)
            )
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier.size(20.dp)
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Clear",
                    tint = HomeTextSecondary,
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
        textStyle = regularTextStyle(HomeTextPrimary, 13.sp),
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
            focusedContainerColor = HomeDarkCard,
            unfocusedContainerColor = HomeDarkCard,
            cursorColor = HomeTealAccent,
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
    onChipClick: (String) -> Unit
) {
    val positions = listOf("All", "GK", "DEF", "MID", "FWD")
    val isAllSelected = selectedPositions.isEmpty()

    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        items(positions) { position ->
            val isSelected = if (position == "All") isAllSelected
            else selectedPositions.any { it.equals(position, ignoreCase = true) }

            val bgColor by animateColorAsState(
                targetValue = if (isSelected) HomeTealAccent else Color.Transparent,
                label = "chipBg"
            )
            val textColor = if (isSelected) HomeDarkBackground else HomeTextSecondary
            val borderColor = if (isSelected) HomeTealAccent else HomeDarkCardBorder

            Text(
                text = position,
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
//  SORT / FILTER TOOLBAR
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun SortFilterToolbar(
    sortOption: SortOption,
    numberOfFilters: Int,
    onSortClick: () -> Unit,
    onFilterClick: () -> Unit
) {
    val isSortActive = sortOption != SortOption.DEFAULT
    val isFilterActive = numberOfFilters > 0

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Sort button
        ToolbarButton(
            icon = Icons.AutoMirrored.Filled.Sort,
            label = "Sort",
            isActive = isSortActive,
            badge = null,
            onClick = onSortClick
        )

        // Filter button
        ToolbarButton(
            icon = Icons.Filled.FilterList,
            label = "Filters",
            isActive = isFilterActive,
            badge = if (isFilterActive) numberOfFilters.toString() else null,
            onClick = onFilterClick
        )
    }
}

@Composable
private fun ToolbarButton(
    icon: ImageVector,
    label: String,
    isActive: Boolean,
    badge: String?,
    onClick: () -> Unit
) {
    val bgColor = if (isActive) HomeTealAccent else Color.Transparent
    val contentColor = if (isActive) HomeDarkBackground else HomeTextSecondary
    val borderColor = if (isActive) HomeTealAccent else HomeDarkCardBorder

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(10.dp))
            .clickWithNoRipple { onClick() }
            .padding(horizontal = 12.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = contentColor,
            modifier = Modifier.size(14.dp)
        )
        Text(
            text = label,
            style = boldTextStyle(contentColor, 11.sp)
        )
        if (badge != null) {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(HomeDarkBackground),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = badge,
                    style = boldTextStyle(HomeTealAccent, 9.sp)
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

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { isExpanded = !isExpanded },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
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
                            size = androidx.compose.ui.geometry.Size(
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
                    tint = HomeOrangeAccent,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "$count Contracts Expiring Soon",
                        style = boldTextStyle(HomeOrangeAccent, 12.sp)
                    )
                    Text(
                        text = "Action needed before contract ends",
                        style = regularTextStyle(HomeTextSecondary, 10.sp)
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(HomeOrangeAccent.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = count.toString(),
                        style = boldTextStyle(HomeOrangeAccent, 11.sp)
                    )
                }
                Spacer(Modifier.width(4.dp))
                Icon(
                    imageVector = Icons.Rounded.ChevronRight,
                    contentDescription = null,
                    tint = HomeTextSecondary,
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
                            .background(HomeDarkCardBorder)
                    )
                    Spacer(Modifier.height(8.dp))
                    players.take(5).forEach { player ->
                        ExpiringPlayerRow(player = player, onClick = { onPlayerClick(player) })
                    }
                }
            }
        }
    }
}

@Composable
private fun ExpiringPlayerRow(player: Player, onClick: () -> Unit) {
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
            Text(
                text = player.fullName ?: "",
                style = boldTextStyle(HomeTextPrimary, 13.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = player.currentClub?.clubName ?: "",
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(HomeOrangeAccent.copy(alpha = 0.12f))
                .padding(horizontal = 8.dp, vertical = 3.dp)
        ) {
            Text(
                text = player.contractExpired ?: "",
                style = boldTextStyle(HomeOrangeAccent, 10.sp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  PLAYER CARD — Variant A
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerCardVariantA(
    player: Player,
    onPlayerClick: () -> Unit,
    onPhoneClick: () -> Unit
) {
    val isFreeAgent = player.currentClub?.clubName.equals("Without Club", ignoreCase = true) ||
            player.currentClub?.clubName.equals("Without club", ignoreCase = true)
    val isExpiring = remember(player.contractExpired) {
        isContractExpiringSoon(player.contractExpired)
    }
    val hasMandate = false
    val hasNotes = !player.notes.isNullOrEmpty() || !player.noteList.isNullOrEmpty()
    val noteCount = player.noteList?.size ?: if (!player.notes.isNullOrEmpty()) 1 else 0

    // Color-coded left border
    val borderColor = when {
        isFreeAgent -> HomeRedAccent
        isExpiring -> HomeOrangeAccent
        hasMandate -> HomeBlueAccent
        else -> HomeTealAccent
    }

    // Market value trend
    val valueTrend = remember(player.marketValueHistory) {
        computeValueTrend(player.marketValueHistory)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { onPlayerClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    // Left color accent bar
                    drawRect(
                        color = borderColor,
                        topLeft = Offset.Zero,
                        size = androidx.compose.ui.geometry.Size(
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
                    AsyncImage(
                        model = player.profileImage,
                        contentDescription = null,
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .border(2.dp, HomeDarkCardBorder, CircleShape),
                        contentScale = ContentScale.Fit
                    )
                    // Status indicator dot
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(HomeDarkCard)
                            .padding(2.dp)
                            .clip(CircleShape)
                            .background(
                                when {
                                    isFreeAgent -> HomeRedAccent
                                    isExpiring -> HomeOrangeAccent
                                    else -> HomeGreenAccent
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
                            style = boldTextStyle(HomeTextPrimary, 14.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(top = 2.dp)
                    ) {
                        Text(
                            text = player.nationality ?: "",
                            style = regularTextStyle(HomeTextPrimary, 12.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (!player.nationalityFlag.isNullOrBlank()) {
                            AsyncImage(
                                model = player.nationalityFlag,
                                contentDescription = null,
                                modifier = Modifier
                                    .size(15.dp)
                                    .clip(CircleShape)
                            )
                        }
                    }

                    // Club
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 2.dp)
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
                            text = if (isFreeAgent) "Free Agent" else (player.currentClub?.clubName ?: ""),
                            style = if (isFreeAgent) boldTextStyle(HomeRedAccent, 11.sp)
                            else regularTextStyle(HomeTextSecondary, 11.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // Tags: age, positions, height
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.padding(top = 5.dp)
                    ) {
                        if (!player.age.isNullOrBlank()) {
                            PlayerTag(text = "${player.age} yrs")
                        }
                        player.positions?.filterNotNull()?.take(2)?.forEach { pos ->
                            PlayerTag(
                                text = pos,
                                isPosition = true
                            )
                        }
                        if (!player.height.isNullOrBlank()) {
                            PlayerTag(text = player.height)
                        }
                    }
                }

                // Market value + trend
                Column(
                    horizontalAlignment = Alignment.End,
                    modifier = Modifier.padding(start = 8.dp, top = 2.dp)
                ) {
                    val valueColor = when {
                        valueTrend > 0 -> HomeGreenAccent
                        valueTrend < 0 -> HomeRedAccent
                        else -> HomeTextPrimary
                    }
                    Text(
                        text = player.marketValue.takeIf { !it.isNullOrBlank() } ?: "--",
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
                                tint = if (valueTrend > 0) HomeGreenAccent else HomeRedAccent,
                                modifier = Modifier.size(12.dp)
                            )
                            Text(
                                text = if (valueTrend > 0) "+${valueTrend}%" else "${valueTrend}%",
                                style = boldTextStyle(
                                    if (valueTrend > 0) HomeGreenAccent else HomeRedAccent,
                                    9.sp
                                )
                            )
                        }
                    }
                }
            }

            // ── Bottom Row: Badges + Actions ────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, bottom = 10.dp, top = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Badges row (wrap)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    if (hasMandate) {
                        PlayerBadge(
                            icon = Icons.Filled.Handshake,
                            text = "Mandate",
                            backgroundColor = HomeBlueAccent.copy(alpha = 0.15f),
                            contentColor = HomeBlueAccent
                        )
                    }

                    if (isExpiring) {
                        PlayerBadge(
                            icon = Icons.Filled.Schedule,
                            text = "Expiring",
                            backgroundColor = HomeOrangeAccent.copy(alpha = 0.15f),
                            contentColor = HomeOrangeAccent
                        )
                    }

                    if (isFreeAgent) {
                        PlayerBadge(
                            icon = Icons.Filled.PersonOff,
                            text = "Free Agent",
                            backgroundColor = HomeRedAccent.copy(alpha = 0.15f),
                            contentColor = HomeRedAccent
                        )
                    }

                    if (!player.contractExpired.isNullOrBlank() && player.contractExpired != "-") {
                        PlayerBadge(
                            icon = Icons.Filled.CalendarMonth,
                            text = player.contractExpired.orEmpty(),
                            backgroundColor = Color.White.copy(alpha = 0.05f),
                            contentColor = HomeTextSecondary
                        )
                    }

                    if (hasNotes && noteCount > 0) {
                        PlayerBadge(
                            icon = Icons.AutoMirrored.Filled.StickyNote2,
                            text = noteCount.toString(),
                            backgroundColor = HomePurpleAccent.copy(alpha = 0.12f),
                            contentColor = HomePurpleAccent
                        )
                    }
                }

                // Quick actions (show phone if player or agent has a number)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    val hasAnyPhone = !player.getPlayerPhoneNumber().isNullOrBlank() ||
                        !player.getAgentPhoneNumber().isNullOrBlank()
                    if (hasAnyPhone) {
                        QuickActionButton(
                            icon = Icons.Filled.Phone,
                            onClick = onPhoneClick
                        )
                    }
                    QuickActionButton(
                        icon = Icons.Filled.EditNote,
                        onClick = onPlayerClick
                    )
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHARED SMALL COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerTag(text: String, isPosition: Boolean = false) {
    Text(
        text = text,
        style = boldTextStyle(
            color = if (isPosition) HomeTealAccent else HomeTextSecondary,
            fontSize = 10.sp
        ),
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(
                if (isPosition) HomeTealAccent.copy(alpha = 0.15f)
                else Color.White.copy(alpha = 0.05f)
            )
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

@Composable
private fun QuickActionButton(
    icon: ImageVector,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(8.dp))
            .clickWithNoRipple { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = HomeTextSecondary,
            modifier = Modifier.size(14.dp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** Display name for list/cards: use fullName only if it looks like a name (not a URL/tmProfile). */
private fun Player.displayNameForList(): String {
    val name = fullName?.trim().orEmpty()
    if (name.isEmpty()) return "--"
    // If fullName looks like a URL or profile id, don't show it as the name
    if (name.contains("http", ignoreCase = true) ||
        name.contains("transfermarkt", ignoreCase = true) ||
        name.contains("/player/", ignoreCase = true) ||
        name.startsWith("www.", ignoreCase = true)
    ) return "--"
    return name
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
            } catch (_: Exception) { }
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
