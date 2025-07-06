package com.liordahan.mgsrteam.features.players

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.features.players.ui.FilterByAgentStripUi
import com.liordahan.mgsrteam.features.players.ui.FilterStripUi
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

@Composable
fun PlayersScreen(viewModel: IPlayersViewModel = koinViewModel(), navController: NavController) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

    var showPageProgress by remember {
        mutableStateOf(false)
    }

    var originalPlayersList by remember {
        mutableStateOf(listOf<Player>())
    }

    var playersList by remember {
        mutableStateOf(listOf<Player>())
    }

    var userName by remember {
        mutableStateOf("")
    }

    var positionList by remember {
        mutableStateOf(listOf<Position>())
    }

    var accountList by remember {
        mutableStateOf(listOf<Account>())
    }

    var selectedPosition by rememberSaveable {
        mutableStateOf<Position?>(null)
    }

    var selectedAccount by rememberSaveable {
        mutableStateOf<Account?>(null)
    }

    var searchPlayerInput by remember {
        mutableStateOf(TextFieldValue(text = viewModel.playersFlow.value.searchQuery))
    }

    val state = rememberLazyGridState()


    var showRefreshPlayersButton by remember {
        mutableStateOf(false)
    }

    var showEmptyState by remember {
        mutableStateOf(false)
    }

    BackHandler {
        ActivityCompat.finishAffinity(context as Activity)
    }

    LaunchedEffect(Unit) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {

            launch {
                userName = viewModel.getCurrentUserName() ?: ""
            }
            launch {
                viewModel.playersFlow.collect {
                    showPageProgress = it.showPageLoader
                    if (playersList != it.visibleList) {
                        playersList = it.visibleList
                    }
                    positionList = it.positionList
                    accountList = it.accountList
                    originalPlayersList = it.playersList
                    showEmptyState = it.showEmptyState
                }
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            PlayersScreenAppBar(
                title = "Welcome\n$userName",
                searchPlayerInput = searchPlayerInput,
                showSearchBar = selectedPosition == null && selectedAccount == null,
                showRefreshButton = showRefreshPlayersButton,
                onValueChange = {
                    searchPlayerInput = it
                    viewModel.updateSearchQuery(searchPlayerInput.text)
                },
                onAddClicked = { navController.navigate(Screens.AddPlayerScreen.route) },
                onRefreshClicked = {
                    viewModel.updateAllPlayers()
                }
            )
        }
    ) { paddingValues ->

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {

            if (showPageProgress) {
                Box(modifier = Modifier.fillMaxSize()) {
                    ProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                    return@Box
                }
            }

            if (showEmptyState) {
                EmptyState("No players found\nTry to change your search")
                return@Column
            }

            LazyVerticalGrid(
                state = state,
                columns = GridCells.Fixed(3),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(
                    top = 24.dp,
                    bottom = 100.dp,
                    start = 12.dp,
                    end = 12.dp
                )

            ) {

                item(span = { GridItemSpan(maxLineSpan) }) {
                    FilterStripUi(
                        positions = positionList,
                        selectedPosition = selectedPosition,
                        getCountForPosition = {
                            originalPlayersList.count { player -> player.positions?.contains(it.name) == true }
                        },
                        onPositionClicked = {
                            selectedPosition = if (selectedPosition == it) null else it
                            viewModel.updateSelectedPosition(selectedPosition)
                        }
                    )
                }

                item(span = { GridItemSpan(maxLineSpan) }) {
                    FilterByAgentStripUi(
                        accounts = accountList,
                        selectedAccount = selectedAccount,
                        getCountForAccount = {
                            originalPlayersList.count { player -> player.agentInChargeName?.equals(it.name, ignoreCase = true) == true }
                        },
                        onAccountClicked = {
                            selectedAccount = if (selectedAccount == it) null else it
                            viewModel.updateSelectedAccount(selectedAccount)
                        }
                    )
                }

                item(span = { GridItemSpan(maxLineSpan) }) {
                    HorizontalDivider(
                        thickness = 1.dp,
                        color = dividerColor
                    )
                }

                items(playersList) { player ->
                    PlayerCard(
                        player,
                        onPlayerClicked = {
                            val encodedId = Uri.encode(player.tmProfile)
                            navController.navigate("${Screens.PlayerInfoScreen.route}/$encodedId")
                        }
                    )
                }

            }
        }

    }
}


@Composable
fun PlayerCard(player: Player, modifier: Modifier = Modifier, onPlayerClicked: (Player) -> Unit) {

    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(360.dp)
            .padding(4.dp)
            .clickWithNoRipple { onPlayerClicked(player) },
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            AsyncImage(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(8.dp)),
                model = player.profileImage,
                contentDescription = null,
                contentScale = ContentScale.FillBounds,
            )


            Spacer(modifier = Modifier.height(8.dp))

            Text(
                modifier = Modifier
                    .padding(horizontal = 4.dp),
                text = player.fullName ?: "",
                style = boldTextStyle(contentDefault, 14.sp).copy(textAlign = TextAlign.Center),
                maxLines = 2,
                minLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {

                Text(
                    modifier = Modifier
                        .padding(horizontal = 4.dp),
                    text = buildAnnotatedString {
                        append("Positions:")
                        append("\n")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(player.positions?.joinToString(separator = ", ") ?: "")
                        }
                    },
                    style = regularTextStyle(contentDefault, 12.sp),
                    textAlign = TextAlign.Center
                )

                Text(
                    modifier = Modifier
                        .padding(horizontal = 4.dp),
                    text = buildAnnotatedString {
                        append("Age:")
                        append("\n")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(
                                player.age ?: ""
                            )
                        }
                    },
                    style = regularTextStyle(contentDefault, 12.sp),
                    textAlign = TextAlign.Center
                )

                Text(
                    modifier = Modifier
                        .padding(horizontal = 4.dp),
                    text = buildAnnotatedString {
                        append("Market value:")
                        append("\n")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(player.marketValue.takeIf { !it.isNullOrEmpty() } ?: "--")
                        }
                    },
                    style = regularTextStyle(contentDefault, 12.sp),
                    textAlign = TextAlign.Center
                )

            }


            Text(
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .padding(top = 8.dp, bottom = 12.dp),
                text = buildAnnotatedString {
                    append("Current club:")
                    append("\n")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(player.currentClub?.clubName ?: "")
                    }
                },
                style = regularTextStyle(contentDefault, 12.sp),
                textAlign = TextAlign.Center,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayersScreenAppBar(
    title: String,
    searchPlayerInput: TextFieldValue,
    showSearchBar:Boolean,
    showRefreshButton: Boolean = false,
    onValueChange: (TextFieldValue) -> Unit,
    onAddClicked: () -> Unit,
    onRefreshClicked: () -> Unit
) {
    Surface(shadowElevation = 12.dp, color = Color.White) {

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 24.dp)
        ) {

            TopAppBar(
                title = {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(end = 12.dp),
                        verticalArrangement = Arrangement.Center
                    ) {

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = title,
                                style = boldTextStyle(contentDefault, 21.sp),
                                modifier = Modifier.weight(1f)
                            )

                            Icon(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clickWithNoRipple { onAddClicked() },
                                imageVector = Icons.Rounded.Add,
                                contentDescription = null
                            )

                            if (showRefreshButton) {

                                Spacer(Modifier.width(16.dp))

                                Icon(
                                    modifier = Modifier
                                        .size(30.dp)
                                        .clickWithNoRipple {
                                            onRefreshClicked()
                                        },
                                    imageVector = Icons.Rounded.Refresh,
                                    contentDescription = null
                                )
                            }
                        }

                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            )

            AnimatedVisibility(visible = showSearchBar) {

                Column {

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 1.dp,
                        modifier = Modifier.padding(vertical = 16.dp)
                    )

                    AppTextField(
                        modifier = Modifier.padding(horizontal = 16.dp),
                        textInput = searchPlayerInput,
                        hint = stringResource(R.string.players_screen_hint),
                        leadingIcon = Icons.Default.Search,
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Done,
                            keyboardType = KeyboardType.Text
                        ),
                        onValueChange = { onValueChange(it) }
                    )
                }

            }
        }
    }
}