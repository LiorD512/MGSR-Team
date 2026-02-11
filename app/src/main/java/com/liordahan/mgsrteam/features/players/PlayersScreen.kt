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
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.StickyNote2
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
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
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getAgentPhoneNumber
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.features.players.sort.SortOption
import com.liordahan.mgsrteam.features.players.ui.RosterEmptyState
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

    var searchQuery by remember { mutableStateOf(viewModel.playersFlow.value.searchQuery) }
    val showEmptyState by remember(playersState) {
        mutableStateOf(playersState.visibleList.isEmpty() && !playersState.showPageLoader)
    }
    val listState = rememberLazyListState()

    BackHandler {
        ActivityCompat.finishAffinity(context as Activity)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {

            // ── Header ───────────────────────────────────────────────────
            PlayersHeader()

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

            // ── Filter Chips + Sort Menu ──────────────────────────────────
            PositionFilterChipsWithSortMenu(
                selectedPositions = playersState.selectedPositions.mapNotNull { it.name },
                sortOption = playersState.sortOption,
                onChipClick = { positionName -> viewModel.setPositionFilterByChip(positionName) },
                onSortOptionSelected = { viewModel.setSortOption(it) },
                onResetSort = { viewModel.resetSortOption() }
            )

            // ── Quick Filter Chips ───────────────────────────────────────
            QuickFilterChips(
                freeAgentsSelected = playersState.quickFilterFreeAgents,
                contractExpiringSelected = playersState.quickFilterContractExpiring,
                withMandateSelected = playersState.quickFilterWithMandate,
                myPlayersOnlySelected = playersState.quickFilterMyPlayersOnly,
                onFreeAgentsClick = { viewModel.toggleQuickFilterFreeAgents() },
                onContractExpiringClick = { viewModel.toggleQuickFilterContractExpiring() },
                onWithMandateClick = { viewModel.toggleQuickFilterWithMandate() },
                onMyPlayersOnlyClick = { viewModel.toggleQuickFilterMyPlayersOnly() }
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
                    RosterEmptyState(
                        onAddPlayerClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") },
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

    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayersHeader() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 4.dp)
    ) {
        Text(
            text = "My Roster",
            style = boldTextStyle(HomeTextPrimary, 26.sp)
        )
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
                text = "Search players or notes...",
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
//  POSITION FILTER CHIPS + SORT MENU (3-dot)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PositionFilterChipsWithSortMenu(
    selectedPositions: List<String>,
    sortOption: SortOption,
    onChipClick: (String) -> Unit,
    onSortOptionSelected: (SortOption) -> Unit,
    onResetSort: () -> Unit
) {
    var sortMenuExpanded by remember { mutableStateOf(false) }
    val positions = listOf("All", "GK", "DEF", "MID", "FWD")
    val isAllSelected = selectedPositions.isEmpty()
    val scrollState = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .horizontalScroll(scrollState),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            positions.forEach { position ->
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

        Spacer(Modifier.width(4.dp))

        Box {
            Icon(
                imageVector = Icons.Filled.MoreVert,
                contentDescription = "Sort options",
                tint = HomeTextSecondary,
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(20.dp))
                    .clickWithNoRipple { sortMenuExpanded = true }
                    .padding(8.dp)
            )

            DropdownMenu(
                expanded = sortMenuExpanded,
                onDismissRequest = { sortMenuExpanded = false },
                modifier = Modifier.background(HomeDarkCard),
                containerColor = HomeDarkCard
            ) {
                DropdownMenuItem(
                    text = {
                        Text(
                            text = "Reset",
                            style = regularTextStyle(HomeTextPrimary, 13.sp)
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
                            text = "Newest First",
                            style = regularTextStyle(
                                if (sortOption == SortOption.NEWEST) HomeTealAccent else HomeTextPrimary,
                                13.sp
                            )
                        )
                    },
                    onClick = {
                        onSortOptionSelected(SortOption.NEWEST)
                        sortMenuExpanded = false
                    }
                )
                DropdownMenuItem(
                    text = {
                        Text(
                            text = "By Market Value",
                            style = regularTextStyle(
                                if (sortOption == SortOption.MARKET_VALUE) HomeTealAccent else HomeTextPrimary,
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
                            text = "By Name",
                            style = regularTextStyle(
                                if (sortOption == SortOption.NAME) HomeTealAccent else HomeTextPrimary,
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
                            text = "By Age",
                            style = regularTextStyle(
                                if (sortOption == SortOption.AGE) HomeTealAccent else HomeTextPrimary,
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
//  QUICK FILTER CHIPS (Free Agents, Contract Expiring, My Players Only)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun QuickFilterChips(
    freeAgentsSelected: Boolean,
    contractExpiringSelected: Boolean,
    withMandateSelected: Boolean,
    myPlayersOnlySelected: Boolean,
    onFreeAgentsClick: () -> Unit,
    onContractExpiringClick: () -> Unit,
    onWithMandateClick: () -> Unit,
    onMyPlayersOnlyClick: () -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        item(key = "free_agents") {
            QuickFilterChip(
                label = "Free Agents",
                isSelected = freeAgentsSelected,
                onClick = onFreeAgentsClick
            )
        }
        item(key = "contract_expiring") {
            QuickFilterChip(
                label = "Contract Expiring",
                isSelected = contractExpiringSelected,
                onClick = onContractExpiringClick
            )
        }
        item(key = "with_mandate") {
            QuickFilterChip(
                label = "With Mandate",
                isSelected = withMandateSelected,
                onClick = onWithMandateClick
            )
        }
        item(key = "my_players") {
            QuickFilterChip(
                label = "My Players Only",
                isSelected = myPlayersOnlySelected,
                onClick = onMyPlayersOnlyClick
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
        targetValue = if (isSelected) HomeTealAccent else Color.Transparent,
        label = "quickChipBg"
    )
    val textColor = if (isSelected) HomeDarkBackground else HomeTextSecondary
    val borderColor = if (isSelected) HomeTealAccent else HomeDarkCardBorder

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
    onPlayerClick: () -> Unit
) {
    val isFreeAgent = player.currentClub?.clubName.equals("Without Club", ignoreCase = true) ||
            player.currentClub?.clubName.equals("Without club", ignoreCase = true)
    val isExpiring = remember(player.contractExpired) {
        isContractExpiringSoon(player.contractExpired)
    }
    val hasMandate = player.haveMandate
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
                        contentScale = ContentScale.Crop
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
                            style = regularTextStyle(HomeTextPrimary, 12.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
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

            // ── Value change sparkline ─────────────────────────────────
            MarketValueSparkline(
                history = player.marketValueHistory,
                valueTrend = valueTrend,
                modifier = Modifier.padding(top = 4.dp)
            )

            // ── Bottom Row: Badges + Actions ────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, bottom = 10.dp, top = 4.dp),
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

                    if (!player.agentInChargeName.isNullOrBlank()) {
                        PlayerBadge(
                            icon = Icons.Filled.Person,
                            text = player.agentInChargeName.orEmpty(),
                            backgroundColor = HomeTealAccent.copy(alpha = 0.15f),
                            contentColor = HomeTealAccent
                        )
                    }
                }
            }
        }
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
    val sorted = remember(history) {
        history?.filter { it.value != null && it.date != null }
            ?.sortedBy { it.date }
            ?.mapNotNull { it.value?.toMarketValueDouble() }
            ?: emptyList()
    }

    if (sorted.size < 2) return

    val lineColor = when {
        valueTrend > 0 -> HomeGreenAccent
        valueTrend < 0 -> HomeRedAccent
        else -> HomeTealAccent
    }

    val minVal = sorted.minOrNull() ?: 0.0
    val maxVal = sorted.maxOrNull() ?: 1.0
    val range = (maxVal - minVal).coerceAtLeast(1.0)
    val padding = 4.dp

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(32.dp)
            .padding(horizontal = 14.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(lineColor.copy(alpha = 0.06f))
    ) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val w = size.width - padding.toPx() * 2
            val h = size.height - padding.toPx() * 2
            val pts = sorted.mapIndexed { i, v ->
                val x = padding.toPx() + (i.toFloat() / (sorted.size - 1).coerceAtLeast(1)) * w
                val y = padding.toPx() + h - ((v - minVal) / range * h).toFloat()
                Offset(x, y)
            }

            // Fill under the line
            val fillPath = Path().apply {
                if (pts.isNotEmpty()) {
                    moveTo(pts.first().x, size.height - padding.toPx())
                    pts.forEach { lineTo(it.x, it.y) }
                    lineTo(pts.last().x, size.height - padding.toPx())
                    close()
                }
            }
            drawPath(
                path = fillPath,
                color = lineColor.copy(alpha = 0.2f)
            )

            // Line
            if (pts.size >= 2) {
                val linePath = Path().apply {
                    moveTo(pts.first().x, pts.first().y)
                    pts.drop(1).forEach { lineTo(it.x, it.y) }
                }
                drawPath(
                    path = linePath,
                    color = lineColor,
                    style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round)
                )
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
