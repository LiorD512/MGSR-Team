package com.liordahan.mgsrteam.features.releases

import com.liordahan.mgsrteam.ui.components.ShortlistPillButton
import com.liordahan.mgsrteam.ui.components.shortlistPillState
import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Whatsapp
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.TeammatesFetcher
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.components.SkeletonPlayerCardList
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.utils.extractPlayerIdFromUrl
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

/** Roster player who played with the release/returnee player, with match count from Transfermarkt. */
data class RosterTeammateMatch(val player: Player, val matchesPlayedTogether: Int)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReleasesScreen(
    viewModel: IReleasesViewModel = koinViewModel(),
    addPlayerViewModel: IAddPlayerViewModel = koinViewModel(),
    shortlistRepository: ShortlistRepository = koinInject(),
    playersRepository: IPlayersRepository = koinInject(),
    teammatesFetcher: TeammatesFetcher = koinInject(),
    navController: NavController
) {

    val scope = rememberCoroutineScope()

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }

    // Roster teammates feature
    val rosterPlayers by playersRepository.playersFlow().collectAsStateWithLifecycle(initialValue = emptyList())
    var expandedPlayerUrl by remember { mutableStateOf<String?>(null) }
    var teammatesCache by remember { mutableStateOf<Map<String, List<RosterTeammateMatch>>>(emptyMap()) }
    var loadingPlayerUrl by remember { mutableStateOf<String?>(null) }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsStateWithLifecycle()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsStateWithLifecycle()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsStateWithLifecycle()

    var showLoader by remember {
        mutableStateOf(true)
    }

    var originalReleaseList by remember {
        mutableStateOf(listOf<LatestTransferModel>())
    }

    var releaseList by remember {
        mutableStateOf(listOf<LatestTransferModel>())
    }

    var positionList by remember {
        mutableStateOf(listOf<Position>())
    }

    var selectedPosition by rememberSaveable {
        mutableStateOf<Position?>(null)
    }

    var showError by remember {
        mutableStateOf(false)
    }

    var countMap by remember {
        mutableStateOf(mapOf<String, Int>())
    }

    val state = rememberLazyListState()
    val snackBarHostState = remember { SnackbarHostState() }

    // Track shortlist status
    val shortlistEntries by shortlistRepository.getShortlistFlow()
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val shortlistUrls = remember(shortlistEntries) {
        shortlistEntries.map { it.tmProfileUrl }.toSet()
    }
    var justAddedUrls by remember { mutableStateOf(setOf<String>()) }
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsStateWithLifecycle(initialValue = emptySet())

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

    LaunchedEffect(showAddPlayerBottomSheet) {
        if (showAddPlayerBottomSheet) {
            launch {
                addPlayerViewModel.errorMessageFlow.collectLatest { message ->
                    if (!message.isNullOrEmpty()) {
                        snackBarHostState.showSnackbar(
                            message = message,
                            duration = SnackbarDuration.Short
                        )
                        showAddPlayerBottomSheet = false
                        addPlayerTmUrl = null
                    }
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.releasesFlow.collect {
                    releaseList = it.visibleList
                    originalReleaseList = it.releasesList
                    showLoader = it.isLoading
                    showError = it.showError
                    countMap = it.playersCount
                    if (!it.failedFetchError.isNullOrBlank()) {
                        snackBarHostState.showSnackbar(
                            message = it.failedFetchError,
                            duration = SnackbarDuration.Short
                        )

                    }
                }
            }

            launch {
                viewModel.positionsFlow.collect {
                    positionList = it
                }
            }
        }
    }

    val shortlistedCount = remember(originalReleaseList, shortlistUrls, justAddedUrls) {
        originalReleaseList.count { it.playerUrl in shortlistUrls || it.playerUrl in justAddedUrls }
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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {

        Column(
            modifier = Modifier
                .fillMaxSize()

        ) {

            // Header
            ReleasesHeader(onBackClicked = { navController.popBackStack() })

            if (showLoader) {
                SkeletonPlayerCardList(
                    modifier = Modifier.fillMaxSize(),
                    itemCount = 6
                )
                return@Column
            }

            if (showError) {
                EmptyState(
                    text = stringResource(R.string.releases_tm_down),
                    showResetFiltersButton = false,
                    onResetFiltersClicked = {}
                )
                return@Column
            }

            // Stats Strip
            ReleasesStatsStrip(
                total = originalReleaseList.size,
                shortlisted = shortlistedCount,
                visible = releaseList.size
            )

            // Position Filter Chips (with animated accent line)
            ReleasesPositionChips(
                positionList = positionList,
                selectedPosition = selectedPosition,
                originalReleaseList = originalReleaseList,
                onPositionClicked = {
                    selectedPosition = if (selectedPosition == it) null else it
                    viewModel.selectPosition(selectedPosition)
                },
                onAllClicked = {
                    selectedPosition = null
                    viewModel.selectPosition(null)
                }
            )

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
                items(releaseList, key = { it.playerUrl ?: it.hashCode() }) { release ->
                    val playerUrl = release.playerUrl
                    val isExpanded = playerUrl != null && expandedPlayerUrl == playerUrl
                    val rosterTeammates = playerUrl?.let { teammatesCache[it] }
                    val isLoadingTeammates = playerUrl != null && loadingPlayerUrl == playerUrl
                    ReleaseListItem(
                        context = context,
                        release = release,
                        isFromReturnee = false,
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
                                            snackBarHostState.showSnackbar(
                                                context.getString(R.string.add_player_already_in_roster),
                                                duration = SnackbarDuration.Short
                                            )
                                        else -> {}
                                    }
                                }
                            }
                        },
                        isInShortlist = { url ->
                            url in shortlistUrls || url in justAddedUrls
                        },
                        isShortlistPending = (playerUrl != null && playerUrl in shortlistPendingUrls)
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
}


// ═════════════════════════════════════════════════════════════════════════════
//  HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReleasesHeader(onBackClicked: () -> Unit) {
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
        Column(
            modifier = Modifier
                .weight(1f)
        ) {
            Text(
                text = stringResource(R.string.releases_title),
                style = boldTextStyle(HomeTextPrimary, 26.sp)
            )
            Text(
                text = stringResource(R.string.releases_subtitle),
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS STRIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReleasesStatsStrip(total: Int, shortlisted: Int, visible: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        ReleasesStatItem(
            value = total.toString(),
            label = stringResource(R.string.players_stat_total),
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        ReleasesStatsStripDivider()
        ReleasesStatItem(
            value = shortlisted.toString(),
            label = stringResource(R.string.releases_stat_shortlisted),
            accentColor = HomeGreenAccent,
            modifier = Modifier.weight(1f)
        )
        ReleasesStatsStripDivider()
        ReleasesStatItem(
            value = visible.toString(),
            label = stringResource(R.string.releases_stat_visible),
            accentColor = HomeOrangeAccent,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ReleasesStatsStripDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .padding(vertical = 4.dp)
            .background(HomeDarkCardBorder)
    )
}

@Composable
private fun ReleasesStatItem(
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
//  POSITION FILTER CHIPS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReleasesPositionChips(
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
            // All chip with line
            ReleasesChipWithLine(
                text = stringResource(R.string.releases_all_count, totalCount),
                isSelected = isAllSelected,
                isDisabled = false,
                onClick = onAllClicked
            )

            positionList.forEach { position ->
                val count =
                    originalReleaseList.count { it.playerPosition?.equals(position.name) == true }
                val isSelected = selectedPosition == position
                val isDisabled = count == 0
                val positionName = position.name ?: ""

                ReleasesChipWithLine(
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
private fun ReleasesChipWithLine(
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

// ═════════════════════════════════════════════════════════════════════════════
//  RELEASE LIST ITEM
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun ReleaseListItem(
    context: Context,
    release: LatestTransferModel,
    isFromReturnee: Boolean = false,
    isContractFinisher: Boolean = false,
    rosterTeammates: List<RosterTeammateMatch>? = null,
    isLoadingTeammates: Boolean = false,
    isTeammatesExpanded: Boolean = false,
    onToggleTeammatesExpand: () -> Unit = {},
    onRosterTeammateClick: (Player) -> Unit = {},
    onAddToAgencyClicked: ((String) -> Unit)? = null,
    onAddToShortlistClicked: ((LatestTransferModel) -> Unit)? = null,
    isInShortlist: ((String) -> Boolean)? = null,
    isShortlistPending: Boolean = false
) {
    Box(modifier = Modifier.fillMaxWidth()) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple { openPlayerProfile(context, release.playerUrl) },
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
        ) {
        val accentColor = if (isFromReturnee) HomePurpleAccent else HomeTealAccent
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = accentColor,
                        topLeft = Offset.Zero,
                        size = androidx.compose.ui.geometry.Size(
                            width = 3.dp.toPx(),
                            height = size.height
                        )
                    )
                }
        ) {
            // Top row: Avatar + Name/Position + Value
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AsyncImage(
                    model = release.playerImage,
                    contentDescription = null,
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .border(2.dp, HomeDarkCardBorder, CircleShape),
                    contentScale = ContentScale.Crop
                )

                Spacer(Modifier.width(10.dp))

                // Name + market value on same line; position, age below
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .align(Alignment.CenterVertically)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = release.playerName ?: "Unknown",
                            style = boldTextStyle(HomeTextPrimary, 14.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        release.marketValue?.takeIf { it.isNotBlank() }?.let { value ->
                            Text(
                                text = value,
                                style = boldTextStyle(HomeTextPrimary, 14.sp),
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        release.playerPosition?.let { pos ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomeTealAccent.copy(alpha = 0.15f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = pos,
                                    style = boldTextStyle(HomeTealAccent, 10.sp)
                                )
                            }
                        }
                        release.playerAge?.let { age ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomeDarkCardBorder.copy(alpha = 0.5f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.players_age_format, age),
                                    style = regularTextStyle(HomeTextSecondary, 10.sp)
                                )
                            }
                        }
                        // Nationality flag + name (for returnees, or when available)
                        if (!release.playerNationalityFlag.isNullOrBlank() || !release.playerNationality.isNullOrBlank()) {
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomeDarkCardBorder.copy(alpha = 0.5f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (!release.playerNationalityFlag.isNullOrBlank()) {
                                    AsyncImage(
                                        model = release.playerNationalityFlag,
                                        contentDescription = release.playerNationality,
                                        modifier = Modifier
                                            .size(14.dp)
                                            .clip(CircleShape),
                                        contentScale = ContentScale.Crop
                                    )
                                }
                                release.playerNationality?.let { nat ->
                                    Text(
                                        text = nat,
                                        style = regularTextStyle(HomeTextSecondary, 10.sp),
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                        // Club returned to (returnees only)
                        if (isFromReturnee && (!release.clubJoinedName.isNullOrBlank() || !release.clubJoinedLogo.isNullOrBlank())) {
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomePurpleAccent.copy(alpha = 0.15f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (!release.clubJoinedLogo.isNullOrBlank()) {
                                    AsyncImage(
                                        model = release.clubJoinedLogo,
                                        contentDescription = release.clubJoinedName,
                                        modifier = Modifier
                                            .size(14.dp)
                                            .clip(RoundedCornerShape(4.dp)),
                                        contentScale = ContentScale.Crop
                                    )
                                }
                                release.clubJoinedName?.let { club ->
                                    Text(
                                        text = club,
                                        style = regularTextStyle(HomePurpleAccent, 10.sp),
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Bottom row: Released badge + Actions
            HorizontalDivider(
                color = HomeDarkCardBorder.copy(alpha = 0.5f),
                thickness = 1.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
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
                        .background(
                            if (isFromReturnee) HomePurpleAccent.copy(alpha = 0.15f)
                            else HomeOrangeAccent.copy(alpha = 0.15f)
                        )
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    val transferDate = release.transferDate
                    Text(
                        text = when {
                            isContractFinisher && !transferDate.isNullOrBlank() -> stringResource(R.string.contract_finisher_badge, transferDate)
                            isFromReturnee && !transferDate.isNullOrBlank() -> stringResource(R.string.releases_badge_returned_on, transferDate)
                            isFromReturnee -> stringResource(R.string.releases_badge_loan_return)
                            !transferDate.isNullOrBlank() -> stringResource(R.string.releases_badge_released_on, transferDate)
                            else -> stringResource(R.string.releases_badge_released)
                        },
                        style = boldTextStyle(
                            if (isFromReturnee) HomePurpleAccent else HomeOrangeAccent,
                            10.sp
                        )
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    onAddToShortlistClicked?.let { onAdd ->
                        val url = release.playerUrl
                        val isAdded = url != null && (isInShortlist?.invoke(url) == true)
                        ShortlistPillButton(
                            state = shortlistPillState(isAdded, isShortlistPending),
                            onClick = { onAdd(release) },
                        )
                    }
                    onAddToAgencyClicked?.let { onAdd ->
                        IconButton(
                            onClick = { release.playerUrl?.let { url -> onAdd(url) } },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.PersonAdd,
                                contentDescription = stringResource(R.string.releases_add_to_agency),
                                tint = HomeTealAccent
                            )
                        }
                    }
                }
            }

            // Roster teammates section (like matching players in Requests)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(HomeDarkBackground)
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                    .clickWithNoRipple { onToggleTeammatesExpand() }
                    .padding(8.dp, 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.People,
                    contentDescription = null,
                    tint = HomeTealAccent,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = when {
                        isTeammatesExpanded && isLoadingTeammates -> stringResource(R.string.releases_roster_teammates_loading)
                        isTeammatesExpanded && rosterTeammates != null -> if (rosterTeammates.size == 1) stringResource(R.string.releases_roster_teammates_one, rosterTeammates.size) else stringResource(R.string.releases_roster_teammates, rosterTeammates.size)
                        else -> stringResource(R.string.releases_roster_teammates_tap)
                    },
                    style = regularTextStyle(HomeTextPrimary, 13.sp)
                )
                Spacer(Modifier.weight(1f))
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = if (isTeammatesExpanded) "Collapse" else "Expand",
                    tint = HomeTextSecondary,
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
                            .background(HomeDarkBackground)
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = HomeTealAccent,
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    }
                } else if (rosterTeammates.isNullOrEmpty()) {
                    Text(
                        text = stringResource(R.string.releases_no_roster_teammates),
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = 8.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeDarkBackground)
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    )
                } else {
                    Column(modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 8.dp)) {
                    rosterTeammates.forEach { match ->
                        RosterTeammateRow(
                            player = match.player,
                            matchesPlayedTogether = match.matchesPlayedTogether,
                            targetPlayerName = release.playerName.orEmpty(),
                            onClick = { onRosterTeammateClick(match.player) }
                        )
                    }
                    }
                }
            }
        }
        }
        if (isShortlistPending) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = HomeTealAccent,
                    modifier = Modifier.size(32.dp),
                    strokeWidth = 2.dp
                )
            }
        }
    }
}

@Composable
private fun RosterTeammateRow(
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
            .background(HomeDarkBackground)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
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
                    .background(HomeDarkCardBorder),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    (player.fullName?.take(2) ?: "?").uppercase(),
                    style = boldTextStyle(HomeTextSecondary, 12.sp)
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                player.fullName ?: "Unknown",
                style = boldTextStyle(HomeTextPrimary, 14.sp)
            )
            Text(
                text = "${player.age ?: "-"} • ${player.positions?.firstOrNull()?.takeIf { it.isNotBlank() } ?: "-"} • ${player.marketValue ?: "-"} • ${stringResource(R.string.releases_games_together, matchesPlayedTogether)}",
                style = regularTextStyle(HomeTextSecondary, 11.sp, direction = TextDirection.Ltr),
                modifier = Modifier.padding(top = 2.dp)
            )
        }
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
            tint = HomeTextSecondary,
            modifier = Modifier.size(20.dp)
        )
    }
}

private fun openPlayerProfile(context: Context, url: String?) {
    if (url?.isEmpty() == true) return
    val intent = Intent(Intent.ACTION_VIEW, url?.toUri())
    context.startActivity(intent)
}