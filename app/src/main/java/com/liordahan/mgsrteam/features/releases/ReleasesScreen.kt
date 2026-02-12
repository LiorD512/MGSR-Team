package com.liordahan.mgsrteam.features.releases

import android.content.Context
import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.tween
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
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReleasesScreen(
    viewModel: IReleasesViewModel = koinViewModel(),
    addPlayerViewModel: IAddPlayerViewModel = koinViewModel(),
    shortlistRepository: ShortlistRepository = koinInject()
) {

    val scope = rememberCoroutineScope()

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsState()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsState()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsState()

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
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) {
        shortlistEntries.map { it.tmProfileUrl }.toSet()
    }
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
            ReleasesHeader()

            if (showLoader) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = HomeTealAccent,
                        strokeWidth = 3.dp,
                        modifier = Modifier.size(44.dp)
                    )
                    return@Column
                }
            }

            if (showError) {
                EmptyState(
                    text = "Transfermarkt is down\nTry again later",
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
                items(releaseList) {
                    ReleaseListItem(
                        context = context,
                        release = it,
                        isFromReturnee = false,
                        onAddToAgencyClicked = { url ->
                            addPlayerTmUrl = url
                            showAddPlayerBottomSheet = true
                        },
                        onAddToShortlistClicked = { url ->
                            scope.launch {
                                val isInShortlist = url in shortlistUrls || url in justAddedUrls
                                if (isInShortlist) {
                                    shortlistRepository.removeFromShortlist(url)
                                    justAddedUrls = justAddedUrls - url
                                } else {
                                    shortlistRepository.addToShortlist(url)
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
//  HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReleasesHeader() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 4.dp)
    ) {
        Text(
            text = "Releases",
            style = boldTextStyle(HomeTextPrimary, 26.sp)
        )
        Text(
            text = "Latest free agents from Transfermarkt",
            style = regularTextStyle(HomeTextSecondary, 13.sp),
            modifier = Modifier.padding(top = 4.dp)
        )
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
            label = "Total",
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        ReleasesStatsStripDivider()
        ReleasesStatItem(
            value = shortlisted.toString(),
            label = "Shortlisted",
            accentColor = HomeGreenAccent,
            modifier = Modifier.weight(1f)
        )
        ReleasesStatsStripDivider()
        ReleasesStatItem(
            value = visible.toString(),
            label = "Visible",
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
                text = "All $totalCount",
                isSelected = isAllSelected,
                isDisabled = false,
                onClick = onAllClicked
            )

            positionList.forEach { position ->
                val count = originalReleaseList.count { it.playerPosition?.equals(position.name) == true }
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
    onAddToAgencyClicked: ((String) -> Unit)? = null,
    onAddToShortlistClicked: ((String) -> Unit)? = null,
    isInShortlist: ((String) -> Boolean)? = null
) {
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

                // Name, position, age in column layout
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .align(Alignment.CenterVertically)
                ) {
                    Text(
                        text = release.playerName ?: "Unknown",
                        style = boldTextStyle(HomeTextPrimary, 14.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
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
                                    text = "$age yrs",
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
                                        modifier = Modifier.size(14.dp).clip(CircleShape),
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
                    }
                }

                // Value and date (show market value for both releases and returnees when available)
                Column(
                    modifier = Modifier.align(Alignment.Top),
                    horizontalAlignment = Alignment.End
                ) {
                    val valueToShow = release.marketValue?.takeIf { it.isNotBlank() }
                    if (valueToShow != null) {
                        Text(
                            text = valueToShow,
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                    }
                    release.transferDate?.let { date ->
                        Text(
                            text = date,
                            style = regularTextStyle(HomeTextSecondary, 10.sp),
                            modifier = Modifier.padding(top = 2.dp)
                        )
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
                    Text(
                        text = if (isFromReturnee) "Loan Return" else "Released",
                        style = boldTextStyle(
                            if (isFromReturnee) HomePurpleAccent else HomeOrangeAccent,
                            10.sp
                        )
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    onAddToShortlistClicked?.let { onAdd ->
                        val url = release.playerUrl
                        val isAdded = url != null && (isInShortlist?.invoke(url) == true)
                        IconButton(
                            onClick = { url?.let { onAdd(it) } },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = if (isAdded) Icons.Default.Bookmark else Icons.Default.BookmarkAdd,
                                contentDescription = if (isAdded) "In shortlist" else "Add to shortlist",
                                tint = if (isAdded) HomeGreenAccent else HomeTextSecondary
                            )
                        }
                    }
                    onAddToAgencyClicked?.let { onAdd ->
                        IconButton(
                            onClick = { release.playerUrl?.let { url -> onAdd(url) } },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.PersonAdd,
                                contentDescription = "Add to agency",
                                tint = HomeTealAccent
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun openPlayerProfile(context: Context, url: String?) {
    if (url?.isEmpty() == true) return
    val intent = Intent(Intent.ACTION_VIEW, url?.toUri())
    context.startActivity(intent)
}