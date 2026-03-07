package com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.requests.models.PositionDisplayNames
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val COLLAPSED_MAX = 3

private val HistoryPurple = Color(0xFFA855F7)
private val StatusDeletedAmber = Color(0xFFF59E0B)
private val StatusFulfilledBlue = Color(0xFF3B82F6)
private val StatusActiveGreen = Color(0xFF22C55E)

@Composable
fun ProposalHistorySection(
    offers: List<PlayerOffer>,
    allAccounts: List<Account>,
    modifier: Modifier = Modifier
) {
    if (offers.isEmpty()) return

    var expanded by remember { mutableStateOf(false) }
    val visibleOffers = if (expanded) offers else offers.take(COLLAPSED_MAX)

    Column(modifier = modifier.padding(horizontal = 16.dp)) {

        // Section Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(HistoryPurple.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.History,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = HistoryPurple
                )
            }
            Text(
                stringResource(R.string.proposal_history_title),
                style = boldTextStyle(PlatformColors.palette.textPrimary, 15.sp),
                modifier = Modifier.weight(1f)
            )
            Text(
                "${offers.size}",
                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(PlatformColors.palette.cardBorder.copy(alpha = 0.5f))
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            )
        }

        Spacer(Modifier.height(4.dp))

        // Timeline
        visibleOffers.forEachIndexed { index, offer ->
            val isLast = index == visibleOffers.lastIndex && (expanded || offers.size <= COLLAPSED_MAX)
            ProposalHistoryTimelineItem(
                offer = offer,
                allAccounts = allAccounts,
                showConnector = !isLast
            )
            if (!isLast) Spacer(Modifier.height(8.dp))
        }

        // Show more / less
        if (offers.size > COLLAPSED_MAX) {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(HistoryPurple.copy(alpha = 0.08f))
                    .clickWithNoRipple { expanded = !expanded }
                    .padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    if (expanded) stringResource(R.string.proposal_history_show_less)
                    else stringResource(R.string.proposal_history_show_all, offers.size),
                    style = regularTextStyle(HistoryPurple, 12.sp)
                )
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = HistoryPurple
                )
            }
        }
    }
}

@Composable
private fun ProposalHistoryTimelineItem(
    offer: PlayerOffer,
    allAccounts: List<Account>,
    showConnector: Boolean
) {
    val context = LocalContext.current
    val dotColor = statusColor(offer.requestStatus)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
    ) {
        // Timeline track: dot + connector line
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(20.dp).fillMaxHeight()
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(dotColor)
            )
            if (showConnector) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .weight(1f)
                        .background(PlatformColors.palette.cardBorder)
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // Card
        Card(
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        ) {
            Column(modifier = Modifier.padding(12.dp)) {

                // Header: club logo + name + badges
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Club logo
                    offer.clubLogo?.takeIf { it.isNotBlank() }?.let { logo ->
                        AsyncImage(
                            model = logo,
                            contentDescription = null,
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(PlatformColors.palette.cardBorder.copy(alpha = 0.3f))
                                .padding(2.dp),
                            contentScale = ContentScale.Fit
                        )
                        Spacer(Modifier.width(8.dp))
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                offer.clubName ?: "",
                                style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                            )

                            // Position badge
                            offer.position?.takeIf { it.isNotBlank() }?.let { pos ->
                                Text(
                                    PositionDisplayNames.toLongName(pos).takeIf { it.isNotBlank() } ?: pos,
                                    style = boldTextStyle(HistoryPurple, 10.sp),
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(HistoryPurple.copy(alpha = 0.15f))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                }

                // Status badge — prominent, full-width row
                Spacer(Modifier.height(8.dp))
                StatusBadge(offer.requestStatus)

                // Request snapshot chips (for deleted requests)
                offer.requestSnapshot?.takeIf { it.isNotBlank() }?.let { snapshot ->
                    Spacer(Modifier.height(8.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        snapshot.split(" • ").forEach { chip ->
                            Text(
                                chip,
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(PlatformColors.palette.cardBorder.copy(alpha = 0.4f))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }
                }

                // Feedback bubble — always shown
                Spacer(Modifier.height(8.dp))
                val hasFeedback = !offer.clubFeedback.isNullOrBlank()
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(PlatformColors.palette.cardBorder.copy(alpha = 0.25f))
                        .padding(10.dp)
                ) {
                    Text(
                        stringResource(R.string.proposal_history_feedback),
                        style = regularTextStyle(HistoryPurple, 10.sp)
                    )
                    Spacer(Modifier.height(2.dp))
                    if (hasFeedback) {
                        Text(
                            "\"${offer.clubFeedback}\"",
                            style = regularTextStyle(PlatformColors.palette.textPrimary, 12.sp)
                        )
                    } else {
                        Text(
                            stringResource(R.string.proposal_history_no_feedback),
                            style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.6f), 11.sp)
                        )
                    }
                }

                // Meta row: agent + date
                Spacer(Modifier.height(8.dp))
                HorizontalDivider(
                    color = PlatformColors.palette.cardBorder.copy(alpha = 0.4f),
                    thickness = 0.5.dp
                )
                Spacer(Modifier.height(6.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Agent
                    val agentDisplay = resolveAgentName(offer.markedByAgentName, allAccounts, context)
                    if (agentDisplay != null) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(18.dp)
                                    .clip(CircleShape)
                                    .background(PlatformColors.palette.accent.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    agentDisplay.take(1),
                                    style = boldTextStyle(PlatformColors.palette.accent, 9.sp)
                                )
                            }
                            Text(
                                stringResource(R.string.proposal_history_by_agent, agentDisplay),
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
                            )
                        }
                    }

                    // Date
                    Column(horizontalAlignment = Alignment.End) {
                        offer.offeredAt?.let { ts ->
                            Text(
                                formatHistoryDate(ts),
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp)
                            )
                            Text(
                                formatTimeAgo(ts, context),
                                style = regularTextStyle(HistoryPurple, 10.sp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(requestStatus: String?) {
    val (label, color) = when (requestStatus) {
        "deleted" -> stringResource(R.string.proposal_history_status_deleted) to StatusDeletedAmber
        "fulfilled" -> stringResource(R.string.proposal_history_status_fulfilled) to StatusFulfilledBlue
        "active" -> stringResource(R.string.proposal_history_status_active) to StatusActiveGreen
        else -> stringResource(R.string.proposal_history_status_legacy) to PlatformColors.palette.textSecondary
    }
    val icon = when (requestStatus) {
        "deleted" -> "⊘ "
        "fulfilled" -> "✓ "
        "active" -> "✓ "
        else -> ""
    }
    Text(
        icon + label,
        style = boldTextStyle(color, 12.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

private fun statusColor(requestStatus: String?): Color = when (requestStatus) {
    "deleted" -> StatusDeletedAmber
    "fulfilled" -> StatusFulfilledBlue
    "active" -> StatusActiveGreen
    else -> Color(0xFF8C999B)
}

private fun resolveAgentName(
    rawName: String?,
    accounts: List<Account>,
    context: android.content.Context
): String? {
    val name = rawName?.takeIf { it.isNotBlank() } ?: return null
    return accounts.find {
        it.name.equals(name, ignoreCase = true) || it.hebrewName?.equals(name, ignoreCase = true) == true
    }?.getDisplayName(context) ?: name
}

private fun formatHistoryDate(timestamp: Long): String {
    return SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(timestamp))
}

private fun formatTimeAgo(timestamp: Long, context: android.content.Context): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    val minutes = diff / 60_000
    val hours = minutes / 60
    val days = hours / 24
    val months = days / 30
    return when {
        minutes < 1 -> context.getString(R.string.proposal_history_just_now)
        minutes < 60 -> context.getString(R.string.proposal_history_minutes_ago, minutes.toInt())
        hours < 24 -> context.getString(R.string.proposal_history_hours_ago, hours.toInt())
        days < 30 -> context.getString(R.string.proposal_history_days_ago, days.toInt())
        months < 12 -> context.getString(R.string.proposal_history_months_ago, months.toInt())
        else -> SimpleDateFormat("MMM yyyy", Locale.getDefault()).format(Date(timestamp))
    }
}
