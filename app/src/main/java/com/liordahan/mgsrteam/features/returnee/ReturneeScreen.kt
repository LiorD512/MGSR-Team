package com.liordahan.mgsrteam.features.returnee

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.navigation.NavController
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.players.ui.FilterStripUi
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.releases.ReleaseListItem
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
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


    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            ReturneeTopBar()
        },
    ) { paddingValues ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Show progress bar while still loading, even when results are already showing
            if (isLoading && visibleReturneeList.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize()) {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        ProgressIndicator(modifier = Modifier)
                        if (totalCount > 0) {
                            Text(
                                text = "Loading leagues ($loadedCount/$totalCount)...",
                                style = regularTextStyle(contentDefault, 12.sp),
                                modifier = Modifier.padding(top = 12.dp)
                            )
                        }
                    }
                    return@Column
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = state,
                contentPadding = PaddingValues(
                    top = 24.dp,
                    bottom = 100.dp,
                    start = 12.dp,
                    end = 12.dp
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    val positionCounts = remember(originalReturneeList) {
                        positionList.associateWith { position ->
                            originalReturneeList.count { player ->
                                player.playerPosition?.equals(position.name) == true
                            }
                        }
                    }

                    FilterStripUi(
                        positions = positionList,
                        selectedPosition = selectedPosition,
                        playerList = originalReturneeList,
                        onPositionClicked = {
                            selectedPosition = if (selectedPosition == it) {
                                null
                            } else {
                                it
                            }
                            viewModel.updateSelectedPosition(selectedPosition)
                        }
                    )
                }

                item {
                    HorizontalDivider(
                        thickness = 1.dp,
                        color = dividerColor,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }

                // Show inline loading indicator when results are showing but still loading more leagues
                if (isLoading && visibleReturneeList.isNotEmpty()) {
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = contentDefault
                            )
                            Text(
                                text = "Loading ($loadedCount/$totalCount leagues)... ${visibleReturneeList.size} players found",
                                style = regularTextStyle(contentDefault, 12.sp),
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
                        onAddToShortlistClicked = { url ->
                            scope.launch {
                                shortlistRepository.addToShortlist(url)
                                justAddedUrls = justAddedUrls + url
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
                    containerColor = Color.White,
                    shape = RoundedCornerShape(16.dp),
                    tonalElevation = 8.dp
                ) {
                    when {
                        addPlayerState.value.showPlayerSelectedSearchProgress && selectedPlayer == null -> {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(color = contentDefault)
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
                                style = regularTextStyle(contentDefault, 14.sp),
                                modifier = Modifier.padding(24.dp)
                            )
                        }
                    }
                }
            }
        }
    }

}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReturneeTopBar() {
    Surface(shadowElevation = 12.dp, color = Color.White) {
        TopAppBar(
            title = {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp)
                ) {

                    Text(
                        text = "Returnees",
                        style = boldTextStyle(contentDefault, 21.sp),
                        modifier = Modifier.weight(1f)
                    )

                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
        )
    }
}

