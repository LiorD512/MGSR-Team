package com.liordahan.mgsrteam.features.home.tasks

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.utils.datePickerMillisToLocalMidnight
import com.liordahan.mgsrteam.utils.localMidnightToDatePickerMillis
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val agentAccentColors = listOf(
    PlatformColors.palette.accent, PlatformColors.palette.blue, PlatformColors.palette.orange,
    PlatformColors.palette.purple, PlatformColors.palette.green, PlatformColors.palette.red
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(
    taskId: String,
    navController: NavController,
    viewModel: IHomeScreenViewModel
) {
    val state by viewModel.dashboardState.collectAsStateWithLifecycle()
    val allTasks = remember(state.agentTasks) { state.agentTasks.values.flatten() }
    val task = allTasks.find { it.id == taskId }
    val accounts = state.allAccounts
    val context = LocalContext.current

    if (task == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(PlatformColors.palette.background),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = stringResource(R.string.tasks_empty),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
            )
        }
        return
    }

    var editedTitle by remember(task.id) { mutableStateOf(task.title) }
    var editedNotes by remember(task.id) { mutableStateOf(task.notes) }
    var editedPriority by remember(task.id) { mutableIntStateOf(task.priority) }
    var editedDueDate by remember(task.id) { mutableLongStateOf(task.dueDate) }
    var editedAgentId by remember(task.id) { mutableStateOf(task.agentId) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showAgentPicker by remember { mutableStateOf(false) }

    val hasChanges = editedTitle != task.title ||
            editedNotes != task.notes ||
            editedPriority != task.priority ||
            editedDueDate != task.dueDate ||
            editedAgentId != task.agentId

    Scaffold(
        containerColor = PlatformColors.palette.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.tasks_detail_title),
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
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
                actions = {
                    if (hasChanges) {
                        TextButton(onClick = {
                            val agentAccount = accounts.find { it.id == editedAgentId }
                            val agentName = agentAccount?.getDisplayName(context)?.ifEmpty {
                                agentAccount.name ?: ""
                            } ?: task.agentName
                            viewModel.updateTask(
                                task.copy(
                                    title = editedTitle.trim(),
                                    notes = editedNotes.trim(),
                                    priority = editedPriority,
                                    dueDate = editedDueDate,
                                    agentId = editedAgentId,
                                    agentName = agentName
                                )
                            )
                            navController.popBackStack()
                        }) {
                            Text(
                                stringResource(R.string.tasks_save),
                                style = boldTextStyle(PlatformColors.palette.accent, 14.sp)
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PlatformColors.palette.background)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
        ) {
            Spacer(Modifier.height(8.dp))

            // Title
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
            ) {
                OutlinedTextField(
                    value = editedTitle,
                    onValueChange = { editedTitle = it },
                    textStyle = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                        cursorColor = PlatformColors.palette.accent,
                        focusedContainerColor = PlatformColors.palette.card,
                        unfocusedContainerColor = PlatformColors.palette.card
                    ),
                    singleLine = false,
                    maxLines = 3
                )
            }

            Spacer(Modifier.height(16.dp))

            // Info card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Agent
                    val agentAccount = accounts.find { it.id == editedAgentId }
                    val displayAgentName = agentAccount?.getDisplayName(context)?.ifEmpty {
                        agentAccount.name ?: ""
                    } ?: task.agentName

                    DetailInfoRow(
                        icon = Icons.Default.Person,
                        label = stringResource(R.string.tasks_assign_to),
                        value = displayAgentName,
                        onClick = { showAgentPicker = !showAgentPicker }
                    )

                    // Linked player (when task has player context)
                    if (task.playerName.isNotBlank() && task.playerTmProfile.isNotBlank()) {
                        Spacer(Modifier.height(12.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(1.dp)
                                .background(PlatformColors.palette.cardBorder)
                        )
                        Spacer(Modifier.height(12.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    val navId = task.playerTmProfile.takeIf { it.isNotBlank() } ?: task.playerId
                                    if (navId.isNotBlank()) {
                                        navController.navigate("${com.liordahan.mgsrteam.navigation.Screens.PlayerInfoScreen.route}/${android.net.Uri.encode(navId)}")
                                    }
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                tint = PlatformColors.palette.accent,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = stringResource(R.string.tasks_linked_player),
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = task.playerName,
                                    style = regularTextStyle(PlatformColors.palette.accent, 14.sp)
                                )
                            }
                            Icon(
                                Icons.AutoMirrored.Filled.OpenInNew,
                                contentDescription = null,
                                tint = PlatformColors.palette.accent,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    if (showAgentPicker) {
                        Spacer(Modifier.height(8.dp))
                        LazyRow(
                            contentPadding = PaddingValues(end = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(accounts.size) { index ->
                                val account = accounts[index]
                                val selected = account.id == editedAgentId
                                val accentColor = agentAccentColors[index % agentAccentColors.size]
                                val name = account.getDisplayName(context).ifEmpty { account.name ?: "" }

                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (selected) accentColor.copy(alpha = 0.3f)
                                            else PlatformColors.palette.background
                                        )
                                        .clickable {
                                            editedAgentId = account.id ?: ""
                                            showAgentPicker = false
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = name.take(1).uppercase(),
                                        style = boldTextStyle(
                                            if (selected) accentColor else PlatformColors.palette.textSecondary,
                                            14.sp
                                        )
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(PlatformColors.palette.cardBorder)
                    )
                    Spacer(Modifier.height(12.dp))

                    // Due date
                    DetailInfoRow(
                        icon = Icons.Default.CalendarToday,
                        label = stringResource(R.string.agent_select_due_date),
                        value = if (editedDueDate > 0L)
                            SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(editedDueDate))
                        else stringResource(R.string.tasks_section_no_date),
                        valueColor = if (editedDueDate > 0L) PlatformColors.palette.textPrimary else PlatformColors.palette.textSecondary,
                        onClick = { showDatePicker = true }
                    )

                    Spacer(Modifier.height(12.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(PlatformColors.palette.cardBorder)
                    )
                    Spacer(Modifier.height(12.dp))

                    // Priority
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Flag,
                            contentDescription = null,
                            tint = PlatformColors.palette.textSecondary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.tasks_priority),
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val priorities = listOf(
                            Triple(0, R.string.tasks_priority_low, PlatformColors.palette.green),
                            Triple(1, R.string.tasks_priority_medium, PlatformColors.palette.orange),
                            Triple(2, R.string.tasks_priority_high, PlatformColors.palette.red)
                        )
                        priorities.forEach { (value, labelRes, color) ->
                            val selected = editedPriority == value
                            val bgColor by animateColorAsState(
                                if (selected) color.copy(alpha = 0.2f) else PlatformColors.palette.background,
                                label = "detail_priority_bg"
                            )
                            val textColor by animateColorAsState(
                                if (selected) color else PlatformColors.palette.textSecondary,
                                label = "detail_priority_text"
                            )
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(bgColor)
                                    .clickable { editedPriority = value }
                                    .padding(horizontal = 14.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = stringResource(labelRes),
                                    style = boldTextStyle(textColor, 12.sp)
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Notes
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
            ) {
                OutlinedTextField(
                    value = editedNotes,
                    onValueChange = { editedNotes = it },
                    placeholder = {
                        Text(
                            stringResource(R.string.tasks_notes_hint),
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                        )
                    },
                    textStyle = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                        cursorColor = PlatformColors.palette.accent,
                        focusedContainerColor = PlatformColors.palette.card,
                        unfocusedContainerColor = PlatformColors.palette.card
                    ),
                    maxLines = 6
                )
            }

            Spacer(Modifier.height(24.dp))

            // Action buttons
            // Mark Complete / Incomplete
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(PlatformColors.palette.accent)
                    .clickable {
                        viewModel.toggleTaskCompleted(task)
                        navController.popBackStack()
                    }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (task.isCompleted)
                        stringResource(R.string.tasks_mark_incomplete)
                    else stringResource(R.string.tasks_mark_complete),
                    style = boldTextStyle(Color.White, 15.sp)
                )
            }

            Spacer(Modifier.height(10.dp))

            // Delete
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .border(1.dp, PlatformColors.palette.red.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
                    .clickable { showDeleteDialog = true }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.delete_task),
                    style = boldTextStyle(PlatformColors.palette.red, 15.sp)
                )
            }

            Spacer(Modifier.height(32.dp))
        }
    }

    // Date picker
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = if (editedDueDate > 0L) localMidnightToDatePickerMillis(editedDueDate) else null
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { editedDueDate = datePickerMillisToLocalMidnight(it) }
                    showDatePicker = false
                }) {
                    Text(stringResource(R.string.ok), style = boldTextStyle(PlatformColors.palette.accent, 14.sp))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(R.string.cancel), style = boldTextStyle(PlatformColors.palette.textSecondary, 14.sp))
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }

    // Delete confirmation
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = {
                Text(
                    stringResource(R.string.tasks_delete_confirm_title),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
                )
            },
            text = {
                Text(
                    stringResource(R.string.tasks_delete_confirm_message),
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteTask(task)
                    showDeleteDialog = false
                    navController.popBackStack()
                }) {
                    Text(
                        stringResource(R.string.delete_task),
                        style = boldTextStyle(PlatformColors.palette.red, 14.sp)
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(
                        stringResource(R.string.cancel),
                        style = boldTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                    )
                }
            },
            containerColor = PlatformColors.palette.card,
            shape = RoundedCornerShape(20.dp)
        )
    }
}

@Composable
private fun DetailInfoRow(
    icon: ImageVector,
    label: String,
    value: String,
    valueColor: Color = PlatformColors.palette.textPrimary,
    onClick: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = PlatformColors.palette.textSecondary,
            modifier = Modifier.size(20.dp)
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = value,
                style = regularTextStyle(valueColor, 14.sp)
            )
        }
    }
}
