package com.liordahan.mgsrteam.features.releases

import android.app.Activity
import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.players.ui.FilterStripUi
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.theme.buttonLoadingBg
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

@Composable
fun ReleasesScreen(viewModel: IReleasesViewModel = koinViewModel()) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

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


    BackHandler {
        ActivityCompat.finishAffinity(context as Activity)
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

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            ReleasesTopBar()
        },
        snackbarHost = {
            SnackbarHost(
                hostState = snackBarHostState,
                snackbar = { Snackbar(it) }
            )
        }
    ) { paddingValues ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {

            if (showLoader) {
                Box(modifier = Modifier.fillMaxSize()) {
                    ProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                    return@Box
                }
            }

            if (showError) {
                EmptyState("Transfermarkt is down\nTry again later"){}
                return@Column
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

                    val positionCounts = remember(originalReleaseList) {
                        positionList.associateWith { position ->
                            originalReleaseList.count { player ->
                                player.playerPosition?.equals(position.name) == true
                            }
                        }
                    }

                    FilterStripUi(
                        positions = positionList,
                        selectedPosition = selectedPosition,
                        playerList = originalReleaseList,
                        onPositionClicked = {
                            selectedPosition = if (selectedPosition == it) {
                                null
                            } else {
                                it
                            }

                            viewModel.selectPosition(selectedPosition)
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

                items(releaseList) {
                    ReleaseListItem(context, it)
                }
            }

        }
    }
}


@Composable
fun ReleaseListItem(context: Context, release: LatestTransferModel, isFromReturnee: Boolean = false) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple {
                openPlayerProfile(context, release.playerUrl)
            },
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
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
                shape = CircleShape
            ) {

                AsyncImage(
                    model = release.playerImage,
                    contentDescription = null,
                    modifier = Modifier
                        .size(55.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    release.playerName ?: "Unknown",
                    style = boldTextStyle(contentDefault, 16.sp)
                )
                Text(
                    text = buildAnnotatedString {
                        append("Position: ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(release.playerPosition)
                        }
                    },
                    style = regularTextStyle(
                        contentDefault, 12.sp
                    )
                )
                Text(
                    text = buildAnnotatedString {
                        append("Age: ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(release.playerAge ?: "-")
                        }
                    },
                    style = regularTextStyle(
                        contentDefault, 12.sp
                    )
                )
                if (!isFromReturnee) {
                    Text(
                        text = buildAnnotatedString {
                            append("Market value: ")
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                                append(release.marketValue ?: "--")
                            }
                        },
                        style = regularTextStyle(
                            contentDefault, 12.sp
                        )
                    )
                }
            }

            if (!isFromReturnee) {
                Text(
                    text = buildAnnotatedString {
                        append("Release date:")
                        append("\n")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(release.transferDate ?: "-")
                        }
                    },
                    style = regularTextStyle(
                        contentDefault, 12.sp
                    ),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

private fun openPlayerProfile(context: Context, url: String?) {
    if (url?.isEmpty() == true) return
    val intent = Intent(Intent.ACTION_VIEW, url?.toUri())
    context.startActivity(intent)
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReleasesTopBar() {
    Surface(shadowElevation = 12.dp, color = Color.White) {
        TopAppBar(
            title = {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp)
                ) {

                    Text(
                        text = "Released players",
                        style = boldTextStyle(contentDefault, 21.sp),
                        modifier = Modifier.weight(1f)
                    )

                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
        )
    }
}