package com.liordahan.mgsrteam.features.requests

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Whatsapp
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
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.navigation.Screens
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.repository.IContactsRepository
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.requests.models.PositionDisplayNames
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions
import com.liordahan.mgsrteam.features.requests.models.TransferFeeOptions
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
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
import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
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

    val snackbarHostState = remember { SnackbarHostState() }

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
                Icon(Icons.Default.Add, contentDescription = "Add request", modifier = Modifier.size(24.dp))
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
                    onBackClick = { navController.popBackStack() }
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
                            state.requestsByPositionCountry.keys.forEachIndexed { index, position ->
                                if (index > 0) {
                                    item(key = "divider_$position") {
                                        HorizontalDivider(
                                            modifier = Modifier.padding(vertical = 8.dp),
                                            color = HomeDarkCardBorder,
                                            thickness = 1.dp
                                        )
                                    }
                                }
                                val countries = state.requestsByPositionCountry[position] ?: emptyMap()
                                val positionCount = countries.values.sumOf { it.size }
                                item(key = "pos_$position") {
                                    PositionSectionHeader(
                                        position = position,
                                        count = positionCount
                                    )
                                }
                                countries.forEach { (country, requests) ->
                                    item(key = "country_${position}_$country") {
                                        CountrySectionHeader(
                                            country = country,
                                            countryFlag = requests.firstOrNull()?.clubCountryFlag
                                        )
                                        Spacer(Modifier.height(6.dp))
                                    }
                                    items(requests, key = { it.id ?: it.hashCode().toString() }) { request ->
                                        val matchingPlayers = state.matchingPlayersByRequestId[request.id ?: ""] ?: emptyList()
                                        val isExpanded = (request.id ?: "") in expandedRequestIds
                                        RequestCard(
                                            request = request,
                                            matchingPlayers = matchingPlayers,
                                            isExpanded = isExpanded,
                                            onToggleExpand = {
                                                val id = request.id ?: return@RequestCard
                                                expandedRequestIds = if (isExpanded) expandedRequestIds - id else expandedRequestIds + id
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
                    title = { Text("Delete request", style = boldTextStyle(HomeTextPrimary, 18.sp)) },
                    text = {
                        Text(
                            "Delete request for ${req.clubName} (${req.position})?",
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
                            Text("Delete", style = boldTextStyle(HomeTextPrimary, 14.sp))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { requestToDelete = null }) {
                            Text("Cancel", style = regularTextStyle(HomeTextSecondary, 14.sp))
                        }
                    },
                    containerColor = HomeDarkCard
                )
            }
        }
    }
}

@Composable
private fun RequestsHeader(onAddClick: () -> Unit, onBackClick: () -> Unit) {
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
            Text("Requests", style = boldTextStyle(HomeTextPrimary, 26.sp))
            Text(
                "Player requests from clubs by position",
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        IconButton(onClick = onAddClick, modifier = Modifier.size(40.dp)) {
            Icon(Icons.Default.Add, contentDescription = "Add request", tint = HomeTealAccent)
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
        StatItem(value = total.toString(), label = "Total", accentColor = HomeTealAccent, modifier = Modifier.weight(1f))
        Box(modifier = Modifier.width(1.dp).height(24.dp).background(HomeDarkCardBorder))
        StatItem(value = positions.toString(), label = "Positions", accentColor = HomeOrangeAccent, modifier = Modifier.weight(1f))
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
private fun CountrySectionHeader(country: String, countryFlag: String?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 8.dp, top = 12.dp, bottom = 4.dp),
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
        Text(
            country,
            style = boldTextStyle(HomeTextSecondary, 13.sp)
        )
    }
}

@Composable
private fun PositionSectionHeader(position: String, count: Int) {
    val longName = PositionDisplayNames.toLongName(position)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp, horizontal = 0.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(HomeTealAccent.copy(alpha = 0.15f))
                .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Text(position, style = boldTextStyle(HomeTealAccent, 14.sp))
        }
        Spacer(Modifier.width(10.dp))
        Text(longName, style = boldTextStyle(HomeTextPrimary, 18.sp))
        Spacer(Modifier.weight(1f))
        Text("($count)", style = regularTextStyle(HomeTextSecondary, 14.sp))
    }
}

@Composable
private fun RequestCard(
    request: Request,
    matchingPlayers: List<Player>,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    onPlayerClick: (Player) -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp)
            .clickWithNoRipple { },
        shape = RoundedCornerShape(16.dp),
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
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    request.clubLogo?.let { logo ->
                        AsyncImage(
                            model = logo,
                            contentDescription = null,
                            modifier = Modifier.size(36.dp),
                            contentScale = ContentScale.Fit
                        )
                        Spacer(Modifier.width(12.dp))
                    }
                    if (request.clubLogo == null) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(HomeDarkCardBorder),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                (request.clubName?.take(2) ?: "?").uppercase(),
                                style = boldTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(request.clubName ?: "", style = boldTextStyle(HomeTextPrimary, 14.sp))
                        Text(
                            request.clubCountry ?: "",
                            style = regularTextStyle(HomeTextSecondary, 11.sp),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                val ageInfo = when {
                    request.ageDoesntMatter == true -> "Age: Any"
                    request.minAge != null && request.maxAge != null && request.minAge > 0 && request.maxAge > 0 ->
                        "Age: ${request.minAge}-${request.maxAge}"
                    else -> ""
                }
                val salaryInfo = request.salaryRange?.takeIf { it.isNotBlank() }?.let { "Salary: $it" } ?: ""
                val transferFeeInfo = request.transferFee?.takeIf { it.isNotBlank() }?.let { "Fee: $it" } ?: ""
                val extraInfo = listOfNotNull(ageInfo.takeIf { it.isNotBlank() }, salaryInfo, transferFeeInfo).joinToString(" • ")
                Text(
                    text = if (!request.contactName.isNullOrBlank()) {
                        "Via ${request.contactName} • ${formatDate(request.createdAt)}"
                    } else {
                        "Direct request • ${formatDate(request.createdAt)}"
                    },
                    style = regularTextStyle(HomeTextSecondary, 11.sp),
                    modifier = Modifier.padding(start = 48.dp)
                )
                if (extraInfo.isNotBlank()) {
                    Text(
                        text = extraInfo,
                        style = regularTextStyle(HomeTextSecondary, 10.sp),
                        modifier = Modifier.padding(start = 48.dp, top = 2.dp)
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 48.dp)
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Spacer(Modifier.weight(1f))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        request.contactPhoneNumber?.takeIf { it.isNotBlank() }?.let { phone ->
                            val context = LocalContext.current
                            IconButton(
                                onClick = {
                                    val uri = "https://wa.me/${phone.filter { it.isDigit() }}".toUri()
                                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    Icons.Default.Whatsapp,
                                    contentDescription = "WhatsApp",
                                    tint = HomeTealAccent,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                        IconButton(
                            onClick = onDelete,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = HomeRedAccent,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
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
                        text = "${matchingPlayers.size} matching player${if (matchingPlayers.size == 1) "" else "s"}",
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
                if (isExpanded) {
                    if (matchingPlayers.isEmpty()) {
                        Text(
                            text = "No roster players match this request",
                            style = regularTextStyle(HomeTextSecondary, 12.sp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(HomeDarkBackground)
                                .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                                .padding(12.dp)
                        )
                    } else {
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
private fun MatchingPlayerRow(
    player: Player,
    onClick: () -> Unit
) {
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
            "No requests yet",
            style = boldTextStyle(HomeTextPrimary, 18.sp)
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Add requests from clubs when they ask for players. Tap + to add your first request.",
            style = regularTextStyle(HomeTextSecondary, 13.sp)
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onAddClick,
            colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text("Add request", style = boldTextStyle(HomeDarkBackground, 14.sp))
        }
    }
}

private fun formatDate(timestamp: Long?): String {
    if (timestamp == null) return ""
    return SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(timestamp))
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
                "Add Request",
                style = boldTextStyle(HomeTextPrimary, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            Text(
                "Search club on Transfermarkt, then select position",
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                modifier = Modifier.padding(bottom = 8.dp)
            )
            HorizontalDivider(color = HomeDarkCardBorder, thickness = 1.dp)
            Spacer(Modifier.height(16.dp))

            Text("CLUB", style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            OutlinedTextField(
                value = clubSearchQuery,
                onValueChange = {
                    clubSearchQuery = it
                    if (selectedClub != null && it != selectedClub?.clubName) selectedClub = null
                },
                placeholder = { Text("Search club...", style = regularTextStyle(HomeTextSecondary, 14.sp)) },
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
                        Text("Change", style = regularTextStyle(HomeTealAccent, 12.sp))
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            Text("CONTACT (optional)", style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            if (selectedClub != null && filteredContacts.isNotEmpty()) {
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
            } else if (selectedClub != null) {
                Text("No contacts for this club", style = regularTextStyle(HomeTextSecondary, 12.sp), modifier = Modifier.padding(bottom = 8.dp))
            }

            Spacer(Modifier.height(20.dp))

            Text("POSITION", style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
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

            Text("AGE", style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = ageDoesntMatter,
                    onCheckedChange = { ageDoesntMatter = it },
                    colors = CheckboxDefaults.colors(checkedColor = HomeTealAccent)
                )
                Text("Doesn't matter", style = regularTextStyle(HomeTextPrimary, 14.sp), modifier = Modifier.clickWithNoRipple { ageDoesntMatter = !ageDoesntMatter })
            }
            if (!ageDoesntMatter) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = minAge,
                        onValueChange = { minAge = it.filter { c -> c.isDigit() }.take(2) },
                        placeholder = { Text("Min", style = regularTextStyle(HomeTextSecondary, 14.sp)) },
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
                        placeholder = { Text("Max", style = regularTextStyle(HomeTextSecondary, 14.sp)) },
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

            Text("SALARY RANGE", style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
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

            Text("TRANSFER FEE", style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TransferFeeOptions.all.forEach { fee ->
                    val isSelected = selectedTransferFee == fee
                    Text(
                        text = fee,
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

            Text("NOTES (optional)", style = regularTextStyle(HomeTextSecondary, 11.sp), modifier = Modifier.padding(bottom = 10.dp))
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                placeholder = { Text("Additional notes...", style = regularTextStyle(HomeTextSecondary, 14.sp)) },
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
                    Text("Cancel", style = regularTextStyle(HomeTextSecondary, 14.sp))
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
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent)
                ) {
                    Text("Save Request", style = boldTextStyle(HomeDarkBackground, 14.sp))
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
