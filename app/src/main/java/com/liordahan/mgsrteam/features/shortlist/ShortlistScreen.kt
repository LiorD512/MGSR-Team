package com.liordahan.mgsrteam.features.shortlist

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.ui.window.Dialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.add.AddPlayerContactFormContent
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.navigation.Screens
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
import org.koin.androidx.compose.koinViewModel

// ═════════════════════════════════════════════════════════════════════════════
//  URL PARSING (for legacy entries without enriched data)
// ═════════════════════════════════════════════════════════════════════════════

private fun extractPlayerIdFromUrl(url: String): String? {
    return try {
        val parts = url.trim().split("/")
        val spielerIndex = parts.indexOfLast { it.equals("spieler", ignoreCase = true) }
        if (spielerIndex >= 0 && spielerIndex < parts.lastIndex) {
            parts[spielerIndex + 1].takeIf { it.all(Char::isDigit) }
        } else {
            parts.lastOrNull()?.takeIf { it.all(Char::isDigit) }
        }
    } catch (_: Exception) {
        null
    }
}

private fun formatShortlistProfileDisplay(entry: ShortlistEntry): String {
    entry.playerName?.takeIf { it.isNotBlank() }?.let { return it }
    val id = extractPlayerIdFromUrl(entry.tmProfileUrl)
    return if (id != null) "Profile #$id" else entry.tmProfileUrl.take(40)
        .let { if (it.length == entry.tmProfileUrl.length) it else "$it…" }
}

private fun formatRelativeDate(addedAt: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - addedAt
    val days = diff / (24 * 60 * 60 * 1000)
    val weeks = days / 7
    return when {
        days < 1 -> "Added today"
        days == 1L -> "Added yesterday"
        days < 7 -> "Added $days days ago"
        weeks == 1L -> "Added 1 week ago"
        weeks < 4 -> "Added $weeks weeks ago"
        else -> "Added ${days / 30} months ago"
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHORTLIST SCREEN
// ═════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShortlistScreen(
    navController: NavController,
    viewModel: IShortlistViewModel = koinViewModel<ShortlistViewModel>(),
    addPlayerViewModel: IAddPlayerViewModel = koinViewModel()
) {
    val state by viewModel.shortlistFlow.collectAsState()
    val context = LocalContext.current
    val oneWeekAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000)
    val thisWeekCount = state.entries.count { it.addedAt >= oneWeekAgo }

    var showAddPlayerBottomSheet by remember { mutableStateOf(false) }
    var addPlayerTmUrl by remember { mutableStateOf<String?>(null) }
    var entryToDelete by remember { mutableStateOf<ShortlistEntry?>(null) }

    val addPlayerState = addPlayerViewModel.playerSearchStateFlow.collectAsState()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsState()
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsState()

    LaunchedEffect(showAddPlayerBottomSheet, addPlayerTmUrl) {
        if (showAddPlayerBottomSheet && !addPlayerTmUrl.isNullOrBlank()) {
            addPlayerViewModel.loadPlayerByTmProfileUrl(addPlayerTmUrl!!)
        }
    }

    LaunchedEffect(isPlayerAdded) {
        if (isPlayerAdded) {
            addPlayerTmUrl?.let { url -> viewModel.removeByUrl(url) }
            showAddPlayerBottomSheet = false
            addPlayerTmUrl = null
            addPlayerViewModel.resetAfterAdd()
        }
    }

    if (state.isLoading) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(HomeDarkBackground),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = HomeTealAccent, strokeWidth = 3.dp)
        }
        return
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            ShortlistHeader(
                onAddClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") },
                onBackClicked = { navController.popBackStack() }
            )

            ShortlistStatsStrip(
                total = state.entries.size,
                thisWeek = thisWeekCount
            )

            if (state.entries.isEmpty()) {
                ShortlistEmptyState(
                    onBrowseReleases = { navController.navigate(Screens.ReleasesScreen.route) },
                    onBrowseReturnees = { navController.navigate(Screens.ReturneeScreen.route) }
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 100.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.entries) { entry ->
                        ShortlistCard(
                            entry = entry,
                            onAddToAgency = {
                                addPlayerTmUrl = entry.tmProfileUrl
                                showAddPlayerBottomSheet = true
                            },
                            onOpenTm = {
                                context.startActivity(
                                    Intent(
                                        Intent.ACTION_VIEW,
                                        entry.tmProfileUrl.toUri()
                                    )
                                )
                            },
                            onRemove = { entryToDelete = entry }
                        )
                    }
                }
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

        entryToDelete?.let { entry ->
            DeleteShortlistDialog(
                onDismissRequest = { entryToDelete = null },
                onRemoveClicked = {
                    viewModel.remove(entry)
                    entryToDelete = null
                }
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistHeader(
    onAddClick: () -> Unit,
    onBackClicked: () -> Unit
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
                .clickWithNoRipple { onBackClicked() }
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Shortlist",
                style = boldTextStyle(HomeTextPrimary, 26.sp)
            )
            Text(
                text = "Saved profiles from Releases & Returnees — add to agency when ready",
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        IconButton(
            onClick = onAddClick,
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = "Add player",
                tint = HomeTealAccent
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS STRIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistStatsStrip(
    total: Int,
    thisWeek: Int
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        ShortlistStatItem(
            value = total.toString(),
            label = "Total",
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        ShortlistStatsStripDivider()
        ShortlistStatItem(
            value = thisWeek.toString(),
            label = "This Week",
            accentColor = HomeOrangeAccent,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ShortlistStatItem(
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

@Composable
private fun ShortlistStatsStripDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .padding(vertical = 4.dp)
            .background(HomeDarkCardBorder)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHORTLIST CARD (rich layout like ReleaseListItem)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistCard(
    entry: ShortlistEntry,
    onAddToAgency: () -> Unit,
    onOpenTm: () -> Unit,
    onRemove: () -> Unit
) {
    val release = entry.toLatestTransferModel()
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple(onClick = onOpenTm),
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
                        size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height)
                    )
                }
        ) {
            // Top row: Avatar + Name/Position/Age/Nationality + Value
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (!release.playerImage.isNullOrBlank()) {
                    AsyncImage(
                        model = release.playerImage,
                        contentDescription = null,
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .border(2.dp, HomeDarkCardBorder, CircleShape),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .background(HomeDarkCardBorder),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = HomeTextSecondary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .align(Alignment.CenterVertically)
                ) {
                    Text(
                        text = formatShortlistProfileDisplay(entry),
                        style = boldTextStyle(HomeTextPrimary, 14.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(
                        modifier = Modifier.padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        release.playerPosition?.takeIf { it.isNotBlank() }?.let { pos ->
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
                        release.playerAge?.takeIf { it.isNotBlank() }?.let { age ->
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
                                release.playerNationality?.takeIf { it.isNotBlank() }?.let { nat ->
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

                Column(
                    modifier = Modifier.align(Alignment.Top),
                    horizontalAlignment = Alignment.End
                ) {
                    release.marketValue?.takeIf { it.isNotBlank() }?.let { value ->
                        Text(
                            text = value,
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                    }
                    Text(
                        text = formatRelativeDate(entry.addedAt),
                        style = regularTextStyle(HomeTextSecondary, 10.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }

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
                        .background(HomeTealAccent.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = "Shortlisted",
                        style = boldTextStyle(HomeTealAccent, 10.sp)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(
                        onClick = onAddToAgency,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.PersonAdd,
                            contentDescription = "Add to agency",
                            tint = HomeTealAccent
                        )
                    }
                    IconButton(
                        onClick = onOpenTm,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Link,
                            contentDescription = "Open TM",
                            tint = HomeTextSecondary
                        )
                    }
                    IconButton(
                        onClick = onRemove,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Remove",
                            tint = HomeRedAccent
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE SHORTLIST DIALOG
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun DeleteShortlistDialog(
    onDismissRequest: () -> Unit,
    onRemoveClicked: () -> Unit
) {
    Dialog(onDismissRequest = onDismissRequest) {
        Card(
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = "Remove this player from your shortlist?",
                    style = boldTextStyle(HomeTextPrimary, 16.sp),
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(24.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    Box(
                        modifier = Modifier
                            .background(
                                HomeDarkCard,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(100.dp))
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Cancel",
                            style = boldTextStyle(HomeTextPrimary, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDismissRequest() }
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                HomeRedAccent,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Remove",
                            style = boldTextStyle(Color.White, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onRemoveClicked() }
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  EMPTY STATE
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ShortlistEmptyState(
    onBrowseReleases: () -> Unit,
    onBrowseReturnees: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.BookmarkBorder,
            contentDescription = null,
            tint = HomeTextSecondary.copy(alpha = 0.5f),
            modifier = Modifier.size(72.dp)
        )
        Spacer(Modifier.height(20.dp))
        Text(
            text = "No players in shortlist",
            style = boldTextStyle(HomeTextPrimary, 18.sp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = "Add players from Releases or Returnees to save them for later. When ready, add them to your agency.",
            style = regularTextStyle(HomeTextSecondary, 13.sp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(Modifier.height(28.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(HomeTealAccent)
                    .clickWithNoRipple(onClick = onBrowseReleases)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Browse Releases",
                    style = boldTextStyle(Color.White, 14.sp)
                )
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp))
                    .clickWithNoRipple(onClick = onBrowseReturnees)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Browse Returnees",
                    style = boldTextStyle(HomeTextPrimary, 14.sp)
                )
            }
        }
    }
}
