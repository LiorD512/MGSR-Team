package com.liordahan.mgsrteam.features.contractfinisher

import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.Text
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
import com.liordahan.mgsrteam.transfermarket.Confederation
import com.liordahan.mgsrteam.features.releases.RosterTeammateMatch
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.TeammatesFetcher
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
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
import com.liordahan.mgsrteam.utils.extractPlayerIdFromUrl
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

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
    var showFilterSheet by remember { mutableStateOf(false) }

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
    val selectedAgeRange by viewModel.selectedAgeRangeFlow.collectAsState()
    val selectedConfederation by viewModel.selectedConfederationFlow.collectAsState()
    val selectedMarketValueRange by viewModel.selectedMarketValueRangeFlow.collectAsState()
    val selectedPosition by viewModel.selectedPositionFlow.collectAsState()

    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsState(initial = emptySet())
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
            if (state.showError) {
                ContractFinisherHeader(
                    windowLabel = state.windowLabel,
                    onBackClicked = { navController.popBackStack() }
                )
                EmptyState(
                    text = stringResource(R.string.releases_tm_down),
                    showResetFiltersButton = true,
                    optionalButtonText = stringResource(R.string.contract_finisher_retry),
                    onResetFiltersClicked = { viewModel.retry() }
                )
                return
            }

            ContractFinisherHeaderWithFilters(
                windowLabel = state.windowLabel,
                total = state.releasesList.size,
                shortlisted = shortlistedCount,
                visible = state.visibleList.size,
                activeFiltersCount = listOfNotNull(
                    selectedPosition,
                    if (selectedAgeRange != ContractFinisherAgeRange.ALL) selectedAgeRange else null,
                    selectedConfederation,
                    if (selectedMarketValueRange != ContractFinisherMarketValueRange.ALL) selectedMarketValueRange else null
                ).size,
                onBackClicked = { navController.popBackStack() },
                onFiltersClicked = { showFilterSheet = true }
            )

            if (state.visibleList.isEmpty() && !state.isLoading) {
                val isFilteredEmpty = state.releasesList.isNotEmpty()
                EmptyState(
                    text = if (isFilteredEmpty) stringResource(R.string.contract_finisher_no_match_filters)
                    else stringResource(R.string.contract_finisher_no_found),
                    showResetFiltersButton = true,
                    optionalButtonText = if (isFilteredEmpty) stringResource(R.string.contract_finisher_clear_filters)
                    else stringResource(R.string.contract_finisher_retry),
                    onResetFiltersClicked = if (isFilteredEmpty) { { viewModel.clearFilters() } }
                    else { { viewModel.retry() } }
                )
                return
            }

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
                items(
                    items = state.visibleList,
                    key = { it.playerUrl ?: it.playerName ?: it.hashCode().toString() }
                ) { release ->
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
                                    when (shortlistRepository.addToShortlist(r)) {
                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.Added ->
                                            justAddedUrls = justAddedUrls + url
                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                            com.liordahan.mgsrteam.ui.components.ToastManager.showInfo(context.getString(R.string.add_player_already_in_roster))
                                        else -> {}
                                    }
                                }
                            }
                        },
                        isInShortlist = { url -> url in shortlistUrls || url in justAddedUrls },
                        isShortlistPending = (playerUrl != null && playerUrl in shortlistPendingUrls)
                    )
                }
            }
        }

        if (showFilterSheet) {
            val filterSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            ModalBottomSheet(
                onDismissRequest = { showFilterSheet = false },
                sheetState = filterSheetState,
                containerColor = HomeDarkCard,
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
                dragHandle = {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .width(40.dp)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(HomeDarkCardBorder)
                        )
                    }
                }
            ) {
                ContractFinisherFilterSheetContent(
                    positionList = positionList,
                    selectedPosition = selectedPosition,
                    playersCount = state.playersCount,
                    selectedAgeRange = selectedAgeRange,
                    selectedConfederation = selectedConfederation,
                    selectedMarketValueRange = selectedMarketValueRange,
                    onPositionClicked = { viewModel.selectPosition(if (selectedPosition == it) null else it) },
                    onAllPositionsClicked = { viewModel.selectPosition(null) },
                    onAgeRangeClicked = { viewModel.selectAgeRange(it) },
                    onConfederationClicked = { viewModel.selectConfederation(it) },
                    onMarketValueRangeClicked = { viewModel.selectMarketValueRange(it) },
                    onApplyClicked = { showFilterSheet = false }
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
            .padding(start = 20.dp, end = 12.dp, top = 24.dp, bottom = 4.dp),
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
private fun ContractFinisherHeaderWithFilters(
    windowLabel: String,
    total: Int,
    shortlisted: Int,
    visible: Int,
    activeFiltersCount: Int,
    onBackClicked: () -> Unit,
    onFiltersClicked: () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 16.dp, top = 24.dp, bottom = 8.dp),
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
                    style = boldTextStyle(HomeTextPrimary, 22.sp)
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
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(24.dp))
                    .background(HomeTealAccent.copy(alpha = 0.15f))
                    .border(1.dp, HomeTealAccent, RoundedCornerShape(24.dp))
                    .clickWithNoRipple { onFiltersClicked() }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = stringResource(R.string.players_filters),
                    style = boldTextStyle(HomeTealAccent, 14.sp)
                )
                if (activeFiltersCount > 0) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(HomeTealAccent)
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = activeFiltersCount.toString(),
                            style = boldTextStyle(HomeDarkBackground, 11.sp)
                        )
                    }
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(HomeDarkCard)
                .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Text(text = total.toString(), style = boldTextStyle(HomeTealAccent, 18.sp))
                Text(
                    text = stringResource(R.string.players_stat_total),
                    style = regularTextStyle(HomeTextSecondary, 10.sp),
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Text(text = shortlisted.toString(), style = boldTextStyle(HomeGreenAccent, 18.sp))
                Text(
                    text = stringResource(R.string.releases_stat_shortlisted),
                    style = regularTextStyle(HomeTextSecondary, 10.sp),
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Text(text = visible.toString(), style = boldTextStyle(HomeOrangeAccent, 18.sp))
                Text(
                    text = stringResource(R.string.releases_stat_visible),
                    style = regularTextStyle(HomeTextSecondary, 10.sp),
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        }
    }
}

@Composable
private fun ContractFinisherFilterSheetContent(
    positionList: List<Position>,
    selectedPosition: Position?,
    playersCount: Map<String, Int>,
    selectedAgeRange: ContractFinisherAgeRange,
    selectedConfederation: Confederation?,
    selectedMarketValueRange: ContractFinisherMarketValueRange,
    onPositionClicked: (Position) -> Unit,
    onAllPositionsClicked: () -> Unit,
    onAgeRangeClicked: (ContractFinisherAgeRange) -> Unit,
    onConfederationClicked: (Confederation?) -> Unit,
    onMarketValueRangeClicked: (ContractFinisherMarketValueRange) -> Unit,
    onApplyClicked: () -> Unit
) {
    val totalCount = playersCount.values.sum()
    val confederations = listOf(
        null to R.string.feed_filter_all,
        Confederation.UEFA to R.string.transfer_windows_group_uefa,
        Confederation.CONMEBOL to R.string.transfer_windows_group_conmebol,
        Confederation.CONCACAF to R.string.transfer_windows_group_concacaf,
        Confederation.AFC to R.string.transfer_windows_group_afc,
        Confederation.CAF to R.string.transfer_windows_group_caf,
        Confederation.OFC to R.string.transfer_windows_group_ofc
    )
    val marketValueRanges = listOf(
        ContractFinisherMarketValueRange.ALL to R.string.contract_finisher_filter_value_all,
        ContractFinisherMarketValueRange.RANGE_150K_500K to R.string.contract_finisher_filter_value_150k_500k,
        ContractFinisherMarketValueRange.RANGE_500K_1M to R.string.contract_finisher_filter_value_500k_1m,
        ContractFinisherMarketValueRange.RANGE_1M_2M to R.string.contract_finisher_filter_value_1m_2m,
        ContractFinisherMarketValueRange.RANGE_2M_3M to R.string.contract_finisher_filter_value_2m_3m
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 8.dp)
.padding(bottom = 32.dp)
    ) {
        // Value
        ContractFinisherFilterGroup(
            label = stringResource(R.string.contract_finisher_filter_label_value)
        ) {
            marketValueRanges.forEach { (range, labelRes) ->
                ContractFinisherPill(
                    text = stringResource(labelRes),
                    isSelected = selectedMarketValueRange == range,
                    onClick = { onMarketValueRangeClicked(range) }
                )
            }
        }
        Spacer(Modifier.height(24.dp))
        // Position
        ContractFinisherFilterGroup(
            label = stringResource(R.string.contract_finisher_filter_label_position)
        ) {
            ContractFinisherPill(
                text = stringResource(R.string.releases_all_count, totalCount),
                isSelected = selectedPosition == null,
                onClick = onAllPositionsClicked
            )
            positionList.forEach { position ->
                val count = playersCount[position.name ?: ""] ?: 0
                val isDisabled = count == 0
                val positionName = position.name ?: ""
                ContractFinisherPill(
                    text = if (count > 0) "$positionName $count" else positionName,
                    isSelected = selectedPosition == position,
                    isDisabled = isDisabled,
                    onClick = { if (!isDisabled) onPositionClicked(position) }
                )
            }
        }
        Spacer(Modifier.height(24.dp))
        // Age
        ContractFinisherFilterGroup(
            label = stringResource(R.string.contract_finisher_filter_label_age)
        ) {
            ContractFinisherPill(
                text = stringResource(R.string.feed_filter_all),
                isSelected = selectedAgeRange == ContractFinisherAgeRange.ALL,
                onClick = { onAgeRangeClicked(ContractFinisherAgeRange.ALL) }
            )
            ContractFinisherPill(
                text = stringResource(R.string.contract_finisher_filter_age_18_21),
                isSelected = selectedAgeRange == ContractFinisherAgeRange.RANGE_18_21,
                onClick = { onAgeRangeClicked(ContractFinisherAgeRange.RANGE_18_21) }
            )
            ContractFinisherPill(
                text = stringResource(R.string.contract_finisher_filter_age_22_25),
                isSelected = selectedAgeRange == ContractFinisherAgeRange.RANGE_22_25,
                onClick = { onAgeRangeClicked(ContractFinisherAgeRange.RANGE_22_25) }
            )
            ContractFinisherPill(
                text = stringResource(R.string.contract_finisher_filter_age_26_29),
                isSelected = selectedAgeRange == ContractFinisherAgeRange.RANGE_26_29,
                onClick = { onAgeRangeClicked(ContractFinisherAgeRange.RANGE_26_29) }
            )
            ContractFinisherPill(
                text = stringResource(R.string.contract_finisher_filter_age_30_plus),
                isSelected = selectedAgeRange == ContractFinisherAgeRange.RANGE_30_PLUS,
                onClick = { onAgeRangeClicked(ContractFinisherAgeRange.RANGE_30_PLUS) }
            )
        }
        Spacer(Modifier.height(24.dp))
        // Region
        ContractFinisherFilterGroup(
            label = stringResource(R.string.contract_finisher_filter_label_region)
        ) {
            confederations.forEach { (conf, labelRes) ->
                ContractFinisherPill(
                    text = stringResource(labelRes),
                    isSelected = selectedConfederation == conf,
                    onClick = { onConfederationClicked(conf) }
                )
            }
        }
        Spacer(Modifier.height(24.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(HomeTealAccent)
                .clickWithNoRipple { onApplyClicked() }
                .padding(vertical = 14.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.contract_finisher_apply_filters),
                style = boldTextStyle(HomeDarkBackground, 15.sp)
            )
        }
    }
}

@Composable
private fun ContractFinisherFilterGroup(
    label: String,
    content: @Composable () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label.uppercase(),
            style = regularTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.padding(bottom = 10.dp)
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            content()
        }
    }
}

@Composable
private fun ContractFinisherPill(
    text: String,
    isSelected: Boolean,
    isDisabled: Boolean = false,
    onClick: () -> Unit
) {
    val bgColor by animateColorAsState(
        targetValue = when {
            isDisabled -> androidx.compose.ui.graphics.Color.Transparent
            isSelected -> HomeTealAccent
            else -> androidx.compose.ui.graphics.Color.Transparent
        },
        animationSpec = tween(280),
        label = "pillBg"
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

    Text(
        text = text,
        style = boldTextStyle(textColor, 13.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(20.dp))
            .then(
                if (isDisabled) Modifier
                else Modifier.clickWithNoRipple(onClick = onClick)
            )
            .padding(horizontal = 14.dp, vertical = 8.dp)
    )
}

