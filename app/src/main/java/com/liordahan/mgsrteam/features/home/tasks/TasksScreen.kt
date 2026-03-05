package com.liordahan.mgsrteam.features.home.tasks

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.utils.daysBetweenCalendarDays
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class TaskViewMode { TIMELINE, BY_AGENT }

private enum class TaskTimeFilter { ALL, TODAY, WEEK, OVERDUE }

private val agentAccentColors = listOf(
    PlatformColors.palette.accent, PlatformColors.palette.blue, PlatformColors.palette.orange,
    PlatformColors.palette.purple, PlatformColors.palette.green, PlatformColors.palette.red
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(
    navController: NavController,
    viewModel: IHomeScreenViewModel
) {
    val state by viewModel.dashboardState.collectAsStateWithLifecycle()
    val allTasks = remember(state.agentTasks) { state.agentTasks.values.flatten() }
    val accounts = state.allAccounts
    val context = LocalContext.current

    var viewMode by remember { mutableStateOf(TaskViewMode.TIMELINE) }
    var timeFilter by remember { mutableStateOf(TaskTimeFilter.ALL) }
    var selectedAgentIndex by remember { mutableIntStateOf(0) }
    var showAddSheet by remember { mutableStateOf(false) }

    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    val undoLabel = stringResource(R.string.tasks_undo)
    val deletedLabel = stringResource(R.string.tasks_deleted)

    Scaffold(
        containerColor = PlatformColors.palette.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.tasks_title),
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 20.sp)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                            tint = PlatformColors.palette.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PlatformColors.palette.background)
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddSheet = true },
                containerColor = PlatformColors.palette.accent,
                contentColor = PlatformColors.palette.background,
                shape = CircleShape,
                modifier = Modifier.size(56.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.tasks_new_task), tint = Color.White)
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // View mode toggle
            ViewModeToggle(
                current = viewMode,
                onSelect = { viewMode = it },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )

            when (viewMode) {
                TaskViewMode.TIMELINE -> {
                    // Filter chips
                    TimeFilterChips(
                        current = timeFilter,
                        onSelect = { timeFilter = it },
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    val filteredTasks = remember(allTasks, timeFilter) {
                        filterTasks(allTasks, timeFilter)
                    }

                    val sectionLabels = TaskSectionLabels(
                        overdue = stringResource(R.string.tasks_overdue),
                        today = stringResource(R.string.tasks_section_today),
                        tomorrow = stringResource(R.string.tasks_section_tomorrow),
                        week = stringResource(R.string.tasks_section_this_week),
                        later = stringResource(R.string.tasks_section_later),
                        noDate = stringResource(R.string.tasks_section_no_date),
                        completed = stringResource(R.string.tasks_section_completed)
                    )

                    val grouped = remember(filteredTasks, sectionLabels) {
                        groupTasksByDate(filteredTasks, sectionLabels)
                    }

                    if (filteredTasks.isEmpty()) {
                        EmptyTasksState(
                            modifier = Modifier
                                .fillMaxSize()
                                .weight(1f)
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(bottom = 88.dp)
                        ) {
                            grouped.forEach { (section, tasks) ->
                                item(key = "header_$section") {
                                    Text(
                                        text = section,
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 13.sp),
                                        modifier = Modifier.padding(
                                            start = 20.dp, end = 20.dp,
                                            top = 16.dp, bottom = 6.dp
                                        )
                                    )
                                }
                                items(tasks, key = { it.id }) { task ->
                                    SwipeableTaskRow(
                                        task = task,
                                        showAgent = true,
                                        navController = navController,
                                        onToggle = { viewModel.toggleTaskCompleted(task) },
                                        onDelete = {
                                            viewModel.deleteTask(task)
                                            scope.launch {
                                                val result = snackbarHostState.showSnackbar(
                                                    message = deletedLabel,
                                                    actionLabel = undoLabel,
                                                    duration = SnackbarDuration.Short
                                                )
                                                if (result == SnackbarResult.ActionPerformed) {
                                                    viewModel.addTask(
                                                        task.agentId, task.agentName,
                                                        task.title, task.dueDate,
                                                        task.priority, task.notes,
                                                        task.playerId, task.playerName, task.playerTmProfile, task.templateId
                                                    )
                                                }
                                            }
                                        },
                                        onClick = {
                                            navController.navigate(Screens.taskDetailRoute(task.id))
                                        }
                                    )
                                }
                            }
                        }
                    }
                }

                TaskViewMode.BY_AGENT -> {
                    if (accounts.isEmpty()) {
                        EmptyTasksState(modifier = Modifier.fillMaxSize())
                    } else {
                        // Agent selector
                        AgentSelector(
                            accounts = accounts,
                            selectedIndex = selectedAgentIndex,
                            onSelect = { selectedAgentIndex = it },
                            modifier = Modifier.padding(vertical = 8.dp)
                        )

                        val selectedAccount = accounts.getOrNull(selectedAgentIndex)
                        val agentId = selectedAccount?.id ?: ""
                        val agentTasks = state.agentTasks[agentId] ?: emptyList()
                        val completedCount = agentTasks.count { it.isCompleted }

                        // Progress
                        if (agentTasks.isNotEmpty()) {
                            AgentProgressBar(
                                completed = completedCount,
                                total = agentTasks.size,
                                accentColor = agentAccentColors[selectedAgentIndex % agentAccentColors.size],
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }

                        val sortedTasks = remember(agentTasks) {
                            agentTasks.sortedWith(
                                compareBy<AgentTask> { it.isCompleted }.thenBy { it.dueDate }
                            )
                        }

                        if (sortedTasks.isEmpty()) {
                            EmptyTasksState(modifier = Modifier.fillMaxSize().weight(1f))
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(bottom = 88.dp)
                            ) {
                                items(sortedTasks, key = { it.id }) { task ->
                                    SwipeableTaskRow(
                                        task = task,
                                        showAgent = false,
                                        navController = navController,
                                        onToggle = { viewModel.toggleTaskCompleted(task) },
                                        onDelete = {
                                            viewModel.deleteTask(task)
                                            scope.launch {
                                                val result = snackbarHostState.showSnackbar(
                                                    message = deletedLabel,
                                                    actionLabel = undoLabel,
                                                    duration = SnackbarDuration.Short
                                                )
                                                if (result == SnackbarResult.ActionPerformed) {
                                                    viewModel.addTask(
                                                        task.agentId, task.agentName,
                                                        task.title, task.dueDate,
                                                        task.priority, task.notes,
                                                        task.playerId, task.playerName, task.playerTmProfile, task.templateId
                                                    )
                                                }
                                            }
                                        },
                                        onClick = {
                                            navController.navigate(Screens.taskDetailRoute(task.id))
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddSheet) {
        val currentUser = state.currentUserAccount
        val preselectedIndex = accounts.indexOfFirst { it.id == currentUser?.id }.takeIf { it >= 0 } ?: 0
        AddTaskBottomSheet(
            accounts = accounts,
            preselectedAgentIndex = preselectedIndex,
            onDismiss = { showAddSheet = false },
            onConfirm = { agentId, agentName, title, dueDate, priority, notes ->
                viewModel.addTask(agentId, agentName, title, dueDate, priority, notes)
                showAddSheet = false
            }
        )
    }
}

// ── View Mode Toggle ─────────────────────────────────────────────────────────

@Composable
private fun ViewModeToggle(
    current: TaskViewMode,
    onSelect: (TaskViewMode) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(PlatformColors.palette.card),
        horizontalArrangement = Arrangement.Center
    ) {
        val modes = listOf(
            TaskViewMode.TIMELINE to R.string.tasks_filter_timeline,
            TaskViewMode.BY_AGENT to R.string.tasks_filter_by_agent
        )
        modes.forEach { (mode, labelRes) ->
            val selected = mode == current
            val bgColor by animateColorAsState(
                if (selected) PlatformColors.palette.accent else Color.Transparent,
                label = "toggle_bg"
            )
            val textColor by animateColorAsState(
                if (selected) PlatformColors.palette.background else PlatformColors.palette.textSecondary,
                label = "toggle_text"
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(bgColor)
                    .clickable { onSelect(mode) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(labelRes),
                    style = boldTextStyle(textColor, 14.sp)
                )
            }
        }
    }
}

// ── Time Filter Chips ────────────────────────────────────────────────────────

@Composable
private fun TimeFilterChips(
    current: TaskTimeFilter,
    onSelect: (TaskTimeFilter) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        val filters = listOf(
            TaskTimeFilter.ALL to R.string.tasks_filter_all,
            TaskTimeFilter.TODAY to R.string.tasks_filter_today,
            TaskTimeFilter.WEEK to R.string.tasks_filter_week,
            TaskTimeFilter.OVERDUE to R.string.tasks_filter_overdue
        )
        items(filters) { (filter, labelRes) ->
            val selected = filter == current
            val bgColor by animateColorAsState(
                if (selected) PlatformColors.palette.accent else PlatformColors.palette.card,
                label = "chip_bg"
            )
            val textColor by animateColorAsState(
                if (selected) PlatformColors.palette.background else PlatformColors.palette.textSecondary,
                label = "chip_text"
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(bgColor)
                    .clickable { onSelect(filter) }
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text(
                    text = stringResource(labelRes),
                    style = boldTextStyle(textColor, 13.sp)
                )
            }
        }
    }
}

// ── Agent Selector ───────────────────────────────────────────────────────────

@Composable
private fun AgentSelector(
    accounts: List<Account>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(accounts.size) { index ->
            val account = accounts[index]
            val selected = index == selectedIndex
            val accentColor = agentAccentColors[index % agentAccentColors.size]
            val name = account.getDisplayName(context).ifEmpty { account.name ?: "" }
            val borderColor by animateColorAsState(
                if (selected) accentColor else Color.Transparent,
                label = "agent_border"
            )

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .clickable { onSelect(index) }
                    .padding(4.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(
                            if (selected) accentColor.copy(alpha = 0.2f)
                            else PlatformColors.palette.card
                        )
                        .then(
                            if (selected) Modifier.background(Color.Transparent)
                            else Modifier
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(accentColor.copy(alpha = if (selected) 0.25f else 0.1f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = name.take(1).uppercase(),
                            style = boldTextStyle(accentColor, 18.sp)
                        )
                    }
                    if (selected) {
                        Canvas(modifier = Modifier.matchParentSize()) {
                            drawCircle(
                                color = accentColor,
                                style = Stroke(width = 2.dp.toPx()),
                                radius = size.minDimension / 2 - 1.dp.toPx()
                            )
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = name,
                    style = regularTextStyle(
                        if (selected) PlatformColors.palette.textPrimary else PlatformColors.palette.textSecondary,
                        11.sp
                    ),
                    maxLines = 1
                )
            }
        }
    }
}

// ── Agent Progress Bar ───────────────────────────────────────────────────────

@Composable
private fun AgentProgressBar(
    completed: Int,
    total: Int,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    val progress = if (total > 0) completed.toFloat() / total else 0f
    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(400),
        label = "agent_progress"
    )

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = stringResource(R.string.tasks_completed_count, completed, total),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
            )
        }
        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { animatedProgress },
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp)),
            color = accentColor,
            trackColor = PlatformColors.palette.cardBorder,
        )
    }
}

// ── Swipeable Task Row ───────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeableTaskRow(
    task: AgentTask,
    showAgent: Boolean,
    navController: NavController,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
    onClick: () -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.EndToStart -> {
                    onDelete()
                    true
                }
                SwipeToDismissBoxValue.StartToEnd -> {
                    onToggle()
                    false
                }
                else -> false
            }
        }
    )

    // Reset state after swipe-to-complete
    LaunchedEffect(dismissState.currentValue) {
        if (dismissState.currentValue == SwipeToDismissBoxValue.StartToEnd) {
            dismissState.snapTo(SwipeToDismissBoxValue.Settled)
        }
    }

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val direction = dismissState.dismissDirection
            val color by animateColorAsState(
                when (direction) {
                    SwipeToDismissBoxValue.StartToEnd -> PlatformColors.palette.green.copy(alpha = 0.3f)
                    SwipeToDismissBoxValue.EndToStart -> PlatformColors.palette.red.copy(alpha = 0.3f)
                    else -> Color.Transparent
                },
                label = "swipe_bg"
            )
            val alignment = when (direction) {
                SwipeToDismissBoxValue.StartToEnd -> Alignment.CenterStart
                else -> Alignment.CenterEnd
            }
            val icon = when (direction) {
                SwipeToDismissBoxValue.StartToEnd -> Icons.Default.CheckCircle
                else -> Icons.Default.Delete
            }
            val iconTint = when (direction) {
                SwipeToDismissBoxValue.StartToEnd -> PlatformColors.palette.green
                else -> PlatformColors.palette.red
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 2.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(color)
                    .padding(horizontal = 20.dp),
                contentAlignment = alignment
            ) {
                Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(24.dp))
            }
        },
        enableDismissFromStartToEnd = !task.isCompleted,
        enableDismissFromEndToStart = true
    ) {
        TaskRowCard(
            task = task,
            showAgent = showAgent,
            navController = navController,
            onToggle = onToggle,
            onClick = onClick
        )
    }
}

// ── Task Row Card ────────────────────────────────────────────────────────────

@Composable
private fun TaskRowCard(
    task: AgentTask,
    showAgent: Boolean,
    navController: NavController,
    onToggle: () -> Unit,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 3.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 4.dp, end = 14.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = task.isCompleted,
                onCheckedChange = { onToggle() },
                colors = CheckboxDefaults.colors(
                    checkedColor = PlatformColors.palette.accent,
                    uncheckedColor = PlatformColors.palette.textSecondary,
                    checkmarkColor = PlatformColors.palette.background
                ),
                modifier = Modifier.size(48.dp)
            )

            // Priority dot
            val priorityColor = priorityColor(task.priority)
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(priorityColor)
            )

            Spacer(Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = task.title,
                    style = if (task.isCompleted) {
                        regularTextStyle(
                            PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 14.sp,
                            decoration = TextDecoration.LineThrough
                        )
                    } else {
                        regularTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                    },
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                if (showAgent && task.agentName.isNotBlank()) {
                    Text(
                        text = task.agentName,
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                        maxLines = 1
                    )
                }
                if (task.playerName.isNotBlank() && task.playerTmProfile.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(PlatformColors.palette.accent.copy(alpha = 0.2f))
                            .clickable {
                                val navId = task.playerTmProfile.takeIf { it.isNotBlank() } ?: task.playerId
                                if (navId.isNotBlank()) {
                                    navController.navigate("${Screens.PlayerInfoScreen.route}/${android.net.Uri.encode(navId)}")
                                }
                            }
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = task.playerName,
                            style = boldTextStyle(PlatformColors.palette.accent, 11.sp),
                            maxLines = 1
                        )
                    }
                }
            }

            // Due date chip
            if (task.dueDate > 0L) {
                Spacer(Modifier.width(8.dp))
                val dueDateStr = formatDueDate(task.dueDate)
                val dueDateClr = dueDateColor(task.dueDate, task.isCompleted)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(dueDateClr.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = dueDateStr,
                        style = boldTextStyle(dueDateClr, 11.sp)
                    )
                }
            }
        }
    }
}

// ── Empty State ──────────────────────────────────────────────────────────────

@Composable
private fun EmptyTasksState(modifier: Modifier = Modifier) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.tasks_empty),
                style = boldTextStyle(PlatformColors.palette.textSecondary, 16.sp)
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.tasks_empty_hint),
                style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.6f), 13.sp)
            )
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

private fun priorityColor(priority: Int): Color = when (priority) {
    2 -> PlatformColors.palette.red
    1 -> PlatformColors.palette.orange
    else -> PlatformColors.palette.green
}

@Composable
private fun formatDueDate(epochMillis: Long): String {
    if (epochMillis <= 0L) return ""
    val now = System.currentTimeMillis()
    val diffDays = daysBetweenCalendarDays(epochMillis, now)
    return when {
        diffDays < -1 -> stringResource(R.string.due_overdue, -diffDays)
        diffDays == -1 -> stringResource(R.string.due_yesterday)
        diffDays == 0 -> stringResource(R.string.due_today)
        diffDays == 1 -> stringResource(R.string.due_tomorrow)
        diffDays <= 7 -> SimpleDateFormat("EEEE", Locale.getDefault()).format(Date(epochMillis))
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(epochMillis))
    }
}

private fun dueDateColor(epochMillis: Long, isCompleted: Boolean): Color {
    if (isCompleted) return PlatformColors.palette.green
    if (epochMillis <= 0L) return PlatformColors.palette.textSecondary
    val now = System.currentTimeMillis()
    val diffDays = daysBetweenCalendarDays(epochMillis, now)
    return when {
        diffDays < 0 -> PlatformColors.palette.red
        diffDays <= 2 -> PlatformColors.palette.orange
        diffDays <= 7 -> Color(0xFFFDD835)
        else -> PlatformColors.palette.textSecondary
    }
}

private fun filterTasks(tasks: List<AgentTask>, filter: TaskTimeFilter): List<AgentTask> {
    val now = System.currentTimeMillis()
    return when (filter) {
        TaskTimeFilter.ALL -> tasks
        TaskTimeFilter.TODAY -> tasks.filter { task ->
            !task.isCompleted && task.dueDate > 0L &&
                daysBetweenCalendarDays(task.dueDate, now) == 0
        }
        TaskTimeFilter.WEEK -> tasks.filter { task ->
            !task.isCompleted && task.dueDate > 0L &&
                daysBetweenCalendarDays(task.dueDate, now) in -100..7
        }
        TaskTimeFilter.OVERDUE -> tasks.filter { task ->
            !task.isCompleted && task.dueDate > 0L && daysBetweenCalendarDays(task.dueDate, now) < 0
        }
    }
}

private data class TaskSectionLabels(
    val overdue: String,
    val today: String,
    val tomorrow: String,
    val week: String,
    val later: String,
    val noDate: String,
    val completed: String
)

private fun groupTasksByDate(
    tasks: List<AgentTask>,
    labels: TaskSectionLabels
): List<Pair<String, List<AgentTask>>> {
    val now = System.currentTimeMillis()

    val incomplete = tasks.filter { !it.isCompleted }
    val completed = tasks.filter { it.isCompleted }

    data class Bucket(val label: String, val order: Int, val tasks: MutableList<AgentTask> = mutableListOf())

    val buckets = mapOf(
        "overdue" to Bucket(labels.overdue, 0),
        "today" to Bucket(labels.today, 1),
        "tomorrow" to Bucket(labels.tomorrow, 2),
        "week" to Bucket(labels.week, 3),
        "later" to Bucket(labels.later, 4),
        "nodate" to Bucket(labels.noDate, 5)
    )

    incomplete.forEach { task ->
        val diffDays = if (task.dueDate > 0L) daysBetweenCalendarDays(task.dueDate, now) else 0
        val key = when {
            task.dueDate <= 0L -> "nodate"
            diffDays < 0 -> "overdue"
            diffDays == 0 -> "today"
            diffDays == 1 -> "tomorrow"
            diffDays <= 7 -> "week"
            else -> "later"
        }
        buckets[key]?.tasks?.add(task)
    }

    val result = mutableListOf<Pair<String, List<AgentTask>>>()
    buckets.values
        .sortedBy { it.order }
        .filter { it.tasks.isNotEmpty() }
        .forEach { bucket ->
            result.add(bucket.label to bucket.tasks.sortedBy { it.dueDate })
        }

    if (completed.isNotEmpty()) {
        result.add(labels.completed to completed.sortedByDescending { it.completedAt })
    }

    return result
}
