package com.liordahan.mgsrteam.features.home.tasks

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.utils.datePickerMillisToLocalMidnight
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val agentAccentColors = listOf(
    HomeTealAccent, HomeBlueAccent, HomeOrangeAccent,
    HomePurpleAccent, HomeGreenAccent, HomeRedAccent
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun AddTaskBottomSheet(
    accounts: List<Account>,
    preselectedAgentIndex: Int = 0,
    onDismiss: () -> Unit,
    onConfirm: (agentId: String, agentName: String, title: String, dueDate: Long, priority: Int, notes: String) -> Unit
) {
    val context = LocalContext.current
    val sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var title by remember { mutableStateOf("") }
    var selectedAgentIndex by remember { mutableIntStateOf(preselectedAgentIndex.coerceIn(0, (accounts.size - 1).coerceAtLeast(0))) }
    var priority by remember { mutableIntStateOf(0) }
    var dueDate by remember { mutableLongStateOf(0L) }
    var notes by remember { mutableStateOf("") }
    var showDatePicker by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = HomeDarkCard,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = 10.dp)
                    .width(40.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(HomeDarkCardBorder)
            )
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .padding(bottom = 24.dp)
        ) {
            // Title
            Text(
                text = stringResource(R.string.tasks_new_task),
                style = boldTextStyle(HomeTextPrimary, 20.sp)
            )

            Spacer(Modifier.height(20.dp))

            // Task title field
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                placeholder = {
                    Text(
                        stringResource(R.string.tasks_what_needs_done),
                        style = regularTextStyle(HomeTextSecondary, 15.sp)
                    )
                },
                textStyle = regularTextStyle(HomeTextPrimary, 15.sp),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = HomeTealAccent,
                    unfocusedBorderColor = HomeDarkCardBorder,
                    cursorColor = HomeTealAccent,
                    focusedContainerColor = HomeDarkBackground,
                    unfocusedContainerColor = HomeDarkBackground
                ),
                singleLine = true
            )

            Spacer(Modifier.height(20.dp))

            // Agent selector
            Text(
                text = stringResource(R.string.tasks_assign_to),
                style = boldTextStyle(HomeTextSecondary, 13.sp)
            )
            Spacer(Modifier.height(8.dp))

            LazyRow(
                contentPadding = PaddingValues(end = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(accounts.size) { index ->
                    val account = accounts[index]
                    val selected = index == selectedAgentIndex
                    val accentColor = agentAccentColors[index % agentAccentColors.size]
                    val name = account.getDisplayName(context).ifEmpty { account.name ?: "" }

                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .clickable { selectedAgentIndex = index }
                            .padding(2.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(
                                    if (selected) accentColor.copy(alpha = 0.3f)
                                    else HomeDarkBackground
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = name.take(1).uppercase(),
                                style = boldTextStyle(
                                    if (selected) accentColor else HomeTextSecondary,
                                    16.sp
                                )
                            )
                        }
                        Spacer(Modifier.height(3.dp))
                        Text(
                            text = name,
                            style = regularTextStyle(
                                if (selected) HomeTextPrimary else HomeTextSecondary,
                                10.sp
                            ),
                            maxLines = 1
                        )
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // Priority
            Text(
                text = stringResource(R.string.tasks_priority),
                style = boldTextStyle(HomeTextSecondary, 13.sp)
            )
            Spacer(Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val priorities = listOf(
                    Triple(0, R.string.tasks_priority_low, HomeGreenAccent),
                    Triple(1, R.string.tasks_priority_medium, HomeOrangeAccent),
                    Triple(2, R.string.tasks_priority_high, HomeRedAccent)
                )
                priorities.forEach { (value, labelRes, color) ->
                    val selected = priority == value
                    val bgColor by animateColorAsState(
                        if (selected) color.copy(alpha = 0.2f) else HomeDarkBackground,
                        label = "priority_bg"
                    )
                    val textColor by animateColorAsState(
                        if (selected) color else HomeTextSecondary,
                        label = "priority_text"
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(bgColor)
                            .clickable { priority = value }
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        Text(
                            text = stringResource(labelRes),
                            style = boldTextStyle(textColor, 13.sp)
                        )
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // Due date
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(HomeDarkBackground)
                    .clickable { showDatePicker = true }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.CalendarToday,
                    contentDescription = null,
                    tint = if (dueDate > 0) HomeTealAccent else HomeTextSecondary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = if (dueDate > 0L) {
                        SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(dueDate))
                    } else {
                        stringResource(R.string.agent_select_due_date)
                    },
                    style = regularTextStyle(
                        if (dueDate > 0) HomeTextPrimary else HomeTextSecondary,
                        14.sp
                    )
                )
            }

            Spacer(Modifier.height(16.dp))

            // Notes
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                placeholder = {
                    Text(
                        stringResource(R.string.tasks_notes_hint),
                        style = regularTextStyle(HomeTextSecondary, 14.sp)
                    )
                },
                textStyle = regularTextStyle(HomeTextPrimary, 14.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(90.dp),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = HomeTealAccent,
                    unfocusedBorderColor = HomeDarkCardBorder,
                    cursorColor = HomeTealAccent,
                    focusedContainerColor = HomeDarkBackground,
                    unfocusedContainerColor = HomeDarkBackground
                ),
                maxLines = 4
            )

            Spacer(Modifier.height(24.dp))

            // Create button
            val canCreate = title.isNotBlank() && accounts.isNotEmpty()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        if (canCreate) HomeTealAccent
                        else HomeTealAccent.copy(alpha = 0.3f)
                    )
                    .then(
                        if (canCreate) Modifier.clickable {
                            val account = accounts[selectedAgentIndex]
                            val agentName = account.getDisplayName(context).ifEmpty { account.name ?: "" }
                            onConfirm(
                                account.id ?: "",
                                agentName,
                                title.trim(),
                                dueDate,
                                priority,
                                notes.trim()
                            )
                        } else Modifier
                    )
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.tasks_create),
                    style = boldTextStyle(Color.White, 15.sp)
                )
            }
        }
    }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { dueDate = datePickerMillisToLocalMidnight(it) }
                    showDatePicker = false
                }) {
                    Text(stringResource(R.string.ok), style = boldTextStyle(HomeTealAccent, 14.sp))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(R.string.cancel), style = boldTextStyle(HomeTextSecondary, 14.sp))
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}
