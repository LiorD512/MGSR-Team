package com.liordahan.mgsrteam.features.returnee

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.rememberNestedScrollInteropConnection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.players.ui.FilterStripUi
import com.liordahan.mgsrteam.features.releases.ReleaseListItem
import com.liordahan.mgsrteam.features.returnee.model.Leagues
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReturneePlayersBottomSheet(
    modifier: Modifier,
    viewModel: IReturneeViewModel,
    leagues: Leagues,
    onDismiss: () -> Unit
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density

    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true
    )

    var showLoader by remember {
        mutableStateOf(false)
    }

    var originalReturneeList by remember {
        mutableStateOf(listOf<LatestTransferModel>())
    }

    var visibleReturneeList by remember {
        mutableStateOf(listOf<LatestTransferModel>())
    }

    var positionList by remember {
        mutableStateOf(listOf<Position>())
    }

    var selectedPosition by rememberSaveable {
        mutableStateOf<Position?>(null)
    }

    LaunchedEffect(Unit) {

        viewModel.fetchAllReturnees(leagues.leagueUrl)

        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.returneeFlow.collect {
                    originalReturneeList = it.returneeList
                    visibleReturneeList = it.visibleList
                    positionList = it.positionList
                    showLoader = it.isLoading
                }
            }
        }
    }

    ModalBottomSheet(
        modifier = modifier
            .windowInsetsPadding(WindowInsets.statusBars)
            .height(screenHeight * 0.85f),
        sheetState = sheetState,
        onDismissRequest = {
            viewModel.updateSelectedPosition(null)
            onDismiss()
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        dragHandle = null
    ) {

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp)
                .padding(bottom = 24.dp)
        ) {

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {

                Surface(
                    shadowElevation = 6.dp,
                    tonalElevation = 12.dp,
                    shape = CircleShape,
                ) {
                    AsyncImage(
                        modifier = Modifier
                            .size(35.dp)
                            .clip(CircleShape),
                        model = leagues.flagUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop
                    )
                }

                Spacer(Modifier.width(8.dp))

                Text(
                    text = leagues.leagueName,
                    style = boldTextStyle(contentDefault, 16.sp)
                )
            }

            HorizontalDivider(
                thickness = 1.dp,
                color = dividerColor,
                modifier = Modifier.padding(top = 16.dp)
            )

            if (showLoader) {
                Box(
                    modifier = Modifier.fillMaxSize()
                ) {
                    ProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

                return@Column
            }

            if (visibleReturneeList.isEmpty()){
                Box(
                    modifier = Modifier.fillMaxSize()
                ) {
                    EmptyState(
                        text = "No players found in this league",
                        showResetFiltersButton = false,
                        onResetFiltersClicked = {}
                    )
                }

                return@Column
            }

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .nestedScroll(rememberNestedScrollInteropConnection()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 24.dp)
            ) {

                if (visibleReturneeList.isNotEmpty()) {

                    item {
                        FilterStripUi(
                            positions = positionList,
                            selectedPosition = selectedPosition,
                            getCountForPosition = {
                                originalReturneeList.count { player ->
                                    player.playerPosition?.equals(
                                        it.name
                                    ) == true
                                }
                            },
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
                }

                items(visibleReturneeList) {
                    ReleaseListItem(context, it, true)
                }
            }

        }
    }
}