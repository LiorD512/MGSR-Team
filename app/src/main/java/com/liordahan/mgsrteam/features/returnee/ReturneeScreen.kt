package com.liordahan.mgsrteam.features.returnee

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.releases.ReleaseListItem
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import androidx.compose.runtime.rememberCoroutineScope

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReturneeScreen(
    navController: NavController,
    viewModel: IReturneeViewModel = koinViewModel(),
    addPlayerViewModel: IAddPlayerViewModel = koinViewModel(),
    shortlistRepository: ShortlistRepository = koinInject()
) {

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val returneeState by viewModel.returneeFlow.collectAsState()
    val visibleReturneeList = returneeState.visibleList
    val originalReturneeList = returneeState.returneeList
    val positionList = returneeState.positionList
    val isLoading = returneeState.isLoading
    val loadedCount = returneeState.loadedLeaguesCount
    val totalCount = returneeState.totalLeaguesCount

    var selectedPosition by rememberSaveable {
        mutableStateOf<Position?>(null)
    }

    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsState()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsState()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsState()

    val state = rememberLazyListState()

    // Track shortlist status
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) {
        shortlistEntries.map { it.tmProfileUrl }.toSet()
    }
    var justAddedUrls by remember { mutableStateOf(setOf<String>()) }

    val shortlistedCount = remember(originalReturneeList, shortlistUrls, justAddedUrls) {
        originalReturneeList.count { it.playerUrl in shortlistUrls || it.playerUrl in justAddedUrls }
    }

    LaunchedEffect(Unit) {
        viewModel.fetchAllReturneesFromAllLeagues()
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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header (same position/style as Releases)
            ReturneesHeader()

            // Stats Strip (same structure as Releases)
            ReturneesStatsStrip(
                total = originalReturneeList.size,
                shortlisted = shortlistedCount,
                leaguesLoaded = "$loadedCount/$totalCount"
            )

            // Position Filter Chips (same as Releases)
            ReturneesPositionChips(
                positionList = positionList,
                selectedPosition = selectedPosition,
                originalReturneeList = originalReturneeList,
                onPositionClicked = {
                    selectedPosition = if (selectedPosition == it) null else it
                    viewModel.updateSelectedPosition(selectedPosition)
                },
                onAllClicked = {
                    selectedPosition = null
                    viewModel.updateSelectedPosition(null)
                }
            )

            // Empty state when no returnees
            if (visibleReturneeList.isEmpty() && !isLoading) {
                EmptyState(
                    text = "No returnees found",
                    showResetFiltersButton = selectedPosition != null,
                    onResetFiltersClicked = {
                        selectedPosition = null
                        viewModel.updateSelectedPosition(null)
                    }
                )
                return@Column
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = state,
                contentPadding = PaddingValues(
                    top = 16.dp,
                    bottom = 100.dp,
                    start = 16.dp,
                    end = 16.dp
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Inline loading when results showing but still loading more leagues
                if (isLoading) {
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(HomeDarkCard)
                                .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = HomeTealAccent
                            )
                            Text(
                                text = "Loading ($loadedCount/$totalCount leagues)...",
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                    }
                }

                items(visibleReturneeList) {
                    ReleaseListItem(
                        context = context,
                        release = it,
                        isFromReturnee = true,
                        onAddToAgencyClicked = { url ->
                            addPlayerTmUrl = url
                            showAddPlayerBottomSheet = true
                        },
                        onAddToShortlistClicked = { release ->
                            scope.launch {
                                val url = release.playerUrl ?: return@launch
                                val isInShortlist = url in shortlistUrls || url in justAddedUrls
                                if (isInShortlist) {
                                    shortlistRepository.removeFromShortlist(url)
                                    justAddedUrls = justAddedUrls - url
                                } else {
                                    shortlistRepository.addToShortlist(release)
                                    justAddedUrls = justAddedUrls + url
                                }
                            }
                        },
                        isInShortlist = { url ->
                            url in shortlistUrls || url in justAddedUrls
                        }
                    )
                }
            }

            if (showAddPlayerBottomSheet) {
                val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
                ModalBottomSheet(
                    onDismissRequest = {
                        showAddPlayerBottomSheet = false
                        addPlayerTmUrl = null
                        addPlayerViewModel.resetAfterAdd()
                    },
                    sheetState = sheetState,
                    containerColor = HomeDarkCard,
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
                                CircularProgressIndicator(color = HomeTealAccent)
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
                                text = "Could not load player. They may already be in your roster.",
                                style = regularTextStyle(HomeTextSecondary, 14.sp),
                                modifier = Modifier.padding(24.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HEADER (same position and style as Releases)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReturneesHeader() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 4.dp)
    ) {
        Text(
            text = "Returnees",
            style = boldTextStyle(HomeTextPrimary, 26.sp)
        )
        Text(
            text = "Players returning from loan across European leagues",
            style = regularTextStyle(HomeTextSecondary, 13.sp),
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS STRIP (same structure as Releases)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReturneesStatsStrip(total: Int, shortlisted: Int, leaguesLoaded: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        ReturneesStatItem(
            value = total.toString(),
            label = "Total",
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        ReturneesStatsStripDivider()
        ReturneesStatItem(
            value = shortlisted.toString(),
            label = "Shortlisted",
            accentColor = HomeGreenAccent,
            modifier = Modifier.weight(1f)
        )
        ReturneesStatsStripDivider()
        ReturneesStatItem(
            value = leaguesLoaded,
            label = "Leagues",
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ReturneesStatsStripDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .padding(vertical = 4.dp)
            .background(HomeDarkCardBorder)
    )
}

@Composable
private fun ReturneesStatItem(
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

// ═════════════════════════════════════════════════════════════════════════════
//  POSITION FILTER CHIPS (same as Releases)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReturneesPositionChips(
    positionList: List<Position>,
    selectedPosition: Position?,
    originalReturneeList: List<LatestTransferModel>,
    onPositionClicked: (Position) -> Unit,
    onAllClicked: () -> Unit
) {
    val scrollState = rememberScrollState()
    val totalCount = originalReturneeList.size
    val isAllSelected = selectedPosition == null

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
                .horizontalScroll(scrollState),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            ReturneesChipWithLine(
                text = "All $totalCount",
                isSelected = isAllSelected,
                isDisabled = false,
                onClick = onAllClicked
            )

            positionList.forEach { position ->
                val count = originalReturneeList.count { it.playerPosition?.equals(position.name) == true }
                val isSelected = selectedPosition == position
                val isDisabled = count == 0
                val positionName = position.name ?: ""

                ReturneesChipWithLine(
                    text = if (count > 0) "$positionName $count" else positionName,
                    isSelected = isSelected,
                    isDisabled = isDisabled,
                    onClick = { if (!isDisabled) onPositionClicked(position) }
                )
            }
        }
    }
}

@Composable
private fun ReturneesChipWithLine(
    text: String,
    isSelected: Boolean,
    isDisabled: Boolean,
    onClick: () -> Unit
) {
    val bgColor by animateColorAsState(
        targetValue = when {
            isDisabled -> Color.Transparent
            isSelected -> HomeTealAccent
            else -> Color.Transparent
        },
        animationSpec = tween(280),
        label = "chipBg"
    )
    val textColor = when {
        isDisabled -> HomeTextSecondary.copy(alpha = 0.5f)
        isSelected -> HomeDarkBackground
        else -> HomeTextSecondary
    }
    val borderColor = when {
        isDisabled -> HomeDarkCardBorder.copy(alpha = 0.5f)
        isSelected -> HomeTealAccent
        else -> HomeDarkCardBorder
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(bottom = 4.dp)
    ) {
        Text(
            text = text,
            style = boldTextStyle(textColor, 11.sp),
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(bgColor)
                .border(1.dp, borderColor, RoundedCornerShape(20.dp))
                .then(
                    if (isDisabled) Modifier
                    else Modifier.clickWithNoRipple(onClick = onClick)
                )
                .padding(horizontal = 14.dp, vertical = 5.dp)
        )
        AnimatedVisibility(
            visible = isSelected,
            enter = fadeIn(tween(280)) + expandVertically(animationSpec = tween(280)),
            exit = fadeOut(tween(280)) + shrinkVertically(animationSpec = tween(280))
        ) {
            Box(
                modifier = Modifier
                    .padding(top = 4.dp)
                    .width(40.dp)
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(HomeTealAccent)
            )
        }
    }
}
