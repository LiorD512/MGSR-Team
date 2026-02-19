package com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests

import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.ui.graphics.Color
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.requests.models.PositionDisplayNames
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import android.content.res.Resources
import androidx.compose.ui.text.style.TextAlign
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun MatchingRequestsSection(
    matchingRequests: List<MatchingRequestUiState>,
    player: Player?,
    allAccounts: List<com.liordahan.mgsrteam.features.login.models.Account>,
    viewModel: com.liordahan.mgsrteam.features.players.playerinfo.IPlayerInfoViewModel,
    modifier: Modifier = Modifier
) {
    if (player == null) return

    var showMarkAsOfferedSheet by remember { mutableStateOf<MatchingRequestUiState?>(null) }

    Column(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (matchingRequests.isEmpty()) {
                MatchingRequestsEmptyState()
            } else {
                matchingRequests.forEach { state ->
                    MatchingRequestCard(
                        state = state,
                        player = player,
                        allAccounts = allAccounts,
                        onMarkAsOffered = { showMarkAsOfferedSheet = state },
                        onEditFeedback = { showMarkAsOfferedSheet = state }
                    )
                }
            }
        }
    }

    showMarkAsOfferedSheet?.let { state ->
        MarkAsOfferedBottomSheet(
            state = state,
            player = player,
            onDismiss = { showMarkAsOfferedSheet = null },
            onSave = { feedback ->
                if (state.offer != null) {
                    state.offer.id?.let { viewModel.updateClubFeedback(it, feedback) }
                } else {
                    viewModel.markPlayerAsOffered(player, state.request, feedback)
                }
                showMarkAsOfferedSheet = null
            }
        )
    }
}

@Composable
private fun MatchingRequestsEmptyState() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Handshake,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                    tint = HomeTextSecondary.copy(alpha = 0.6f)
                )
            }
            Spacer(Modifier.height(20.dp))
            Text(
                stringResource(R.string.player_info_matching_requests_empty),
                style = boldTextStyle(HomeTextPrimary, 16.sp)
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.player_info_matching_requests_empty_subtitle),
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun MatchingRequestCard(
    state: MatchingRequestUiState,
    player: Player,
    allAccounts: List<com.liordahan.mgsrteam.features.login.models.Account>,
    onMarkAsOffered: () -> Unit,
    onEditFeedback: () -> Unit
) {
    val context = LocalContext.current
    val request = state.request
    val offer = state.offer
    var isExpanded by remember { mutableStateOf(false) }
    val positionName = PositionDisplayNames.toLongName(request.position ?: "")
    val detailsText = buildRequestDetailsText(context.resources, request)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Header row - always visible, tappable to expand
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple { isExpanded = !isExpanded },
                verticalAlignment = Alignment.Top
            ) {
                request.clubLogo?.let { logo ->
                    AsyncImage(
                        model = logo,
                        contentDescription = null,
                        modifier = Modifier.size(36.dp),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(Modifier.width(10.dp))
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
                            style = boldTextStyle(HomeTextSecondary, 11.sp)
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            request.clubName ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        if (offer != null) {
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(HomeGreenAccent.copy(alpha = 0.2f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    Icons.Default.Check,
                                    contentDescription = null,
                                    modifier = Modifier.size(12.dp),
                                    tint = HomeGreenAccent
                                )
                                Text(
                                    stringResource(R.string.player_info_matching_requests_offered),
                                    style = boldTextStyle(HomeGreenAccent, 10.sp)
                                )
                            }
                        }
                    }
                    Text(
                        "${request.clubCountry ?: ""} • $positionName".trimStart(' ', '•', ' '),
                        style = regularTextStyle(HomeTextSecondary, 11.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                    if (detailsText.isNotBlank()) {
                        Text(
                            detailsText,
                            style = regularTextStyle(HomeTextSecondary, 10.sp),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    offer?.let { o ->
                        val dateStr = o.offeredAt?.let { formatOfferDate(it) } ?: ""
                        val rawAgent = o.markedByAgentName?.takeIf { it.isNotBlank() }
                        val agentDisplayName = rawAgent?.let { name ->
                            allAccounts.find { it.name.equals(name, ignoreCase = true) || it.hebrewName?.equals(name, ignoreCase = true) == true }
                                ?.getDisplayName(context)
                                ?: name
                        }
                        val dateAndAgent = buildList {
                            if (dateStr.isNotBlank()) add(context.resources.getString(R.string.player_info_matching_requests_offered_date, dateStr))
                            agentDisplayName?.let { add(context.resources.getString(R.string.player_info_matching_requests_by_agent, it)) }
                        }.joinToString(" • ")
                        if (dateAndAgent.isNotBlank()) {
                            Text(
                                dateAndAgent,
                                style = regularTextStyle(HomeTealAccent, 10.sp),
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.width(8.dp))
                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = HomeTextSecondary
                )
            }

            // Expanded content: feedback section + share/mark buttons (share only when not offered)
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(modifier = Modifier.padding(top = 12.dp)) {
                    HorizontalDivider(color = HomeDarkCardBorder, thickness = 0.5.dp)
                    Spacer(Modifier.height(12.dp))

                    if (offer != null) {
                        // Feedback section (only when offered)
                        Column {
                            Text(
                                stringResource(R.string.player_info_matching_requests_club_feedback),
                                style = regularTextStyle(HomeTextSecondary, 10.sp)
                            )
                            Spacer(Modifier.height(4.dp))
                            if (!offer.clubFeedback.isNullOrBlank()) {
                                Text(
                                    "\"${offer.clubFeedback}\"",
                                    style = regularTextStyle(HomeTextPrimary, 12.sp)
                                )
                                Spacer(Modifier.height(8.dp))
                            }
                            Text(
                                stringResource(
                                    if (offer.clubFeedback.isNullOrBlank())
                                        R.string.player_info_matching_requests_add_feedback
                                    else
                                        R.string.player_info_matching_requests_edit_feedback
                                ),
                                style = regularTextStyle(HomeTealAccent, 12.sp),
                                modifier = Modifier.clickWithNoRipple { onEditFeedback() }
                            )
                        }
                    } else {
                        // Not offered: Mark as offered + Share (only when valid contact number)
                        val hasValidContact = request.contactPhoneNumber?.filter { it.isDigit() }?.takeIf { it.isNotBlank() } != null
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Button(
                                onClick = onMarkAsOffered,
                                colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent.copy(alpha = 0.2f)),
                                shape = RoundedCornerShape(12.dp),
                                contentPadding = ButtonDefaults.ContentPadding
                            ) {
                                Text(
                                    stringResource(R.string.player_info_matching_requests_mark_offered),
                                    style = boldTextStyle(HomeTealAccent, 13.sp)
                                )
                            }
                            if (hasValidContact) {
                                Icon(
                                    imageVector = Icons.Default.Share,
                                    contentDescription = stringResource(R.string.player_info_share),
                                    modifier = Modifier
                                        .size(24.dp)
                                        .clickWithNoRipple {
                                            val profileUrl = player.tmProfile?.takeIf { it.isNotBlank() }
                                            if (profileUrl != null) {
                                                val phone = request.contactPhoneNumber?.filter { it.isDigit() }?.takeIf { it.isNotBlank() }
                                                if (phone != null) {
                                                    val intent = Intent(Intent.ACTION_VIEW, "https://wa.me/$phone?text=${Uri.encode(profileUrl)}".toUri())
                                                    context.startActivity(intent)
                                                }
                                            }
                                        },
                                    tint = HomeTealAccent
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun buildRequestDetailsText(resources: Resources, request: Request): String {
    val parts = mutableListOf<String>()
    if (request.ageDoesntMatter != true && request.minAge != null && request.maxAge != null && request.minAge > 0 && request.maxAge > 0) {
        parts.add(resources.getString(R.string.requests_age_range, request.minAge, request.maxAge))
    }
    request.salaryRange?.takeIf { it.isNotBlank() }?.let {
        parts.add(resources.getString(R.string.requests_salary, it))
    }
    request.transferFee?.takeIf { it.isNotBlank() }?.let { fee ->
        val displayFee = when (fee) {
            "Free/Free loan" -> resources.getString(R.string.requests_transfer_fee_free_loan)
            "<200" -> resources.getString(R.string.requests_transfer_fee_lt200)
            else -> fee
        }
        parts.add(resources.getString(R.string.requests_fee, displayFee))
    }
    return parts.joinToString(" • ")
}

private fun formatOfferDate(timestamp: Long): String {
    return SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(timestamp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MarkAsOfferedBottomSheet(
    state: MatchingRequestUiState,
    player: Player,
    onDismiss: () -> Unit,
    onSave: (String?) -> Unit
) {
    var feedbackText by remember(state) { mutableStateOf(state.offer?.clubFeedback ?: "") }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        containerColor = HomeDarkCard,
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp, 4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(HomeDarkCardBorder)
                )
            }
        },
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
                .navigationBarsPadding()
        ) {
            Text(
                when {
                    state.offer == null -> stringResource(R.string.player_info_matching_requests_mark_offered)
                    state.offer.clubFeedback.isNullOrBlank() -> stringResource(R.string.player_info_matching_requests_add_feedback_title)
                    else -> stringResource(R.string.player_info_matching_requests_edit_feedback_title)
                },
                style = boldTextStyle(HomeTextPrimary, 18.sp)
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "${state.request.clubName ?: ""} • ${PositionDisplayNames.toLongName(state.request.position ?: "")}",
                style = regularTextStyle(HomeTextSecondary, 13.sp)
            )
            Spacer(Modifier.height(20.dp))

            Text(
                stringResource(R.string.player_info_matching_requests_offer_date),
                style = regularTextStyle(HomeTextSecondary, 11.sp)
            )
            Spacer(Modifier.height(4.dp))
            Text(
                formatOfferDate(state.offer?.offeredAt ?: System.currentTimeMillis()),
                style = regularTextStyle(HomeTextPrimary, 14.sp)
            )
            Spacer(Modifier.height(16.dp))

            Text(
                stringResource(R.string.player_info_matching_requests_feedback_hint),
                style = regularTextStyle(HomeTextSecondary, 11.sp)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = feedbackText,
                onValueChange = { feedbackText = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 80.dp),
                placeholder = {
                    Text(
                        stringResource(R.string.player_info_matching_requests_feedback_placeholder),
                        style = regularTextStyle(HomeTextSecondary, 14.sp)
                    )
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = HomeTealAccent,
                    unfocusedBorderColor = HomeDarkCardBorder,
                    focusedTextColor = HomeTextPrimary,
                    unfocusedTextColor = HomeTextPrimary,
                    cursorColor = HomeTealAccent,
                    focusedLabelColor = HomeTextSecondary,
                    unfocusedLabelColor = HomeTextSecondary
                ),
                minLines = 3,
                maxLines = 5
            )
            Spacer(Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = HomeDarkCardBorder),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        stringResource(R.string.player_info_matching_requests_cancel),
                        style = boldTextStyle(HomeTextPrimary, 14.sp)
                    )
                }
                Button(
                    onClick = { onSave(feedbackText.takeIf { it.isNotBlank() }) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent, contentColor = Color.White),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        stringResource(R.string.player_info_save_note),
                        style = boldTextStyle(Color.White, 14.sp)
                    )
                }
            }
        }
    }
}
