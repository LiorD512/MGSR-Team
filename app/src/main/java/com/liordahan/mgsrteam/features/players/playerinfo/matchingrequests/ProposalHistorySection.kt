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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Edit
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.requests.models.PositionDisplayNames
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono
import androidx.compose.foundation.border
import androidx.compose.ui.text.font.FontWeight
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val COLLAPSED_MAX = 3

@Composable
fun ProposalHistorySection(
    offers: List<PlayerOffer>,
    allAccounts: List<Account>,
    onUpdateSummary: (offerId: String, summary: String?) -> Unit,
    modifier: Modifier = Modifier
) {
    if (offers.isEmpty()) return

    var expanded by remember { mutableStateOf(false) }
    val visibleOffers = if (expanded) offers else offers.take(COLLAPSED_MAX)

    // The module header is now rendered by the Overview pane
    // (BritDossierModuleHeader). This body renders the editorial timeline only.
    Column(modifier = modifier.padding(horizontal = 16.dp)) {

        // Count line (mono, editorial) — replaces the old purple icon-tile header.
        Text(
            text = stringResource(R.string.proposal_history_show_all, offers.size).uppercase(),
            style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.6.sp),
            modifier = Modifier.padding(vertical = 8.dp),
        )

        Spacer(Modifier.height(4.dp))

        // Timeline
        visibleOffers.forEachIndexed { index, offer ->
            val isLast = index == visibleOffers.lastIndex && (expanded || offers.size <= COLLAPSED_MAX)
            ProposalHistoryTimelineItem(
                offer = offer,
                allAccounts = allAccounts,
                onUpdateSummary = onUpdateSummary,
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
                    .border(1.dp, BritTokens.line, RoundedCornerShape(10.dp))
                    .background(BritTokens.gold.copy(alpha = 0.06f))
                    .clickWithNoRipple { expanded = !expanded }
                    .padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    (if (expanded) stringResource(R.string.proposal_history_show_less)
                    else stringResource(R.string.proposal_history_show_all, offers.size)).uppercase(),
                    style = britMono(BritTokens.gold, 10.sp, letterSpacing = 0.6.sp)
                )
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = BritTokens.gold
                )
            }
        }
    }
}

@Composable
private fun ProposalHistoryTimelineItem(
    offer: PlayerOffer,
    allAccounts: List<Account>,
    onUpdateSummary: (offerId: String, summary: String?) -> Unit,
    showConnector: Boolean
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
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
                        .background(BritTokens.line)
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // Editorial hairline surround (no Material Card / elevation).
        Column(
            modifier = Modifier
                .weight(1f)
                .border(1.dp, BritTokens.line)
                .background(BritTokens.card)
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
                                .background(BritTokens.paper2.copy(alpha = 0.6f))
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
                                (offer.clubName ?: "").uppercase(),
                                style = britDisplay(BritTokens.ink, 15.sp, weight = 600, letterSpacing = 0.3.sp)
                            )

                            // Position badge
                            offer.position?.takeIf { it.isNotBlank() }?.let { pos ->
                                Text(
                                    (PositionDisplayNames.toLongName(pos).takeIf { it.isNotBlank() } ?: pos).uppercase(),
                                    style = britMono(BritTokens.gold, 9.sp, letterSpacing = 0.4.sp),
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .border(1.dp, BritTokens.line, RoundedCornerShape(6.dp))
                                        .background(BritTokens.gold.copy(alpha = 0.08f))
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
                                chip.uppercase(),
                                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.4.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .border(1.dp, BritTokens.line2, RoundedCornerShape(6.dp))
                                    .background(BritTokens.paper2.copy(alpha = 0.5f))
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
                        .border(1.dp, BritTokens.line2, RoundedCornerShape(8.dp))
                        .background(BritTokens.paper.copy(alpha = 0.6f))
                        .padding(10.dp)
                ) {
                    Text(
                        stringResource(R.string.proposal_history_feedback).uppercase(),
                        style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.6.sp)
                    )
                    Spacer(Modifier.height(2.dp))
                    if (hasFeedback) {
                        Text(
                            "\"${offer.clubFeedback}\"",
                            style = britBody(BritTokens.ink, 12.sp)
                        )
                    } else {
                        Text(
                            stringResource(R.string.proposal_history_no_feedback),
                            style = britBody(BritTokens.muted2, 11.sp)
                        )
                    }
                }

                // Agent summary — tap to add/edit
                Spacer(Modifier.height(8.dp))
                AgentSummaryBlock(
                    currentSummary = offer.historySummary,
                    onSave = { newSummary ->
                        offer.id?.let { id -> onUpdateSummary(id, newSummary) }
                    }
                )

                // Meta row: agent + date
                Spacer(Modifier.height(8.dp))
                HorizontalDivider(
                    color = BritTokens.line2,
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
                                    .background(BritTokens.gold.copy(alpha = 0.12f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    agentDisplay.take(1).uppercase(),
                                    style = britMono(BritTokens.gold, 9.sp, letterSpacing = 0.sp)
                                )
                            }
                            Text(
                                stringResource(R.string.proposal_history_by_agent, agentDisplay),
                                style = britBody(BritTokens.muted, 10.sp)
                            )
                        }
                    }

                    // Date
                    Column(horizontalAlignment = Alignment.End) {
                        offer.offeredAt?.let { ts ->
                            Text(
                                formatHistoryDate(ts),
                                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.sp)
                            )
                            Text(
                                formatTimeAgo(ts, context),
                                style = britMono(BritTokens.gold, 10.sp, letterSpacing = 0.sp)
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
        "deleted" -> stringResource(R.string.proposal_history_status_deleted) to BritTokens.red
        "fulfilled" -> stringResource(R.string.proposal_history_status_fulfilled) to BritTokens.green
        "active" -> stringResource(R.string.proposal_history_status_active) to BritTokens.gold
        else -> stringResource(R.string.proposal_history_status_legacy) to BritTokens.muted
    }
    val icon = when (requestStatus) {
        "deleted" -> "⊘ "
        "fulfilled" -> "✓ "
        "active" -> "✓ "
        else -> ""
    }
    Text(
        (icon + label).uppercase(),
        style = britMono(color, 10.sp, weight = FontWeight.Medium, letterSpacing = 0.6.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.10f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

@Composable
private fun AgentSummaryBlock(
    currentSummary: String?,
    onSave: (String?) -> Unit
) {
    val focusManager = LocalFocusManager.current
    val hasSummary = !currentSummary.isNullOrBlank()
    var editing by remember { mutableStateOf(false) }
    var draft by remember(currentSummary) { mutableStateOf(currentSummary ?: "") }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, BritTokens.line, RoundedCornerShape(8.dp))
            .background(BritTokens.gold.copy(alpha = 0.06f))
            .padding(10.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                stringResource(R.string.proposal_history_summary).uppercase(),
                style = britMono(BritTokens.gold, 9.sp, letterSpacing = 0.6.sp),
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.Default.Edit,
                contentDescription = null,
                modifier = Modifier
                    .size(14.dp)
                    .clickWithNoRipple { editing = !editing },
                tint = BritTokens.gold.copy(alpha = 0.7f)
            )
        }
        Spacer(Modifier.height(4.dp))

        if (editing) {
            BasicTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .border(1.dp, BritTokens.line, RoundedCornerShape(6.dp))
                    .background(BritTokens.paper.copy(alpha = 0.8f))
                    .padding(8.dp),
                textStyle = britBody(BritTokens.ink, 12.sp),
                cursorBrush = SolidColor(BritTokens.gold),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = {
                    focusManager.clearFocus()
                    onSave(draft.takeIf { it.isNotBlank() })
                    editing = false
                }),
                decorationBox = { innerTextField ->
                    Box {
                        if (draft.isBlank()) {
                            Text(
                                stringResource(R.string.proposal_history_summary_hint),
                                style = britBody(BritTokens.muted2, 11.sp)
                            )
                        }
                        innerTextField()
                    }
                }
            )
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.proposal_history_summary_save).uppercase(),
                style = britMono(BritTokens.gold, 10.sp, weight = FontWeight.Medium, letterSpacing = 0.6.sp),
                modifier = Modifier
                    .align(Alignment.End)
                    .clip(RoundedCornerShape(6.dp))
                    .border(1.dp, BritTokens.line, RoundedCornerShape(6.dp))
                    .background(BritTokens.gold.copy(alpha = 0.10f))
                    .clickWithNoRipple {
                        focusManager.clearFocus()
                        onSave(draft.takeIf { it.isNotBlank() })
                        editing = false
                    }
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            )
        } else if (hasSummary) {
            Text(
                "\"$currentSummary\"",
                style = britBody(BritTokens.ink, 12.sp)
            )
        } else {
            Text(
                stringResource(R.string.proposal_history_add_summary),
                style = britBody(BritTokens.muted2, 11.sp),
                modifier = Modifier.clickWithNoRipple { editing = true }
            )
        }
    }
}

private fun statusColor(requestStatus: String?): Color = when (requestStatus) {
    "deleted" -> BritTokens.red
    "fulfilled" -> BritTokens.green
    "active" -> BritTokens.gold
    else -> BritTokens.muted2
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
