package com.liordahan.mgsrteam.features.requests

import android.Manifest
import android.content.Context
import android.content.Intent
import android.media.MediaRecorder
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.rememberNestedScrollInteropConnection
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.repository.IContactsRepository
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import com.liordahan.mgsrteam.features.players.playerinfo.WhatsAppIcon
import com.liordahan.mgsrteam.features.requests.models.DominateFootOptions
import com.liordahan.mgsrteam.features.requests.voice.RequestVoiceAnalyzer
import com.liordahan.mgsrteam.features.requests.voice.RequestVoiceRecorder
import com.liordahan.mgsrteam.features.requests.models.PositionDisplayNames
import com.liordahan.mgsrteam.localization.CountryNameTranslator
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions
import com.liordahan.mgsrteam.features.requests.models.TransferFeeOptions
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.RecordingWaveform
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.ui.components.SkeletonRequestList
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import android.view.HapticFeedbackConstants
import androidx.compose.foundation.layout.offset
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestsScreen(
    viewModel: IRequestsViewModel = koinViewModel(),
    navController: NavController
) {
    val state by viewModel.requestsState.collectAsStateWithLifecycle()
    val positions by viewModel.positions.collectAsStateWithLifecycle()
    var showAddSheet by remember { mutableStateOf(false) }
    var requestToDelete by remember { mutableStateOf<Request?>(null) }
    var onlineExpandedRequestId by remember { mutableStateOf<String?>(null) }
    var expandedRequestIds by remember { mutableStateOf(setOf<String>()) }
    var expandedPositions by remember { mutableStateOf(setOf<String>()) }
    var expandedCountryKeys by remember { mutableStateOf(setOf<String>()) }

    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(state.addRequestMessage) {
        state.addRequestMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearAddRequestMessage()
        }
    }
    LaunchedEffect(state.addRequestError) {
        state.addRequestError?.let { err ->
            snackbarHostState.showSnackbar(err)
            viewModel.clearAddRequestMessage()
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddSheet = true },
                shape = RoundedCornerShape(18.dp),
                containerColor = HomeTealAccent,
                contentColor = HomeDarkBackground
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.requests_add), modifier = Modifier.size(24.dp), tint = Color.White)
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(HomeDarkBackground)
            ) {
                RequestsHeader(
                    onAddClick = { showAddSheet = true },
                    onBackClick = { navController.popBackStack() },
                    onShareClick = {
                        val text = formatRequestsForShare(context, state.requestsByPositionCountry)
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, text)
                            putExtra(Intent.EXTRA_SUBJECT, "MGSR Team - Player Requests")
                        }
                        context.startActivity(Intent.createChooser(intent, "Share requests"))
                    },
                    canShare = state.requestsByPositionCountry.isNotEmpty()
                )

                when {
                    state.isLoading -> {
                        SkeletonRequestList(modifier = Modifier.fillMaxSize())
                    }
                    state.requestsByPositionCountry.isEmpty() -> {
                        RequestsStatsStrip(
                            total = 0,
                            positions = 0,
                            pending = 0
                        )
                        RequestsEmptyState(onAddClick = { showAddSheet = true })
                    }
                    else -> {
                        val scope = rememberCoroutineScope()
                        val shortlistRepository: ShortlistRepository = koinInject()
                        val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsStateWithLifecycle(initialValue = emptyList())
                        val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
                        var justAddedUrls by remember { mutableStateOf(setOf<String>()) }
                        val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
                            .collectAsStateWithLifecycle(initialValue = emptySet())
                        val onlineLoading by viewModel.onlinePlayersLoading.collectAsStateWithLifecycle()
                        val onlinePlayers by viewModel.onlinePlayersResult.collectAsStateWithLifecycle()
                        RequestsStatsStrip(
                            total = state.totalCount,
                            positions = state.positionsCount,
                            pending = state.pendingCount
                        )
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 100.dp),
                            verticalArrangement = Arrangement.spacedBy(0.dp)
                        ) {
                            state.requestsByPositionCountry.forEach { (position, countries) ->
                                val isPositionExpanded = position in expandedPositions
                                val positionCount = countries.values.sumOf { it.size }
                                item(key = "pos_$position") {
                                    PositionExpandableCard(
                                        position = position,
                                        count = positionCount,
                                        isExpanded = isPositionExpanded,
                                        onToggleExpand = {
                                            expandedPositions = if (isPositionExpanded) {
                                                expandedPositions - position
                                            } else {
                                                expandedPositions + position
                                            }
                                        },
                                        context = context
                                    )
                                }
                                if (isPositionExpanded) {
                                    countries.forEach { (country, requests) ->
                                        val countryKey = "${position}_$country"
                                        val isCountryExpanded = countryKey in expandedCountryKeys
                                        item(key = "country_$countryKey") {
                                            CountryExpandableRow(
                                                country = country,
                                                countryFlag = requests.firstOrNull()?.clubCountryFlag,
                                                count = requests.size,
                                                isExpanded = isCountryExpanded,
                                                onToggleExpand = {
                                                    expandedCountryKeys = if (isCountryExpanded) {
                                                        expandedCountryKeys - countryKey
                                                    } else {
                                                        expandedCountryKeys + countryKey
                                                    }
                                                },
                                                context = context
                                            )
                                        }
                                        if (isCountryExpanded) {
                                            items(
                                                requests,
                                                key = { it.id ?: it.hashCode().toString() }
                                            ) { request ->
                                                val matchingPlayers = state.matchingPlayersByRequestId[request.id ?: ""] ?: emptyList()
                                                val isRequestExpanded = (request.id ?: "") in expandedRequestIds
                                                val requestId = request.id ?: ""
                                                val isOnlineExpanded = onlineExpandedRequestId == requestId
                                                val onlinePlayersForThis = if (isOnlineExpanded) onlinePlayers else emptyList()
                                                RequestCard(
                                                    request = request,
                                                    matchingPlayers = matchingPlayers,
                                                    isExpanded = isRequestExpanded,
                                                    isOnlineExpanded = isOnlineExpanded,
                                                    onlineLoading = isOnlineExpanded && onlineLoading,
                                                    onlinePlayers = onlinePlayersForThis,
                                                    shortlistUrls = shortlistUrls,
                                                    justAddedUrls = justAddedUrls,
                                                    shortlistPendingUrls = shortlistPendingUrls,
                                                    modifier = Modifier.padding(start = 12.dp, top = 6.dp),
                                                    onToggleExpand = {
                                                        val id = request.id ?: return@RequestCard
                                                        expandedRequestIds = if (isRequestExpanded) expandedRequestIds - id else expandedRequestIds + id
                                                    },
                                                    onToggleOnlineExpand = {
                                                        if (onlineExpandedRequestId == requestId) {
                                                            onlineExpandedRequestId = null
                                                            viewModel.clearOnlinePlayersResult()
                                                        } else {
                                                            onlineExpandedRequestId = requestId
                                                            viewModel.findPlayersOnlineForRequest(request, LocaleManager.getSavedLanguage(context))
                                                        }
                                                    },
                                                    onPlayerClick = { player ->
                                                        player.tmProfile?.let { profile ->
                                                            navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(profile)}")
                                                        }
                                                    },
                                                    onOnlinePlayerClick = { suggestion ->
                                                        suggestion.transfermarktUrl?.let { url ->
                                                            navController.navigate(Screens.addPlayerWithTmProfileRoute(Uri.encode(url)))
                                                        }
                                                    },
                                                    onOpenTransfermarkt = { url ->
                                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                                    },
                                                    onToggleShortlist = { suggestion ->
                                                        suggestion.transfermarktUrl?.let { url ->
                                                            scope.launch {
                                                                val isInShortlist = url in shortlistUrls || url in justAddedUrls
                                                                if (isInShortlist) {
                                                                    shortlistRepository.removeFromShortlist(url)
                                                                    justAddedUrls = justAddedUrls - url
                                                                    ToastManager.showInfo(context.getString(R.string.shortlist_remove))
                                                                } else {
                                                                    val added = shortlistRepository.addToShortlist(
                                                                        LatestTransferModel(
                                                                            playerName = suggestion.name,
                                                                            playerUrl = url,
                                                                            playerPosition = suggestion.position,
                                                                            playerAge = suggestion.age,
                                                                            marketValue = suggestion.marketValue
                                                                        )
                                                                    )
                                                                    if (added) {
                                                                        justAddedUrls = justAddedUrls + url
                                                                        ToastManager.showSuccess(context.getString(R.string.shortlist_added))
                                                                    } else {
                                                                        ToastManager.showInfo(context.getString(R.string.add_player_already_in_shortlist))
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    },
                                                    onTryAgainSearch = {
                                                        viewModel.findPlayersOnlineForRequest(request, LocaleManager.getSavedLanguage(context))
                                                    },
                                                    onRefreshSearch = {
                                                        viewModel.refreshPlayersOnlineForRequest(request, LocaleManager.getSavedLanguage(context))
                                                    },
                                                    onEdit = { /* Edit flow - can be implemented later */ },
                                                    onDelete = { requestToDelete = request }
                                                )
                                            }
                                        }
                                    }
                                    item(key = "spacer_$position") {
                                        Spacer(Modifier.height(20.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (showAddSheet) {
                AddRequestBottomSheet(
                    modifier = Modifier.align(Alignment.BottomCenter),
                    positions = positions,
                    onDismiss = { showAddSheet = false },
                    onSave = { club, position, contactId, contactName, contactPhone, minAge, maxAge, ageDoesntMatter, dominateFoot, salaryRange, transferFee, notes ->
                        viewModel.addRequest(
                            club = club,
                            position = position,
                            contactId = contactId,
                            contactName = contactName,
                            contactPhoneNumber = contactPhone,
                            minAge = minAge,
                            maxAge = maxAge,
                            ageDoesntMatter = ageDoesntMatter,
                            dominateFoot = dominateFoot,
                            salaryRange = salaryRange,
                            transferFee = transferFee,
                            notes = notes
                        )
                        showAddSheet = false
                    }
                )
            }

            requestToDelete?.let { req ->
                AlertDialog(
                    onDismissRequest = { requestToDelete = null },
                    title = { Text(stringResource(R.string.requests_delete_title), style = boldTextStyle(HomeTextPrimary, 18.sp)) },
                    text = {
                        Text(
                            stringResource(R.string.requests_delete_confirm, req.clubName ?: "", req.position ?: ""),
                            style = regularTextStyle(HomeTextSecondary, 14.sp)
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                viewModel.deleteRequest(req)
                                requestToDelete = null
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = HomeRedAccent)
                        ) {
                            Text(stringResource(R.string.player_info_delete), style = boldTextStyle(HomeTextPrimary, 14.sp))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { requestToDelete = null }) {
                            Text(stringResource(R.string.cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
                        }
                    },
                    containerColor = HomeDarkCard
                )
            }
        }
    }
}

@Composable
private fun RequestsHeader(
    onAddClick: () -> Unit,
    onBackClick: () -> Unit,
    onShareClick: () -> Unit,
    canShare: Boolean
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
                .clickWithNoRipple { onBackClick() }
        )
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(stringResource(R.string.requests_title), style = boldTextStyle(HomeTextPrimary, 26.sp))
            Text(
                stringResource(R.string.requests_subtitle),
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        if (canShare) {
            IconButton(onClick = onShareClick, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.Share, contentDescription = stringResource(R.string.requests_share), tint = HomeTealAccent)
            }
        }
        IconButton(onClick = onAddClick, modifier = Modifier.size(40.dp)) {
            Icon(Icons.Default.Add, contentDescription = stringResource(R.string.requests_add), tint = HomeTealAccent)
        }
    }
}

@Composable
private fun RequestsStatsStrip(total: Int, positions: Int, pending: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        StatItem(value = total.toString(), label = stringResource(R.string.players_stat_total), accentColor = HomeTealAccent, modifier = Modifier.weight(1f))
        Box(modifier = Modifier.width(1.dp).height(24.dp).background(HomeDarkCardBorder))
        StatItem(value = positions.toString(), label = stringResource(R.string.requests_stat_positions), accentColor = HomeOrangeAccent, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatItem(value: String, label: String, accentColor: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
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
        Text(value, style = boldTextStyle(HomeTextPrimary, 18.sp))
        Text(label, style = regularTextStyle(HomeTextSecondary, 9.sp), modifier = Modifier.padding(top = 2.dp))
    }
}

@Composable
private fun PositionExpandableCard(
    position: String,
    count: Int,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    context: Context
) {
    val displayName = PositionDisplayNames.getDisplayName(context, position)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp)
            .clickWithNoRipple { onToggleExpand() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = HomeTealAccent,
                        topLeft = Offset.Zero,
                        size = Size(3.dp.toPx(), size.height)
                    )
                }
                .padding(start = 3.dp)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(HomeTealAccent.copy(alpha = 0.15f))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(position, style = boldTextStyle(HomeTealAccent, 11.sp))
            }
            Spacer(Modifier.width(12.dp))
            Text(displayName, style = boldTextStyle(HomeTextPrimary, 15.sp))
            Spacer(Modifier.weight(1f))
            Text(
                "($count)",
                style = regularTextStyle(HomeTextSecondary, 12.sp)
            )
            Icon(
                Icons.Default.ExpandMore,
                contentDescription = if (isExpanded) "Collapse" else "Expand",
                tint = HomeTextSecondary,
                modifier = Modifier
                    .size(22.dp)
                    .graphicsLayer { rotationZ = if (isExpanded) 180f else 0f }
            )
        }
    }
}

@Composable
private fun CountryExpandableRow(
    country: String,
    countryFlag: String?,
    count: Int,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    context: Context
) {
    val displayCountry = CountryNameTranslator.getDisplayName(context, country)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 12.dp, end = 0.dp, top = 8.dp, bottom = 0.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(HomeDarkBackground)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
            .clickWithNoRipple { onToggleExpand() }
            .padding(10.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (!countryFlag.isNullOrBlank()) {
            AsyncImage(
                model = countryFlag,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
            )
            Spacer(Modifier.width(8.dp))
        }
        if (countryFlag.isNullOrBlank()) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    displayCountry.take(1).uppercase(),
                    style = boldTextStyle(HomeTextSecondary, 10.sp)
                )
            }
            Spacer(Modifier.width(8.dp))
        }
        Text(
            displayCountry,
            style = boldTextStyle(HomeTextPrimary, 14.sp)
        )
        Spacer(Modifier.weight(1f))
        Text(
            text = if (count == 1) {
                stringResource(R.string.requests_country_club_one)
            } else {
                stringResource(R.string.requests_country_clubs, count)
            },
            style = regularTextStyle(HomeTextSecondary, 11.sp)
        )
        Spacer(Modifier.width(4.dp))
        Icon(
            Icons.Default.ExpandMore,
            contentDescription = if (isExpanded) "Collapse" else "Expand",
            tint = HomeTextSecondary,
            modifier = Modifier
                .size(18.dp)
                .graphicsLayer { rotationZ = if (isExpanded) 180f else 0f }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RequestCard(
    request: Request,
    matchingPlayers: List<Player>,
    isExpanded: Boolean,
    isOnlineExpanded: Boolean,
    onlineLoading: Boolean,
    onlinePlayers: List<AiHelperService.SimilarPlayerSuggestion>,
    shortlistUrls: Set<String>,
    justAddedUrls: Set<String>,
    shortlistPendingUrls: Set<String> = emptySet(),
    modifier: Modifier = Modifier,
    onToggleExpand: () -> Unit,
    onToggleOnlineExpand: () -> Unit,
    onPlayerClick: (Player) -> Unit,
    onOnlinePlayerClick: (AiHelperService.SimilarPlayerSuggestion) -> Unit,
    onOpenTransfermarkt: (String) -> Unit,
    onToggleShortlist: (AiHelperService.SimilarPlayerSuggestion) -> Unit,
    onTryAgainSearch: () -> Unit,
    onRefreshSearch: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    val viaShort = formatViaShort(
        request.contactName,
        request.createdAt,
        stringResource(R.string.requests_via_short),
        stringResource(R.string.requests_direct_short)
    )
    val ageLabel = when {
        request.ageDoesntMatter == true -> null
        request.minAge != null && request.maxAge != null && request.minAge > 0 && request.maxAge > 0 ->
            stringResource(R.string.requests_age_range, request.minAge, request.maxAge)
        else -> null
    }
    val salaryLabel = request.salaryRange?.takeIf { it.isNotBlank() }?.let {
        stringResource(R.string.requests_salary, it)
    }
    val feeLabel = request.transferFee?.takeIf { it.isNotBlank() }?.let { fee ->
        val displayFee = when (fee) {
            "Free/Free loan" -> stringResource(R.string.requests_transfer_fee_free_loan)
            "<200" -> stringResource(R.string.requests_transfer_fee_lt200)
            else -> fee
        }
        stringResource(R.string.requests_fee, displayFee)
    }
    val footLabel = request.dominateFoot?.takeIf { it.isNotBlank() }?.let { foot ->
        val displayFoot = when (foot.lowercase()) {
            "left" -> stringResource(R.string.requests_foot_left)
            "right" -> stringResource(R.string.requests_foot_right)
            else -> foot
        }
        stringResource(R.string.requests_foot_label, displayFoot)
    }
    val notesText = request.notes?.takeIf { it.isNotBlank() }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = HomeTealAccent,
                        topLeft = Offset.Zero,
                        size = Size(3.dp.toPx(), size.height)
                    )
                }
                .padding(start = 3.dp)
        ) {
            Box(
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(
                            onClick = { },
                            onLongClick = { showMenu = true }
                        )
                        .padding(horizontal = 10.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.Top
                ) {
                request.clubLogo?.let { logo ->
                    AsyncImage(
                        model = logo,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        contentScale = ContentScale.Fit
                    )
                }
                if (request.clubLogo == null) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(HomeDarkCardBorder),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            (request.clubName?.take(2) ?: "?").uppercase(),
                            style = boldTextStyle(HomeTextSecondary, 11.sp)
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        request.clubName ?: "",
                        style = boldTextStyle(HomeTextPrimary, 13.sp)
                    )
                    Text(
                        viaShort,
                        style = regularTextStyle(HomeTextSecondary, 10.sp)
                    )
                    if (ageLabel != null || salaryLabel != null || feeLabel != null || footLabel != null || notesText != null) {
                        FlowRow(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            ageLabel?.let { RequestChip(text = it) }
                            salaryLabel?.let { RequestChip(text = it) }
                            feeLabel?.let { RequestChip(text = it) }
                            footLabel?.let { RequestChip(text = it) }
                            notesText?.let { notes ->
                                val displayNotes = if (notes.length > 80) "${notes.take(80)}…" else notes
                                RequestChip(
                                    text = "${stringResource(R.string.requests_notes_label)}: $displayNotes"
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.width(8.dp))
                if (!request.contactPhoneNumber.isNullOrBlank()) {
                    Box(
                        modifier = Modifier.size(28.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        WhatsAppIcon(request.contactPhoneNumber)
                    }
                }
            }

                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false },
                    containerColor = HomeDarkCard
                ) {
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Edit,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = HomeTextPrimary
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.requests_edit),
                                    style = regularTextStyle(HomeTextPrimary, 14.sp)
                                )
                            }
                        },
                        onClick = {
                            showMenu = false
                            onEdit()
                        }
                    )
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = HomeRedAccent
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.requests_delete),
                                    style = regularTextStyle(HomeRedAccent, 14.sp)
                                )
                            }
                        },
                        onClick = {
                            showMenu = false
                            onDelete()
                        }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            // Row 1: From database — matching players (expandable, like releases)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(HomeDarkBackground)
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                    .clickWithNoRipple { onToggleExpand() }
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
                    text = if (matchingPlayers.size == 1) {
                        stringResource(R.string.requests_matching_players_one, matchingPlayers.size)
                    } else {
                        stringResource(R.string.requests_matching_players, matchingPlayers.size)
                    },
                    style = regularTextStyle(HomeTextPrimary, 13.sp)
                )
                Spacer(Modifier.weight(1f))
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                    tint = HomeTextSecondary,
                    modifier = Modifier
                        .size(20.dp)
                        .graphicsLayer { rotationZ = if (isExpanded) 180f else 0f }
                )
            }
            // DB expandable: directly below the row above
            if (isExpanded) {
                var isContentReady by remember(isExpanded) { mutableStateOf(false) }
                LaunchedEffect(isExpanded) {
                    if (isExpanded) {
                        isContentReady = false
                        delay(120)
                        isContentReady = true
                    } else {
                        isContentReady = false
                    }
                }
                if (!isContentReady) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 10.dp, end = 10.dp, bottom = 8.dp)
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = HomeTealAccent,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                } else if (matchingPlayers.isEmpty()) {
                    Text(
                        text = stringResource(R.string.requests_no_match),
                        style = regularTextStyle(HomeTextSecondary, 11.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 10.dp, end = 10.dp, bottom = 8.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeDarkBackground)
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 10.dp, end = 10.dp, bottom = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        matchingPlayers.forEach { player ->
                            MatchingPlayerRow(
                                player = player,
                                onClick = { onPlayerClick(player) }
                            )
                        }
                    }
                }
            }
            // Row 2: Find players from TM (expandable, loader + list inside)
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 10.dp, end = 10.dp, bottom = 10.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(HomeDarkBackground)
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                    .clickWithNoRipple { onToggleOnlineExpand() }
                    .padding(8.dp, 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Link,
                    contentDescription = null,
                    tint = HomeOrangeAccent,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    stringResource(R.string.requests_find_players_online),
                    style = regularTextStyle(HomeTextPrimary, 12.sp),
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = if (isOnlineExpanded) "Collapse" else "Expand",
                    tint = HomeTextSecondary,
                    modifier = Modifier
                        .size(24.dp)
                        .graphicsLayer { rotationZ = if (isOnlineExpanded) 180f else 0f }
                )
            }
            if (isOnlineExpanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 10.dp, end = 10.dp, bottom = 10.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(HomeDarkBackground)
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
                        .padding(10.dp)
                ) {
                    if (onlineLoading) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                color = HomeTealAccent,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                stringResource(R.string.requests_online_players_loading),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                        Spacer(Modifier.height(16.dp))
                    } else if (onlinePlayers.isEmpty()) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                stringResource(R.string.requests_online_players_empty),
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                            TextButton(
                                onClick = onTryAgainSearch,
                                colors = ButtonDefaults.textButtonColors(contentColor = HomeTealAccent)
                            ) {
                                Text(
                                    stringResource(R.string.contacts_try_again),
                                    style = regularTextStyle(HomeTealAccent, 14.sp)
                                )
                            }
                        }
                    } else {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            // Results count header
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    stringResource(R.string.requests_online_results_count, onlinePlayers.size),
                                    style = regularTextStyle(HomeTextSecondary, 11.sp)
                                )
                            }
                            onlinePlayers.forEach { suggestion ->
                                val url = suggestion.transfermarktUrl
                                val isInShortlist = url != null && (url in shortlistUrls || url in justAddedUrls)
                                val isShortlistPending = url != null && url in shortlistPendingUrls
                                OnlinePlayerSuggestionRow(
                                    suggestion = suggestion,
                                    isInShortlist = isInShortlist,
                                    isShortlistPending = isShortlistPending,
                                    onClick = { url?.let { onOpenTransfermarkt(it) } },
                                    onToggleShortlist = { onToggleShortlist(suggestion) }
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            // Refresh button — replaces results with a different batch
                            TextButton(
                                onClick = onRefreshSearch,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.textButtonColors(contentColor = HomeTealAccent)
                            ) {
                                Icon(
                                    Icons.Default.Refresh,
                                    contentDescription = null,
                                    tint = HomeTealAccent,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    stringResource(R.string.requests_online_refresh),
                                    style = regularTextStyle(HomeTealAccent, 13.sp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RequestChip(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(HomeDarkBackground)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text = text,
            style = regularTextStyle(HomeTextSecondary, 10.sp)
        )
    }
}

private fun formatViaShort(
    contactName: String?,
    createdAt: Long?,
    viaPrefix: String,
    directPrefix: String
): String {
    val dateStr = if (createdAt != null) {
        SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(createdAt))
    } else ""
    val datePart = if (dateStr.isNotBlank()) " • $dateStr" else ""
    return when {
        !contactName.isNullOrBlank() -> {
            val short = contactName.trim().split(" ").let { parts ->
                if (parts.size >= 2) "${parts.first()} ${parts.drop(1).map { it.firstOrNull()?.uppercaseChar() ?: "" }.joinToString(".")}."
                else parts.firstOrNull() ?: ""
            }
            "$viaPrefix $short$datePart"
        }
        else -> "$directPrefix$datePart"
    }
}

@Composable
private fun MatchingPlayerRow(
    player: Player,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val posDisplay = player.positions?.firstOrNull()?.takeIf { it.isNotBlank() }
        ?.let { PositionDisplayNames.getDisplayName(context, it) } ?: "-"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(HomeDarkBackground)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
            .clickWithNoRipple { onClick() }
            .padding(10.dp, 10.dp),
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
                "${player.age ?: "-"} • $posDisplay • ${player.marketValue ?: "-"}",
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = HomeTextSecondary,
            modifier = Modifier.size(20.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RequestOnlinePlayersBottomSheet(
    request: Request,
    matchingPlayers: List<AiHelperService.SimilarPlayerSuggestion>,
    shortlistUrls: Set<String>,
    justAddedUrls: Set<String>,
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onPlayerClick: (AiHelperService.SimilarPlayerSuggestion) -> Unit,
    onOpenTransfermarkt: (String) -> Unit,
    onToggleShortlist: (AiHelperService.SimilarPlayerSuggestion) -> Unit
) {
    val context = LocalContext.current
    val positionName = PositionDisplayNames.getDisplayName(context, request.position)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        containerColor = HomeDarkCard,
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp, 4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(HomeDarkCardBorder)
                )
            }
        },
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .padding(bottom = 32.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                request.clubLogo?.let { logo ->
                    AsyncImage(
                        model = logo,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(Modifier.width(12.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.requests_online_players_sheet_title),
                        style = boldTextStyle(HomeTextPrimary, 18.sp)
                    )
                    Text(
                        "${request.clubName ?: ""} • $positionName",
                        style = regularTextStyle(HomeTextSecondary, 13.sp),
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            if (isLoading) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        color = HomeTealAccent,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        stringResource(R.string.requests_online_players_loading),
                        style = regularTextStyle(HomeTextSecondary, 14.sp)
                    )
                }
            } else if (matchingPlayers.isEmpty()) {
                Text(
                    stringResource(R.string.requests_online_players_empty),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp)
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 400.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(matchingPlayers, key = { it.transfermarktUrl ?: it.name }) { suggestion ->
                        val url = suggestion.transfermarktUrl
                        val isInShortlist = url != null && (url in shortlistUrls || url in justAddedUrls)
                        OnlinePlayerSuggestionRow(
                            suggestion = suggestion,
                            isInShortlist = isInShortlist,
                            onClick = { url?.let { onOpenTransfermarkt(it) } },
                            onToggleShortlist = { onToggleShortlist(suggestion) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OnlinePlayerSuggestionRow(
    suggestion: AiHelperService.SimilarPlayerSuggestion,
    isInShortlist: Boolean,
    isShortlistPending: Boolean = false,
    onClick: () -> Unit,
    onToggleShortlist: () -> Unit
) {
    val ctx = LocalContext.current
    val layoutDirection = ctx.resources.configuration.layoutDirection
    val isRtl = layoutDirection == android.util.LayoutDirection.RTL
    var isExpanded by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(HomeDarkBackground)
                .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
        ) {
            // ── Collapsed header: Score + Name/Info + Expand arrow ──
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple { isExpanded = !isExpanded }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Match score circle
                suggestion.matchPercent?.let { pct ->
                    val scoreColor = when {
                        pct >= 75 -> HomeGreenAccent
                        pct >= 55 -> HomeTealAccent
                        else -> HomeOrangeAccent
                    }
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(scoreColor.copy(alpha = 0.15f))
                            .border(2.dp, scoreColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "$pct",
                                style = boldTextStyle(scoreColor, 15.sp)
                            )
                            Text(
                                "%",
                                style = regularTextStyle(scoreColor, 8.sp),
                                modifier = Modifier.offset(y = (-2).dp)
                            )
                        }
                    }
                } ?: run {
                    // No score — show initials
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(HomeDarkCardBorder),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            suggestion.name.take(2).uppercase(),
                            style = boldTextStyle(HomeTextSecondary, 13.sp)
                        )
                    }
                }

                Spacer(Modifier.width(12.dp))

                // Name + concise details
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    // Player name
                    Text(
                        suggestion.name,
                        style = boldTextStyle(HomeTextPrimary, 15.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    // Age · Position · Market Value
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        val posDisplay = suggestion.position?.let {
                            PositionDisplayNames.getDisplayName(ctx, it)
                        }
                        val infoText = buildString {
                            suggestion.age?.let { append(it) }
                            posDisplay?.let { pos ->
                                if (isNotBlank()) append(" · ")
                                append(pos)
                            }
                        }
                        if (infoText.isNotBlank()) {
                            Text(
                                infoText,
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        suggestion.marketValue?.takeIf { it.isNotBlank() }?.let { mv ->
                            if (infoText.isNotBlank()) {
                                Text("·", style = regularTextStyle(HomeTextSecondary, 12.sp))
                            }
                            Text(mv, style = boldTextStyle(HomeGreenAccent, 12.sp))
                        }
                    }
                    // League + Playing style preview
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        suggestion.league?.let { leagueName ->
                            Text(
                                text = leagueName,
                                style = regularTextStyle(HomeTextSecondary, 11.sp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(HomeDarkCardBorder.copy(alpha = 0.5f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                        suggestion.playingStyle?.takeIf { it.isNotBlank() }?.let { style ->
                            Text(
                                text = style,
                                style = boldTextStyle(HomeTealAccent, 10.sp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(HomeTealAccent.copy(alpha = 0.10f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }

                // Expand/collapse arrow
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                    tint = HomeTextSecondary,
                    modifier = Modifier
                        .size(22.dp)
                        .graphicsLayer { rotationZ = if (isExpanded) 180f else 0f }
                )
            }

            // ── Expanded section: detailed info + actions ──
            AnimatedVisibility(visible = isExpanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Player details card
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(HomeDarkCard.copy(alpha = 0.6f))
                            .border(1.dp, HomeDarkCardBorder.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                            .padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        // Server explanation (structured scout analysis)
                        suggestion.scoutAnalysis?.takeIf { it.isNotBlank() }?.let { analysis ->
                            val parts = analysis.split(" · ").filter { it.isNotBlank() }
                            parts.forEach { part ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(vertical = 1.dp)
                                ) {
                                    val icon = when {
                                        part.contains("/90") || part.contains("%") || part.contains("pct", ignoreCase = true) -> "📊"
                                        part.contains("contract", ignoreCase = true) || part.contains("חוזה") -> "📋"
                                        part.contains("height", ignoreCase = true) || part.contains("גובה") -> "📏"
                                        else -> "⚡"
                                    }
                                    Text(
                                        "$icon ",
                                        style = regularTextStyle(HomeTextSecondary, 12.sp)
                                    )
                                    Text(
                                        part,
                                        style = regularTextStyle(HomeTextPrimary, 12.sp),
                                        lineHeight = 18.sp
                                    )
                                }
                            }
                        }

                        // Physical & contract details (built from fields when no/sparse server explanation)
                        val detailItems = buildList {
                            suggestion.foot?.let { f ->
                                val footLabel = when (f.lowercase()) {
                                    "right" -> if (isRtl) "ימין" else "Right foot"
                                    "left" -> if (isRtl) "שמאל" else "Left foot"
                                    "both" -> if (isRtl) "דו-רגלי" else "Both feet"
                                    else -> f
                                }
                                add("🦶" to footLabel)
                            }
                            suggestion.height?.let { h ->
                                add("📏" to h)
                            }
                            suggestion.nationality?.let { n ->
                                // Already formatted with " · " for dual nationality
                                add("🌍" to n)
                            }
                            suggestion.contractEnd?.let { c ->
                                val contractLabel = if (isRtl) "חוזה עד $c" else "Contract until $c"
                                add("📋" to contractLabel)
                            }
                        }

                        // Only show detail items that aren't already covered by scoutAnalysis
                        val analysisText = suggestion.scoutAnalysis?.lowercase() ?: ""
                        detailItems.forEach { (icon, text) ->
                            // Skip if already mentioned in scout analysis
                            val isRedundant = when (icon) {
                                "📋" -> analysisText.contains("contract") || analysisText.contains("חוזה")
                                "📏" -> analysisText.contains("height") || analysisText.contains("גובה") || analysisText.contains(text.lowercase())
                                else -> false
                            }
                            if (!isRedundant) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(vertical = 1.dp)
                                ) {
                                    Text(
                                        "$icon ",
                                        style = regularTextStyle(HomeTextSecondary, 12.sp)
                                    )
                                    Text(
                                        text,
                                        style = regularTextStyle(HomeTextPrimary, 12.sp)
                                    )
                                }
                            }
                        }

                        // Fallback: show raw similarity reason if nothing else
                        if (suggestion.scoutAnalysis.isNullOrBlank() && detailItems.isEmpty()) {
                            suggestion.similarityReason?.takeIf { it.isNotBlank() }?.let { reason ->
                                Text(
                                    text = reason,
                                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                                    lineHeight = 18.sp,
                                    textAlign = if (isRtl) TextAlign.Right else TextAlign.Start
                                )
                            }
                        }
                    }

                    // Action buttons: Add to Shortlist + Open Transfermarkt
                    if (suggestion.transfermarktUrl != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Add to Shortlist button
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(
                                        if (isInShortlist) HomeGreenAccent.copy(alpha = 0.15f)
                                        else HomeTealAccent.copy(alpha = 0.12f)
                                    )
                                    .clickWithNoRipple { onToggleShortlist() }
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = if (isInShortlist) Icons.Default.Bookmark else Icons.Default.BookmarkAdd,
                                    contentDescription = null,
                                    tint = if (isInShortlist) HomeGreenAccent else HomeTealAccent,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = if (isInShortlist) stringResource(R.string.shortlist_in_shortlist)
                                           else stringResource(R.string.shortlist_add_to_shortlist),
                                    style = regularTextStyle(
                                        if (isInShortlist) HomeGreenAccent else HomeTealAccent,
                                        11.sp
                                    ),
                                    maxLines = 1
                                )
                            }

                            // Open Transfermarkt button
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(HomeOrangeAccent.copy(alpha = 0.12f))
                                    .clickWithNoRipple { onClick() }
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    Icons.Default.OpenInNew,
                                    contentDescription = null,
                                    tint = HomeOrangeAccent,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = "Transfermarkt",
                                    style = regularTextStyle(HomeOrangeAccent, 11.sp),
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }
        }

        // Loading overlay for shortlist pending
        if (isShortlistPending) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = HomeTealAccent,
                    modifier = Modifier.size(28.dp),
                    strokeWidth = 2.dp
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RequestMatchingPlayersBottomSheet(
    request: Request,
    matchingPlayers: List<Player>,
    onDismiss: () -> Unit,
    onPlayerClick: (Player) -> Unit
) {
    val context = LocalContext.current
    val positionName = PositionDisplayNames.getDisplayName(context, request.position)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        containerColor = HomeDarkCard,
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp, 4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(HomeDarkCardBorder)
                )
            }
        },
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .padding(bottom = 32.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                request.clubLogo?.let { logo ->
                    AsyncImage(
                        model = logo,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(Modifier.width(12.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.requests_find_players_sheet_title),
                        style = boldTextStyle(HomeTextPrimary, 18.sp)
                    )
                    Text(
                        "${request.clubName ?: ""} • $positionName",
                        style = regularTextStyle(HomeTextSecondary, 13.sp),
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            if (matchingPlayers.isEmpty()) {
                Text(
                    stringResource(R.string.requests_no_match),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp)
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 400.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(matchingPlayers, key = { it.tmProfile ?: it.fullName ?: it.hashCode().toString() }) { player ->
                        MatchingPlayerRow(
                            player = player,
                            onClick = { onPlayerClick(player) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RequestsEmptyState(onAddClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.Handshake,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = HomeTextSecondary.copy(alpha = 0.5f)
        )
        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.requests_no_requests),
            style = boldTextStyle(HomeTextPrimary, 18.sp)
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.requests_empty_hint),
            style = regularTextStyle(HomeTextSecondary, 13.sp),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onAddClick,
            colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text(stringResource(R.string.requests_add), style = boldTextStyle(Color.White, 14.sp))
        }
    }
}

private fun formatDate(timestamp: Long?): String {
    if (timestamp == null) return ""
    return SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(timestamp))
}

private fun formatRequestsForShare(context: Context, requestsByPositionCountry: Map<String, Map<String, List<Request>>>): String {
    if (requestsByPositionCountry.isEmpty()) return "No requests at the moment."
    val sb = StringBuilder()
    sb.appendLine("MGSR Team – Player Requests")
    sb.appendLine("─────────────────────────")
    sb.appendLine()
    requestsByPositionCountry.forEach { (position, countries) ->
        val positionDisplay = PositionDisplayNames.getDisplayName(context, position)
        sb.appendLine("$positionDisplay ($position)")
        countries.forEach { (country, requests) ->
            val countryDisplay = CountryNameTranslator.getDisplayName(context, country)
            requests.forEach { req ->
                sb.appendLine("  • ${req.clubName ?: "Unknown"}${if (!country.isNullOrBlank() && country != "Other") " ($countryDisplay)" else ""}")
                val ageInfo = when {
                    req.ageDoesntMatter == true -> "Age: Any"
                    req.minAge != null && req.maxAge != null && req.minAge > 0 && req.maxAge > 0 ->
                        "Age: ${req.minAge}-${req.maxAge}"
                    else -> ""
                }
                val salaryInfo = req.salaryRange?.takeIf { it.isNotBlank() }?.let { "Salary: $it" } ?: ""
                val feeInfo = req.transferFee?.takeIf { it.isNotBlank() }?.let { "Fee: $it" } ?: ""
                val footInfo = req.dominateFoot?.takeIf { it.isNotBlank() }?.let { foot ->
                    when (foot.lowercase()) {
                        "left" -> "Foot: Left"
                        "right" -> "Foot: Right"
                        else -> "Foot: $foot"
                    }
                } ?: ""
                val details = listOfNotNull(
                    ageInfo.takeIf { it.isNotBlank() },
                    salaryInfo,
                    feeInfo,
                    footInfo.takeIf { it.isNotBlank() }
                ).joinToString(" • ")
                if (details.isNotBlank()) {
                    sb.appendLine("    $details")
                }
                sb.appendLine()
            }
        }
    }
    return sb.toString().trimEnd()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddRequestBottomSheet(
    modifier: Modifier,
    positions: List<com.liordahan.mgsrteam.features.players.models.Position>,
    onDismiss: () -> Unit,
    onSave: (
        club: ClubSearchModel,
        position: String,
        contactId: String?,
        contactName: String?,
        contactPhone: String?,
        minAge: Int?,
        maxAge: Int?,
        ageDoesntMatter: Boolean,
        dominateFoot: String?,
        salaryRange: String?,
        transferFee: String?,
        notes: String?
    ) -> Unit
) {
    val clubSearch: ClubSearch = koinInject()
    val contactsRepository: IContactsRepository = koinInject()
    val voiceAnalyzer: RequestVoiceAnalyzer = koinInject()
    val contacts by contactsRepository.contactsFlow().collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val view = LocalView.current

    var showChoiceScreen by rememberSaveable { mutableStateOf(true) }
    var isRecording by remember { mutableStateOf(false) }
    var recordingDuration by remember { mutableStateOf(0) }
    var isAnalyzing by remember { mutableStateOf(false) }
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var recordingFile by remember { mutableStateOf<java.io.File?>(null) }

    LaunchedEffect(isRecording) {
        if (!isRecording) return@LaunchedEffect
        recordingDuration = 0
        while (true) {
            delay(1000)
            recordingDuration += 1
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            val file = RequestVoiceRecorder.createTempRecordingFile(context)
            recordingFile = file
            recorder = RequestVoiceRecorder.startRecording(file)
            if (recorder != null) isRecording = true
            else ToastManager.showError(context.getString(R.string.requests_voice_error))
        } else {
            ToastManager.showError(context.getString(R.string.player_info_record_permission_denied))
        }
    }

    var clubSearchQuery by remember { mutableStateOf("") }
    var clubSearchResults by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    var isSearchingClubs by remember { mutableStateOf(false) }
    var selectedClub by remember { mutableStateOf<ClubSearchModel?>(null) }
    var selectedPosition by remember { mutableStateOf<String?>(null) }
    var selectedContact by remember { mutableStateOf<Contact?>(null) }
    var ageDoesntMatter by remember { mutableStateOf(true) }
    var minAge by remember { mutableStateOf("") }
    var maxAge by remember { mutableStateOf("") }
    var selectedDominateFoot by remember { mutableStateOf<String?>(DominateFootOptions.ANY) }
    var selectedSalaryRange by remember { mutableStateOf<String?>(null) }
    var selectedTransferFee by remember { mutableStateOf<String?>(null) }
    var notes by remember { mutableStateOf("") }

    val filteredContacts = remember(contacts, selectedClub) {
        if (selectedClub == null) emptyList()
        else contacts.filter {
            it.clubName.equals(selectedClub?.clubName, ignoreCase = true)
        }
    }

    val clubSearchFocusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(clubSearchQuery) {
        if (clubSearchQuery.length < 2) {
            clubSearchResults = emptyList()
            return@LaunchedEffect
        }
        delay(250)
        isSearchingClubs = true
        clubSearchResults = when (val result = clubSearch.getClubSearchResults(clubSearchQuery)) {
            is TransfermarktResult.Success -> result.data
            is TransfermarktResult.Failed -> emptyList()
        }
        isSearchingClubs = false
    }

    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density

    var currentStep by rememberSaveable { mutableStateOf(0) }

    val canProceedStep1 = selectedClub != null
    val canProceedStep2 = selectedPosition != null
    val canProceedStep3 = selectedSalaryRange != null && selectedTransferFee != null

    val stepLabels = listOf(
        stringResource(R.string.requests_step_club),
        stringResource(R.string.requests_step_position),
        stringResource(R.string.requests_step_requirements),
        stringResource(R.string.requests_step_notes)
    )

    ModalBottomSheet(
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        modifier = modifier.height(screenHeight * 0.65f),
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = HomeDarkCard,
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp, bottom = 2.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp, 4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(HomeDarkCardBorder)
                )
            }
        },
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(horizontal = 16.dp)
                .imePadding()
                .navigationBarsPadding()
                .nestedScroll(rememberNestedScrollInteropConnection())
                .padding(bottom = 48.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    if (currentStep > 0) {
                        IconButton(
                            onClick = { currentStep = currentStep - 1 },
                            modifier = Modifier.size(40.dp)
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = null,
                                tint = HomeTextSecondary
                            )
                        }
                    }
                    Text(
                        text = stringResource(R.string.requests_add_title),
                        style = boldTextStyle(HomeTextPrimary, 20.sp)
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = null, tint = HomeTextSecondary)
                }
            }

            when {
                showChoiceScreen && !isRecording && !isAnalyzing -> {
                    Column(modifier = Modifier.weight(1f, fill = true)) {
                        AddRequestChoiceContent(
                        onRecordClick = {
                            if (!RequestVoiceRecorder.isAvailable(context)) {
                                ToastManager.showError(context.getString(R.string.player_info_record_not_available))
                                return@AddRequestChoiceContent
                            }
                            if (!RequestVoiceRecorder.hasRecordAudioPermission(context)) {
                                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                return@AddRequestChoiceContent
                            }
                            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                            val file = RequestVoiceRecorder.createTempRecordingFile(context)
                            recordingFile = file
                            recorder = RequestVoiceRecorder.startRecording(file)
                            if (recorder != null) isRecording = true
                            else ToastManager.showError(context.getString(R.string.requests_voice_error))
                        },
                        onFillManuallyClick = { showChoiceScreen = false }
                        )
                    }
                }
                isRecording -> {
                    Column(modifier = Modifier.weight(1f, fill = true)) {
                    AddRequestRecordingContent(
                        durationSeconds = recordingDuration,
                        onStopClick = {
                            val bytesResult = RequestVoiceRecorder.stopRecording(recorder, recordingFile!!)
                            recorder = null
                            recordingFile = null
                            isRecording = false
                            bytesResult.fold(
                                onSuccess = { bytes ->
                                    isAnalyzing = true
                                    scope.launch {
                                        voiceAnalyzer.analyzeAudio(bytes, RequestVoiceRecorder.getAudioMimeType())
                                            .fold(
                                                onSuccess = { data ->
                                                    isAnalyzing = false
                                                    val club = data.club ?: data.clubNameRaw?.let { name ->
                                                        ClubSearchModel(clubName = name, clubLogo = null, clubTmProfile = null, clubCountry = null, clubCountryFlag = null)
                                                    }
                                                    val position = data.position?.takeIf { it.isNotBlank() }
                                                    if (club == null || position == null) {
                                                        ToastManager.showError(context.getString(R.string.requests_voice_missing_club_position))
                                                    } else {
                                                        val matchingContact = contacts.firstOrNull { c ->
                                                            c.clubName?.equals(club.clubName, ignoreCase = true) == true
                                                        }
                                                        onSave(
                                                            club,
                                                            position,
                                                            matchingContact?.id,
                                                            matchingContact?.name,
                                                            matchingContact?.phoneNumber,
                                                            data.minAge,
                                                            data.maxAge,
                                                            data.ageDoesntMatter,
                                                            data.dominateFoot?.takeIf { it != DominateFootOptions.ANY },
                                                            data.salaryRange,
                                                            data.transferFee,
                                                            data.notes
                                                        )
                                                    }
                                                },
                                                onFailure = {
                                                    ToastManager.showError(context.getString(R.string.requests_voice_error))
                                                    isAnalyzing = false
                                                }
                                            )
                                    }
                                },
                                onFailure = {
                                    ToastManager.showError(context.getString(R.string.requests_voice_error))
                                }
                            )
                        }
                    )
                    }
                }
                isAnalyzing -> {
                    Column(
                        modifier = Modifier
                            .weight(1f, fill = true)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator(color = HomeTealAccent)
                        Spacer(Modifier.height(24.dp))
                        Text(
                            text = stringResource(R.string.requests_analyzing),
                            style = boldTextStyle(HomeTextPrimary, 16.sp)
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.requests_analyzing_subtitle),
                            style = regularTextStyle(HomeTextSecondary, 14.sp)
                        )
                    }
                }
                else -> Column(modifier = Modifier.weight(1f, fill = true)) {
                    AddRequestStepIndicator(currentStep = currentStep, stepLabels = stepLabels)
                    Spacer(Modifier.height(16.dp))
                    AnimatedContent(
                        modifier = Modifier.weight(1f, fill = true),
                        targetState = currentStep,
                        transitionSpec = {
                            if (targetState > initialState) {
                                slideInHorizontally(animationSpec = tween(200)) { it } + fadeIn(tween(200)) togetherWith
                                    slideOutHorizontally(animationSpec = tween(200)) { -it } + fadeOut(tween(200))
                            } else {
                                slideInHorizontally(animationSpec = tween(200)) { -it } + fadeIn(tween(200)) togetherWith
                                    slideOutHorizontally(animationSpec = tween(200)) { it } + fadeOut(tween(200))
                            }
                        },
                        label = "add_request_steps"
                    ) { step ->
                        when (step) {
                            0 -> AddRequestStep1ClubContent(
                                clubSearchQuery = clubSearchQuery,
                                onClubSearchChange = { q: String ->
                                    clubSearchQuery = q
                                    if (selectedClub != null && q != selectedClub?.clubName) selectedClub = null
                                },
                                clubSearchResults = clubSearchResults,
                                isSearchingClubs = isSearchingClubs,
                                selectedClub = selectedClub,
                                filteredContacts = filteredContacts,
                                selectedContact = selectedContact,
                                onSelectClub = { club: ClubSearchModel ->
                                    selectedClub = club
                                    clubSearchQuery = ""
                                    clubSearchResults = emptyList()
                                },
                                onChangeClub = {
                                    selectedClub = null
                                    clubSearchQuery = ""
                                    clubSearchResults = emptyList()
                                    clubSearchFocusRequester.requestFocus()
                                    keyboardController?.show()
                                },
                                onSelectContact = { c: Contact -> selectedContact = if (selectedContact?.id == c.id) null else c },
                                clubSearchFocusRequester = clubSearchFocusRequester
                            )
                            1 -> AddRequestStep2PositionContent(
                                positions = positions,
                                selectedPosition = selectedPosition,
                                onSelectPosition = { selectedPosition = it }
                            )
                            2 -> AddRequestStep3RequirementsContent(
                                ageDoesntMatter = ageDoesntMatter,
                                minAge = minAge,
                                maxAge = maxAge,
                                selectedDominateFoot = selectedDominateFoot,
                                selectedSalaryRange = selectedSalaryRange,
                                selectedTransferFee = selectedTransferFee,
                                onAgeDoesntMatterChange = { ageDoesntMatter = it },
                                onMinAgeChange = { minAge = it },
                                onMaxAgeChange = { maxAge = it },
                                onDominateFootSelect = { selectedDominateFoot = it },
                                onSalaryRangeSelect = { selectedSalaryRange = it },
                                onTransferFeeSelect = { selectedTransferFee = it }
                            )
                            3 -> AddRequestStep4NotesContent(
                                notes = notes,
                                onNotesChange = { notes = it },
                                onDismiss = onDismiss,
                                onSave = {
                                    val club = selectedClub
                                    val pos = selectedPosition
                                    if (club != null && pos != null) {
                                        onSave(
                                            club,
                                            pos,
                                            selectedContact?.id,
                                            selectedContact?.name,
                                            selectedContact?.phoneNumber,
                                            minAge.toIntOrNull()?.takeIf { it > 0 },
                                            maxAge.toIntOrNull()?.takeIf { it > 0 },
                                            ageDoesntMatter,
                                            selectedDominateFoot?.takeIf { it != DominateFootOptions.ANY },
                                            selectedSalaryRange,
                                            selectedTransferFee,
                                            notes.takeIf { it.isNotBlank() }
                                        )
                                    }
                                }
                            )
                        }
                    }
                }
            }

            if (!showChoiceScreen && !isRecording && !isAnalyzing && currentStep < 3) {
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = {
                        when (currentStep) {
                            0 -> if (canProceedStep1) currentStep = 1
                            1 -> if (canProceedStep2) currentStep = 2
                            2 -> if (canProceedStep3) currentStep = 3
                        }
                    },
                    enabled = when (currentStep) {
                        0 -> canProceedStep1
                        1 -> canProceedStep2
                        2 -> canProceedStep3
                        else -> true
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HomeTealAccent,
                        disabledContainerColor = HomeTealAccent.copy(alpha = 0.4f)
                    )
                ) {
                    Text(stringResource(R.string.requests_next), style = boldTextStyle(Color.White, 14.sp))
                }
            }
        }
    }
}

@Composable
private fun AddRequestStepIndicator(currentStep: Int, stepLabels: List<String>) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        stepLabels.forEachIndexed { index, _ ->
            if (index > 0) Spacer(Modifier.width(6.dp))
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(
                        if (index <= currentStep) HomeTealAccent else HomeDarkCardBorder
                    )
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            text = stringResource(R.string.requests_step_of, currentStep + 1) + " — " + stepLabels[currentStep],
            style = regularTextStyle(HomeTextSecondary, 12.sp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddRequestStep1ClubContent(
    clubSearchQuery: String,
    onClubSearchChange: (String) -> Unit,
    clubSearchResults: List<ClubSearchModel>,
    isSearchingClubs: Boolean,
    selectedClub: ClubSearchModel?,
    filteredContacts: List<Contact>,
    selectedContact: Contact?,
    onSelectClub: (ClubSearchModel) -> Unit,
    onChangeClub: () -> Unit,
    onSelectContact: (Contact) -> Unit,
    clubSearchFocusRequester: FocusRequester
) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.requests_search_for_club),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        OutlinedTextField(
            value = clubSearchQuery,
            onValueChange = onClubSearchChange,
            placeholder = { Text(stringResource(R.string.requests_search_club), style = regularTextStyle(HomeTextSecondary, 14.sp)) },
            modifier = Modifier.fillMaxWidth().focusRequester(clubSearchFocusRequester),
            singleLine = true,
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(
                focusedTextColor = HomeTextPrimary,
                unfocusedTextColor = HomeTextPrimary,
                focusedBorderColor = HomeTealAccent,
                unfocusedBorderColor = HomeDarkCardBorder,
                cursorColor = HomeTealAccent
            ),
            trailingIcon = {
                if (isSearchingClubs) {
                    Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(
                            color = HomeTealAccent,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }
        )
        if (clubSearchResults.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 260.dp)
                    .padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                items(clubSearchResults) { clubItem ->
                    ClubSearchResultRow(
                        club = clubItem,
                        onClick = { onSelectClub(clubItem) }
                    )
                }
            }
        }
        selectedClub?.let { club ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(HomeDarkBackground)
                    .border(1.dp, HomeTealAccent, RoundedCornerShape(10.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                club.clubLogo?.let { logo ->
                    AsyncImage(
                        model = logo,
                        contentDescription = null,
                        modifier = Modifier.size(28.dp),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(Modifier.width(10.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(club.clubName ?: "", style = boldTextStyle(HomeTextPrimary, 12.sp))
                    club.clubCountry?.let { c ->
                        Text(CountryNameTranslator.getDisplayName(context, c), style = regularTextStyle(HomeTextSecondary, 11.sp))
                    }
                }
                TextButton(onClick = onChangeClub) {
                    Text(stringResource(R.string.requests_change_club), style = regularTextStyle(HomeTealAccent, 12.sp))
                }
            }
        }
        selectedClub?.let {
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.requests_contact_optional),
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                modifier = Modifier.padding(bottom = 10.dp)
            )
            if (filteredContacts.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 140.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(filteredContacts) { contact ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (selectedContact?.id == contact.id) HomeTealAccent.copy(alpha = 0.2f) else HomeDarkBackground)
                                .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
                                .clickWithNoRipple { onSelectContact(contact) }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(contact.name ?: "", style = boldTextStyle(HomeTextPrimary, 13.sp))
                            Spacer(Modifier.weight(1f))
                            if (selectedContact?.id == contact.id) {
                                Icon(Icons.Default.Check, contentDescription = null, tint = HomeTealAccent, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            } else {
                Text(
                    stringResource(R.string.requests_no_contacts_for_club),
                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun AddRequestStep2PositionContent(
    positions: List<com.liordahan.mgsrteam.features.players.models.Position>,
    selectedPosition: String?,
    onSelectPosition: (String) -> Unit
) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            stringResource(R.string.requests_label_position),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 12.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            positions.chunked(2).forEach { rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    rowItems.forEach { pos ->
                        val posName = pos.name ?: ""
                        val displayName = PositionDisplayNames.getDisplayName(context, posName)
                        val isSelected = selectedPosition == posName
                        Text(
                            text = displayName,
                            style = regularTextStyle(if (isSelected) HomeTealAccent else HomeTextSecondary, 12.sp),
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent)
                                .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(12.dp))
                                .clickWithNoRipple { onSelectPosition(posName) }
                                .padding(horizontal = 12.dp, vertical = 12.dp)
                        )
                    }
                    if (rowItems.size == 1) {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddRequestStep3RequirementsContent(
    ageDoesntMatter: Boolean,
    minAge: String,
    maxAge: String,
    selectedDominateFoot: String?,
    selectedSalaryRange: String?,
    selectedTransferFee: String?,
    onAgeDoesntMatterChange: (Boolean) -> Unit,
    onMinAgeChange: (String) -> Unit,
    onMaxAgeChange: (String) -> Unit,
    onDominateFootSelect: (String?) -> Unit,
    onSalaryRangeSelect: (String?) -> Unit,
    onTransferFeeSelect: (String?) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            stringResource(R.string.requests_label_age),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = ageDoesntMatter,
                onCheckedChange = onAgeDoesntMatterChange,
                colors = CheckboxDefaults.colors(checkedColor = HomeTealAccent)
            )
            Text(
                stringResource(R.string.requests_age_doesnt_matter),
                style = regularTextStyle(HomeTextPrimary, 14.sp),
                modifier = Modifier.clickWithNoRipple { onAgeDoesntMatterChange(!ageDoesntMatter) }
            )
        }
        if (!ageDoesntMatter) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = minAge,
                    onValueChange = { onMinAgeChange(it.filter { c -> c.isDigit() }.take(2)) },
                    placeholder = { Text(stringResource(R.string.requests_min), style = regularTextStyle(HomeTextSecondary, 14.sp)) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(
                        focusedTextColor = HomeTextPrimary,
                        unfocusedTextColor = HomeTextPrimary,
                        focusedBorderColor = HomeTealAccent,
                        unfocusedBorderColor = HomeDarkCardBorder
                    )
                )
                OutlinedTextField(
                    value = maxAge,
                    onValueChange = { onMaxAgeChange(it.filter { c -> c.isDigit() }.take(2)) },
                    placeholder = { Text(stringResource(R.string.requests_max), style = regularTextStyle(HomeTextSecondary, 14.sp)) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(
                        focusedTextColor = HomeTextPrimary,
                        unfocusedTextColor = HomeTextPrimary,
                        focusedBorderColor = HomeTealAccent,
                        unfocusedBorderColor = HomeDarkCardBorder
                    )
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.requests_label_dominate_foot),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            DominateFootOptions.all.forEach { foot ->
                val isSelected = selectedDominateFoot == foot
                val (icon, label) = when (foot) {
                    DominateFootOptions.LEFT -> Icons.Default.ChevronLeft to stringResource(R.string.requests_foot_left)
                    DominateFootOptions.RIGHT -> Icons.Default.ChevronRight to stringResource(R.string.requests_foot_right)
                    else -> Icons.Default.SwapHoriz to stringResource(R.string.requests_foot_any)
                }
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent)
                        .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(12.dp))
                        .clickWithNoRipple { onDominateFootSelect(foot) }
                        .padding(horizontal = 12.dp, vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = if (isSelected) HomeTealAccent else HomeTextSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = label,
                        style = regularTextStyle(if (isSelected) HomeTealAccent else HomeTextSecondary, 12.sp)
                    )
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.requests_label_salary_range),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SalaryRangeOptions.all.chunked(2).forEach { rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    rowItems.forEach { range ->
                        val isSelected = selectedSalaryRange == range
                        Text(
                            text = range,
                            style = regularTextStyle(if (isSelected) HomeTealAccent else HomeTextSecondary, 12.sp),
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent)
                                .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(12.dp))
                                .clickWithNoRipple { onSalaryRangeSelect(if (isSelected) null else range) }
                                .padding(horizontal = 12.dp, vertical = 12.dp)
                        )
                    }
                    if (rowItems.size == 1) {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(R.string.requests_label_transfer_fee),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TransferFeeOptions.all.chunked(2).forEach { rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    rowItems.forEach { fee ->
                        val isSelected = selectedTransferFee == fee
                        val displayFee = when (fee) {
                            "Free/Free loan" -> stringResource(R.string.requests_transfer_fee_free_loan)
                            "<200" -> stringResource(R.string.requests_transfer_fee_lt200)
                            else -> fee
                        }
                        Text(
                            text = displayFee,
                            style = regularTextStyle(if (isSelected) HomeTealAccent else HomeTextSecondary, 12.sp),
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent)
                                .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(12.dp))
                                .clickWithNoRipple { onTransferFeeSelect(if (isSelected) null else fee) }
                                .padding(horizontal = 12.dp, vertical = 12.dp)
                        )
                    }
                    if (rowItems.size == 1) {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddRequestStep4NotesContent(
    notes: String,
    onNotesChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            stringResource(R.string.requests_notes_optional),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 12.dp)
        )
        OutlinedTextField(
            value = notes,
            onValueChange = onNotesChange,
            placeholder = { Text(stringResource(R.string.requests_notes_placeholder), style = regularTextStyle(HomeTextSecondary, 14.sp)) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(
                focusedTextColor = HomeTextPrimary,
                unfocusedTextColor = HomeTextPrimary,
                focusedBorderColor = HomeTealAccent,
                unfocusedBorderColor = HomeDarkCardBorder
            )
        )
        Spacer(Modifier.height(24.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
            }
            Button(
                onClick = onSave,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent)
            ) {
                Text(stringResource(R.string.requests_save_request), style = boldTextStyle(Color.White, 14.sp))
            }
        }
    }
}

@Composable
private fun AddRequestChoiceContent(
    onRecordClick: () -> Unit,
    onFillManuallyClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.requests_record_hint),
            style = regularTextStyle(HomeTextSecondary, 14.sp),
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(HomeTealAccent)
                .clickWithNoRipple(onClick = onRecordClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Mic,
                contentDescription = stringResource(R.string.requests_record_request),
                modifier = Modifier.size(40.dp),
                tint = Color.White
            )
        }
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.requests_record_request),
            style = boldTextStyle(HomeTextPrimary, 16.sp)
        )
        Spacer(Modifier.height(24.dp))
        Text(
            text = "—— ${stringResource(R.string.requests_or)} ——",
            style = regularTextStyle(HomeTextSecondary, 12.sp)
        )
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onFillManuallyClick) {
            Text(
                stringResource(R.string.requests_fill_manually),
                style = regularTextStyle(HomeTealAccent, 14.sp)
            )
        }
    }
}

private fun formatRecordingDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%d:%02d".format(m, s)
}

@Composable
private fun AddRequestRecordingContent(
    durationSeconds: Int,
    onStopClick: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "stop_pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable<Float>(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.requests_recording),
            style = regularTextStyle(HomeTealAccent, 16.sp),
            modifier = Modifier.padding(bottom = 16.dp)
        )
        RecordingWaveform(
            barCount = 10,
            color = HomeTealAccent,
            barWidth = 6.dp,
            barHeight = 12.dp,
            modifier = Modifier.padding(vertical = 16.dp)
        )
        Text(
            text = formatRecordingDuration(durationSeconds),
            style = boldTextStyle(HomeTextPrimary, 24.sp),
            modifier = Modifier.padding(vertical = 8.dp)
        )
        Box(
            modifier = Modifier
                .size(80.dp)
                .graphicsLayer { scaleX = pulseScale; scaleY = pulseScale }
                .clip(CircleShape)
                .background(HomeRedAccent.copy(alpha = 0.2f))
                .clickWithNoRipple(onClick = onStopClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Stop,
                contentDescription = stringResource(R.string.requests_stop_recording),
                modifier = Modifier.size(40.dp),
                tint = HomeRedAccent
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.requests_tap_to_stop),
            style = regularTextStyle(HomeTextSecondary, 14.sp)
        )
    }
}

@Composable
private fun ClubSearchResultRow(club: ClubSearchModel, onClick: () -> Unit) {
    val context = LocalContext.current
    Card(
        modifier = Modifier.fillMaxWidth().clickWithNoRipple(onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            club.clubLogo?.let { logo ->
                AsyncImage(
                    model = logo,
                    contentDescription = null,
                    modifier = Modifier.size(36.dp),
                    contentScale = ContentScale.Fit
                )
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(club.clubName ?: "", style = boldTextStyle(HomeTextPrimary, 14.sp))
                club.clubCountry?.let { country ->
                    Text(CountryNameTranslator.getDisplayName(context, country), style = regularTextStyle(HomeTextSecondary, 12.sp))
                }
            }
        }
    }
}
