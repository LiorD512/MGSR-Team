package com.liordahan.mgsrteam.features.contractfinisher

import android.content.Context
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.releases.ReleaseListItem
import com.liordahan.mgsrteam.features.releases.RosterTeammateMatch
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.TeammatesFetcher
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.utils.extractPlayerIdFromUrl
import android.net.Uri
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.compose.koinInject
import org.koin.androidx.compose.koinViewModel
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.rememberCoroutineScope

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContractFinisherScreen(
    viewModel: IContractFinisherViewModel = koinViewModel(),
    addPlayerViewModel: IAddPlayerViewModel = koinViewModel(),
    shortlistRepository: ShortlistRepository = koinInject(),
    playersRepository: IPlayersRepository = koinInject(),
    teammatesFetcher: TeammatesFetcher = koinInject(),
    navController: NavController
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }

    // Roster teammates feature (same as Releases)
    val rosterPlayers by playersRepository.playersFlow().collectAsState(initial = emptyList())
    var expandedPlayerUrl by remember { mutableStateOf<String?>(null) }
    var teammatesCache by remember { mutableStateOf<Map<String, List<RosterTeammateMatch>>>(emptyMap()) }
    var loadingPlayerUrl by remember { mutableStateOf<String?>(null) }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsState()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsState()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsState()

    val state by viewModel.contractFinisherFlow.collectAsState()
    val positionList by viewModel.positionsFlow.collectAsState(initial = emptyList())
    var selectedPosition by rememberSaveable { mutableStateOf<Position?>(null) }

    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
    var justAddedUrls by remember { mutableStateOf(setOf<String>()) }

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

    LaunchedEffect(selectedPosition) {
        viewModel.selectPosition(selectedPosition)
    }

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

    val shortlistedCount = remember(state.releasesList, shortlistUrls, justAddedUrls) {
        state.releasesList.count { it.playerUrl in shortlistUrls || it.playerUrl in justAddedUrls }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            ContractFinisherHeader(
                windowLabel = state.windowLabel,
                onBackClicked = { navController.popBackStack() }
            )

            if (state.showError) {
                EmptyState(
                    text = stringResource(R.string.releases_tm_down),
                    showResetFiltersButton = true,
                    optionalButtonText = stringResource(R.string.contract_finisher_retry),
                    onResetFiltersClicked = { viewModel.retry() }
                )
                return
            }

            ContractFinisherStatsStrip(
                total = state.releasesList.size,
                shortlisted = shortlistedCount,
                visible = state.visibleList.size
            )

            if (state.visibleList.isEmpty() && !state.isLoading) {
                EmptyState(
                    text = stringResource(R.string.releases_tm_down),
                    showResetFiltersButton = true,
                    optionalButtonText = stringResource(R.string.contract_finisher_retry),
                    onResetFiltersClicked = { viewModel.retry() }
                )
                return
            }

            ContractFinisherPositionChips(
                positionList = positionList,
                selectedPosition = selectedPosition,
                originalReleaseList = state.releasesList,
                onPositionClicked = {
                    selectedPosition = if (selectedPosition == it) null else it
                },
                onAllClicked = { selectedPosition = null }
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 16.dp, bottom = 100.dp, start = 16.dp, end = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (state.isLoading) {
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
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = stringResource(R.string.contract_finisher_loading, state.releasesList.size),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                }
                items(state.visibleList) { release ->
                    val playerUrl = release.playerUrl
                    val isExpanded = playerUrl != null && expandedPlayerUrl == playerUrl
                    val rosterTeammates = playerUrl?.let { teammatesCache[it] }
                    val isLoadingTeammates = playerUrl != null && loadingPlayerUrl == playerUrl
                    ReleaseListItem(
                        context = context,
                        release = release,
                        isFromReturnee = false,
                        isContractFinisher = true,
                        rosterTeammates = rosterTeammates,
                        isLoadingTeammates = isLoadingTeammates,
                        isTeammatesExpanded = isExpanded,
                        onToggleTeammatesExpand = {
                            expandedPlayerUrl = if (isExpanded) null else playerUrl
                        },
                        onRosterTeammateClick = { player ->
                            player.tmProfile?.let { profile ->
                                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(profile)}")
                            }
                        },
                        onAddToAgencyClicked = { url ->
                            addPlayerTmUrl = url
                            showAddPlayerBottomSheet = true
                        },
                        onAddToShortlistClicked = { r ->
                            scope.launch {
                                val url = r.playerUrl ?: return@launch
                                val isInShortlist = url in shortlistUrls || url in justAddedUrls
                                if (isInShortlist) {
                                    shortlistRepository.removeFromShortlist(url)
                                    justAddedUrls = justAddedUrls - url
                                } else {
                                    shortlistRepository.addToShortlist(r)
                                    justAddedUrls = justAddedUrls + url
                                }
                            }
                        },
                        isInShortlist = { url -> url in shortlistUrls || url in justAddedUrls }
                    )
                }
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
                            text = stringResource(R.string.shortlist_could_not_load),
                            style = regularTextStyle(HomeTextSecondary, 14.sp),
                            modifier = Modifier.padding(24.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ContractFinisherHeader(
    windowLabel: String,
    onBackClicked: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 12.dp, top = 48.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = HomeTextSecondary,
            modifier = Modifier
                .size(24.dp)
                .clickWithNoRipple { onBackClicked() }
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.contract_finisher_title),
                style = boldTextStyle(HomeTextPrimary, 26.sp)
            )
            Text(
                text = when (windowLabel) {
                    "Summer" -> stringResource(R.string.contract_finisher_subtitle_summer)
                    else -> stringResource(R.string.contract_finisher_subtitle_winter)
                },
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

@Composable
private fun ContractFinisherStatsStrip(
    total: Int,
    shortlisted: Int,
    visible: Int
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        ContractFinisherStatItem(
            value = total.toString(),
            label = stringResource(R.string.players_stat_total),
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        Box(
            modifier = Modifier
                .width(1.dp)
                .height(40.dp)
                .padding(vertical = 4.dp)
                .background(HomeDarkCardBorder)
        )
        ContractFinisherStatItem(
            value = shortlisted.toString(),
            label = stringResource(R.string.releases_stat_shortlisted),
            accentColor = HomeGreenAccent,
            modifier = Modifier.weight(1f)
        )
        Box(
            modifier = Modifier
                .width(1.dp)
                .height(40.dp)
                .padding(vertical = 4.dp)
                .background(HomeDarkCardBorder)
        )
        ContractFinisherStatItem(
            value = visible.toString(),
            label = stringResource(R.string.releases_stat_visible),
            accentColor = HomeOrangeAccent,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ContractFinisherStatItem(
    value: String,
    label: String,
    accentColor: androidx.compose.ui.graphics.Color,
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
        Text(text = value, style = boldTextStyle(HomeTextPrimary, 18.sp))
        Text(text = label, style = regularTextStyle(HomeTextSecondary, 9.sp))
    }
}

@Composable
private fun ContractFinisherPositionChips(
    positionList: List<Position>,
    selectedPosition: Position?,
    originalReleaseList: List<LatestTransferModel>,
    onPositionClicked: (Position) -> Unit,
    onAllClicked: () -> Unit
) {
    val scrollState = rememberScrollState()
    val totalCount = originalReleaseList.size
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
            ContractFinisherChipWithLine(
                text = stringResource(R.string.releases_all_count, totalCount),
                isSelected = isAllSelected,
                isDisabled = false,
                onClick = onAllClicked
            )
            positionList.forEach { position ->
                val count = originalReleaseList.count { it.playerPosition?.equals(position.name) == true }
                val isSelected = selectedPosition == position
                val isDisabled = count == 0
                val positionName = position.name ?: ""
                ContractFinisherChipWithLine(
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
private fun ContractFinisherChipWithLine(
    text: String,
    isSelected: Boolean,
    isDisabled: Boolean,
    onClick: () -> Unit
) {
    val bgColor by animateColorAsState(
        targetValue = when {
            isDisabled -> androidx.compose.ui.graphics.Color.Transparent
            isSelected -> HomeTealAccent
            else -> androidx.compose.ui.graphics.Color.Transparent
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
