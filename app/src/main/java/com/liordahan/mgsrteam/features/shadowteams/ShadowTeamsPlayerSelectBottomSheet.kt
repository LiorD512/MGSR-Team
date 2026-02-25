package com.liordahan.mgsrteam.features.shadowteams

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.repository.PlayerWithId
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

/** Position codes that map to formation slots (matches web shadowTeamFormations). */
private val POSITION_ALIASES = mapOf(
    "GK" to listOf("GK", "Goalkeeper"),
    "LB" to listOf("LB", "Left Back", "Left-Back"),
    "RB" to listOf("RB", "Right Back", "Right-Back"),
    "CB" to listOf("CB", "Centre Back", "Centre-Back", "Center Back"),
    "LWB" to listOf("LWB", "Left Wing-Back", "LB", "Left Back"),
    "RWB" to listOf("RWB", "Right Wing-Back", "RB", "Right Back"),
    "DM" to listOf("DM", "Defensive Midfield", "Defensive-Midfield"),
    "CM" to listOf("CM", "Central Midfield", "Central-Midfield"),
    "AM" to listOf("AM", "Attacking Midfield", "Attacking-Midfield"),
    "LM" to listOf("LM", "Left Midfield", "Left-Midfield"),
    "RM" to listOf("RM", "Right Midfield", "Right-Midfield"),
    "LW" to listOf("LW", "Left Winger", "Left-Winger"),
    "RW" to listOf("RW", "Right Winger", "Right-Winger"),
    "ST" to listOf("ST", "CF", "Centre Forward", "Centre-Forward", "Second Striker", "SS", "Striker")
)

private fun convertPosition(s: String): String {
    val map = mapOf(
        "Goalkeeper" to "GK",
        "Left Back" to "LB",
        "Centre Back" to "CB",
        "Right Back" to "RB",
        "Defensive Midfield" to "DM",
        "Central Midfield" to "CM",
        "Attacking Midfield" to "AM",
        "Right Winger" to "RW",
        "Left Winger" to "LW",
        "Centre Forward" to "CF",
        "Second Striker" to "SS",
        "Left Midfield" to "LM",
        "Right Midfield" to "RM"
    )
    return map[s] ?: s
}

private fun playerMatchesPosition(player: PlayerWithId, positionCode: String): Boolean {
    val aliases = POSITION_ALIASES[positionCode] ?: listOf(positionCode)
    val aliasSet = aliases.map { it.uppercase() }.toSet()
    val playerPositions = player.player.positions ?: emptyList()
    return playerPositions.any { pos ->
        val normalized = pos?.trim() ?: return@any false
        if (normalized.isEmpty()) return@any false
        val code = convertPosition(normalized).ifEmpty { normalized }
        aliasSet.contains(code.uppercase()) || aliasSet.contains(normalized.uppercase())
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShadowTeamsPlayerSelectBottomSheet(
    positionCode: String,
    positionLabel: String,
    players: List<PlayerWithId>,
    onDismiss: () -> Unit,
    onSelect: (PlayerWithId) -> Unit
) {
    var search by remember { mutableStateOf("") }
    val filtered = remember(players, positionCode, search) {
        val byPosition = players.filter { playerMatchesPosition(it, positionCode) }
        val list = if (byPosition.isNotEmpty()) byPosition else players
        val q = search.trim().lowercase()
        if (q.isEmpty()) list
        else list.filter { pw ->
            (pw.player.fullName?.lowercase()?.contains(q) == true) ||
                (pw.player.positions?.any { it?.lowercase()?.contains(q) == true } == true)
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = HomeDarkCard,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        dragHandle = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.shadow_teams_select_player_for, positionLabel),
                    style = boldTextStyle(HomeTextPrimary, 18.sp),
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = stringResource(R.string.shadow_teams_cancel),
                        tint = HomeTextSecondary
                    )
                }
            }
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp)
        ) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = {
                    Text(
                        text = stringResource(R.string.shadow_teams_search_player),
                        style = regularTextStyle(HomeTextSecondary, 14.sp)
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = HomeTextPrimary,
                    unfocusedTextColor = HomeTextPrimary,
                    focusedBorderColor = HomeTealAccent,
                    unfocusedBorderColor = HomeDarkCardBorder,
                    cursorColor = HomeTealAccent,
                    focusedContainerColor = HomeDarkBackground,
                    unfocusedContainerColor = HomeDarkBackground
                )
            )

            if (filtered.isEmpty()) {
                Text(
                    text = stringResource(R.string.shadow_teams_no_players),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            } else {
                LazyColumn(
                    modifier = Modifier.height(320.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(vertical = 4.dp)
                ) {
                    items(filtered, key = { it.id }) { pw ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(HomeDarkBackground)
                                .clickable {
                                    onSelect(pw)
                                    onDismiss()
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            AsyncImage(
                                model = pw.player.profileImage ?: "https://via.placeholder.com/48?text=?",
                                contentDescription = pw.player.fullName,
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(CircleShape),
                                contentScale = ContentScale.Crop
                            )
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(horizontal = 12.dp)
                            ) {
                                Text(
                                    text = pw.player.fullName ?: "—",
                                    style = boldTextStyle(HomeTextPrimary, 15.sp),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = pw.player.positions?.filterNotNull()?.joinToString(", ") ?: "—",
                                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }

            HorizontalDivider(
                modifier = Modifier.padding(vertical = 12.dp),
                color = HomeDarkCardBorder
            )
            Text(
                text = stringResource(R.string.shadow_teams_cancel),
                style = regularTextStyle(HomeTextSecondary, 14.sp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onDismiss() }
                    .padding(vertical = 12.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
    }
}
