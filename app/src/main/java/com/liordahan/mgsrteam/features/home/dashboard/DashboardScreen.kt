package com.liordahan.mgsrteam.features.home.dashboard

import android.net.Uri
import androidx.compose.animation.animateColorAsState
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.home.DocumentReminder
import com.liordahan.mgsrteam.features.home.FeedFilter
import com.liordahan.mgsrteam.features.home.HomeDashboardState
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.features.home.models.AgentSummary
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.*
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

// ═════════════════════════════════════════════════════════════════════════════
//  DASHBOARD SCREEN
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun DashboardScreen(
    viewModel: IHomeScreenViewModel = koinViewModel(),
    navController: NavController
) {
    val state by viewModel.dashboardState.collectAsStateWithLifecycle()

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

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground),
        contentPadding = PaddingValues(bottom = 100.dp)
    ) {
        // ── Greeting ─────────────────────────────────────────────────────
        item { GreetingHeader(state) }

        // ── Stats Row ────────────────────────────────────────────────────
        item { StatsRow(state) }

        // ── Quick Actions ────────────────────────────────────────────────
        item { QuickActionsRow(navController) }

        // ── Activity Feed ────────────────────────────────────────────────
        item {
            FeedSectionHeader(
                selectedFilter = state.selectedFeedFilter,
                onFilterSelected = { viewModel.selectFeedFilter(it) }
            )
        }

        val filteredEvents = state.feedEvents.filterByType(state.selectedFeedFilter)
        if (filteredEvents.isEmpty()) {
            item {
                Text(
                    text = "No recent updates yet.\nUpdates will appear here after the daily sync.",
                    style = regularTextStyle(HomeTextSecondary, 13.sp, textAlign = TextAlign.Center),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp, horizontal = 16.dp)
                )
            }
        } else {
            items(filteredEvents.take(15)) { event ->
                FeedEventCard(event = event, navController = navController)
            }
        }

        // ── Agent Tasks ──────────────────────────────────────────────────
        if (state.agentSummaries.isNotEmpty()) {
            item { AgentTasksSection(state.agentSummaries) }
        }

        // ── Document Reminders ───────────────────────────────────────────
        if (state.documentReminders.isNotEmpty()) {
            item { DocumentRemindersSection(state.documentReminders) }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  GREETING
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun GreetingHeader(state: HomeDashboardState) {
    val dateStr = SimpleDateFormat("EEEE, MMM d, yyyy", Locale.getDefault()).format(Date())

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${state.greeting},",
                    style = regularTextStyle(HomeTextSecondary, 16.sp)
                )
                Text(
                    text = state.userName.ifEmpty { "Agent" },
                    style = boldTextStyle(HomeTextPrimary, 26.sp)
                )
            }
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCard)
                    .border(1.dp, HomeDarkCardBorder, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Notifications,
                    contentDescription = "Notifications",
                    tint = HomeTextSecondary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
        Text(
            text = dateStr,
            style = regularTextStyle(HomeTextSecondary, 13.sp),
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS ROW
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun StatsRow(state: HomeDashboardState) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.People,
            value = state.totalPlayers.toString(),
            label = "Players",
            accentColor = HomeTealAccent
        )
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.Handshake,
            value = state.withMandate.toString(),
            label = "Mandate",
            accentColor = HomeBlueAccent
        )
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.Warning,
            value = state.expiringSoon.toString(),
            label = "Expiring",
            accentColor = HomeOrangeAccent
        )
        StatCard(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.PersonOff,
            value = state.freeAgents.toString(),
            label = "Free",
            accentColor = HomeRedAccent
        )
    }
}

@Composable
private fun StatCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String,
    accentColor: Color
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = value,
                style = boldTextStyle(HomeTextPrimary, 20.sp)
            )
            Text(
                text = label,
                style = regularTextStyle(HomeTextSecondary, 11.sp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QUICK ACTIONS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun QuickActionsRow(navController: NavController) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(vertical = 14.dp)
    ) {
        item {
            QuickActionChip(
                icon = Icons.Default.Add,
                label = "Add Player",
                color = HomeTealAccent,
                onClick = { navController.navigate("${Screens.AddPlayerScreen.route}/") }
            )
        }
        item {
            QuickActionChip(
                icon = Icons.Default.Search,
                label = "Releases",
                color = HomeBlueAccent,
                onClick = {
                    navController.navigate(Screens.ReleasesScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            QuickActionChip(
                icon = Icons.Default.People,
                label = "Players",
                color = HomeOrangeAccent,
                onClick = {
                    navController.navigate(Screens.PlayersScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
    }
}

@Composable
private fun QuickActionChip(
    icon: ImageVector,
    label: String,
    color: Color,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(color.copy(alpha = 0.15f))
            .clickWithNoRipple { onClick() }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp)
        )
        Spacer(Modifier.width(6.dp))
        Text(text = label, style = boldTextStyle(color, 12.sp))
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  ACTIVITY FEED
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun FeedSectionHeader(
    selectedFilter: FeedFilter,
    onFilterSelected: (FeedFilter) -> Unit
) {
    Column(modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 10.dp)) {
        Text(
            text = "Recent Updates",
            style = boldTextStyle(HomeTextPrimary, 18.sp)
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FeedFilter.entries.forEach { filter ->
                val isSelected = filter == selectedFilter
                val bgColor by animateColorAsState(
                    targetValue = if (isSelected) HomeTealAccent else Color.Transparent,
                    label = "filterBg"
                )
                val textColor = if (isSelected) HomeDarkBackground else HomeTextSecondary

                Text(
                    text = filter.label,
                    style = boldTextStyle(textColor, 12.sp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(bgColor)
                        .then(
                            if (!isSelected) Modifier.border(
                                1.dp,
                                HomeDarkCardBorder,
                                RoundedCornerShape(16.dp)
                            ) else Modifier
                        )
                        .clickWithNoRipple { onFilterSelected(filter) }
                        .padding(horizontal = 14.dp, vertical = 6.dp)
                )
            }
        }
    }
}

@Composable
private fun FeedEventCard(event: FeedEvent, navController: NavController) {
    val (icon, accentColor, title) = when (event.type) {
        FeedEvent.TYPE_MARKET_VALUE_CHANGE -> Triple(Icons.AutoMirrored.Filled.TrendingUp, HomeGreenAccent, "Market Value Update")
        FeedEvent.TYPE_CLUB_CHANGE -> Triple(Icons.Default.People, HomeBlueAccent, "Club Change Detected")
        FeedEvent.TYPE_BECAME_FREE_AGENT -> Triple(Icons.Default.PersonOff, HomeRedAccent, "Became Free Agent")
        FeedEvent.TYPE_CONTRACT_EXPIRING -> Triple(Icons.Default.Warning, HomeOrangeAccent, "Contract Expiring")
        FeedEvent.TYPE_NOTE_ADDED -> Triple(Icons.AutoMirrored.Filled.NoteAdd, HomePurpleAccent, "New Note")
        FeedEvent.TYPE_PLAYER_ADDED -> Triple(Icons.Default.Add, HomeTealAccent, "Player Added")
        else -> Triple(Icons.Default.Notifications, HomeTextSecondary, "Update")
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickWithNoRipple {
                event.playerTmProfile?.let { tm ->
                    val encoded = Uri.encode(tm)
                    navController.navigate("${Screens.PlayerInfoScreen.route}/$encoded")
                }
            },
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Icon
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = boldTextStyle(accentColor, 11.sp)
                )
                Spacer(Modifier.height(2.dp))

                // Main text
                when (event.type) {
                    FeedEvent.TYPE_MARKET_VALUE_CHANGE -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        Text(
                            text = "Value changed from ${event.oldValue ?: "?"} to ${event.newValue ?: "?"}",
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                    FeedEvent.TYPE_CLUB_CHANGE, FeedEvent.TYPE_BECAME_FREE_AGENT -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        val clubText = buildString {
                            append("Moved from ${event.oldValue ?: "?"} to ")
                            append(event.newValue ?: "?")
                        }
                        Text(
                            text = clubText,
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                    FeedEvent.TYPE_NOTE_ADDED -> {
                        Text(
                            text = "${event.agentName ?: "Agent"} added a note on ${event.playerName ?: ""}",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        event.extraInfo?.let {
                            Text(
                                text = it,
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    else -> {
                        Text(
                            text = event.playerName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        event.extraInfo?.let {
                            Text(
                                text = it,
                                style = regularTextStyle(HomeTextSecondary, 12.sp)
                            )
                        }
                    }
                }
            }

            // Timestamp
            val timeAgo = event.timestamp?.let { formatTimeAgo(it) } ?: ""
            Text(
                text = timeAgo,
                style = regularTextStyle(HomeTextSecondary, 10.sp)
            )
        }
    }
}

private fun formatTimeAgo(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    val minutes = TimeUnit.MILLISECONDS.toMinutes(diff)
    val hours = TimeUnit.MILLISECONDS.toHours(diff)
    val days = TimeUnit.MILLISECONDS.toDays(diff)
    return when {
        minutes < 1 -> "Just now"
        minutes < 60 -> "${minutes}m ago"
        hours < 24 -> "${hours}h ago"
        days < 7 -> "${days}d ago"
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(timestamp))
    }
}

private fun List<FeedEvent>.filterByType(filter: FeedFilter): List<FeedEvent> {
    return when (filter) {
        FeedFilter.ALL -> this
        FeedFilter.VALUE_CHANGES -> filter { it.type == FeedEvent.TYPE_MARKET_VALUE_CHANGE }
        FeedFilter.TRANSFERS -> filter {
            it.type == FeedEvent.TYPE_CLUB_CHANGE || it.type == FeedEvent.TYPE_BECAME_FREE_AGENT
        }
        FeedFilter.NOTES -> filter { it.type == FeedEvent.TYPE_NOTE_ADDED }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  AGENT TASKS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun AgentTasksSection(agents: List<AgentSummary>) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(
            text = "Agent Overview",
            style = boldTextStyle(HomeTextPrimary, 18.sp),
            modifier = Modifier.padding(horizontal = 20.dp)
        )
        Spacer(Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(agents) { agent ->
                AgentCard(agent)
            }
        }
    }
}

@Composable
private fun AgentCard(agent: AgentSummary) {
    Card(
        modifier = Modifier.width(220.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Name
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(HomeTealAccent.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = agent.agentName.take(1).uppercase(),
                        style = boldTextStyle(HomeTealAccent, 14.sp)
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    text = agent.agentName,
                    style = boldTextStyle(HomeTextPrimary, 14.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(Modifier.height(12.dp))

            // Stats
            Text(
                text = "${agent.totalPlayers} players managed",
                style = regularTextStyle(HomeTextSecondary, 12.sp)
            )
            Spacer(Modifier.height(8.dp))

            // Mini stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                MiniStat(value = agent.withMandate.toString(), label = "Mandate", color = HomeBlueAccent)
                MiniStat(value = agent.expiringContracts.toString(), label = "Expiring", color = HomeOrangeAccent)
                MiniStat(value = agent.withNotes.toString(), label = "Notes", color = HomePurpleAccent)
            }
        }
    }
}

@Composable
private fun MiniStat(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, style = boldTextStyle(color, 14.sp))
        Text(text = label, style = regularTextStyle(HomeTextSecondary, 9.sp))
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DOCUMENT REMINDERS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun DocumentRemindersSection(reminders: List<DocumentReminder>) {
    Column(
        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Description,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = "Document Reminders",
                style = boldTextStyle(HomeTextPrimary, 16.sp)
            )
        }
        Spacer(Modifier.height(10.dp))

        reminders.forEach { reminder ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val dotColor = when {
                    reminder.isMissing -> HomeRedAccent
                    (reminder.daysUntilExpiry ?: 0) <= 7 -> HomeRedAccent
                    (reminder.daysUntilExpiry ?: 0) <= 15 -> HomeOrangeAccent
                    else -> Color(0xFFFDD835) // yellow
                }

                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(dotColor)
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = reminder.playerName,
                    style = boldTextStyle(HomeTextPrimary, 13.sp)
                )
                Text(
                    text = " – ",
                    style = regularTextStyle(HomeTextSecondary, 13.sp)
                )
                Text(
                    text = if (reminder.isMissing) {
                        "${reminder.documentType} missing"
                    } else {
                        "${reminder.documentType} expires in ${reminder.daysUntilExpiry}d"
                    },
                    style = regularTextStyle(HomeTextSecondary, 13.sp),
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}
