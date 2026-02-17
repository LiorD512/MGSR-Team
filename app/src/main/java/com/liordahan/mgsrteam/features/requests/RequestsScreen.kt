package com.liordahan.mgsrteam.features.requests

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.repository.IContactsRepository
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.playerinfo.WhatsAppIcon
import com.liordahan.mgsrteam.features.requests.models.PositionDisplayNames
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions
import com.liordahan.mgsrteam.features.requests.models.TransferFeeOptions
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.delay
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
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.requests_add), modifier = Modifier.size(24.dp))
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
                        val text = formatRequestsForShare(state.requestsByPositionCountry)
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
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(
                                color = HomeTealAccent,
                                strokeWidth = 3.dp,
                                modifier = Modifier.size(44.dp)
                            )
                        }
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
                                        }
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
                                                }
                                            )
                                        }
                                        if (isCountryExpanded) {
                                            items(
                                                requests,
                                                key = { it.id ?: it.hashCode().toString() }
                                            ) { request ->
                                                val matchingPlayers = state.matchingPlayersByRequestId[request.id ?: ""] ?: emptyList()
                                                val isRequestExpanded = (request.id ?: "") in expandedRequestIds
                                                RequestCard(
                                                    request = request,
                                                    matchingPlayers = matchingPlayers,
                                                    isExpanded = isRequestExpanded,
                                                    modifier = Modifier.padding(start = 24.dp, top = 6.dp),
                                                    onToggleExpand = {
                                                        val id = request.id ?: return@RequestCard
                                                        expandedRequestIds = if (isRequestExpanded) expandedRequestIds - id else expandedRequestIds + id
                                                    },
                                                    onPlayerClick = { player ->
                                                        player.tmProfile?.let { profile ->
                                                            navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(profile)}")
                                                        }
                                                    },
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
                    onSave = { club, position, contactId, contactName, contactPhone, minAge, maxAge, ageDoesntMatter, salaryRange, transferFee, notes ->
                        viewModel.addRequest(
                            club = club,
                            position = position,
                            contactId = contactId,
                            contactName = contactName,
                            contactPhoneNumber = contactPhone,
                            minAge = minAge,
                            maxAge = maxAge,
                            ageDoesntMatter = ageDoesntMatter,
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
                                req.id?.let { viewModel.deleteRequest(it) }
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
    onToggleExpand: () -> Unit
) {
    val longName = PositionDisplayNames.toLongName(position)
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
            Text(longName, style = boldTextStyle(HomeTextPrimary, 15.sp))
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
    onToggleExpand: () -> Unit
) {
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
                    country.take(1).uppercase(),
                    style = boldTextStyle(HomeTextSecondary, 10.sp)
                )
            }
            Spacer(Modifier.width(8.dp))
        }
        Text(
            country,
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

@Composable
private fun RequestCard(
    request: Request,
    matchingPlayers: List<Player>,
    isExpanded: Boolean,
    modifier: Modifier = Modifier,
    onToggleExpand: () -> Unit,
    onPlayerClick: (Player) -> Unit,
    onDelete: () -> Unit
) {
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
    val notesText = request.notes?.takeIf { it.isNotBlank() }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp)
            .clickWithNoRipple { },
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
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(10.dp, 10.dp, 12.dp, 10.dp),
                verticalAlignment = Alignment.CenterVertically
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
                    if (ageLabel != null || salaryLabel != null || feeLabel != null || notesText != null) {
                        FlowRow(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            ageLabel?.let { RequestChip(text = it) }
                            salaryLabel?.let { RequestChip(text = it) }
                            feeLabel?.let { RequestChip(text = it) }
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
                var actionsExpanded by remember { mutableStateOf(false) }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (!request.contactPhoneNumber.isNullOrBlank()) {
                        AnimatedVisibility(
                            visible = !actionsExpanded,
                            enter = fadeIn(tween(200)),
                            exit = fadeOut(tween(200))
                        ) {
                            Box(
                                modifier = Modifier.size(28.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                WhatsAppIcon(request.contactPhoneNumber)
                            }
                        }
                    }
                    AnimatedVisibility(
                        visible = actionsExpanded,
                        enter = fadeIn(tween(200)) + slideInHorizontally(
                            initialOffsetX = { it },
                            animationSpec = tween(200)
                        ),
                        exit = fadeOut(tween(200)) + slideOutHorizontally(
                            targetOffsetX = { it },
                            animationSpec = tween(200)
                        )
                    ) {
                        IconButton(
                            onClick = {
                                onDelete()
                                actionsExpanded = false
                            },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = stringResource(R.string.requests_delete),
                                tint = HomeRedAccent,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    IconButton(
                        onClick = { actionsExpanded = !actionsExpanded },
                        modifier = Modifier.size(28.dp)
                    ) {
                        AnimatedContent(
                            targetState = actionsExpanded,
                            transitionSpec = {
                                fadeIn(tween(150)) togetherWith fadeOut(tween(150))
                            },
                            label = "request_menu_icon"
                        ) { expanded ->
                            Icon(
                                imageVector = if (expanded) Icons.Default.Close else Icons.Default.MoreVert,
                                contentDescription = if (expanded) "Close" else "More",
                                tint = HomeTextSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, bottom = 10.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(HomeDarkBackground)
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
                    .clickWithNoRipple { onToggleExpand() }
                    .padding(12.dp, 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.People,
                    contentDescription = null,
                    tint = HomeTealAccent,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = if (matchingPlayers.size == 1) {
                        stringResource(R.string.requests_matching_players_one, matchingPlayers.size)
                    } else {
                        stringResource(R.string.requests_matching_players, matchingPlayers.size)
                    },
                    style = regularTextStyle(HomeTextPrimary, 12.sp)
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
                            .padding(start = 12.dp, end = 12.dp, bottom = 10.dp)
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
                            .padding(start = 12.dp, end = 12.dp, bottom = 10.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(HomeDarkBackground)
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(8.dp))
                            .padding(10.dp)
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = 10.dp),
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
                "${player.age ?: "-"} • ${player.positions?.firstOrNull()?.takeIf { it.isNotBlank() } ?: "-"} • ${player.marketValue ?: "-"}",
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
            style = regularTextStyle(HomeTextSecondary, 13.sp)
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onAddClick,
            colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text(stringResource(R.string.requests_add), style = boldTextStyle(HomeDarkBackground, 14.sp))
        }
    }
}

private fun formatDate(timestamp: Long?): String {
    if (timestamp == null) return ""
    return SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(timestamp))
}

private fun formatRequestsForShare(requestsByPositionCountry: Map<String, Map<String, List<Request>>>): String {
    if (requestsByPositionCountry.isEmpty()) return "No requests at the moment."
    val sb = StringBuilder()
    sb.appendLine("MGSR Team – Player Requests")
    sb.appendLine("─────────────────────────")
    sb.appendLine()
    requestsByPositionCountry.forEach { (position, countries) ->
        val longName = PositionDisplayNames.toLongName(position)
        sb.appendLine("$longName ($position)")
        countries.forEach { (country, requests) ->
            requests.forEach { req ->
                sb.appendLine("  • ${req.clubName ?: "Unknown"}${if (!country.isNullOrBlank() && country != "Other") " ($country)" else ""}")
                val ageInfo = when {
                    req.ageDoesntMatter == true -> "Age: Any"
                    req.minAge != null && req.maxAge != null && req.minAge > 0 && req.maxAge > 0 ->
                        "Age: ${req.minAge}-${req.maxAge}"
                    else -> ""
                }
                val salaryInfo = req.salaryRange?.takeIf { it.isNotBlank() }?.let { "Salary: $it" } ?: ""
                val feeInfo = req.transferFee?.takeIf { it.isNotBlank() }?.let { "Fee: $it" } ?: ""
                val details = listOfNotNull(
                    ageInfo.takeIf { it.isNotBlank() },
                    salaryInfo,
                    feeInfo
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
        salaryRange: String?,
        transferFee: String?,
        notes: String?
    ) -> Unit
) {
    val clubSearch: ClubSearch = koinInject()
    val contactsRepository: IContactsRepository = koinInject()
    val contacts by contactsRepository.contactsFlow().collectAsStateWithLifecycle(initialValue = emptyList())

    var clubSearchQuery by remember { mutableStateOf("") }
    var clubSearchResults by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    var isSearchingClubs by remember { mutableStateOf(false) }
    var selectedClub by remember { mutableStateOf<ClubSearchModel?>(null) }
    var selectedPosition by remember { mutableStateOf<String?>(null) }
    var selectedContact by remember { mutableStateOf<Contact?>(null) }
    var ageDoesntMatter by remember { mutableStateOf(true) }
    var minAge by remember { mutableStateOf("") }
    var maxAge by remember { mutableStateOf("") }
    var selectedSalaryRange by remember { mutableStateOf<String?>(null) }
    var selectedTransferFee by remember { mutableStateOf<String?>(null) }
    var notes by remember { mutableStateOf("") }

    val filteredContacts = remember(contacts, selectedClub) {
        if (selectedClub == null) emptyList()
        else contacts.filter {
            it.clubName.equals(selectedClub?.clubName, ignoreCase = true)
        }
    }

    LaunchedEffect(clubSearchQuery) {
        if (clubSearchQuery.length < 2) {
            clubSearchResults = emptyList()
            return@LaunchedEffect
        }
        delay(350)
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

    ModalBottomSheet(
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        modifier = modifier.height(screenHeight * 0.9f),
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = HomeDarkCard,
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp)
                .navigationBarsPadding()
        ) {
            Text(
                stringResource(R.string.requests_add_title),
                style = boldTextStyle(HomeTextPrimary, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            Text(
                stringResource(R.string.requests_add_subtitle),
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                modifier = Modifier.padding(bottom = 8.dp)
            )
            HorizontalDivider(color = HomeDarkCardBorder, thickness = 1.dp)
            Spacer(Modifier.height(16.dp))

            Text(stringResource(R.string.requests_label_club), style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            OutlinedTextField(
                value = clubSearchQuery,
                onValueChange = {
                    clubSearchQuery = it
                    if (selectedClub != null && it != selectedClub?.clubName) selectedClub = null
                },
                placeholder = { Text(stringResource(R.string.requests_search_club), style = regularTextStyle(HomeTextSecondary, 14.sp)) },
                modifier = Modifier.fillMaxWidth(),
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
                        .heightIn(max = 180.dp)
                        .padding(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(clubSearchResults) { clubItem ->
                        ClubSearchResultRow(
                            club = clubItem,
                            onClick = {
                                selectedClub = clubItem
                                clubSearchQuery = ""
                                clubSearchResults = emptyList()
                            }
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
                            Text(c, style = regularTextStyle(HomeTextSecondary, 11.sp))
                        }
                    }
                    TextButton(onClick = { selectedClub = null; clubSearchQuery = "" }) {
                        Text(stringResource(R.string.requests_change_club), style = regularTextStyle(HomeTealAccent, 12.sp))
                    }
                }
            }

            AnimatedVisibility(
                visible = selectedClub != null,
                enter = fadeIn(tween(200)) + slideInVertically(
                    initialOffsetY = { -it / 4 },
                    animationSpec = tween(250)
                ),
                exit = fadeOut(tween(150)) + slideOutVertically(
                    targetOffsetY = { it / 4 },
                    animationSpec = tween(150)
                )
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Spacer(Modifier.height(20.dp))

                    Text(stringResource(R.string.requests_contact_optional), style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
                    if (filteredContacts.isNotEmpty()) {
                        LazyColumn(
                            modifier = Modifier.fillMaxWidth().heightIn(max = 120.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            items(filteredContacts) { contact ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(if (selectedContact?.id == contact.id) HomeTealAccent.copy(alpha = 0.2f) else HomeDarkBackground)
                                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
                                        .clickWithNoRipple { selectedContact = if (selectedContact?.id == contact.id) null else contact }
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
                        Text(stringResource(R.string.requests_no_contacts_for_club), style = regularTextStyle(HomeTextSecondary, 12.sp), modifier = Modifier.padding(bottom = 8.dp))
                    }

                    Spacer(Modifier.height(20.dp))

                    Text(stringResource(R.string.requests_label_position), style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                positions.forEach { pos ->
                    val posName = pos.name ?: ""
                    val isSelected = selectedPosition == posName
                    val bgColor = if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else androidx.compose.ui.graphics.Color.Transparent
                    val textColor = if (isSelected) HomeTealAccent else HomeTextSecondary
                    Text(
                        text = posName,
                        style = regularTextStyle(textColor, 12.sp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(bgColor)
                            .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(20.dp))
                            .clickWithNoRipple { selectedPosition = posName }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            Text(stringResource(R.string.requests_label_age), style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = ageDoesntMatter,
                    onCheckedChange = { ageDoesntMatter = it },
                    colors = CheckboxDefaults.colors(checkedColor = HomeTealAccent)
                )
                Text(stringResource(R.string.requests_age_doesnt_matter), style = regularTextStyle(HomeTextPrimary, 14.sp), modifier = Modifier.clickWithNoRipple { ageDoesntMatter = !ageDoesntMatter })
            }
            if (!ageDoesntMatter) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = minAge,
                        onValueChange = { minAge = it.filter { c -> c.isDigit() }.take(2) },
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
                        onValueChange = { maxAge = it.filter { c -> c.isDigit() }.take(2) },
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

            Text(stringResource(R.string.requests_label_salary_range), style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SalaryRangeOptions.all.forEach { range ->
                    val isSelected = selectedSalaryRange == range
                    Text(
                        text = range,
                        style = regularTextStyle(if (isSelected) HomeTealAccent else HomeTextSecondary, 12.sp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else androidx.compose.ui.graphics.Color.Transparent)
                            .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(20.dp))
                            .clickWithNoRipple { selectedSalaryRange = if (isSelected) null else range }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            Text(stringResource(R.string.requests_label_transfer_fee), style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TransferFeeOptions.all.forEach { fee ->
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
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else androidx.compose.ui.graphics.Color.Transparent)
                            .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(20.dp))
                            .clickWithNoRipple { selectedTransferFee = if (isSelected) null else fee }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            Text(stringResource(R.string.requests_notes_optional), style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
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
                    onClick = {
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
                                selectedSalaryRange,
                                selectedTransferFee,
                                notes.takeIf { it.isNotBlank() }
                            )
                        }
                    },
                    enabled = selectedClub != null && selectedPosition != null && selectedSalaryRange != null && selectedTransferFee != null,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HomeTealAccent,
                        contentColor = androidx.compose.ui.graphics.Color.White,
                        disabledContainerColor = HomeTealAccent.copy(alpha = 0.4f),
                        disabledContentColor = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f)
                    )
                ) {
                    Text(stringResource(R.string.requests_save_request), style = boldTextStyle(androidx.compose.ui.graphics.Color.White, 14.sp))
                }
            }
                }
            }
        }
    }
}

@Composable
private fun ClubSearchResultRow(club: ClubSearchModel, onClick: () -> Unit) {
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
                    Text(country, style = regularTextStyle(HomeTextSecondary, 12.sp))
                }
            }
        }
    }
}
