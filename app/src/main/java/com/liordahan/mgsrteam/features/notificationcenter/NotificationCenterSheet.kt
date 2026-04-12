package com.liordahan.mgsrteam.features.notificationcenter

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationCenterSheet(
    state: NotificationCenterState,
    onDismiss: () -> Unit,
    onMarkAllRead: () -> Unit,
    onNotificationClick: (StoredNotification) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = HomeDarkBackground,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 12.dp, bottom = 8.dp)
                    .size(40.dp, 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(HomeTextSecondary.copy(alpha = 0.3f))
            )
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp)
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.notification_center_title),
                    style = boldTextStyle(HomeTextPrimary, 18.sp)
                )
                if (state.unreadCount > 0) {
                    Text(
                        text = stringResource(R.string.notification_center_mark_all_read),
                        style = boldTextStyle(HomeTealAccent, 13.sp),
                        modifier = Modifier.clickable { onMarkAllRead() }
                    )
                }
            }

            if (state.notifications.isEmpty()) {
                // Empty state
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 48.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "🔔",
                        style = regularTextStyle(HomeTextSecondary, 40.sp)
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.notification_center_empty),
                        style = regularTextStyle(HomeTextSecondary, 14.sp)
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(400.dp)
                ) {
                    items(state.notifications, key = { it.id }) { notif ->
                        NotificationRow(
                            notification = notif,
                            onClick = { onNotificationClick(notif) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(
    notification: StoredNotification,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val isHebrew = LocaleManager.isHebrew(context)
    val bgColor = if (!notification.read) {
        HomeTealAccent.copy(alpha = 0.06f)
    } else {
        Color.Transparent
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bgColor)
            .clickable { onClick() }
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Icon
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(getTypeColor(notification.type).copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = getTypeIcon(notification.type),
                style = regularTextStyle(Color.White, 16.sp)
            )
        }

        Spacer(Modifier.width(12.dp))

        // Content
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = notification.title,
                style = if (!notification.read) {
                    boldTextStyle(HomeTextPrimary, 13.sp)
                } else {
                    regularTextStyle(HomeTextPrimary.copy(alpha = 0.8f), 13.sp)
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = notification.body,
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp)
            )
            Text(
                text = formatRelativeTime(notification.timestamp, isHebrew),
                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 11.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        // Unread dot
        if (!notification.read) {
            Spacer(Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .padding(top = 6.dp)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(HomeTealAccent)
            )
        }
    }
}

private fun getTypeColor(type: String): Color = when (type) {
    "TASK_ASSIGNED", "TASK_REMINDER" -> Color(0xFF39D164)
    "CLUB_CHANGE", "NOTE_TAGGED",
    "AGENT_TRANSFER_REQUEST", "AGENT_TRANSFER_APPROVED", "AGENT_TRANSFER_REJECTED" -> Color(0xFF2196F3)
    "BECAME_FREE_AGENT", "NEW_RELEASE_FROM_CLUB", "MANDATE_EXPIRED" -> Color(0xFFFF9800)
    "MARKET_VALUE_CHANGE", "REQUEST_ADDED" -> Color(0xFF9C27B0)
    "MANDATE_PLAYER_SIGNED", "CHAT_ROOM_TAG" -> Color(0xFF4DB6AC)
    else -> Color(0xFF4DB6AC)
}

private fun getTypeIcon(type: String): String = when (type) {
    "TASK_ASSIGNED", "TASK_REMINDER" -> "📋"
    "CLUB_CHANGE" -> "🔄"
    "BECAME_FREE_AGENT", "NEW_RELEASE_FROM_CLUB" -> "🏷️"
    "MARKET_VALUE_CHANGE" -> "💰"
    "MANDATE_EXPIRED" -> "⏰"
    "MANDATE_PLAYER_SIGNED" -> "✍️"
    "NOTE_TAGGED" -> "📝"
    "CHAT_ROOM_TAG" -> "💬"
    "REQUEST_ADDED" -> "📨"
    "AGENT_TRANSFER_REQUEST", "AGENT_TRANSFER_APPROVED", "AGENT_TRANSFER_REJECTED" -> "🤝"
    else -> "🔔"
}

private fun formatRelativeTime(timestamp: Long, isHebrew: Boolean): String {
    val diff = System.currentTimeMillis() - timestamp
    val mins = TimeUnit.MILLISECONDS.toMinutes(diff)
    if (mins < 1) return if (isHebrew) "עכשיו" else "Just now"
    if (mins < 60) return "${mins}m"
    val hours = TimeUnit.MILLISECONDS.toHours(diff)
    if (hours < 24) return "${hours}h"
    val days = TimeUnit.MILLISECONDS.toDays(diff)
    if (days < 7) return "${days}d"
    val sdf = java.text.SimpleDateFormat("dd/MM", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(timestamp))
}
