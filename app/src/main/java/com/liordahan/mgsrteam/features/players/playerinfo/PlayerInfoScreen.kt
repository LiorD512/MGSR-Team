package com.liordahan.mgsrteam.features.players.playerinfo

import com.liordahan.mgsrteam.ui.components.ShortlistPillButton
import com.liordahan.mgsrteam.ui.components.shortlistPillState
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
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.PersonAddAlt
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Whatsapp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextDecoration
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
import com.liordahan.mgsrteam.features.home.models.AgentTask
import com.liordahan.mgsrteam.features.home.tasks.AddPlayerTaskBottomSheet
import com.liordahan.mgsrteam.features.home.tasks.PlayerTaskContext
import com.liordahan.mgsrteam.features.players.playerinfo.notes.AddNoteBottomSheet
import com.liordahan.mgsrteam.features.players.playerinfo.notes.AllNotesScreen
import com.liordahan.mgsrteam.features.players.playerinfo.notes.NotesSection
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.isFreeAgentClub
import com.liordahan.mgsrteam.features.players.models.getAgentPhoneNumber
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.features.players.playerinfo.ai.AiHelperService
import com.liordahan.mgsrteam.features.players.playerinfo.ai.ScoutReportOptions
import com.liordahan.mgsrteam.features.players.playerinfo.ai.SimilarPlayersOptions
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentsSection
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.MatchingRequestsSection
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.ProposalHistorySection
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions
import com.liordahan.mgsrteam.features.requests.models.TransferFeeOptions
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.theme.PlatformColors
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
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.features.players.playerinfo.highlights.PlayerHighlightsSection
import com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence.FmIntelligenceSection
import com.liordahan.mgsrteam.utils.EuCountries
import com.liordahan.mgsrteam.ui.components.WomenGlowPhotoRing
import com.liordahan.mgsrteam.ui.components.WomenSectionHeader
import com.liordahan.mgsrteam.ui.theme.PlatformWomenAccent
import com.liordahan.mgsrteam.ui.theme.PlatformYouthAccent
import com.liordahan.mgsrteam.ui.theme.PlatformYouthSecondary
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerInfoScreen(
    viewModel: IPlayerInfoViewModel = koinViewModel(),
    playerId: String,
    autoRefresh: Boolean = false,
    navController: NavController
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val platformManager: PlatformManager = koinInject()
    val currentPlatform by platformManager.current.collectAsState()
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
    var showSalaryTransferFeeSheet by remember { mutableStateOf(false) }
    var showShareLanguageSheet by remember { mutableStateOf(false) }
    var isPreparingShare by remember { mutableStateOf(false) }
    var includePlayerContact by remember { mutableStateOf(false) }
    var includeAgencyContact by remember { mutableStateOf(false) }
    var showAddNoteSheet by remember { mutableStateOf(false) }
    var showAllNotes by remember { mutableStateOf(false) }
    var showAddPlayerTaskSheet by remember { mutableStateOf(false) }
    var playerTasksList by remember { mutableStateOf<List<AgentTask>>(emptyList()) }
    var playerDocumentId by remember { mutableStateOf<String?>(null) }
    var allAccounts by remember { mutableStateOf<List<com.liordahan.mgsrteam.features.login.models.Account>>(emptyList()) }
    var documentsList by remember { mutableStateOf<List<PlayerDocument>>(emptyList()) }
    val scoutReport by viewModel.scoutReportFlow.collectAsState()
    val highlightVideos by viewModel.highlightVideosFlow.collectAsState()
    val isHighlightsLoading by viewModel.isHighlightsLoading.collectAsState()
    val highlightsError by viewModel.highlightsError.collectAsState()
    val highlightsHasFetched by viewModel.highlightsHasFetched.collectAsState()
    val isHighlightsSaving by viewModel.isHighlightsSaving.collectAsState()
    val fmIntelligenceData by viewModel.fmIntelligenceFlow.collectAsState()
    val isFmIntelligenceLoading by viewModel.isFmIntelligenceLoading.collectAsState()
    val fmIntelligenceError by viewModel.fmIntelligenceError.collectAsState()
    val scope = rememberCoroutineScope()
    var docToDelete by remember { mutableStateOf<PlayerDocument?>(null) }
    var isUploadingDocument by remember { mutableStateOf(false) }
    var hasAutoRefreshed by remember { mutableStateOf(false) }

    LaunchedEffect(autoRefresh, playerToPresent) {
        if (autoRefresh && !hasAutoRefreshed && playerToPresent != null) {
            hasAutoRefreshed = true
            viewModel.refreshPlayerInfo()
        }
    }

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
                viewModel.playerTasksFlow.collect {
                    playerTasksList = it
                }
            }

            launch {
                viewModel.playerDocumentIdFlow.collect {
                    playerDocumentId = it
                }
            }

            launch {
                viewModel.allAccountsFlow.collect {
                    allAccounts = it
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
        containerColor = PlatformColors.palette.background
    ) { paddingValues ->

        if (showLoader) {
            SkeletonPlayerInfoLayout(
                modifier = Modifier
                    .fillMaxSize()
                    .background(PlatformColors.palette.background)
            )
            return@Scaffold
        }

        if (showDeleteDialog) {
            DeletePlayerDialog(
                onDismissRequest = { showDeleteDialog = false },
                onDeletePlayerClicked = {
                    showDeleteDialog = false
                    viewModel.deletePlayer(
                        playerToPresent?.tmProfile ?: playerToPresent?.id ?: "",
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
        if (showAddPlayerTaskSheet && playerToPresent != null && playerDocumentId != null) {
            val player = playerToPresent!!
            val docId = playerDocumentId!!
            val playerName = player.fullName ?: ""
            val preselectedIndex = allAccounts.indexOfFirst { it.email.equals(com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email, true) }.takeIf { it >= 0 } ?: 0
            AddPlayerTaskBottomSheet(
                accounts = allAccounts,
                playerContext = PlayerTaskContext(
                    playerId = docId,
                    playerName = playerName,
                    playerTmProfile = player.tmProfile,
                    playerImage = player.profileImage,
                    playerClub = player.currentClub?.clubName,
                    playerPosition = player.positions?.filterNotNull()?.joinToString(" • "),
                    playerAgency = player.agency,
                    playerAgencyUrl = player.agencyUrl
                ),
                preselectedAgentIndex = preselectedIndex,
                onDismiss = { showAddPlayerTaskSheet = false },
                onConfirm = { agentId, agentName, title, dueDate, priority, notes, pId, pName, pTmProfile, templateId, linkedId, linkedName, linkedPhone ->
                    viewModel.addPlayerTask(agentId, agentName, title, dueDate, priority, notes, pId, pName, pTmProfile, templateId, linkedId, linkedName, linkedPhone)
                    showAddPlayerTaskSheet = false
                }
            )
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
        fun performShare(lang: String) {
            val player = playerToPresent
            val docId = playerDocumentId
            if (player == null || docId == null) return
            showShareLanguageSheet = false
            isPreparingShare = true
            scope.launch {
                viewModel.createShareUrl(player, docId, documentsList, scoutReport, lang, includePlayerContact, includeAgencyContact)
                    .onSuccess { url ->
                        isPreparingShare = false
                        val displayName = if (lang == "he") {
                            player.fullNameHe ?: player.fullName ?: ""
                        } else {
                            player.fullName ?: player.fullNameHe ?: ""
                        }
                        val shareText = if (lang == "he") {
                            "פרופיל חדש נשלח אלייך מ - MGSR.\n$displayName\n$url"
                        } else {
                            "A new profile sent to you by MGSR.\n$displayName\n$url"
                        }
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, shareText)
                        }
                        context.startActivity(Intent.createChooser(intent, context.getString(R.string.player_info_share_with)))
                    }
                    .onFailure {
                        isPreparingShare = false
                        ToastManager.showError(context.getString(R.string.player_info_share_error))
                    }
            }
        }
        if (isPreparingShare) {
            Dialog(onDismissRequest = { /* non-dismissable while preparing */ }) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    elevation = CardDefaults.cardElevation(8.dp),
                    colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
                    border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(40.dp),
                            color = PlatformColors.palette.accent,
                            strokeWidth = 3.dp
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = stringResource(R.string.player_info_share_preparing),
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                        )
                    }
                }
            }
        }
        if (showShareLanguageSheet) {
            val hasPlayerPhone = (playerToPresent?.playerAdditionalInfoModel?.playerNumber?.takeIf { it.isNotBlank() }
                ?: playerToPresent?.playerPhoneNumber?.takeIf { it.isNotBlank() }) != null
            val hasAgentPhone = (playerToPresent?.playerAdditionalInfoModel?.agentNumber?.takeIf { it.isNotBlank() }
                ?: playerToPresent?.agentPhoneNumber?.takeIf { it.isNotBlank() }) != null
            ShareLanguageBottomSheet(
                hasPlayerPhone = hasPlayerPhone,
                hasAgentPhone = hasAgentPhone,
                includePlayerContact = includePlayerContact,
                includeAgencyContact = includeAgencyContact,
                onIncludePlayerContactChanged = { includePlayerContact = it },
                onIncludeAgencyContactChanged = { includeAgencyContact = it },
                onDismiss = {
                    showShareLanguageSheet = false
                    includePlayerContact = false
                    includeAgencyContact = false
                },
                onLangSelected = { performShare(it) }
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

        val shareAction: () -> Unit = shareAction@ {
            val player = playerToPresent
            val docId = playerDocumentId
            if (player == null || docId == null) return@shareAction
            com.liordahan.mgsrteam.analytics.AnalyticsHelper.logSharePlayer(player.tmProfile)
            showShareLanguageSheet = true
        }

        val isRefreshing = isRefreshingPlayer is UiResult.Loading

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            PlayerInfoHeader(
                onBackClicked = { navController.popBackStack() },
                currentPlatform = currentPlatform
            )

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
                val mandateDocs = documentsList
                    .filter { it.documentType == DocumentType.MANDATE }
                val mandateExpiry = mandateDocs
                    .mapNotNull { it.expiresAt }
                    .maxOrNull()
                val mandateLeagues = mandateDocs
                    .flatMap { it.validLeagues.orEmpty() }
                    .distinct()
                PlayerInfoHeroCard(
                    player = player,
                    mandateExpiryAt = mandateExpiry,
                    mandateValidLeagues = mandateLeagues,
                    currentPlatform = currentPlatform,
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
                    platform = currentPlatform
                )
            }

            // Section: Agent Transfer (men only)
            if (currentPlatform == Platform.MEN) {
                playerToPresent?.let { player ->
                    val pendingTransfer by viewModel.pendingTransferFlow.collectAsState()
                    val resolvedTransfer by viewModel.resolvedTransferFlow.collectAsState()
                    val currentUserAccount by viewModel.currentUserAccountFlow.collectAsState()
                    val transferLoading by viewModel.transferLoadingFlow.collectAsState()
                    var showTransferConfirmDialog by remember { mutableStateOf(false) }

                    if (showTransferConfirmDialog) {
                        AgentTransferConfirmDialog(
                            playerName = player.fullName ?: "",
                            currentAgentName = player.agentInChargeName ?: "—",
                            onConfirm = {
                                showTransferConfirmDialog = false
                                viewModel.requestAgentTransfer()
                            },
                            onDismiss = { showTransferConfirmDialog = false }
                        )
                    }

                    AgentTransferSection(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        player = player,
                        pendingTransfer = pendingTransfer,
                        resolvedTransfer = resolvedTransfer,
                        currentUserAccountId = currentUserAccount?.id,
                        currentUserAuthUid = viewModel.currentUserAuthUid,
                        currentUserAccountName = currentUserAccount?.name,
                        currentUserAccountHebrewName = currentUserAccount?.hebrewName,
                        isLoading = transferLoading,
                        onRequestTransfer = { showTransferConfirmDialog = true },
                        onApproveTransfer = { viewModel.approveTransfer() },
                        onRejectTransfer = { viewModel.rejectTransfer() },
                        onCancelTransfer = { viewModel.cancelTransferRequest() }
                    )
                }
            }

            // Section: AI Helper (men only)
            if (currentPlatform == Platform.MEN) {
                playerToPresent?.let { player ->
                    PlayerInfoAiHelperSection(
                        player = player,
                        viewModel = viewModel
                    )
                }
            }

            // Section: Highlights (men only)
            if (currentPlatform == Platform.MEN) {
                playerToPresent?.let { player ->
                    PlayerInfoSectionHeader(stringResource(R.string.player_info_highlights))
                    PlayerHighlightsSection(
                        pinnedHighlights = player.pinnedHighlights ?: emptyList(),
                        videos = highlightVideos,
                        isLoading = isHighlightsLoading,
                        error = highlightsError,
                        hasFetched = highlightsHasFetched,
                        onSearch = { refresh -> viewModel.searchHighlights(player, refresh) },
                        onSavePinned = { videos -> viewModel.savePinnedHighlights(videos) },
                        isSaving = isHighlightsSaving
                    )
                }
            }

            // Section: FM Intelligence (men only)
            if (currentPlatform == Platform.MEN) {
                playerToPresent?.let { player ->
                    LaunchedEffect(player.fullName) {
                        viewModel.fetchFmIntelligence(player)
                    }
                    PlayerInfoSectionHeader(stringResource(R.string.fm_section_title))
                    FmIntelligenceSection(
                        data = fmIntelligenceData,
                        isLoading = isFmIntelligenceLoading,
                        error = fmIntelligenceError
                    )
                }
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

                // Section: Proposal History (persists after request deletion)
                val proposalHistory by viewModel.proposalHistoryFlow.collectAsState(initial = emptyList())
                ProposalHistorySection(
                    offers = proposalHistory,
                    allAccounts = allAccounts,
                    onUpdateSummary = { offerId, summary ->
                        viewModel.updateHistorySummary(offerId, summary)
                    }
                )
            }

            // Section: General Info (hidden for Youth — integrated into Youth section)
            if (currentPlatform != Platform.YOUTH) {
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
                                tint = PlatformColors.palette.textSecondary
                            )
                        })
                    HorizontalDivider(
                        color = PlatformColors.palette.cardBorder,
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
                                tint = PlatformColors.palette.textSecondary
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
                                tint = PlatformColors.palette.textSecondary
                            )
                        }
                    )
                    HorizontalDivider(
                        color = PlatformColors.palette.cardBorder,
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
                                tint = PlatformColors.palette.textSecondary
                            )
                        }
                    )
                    HorizontalDivider(
                        color = PlatformColors.palette.cardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    NationalityInfoRow(
                        stringResource(R.string.player_info_nationality),
                        nationalities = playerToPresent?.nationalities,
                        nationalityFlags = playerToPresent?.nationalityFlags,
                        fallbackNationality = playerToPresent?.nationality,
                        fallbackFlag = playerToPresent?.nationalityFlag,
                        darkTheme = true
                    )

                    if (currentPlatform == Platform.MEN && EuCountries.isEuNational(playerToPresent?.nationalities, playerToPresent?.nationality)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 2.dp),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(R.string.eu_nat_badge),
                                style = boldTextStyle(Color.White, 9.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(Color(0xFF1565C0))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    HorizontalDivider(
                        color = PlatformColors.palette.cardBorder,
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
                                tint = PlatformColors.palette.textSecondary
                            )
                        })

                    HorizontalDivider(
                        color = PlatformColors.palette.cardBorder,
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

                    // Date added row — men only
                    if (currentPlatform == Platform.MEN && (playerToPresent?.createdAt ?: 0L) > 0L) {
                        HorizontalDivider(
                            color = dividerColor,
                            thickness = 0.5.dp,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                        InfoRow(
                            stringResource(R.string.player_info_date_added),
                            java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale.getDefault()).format(java.util.Date(playerToPresent!!.createdAt!!)),
                            darkTheme = true,
                            icon = {
                                Icon(
                                    modifier = Modifier.size(24.dp),
                                    imageVector = Icons.Default.CalendarMonth,
                                    contentDescription = null,
                                    tint = PlatformColors.palette.textSecondary
                                )
                            }
                        )
                    }

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    InfoRow(
                        stringResource(R.string.player_info_market_value),
                        playerToPresent?.marketValue?.let { value ->
                            val displayValue = if (currentPlatform == Platform.WOMEN) {
                                com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearch.normalizeSoccerDonnaMarketValue(value)
                            } else value
                            val trend = playerToPresent?.let { playerInfoComputeValueTrend(it.marketValueHistory) } ?: 0
                            when {
                                trend > 0 -> "$displayValue ↑"
                                trend < 0 -> "$displayValue ↓"
                                else -> displayValue
                            }
                        },
                        darkTheme = true,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_euro),
                                contentDescription = null,
                                tint = PlatformColors.palette.textSecondary
                            )
                        }
                    )

                    playerToPresent?.marketValueHistory?.takeIf { it.size > 1 }?.let { history ->
                        val previous = history.sortedByDescending { it.date }.getOrNull(1)
                        previous?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.player_info_previously, it.value ?: "", SimpleDateFormat("dd.MM.yy", Locale.getDefault()).format(Date(it.date ?: 0))),
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                                modifier = Modifier.padding(start = 28.dp)
                            )
                        }
                    }

                }
            } // end General Info
            // Contact Info section removed - edit/delete moved to Quick Actions long-press

            // ── Platform-specific sections ───────────────────────────────
            if (currentPlatform == Platform.YOUTH) {
                playerToPresent?.let { player ->
                    PlayerInfoYouthSection(player = player)
                }
            }
            PlayerInfoSectionHeader(stringResource(R.string.player_info_documents))
            DocumentsSection(
                documents = documentsList,
                isUploading = isUploadingDocument,
                onAddDocument = { documentPickerLauncher.launch("*/*") },
                onDeleteDocument = { docToDelete = it }
            )

            PlayerInfoSectionHeader(stringResource(R.string.player_tasks_section))
            PlayerTasksSection(
                tasks = playerTasksList,
                onAddTaskClick = { showAddPlayerTaskSheet = true },
                onToggleComplete = { viewModel.togglePlayerTaskCompleted(it) },
                onTaskClick = { navController.navigate(Screens.TasksScreen.route) }
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
                            color = PlatformColors.palette.accent,
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
private fun ShareLanguageBottomSheet(
    hasPlayerPhone: Boolean,
    hasAgentPhone: Boolean,
    includePlayerContact: Boolean,
    includeAgencyContact: Boolean,
    onIncludePlayerContactChanged: (Boolean) -> Unit,
    onIncludeAgencyContactChanged: (Boolean) -> Unit,
    onDismiss: () -> Unit,
    onLangSelected: (lang: String) -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = PlatformColors.palette.card,
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
                text = stringResource(R.string.player_info_share_language_title),
                style = boldTextStyle(PlatformColors.palette.textPrimary, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            HorizontalDivider(color = PlatformColors.palette.cardBorder, thickness = 1.dp)
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.player_info_share_language_subtitle),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp),
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Contact inclusion checkboxes
            if (hasPlayerPhone || hasAgentPhone) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                    if (hasPlayerPhone) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { onIncludePlayerContactChanged(!includePlayerContact) }
                        ) {
                            Checkbox(
                                checked = includePlayerContact,
                                onCheckedChange = { onIncludePlayerContactChanged(it) },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = PlatformColors.palette.accent,
                                    uncheckedColor = PlatformColors.palette.textSecondary
                                )
                            )
                            Text(
                                text = stringResource(R.string.player_info_share_include_player_contact),
                                style = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                            )
                        }
                    }
                    if (hasAgentPhone) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { onIncludeAgencyContactChanged(!includeAgencyContact) }
                        ) {
                            Checkbox(
                                checked = includeAgencyContact,
                                onCheckedChange = { onIncludeAgencyContactChanged(it) },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = PlatformColors.palette.accent,
                                    uncheckedColor = PlatformColors.palette.textSecondary
                                )
                            )
                            Text(
                                text = stringResource(R.string.player_info_share_include_agency_contact),
                                style = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = { onLangSelected("he") },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = PlatformColors.palette.accent.copy(alpha = 0.2f)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(stringResource(R.string.player_info_share_language_hebrew), style = boldTextStyle(PlatformColors.palette.accent, 16.sp))
                }
                Button(
                    onClick = { onLangSelected("en") },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = PlatformColors.palette.accent.copy(alpha = 0.2f)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(stringResource(R.string.player_info_share_language_english), style = boldTextStyle(PlatformColors.palette.accent, 16.sp))
                }
            }
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
        containerColor = PlatformColors.palette.card,
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
                style = boldTextStyle(PlatformColors.palette.textPrimary, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            HorizontalDivider(color = PlatformColors.palette.cardBorder, thickness = 1.dp)
            Spacer(Modifier.height(16.dp))

            Text(
                stringResource(R.string.requests_label_salary_range),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
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
                        style = regularTextStyle(if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.textSecondary, 12.sp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isSelected) PlatformColors.palette.accent.copy(alpha = 0.2f) else Color.Transparent)
                            .border(1.dp, if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.cardBorder, RoundedCornerShape(20.dp))
                            .clickWithNoRipple { selectedSalaryRange = if (isSelected) null else range }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            Text(
                stringResource(R.string.requests_label_transfer_fee),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
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
                        style = regularTextStyle(if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.textSecondary, 12.sp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isSelected) PlatformColors.palette.accent.copy(alpha = 0.2f) else Color.Transparent)
                            .border(1.dp, if (isSelected) PlatformColors.palette.accent else PlatformColors.palette.cardBorder, RoundedCornerShape(20.dp))
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
                    Text(stringResource(R.string.cancel), style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp))
                }
                Button(
                    onClick = {
                        onSave(selectedSalaryRange, selectedTransferFee)
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PlatformColors.palette.accent,
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
    mandateValidLeagues: List<String> = emptyList(),
    currentPlatform: Platform = Platform.MEN,
    onMandateChanged: (Boolean) -> Unit,
    onSalaryTransferFeeClicked: () -> Unit = {},
    onClearSalaryAndTransferFee: () -> Unit = {},
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
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = if (currentPlatform == Platform.WOMEN) {
            BorderStroke(
                1.dp,
                Brush.linearGradient(
                    listOf(
                        com.liordahan.mgsrteam.ui.theme.WomenColors.Orchid.copy(alpha = 0.4f),
                        com.liordahan.mgsrteam.ui.theme.WomenColors.Gold.copy(alpha = 0.2f),
                        com.liordahan.mgsrteam.ui.theme.WomenColors.RoseCoral.copy(alpha = 0.3f)
                    )
                )
            )
        } else {
            BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (currentPlatform == Platform.WOMEN) {
                var showFallback by remember { mutableStateOf(player.profileImage.isNullOrBlank()) }
                WomenGlowPhotoRing(modifier = Modifier.size(100.dp)) {
                    if (showFallback) {
                        // Gradient initials placeholder
                        Box(
                            modifier = Modifier
                                .size(92.dp)
                                .clip(CircleShape)
                                .background(
                                    Brush.linearGradient(
                                        colors = listOf(
                                            com.liordahan.mgsrteam.ui.theme.WomenColors.Orchid,
                                            com.liordahan.mgsrteam.ui.theme.WomenColors.Gold
                                        )
                                    )
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = player.fullName
                                    ?.split(" ")
                                    ?.mapNotNull { it.firstOrNull()?.uppercase() }
                                    ?.take(2)
                                    ?.joinToString("") ?: "?",
                                style = boldTextStyle(Color.White, 28.sp)
                            )
                        }
                    } else {
                        AsyncImage(
                            model = player.profileImage,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(92.dp)
                                .clip(CircleShape),
                            onError = { showFallback = true }
                        )
                    }
                }
            } else if (currentPlatform == Platform.YOUTH) {
                // Youth: initials fallback on cyan→violet gradient
                var showFallback by remember { mutableStateOf(player.profileImage.isNullOrBlank()) }
                if (showFallback) {
                    Box(
                        modifier = Modifier
                            .size(96.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(PlatformYouthAccent, PlatformYouthSecondary)
                                )
                            )
                            .border(2.dp, PlatformYouthAccent.copy(alpha = 0.4f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = player.fullName
                                ?.split(" ")
                                ?.mapNotNull { it.firstOrNull()?.uppercase() }
                                ?.take(2)
                                ?.joinToString("") ?: "?",
                            style = boldTextStyle(Color.White, 28.sp)
                        )
                    }
                } else {
                    AsyncImage(
                        model = player.profileImage,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(96.dp)
                            .clip(CircleShape)
                            .border(2.dp, PlatformYouthAccent.copy(alpha = 0.4f), CircleShape),
                        onError = { showFallback = true }
                    )
                }
            } else {
                AsyncImage(
                    model = player.profileImage ?: "",
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(96.dp)
                        .clip(CircleShape)
                        .border(2.dp, PlatformColors.palette.cardBorder, CircleShape)
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(
                text = player.fullName ?: stringResource(R.string.player_info_unknown),
                style = boldTextStyle(PlatformColors.palette.textPrimary, 22.sp)
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
                    player.age?.let { append(" • ${it.trim()} ${stringResource(R.string.player_info_years_short)}") }
                    player.currentClub?.clubName?.let { append(" • $it") }
                }.ifEmpty { "—" },
                style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = stringResource(R.string.player_info_added_by, player.agentInChargeName ?: "—"),
                style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.8f), 11.sp)
            )

            if (currentPlatform == Platform.MEN && (player.createdAt ?: 0L) > 0L) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = stringResource(
                        R.string.player_info_added_on,
                        java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale.getDefault()).format(java.util.Date(player.createdAt!!))
                    ),
                    style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.6f), 11.sp)
                )
            }
            player.lastRefreshedAt?.takeIf { it > 0 }?.let { ts ->
                Spacer(Modifier.height(4.dp))
                Text(
                    text = playerInfoFormatLastRefreshed(resources, ts),
                    style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.7f), 11.sp)
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = if (currentPlatform == Platform.WOMEN) {
                            player.marketValue?.let { com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearch.normalizeSoccerDonnaMarketValue(it) } ?: "—"
                        } else {
                            player.marketValue ?: "—"
                        },
                        style = boldTextStyle(
                            when {
                                valueTrend > 0 -> PlatformColors.palette.green
                                valueTrend < 0 -> PlatformColors.palette.red
                                else -> PlatformColors.palette.accent
                            },
                            14.sp
                        )
                    )
                    if (valueTrend != 0) {
                        Icon(
                            imageVector = if (valueTrend > 0) Icons.AutoMirrored.Filled.TrendingUp else Icons.AutoMirrored.Filled.TrendingDown,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = if (valueTrend > 0) PlatformColors.palette.green else PlatformColors.palette.red
                        )
                    }
                }
                Box(modifier = Modifier.width(1.dp).height(14.dp).background(PlatformColors.palette.cardBorder))
                Text(
                    text = player.height?.replace(",", ".") ?: "—",
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
                Box(modifier = Modifier.width(1.dp).height(14.dp).background(PlatformColors.palette.cardBorder))
                Text(
                    text = player.nationality ?: "—",
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
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
                            if (isExpired) PlatformColors.palette.red.copy(alpha = 0.15f)
                            else PlatformColors.palette.orange.copy(alpha = 0.15f)
                        )
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = stringResource(R.string.player_info_contract, text),
                        style = boldTextStyle(
                            if (isExpired) PlatformColors.palette.red else PlatformColors.palette.orange,
                            11.sp
                        )
                    )
                }
            }
            if (currentPlatform != Platform.YOUTH) {
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(PlatformColors.palette.background)
                    .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
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
                        tint = if (isMandateOn) PlatformColors.palette.blue else PlatformColors.palette.textSecondary
                    )
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(
                            text = stringResource(R.string.player_info_mandate),
                            style = boldTextStyle(
                                if (isMandateOn) PlatformColors.palette.blue else PlatformColors.palette.textSecondary,
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
                                    if (isMandateOn) PlatformColors.palette.blue else PlatformColors.palette.textSecondary,
                                    11.sp
                                )
                            )
                        }
                        if (isMandateOn && mandateValidLeagues.isNotEmpty()) {
                            Text(
                                text = mandateValidLeagues.joinToString(", "),
                                style = regularTextStyle(
                                    PlatformColors.palette.blue.copy(alpha = 0.7f),
                                    10.sp
                                ),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
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
                        checkedTrackColor = PlatformColors.palette.blue,
                        uncheckedThumbColor = PlatformColors.palette.textSecondary,
                        uncheckedTrackColor = PlatformColors.palette.cardBorder
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
                        .background(PlatformColors.palette.background)
                        .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp))
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
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                        )
                        val salaryStr = player.salaryRange?.takeIf { it.isNotBlank() } ?: "—"
                        val feeDisplay = when (player.transferFee) {
                            "Free/Free loan" -> stringResource(R.string.requests_transfer_fee_free_loan)
                            "<200" -> stringResource(R.string.requests_transfer_fee_lt200)
                            else -> player.transferFee?.takeIf { it.isNotBlank() } ?: "—"
                        }
                        Text(
                            text = "$salaryStr • $feeDisplay",
                            style = regularTextStyle(PlatformColors.palette.accent, 11.sp),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = PlatformColors.palette.accent
                    )
                }
                DropdownMenu(
                    expanded = showClearSalaryMenu,
                    onDismissRequest = { showClearSalaryMenu = false },
                    containerColor = PlatformColors.palette.card
                ) {
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = PlatformColors.palette.red
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.player_info_remove_salary_transfer_fee),
                                    style = regularTextStyle(PlatformColors.palette.red, 14.sp)
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
            } // end if != YOUTH (mandate + salary)
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
                    colors = listOf(PlatformColors.palette.purple, Color(0xFF7B1FA2))
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
    platform: Platform = Platform.MEN
) {
    val playerPhone = player.getPlayerPhoneNumber()
    val agentPhone = if (platform == Platform.YOUTH) player.parentContact?.parentPhoneNumber else player.getAgentPhoneNumber()
    val hasTmProfile = player.tmProfile != null
    val hasSoccerDonna = platform == Platform.WOMEN && !player.soccerDonnaUrl.isNullOrBlank()
    val hasFmInside = platform == Platform.WOMEN && !player.fmInsideUrl.isNullOrBlank()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
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
                label = if (platform == Platform.WOMEN) stringResource(R.string.player_info_player_label_women) else stringResource(R.string.player_info_player_label),
                phone = playerPhone,
                context = context,
                onEditNumber = onEditPlayerNumber,
                onRemoveNumber = onRemovePlayerNumber
            )

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(32.dp)
                    .background(PlatformColors.palette.cardBorder)
            )

            // Agent / Parent phone action
            PlayerInfoPhoneAction(
                modifier = Modifier.weight(1f),
                label = if (platform == Platform.YOUTH) stringResource(R.string.youth_parent_phone) else stringResource(R.string.player_info_agent_label),
                phone = agentPhone,
                context = context,
                onEditNumber = onEditAgentNumber,
                onRemoveNumber = onRemoveAgentNumber
            )

            if (hasTmProfile) {
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp)
                        .background(PlatformColors.palette.cardBorder)
                )
                ContactActionChip(
                    modifier = Modifier.weight(1f),
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Link,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                            tint = PlatformColors.palette.accent
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

            if (hasSoccerDonna) {
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp)
                        .background(PlatformColors.palette.cardBorder)
                )
                ContactActionChip(
                    modifier = Modifier.weight(1f),
                    icon = {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                            tint = PlatformWomenAccent
                        )
                    },
                    label = stringResource(R.string.women_profile_sd_short),
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(player.soccerDonnaUrl)))
                    }
                )
            }

            if (hasFmInside) {
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp)
                        .background(PlatformColors.palette.cardBorder)
                )
                ContactActionChip(
                    modifier = Modifier.weight(1f),
                    icon = {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                            tint = PlatformWomenAccent
                        )
                    },
                    label = stringResource(R.string.women_profile_fmi_short),
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(player.fmInsideUrl)))
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
            style = boldTextStyle(PlatformColors.palette.textSecondary, 11.sp),
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

    Box(modifier = modifier.fillMaxWidth()) {
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
                modifier = Modifier.wrapContentWidth(Alignment.CenterHorizontally),
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
                        tint = PlatformColors.palette.accent
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = label,
                    style = boldTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center
                )
            }
        }

        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = PlatformColors.palette.card,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_message_whatsapp),
                        style = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Whatsapp,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = PlatformColors.palette.accent
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
                color = PlatformColors.palette.cardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_edit_number),
                        style = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = PlatformColors.palette.accent
                    )
                },
                onClick = {
                    showMenu = false
                    onEditNumber()
                }
            )
            HorizontalDivider(
                color = PlatformColors.palette.cardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_remove_number),
                        style = regularTextStyle(PlatformColors.palette.red, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = PlatformColors.palette.red
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
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .drawBehind {
                        drawRect(
                            color = if (hiddenGem != null && (hiddenGem?.score ?: 0) >= 60) Color(0xFFE6B800) else PlatformColors.palette.accent,
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
                    tint = if (hiddenGem != null && (hiddenGem?.score ?: 0) >= 60) Color(0xFFE6B800) else PlatformColors.palette.accent,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.player_info_ai_hidden_gem),
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                    )
                    when {
                        isHiddenGemLoading -> Text(
                            text = stringResource(R.string.player_info_ai_generating_scout_diamond_report),
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                        )
                        hiddenGem != null -> {
                            Text(
                                text = stringResource(R.string.player_info_ai_hidden_gem_score, hiddenGem!!.score),
                                style = boldTextStyle(
                                    if (hiddenGem!!.score >= 60) Color(0xFFE6B800) else PlatformColors.palette.accent,
                                    13.sp
                                )
                            )
                            hiddenGem!!.reason?.let { reason ->
                                Text(
                                    text = reason,
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                            }
                        }
                        else -> Text(
                            text = stringResource(R.string.player_info_ai_hidden_gem_check),
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
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
                            style = regularTextStyle(PlatformColors.palette.accent, 12.sp)
                        )
                    }
                }
                if (isHiddenGemLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = PlatformColors.palette.accent,
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
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .drawBehind {
                            drawRect(
                                color = PlatformColors.palette.accent,
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
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 15.sp),
                        modifier = Modifier.weight(1f)
                    )
                    if (similarPlayers.isNotEmpty()) {
                        Text(
                            "(${similarPlayers.size})",
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    }
                    Icon(
                        Icons.Default.ExpandMore,
                        contentDescription = if (isFindSimilarExpanded) "Collapse" else "Expand",
                        tint = PlatformColors.palette.textSecondary,
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
                        // Refresh button
                        if (similarPlayers.isNotEmpty()) {
                            TextButton(
                                onClick = {
                                    val currentNames = similarPlayers.mapNotNull { it.name.takeIf(String::isNotBlank) }
                                    viewModel.findSimilarPlayers(
                                        player,
                                        LocaleManager.getSavedLanguage(context),
                                        similarPlayersOptions,
                                        excludeNames = currentNames
                                    )
                                }
                            ) {
                                Text(stringResource(R.string.player_info_ai_refresh), color = PlatformColors.palette.accent)
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
                                    color = PlatformColors.palette.accent,
                                    strokeWidth = 2.dp
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.player_info_updating),
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
                                )
                            }
                        } else if (similarPlayers.isEmpty()) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    stringResource(R.string.player_info_ai_no_similar_players),
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                TextButton(
                                    onClick = { viewModel.findSimilarPlayers(player, LocaleManager.getSavedLanguage(context), similarPlayersOptions) }
                                ) {
                                    Text(stringResource(R.string.player_info_ai_refresh), color = PlatformColors.palette.accent)
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
                                                    when (shortlistRepository.addToShortlist(model)) {
                                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.Added ->
                                                            justAddedUrls = justAddedUrls + urlVal
                                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.AlreadyInShortlist ->
                                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_shortlist))
                                                        is com.liordahan.mgsrteam.features.shortlist.ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                                            ToastManager.showInfo(context.getString(R.string.add_player_already_in_roster))
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
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .drawBehind {
                            drawRect(
                                color = PlatformColors.palette.accent,
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
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 15.sp),
                        modifier = Modifier.weight(1f)
                    )
                    if (scoutReport != null) {
                        Icon(
                            Icons.Default.Share,
                            contentDescription = stringResource(R.string.player_info_share),
                            tint = PlatformColors.palette.accent,
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
                        tint = PlatformColors.palette.textSecondary,
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
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
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
                                        label = { Text(stringResource(resId), style = regularTextStyle(PlatformColors.palette.textPrimary, 11.sp)) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            containerColor = Color.Transparent,
                                            labelColor = PlatformColors.palette.textPrimary,
                                            selectedContainerColor = PlatformColors.palette.accent.copy(alpha = 0.4f),
                                            selectedLabelColor = PlatformColors.palette.accent
                                        ),
                                        border = BorderStroke(1.dp, if (scoutReportOptions.reportType == type) PlatformColors.palette.accent else PlatformColors.palette.cardBorder)
                                    )
                                }
                            }
                            if (scoutReport != null) {
                                TextButton(
                                    onClick = { viewModel.generateScoutReport(player, LocaleManager.getSavedLanguage(context), scoutReportOptions) }
                                ) {
                                    Text(stringResource(R.string.player_info_ai_refresh), color = PlatformColors.palette.accent)
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
                                    color = PlatformColors.palette.accent,
                                    strokeWidth = 2.dp
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.player_info_ai_generating_scout_report),
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
                                )
                            }
                        } else if (scoutReport != null) {
                            ScoutReportContent(
                                reportText = scoutReport!!,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp)
                            )
                        } else {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Text(
                                    stringResource(R.string.player_info_ai_scout_report_error),
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                TextButton(
                                    onClick = { viewModel.generateScoutReport(player, LocaleManager.getSavedLanguage(context), scoutReportOptions) }
                                ) {
                                    Text(stringResource(R.string.contract_finisher_retry), color = PlatformColors.palette.accent)
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
                .background(PlatformColors.palette.background)
                .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(10.dp))
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
                    .background(PlatformColors.palette.cardBorder),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    suggestion.name.take(2).uppercase(),
                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        suggestion.name,
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    suggestion.matchPercent?.let { pct ->
                        val matchColor = when {
                            pct >= 80 -> PlatformColors.palette.green
                            pct >= 60 -> PlatformColors.palette.accent
                            else -> PlatformColors.palette.orange
                        }
                        Text(
                            "${pct}%",
                            style = boldTextStyle(matchColor, 11.sp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(matchColor.copy(alpha = 0.15f))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        )
                    }
                }
                Text(
                    "${suggestion.age ?: "-"} • ${suggestion.position ?: "-"} • ${suggestion.marketValue ?: "-"}",
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            if (suggestion.transfermarktUrl != null) {
                Spacer(Modifier.width(8.dp))
            }
            Icon(
                Icons.Default.ExpandMore,
                contentDescription = if (isExpanded) "Collapse" else "Expand",
                tint = PlatformColors.palette.textSecondary,
                modifier = Modifier
                    .size(20.dp)
                    .graphicsLayer { rotationZ = if (isExpanded) 180f else 0f }
            )
        }
        // --- Expanded scout analysis section ---
        val hasAnalysis = !suggestion.scoutAnalysis.isNullOrBlank()
                || !suggestion.playingStyle.isNullOrBlank()
                || !suggestion.similarityReason.isNullOrBlank()
        AnimatedVisibility(visible = isExpanded && hasAnalysis) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 10.dp, end = 10.dp, bottom = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(PlatformColors.palette.card)
                    .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(8.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Playing style badge + match %
                val hasStyleOrMatch = !suggestion.playingStyle.isNullOrBlank() || suggestion.matchPercent != null
                if (hasStyleOrMatch) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        suggestion.playingStyle?.takeIf { it.isNotBlank() }?.let { style ->
                            Text(
                                text = style,
                                style = boldTextStyle(PlatformColors.palette.accent, 12.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(PlatformColors.palette.accent.copy(alpha = 0.12f))
                                    .border(1.dp, PlatformColors.palette.accent.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                        suggestion.matchPercent?.let { pct ->
                            val matchColor = when {
                                pct >= 80 -> PlatformColors.palette.green
                                pct >= 60 -> PlatformColors.palette.accent
                                else -> PlatformColors.palette.orange
                            }
                            Text(
                                text = "Match: $pct%",
                                style = boldTextStyle(matchColor, 12.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(matchColor.copy(alpha = 0.12f))
                                    .border(1.dp, matchColor.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }

                // Scout analysis — structured bullet display
                suggestion.scoutAnalysis?.takeIf { it.isNotBlank() }?.let { analysis ->
                    val parts = analysis.split(". ").filter { it.isNotBlank() }

                    // Separate stat lines from profile lines
                    val statLines = parts.filter { it.contains("/90") || it.contains("/shot") || it.contains("/שער") || it.contains("/בעיטה") }
                    val profileLines = parts.filter { it !in statLines }

                    // Profile info bullets (position, age, foot, build, value, style)
                    if (profileLines.isNotEmpty()) {
                        profileLines.forEach { part ->
                            val cleanPart = part.trimEnd('.').trim()
                            if (cleanPart.isNotBlank()) {
                                val icon = when {
                                    cleanPart.contains("position", ignoreCase = true) || cleanPart.contains("תפקיד") -> "🏟"
                                    cleanPart.contains("age", ignoreCase = true) || cleanPart.contains("גיל") -> "📅"
                                    cleanPart.contains("build", ignoreCase = true) || cleanPart.contains("height", ignoreCase = true) || cleanPart.contains("מבנה") -> "📏"
                                    cleanPart.contains("foot", ignoreCase = true) || cleanPart.contains("רגל") -> "🦶"
                                    cleanPart.contains("value", ignoreCase = true) || cleanPart.contains("שווי") -> "💰"
                                    cleanPart.contains("style", ignoreCase = true) || cleanPart.contains("סגנון") -> "🎨"
                                    cleanPart.contains("match", ignoreCase = true) || cleanPart.contains("התאמ") -> "✅"
                                    else -> "•"
                                }
                                Row(
                                    verticalAlignment = Alignment.Top,
                                    modifier = Modifier.padding(vertical = 1.dp)
                                ) {
                                    Text(
                                        "$icon ",
                                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    Text(
                                        cleanPart,
                                        style = regularTextStyle(PlatformColors.palette.textPrimary, 12.sp),
                                        lineHeight = 18.sp
                                    )
                                }
                            }
                        }
                    }

                    // Stat comparison section with divider
                    if (statLines.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(1.dp)
                                .background(PlatformColors.palette.cardBorder)
                        )
                        Spacer(modifier = Modifier.height(4.dp))

                        statLines.forEach { stat ->
                            val cleanStat = stat.trimEnd('.').trim()
                            if (cleanStat.isNotBlank()) {
                                // Parse "Label: value vs value" format
                                val hasVs = cleanStat.contains(" vs ")
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(PlatformColors.palette.background.copy(alpha = 0.5f))
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        "⚡ ",
                                        style = regularTextStyle(PlatformColors.palette.accent, 11.sp)
                                    )
                                    if (hasVs) {
                                        val colonIdx = cleanStat.indexOf(":")
                                        if (colonIdx > 0) {
                                            val statName = cleanStat.substring(0, colonIdx).trim()
                                            val values = cleanStat.substring(colonIdx + 1).trim()
                                            Text(
                                                "$statName: ",
                                                style = boldTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                                            )
                                            Text(
                                                values,
                                                style = regularTextStyle(PlatformColors.palette.accent, 11.sp)
                                            )
                                        } else {
                                            Text(
                                                cleanStat,
                                                style = regularTextStyle(PlatformColors.palette.textPrimary, 11.sp)
                                            )
                                        }
                                    } else {
                                        Text(
                                            cleanStat,
                                            style = regularTextStyle(PlatformColors.palette.textPrimary, 11.sp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Fallback: show raw reason if no structured analysis
                if (suggestion.scoutAnalysis.isNullOrBlank() && !suggestion.similarityReason.isNullOrBlank()) {
                    Text(
                        text = suggestion.similarityReason,
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                        lineHeight = 18.sp
                    )
                }

                // Action buttons: Add to shortlist (IconButton) + Open Transfermarkt (teal link)
                if (suggestion.transfermarktUrl != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        onAddToShortlistClick?.let { onAdd ->
                            ShortlistPillButton(
                                state = shortlistPillState(isInShortlist, isShortlistPending),
                                onClick = { onAdd() },
                            )
                        }
                        TextButton(
                            onClick = { onTmLinkClick() },
                            modifier = Modifier.height(36.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                            colors = ButtonDefaults.textButtonColors(contentColor = PlatformColors.palette.accent)
                        ) {
                            Icon(
                                Icons.Default.Link,
                                contentDescription = null,
                                tint = PlatformColors.palette.accent,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = stringResource(R.string.shortlist_open_tm),
                                style = regularTextStyle(PlatformColors.palette.accent, 13.sp)
                            )
                        }
                    }
                }
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
                    color = PlatformColors.palette.accent,
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
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = PlatformColors.palette.accent,
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
                style = boldTextStyle(PlatformColors.palette.textPrimary, 15.sp),
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = PlatformColors.palette.textSecondary,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}

@Composable
private fun PlayerTasksSection(
    tasks: List<AgentTask>,
    onAddTaskClick: () -> Unit,
    onToggleComplete: (AgentTask) -> Unit,
    onTaskClick: () -> Unit
) {
    val context = LocalContext.current
    Card(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stringResource(R.string.player_tasks_section),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
                )
                TextButton(onClick = onAddTaskClick) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp), tint = PlatformColors.palette.accent)
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = stringResource(R.string.player_tasks_add),
                        style = boldTextStyle(PlatformColors.palette.accent, 14.sp)
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            if (tasks.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(PlatformColors.palette.background)
                        .clickable(onClick = onAddTaskClick)
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.player_tasks_empty),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                    )
                }
            } else {
                tasks.forEach { task ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(PlatformColors.palette.background)
                            .clickable(onClick = onTaskClick)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = task.isCompleted,
                            onCheckedChange = { onToggleComplete(task) },
                            colors = CheckboxDefaults.colors(checkedColor = PlatformColors.palette.accent, uncheckedColor = PlatformColors.palette.textSecondary)
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = task.title.ifEmpty { "—" },
                                style = if (task.isCompleted) regularTextStyle(PlatformColors.palette.textSecondary, 14.sp).copy(textDecoration = TextDecoration.LineThrough) else boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                            )
                            // "Opened by X"
                            if (task.createdByAgentName.isNotBlank()) {
                                Text(
                                    text = context.getString(R.string.tasks_opened_by) + " " + task.createdByAgentName,
                                    style = regularTextStyle(PlatformColors.palette.accent, 11.sp)
                                )
                            }
                            if (task.agentName.isNotBlank()) {
                                Text(
                                    text = context.getString(R.string.tasks_assigned_to_label) + ": " + task.agentName,
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                            }
                            // Created + Due dates
                            val metaLine = buildString {
                                if (task.createdAt > 0L) {
                                    append(context.getString(R.string.tasks_created_on) + " " + SimpleDateFormat("dd MMM", Locale.getDefault()).format(Date(task.createdAt)))
                                }
                                if (task.dueDate > 0L) {
                                    if (isNotBlank()) append(" • ")
                                    append(context.getString(R.string.tasks_due_label) + ": " + SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(task.dueDate)))
                                }
                            }
                            if (metaLine.isNotBlank()) {
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = metaLine,
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                                )
                            }
                            // Linked agent contact
                            if (task.linkedAgentContactName.isNotBlank()) {
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = context.getString(R.string.tasks_linked_agent) + ": " + task.linkedAgentContactName +
                                        if (task.linkedAgentContactPhone.isNotBlank()) " · ${task.linkedAgentContactPhone}" else "",
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                                )
                            }
                        }
                        IconButton(onClick = onTaskClick) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, tint = PlatformColors.palette.textSecondary, modifier = Modifier.size(20.dp))
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun PlayerInfoSectionHeader(title: String) {
    val isWomen = PlatformColors.palette.isWomen
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = title,
            style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
        )
        if (isWomen) {
            com.liordahan.mgsrteam.ui.components.WomenSectionAccentBar()
        } else {
            Box(
                modifier = Modifier
                    .width(40.dp)
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(PlatformColors.palette.accent)
            )
        }
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
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
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
        tint = PlatformColors.palette.accent
    )
}


@Composable
fun InfoRow(
    title: String,
    value: String?,
    darkTheme: Boolean = false,
    icon: @Composable (() -> Unit)? = null
) {
    val labelColor = if (darkTheme) PlatformColors.palette.textSecondary else contentDefault
    val valueColor = if (darkTheme) PlatformColors.palette.textPrimary else contentDefault

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
    val labelColor = if (darkTheme) PlatformColors.palette.textSecondary else contentDefault
    val valueColor = if (darkTheme) {
        if (isFreeAgentClub(value)) PlatformColors.palette.red else PlatformColors.palette.textPrimary
    } else {
        if (isFreeAgentClub(value)) redErrorColor else contentDefault
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
        )
        Spacer(Modifier.width(8.dp))
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End
        ) {
            Text(
                text = value ?: "--",
                style = boldTextStyle(valueColor, 14.sp),
                textAlign = TextAlign.End,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
                modifier = Modifier.weight(1f, fill = false)
            )
            Spacer(Modifier.width(6.dp))
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
            tint = PlatformColors.palette.textSecondary
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = title,
            style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp),
            modifier = Modifier.weight(1f)
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = agencyName ?: "--",
                style = boldTextStyle(
                    if (url != null) PlatformColors.palette.accent else PlatformColors.palette.textPrimary,
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
                    tint = PlatformColors.palette.accent
                )
            }
        }
    }

    if (onRemoveAgency != null) {
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = PlatformColors.palette.card,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_remove_agency),
                        style = regularTextStyle(PlatformColors.palette.red, 14.sp)
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = PlatformColors.palette.red
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
    nationalities: List<String>? = null,
    nationalityFlags: List<String>? = null,
    fallbackNationality: String? = null,
    fallbackFlag: String? = null,
    darkTheme: Boolean = false
) {
    val labelColor = if (darkTheme) PlatformColors.palette.textSecondary else contentDefault
    val valueColor = if (darkTheme) PlatformColors.palette.textPrimary else contentDefault
    val names = nationalities?.filter { it.isNotBlank() }.orEmpty()
    val rawFlags = nationalityFlags?.filter { it.isNotBlank() }.orEmpty()
    // Fall back: if we have dual names but no flag URLs, use the single fallbackFlag
    val flags = rawFlags.ifEmpty { listOfNotNull(fallbackFlag) }
    val hasDual = names.size > 1

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = if (hasDual) Alignment.Top else Alignment.CenterVertically
    ) {
        Icon(
            modifier = Modifier.size(24.dp),
            painter = painterResource(R.drawable.ic_world),
            contentDescription = null,
            tint = if (darkTheme) PlatformColors.palette.textSecondary else contentDefault
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = title,
            style = regularTextStyle(labelColor, 14.sp),
            modifier = Modifier.weight(1f)
        )
        if (hasDual) {
            // Dual citizenship — stacked names + overlapping rectangle flags
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Names stacked on the left
                Column(
                    horizontalAlignment = Alignment.End
                ) {
                    names.forEach { name ->
                        Text(
                            text = name,
                            style = boldTextStyle(valueColor, 13.sp),
                            textAlign = TextAlign.End
                        )
                    }
                }
                Spacer(Modifier.width(8.dp))
                if (flags.size >= 2) {
                    // Two overlapping rounded-rectangle flags
                    Box(modifier = Modifier.size(width = 38.dp, height = 28.dp)) {
                        // Back flag (second nationality) — offset to the right
                        AsyncImage(
                            model = flags.getOrNull(1),
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(width = 26.dp, height = 18.dp)
                                .align(Alignment.BottomEnd)
                                .clip(RoundedCornerShape(3.dp))
                                .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(3.dp))
                        )
                        // Front flag (first nationality) — top-left
                        AsyncImage(
                            model = flags.getOrNull(0),
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(width = 26.dp, height = 18.dp)
                                .align(Alignment.TopStart)
                                .clip(RoundedCornerShape(3.dp))
                                .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(3.dp))
                        )
                    }
                } else if (flags.size == 1) {
                    // Only one flag URL available — show single rounded flag
                    AsyncImage(
                        model = flags[0],
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(width = 26.dp, height = 18.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(3.dp))
                    )
                }
            }
        } else {
            // Single nationality
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = names.firstOrNull() ?: fallbackNationality ?: "--",
                    style = boldTextStyle(valueColor, 14.sp),
                    textAlign = TextAlign.End
                )
                Spacer(Modifier.width(8.dp))
                AsyncImage(
                    model = flags.firstOrNull() ?: fallbackFlag,
                    contentDescription = null,
                    modifier = Modifier
                        .size(25.dp)
                        .clip(CircleShape)
                )
            }
        }
    }
}

// PhoneInfoRow and TransfermarketRow removed - functionality moved to Quick Actions

@Composable
fun UpdatePlayerUi(modifier: Modifier, message: String, useDarkTheme: Boolean = false) {
    val indicatorColor = if (useDarkTheme) PlatformColors.palette.accent else Color.White
    val textColor = if (useDarkTheme) PlatformColors.palette.textPrimary else Color.White

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
fun PlayerInfoHeader(onBackClicked: () -> Unit, currentPlatform: Platform = Platform.MEN) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
                tint = PlatformColors.palette.textSecondary,
                modifier = Modifier
                    .size(24.dp)
                    .clickWithNoRipple { onBackClicked() }
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (currentPlatform == Platform.WOMEN) stringResource(R.string.women_player_info_title) else stringResource(R.string.player_info_title),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 26.sp)
                )
                Text(
                    text = if (currentPlatform == Platform.WOMEN) stringResource(R.string.women_player_info_subtitle) else stringResource(R.string.player_info_subtitle),
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
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
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
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
                        tint = if (hasValidMandate) PlatformColors.palette.textSecondary.copy(alpha = 0.5f) else PlatformColors.palette.accent
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.player_info_generate_mandate),
                        style = boldTextStyle(
                            if (hasValidMandate) PlatformColors.palette.textSecondary.copy(alpha = 0.5f) else PlatformColors.palette.textSecondary,
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
                    tint = PlatformColors.palette.accent
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.player_info_share),
                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
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
                        tint = PlatformColors.palette.accent
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.player_info_delete),
                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
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
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.player_info_delete_player_confirm),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp),
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
                                PlatformColors.palette.card,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(100.dp))
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDismissRequest() }
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                PlatformColors.palette.red,
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
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = stringResource(R.string.player_info_delete_doc_confirm, documentName),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp),
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
                                PlatformColors.palette.card,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(100.dp))
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(PlatformColors.palette.textPrimary, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDismissRequest() }
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                PlatformColors.palette.red,
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

// ═════════════════════════════════════════════════════════════════════════════
// Youth-specific section
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerInfoYouthSection(player: Player) {
    PlayerInfoSectionHeader("⚡ " + stringResource(R.string.youth_section_details))
    PlayerInfoCard(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // Positions (from General Info)
        InfoRow(
            stringResource(R.string.player_info_positions),
            player.positions?.filterNotNull()?.joinToString(", "),
            darkTheme = true,
            icon = {
                Icon(
                    modifier = Modifier.size(24.dp),
                    painter = painterResource(R.drawable.ic_soccer),
                    contentDescription = null,
                    tint = PlatformYouthAccent
                )
            }
        )
        HorizontalDivider(
            color = PlatformColors.palette.cardBorder,
            thickness = 0.5.dp,
            modifier = Modifier.padding(vertical = 8.dp)
        )

        // Nationality (text only — no flag for youth)
        InfoRow(
            stringResource(R.string.player_info_nationality),
            player.nationality,
            darkTheme = true,
            icon = {
                Text(
                    text = "🌍",
                    fontSize = 18.sp,
                    modifier = Modifier.size(24.dp)
                )
            }
        )
        HorizontalDivider(
            color = PlatformColors.palette.cardBorder,
            thickness = 0.5.dp,
            modifier = Modifier.padding(vertical = 8.dp)
        )

        // Current Club (text only — no logo for youth)
        InfoRow(
            stringResource(R.string.player_info_current_club),
            player.currentClub?.clubName,
            darkTheme = true,
            icon = {
                Text(
                    text = "🏟",
                    fontSize = 18.sp,
                    modifier = Modifier.size(24.dp)
                )
            }
        )
        HorizontalDivider(
            color = PlatformColors.palette.cardBorder,
            thickness = 0.5.dp,
            modifier = Modifier.padding(vertical = 8.dp)
        )

        // Hebrew Name
        if (!player.fullNameHe.isNullOrBlank()) {
            InfoRow(
                stringResource(R.string.youth_hebrew_name),
                player.fullNameHe,
                darkTheme = true,
                icon = {
                    Text(
                        text = "🇮🇱",
                        fontSize = 18.sp,
                        modifier = Modifier.size(24.dp)
                    )
                }
            )
            HorizontalDivider(
                color = PlatformColors.palette.cardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }
        if (!player.ageGroup.isNullOrBlank()) {
            InfoRow(
                stringResource(R.string.youth_age_group),
                player.ageGroup,
                darkTheme = true,
                icon = {
                    Icon(
                        modifier = Modifier.size(24.dp),
                        imageVector = Icons.Default.Star,
                        contentDescription = null,
                        tint = PlatformYouthAccent
                    )
                }
            )
            HorizontalDivider(
                color = PlatformColors.palette.cardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }

        if (!player.dateOfBirth.isNullOrBlank()) {
            InfoRow(
                stringResource(R.string.youth_date_of_birth),
                player.dateOfBirth,
                darkTheme = true,
                icon = {
                    Icon(
                        modifier = Modifier.size(24.dp),
                        imageVector = Icons.Default.CalendarMonth,
                        contentDescription = null,
                        tint = PlatformYouthAccent
                    )
                }
            )
            HorizontalDivider(
                color = PlatformColors.palette.cardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }
        if (!player.ifaUrl.isNullOrBlank()) {
            val context = LocalContext.current
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                PlatformYouthAccent.copy(alpha = 0.15f),
                                PlatformYouthSecondary.copy(alpha = 0.10f)
                            )
                        )
                    )
                    .clickable {
                        context.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse(player.ifaUrl))
                        )
                    }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    modifier = Modifier.size(20.dp),
                    imageVector = Icons.Default.Link,
                    contentDescription = null,
                    tint = PlatformYouthAccent
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.youth_ifa_profile),
                    style = boldTextStyle(PlatformYouthAccent, 13.sp)
                )
                Spacer(Modifier.width(6.dp))
                Icon(
                    modifier = Modifier.size(16.dp),
                    imageVector = Icons.Default.OpenInNew,
                    contentDescription = null,
                    tint = PlatformYouthAccent.copy(alpha = 0.7f)
                )
            }
            HorizontalDivider(
                color = PlatformColors.palette.cardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }

        // Parent / Guardian contact
        player.parentContact?.let { parent ->
            Spacer(Modifier.height(4.dp))
            Text(
                text = "👨‍👦 " + stringResource(R.string.youth_parent_guardian),
                style = boldTextStyle(PlatformYouthSecondary, 13.sp),
                modifier = Modifier.padding(bottom = 6.dp)
            )
            if (!parent.parentName.isNullOrBlank()) {
                InfoRow(stringResource(R.string.youth_detail_name), parent.parentName, darkTheme = true)
                HorizontalDivider(
                    color = PlatformColors.palette.cardBorder,
                    thickness = 0.5.dp,
                    modifier = Modifier.padding(vertical = 6.dp)
                )
            }
            if (!parent.parentRelationship.isNullOrBlank()) {
                val localizedRelationship = when (parent.parentRelationship.lowercase()) {
                    "father" -> stringResource(R.string.youth_relationship_father)
                    "mother" -> stringResource(R.string.youth_relationship_mother)
                    "guardian" -> stringResource(R.string.youth_relationship_guardian)
                    else -> parent.parentRelationship
                }
                InfoRow(stringResource(R.string.youth_parent_relationship), localizedRelationship, darkTheme = true)
                HorizontalDivider(
                    color = PlatformColors.palette.cardBorder,
                    thickness = 0.5.dp,
                    modifier = Modifier.padding(vertical = 6.dp)
                )
            }
            if (!parent.parentPhoneNumber.isNullOrBlank()) {
                InfoRow(stringResource(R.string.youth_detail_phone), parent.parentPhoneNumber, darkTheme = true)
                HorizontalDivider(
                    color = PlatformColors.palette.cardBorder,
                    thickness = 0.5.dp,
                    modifier = Modifier.padding(vertical = 6.dp)
                )
            }
            if (!parent.parentEmail.isNullOrBlank()) {
                InfoRow(stringResource(R.string.youth_detail_email), parent.parentEmail, darkTheme = true)
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Women-specific section
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun PlayerInfoWomenSection(player: Player, context: Context) {
    val hasAnyLink = !player.soccerDonnaUrl.isNullOrBlank() ||
            !player.fmInsideUrl.isNullOrBlank()
    if (!hasAnyLink) return

    PlayerInfoSectionHeader("🌸 " + stringResource(R.string.women_section_links))
    PlayerInfoCard(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        if (!player.soccerDonnaUrl.isNullOrBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable {
                        val intent = Intent(Intent.ACTION_VIEW, player.soccerDonnaUrl.orEmpty().toUri())
                        context.startActivity(intent)
                    }
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = PlatformWomenAccent,
                    modifier = Modifier.size(20.dp)
                )
                Column {
                    Text(
                        text = stringResource(R.string.women_soccerdonna_profile),
                        style = boldTextStyle(PlatformWomenAccent, 13.sp)
                    )
                    Text(
                        text = player.soccerDonnaUrl.orEmpty(),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }

        if (!player.soccerDonnaUrl.isNullOrBlank() && !player.fmInsideUrl.isNullOrBlank()) {
            HorizontalDivider(
                color = PlatformColors.palette.cardBorder,
                thickness = 0.5.dp,
                modifier = Modifier.padding(vertical = 6.dp)
            )
        }

        if (!player.fmInsideUrl.isNullOrBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable {
                        val intent = Intent(Intent.ACTION_VIEW, player.fmInsideUrl.orEmpty().toUri())
                        context.startActivity(intent)
                    }
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = PlatformWomenAccent,
                    modifier = Modifier.size(20.dp)
                )
                Column {
                    Text(
                        text = stringResource(R.string.women_fminside_profile),
                        style = boldTextStyle(PlatformWomenAccent, 13.sp)
                    )
                    Text(
                        text = player.fmInsideUrl.orEmpty(),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 10.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════

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
            !expiryDate.isAfter(now) -> resources.getString(R.string.player_info_expired)
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

// ── Agent Transfer Composables ──────────────────────────────────────────────

@Composable
private fun AgentTransferSection(
    modifier: Modifier = Modifier,
    player: Player,
    pendingTransfer: com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest?,
    resolvedTransfer: com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest?,
    currentUserAccountId: String?,
    currentUserAuthUid: String?,
    currentUserAccountName: String?,
    currentUserAccountHebrewName: String?,
    isLoading: Boolean,
    onRequestTransfer: () -> Unit,
    onApproveTransfer: () -> Unit,
    onRejectTransfer: () -> Unit,
    onCancelTransfer: () -> Unit
) {
    // Triple-check: account doc ID match, auth UID match, or name match (both en/he)
    val hasAgent = !player.agentInChargeId.isNullOrEmpty() || !player.agentInChargeName.isNullOrEmpty()
    val agentName = player.agentInChargeName
    val nameMatch = !agentName.isNullOrEmpty() && (
            (!currentUserAccountName.isNullOrEmpty() && currentUserAccountName.equals(agentName, ignoreCase = true)) ||
            (!currentUserAccountHebrewName.isNullOrEmpty() && currentUserAccountHebrewName.equals(agentName, ignoreCase = true))
    )
    val isCurrentUserAgent = currentUserAccountId != null && (
            currentUserAccountId == player.agentInChargeId ||
            currentUserAuthUid == player.agentInChargeId ||
            nameMatch
    )

    android.util.Log.d("MGSR_Transfer", "AgentTransferSection: " +
            "currentUserAccountId=$currentUserAccountId, " +
            "currentUserAuthUid=$currentUserAuthUid, " +
            "currentUserAccountName=$currentUserAccountName, " +
            "currentUserAccountHebrewName=$currentUserAccountHebrewName, " +
            "player.agentInChargeId=${player.agentInChargeId}, " +
            "player.agentInChargeName=${player.agentInChargeName}, " +
            "hasAgent=$hasAgent, nameMatch=$nameMatch, isCurrentUserAgent=$isCurrentUserAgent, " +
            "pendingTransfer=${pendingTransfer?.status}")

    Column(modifier = modifier) {
        when {
            // Current user IS the agent in charge and there's a pending request TO review
            pendingTransfer != null && isCurrentUserAgent -> {
                AgentTransferApprovalBanner(
                    requesterName = pendingTransfer.toAgentName ?: "—",
                    isLoading = isLoading,
                    onApprove = onApproveTransfer,
                    onReject = onRejectTransfer
                )
            }
            // Current user requested a transfer — show pending/waiting state
            pendingTransfer != null && pendingTransfer.toAgentId == currentUserAccountId -> {
                AgentTransferPendingBanner(
                    currentAgentName = pendingTransfer.fromAgentName ?: "—",
                    onCancel = onCancelTransfer
                )
            }
            // No pending transfer, current user is NOT the agent, player has agent — show request button
            pendingTransfer == null && !isCurrentUserAgent && hasAgent -> {
                AgentTransferRequestButton(onClick = onRequestTransfer)
            }
        }

        // Resolved transfer banner (always shown if exists)
        if (resolvedTransfer != null) {
            Spacer(Modifier.height(8.dp))
            AgentTransferResolvedBanner(resolvedTransfer = resolvedTransfer)
        }
    }
}

@Composable
private fun AgentTransferResolvedBanner(
    resolvedTransfer: com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest
) {
    val isApproved = resolvedTransfer.status == com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.STATUS_APPROVED
    val bgColor = if (isApproved) Color(0xFF10B981).copy(alpha = 0.08f) else Color(0xFFEF4444).copy(alpha = 0.08f)
    val borderColor = if (isApproved) Color(0xFF10B981).copy(alpha = 0.25f) else Color(0xFFEF4444).copy(alpha = 0.25f)
    val accentColor = if (isApproved) Color(0xFF10B981) else Color(0xFFEF4444)
    val icon = if (isApproved) "✓" else "✕"

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = bgColor,
        border = BorderStroke(1.dp, borderColor)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = icon, style = boldTextStyle(accentColor, 16.sp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(
                        if (isApproved) R.string.agent_transfer_resolved_approved
                        else R.string.agent_transfer_resolved_rejected
                    ),
                    style = boldTextStyle(accentColor, 12.sp)
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (isApproved) {
                    stringResource(R.string.agent_transfer_resolved_approved_desc,
                        resolvedTransfer.fromAgentName ?: "",
                        resolvedTransfer.toAgentName ?: "")
                } else {
                    stringResource(R.string.agent_transfer_resolved_rejected_desc,
                        resolvedTransfer.fromAgentName ?: "",
                        resolvedTransfer.toAgentName ?: "")
                },
                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
            )
            resolvedTransfer.resolvedAt?.let { ts ->
                Spacer(Modifier.height(4.dp))
                Text(
                    text = java.text.SimpleDateFormat("d MMM yyyy, HH:mm", java.util.Locale.getDefault()).format(java.util.Date(ts)),
                    style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 10.sp)
                )
            }
        }
    }
}

@Composable
private fun AgentTransferRequestButton(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickWithNoRipple(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = PlatformColors.palette.accent.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, PlatformColors.palette.accent.copy(alpha = 0.3f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Text(
                text = "🙋",
                style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.agent_transfer_request_button),
                style = boldTextStyle(PlatformColors.palette.accent, 13.sp)
            )
        }
    }
}

@Composable
private fun AgentTransferPendingBanner(
    modifier: Modifier = Modifier,
    currentAgentName: String,
    onCancel: () -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFFFBBF24).copy(alpha = 0.08f),
        border = BorderStroke(1.dp, Color(0xFFFBBF24).copy(alpha = 0.25f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = "⏳", style = boldTextStyle(Color.Unspecified, 16.sp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.agent_transfer_pending_title),
                    style = boldTextStyle(Color(0xFFFBBF24), 12.sp)
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.agent_transfer_pending_desc, currentAgentName),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.agent_transfer_cancel),
                modifier = Modifier.clickWithNoRipple(onClick = onCancel),
                style = boldTextStyle(PlatformColors.palette.red, 11.sp)
            )
        }
    }
}

@Composable
private fun AgentTransferApprovalBanner(
    modifier: Modifier = Modifier,
    requesterName: String,
    isLoading: Boolean = false,
    onApprove: () -> Unit,
    onReject: () -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = PlatformColors.palette.blue.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, PlatformColors.palette.blue.copy(alpha = 0.25f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = "📨", style = boldTextStyle(Color.Unspecified, 16.sp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.agent_transfer_approval_title),
                    style = boldTextStyle(PlatformColors.palette.blue, 12.sp)
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.agent_transfer_approval_desc, requesterName),
                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
            )
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onApprove,
                    modifier = Modifier.weight(1f),
                    enabled = !isLoading,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PlatformColors.palette.green
                    )
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.agent_transfer_approve),
                            style = boldTextStyle(Color.White, 13.sp)
                        )
                    }
                }
                Button(
                    onClick = onReject,
                    modifier = Modifier.weight(1f),
                    enabled = !isLoading,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PlatformColors.palette.red.copy(alpha = 0.12f)
                    ),
                    border = BorderStroke(1.dp, PlatformColors.palette.red.copy(alpha = 0.3f))
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = PlatformColors.palette.red,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.agent_transfer_reject),
                            style = boldTextStyle(PlatformColors.palette.red, 13.sp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AgentTransferConfirmDialog(
    playerName: String,
    currentAgentName: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
            border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = "🔄", style = boldTextStyle(Color.Unspecified, 36.sp))
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.agent_transfer_confirm_title),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.agent_transfer_confirm_body, playerName, currentAgentName),
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp),
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(20.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PlatformColors.palette.background
                        )
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                        )
                    }
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PlatformColors.palette.accent
                        )
                    ) {
                        Text(
                            text = stringResource(R.string.agent_transfer_send_request),
                            style = boldTextStyle(Color.White, 14.sp)
                        )
                    }
                }
            }
        }
    }
}
