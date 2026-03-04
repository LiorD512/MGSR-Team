package com.liordahan.mgsrteam.features.add

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

/**
 * Bottom sheet shown when user shares a Transfermarkt link.
 * - Add to shortlist: adds directly, dismisses, pops to dashboard
 * - Add to roster: shows contact form, on save dismisses and pops to dashboard
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddFromLinkBottomSheet(
    tmProfileUrl: String,
    onDismiss: () -> Unit,
    onPopToDashboard: () -> Unit,
    addPlayerViewModel: IAddPlayerViewModel,
    shortlistRepository: ShortlistRepository = koinInject()
) {
    val context = LocalContext.current
    val addPlayerState by addPlayerViewModel.playerSearchStateFlow.collectAsStateWithLifecycle()
    val selectedPlayer by addPlayerViewModel.selectedPlayerFlow.collectAsStateWithLifecycle(initialValue = null)
    val isPlayerAdded by addPlayerViewModel.isPlayerAddedFlow.collectAsStateWithLifecycle(initialValue = false)

    var showAddRosterForm by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(tmProfileUrl) {
        if (!showAddRosterForm) {
            addPlayerViewModel.loadPlayerByTmProfileUrl(tmProfileUrl)
        }
    }

    LaunchedEffect(isPlayerAdded) {
        if (isPlayerAdded) {
            addPlayerViewModel.resetAfterAdd()
            onDismiss()
            onPopToDashboard()
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PlatformColors.palette.card,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        tonalElevation = 8.dp,
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp)
        ) {
            when {
                showAddRosterForm && selectedPlayer != null -> {
                    AddPlayerContactFormContent(context = context, viewModel = addPlayerViewModel)
                }
                showAddRosterForm && addPlayerState.showPlayerSelectedSearchProgress -> {
                    Box(
                        modifier = Modifier.fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = PlatformColors.palette.accent)
                    }
                    Spacer(Modifier.height(24.dp))
                }
                showAddRosterForm -> {
                    Text(
                        text = stringResource(R.string.shortlist_could_not_load),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                    )
                }
                !showAddRosterForm && addPlayerState.showPlayerSelectedSearchProgress -> {
                    Box(
                        modifier = Modifier.fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = PlatformColors.palette.accent)
                    }
                    Spacer(Modifier.height(24.dp))
                    Text(
                        text = stringResource(R.string.add_player_from_link_title),
                        style = boldTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                    )
                }
                !showAddRosterForm && selectedPlayer == null -> {
                    Text(
                        text = stringResource(R.string.shortlist_could_not_load),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp),
                        modifier = Modifier.padding(24.dp)
                    )
                }
                else -> {
                    Text(
                        text = stringResource(R.string.add_player_from_link_title),
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
                    )
                    Spacer(Modifier.height(20.dp))
                    TextButton(
                        onClick = {
                            selectedPlayer?.let { player ->
                                scope.launch {
                                    val release = LatestTransferModel(
                                        playerImage = player.profileImage,
                                        playerName = player.fullName,
                                        playerUrl = player.tmProfile,
                                        playerPosition = player.positions?.firstOrNull(),
                                        playerAge = player.age,
                                        playerNationality = player.nationality,
                                        playerNationalityFlag = player.nationalityFlag,
                                        clubJoinedLogo = player.currentClub?.clubLogo,
                                        clubJoinedName = player.currentClub?.clubName,
                                        marketValue = player.marketValue
                                    )
                                    when (shortlistRepository.addToShortlist(release)) {
                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.Added ->
                                            ToastManager.showSuccess(context.getString(R.string.shortlist_added))
                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.AlreadyInShortlist ->
                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_shortlist))
                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_roster))
                                    }
                                    addPlayerViewModel.resetAfterAdd()
                                    onDismiss()
                                    onPopToDashboard()
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = selectedPlayer != null
                    ) {
                        Icon(Icons.Filled.Person, contentDescription = null, tint = PlatformColors.palette.accent, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.add_player_from_link_shortlist),
                            style = regularTextStyle(PlatformColors.palette.textPrimary, 16.sp)
                        )
                    }
                    TextButton(
                        onClick = { showAddRosterForm = true },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = selectedPlayer != null
                    ) {
                        Icon(Icons.Filled.PersonAdd, contentDescription = null, tint = PlatformColors.palette.accent, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.add_player_from_link_roster),
                            style = regularTextStyle(PlatformColors.palette.textPrimary, 16.sp)
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = {
                            addPlayerViewModel.resetAfterAdd()
                            onDismiss()
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(android.R.string.cancel), style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp))
                    }
                }
            }
        }
    }
}
