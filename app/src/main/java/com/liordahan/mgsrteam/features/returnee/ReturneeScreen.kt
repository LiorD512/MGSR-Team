package com.liordahan.mgsrteam.features.returnee

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.players.ui.FilterStripUi
import com.liordahan.mgsrteam.features.releases.ReleaseListItem
import com.liordahan.mgsrteam.features.releases.ReleasesTopBar
import com.liordahan.mgsrteam.features.returnee.model.Leagues
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.theme.buttonLoadingBg
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.theme.searchHeaderButtonBackground
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

@Composable
fun ReturneeScreen(
    viewModel: IReturneeViewModel = koinViewModel()
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

    var showLoader by remember {
        mutableStateOf(false)
    }

    var originalReturneeList by remember {
        mutableStateOf(listOf<LatestTransferModel>())
    }

    var visibleReturneeList by remember {
        mutableStateOf(listOf<LatestTransferModel>())
    }

    var leagueList by remember {
        mutableStateOf(listOf<Leagues>())
    }

    var positionList by remember {
        mutableStateOf(listOf<Position>())
    }

    var selectedPosition by rememberSaveable {
        mutableStateOf<Position?>(null)
    }

    var selectedLeague by remember { mutableStateOf<Leagues?>(null) }

    var showPlayersBottomSheet by remember { mutableStateOf(false) }

    val state = rememberLazyListState()

    BackHandler {
        ActivityCompat.finishAffinity(context as Activity)
    }

    LaunchedEffect(Unit) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.returneeFlow.collect {
                    leagueList = it.leaguesList
                    originalReturneeList = it.returneeList
                    visibleReturneeList = it.visibleList
                    positionList = it.positionList
                    showLoader = it.isLoading
                }
            }
        }
    }


    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            ReturneeTopBar()
        },
    ) { paddingValues ->

        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = state,
                contentPadding = PaddingValues(
                    top = 24.dp,
                    bottom = 100.dp,
                    start = 12.dp,
                    end = 12.dp
                ),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {

                items(leagueList) { league ->
                    LeagueListItem(
                        leagues = league,
                        onItemClicked = {
                        selectedLeague = it
                        showPlayersBottomSheet = true
                    })
                }

            }

            if (showPlayersBottomSheet) {
                ReturneePlayersBottomSheet(
                    modifier = Modifier.align(Alignment.BottomCenter),
                    viewModel = viewModel,
                    leagues = selectedLeague ?: return@Scaffold
                ) {
                    showPlayersBottomSheet = false
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

@Composable
fun LeagueListItem(leagues: Leagues, onItemClicked: (Leagues) -> Unit) {

    Card(
        modifier = Modifier.clickWithNoRipple { onItemClicked(leagues) },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(6.dp)
    ) {

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
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
    }
}
