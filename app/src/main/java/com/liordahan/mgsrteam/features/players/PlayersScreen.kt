package com.liordahan.mgsrteam.features.players

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.rounded.Add
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.vectorResource
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
import androidx.constraintlayout.compose.ConstraintLayout
import androidx.core.app.ActivityCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.PlayerListFilterBottomSheet
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.theme.redErrorColor
import com.liordahan.mgsrteam.ui.theme.searchHeaderButtonBackground
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayersScreen(viewModel: IPlayersViewModel = koinViewModel(), navController: NavController) {

    val context = LocalContext.current
    val playersState by viewModel.playersFlow.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()

    var userName by remember {
        mutableStateOf("")
    }

    var searchPlayerInput by remember {
        mutableStateOf(TextFieldValue(text = viewModel.playersFlow.value.searchQuery))
    }

    var showFilterBottomSheet by remember { mutableStateOf(false) }

    var showEmptyState by remember(playersState) { mutableStateOf(playersState.visibleList.isEmpty()) }

    val state = rememberLazyListState()

    BackHandler {
        ActivityCompat.finishAffinity(context as Activity)
    }

    LaunchedEffect(Unit) {
        userName = viewModel.getCurrentUserName() ?: ""
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            PlayersScreenAppBar(
                title = "Welcome\n$userName",
                searchPlayerInput = searchPlayerInput,
                showSearchBar = true,
                numberOfFilters = playersState.selectedPositions.size + playersState.selectedAccounts.size + if (playersState.contractFilterOption != ContractFilterOption.NONE) 1 else 0,
                onValueChange = {
                    searchPlayerInput = it
                    viewModel.updateSearchQuery(searchPlayerInput.text)
                },
                onAddClicked = { navController.navigate(Screens.AddPlayerScreen.route) },
                onFiltersButtonClicked = {
                    showFilterBottomSheet = true
                },
                onTrailingIconClicked = {
                    searchPlayerInput = TextFieldValue("")
                    viewModel.updateSearchQuery("")
                }
            )
        }
    ) { paddingValues ->

        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            Column {

                if (playersState.showPageLoader) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        ProgressIndicator(
                            modifier = Modifier.align(Alignment.Center)
                        )
                        return@Box
                    }
                }

                if (showEmptyState) {
                    EmptyState(text = "No players found", onResetFiltersClicked = {
                        viewModel.removeAllFilters()
                    })
                    return@Column
                }

                LazyColumn(
                    state = state,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(
                        top = 24.dp,
                        bottom = 100.dp,
                        start = 12.dp,
                        end = 12.dp
                    )

                ) {

                    items(playersState.visibleList) { player ->
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

            if (showFilterBottomSheet) {
                PlayerListFilterBottomSheet(
                    modifier = Modifier.align(Alignment.BottomCenter),
                    selectedPositionList = playersState.selectedPositions,
                    selectedAgentList = playersState.selectedAccounts,
                    selectedContractFilterOption = playersState.contractFilterOption,
                    onDismiss = { showFilterBottomSheet = false })
            }
        }
    }
}


@Composable
fun PlayerCard(player: Player, modifier: Modifier = Modifier, onPlayerClicked: (Player) -> Unit) {

    val clubTextColor = if (player.currentClub?.clubName.equals("Without Club", true)) {
        redErrorColor
    } else {
        contentDefault
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickWithNoRipple { onPlayerClicked(player) },
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {


        ConstraintLayout(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp)
        ) {

            val (image, name, currentClub, playerInfo, marketValue) = createRefs()

            Surface(
                shadowElevation = 6.dp,
                tonalElevation = 12.dp,
                shape = CircleShape,
                modifier = Modifier.constrainAs(image) {
                    start.linkTo(parent.start, margin = 8.dp)
                    top.linkTo(parent.top)
                    bottom.linkTo(parent.bottom)
                }
            ) {
                AsyncImage(
                    modifier = Modifier
                        .size(55.dp)
                        .clip(CircleShape),
                    model = player.profileImage,
                    contentDescription = null,
                    contentScale = ContentScale.Crop
                )
            }

            Text(
                modifier = Modifier.constrainAs(name) {
                    start.linkTo(image.end, 8.dp)
                    top.linkTo(parent.top)
                },
                text = player.fullName ?: "",
                style = boldTextStyle(contentDefault, 14.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Text(
                modifier = Modifier.constrainAs(currentClub) {
                    start.linkTo(name.start)
                    top.linkTo(name.bottom, 4.dp)
                },
                text = buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = clubTextColor)) {
                        append(player.currentClub?.clubName ?: "")
                    }
                },
                style = regularTextStyle(contentDefault, 12.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Text(
                modifier = Modifier
                    .constrainAs(playerInfo) {
                        start.linkTo(name.start)
                        top.linkTo(currentClub.bottom, 4.dp)
                    },
                text = buildAnnotatedString {
                    append("Age: ")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(player.age ?: "")
                    }
                    append(" | ")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(player.positions?.joinToString(separator = ", ") ?: "")
                    }
                },
                style = regularTextStyle(contentDefault, 12.sp),
                textAlign = TextAlign.Center
            )

            Text(
                modifier = Modifier.constrainAs(marketValue) {
                    end.linkTo(parent.end, 8.dp)
                    top.linkTo(image.top)
                    bottom.linkTo(image.bottom)
                },
                text = player.marketValue.takeIf { !it.isNullOrEmpty() } ?: "--",
                style = boldTextStyle(contentDefault, 12.sp),
                textAlign = TextAlign.Center
            )
        }

    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayersScreenAppBar(
    title: String,
    searchPlayerInput: TextFieldValue,
    showSearchBar: Boolean,
    numberOfFilters: Int = 0,
    onValueChange: (TextFieldValue) -> Unit,
    onAddClicked: () -> Unit,
    onTrailingIconClicked: () -> Unit,
    onFiltersButtonClicked: () -> Unit
) {

    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

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

                            Box(
                                modifier = Modifier
                                    .background(
                                        if (numberOfFilters > 0) contentDefault else searchHeaderButtonBackground,
                                        RoundedCornerShape(800.dp)
                                    )
                                    .padding(horizontal = 16.dp, vertical = 6.dp)
                            ) {

                                Text(
                                    text = buildAnnotatedString {
                                        append("Filters ")
                                        if (numberOfFilters > 0) {
                                            append(numberOfFilters.toString())
                                        }
                                    },
                                    style = boldTextStyle(
                                        if (numberOfFilters > 0) Color.White else contentDefault,
                                        12.sp
                                    ),
                                    modifier = Modifier.clickWithNoRipple { onFiltersButtonClicked() }
                                )
                            }

                            Spacer(Modifier.width(16.dp))

                            Icon(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clickWithNoRipple { onAddClicked() },
                                imageVector = Icons.Rounded.Add,
                                contentDescription = null
                            )

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
                        trailingIcon = ImageVector.vectorResource(R.drawable.ic_clear_search_button),
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Done,
                            keyboardType = KeyboardType.Text
                        ),
                        onTrailingIconClicked = {
                            onTrailingIconClicked()
                            keyboardController?.hide()
                            focusManager.clearFocus()
                        },
                        onValueChange = { onValueChange(it) }
                    )
                }

            }
        }
    }
}