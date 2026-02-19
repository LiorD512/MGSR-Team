package com.liordahan.mgsrteam.features.players.playerinfo

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.ManagedActivityResultLauncher
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.PersonAddAlt
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Whatsapp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.add.getPhoneNumberFromContactUri
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.features.players.playerinfo.notes.AddNoteBottomSheet
import com.liordahan.mgsrteam.features.players.playerinfo.notes.AllNotesScreen
import com.liordahan.mgsrteam.features.players.playerinfo.notes.NotesSection
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getAgentPhoneNumber
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import com.liordahan.mgsrteam.features.players.playerinfo.ai.ScoutReportOptions
import com.liordahan.mgsrteam.features.players.playerinfo.ai.SimilarPlayersOptions
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentsSection
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.MatchingRequestsSection
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions
import com.liordahan.mgsrteam.features.requests.models.TransferFeeOptions
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.theme.redErrorColor
import com.liordahan.mgsrteam.ui.components.SkeletonPlayerInfoLayout
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerInfoScreen(
    viewModel: IPlayerInfoViewModel = koinViewModel(),
    playerId: String,
    navController: NavController
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    var playerToPresent by remember {
        mutableStateOf<Player?>(null)
    }

    val scrollState = rememberScrollState()


    var showLoader by remember {
        mutableStateOf(true)
    }

    // Minimum time to show skeleton so it's visible (avoids flash when data loads fast)
    LaunchedEffect(playerToPresent) {
        if (playerToPresent != null) {
            delay(400)
            showLoader = false
        } else {
            showLoader = true
        }
    }

    val playerNumberLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickContact()
    ) { contactUri ->
        contactUri?.let {
            val phone = getPhoneNumberFromContactUri(context, it)
            if (phone != null) {
                viewModel.updatePlayerNumber(phone)
            }
        }
    }

    val playerNumberPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted ->
            if (isGranted) {
                playerNumberLauncher.launch(null)
            }
        }
    )

    val agentNumberLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickContact()
    ) { contactUri ->
        contactUri?.let {
            val phone = getPhoneNumberFromContactUri(context, it)
            if (phone != null) {
                viewModel.updateAgentNumber(phone)
            }
        }
    }

    val agentNumberPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted ->
            if (isGranted) {
                agentNumberLauncher.launch(null)
            }
        }
    )

    val documentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let {
            try {
                context.contentResolver.openInputStream(it)?.use { stream ->
                    val bytes = stream.readBytes()
                    val name = context.contentResolver.query(it, null, null, null, null)?.use { cursor ->
                        val nameIdx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                        if (cursor.moveToFirst() && nameIdx >= 0) cursor.getString(nameIdx) else "document"
                    } ?: "document"
                    val mimeType = context.contentResolver.getType(it)
                    viewModel.uploadDocument(it, bytes, name, mimeType, null)
                }
            } catch (_: Exception) { }
        }
    }

    val isRefreshingPlayer by viewModel.updatePlayerFlow.collectAsState(initial = UiResult.UnInitialized)

    var showDeletePlayerIcon by remember { mutableStateOf(false) }

    var showDeleteDialog by remember { mutableStateOf(false) }
    var showInstagramDialog by remember { mutableStateOf(false) }
    var showSalaryTransferFeeSheet by remember { mutableStateOf(false) }
    var showAddNoteSheet by remember { mutableStateOf(false) }
    var showAllNotes by remember { mutableStateOf(false) }
    var documentsList by remember { mutableStateOf<List<PlayerDocument>>(emptyList()) }
    var docToDelete by remember { mutableStateOf<PlayerDocument?>(null) }
    var isUploadingDocument by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {

        launch {
            viewModel.getPlayerInfo(playerId)
        }

        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.playerInfoFlow.collect {
                    playerToPresent = it
                }
            }


            launch {
                viewModel.updatePlayerFlow.collect {
                    when (it) {
                        is UiResult.Failed -> {
                            ToastManager.showError(it.cause)
                            viewModel.consumeUpdateResult()
                        }
                        is UiResult.Success -> {
                            ToastManager.showSuccess(it.data)
                            viewModel.consumeUpdateResult()
                        }
                        UiResult.Loading, UiResult.UnInitialized -> {}
                    }
                }
            }

            launch {
                viewModel.showDeletePlayerIconFlow.collect {
                    showDeletePlayerIcon = it
                }
            }

            launch {
                viewModel.isUploadingDocumentFlow.collect {
                    isUploadingDocument = it
                }
            }
            launch {
                viewModel.documentsFlow.collect {
                    documentsList = it
                }
            }

            launch {
                viewModel.uploadErrorFlow.collect { errorKey ->
                    val message = when (errorKey) {
                        "passport_already_exists" -> context.getString(R.string.player_info_passport_already_exists)
                        else -> errorKey
                    }
                    ToastManager.showError(message)
                }
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground
    ) { paddingValues ->

        if (showLoader) {
            SkeletonPlayerInfoLayout(
                modifier = Modifier
                    .fillMaxSize()
                    .background(HomeDarkBackground)
            )
            return@Scaffold
        }

        if (showDeleteDialog) {
            DeletePlayerDialog(
                onDismissRequest = { showDeleteDialog = false },
                onDeletePlayerClicked = {
                    showDeleteDialog = false
                    viewModel.deletePlayer(
                        playerToPresent?.tmProfile ?: "",
                        onDeleteSuccessfully = { navController.popBackStack() })
                }
            )
        }
        if (showAddNoteSheet) {
            AddNoteBottomSheet(
                onDismiss = { showAddNoteSheet = false },
                onSaveNote = { text ->
                    viewModel.updateNotes(
                        NotesModel(
                            notes = text,
                            createBy = "",
                            createdAt = Date().time
                        )
                    )
                    showAddNoteSheet = false
                }
            )
        }
        if (showAllNotes) {
            AllNotesScreen(
                noteList = playerToPresent?.noteList.orEmpty(),
                onBackClick = { showAllNotes = false },
                onAddNote = { text ->
                    viewModel.updateNotes(
                        NotesModel(
                            notes = text,
                            createBy = "",
                            createdAt = Date().time
                        )
                    )
                },
                onDeleteNote = { viewModel.onDeleteNoteClicked(it) }
            )
            return@Scaffold
        }
        if (docToDelete != null) {
            DeleteDocumentDialog(
                documentName = docToDelete?.name ?: docToDelete?.documentType?.displayName ?: "document",
                onDismissRequest = { docToDelete = null },
                onDeleteClicked = {
                    docToDelete?.let { doc ->
                        doc.id?.let { viewModel.deleteDocument(it, doc.documentType == DocumentType.PASSPORT) }
                    }
                    docToDelete = null
                }
            )
        }
        if (showSalaryTransferFeeSheet) {
            playerToPresent?.let { player ->
                SalaryTransferFeeBottomSheet(
                    currentSalaryRange = player.salaryRange,
                    currentTransferFee = player.transferFee,
                    onDismiss = { showSalaryTransferFeeSheet = false },
                    onSave = { salaryRange, transferFee ->
                        viewModel.updateSalaryRange(salaryRange)
                        viewModel.updateTransferFee(transferFee)
                        showSalaryTransferFeeSheet = false
                    }
                )
            }
        }

        val shareAction: () -> Unit = {
            com.liordahan.mgsrteam.analytics.AnalyticsHelper.logSharePlayer(playerToPresent?.tmProfile)
            val textToSend = buildAnnotatedString {
                playerToPresent?.let { player ->
                    appendLine(player.tmProfile ?: "")
                    append("\n\n")
                    appendLine(
                        listOfNotNull(
                            player.fullName,
                            player.positions?.getOrNull(0),
                            player.age,
                            player.height?.replace("m", ""),
                            player.nationality
                        ).joinToString(", ")
                    )
                    append(context.getString(R.string.player_info_current_club_share, player.currentClub?.clubName ?: context.getString(R.string.player_info_unknown)))
                } ?: append(context.getString(R.string.player_info_player_data_not_available))
            }
            sharePlayerOnWhatsapp(context, textToSend.toString())
        }

        val isRefreshing = isRefreshingPlayer is UiResult.Loading

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            PlayerInfoHeader(onBackClicked = { navController.popBackStack() })

            Box(modifier = Modifier.weight(1f)) {
                PullToRefreshBox(
                    isRefreshing = isRefreshing,
                    onRefresh = { viewModel.refreshPlayerInfo() },
                    modifier = Modifier.fillMaxSize(),
                    indicator = { } // Use custom overlay instead
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .then(
                                if (isRefreshing) Modifier.blur(16.dp)
                                else Modifier
                            )
                            .padding(top = 4.dp)
                    ) {
            // Hero Card
            playerToPresent?.let { player ->
                val mandateExpiry = documentsList
                    .filter { it.documentType == DocumentType.MANDATE }
                    .mapNotNull { it.expiresAt }
                    .maxOrNull()
                PlayerInfoHeroCard(
                    player = player,
                    mandateExpiryAt = mandateExpiry,
                    onMandateChanged = { viewModel.updateHaveMandate(it) },
                    onSalaryTransferFeeClicked = { showSalaryTransferFeeSheet = true },
                    onClearSalaryAndTransferFee = {
                        viewModel.updateSalaryRange(null)
                        viewModel.updateTransferFee(null)
                    }
                )
            }

            // Quick Actions
            playerToPresent?.let { player ->
                PlayerInfoQuickActions(
                    player = player,
                    context = context,
                    onEditPlayerNumber = {
                        launchPlayerContactPicker(
                            context,
                            playerNumberLauncher,
                            playerNumberPermissionLauncher
                        )
                    },
                    onRemovePlayerNumber = { viewModel.updatePlayerNumber("") },
                    onEditAgentNumber = {
                        launchPlayerContactPicker(
                            context,
                            agentNumberLauncher,
                            agentNumberPermissionLauncher
                        )
                    },
                    onRemoveAgentNumber = { viewModel.updateAgentNumber("") },
                    onEditInstagram = { showInstagramDialog = true },
                    onUpdateInstagram = { viewModel.updateInstagramProfile(it) }
                )
            }

            if (showInstagramDialog) {
                playerToPresent?.let { player ->
                    InstagramEditDialog(
                        currentUrl = player.instagramProfile,
                        onDismiss = { showInstagramDialog = false },
                        onSave = { url ->
                            viewModel.updateInstagramProfile(url)
                            showInstagramDialog = false
                        }
                    )
                }
            }

            // Section: AI Helper
            playerToPresent?.let { player ->
                PlayerInfoAiHelperSection(
                    player = player,
                    viewModel = viewModel
                )
            }

            // Section: Matching Requests
            playerToPresent?.let { player ->
                val matchingRequests by viewModel.matchingRequestsFlow.collectAsState(initial = emptyList())
                val allAccounts by viewModel.allAccountsFlow.collectAsState(initial = emptyList())
                PlayerInfoSectionHeader(stringResource(R.string.player_info_matching_requests))
                MatchingRequestsSection(
                    matchingRequests = matchingRequests,
                    player = player,
                    allAccounts = allAccounts,
                    viewModel = viewModel
                )
            }

            // Section: General Info
            PlayerInfoSectionHeader(stringResource(R.string.player_info_general_info))
            PlayerInfoCard(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                InfoRow(
                        stringResource(R.string.player_info_height),
                        playerToPresent?.height?.replace(",", "."),
                        darkTheme = true,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_height),
                                contentDescription = null,
                                tint = HomeTextSecondary
                            )
                        })
                    HorizontalDivider(
                        color = HomeDarkCardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    InfoRow(
                        stringResource(R.string.player_info_age),
                        playerToPresent?.age,
                        darkTheme = true,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                imageVector = Icons.Default.CalendarMonth,
                                contentDescription = null,
                                tint = HomeTextSecondary
                            )
                        })
                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    InfoRow(
                        stringResource(R.string.player_info_positions),
                        playerToPresent?.positions?.filterNotNull()?.joinToString(", "),
                        darkTheme = true,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_soccer),
                                contentDescription = null,
                                tint = HomeTextSecondary
                            )
                        }
                    )
                    HorizontalDivider(
                        color = HomeDarkCardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    val localizedFoot = when (playerToPresent?.foot?.lowercase()) {
                        "right" -> stringResource(R.string.player_info_foot_right)
                        "left" -> stringResource(R.string.player_info_foot_left)
                        "both" -> stringResource(R.string.player_info_foot_both)
                        else -> playerToPresent?.foot
                    }
                    InfoRow(
                        stringResource(R.string.player_info_foot),
                        localizedFoot,
                        darkTheme = true,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_foot),
                                contentDescription = null,
                                tint = HomeTextSecondary
                            )
                        }
                    )
                    HorizontalDivider(
                        color = HomeDarkCardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    NationalityInfoRow(
                        stringResource(R.string.player_info_nationality),
                        playerToPresent?.nationality,
                        playerToPresent?.nationalityFlag,
                        darkTheme = true
                    )

                    HorizontalDivider(
                        color = HomeDarkCardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    InfoRow(
                        stringResource(R.string.player_info_contract_expiry_date),
                        getContractStatus(
                            LocalContext.current.resources,
                            playerToPresent?.contractExpired?.replace("/", ".") ?: ""
                        ),
                        darkTheme = true,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_contract),
                                contentDescription = null,
                                tint = HomeTextSecondary
                            )
                        })

                    HorizontalDivider(
                        color = HomeDarkCardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    ClubInfoRow(
                        stringResource(R.string.player_info_current_club),
                        playerToPresent?.currentClub?.clubName,
                        playerToPresent?.currentClub?.clubLogo,
                        darkTheme = true
                    )

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    AgencyInfoRow(
                        title = stringResource(R.string.player_info_agency),
                        agencyName = playerToPresent?.agency,
                        agencyUrl = playerToPresent?.agencyUrl,
                        onRemoveAgency = if (playerToPresent?.agency != null || playerToPresent?.agencyUrl != null) {
                            { viewModel.clearAgency() }
                        } else null
                    )

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    InfoRow(
                        stringResource(R.string.player_info_market_value),
                        playerToPresent?.marketValue?.let { value ->
                            val trend = playerToPresent?.let { playerInfoComputeValueTrend(it.marketValueHistory) } ?: 0
                            when {
                                trend > 0 -> "$value ↑"
                                trend < 0 -> "$value ↓"
                                else -> value
                            }
                        },
                        darkTheme = true,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_euro),
                                contentDescription = null,
                                tint = HomeTextSecondary
                            )
                        }
                    )

                    playerToPresent?.marketValueHistory?.takeIf { it.size > 1 }?.let { history ->
                        val previous = history.sortedByDescending { it.date }.getOrNull(1)
                        previous?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.player_info_previously, it.value ?: "", SimpleDateFormat("dd.MM.yy", Locale.getDefault()).format(Date(it.date ?: 0))),
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                modifier = Modifier.padding(start = 28.dp)
                            )
                        }
                    }

                }
            // Contact Info section removed - edit/delete moved to Quick Actions long-press

            PlayerInfoSectionHeader(stringResource(R.string.player_info_documents))
            DocumentsSection(
                documents = documentsList,
                isUploading = isUploadingDocument,
                onAddDocument = { documentPickerLauncher.launch("*/*") },
                onDeleteDocument = { docToDelete = it }
            )

            PlayerInfoSectionHeader(stringResource(R.string.player_info_notes))
            NotesSection(
                noteList = playerToPresent?.noteList,
                onAddNoteClicked = { showAddNoteSheet = true },
                onDeleteNote = { viewModel.onDeleteNoteClicked(it) },
                onViewAllClicked = { showAllNotes = true }
            )
            }
                    }
                if (isRefreshing) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.3f))
                            .zIndex(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = HomeTealAccent,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(48.dp)
                        )
                    }
                }
            }

            val hasValidMandate = documentsList.any {
                it.documentType == DocumentType.MANDATE &&
                    !it.expired &&
                    (it.expiresAt == null || it.expiresAt >= System.currentTimeMillis())
            }
            PlayerInfoBottomBar(
                showDeletePlayerIcon = showDeletePlayerIcon,
                hasPassportDetails = playerToPresent?.passportDetails != null,
                hasValidMandate = hasValidMandate,
                onDeletePlayerClicked = { showDeleteDialog = true },
                onShareClicked = shareAction,
                onGenerateMandateClicked = {
                    navController.navigate("${Screens.GenerateMandateScreen.route}/${Uri.encode(playerId)}")
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SalaryTransferFeeBottomSheet(
    currentSalaryRange: String?,
    currentTransferFee: String?,
    onDismiss: () -> Unit,
    onSave: (salaryRange: String?, transferFee: String?) -> Unit
) {
    var selectedSalaryRange by remember(currentSalaryRange) { mutableStateOf(currentSalaryRange) }
    var selectedTransferFee by remember(currentTransferFee) { mutableStateOf(currentTransferFee) }
    LaunchedEffect(currentSalaryRange, currentTransferFee) {
        selectedSalaryRange = currentSalaryRange
        selectedTransferFee = currentTransferFee
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = HomeDarkCard,
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp)
                .navigationBarsPadding()
        ) {
            Text(
                text = stringResource(R.string.player_info_salary_transfer_fee_sheet_title),
                style = boldTextStyle(HomeTextPrimary, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            HorizontalDivider(color = HomeDarkCardBorder, thickness = 1.dp)
            Spacer(Modifier.height(16.dp))

            Text(
                stringResource(R.string.requests_label_salary_range),
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                modifier = Modifier.padding(bottom = 10.dp)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SalaryRangeOptions.all.forEach { range ->
                    val isSelected = selectedSalaryRange == range
                    Text(
                        text = range,
                        style = regularTextStyle(if (isSelected) HomeTealAccent else HomeTextSecondary, 12.sp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent)
                            .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(20.dp))
                            .clickWithNoRipple { selectedSalaryRange = if (isSelected) null else range }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            Text(
                stringResource(R.string.requests_label_transfer_fee),
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                modifier = Modifier.padding(bottom = 10.dp)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TransferFeeOptions.all.forEach { fee ->
                    val isSelected = selectedTransferFee == fee
                    val displayFee = when (fee) {
                        "Free/Free loan" -> stringResource(R.string.requests_transfer_fee_free_loan)
                        "<200" -> stringResource(R.string.requests_transfer_fee_lt200)
                        else -> fee
                    }
                    Text(
                        text = displayFee,
                        style = regularTextStyle(if (isSelected) HomeTealAccent else HomeTextSecondary, 12.sp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent)
                            .border(1.dp, if (isSelected) HomeTealAccent else HomeDarkCardBorder, RoundedCornerShape(20.dp))
                            .clickWithNoRipple { selectedTransferFee = if (isSelected) null else fee }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
                }
                Button(
                    onClick = {
                        onSave(selectedSalaryRange, selectedTransferFee)
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HomeTealAccent,
                        contentColor = Color.White
                    )
                ) {
                    Text(stringResource(R.string.contacts_button_save), style = boldTextStyle(Color.White, 14.sp))
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlayerInfoHeroCard(
    player: Player,
    mandateExpiryAt: Long? = null,
    onMandateChanged: (Boolean) -> Unit,
    onSalaryTransferFeeClicked: () -> Unit = {},
    onClearSalaryAndTransferFee: () -> Unit = {}
) {
    val resources = LocalContext.current.resources
    val valueTrend = remember(player.marketValueHistory) {
        playerInfoComputeValueTrend(player.marketValueHistory)
    }
    val contractCountdown = remember(player.contractExpired, resources) {
        playerInfoGetContractCountdown(resources, player.contractExpired)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            AsyncImage(
                model = player.profileImage ?: "",
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .border(2.dp, HomeDarkCardBorder, CircleShape)
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = player.fullName ?: stringResource(R.string.player_info_unknown),
                style = boldTextStyle(HomeTextPrimary, 22.sp)
            )
            if (player.isOnLoan) {
                Spacer(Modifier.height(6.dp))
                val loanText = player.onLoanFromClub?.let { club ->
                    stringResource(R.string.players_on_loan_from, club)
                } ?: stringResource(R.string.players_on_loan)
                PlayerInfoOnLoanPill(text = loanText)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = buildString {
                    player.positions?.firstOrNull()?.let { append(it) }
                    player.age?.let { append(" • $it ${stringResource(R.string.player_info_years_short)}") }
                    player.currentClub?.clubName?.let { append(" • $it") }
                }.ifEmpty { "—" },
                style = regularTextStyle(HomeTextSecondary, 13.sp)
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = stringResource(R.string.player_info_added_by, player.agentInChargeName ?: "—"),
                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.8f), 11.sp)
            )
            player.lastRefreshedAt?.takeIf { it > 0 }?.let { ts ->
                Spacer(Modifier.height(4.dp))
                Text(
                    text = playerInfoFormatLastRefreshed(resources, ts),
                    style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.7f), 11.sp)
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = player.marketValue ?: "—",
                        style = boldTextStyle(
                            when {
                                valueTrend > 0 -> HomeGreenAccent
                                valueTrend < 0 -> HomeRedAccent
                                else -> HomeTealAccent
                            },
                            14.sp
                        )
                    )
                    if (valueTrend != 0) {
                        Icon(
                            imageVector = if (valueTrend > 0) Icons.AutoMirrored.Filled.TrendingUp else Icons.AutoMirrored.Filled.TrendingDown,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = if (valueTrend > 0) HomeGreenAccent else HomeRedAccent
                        )
                    }
                }
                Box(modifier = Modifier.width(1.dp).height(14.dp).background(HomeDarkCardBorder))
                Text(
                    text = player.height?.replace(",", ".") ?: "—",
                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                )
                Box(modifier = Modifier.width(1.dp).height(14.dp).background(HomeDarkCardBorder))
                Text(
                    text = player.nationality ?: "—",
                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                )
                AsyncImage(
                    model = player.nationalityFlag,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp).clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            }
            contractCountdown?.let { text ->
                Spacer(Modifier.height(8.dp))
                val isExpired = text == resources.getString(R.string.player_info_expired)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            if (isExpired) HomeRedAccent.copy(alpha = 0.15f)
                            else HomeOrangeAccent.copy(alpha = 0.15f)
                        )
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = stringResource(R.string.player_info_contract, text),
                        style = boldTextStyle(
                            if (isExpired) HomeRedAccent else HomeOrangeAccent,
                            11.sp
                        )
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(HomeDarkBackground)
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                var isMandateOn by remember(player.haveMandate) { mutableStateOf(player.haveMandate) }
                LaunchedEffect(player.haveMandate) { isMandateOn = player.haveMandate }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = if (isMandateOn) HomeBlueAccent else HomeTextSecondary
                    )
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(
                            text = stringResource(R.string.player_info_mandate),
                            style = boldTextStyle(
                                if (isMandateOn) HomeBlueAccent else HomeTextSecondary,
                                16.sp
                            )
                        )
                        if (isMandateOn && mandateExpiryAt != null) {
                            val mandateExpiryStr = SimpleDateFormat("dd/MM/yyyy", Locale.US).format(
                                Date(mandateExpiryAt)
                            )
                            Text(
                                text = mandateExpiryStr,
                                style = regularTextStyle(
                                    if (isMandateOn) HomeBlueAccent else HomeTextSecondary,
                                    11.sp
                                )
                            )
                        }
                    }
                }
                Switch(
                    checked = isMandateOn,
                    onCheckedChange = {
                        isMandateOn = it
                        onMandateChanged(it)
                    },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = HomeBlueAccent,
                        uncheckedThumbColor = HomeTextSecondary,
                        uncheckedTrackColor = HomeDarkCardBorder
                    )
                )
            }
            Spacer(Modifier.height(8.dp))
            val hasSalaryOrFee = player.salaryRange?.isNotBlank() == true || player.transferFee?.isNotBlank() == true
            var showClearSalaryMenu by remember { mutableStateOf(false) }
            Box {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(HomeDarkBackground)
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                        .combinedClickable(
                            onClick = onSalaryTransferFeeClicked,
                            onLongClick = { if (hasSalaryOrFee) showClearSalaryMenu = true }
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            text = stringResource(R.string.player_info_salary_transfer_fee),
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        val salaryStr = player.salaryRange?.takeIf { it.isNotBlank() } ?: "—"
                        val feeDisplay = when (player.transferFee) {
                            "Free/Free loan" -> stringResource(R.string.requests_transfer_fee_free_loan)
                            "<200" -> stringResource(R.string.requests_transfer_fee_lt200)
                            else -> player.transferFee?.takeIf { it.isNotBlank() } ?: "—"
                        }
                        Text(
                            text = "$salaryStr • $feeDisplay",
                            style = regularTextStyle(HomeTealAccent, 11.sp),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = HomeTealAccent
                    )
                }
                DropdownMenu(
                    expanded = showClearSalaryMenu,
                    onDismissRequest = { showClearSalaryMenu = false },
                    containerColor = HomeDarkCard
                ) {
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = HomeRedAccent
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.player_info_remove_salary_transfer_fee),
                                    style = regularTextStyle(HomeRedAccent, 14.sp)
                                )
                            }
                        },
                        onClick = {
                            showClearSalaryMenu = false
                            onClearSalaryAndTransferFee()
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayerInfoOnLoanPill(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(HomePurpleAccent, Color(0xFF7B1FA2))
                )
            )
            .padding(horizontal = 12.dp, vertical = 5.dp)
    ) {
        Text(
            text = text,
            style = boldTextStyle(Color.White, 11.sp),
            maxLines = 1
        )
    }
}

@Composable
private fun PlayerInfoQuickActions(
    player: Player,
    context: Context,
    onEditPlayerNumber: () -> Unit,
    onRemovePlayerNumber: () -> Unit,
    onEditAgentNumber: () -> Unit,
    onRemoveAgentNumber: () -> Unit,
    onEditInstagram: () -> Unit,
    onUpdateInstagram: (String?) -> Unit
) {
    val playerPhone = player.getPlayerPhoneNumber()
    val agentPhone = player.getAgentPhoneNumber()
    val hasTmProfile = player.tmProfile != null
    val instagramProfile = player.instagramProfile

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Player phone action
            PlayerInfoPhoneAction(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.player_info_player_label),
                phone = playerPhone,
                context = context,
                onEditNumber = onEditPlayerNumber,
                onRemoveNumber = onRemovePlayerNumber
            )

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(32.dp)
                    .background(HomeDarkCardBorder)
            )

            // Agent phone action
            PlayerInfoPhoneAction(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.player_info_agent_label),
                phone = agentPhone,
                context = context,
                onEditNumber = onEditAgentNumber,
                onRemoveNumber = onRemoveAgentNumber
            )

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(32.dp)
                    .background(HomeDarkCardBorder)
            )

            // Instagram action
            PlayerInfoInstagramAction(
                modifier = Modifier.weight(1f),
                instagramProfile = instagramProfile,
                context = context,
                onEditInstagram = onEditInstagram,
                onRemoveInstagram = { onUpdateInstagram(null) }
            )

            if (hasTmProfile) {
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp)
                        .background(HomeDarkCardBorder)
                )
                ContactActionChip(
                    modifier = Modifier.weight(1f),
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Link,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                            tint = HomeTealAccent
                        )
                    },
                    label = stringResource(R.string.player_info_tm_short),
                    onClick = {
                        val url = player.tmProfile
                        if (url != null) {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun ContactActionChip(
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
    label: String,
    onClick: () -> Unit
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickWithNoRipple(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier.size(28.dp),
            contentAlignment = Alignment.Center
        ) {
            icon()
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            style = boldTextStyle(HomeTextSecondary, 11.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlayerInfoPhoneAction(
    modifier: Modifier = Modifier,
    label: String,
    phone: String?,
    context: Context,
    onEditNumber: () -> Unit,
    onRemoveNumber: () -> Unit
) {
    val hasPhone = !phone.isNullOrBlank()
    var showMenu by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (hasPhone) {
                        Modifier.combinedClickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {
                                val clean = phone.orEmpty().filter { it.isDigit() }
                                context.startActivity(
                                    Intent(
                                        Intent.ACTION_VIEW,
                                        Uri.parse("https://wa.me/$clean")
                                    )
                                )
                            },
                            onLongClick = { showMenu = true }
                        )
                    } else {
                        Modifier.clickWithNoRipple { onEditNumber() }
                    }
                )
                .padding(vertical = 12.dp, horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier.size(28.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (hasPhone) Icons.Default.Whatsapp else Icons.Default.PersonAddAlt,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = HomeTealAccent
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = label,
                    style = boldTextStyle(HomeTextSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center
                )
            }
        }

        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = HomeDarkCard,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_message_whatsapp),
                        style = regularTextStyle(HomeTextPrimary, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Whatsapp,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = HomeTealAccent
                    )
                },
                onClick = {
                    showMenu = false
                    val clean = phone.orEmpty().filter { it.isDigit() }
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$clean"))
                    )
                }
            )
            HorizontalDivider(
                color = HomeDarkCardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_edit_number),
                        style = regularTextStyle(HomeTextPrimary, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = HomeTealAccent
                    )
                },
                onClick = {
                    showMenu = false
                    onEditNumber()
                }
            )
            HorizontalDivider(
                color = HomeDarkCardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_remove_number),
                        style = regularTextStyle(HomeRedAccent, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = HomeRedAccent
                    )
                },
                onClick = {
                    showMenu = false
                    onRemoveNumber()
                }
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlayerInfoInstagramAction(
    modifier: Modifier = Modifier,
    instagramProfile: String?,
    context: Context,
    onEditInstagram: () -> Unit,
    onRemoveInstagram: () -> Unit
) {
    val hasInstagram = !instagramProfile.isNullOrBlank()
    var showMenu by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (hasInstagram) {
                        Modifier.combinedClickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {
                                val url = instagramProfile.orEmpty().trim()
                                val normalized = when {
                                    url.startsWith("http") -> url
                                    url.startsWith("instagram.com") -> "https://$url"
                                    else -> "https://instagram.com/$url"
                                }
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse(normalized))
                                )
                            },
                            onLongClick = { showMenu = true }
                        )
                    } else {
                        Modifier.clickWithNoRipple { onEditInstagram() }
                    }
                )
                .padding(vertical = 12.dp, horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier.size(28.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_instagram),
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = HomeTealAccent
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = if (hasInstagram) stringResource(R.string.player_info_ig_short) else stringResource(R.string.player_info_add),
                    style = boldTextStyle(HomeTextSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center
                )
            }
        }

        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = HomeDarkCard,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_open_instagram),
                        style = regularTextStyle(HomeTextPrimary, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        painter = painterResource(R.drawable.ic_instagram),
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = HomeTealAccent
                    )
                },
                onClick = {
                    showMenu = false
                    val url = instagramProfile.orEmpty().trim()
                    val normalized = when {
                        url.startsWith("http") -> url
                        url.startsWith("instagram.com") -> "https://$url"
                        else -> "https://instagram.com/$url"
                    }
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(normalized)))
                }
            )
            HorizontalDivider(
                color = HomeDarkCardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_edit_instagram),
                        style = regularTextStyle(HomeTextPrimary, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = HomeTealAccent
                    )
                },
                onClick = {
                    showMenu = false
                    onEditInstagram()
                }
            )
            HorizontalDivider(
                color = HomeDarkCardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_remove_instagram),
                        style = regularTextStyle(HomeRedAccent, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = HomeRedAccent
                    )
                },
                onClick = {
                    showMenu = false
                    onRemoveInstagram()
                }
            )
        }
    }
}

@Composable
private fun InstagramEditDialog(
    currentUrl: String?,
    onDismiss: () -> Unit,
    onSave: (String?) -> Unit
) {
    var input by remember { mutableStateOf(currentUrl?.takeIf { it.isNotBlank() } ?: "") }

    fun normalizeInstagramUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        return when {
            trimmed.startsWith("http") -> trimmed.trimEnd('/')
            trimmed.startsWith("instagram.com") -> "https://$trimmed".trimEnd('/')
            trimmed.contains("/") -> "https://$trimmed".trimEnd('/')
            else -> "https://instagram.com/$trimmed".trimEnd('/')
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.player_info_edit_instagram),
                    style = boldTextStyle(HomeTextPrimary, 18.sp)
                )
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = {
                        Text(
                            text = stringResource(R.string.player_info_instagram_hint),
                            style = regularTextStyle(HomeTextSecondary, 14.sp)
                        )
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = HomeTextPrimary,
                        unfocusedTextColor = HomeTextPrimary,
                        focusedBorderColor = HomeTealAccent,
                        unfocusedBorderColor = HomeDarkCardBorder,
                        cursorColor = HomeTealAccent,
                        focusedContainerColor = HomeDarkCard,
                        unfocusedContainerColor = HomeDarkCard
                    )
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(stringResource(R.string.player_info_matching_requests_cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { onSave(normalizeInstagramUrl(input)) },
                        colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent)
                    ) {
                        Text(stringResource(android.R.string.ok), style = boldTextStyle(HomeTextPrimary, 14.sp))
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerInfoAiHelperSection(
    player: Player,
    viewModel: IPlayerInfoViewModel,
    shortlistRepository: ShortlistRepository = koinInject()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsState(initial = emptyList())
    val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
    var justAddedUrls by remember { mutableStateOf<Set<String>>(emptySet()) }
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsState(initial = emptySet())
    var isFindSimilarExpanded by remember { mutableStateOf(false) }
    var expandedSimilarIndex by remember { mutableStateOf<Int?>(null) }
    var similarPlayersOptions by remember { mutableStateOf(SimilarPlayersOptions()) }
    val similarPlayers by viewModel.similarPlayersFlow.collectAsState()
    val isSimilarLoading by viewModel.isSimilarPlayersLoading.collectAsState()
    var isScoutReportExpanded by remember { mutableStateOf(false) }
    var scoutReportOptions by remember { mutableStateOf(ScoutReportOptions()) }
    val scoutReport by viewModel.scoutReportFlow.collectAsState()
    val isScoutReportLoading by viewModel.isScoutReportLoading.collectAsState()

    PlayerInfoSectionHeader(stringResource(R.string.player_info_ai_helper))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Hidden Gem Potential
        val hiddenGem by viewModel.hiddenGemFlow.collectAsState()
        val isHiddenGemLoading by viewModel.isHiddenGemLoading.collectAsState()
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple {
                    if (hiddenGem == null && !isHiddenGemLoading) {
                        viewModel.computeHiddenGemScore(player, LocaleManager.getSavedLanguage(context))
                    }
                },
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .drawBehind {
                        drawRect(
                            color = if (hiddenGem != null && (hiddenGem?.score ?: 0) >= 60) Color(0xFFE6B800) else HomeTealAccent,
                            topLeft = Offset.Zero,
                            size = Size(3.dp.toPx(), size.height)
                        )
                    }
                    .padding(start = 3.dp)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Star,
                    contentDescription = null,
                    tint = if (hiddenGem != null && (hiddenGem?.score ?: 0) >= 60) Color(0xFFE6B800) else HomeTealAccent,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.player_info_ai_hidden_gem),
                        style = boldTextStyle(HomeTextPrimary, 14.sp)
                    )
                    when {
                        isHiddenGemLoading -> Text(
                            text = stringResource(R.string.player_info_ai_generating_scout_diamond_report),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                        hiddenGem != null -> {
                            Text(
                                text = stringResource(R.string.player_info_ai_hidden_gem_score, hiddenGem!!.score),
                                style = boldTextStyle(
                                    if (hiddenGem!!.score >= 60) Color(0xFFE6B800) else HomeTealAccent,
                                    13.sp
                                )
                            )
                            hiddenGem!!.reason?.let { reason ->
                                Text(
                                    text = reason,
                                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                            }
                        }
                        else -> Text(
                            text = stringResource(R.string.player_info_ai_hidden_gem_check),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                }
                if (hiddenGem != null && !isHiddenGemLoading) {
                    TextButton(
                        onClick = {
                            viewModel.computeHiddenGemScore(player, LocaleManager.getSavedLanguage(context))
                        }
                    ) {
                        Text(
                            stringResource(R.string.player_info_ai_hidden_gem_refresh),
                            style = regularTextStyle(HomeTealAccent, 12.sp)
                        )
                    }
                }
                if (isHiddenGemLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = HomeTealAccent,
                        strokeWidth = 2.dp
                    )
                }
            }
        }

        // Expandable: Find Similar Players
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple {
                    isFindSimilarExpanded = !isFindSimilarExpanded
                    if (isFindSimilarExpanded && similarPlayers.isEmpty() && !isSimilarLoading) {
                        viewModel.findSimilarPlayers(player, LocaleManager.getSavedLanguage(context), similarPlayersOptions)
                    }
                },
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .drawBehind {
                            drawRect(
                                color = HomeTealAccent,
                                topLeft = Offset.Zero,
                                size = Size(3.dp.toPx(), size.height)
                            )
                        }
                        .padding(start = 3.dp)
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.player_info_ai_find_similar_players),
                        style = boldTextStyle(HomeTextPrimary, 15.sp),
                        modifier = Modifier.weight(1f)
                    )
                    if (similarPlayers.isNotEmpty()) {
                        Text(
                            "(${similarPlayers.size})",
                            style = regularTextStyle(HomeTextSecondary, 12.sp),
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    }
                    Icon(
                        Icons.Default.ExpandMore,
                        contentDescription = if (isFindSimilarExpanded) "Collapse" else "Expand",
                        tint = HomeTextSecondary,
                        modifier = Modifier
                            .size(22.dp)
                            .graphicsLayer { rotationZ = if (isFindSimilarExpanded) 180f else 0f }
                    )
                }
                AnimatedVisibility(visible = isFindSimilarExpanded) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 17.dp, end = 12.dp, bottom = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Similar players options
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                stringResource(R.string.player_info_ai_options),
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(
                                    SimilarPlayersOptions.SimilarityMode.PLAYING_STYLE to R.string.player_info_ai_similarity_style,
                                    SimilarPlayersOptions.SimilarityMode.MARKET_VALUE to R.string.player_info_ai_similarity_value,
                                    SimilarPlayersOptions.SimilarityMode.POSITION_PROFILE to R.string.player_info_ai_similarity_position,
                                    SimilarPlayersOptions.SimilarityMode.ALL_ROUND to R.string.player_info_ai_similarity_all
                                ).forEach { (mode, resId) ->
                                    FilterChip(
                                        selected = similarPlayersOptions.similarityMode == mode,
                                        onClick = { similarPlayersOptions = similarPlayersOptions.copy(similarityMode = mode) },
                                        label = { Text(stringResource(resId), style = regularTextStyle(HomeTextPrimary, 11.sp)) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            containerColor = Color.Transparent,
                                            labelColor = HomeTextPrimary,
                                            selectedContainerColor = HomeTealAccent.copy(alpha = 0.4f),
                                            selectedLabelColor = HomeTealAccent
                                        ),
                                        border = BorderStroke(1.dp, if (similarPlayersOptions.similarityMode == mode) HomeTealAccent else HomeDarkCardBorder)
                                    )
                                }
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(
                                    SimilarPlayersOptions.AgeRangePreference.STRICT to R.string.player_info_ai_age_strict,
                                    SimilarPlayersOptions.AgeRangePreference.RELAXED to R.string.player_info_ai_age_relaxed,
                                    SimilarPlayersOptions.AgeRangePreference.ANY to R.string.player_info_ai_age_any
                                ).forEach { (pref, resId) ->
                                    FilterChip(
                                        selected = similarPlayersOptions.ageRange == pref,
                                        onClick = { similarPlayersOptions = similarPlayersOptions.copy(ageRange = pref) },
                                        label = { Text(stringResource(resId), style = regularTextStyle(HomeTextPrimary, 11.sp)) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            containerColor = Color.Transparent,
                                            labelColor = HomeTextPrimary,
                                            selectedContainerColor = HomeTealAccent.copy(alpha = 0.4f),
                                            selectedLabelColor = HomeTealAccent
                                        ),
                                        border = BorderStroke(1.dp, if (similarPlayersOptions.ageRange == pref) HomeTealAccent else HomeDarkCardBorder)
                                    )
                                }
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                FilterChip(
                                    selected = similarPlayersOptions.excludeSameClub,
                                    onClick = { similarPlayersOptions = similarPlayersOptions.copy(excludeSameClub = !similarPlayersOptions.excludeSameClub) },
                                    label = { Text(stringResource(R.string.player_info_ai_exclude_same_club), style = regularTextStyle(HomeTextPrimary, 11.sp)) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        containerColor = Color.Transparent,
                                        labelColor = HomeTextPrimary,
                                        selectedContainerColor = HomeTealAccent.copy(alpha = 0.4f),
                                        selectedLabelColor = HomeTealAccent
                                    ),
                                    border = BorderStroke(1.dp, if (similarPlayersOptions.excludeSameClub) HomeTealAccent else HomeDarkCardBorder)
                                )
                                FilterChip(
                                    selected = similarPlayersOptions.excludeSameLeague,
                                    onClick = { similarPlayersOptions = similarPlayersOptions.copy(excludeSameLeague = !similarPlayersOptions.excludeSameLeague) },
                                    label = { Text(stringResource(R.string.player_info_ai_exclude_same_league), style = regularTextStyle(HomeTextPrimary, 11.sp)) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        containerColor = Color.Transparent,
                                        labelColor = HomeTextPrimary,
                                        selectedContainerColor = HomeTealAccent.copy(alpha = 0.4f),
                                        selectedLabelColor = HomeTealAccent
                                    ),
                                    border = BorderStroke(1.dp, if (similarPlayersOptions.excludeSameLeague) HomeTealAccent else HomeDarkCardBorder)
                                )
                            }
                            if (similarPlayers.isNotEmpty()) {
                                TextButton(
                                    onClick = { viewModel.findSimilarPlayers(player, LocaleManager.getSavedLanguage(context), similarPlayersOptions) }
                                ) {
                                    Text(stringResource(R.string.player_info_ai_refresh), color = HomeTealAccent)
                                }
                            }
                        }
                        if (isSimilarLoading) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = HomeTealAccent,
                                    strokeWidth = 2.dp
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.player_info_updating),
                                    style = regularTextStyle(HomeTextSecondary, 13.sp)
                                )
                            }
                        } else if (similarPlayers.isEmpty()) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    stringResource(R.string.player_info_ai_no_similar_players),
                                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                                )
                                TextButton(
                                    onClick = { viewModel.findSimilarPlayers(player, LocaleManager.getSavedLanguage(context), similarPlayersOptions) }
                                ) {
                                    Text(stringResource(R.string.player_info_ai_refresh), color = HomeTealAccent)
                                }
                            }
                        } else {
                            similarPlayers.forEachIndexed { index, suggestion ->
                                val url = suggestion.transfermarktUrl
                                SimilarPlayerSuggestionRow(
                                    suggestion = suggestion,
                                    isExpanded = expandedSimilarIndex == index,
                                    onToggleExpand = { expandedSimilarIndex = if (expandedSimilarIndex == index) null else index },
                                    onTmLinkClick = {
                                        url?.let { urlVal ->
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(urlVal)))
                                        }
                                    },
                                    onAddToShortlistClick = url?.let { urlVal ->
                                        {
                                            scope.launch {
                                                val isInShortlist = urlVal in shortlistUrls || urlVal in justAddedUrls
                                                if (isInShortlist) {
                                                    shortlistRepository.removeFromShortlist(urlVal)
                                                    justAddedUrls = justAddedUrls - urlVal
                                                } else {
                                                    val model = LatestTransferModel(
                                                        playerName = suggestion.name,
                                                        playerUrl = urlVal,
                                                        playerPosition = suggestion.position,
                                                        playerAge = suggestion.age,
                                                        marketValue = suggestion.marketValue
                                                    )
                                                    if (shortlistRepository.addToShortlist(model)) {
                                                        justAddedUrls = justAddedUrls + urlVal
                                                    } else {
                                                        ToastManager.showSuccess(context.getString(R.string.add_player_already_in_shortlist))
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    isInShortlist = url?.let { urlVal ->
                                        urlVal in shortlistUrls || urlVal in justAddedUrls
                                    } ?: false,
                                    isShortlistPending = url != null && url in shortlistPendingUrls
                                )
                            }
                        }
                    }
                }
            }
        }

        // Expandable: Create Scout Report
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple {
                    isScoutReportExpanded = !isScoutReportExpanded
                    if (isScoutReportExpanded && scoutReport == null && !isScoutReportLoading) {
                        viewModel.generateScoutReport(player, LocaleManager.getSavedLanguage(context), scoutReportOptions)
                    }
                },
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .drawBehind {
                            drawRect(
                                color = HomeTealAccent,
                                topLeft = Offset.Zero,
                                size = Size(3.dp.toPx(), size.height)
                            )
                        }
                        .padding(start = 3.dp)
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.player_info_ai_create_scout_report, player.fullName ?: stringResource(R.string.player_info_unknown)),
                        style = boldTextStyle(HomeTextPrimary, 15.sp),
                        modifier = Modifier.weight(1f)
                    )
                    if (scoutReport != null) {
                        Icon(
                            Icons.Default.Share,
                            contentDescription = stringResource(R.string.player_info_share),
                            tint = HomeTealAccent,
                            modifier = Modifier
                                .size(22.dp)
                                .clickWithNoRipple {
                                    val shareText = buildString {
                                        player.tmProfile?.takeIf { it.isNotBlank() }?.let { append(it) }
                                        if (isNotEmpty()) append("\n\n")
                                        scoutReport?.let { append(it) }
                                    }
                                    val intent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_TEXT, shareText)
                                    }
                                    context.startActivity(Intent.createChooser(intent, context.getString(R.string.player_info_share_with)))
                                }
                                .padding(end = 8.dp)
                        )
                    }
                    Icon(
                        Icons.Default.ExpandMore,
                        contentDescription = if (isScoutReportExpanded) "Collapse" else "Expand",
                        tint = HomeTextSecondary,
                        modifier = Modifier
                            .size(22.dp)
                            .graphicsLayer { rotationZ = if (isScoutReportExpanded) 180f else 0f }
                    )
                }
                AnimatedVisibility(visible = isScoutReportExpanded) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 17.dp, end = 12.dp, bottom = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Scout report type options
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                stringResource(R.string.player_info_ai_options),
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(
                                    ScoutReportOptions.ScoutReportType.EXECUTIVE_SUMMARY to R.string.player_info_ai_report_executive,
                                    ScoutReportOptions.ScoutReportType.FULL_TACTICAL to R.string.player_info_ai_report_full,
                                    ScoutReportOptions.ScoutReportType.TRANSFER_RECOMMENDATION to R.string.player_info_ai_report_transfer,
                                    ScoutReportOptions.ScoutReportType.YOUTH_POTENTIAL to R.string.player_info_ai_report_youth
                                ).forEach { (type, resId) ->
                                    FilterChip(
                                        selected = scoutReportOptions.reportType == type,
                                        onClick = { scoutReportOptions = scoutReportOptions.copy(reportType = type) },
                                        label = { Text(stringResource(resId), style = regularTextStyle(HomeTextPrimary, 11.sp)) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            containerColor = Color.Transparent,
                                            labelColor = HomeTextPrimary,
                                            selectedContainerColor = HomeTealAccent.copy(alpha = 0.4f),
                                            selectedLabelColor = HomeTealAccent
                                        ),
                                        border = BorderStroke(1.dp, if (scoutReportOptions.reportType == type) HomeTealAccent else HomeDarkCardBorder)
                                    )
                                }
                            }
                            if (scoutReport != null) {
                                TextButton(
                                    onClick = { viewModel.generateScoutReport(player, LocaleManager.getSavedLanguage(context), scoutReportOptions) }
                                ) {
                                    Text(stringResource(R.string.player_info_ai_refresh), color = HomeTealAccent)
                                }
                            }
                        }
                        if (isScoutReportLoading) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    color = HomeTealAccent,
                                    strokeWidth = 2.dp
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.player_info_ai_generating_scout_report),
                                    style = regularTextStyle(HomeTextSecondary, 13.sp)
                                )
                            }
                        } else if (scoutReport != null) {
                            Text(
                                text = scoutReport!!,
                                style = regularTextStyle(HomeTextPrimary, 13.sp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(HomeDarkBackground)
                                    .padding(12.dp)
                            )
                        } else {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Text(
                                    stringResource(R.string.player_info_ai_scout_report_error),
                                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                                )
                                TextButton(
                                    onClick = { viewModel.generateScoutReport(player, LocaleManager.getSavedLanguage(context), scoutReportOptions) }
                                ) {
                                    Text(stringResource(R.string.contract_finisher_retry), color = HomeTealAccent)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SimilarPlayerSuggestionRow(
    suggestion: AiHelperService.SimilarPlayerSuggestion,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    onTmLinkClick: () -> Unit,
    onAddToShortlistClick: (() -> Unit)? = null,
    isInShortlist: Boolean = false,
    isShortlistPending: Boolean = false
) {
    Box(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(HomeDarkBackground)
                .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
        ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple { onToggleExpand() }
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    suggestion.name.take(2).uppercase(),
                    style = boldTextStyle(HomeTextSecondary, 12.sp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    suggestion.name,
                    style = boldTextStyle(HomeTextPrimary, 14.sp)
                )
                Text(
                    "${suggestion.age ?: "-"} • ${suggestion.position ?: "-"} • ${suggestion.marketValue ?: "-"}",
                    style = regularTextStyle(HomeTextSecondary, 11.sp),
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            if (suggestion.transfermarktUrl != null) {
                Icon(
                    Icons.Default.Link,
                    contentDescription = null,
                    modifier = Modifier
                        .size(20.dp)
                        .clickWithNoRipple { onTmLinkClick() },
                    tint = HomeTealAccent
                )
                Spacer(Modifier.width(8.dp))
            }
            onAddToShortlistClick?.let { onAdd ->
                Icon(
                    imageVector = if (isInShortlist) Icons.Default.Bookmark else Icons.Default.BookmarkAdd,
                    contentDescription = if (isInShortlist) stringResource(R.string.shortlist_in_shortlist) else stringResource(R.string.shortlist_add_to_shortlist),
                    modifier = Modifier
                        .size(20.dp)
                        .clickWithNoRipple { onAdd() },
                    tint = if (isInShortlist) HomeGreenAccent else HomeTextSecondary
                )
                Spacer(Modifier.width(8.dp))
            }
            Icon(
                Icons.Default.ExpandMore,
                contentDescription = if (isExpanded) "Collapse" else "Expand",
                tint = HomeTextSecondary,
                modifier = Modifier
                    .size(20.dp)
                    .graphicsLayer { rotationZ = if (isExpanded) 180f else 0f }
            )
        }
        AnimatedVisibility(visible = isExpanded && !suggestion.similarityReason.isNullOrBlank()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 10.dp, end = 10.dp, bottom = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(HomeDarkCard)
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(8.dp))
                    .padding(12.dp)
            ) {
                Text(
                    text = suggestion.similarityReason ?: "",
                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                )
            }
        }
    }
        if (isShortlistPending) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .clip(RoundedCornerShape(10.dp))
                    .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = HomeTealAccent,
                    modifier = Modifier.size(28.dp),
                    strokeWidth = 2.dp
                )
            }
        }
    }
}

@Composable
private fun AiHelperActionItem(
    title: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = HomeTealAccent,
                        topLeft = Offset.Zero,
                        size = Size(3.dp.toPx(), size.height)
                    )
                }
                .padding(start = 3.dp)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                style = boldTextStyle(HomeTextPrimary, 15.sp),
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}

@Composable
private fun PlayerInfoSectionHeader(title: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = title,
            style = boldTextStyle(HomeTextPrimary, 18.sp)
        )
        Box(
            modifier = Modifier
                .width(40.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(HomeTealAccent)
        )
    }
}

@Composable
private fun PlayerInfoCard(
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 20.dp)) {
            content()
        }
    }
}

@Composable
fun WhatsAppIcon(phoneNumber: String) {
    val context = LocalContext.current
    val uri = "https://wa.me/${phoneNumber.filter { it.isDigit() }}".toUri()

    Icon(
        Icons.Default.Whatsapp,
        contentDescription = null,
        modifier = Modifier.clickWithNoRipple {
            val intent = Intent(Intent.ACTION_VIEW, uri)
            context.startActivity(intent)
        },
        tint = HomeTealAccent
    )
}


@Composable
fun InfoRow(
    title: String,
    value: String?,
    darkTheme: Boolean = false,
    icon: @Composable (() -> Unit)? = null
) {
    val labelColor = if (darkTheme) HomeTextSecondary else contentDefault
    val valueColor = if (darkTheme) HomeTextPrimary else contentDefault

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            icon()
            Spacer(Modifier.width(4.dp))
        }

        Text(
            text = title,
            style = regularTextStyle(labelColor, 14.sp),
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value ?: "--",
            style = boldTextStyle(valueColor, 14.sp),
            textAlign = TextAlign.End
        )
    }
}

@Composable
fun ClubInfoRow(
    title: String,
    value: String?,
    clubLogo: String?,
    darkTheme: Boolean = false
) {
    val labelColor = if (darkTheme) HomeTextSecondary else contentDefault
    val valueColor = if (darkTheme) {
        if (value.equals("Without club", true)) HomeRedAccent else HomeTextPrimary
    } else {
        if (value.equals("Without club", true)) redErrorColor else contentDefault
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            modifier = Modifier.size(24.dp),
            painter = painterResource(R.drawable.ic_club_badge),
            contentDescription = null
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = title,
            style = regularTextStyle(labelColor, 14.sp),
            modifier = Modifier.weight(1f)
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = value ?: "--",
                style = boldTextStyle(valueColor, 14.sp),
                textAlign = TextAlign.End,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1
            )
            AsyncImage(
                model = clubLogo,
                contentDescription = null,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun AgencyInfoRow(
    title: String,
    agencyName: String?,
    agencyUrl: String?,
    onRemoveAgency: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val url = agencyUrl?.takeIf { it.isNotBlank() }
    val hasAgency = agencyName != null || agencyUrl != null
    var showMenu by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .then(
                when {
                    hasAgency && onRemoveAgency != null -> Modifier.combinedClickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {
                            if (url != null) {
                                val intent = Intent(Intent.ACTION_VIEW, url.toUri())
                                context.startActivity(intent)
                            } else {
                                showMenu = true
                            }
                        },
                        onLongClick = { showMenu = true }
                    )
                    url != null -> Modifier.clickWithNoRipple {
                        val intent = Intent(Intent.ACTION_VIEW, url.toUri())
                        context.startActivity(intent)
                    }
                    else -> Modifier
                }
            ),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            modifier = Modifier.size(24.dp),
            painter = painterResource(R.drawable.ic_agency),
            contentDescription = null,
            tint = HomeTextSecondary
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = title,
            style = regularTextStyle(HomeTextSecondary, 14.sp),
            modifier = Modifier.weight(1f)
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = agencyName ?: "--",
                style = boldTextStyle(
                    if (url != null) HomeTealAccent else HomeTextPrimary,
                    14.sp
                ),
                textAlign = TextAlign.End,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1
            )
            if (url != null) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = stringResource(R.string.player_info_cd_open_link),
                    modifier = Modifier.size(16.dp),
                    tint = HomeTealAccent
                )
            }
        }
    }

    if (onRemoveAgency != null) {
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = HomeDarkCard,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_remove_agency),
                        style = regularTextStyle(HomeRedAccent, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = HomeRedAccent
                    )
                },
                onClick = {
                    showMenu = false
                    onRemoveAgency()
                }
            )
        }
    }
}

@Composable
fun NationalityInfoRow(
    title: String,
    value: String?,
    nationalityFlag: String?,
    darkTheme: Boolean = false
) {
    val labelColor = if (darkTheme) HomeTextSecondary else contentDefault
    val valueColor = if (darkTheme) HomeTextPrimary else contentDefault
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            modifier = Modifier.size(24.dp),
            painter = painterResource(R.drawable.ic_world),
            contentDescription = null,
            tint = if (darkTheme) HomeTextSecondary else contentDefault
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = title,
            style = regularTextStyle(labelColor, 14.sp),
            modifier = Modifier.weight(1f)
        )
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = value ?: "--",
                style = boldTextStyle(valueColor, 14.sp),
                textAlign = TextAlign.End
            )

            Spacer(Modifier.width(8.dp))

            AsyncImage(
                model = nationalityFlag,
                contentDescription = null,
                modifier = Modifier
                    .size(25.dp)
                    .clip(CircleShape)
            )
        }
    }
}

// PhoneInfoRow and TransfermarketRow removed - functionality moved to Quick Actions

@Composable
fun UpdatePlayerUi(modifier: Modifier, message: String, useDarkTheme: Boolean = false) {
    val indicatorColor = if (useDarkTheme) HomeTealAccent else Color.White
    val textColor = if (useDarkTheme) HomeTextPrimary else Color.White

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.6f))
            .zIndex(5f)
    ) {
        Column(
            modifier = Modifier.align(Alignment.Center)
        ) {
            CircularProgressIndicator(
                modifier = Modifier
                    .size(48.dp)
                    .align(Alignment.CenterHorizontally),
                color = indicatorColor,
                strokeWidth = 4.dp
            )

            Spacer(Modifier.height(24.dp))

            Text(
                text = message,
                style = regularTextStyle(textColor, 18.sp),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun PlayerInfoHeader(onBackClicked: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier
                    .size(24.dp)
                    .clickWithNoRipple { onBackClicked() }
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.player_info_title),
                    style = boldTextStyle(HomeTextPrimary, 26.sp)
                )
                Text(
                    text = stringResource(R.string.player_info_subtitle),
                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
    }
}

@Composable
private fun PlayerInfoBottomBar(
    showDeletePlayerIcon: Boolean,
    hasPassportDetails: Boolean,
    hasValidMandate: Boolean,
    onDeletePlayerClicked: () -> Unit,
    onShareClicked: () -> Unit,
    onGenerateMandateClicked: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            if (hasPassportDetails) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .then(
                            if (hasValidMandate) Modifier
                            else Modifier.clickWithNoRipple { onGenerateMandateClicked() }
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = if (hasValidMandate) HomeTextSecondary.copy(alpha = 0.5f) else HomeTealAccent
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.player_info_generate_mandate),
                        style = boldTextStyle(
                            if (hasValidMandate) HomeTextSecondary.copy(alpha = 0.5f) else HomeTextSecondary,
                            12.sp
                        )
                    )
                }
            }
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clickWithNoRipple { onShareClicked() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Share,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = HomeTealAccent
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.player_info_share),
                    style = boldTextStyle(HomeTextSecondary, 12.sp)
                )
            }
            if (showDeletePlayerIcon) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clickWithNoRipple { onDeletePlayerClicked() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = HomeTealAccent
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.player_info_delete),
                        style = boldTextStyle(HomeTextSecondary, 12.sp)
                    )
                }
            }
        }
    }
}

@Composable
fun DeletePlayerDialog(onDismissRequest: () -> Unit, onDeletePlayerClicked: () -> Unit) {
    Dialog(
        onDismissRequest = { onDismissRequest() }
    ) {
        Card(
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.player_info_delete_player_confirm),
                    style = boldTextStyle(HomeTextPrimary, 16.sp),
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(24.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    Box(
                        modifier = Modifier
                            .background(
                                HomeDarkCard,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(100.dp))
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(HomeTextPrimary, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDismissRequest() }
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                HomeRedAccent,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.player_info_delete),
                            style = boldTextStyle(Color.White, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDeletePlayerClicked() }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DeleteDocumentDialog(
    documentName: String,
    onDismissRequest: () -> Unit,
    onDeleteClicked: () -> Unit
) {
    Dialog(onDismissRequest = onDismissRequest) {
        Card(
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.player_info_delete_doc_confirm, documentName),
                    style = boldTextStyle(HomeTextPrimary, 16.sp),
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(24.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    Box(
                        modifier = Modifier
                            .background(
                                HomeDarkCard,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(100.dp))
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(HomeTextPrimary, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDismissRequest() }
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                HomeRedAccent,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.player_info_delete),
                            style = boldTextStyle(Color.White, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDeleteClicked() }
                        )
                    }
                }
            }
        }
    }
}

private fun sharePlayerOnWhatsapp(context: Context, message: String?) {
    val i = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, message)
    }
    context.startActivity(Intent.createChooser(i, context.getString(R.string.player_info_share_with)))
}

fun launchPlayerContactPicker(
    context: Context,
    playerNumberLauncher: ManagedActivityResultLauncher<Void?, Uri?>,
    permissionLauncher: ManagedActivityResultLauncher<String, Boolean>
) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS)
        == PackageManager.PERMISSION_GRANTED
    ) {
        playerNumberLauncher.launch(null)
    } else {
        permissionLauncher.launch(Manifest.permission.READ_CONTACTS)
    }
}

private fun getContractStatus(resources: android.content.res.Resources, expiryDate: String): String {
    val sdf = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
    sdf.isLenient = false

    return try {
        val contractDate: Date = sdf.parse(expiryDate)!!
        val today = Calendar.getInstance().time

        if (contractDate.before(today)) {
            resources.getString(R.string.player_info_contract_expired)
        } else {
            expiryDate
        }
    } catch (e: Exception) {
        "--"
    }
}

private fun playerInfoFormatLastRefreshed(resources: android.content.res.Resources, timestampMs: Long): String {
    val diff = System.currentTimeMillis() - timestampMs
    val minutes = diff / (60 * 1000)
    val hours = diff / (60 * 60 * 1000)
    val days = diff / (24 * 60 * 60 * 1000)
    return when {
        minutes < 60 -> resources.getString(R.string.player_info_synced_minutes, minutes.toInt())
        hours < 24 -> resources.getString(R.string.player_info_synced_hours, hours.toInt())
        days < 7 -> resources.getString(R.string.player_info_synced_days, days.toInt())
        else -> resources.getString(R.string.player_info_synced_date, SimpleDateFormat("dd.MM", Locale.getDefault()).format(Date(timestampMs)))
    }
}

private fun playerInfoGetContractCountdown(resources: android.content.res.Resources, contractExpired: String?): String? {
    if (contractExpired.isNullOrBlank() || contractExpired == "-") return null
    return try {
        val formatters = listOf(
            java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.getDefault()),
            java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
            java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.getDefault())
        )
        var expiryDate: java.time.LocalDate? = null
        for (fmt in formatters) {
            try {
                expiryDate = java.time.LocalDate.parse(contractExpired, fmt)
                break
            } catch (_: Exception) { }
        }
        if (expiryDate == null) return null
        val now = java.time.LocalDate.now()
        when {
            expiryDate.isBefore(now) -> resources.getString(R.string.player_info_expired)
            else -> {
                val months = java.time.temporal.ChronoUnit.MONTHS.between(now, expiryDate)
                resources.getString(R.string.player_info_expires_in_months, months.toInt())
            }
        }
    } catch (_: Exception) {
        null
    }
}

private fun playerInfoComputeValueTrend(history: List<com.liordahan.mgsrteam.features.players.models.MarketValueEntry>?): Int {
    if (history.isNullOrEmpty() || history.size < 2) return 0
    val sorted = history.sortedBy { it.date ?: 0L }
    val prev = sorted[sorted.size - 2].value?.toMarketValueDouble() ?: return 0
    val current = sorted.last().value?.toMarketValueDouble() ?: return 0
    if (prev == 0.0) return 0
    val pct = ((current - prev) / prev * 100).toInt()
    return pct.coerceIn(-99, 999)
}

private fun String.toMarketValueDouble(): Double {
    val lower = this.lowercase().trim().removePrefix("€").replace(",", "")
    return when {
        lower.endsWith("k") -> lower.removeSuffix("k").toDoubleOrNull()?.times(1_000) ?: 0.0
        lower.endsWith("m") -> lower.removeSuffix("m").toDoubleOrNull()?.times(1_000_000) ?: 0.0
        else -> lower.toDoubleOrNull() ?: 0.0
    }
}
