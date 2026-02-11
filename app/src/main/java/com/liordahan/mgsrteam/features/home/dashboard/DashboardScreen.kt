package com.liordahan.mgsrteam.features.home.dashboard

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.ContactPhone
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.home.DocumentReminder
import com.liordahan.mgsrteam.features.home.FeedFilter
import com.liordahan.mgsrteam.features.home.HomeDashboardState
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.features.home.models.AgentSummary
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.login.models.Account
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        // ── Sticky top section (does NOT scroll) ─────────────────────────
        GreetingHeader(state)
        StatsRow(state)
        QuickActionsRow(navController)

        // ── Scrollable section (from Recent Updates downward) ────────────
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .weight(1f),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // ── Activity Feed ────────────────────────────────────────────
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

            // ── Agent Overview ────────────────────────────────────────────
            if (state.agentSummaries.isNotEmpty()) {
                item { AgentOverviewSection(state.agentSummaries) }
            }

            // ── Agent Tasks ──────────────────────────────────────────────
            if (state.allAccounts.isNotEmpty()) {
                item {
                    AgentTasksSection(
                        accounts = state.allAccounts,
                        agentTasks = state.agentTasks,
                        expandedAgentId = state.expandedAgentId,
                        onToggleExpanded = { viewModel.toggleAgentExpanded(it) },
                        onToggleTask = { viewModel.toggleTaskCompleted(it) },
                        onAddTask = { agentId, agentName, title, dueDate ->
                            viewModel.addTask(agentId, agentName, title, dueDate)
                        },
                        onDeleteTask = { viewModel.deleteTask(it) }
                    )
                }
            }

            // ── Document Reminders ───────────────────────────────────────
            if (state.documentReminders.isNotEmpty()) {
                item { DocumentRemindersSection(state.documentReminders) }
            }
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
                icon = Icons.Default.People,
                label = "Players",
                color = HomeTealAccent,
                onClick = {
                    navController.navigate(Screens.PlayersScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            QuickActionChip(
                icon = Icons.Default.List,
                label = "Shortlist",
                color = HomeBlueAccent,
                onClick = {
                    navController.navigate(Screens.ShortlistScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            QuickActionChip(
                icon = Icons.Default.Search,
                label = "Releases",
                color = HomeOrangeAccent,
                onClick = {
                    navController.navigate(Screens.ReleasesScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            QuickActionChip(
                icon = Icons.Default.Autorenew,
                label = "Returnees",
                color = HomeRedAccent,
                onClick = {
                    navController.navigate(Screens.ReturneeScreen.route) {
                        launchSingleTop = true
                    }
                }
            )
        }
        item {
            QuickActionChip(
                icon = Icons.Default.ContactPhone,
                label = "Contacts",
                color = HomeTealAccent,
                onClick = {
                    navController.navigate(Screens.ContactsScreen.route) {
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
        FeedEvent.TYPE_MARKET_VALUE_CHANGE -> {
            val isDrop = isMarketValueDrop(event.oldValue, event.newValue)
            if (isDrop) {
                Triple(Icons.AutoMirrored.Filled.TrendingDown, HomeRedAccent, "Market Value Update")
            } else {
                Triple(Icons.AutoMirrored.Filled.TrendingUp, HomeGreenAccent, "Market Value Update")
            }
        }
        FeedEvent.TYPE_CLUB_CHANGE -> Triple(Icons.Default.SwapHoriz, HomeBlueAccent, "Club Change Detected")
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

private fun isMarketValueDrop(oldValue: String?, newValue: String?): Boolean {
    if (oldValue.isNullOrBlank() || newValue.isNullOrBlank()) return false
    val oldNum = oldValue.toMarketValueDouble()
    val newNum = newValue.toMarketValueDouble()
    return newNum < oldNum
}

private fun String.toMarketValueDouble(): Double {
    val lower = this.lowercase().trim().removePrefix("€").replace(",", "")
    return when {
        lower.endsWith("k") -> lower.removeSuffix("k").toDoubleOrNull()?.times(1_000) ?: 0.0
        lower.endsWith("m") -> lower.removeSuffix("m").toDoubleOrNull()?.times(1_000_000) ?: 0.0
        else -> lower.toDoubleOrNull() ?: 0.0
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
//  AGENT OVERVIEW  (original horizontal cards)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun AgentOverviewSection(agents: List<AgentSummary>) {
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
//  AGENT TASKS  (Expandable Vertical Cards)
// ═════════════════════════════════════════════════════════════════════════════

private val agentColors = listOf(
    HomeTealAccent, HomeBlueAccent, HomeOrangeAccent,
    HomePurpleAccent, HomeGreenAccent, HomeRedAccent
)

@Composable
private fun AgentTasksSection(
    accounts: List<Account>,
    agentTasks: Map<String, List<AgentTask>>,
    expandedAgentId: String?,
    onToggleExpanded: (String) -> Unit,
    onToggleTask: (AgentTask) -> Unit,
    onAddTask: (agentId: String, agentName: String, title: String, dueDate: Long) -> Unit,
    onDeleteTask: (AgentTask) -> Unit
) {
    var showAddDialogForAccount by remember { mutableStateOf<Account?>(null) }

    Column(modifier = Modifier.padding(top = 20.dp)) {
        // Section header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Agent Tasks",
                style = boldTextStyle(HomeTextPrimary, 18.sp),
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(Modifier.height(4.dp))

        // Teal accent line
        Box(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .width(40.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(HomeTealAccent)
        )

        Spacer(Modifier.height(14.dp))

        // Agent cards — one per account
        accounts.forEachIndexed { index, account ->
            val accountId = account.id ?: return@forEachIndexed
            val tasks = agentTasks[accountId] ?: emptyList()
            val isExpanded = expandedAgentId == accountId
            val accentColor = agentColors[index % agentColors.size]

            ExpandableAgentTaskCard(
                account = account,
                tasks = tasks,
                isExpanded = isExpanded,
                accentColor = accentColor,
                onToggleExpanded = { onToggleExpanded(accountId) },
                onToggleTask = onToggleTask,
                onAddTaskClick = { showAddDialogForAccount = account },
                onDeleteTask = onDeleteTask
            )

            if (index < accounts.lastIndex) {
                Spacer(Modifier.height(10.dp))
            }
        }
    }

    // Add-task dialog
    showAddDialogForAccount?.let { account ->
        AddTaskDialog(
            agentName = account.name ?: "Agent",
            onDismiss = { showAddDialogForAccount = null },
            onConfirm = { title, dueDate ->
                onAddTask(account.id ?: "", account.name ?: "", title, dueDate)
                showAddDialogForAccount = null
            }
        )
    }
}

// ── Expandable Card ──────────────────────────────────────────────────────────

@Composable
private fun ExpandableAgentTaskCard(
    account: Account,
    tasks: List<AgentTask>,
    isExpanded: Boolean,
    accentColor: Color,
    onToggleExpanded: () -> Unit,
    onToggleTask: (AgentTask) -> Unit,
    onAddTaskClick: () -> Unit,
    onDeleteTask: (AgentTask) -> Unit
) {
    val agentName = account.name ?: "Agent"
    val completedCount = tasks.count { it.isCompleted }
    val totalCount = tasks.size
    val progress = if (totalCount > 0) completedCount.toFloat() / totalCount else 0f

    val chevronRotation by animateFloatAsState(
        targetValue = if (isExpanded) 180f else 0f,
        animationSpec = tween(250),
        label = "chevron"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column {
            // ── Header (always visible) ──────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple { onToggleExpanded() }
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Avatar
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = agentName.take(1).uppercase(),
                        style = boldTextStyle(accentColor, 16.sp)
                    )
                }

                Spacer(Modifier.width(12.dp))

                // Name + subtitle
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = agentName,
                        style = boldTextStyle(HomeTextPrimary, 15.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (totalCount > 0) {
                        Text(
                            text = "$completedCount of $totalCount tasks done",
                            style = regularTextStyle(HomeTextSecondary, 11.sp)
                        )
                    } else {
                        Text(
                            text = "No tasks yet",
                            style = regularTextStyle(HomeTextSecondary, 11.sp)
                        )
                    }
                }

                // Circular progress ring
                if (totalCount > 0) {
                    CircularProgressRing(
                        progress = progress,
                        text = "$completedCount/$totalCount",
                        accentColor = accentColor,
                        modifier = Modifier.size(42.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                }

                // Chevron
                Icon(
                    imageVector = Icons.Default.KeyboardArrowDown,
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                    tint = HomeTextSecondary,
                    modifier = Modifier
                        .size(22.dp)
                        .rotate(chevronRotation)
                )
            }

            // ── Expanded content ─────────────────────────────────────────
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(animationSpec = tween(250)),
                exit = shrinkVertically(animationSpec = tween(250))
            ) {
                Column {
                    // Divider
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp)
                            .height(1.dp)
                            .background(HomeDarkCardBorder)
                    )

                    // Task list
                    if (tasks.isEmpty()) {
                        Text(
                            text = "No tasks yet. Tap + to add one.",
                            style = regularTextStyle(HomeTextSecondary, 12.sp),
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 16.dp)
                        )
                    } else {
                        Column(modifier = Modifier.padding(top = 4.dp, bottom = 4.dp)) {
                            // Show incomplete first, then completed
                            val sortedTasks = tasks.sortedWith(
                                compareBy<AgentTask> { it.isCompleted }.thenBy { it.dueDate }
                            )
                            sortedTasks.forEach { task ->
                                TaskRow(
                                    task = task,
                                    onToggle = { onToggleTask(task) },
                                    onDelete = { onDeleteTask(task) }
                                )
                            }
                        }
                    }

                    // Progress bar
                    if (totalCount > 0) {
                        val animatedProgress by animateFloatAsState(
                            targetValue = progress,
                            animationSpec = tween(400),
                            label = "progress"
                        )
                        LinearProgressIndicator(
                            progress = { animatedProgress },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = accentColor,
                            trackColor = HomeDarkCardBorder,
                        )
                        Spacer(Modifier.height(8.dp))
                    }

                    // + Add Task button
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 14.dp, end = 14.dp, bottom = 12.dp, top = 4.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(HomeTealAccent.copy(alpha = 0.12f))
                                .clickWithNoRipple { onAddTaskClick() }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = "Add Task",
                                tint = HomeTealAccent,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = "Add Task",
                                style = boldTextStyle(HomeTealAccent, 12.sp)
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Task Row ─────────────────────────────────────────────────────────────────

@Composable
private fun TaskRow(
    task: AgentTask,
    onToggle: () -> Unit,
    onDelete: () -> Unit
) {
    val dueDateStr = formatDueDate(task.dueDate)
    val dueDateColor = dueDateColor(task.dueDate, task.isCompleted)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 1.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = task.isCompleted,
            onCheckedChange = { onToggle() },
            colors = CheckboxDefaults.colors(
                checkedColor = HomeTealAccent,
                uncheckedColor = HomeTextSecondary,
                checkmarkColor = HomeDarkBackground
            ),
            modifier = Modifier.size(36.dp)
        )

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = task.title,
                style = if (task.isCompleted) {
                    regularTextStyle(
                        HomeTextSecondary.copy(alpha = 0.5f), 13.sp,
                        decoration = TextDecoration.LineThrough
                    )
                } else {
                    regularTextStyle(HomeTextPrimary, 13.sp)
                },
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        // Due-date chip
        if (task.dueDate > 0L) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(dueDateColor.copy(alpha = 0.15f))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    text = dueDateStr,
                    style = boldTextStyle(dueDateColor, 10.sp)
                )
            }
        }

        Spacer(Modifier.width(4.dp))

        // Delete
        Icon(
            imageVector = Icons.Default.Close,
            contentDescription = "Delete task",
            tint = HomeTextSecondary.copy(alpha = 0.4f),
            modifier = Modifier
                .size(18.dp)
                .clickWithNoRipple { onDelete() }
        )
    }
}

// ── Circular Progress Ring ───────────────────────────────────────────────────

@Composable
private fun CircularProgressRing(
    progress: Float,
    text: String,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(500),
        label = "ringProgress"
    )

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val stroke = 4.dp.toPx()
            val padding = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)

            // Track
            drawArc(
                color = HomeDarkCardBorder,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(padding, padding),
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round)
            )

            // Progress arc
            drawArc(
                color = accentColor,
                startAngle = -90f,
                sweepAngle = animatedProgress * 360f,
                useCenter = false,
                topLeft = Offset(padding, padding),
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round)
            )
        }

        Text(
            text = text,
            style = boldTextStyle(HomeTextPrimary, 9.sp)
        )
    }
}

// ── Add Task Dialog ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddTaskDialog(
    agentName: String,
    onDismiss: () -> Unit,
    onConfirm: (title: String, dueDate: Long) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var selectedDate by remember { mutableStateOf(0L) }
    var showDatePicker by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                // Title
                Text(
                    text = "New Task for $agentName",
                    style = boldTextStyle(HomeTextPrimary, 16.sp)
                )
                Spacer(Modifier.height(16.dp))

                // Task name field
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    placeholder = {
                        Text(
                            "Task description...",
                            style = regularTextStyle(HomeTextSecondary, 14.sp)
                        )
                    },
                    textStyle = regularTextStyle(HomeTextPrimary, 14.sp),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = HomeTealAccent,
                        unfocusedBorderColor = HomeDarkCardBorder,
                        cursorColor = HomeTealAccent,
                        focusedContainerColor = HomeDarkBackground,
                        unfocusedContainerColor = HomeDarkBackground
                    ),
                    singleLine = true
                )

                Spacer(Modifier.height(12.dp))

                // Due date picker button
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                        .background(HomeDarkBackground)
                        .clickWithNoRipple { showDatePicker = true }
                        .padding(horizontal = 14.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.CalendarToday,
                        contentDescription = null,
                        tint = if (selectedDate > 0) HomeTealAccent else HomeTextSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = if (selectedDate > 0L) {
                            SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(selectedDate))
                        } else {
                            "Select due date"
                        },
                        style = regularTextStyle(
                            if (selectedDate > 0) HomeTextPrimary else HomeTextSecondary,
                            14.sp
                        )
                    )
                }

                Spacer(Modifier.height(20.dp))

                // Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(
                            "Cancel",
                            style = boldTextStyle(HomeTextSecondary, 13.sp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (title.isNotBlank()) HomeTealAccent
                                else HomeTealAccent.copy(alpha = 0.3f)
                            )
                            .then(
                                if (title.isNotBlank()) Modifier.clickWithNoRipple {
                                    onConfirm(title.trim(), selectedDate)
                                } else Modifier
                            )
                            .padding(horizontal = 20.dp, vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Add Task",
                            style = boldTextStyle(HomeDarkBackground, 13.sp)
                        )
                    }
                }
            }
        }
    }

    // Date picker dialog
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { selectedDate = it }
                    showDatePicker = false
                }) {
                    Text("OK", style = boldTextStyle(HomeTealAccent, 14.sp))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text("Cancel", style = boldTextStyle(HomeTextSecondary, 14.sp))
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

// ── Due-date helpers ─────────────────────────────────────────────────────────

private fun formatDueDate(epochMillis: Long): String {
    if (epochMillis <= 0L) return ""
    val now = System.currentTimeMillis()
    val diffDays = ((epochMillis - now) / (24 * 60 * 60 * 1000)).toInt()
    return when {
        diffDays < -1 -> "${-diffDays}d overdue"
        diffDays == -1 -> "Yesterday"
        diffDays == 0 -> "Today"
        diffDays == 1 -> "Tomorrow"
        diffDays <= 7 -> "In ${diffDays}d"
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(epochMillis))
    }
}

private fun dueDateColor(epochMillis: Long, isCompleted: Boolean): Color {
    if (isCompleted) return HomeGreenAccent
    if (epochMillis <= 0L) return HomeTextSecondary
    val now = System.currentTimeMillis()
    val diffDays = ((epochMillis - now) / (24 * 60 * 60 * 1000)).toInt()
    return when {
        diffDays < 0 -> HomeRedAccent
        diffDays <= 2 -> HomeOrangeAccent
        diffDays <= 7 -> Color(0xFFFDD835) // yellow
        else -> HomeTextSecondary
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
