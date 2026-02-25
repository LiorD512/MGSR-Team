package com.liordahan.mgsrteam.features.shadowteams

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShadowTeamsSlotMenuBottomSheet(
    player: ShadowPlayer,
    positionLabel: String,
    onDismiss: () -> Unit,
    onViewProfile: () -> Unit,
    onChangePlayer: () -> Unit,
    onRemove: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = HomeDarkCard,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AsyncImage(
                    model = player.profileImage ?: "https://via.placeholder.com/56?text=?",
                    contentDescription = player.fullName,
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
                Column(modifier = Modifier.padding(start = 16.dp)) {
                    Text(
                        text = player.fullName,
                        style = boldTextStyle(HomeTextPrimary, 18.sp)
                    )
                    Text(
                        text = positionLabel,
                        style = regularTextStyle(HomeTextSecondary, 14.sp)
                    )
                }
            }

            HorizontalDivider(color = HomeDarkCardBorder, modifier = Modifier.padding(vertical = 8.dp))

            MenuOption(
                icon = Icons.Default.Person,
                label = stringResource(R.string.shadow_teams_view_profile),
                onClick = {
                    onDismiss()
                    onViewProfile()
                }
            )
            MenuOption(
                icon = Icons.Default.Refresh,
                label = stringResource(R.string.shadow_teams_change_player),
                onClick = {
                    onDismiss()
                    onChangePlayer()
                }
            )
            MenuOption(
                icon = Icons.Default.RemoveCircle,
                label = stringResource(R.string.shadow_teams_remove),
                onClick = {
                    onDismiss()
                    onRemove()
                }
            )
        }
    }
}

@Composable
private fun MenuOption(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(HomeDarkBackground)
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = HomeTealAccent,
            modifier = Modifier.size(24.dp)
        )
        Text(
            text = label,
            style = regularTextStyle(HomeTextPrimary, 16.sp)
        )
    }
}
