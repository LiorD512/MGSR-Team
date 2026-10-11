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
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PersonAddAlt
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Whatsapp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
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
import com.liordahan.mgsrteam.config.FeatureFlags
import com.liordahan.mgsrteam.features.add.getPhoneNumberFromContactUri
import com.liordahan.mgsrteam.features.players.models.EnglishLevel
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
import com.liordahan.mgsrteam.features.players.playerinfo.ai.SimilarPlayersOptions
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentsSection
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.MatchingRequestsSection
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.ProposalHistorySection
import com.liordahan.mgsrteam.features.requests.models.PositionDisplayNames
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
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono
import com.liordahan.mgsrteam.ui.components.GrayscalePlayerPhoto
import com.liordahan.mgsrteam.ui.components.initialsOf
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
import com.liordahan.mgsrteam.features.players.playerinfo.highlights.YouthHighlightsSection
import com.liordahan.mgsrteam.features.players.playerinfo.fmintelligence.FmIntelligenceSection
import com.liordahan.mgsrteam.utils.EuCountries
import com.liordahan.mgsrteam.ui.theme.PlatformYouthAccent
import com.liordahan.mgsrteam.ui.theme.PlatformYouthSecondary
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// ── BRIT editorial migration ────────────────────────────────────────
//  These file-local MenInfo* constants used to describe the old dark-navy
//  dossier. They are re-bound to the .brit-room cream tokens (BritTokens) so
//  the Men dossier now matches the shared cream palette:
//    Bg      → paper (cream page)
//    Card    → card  (lighter cream surface)
//    CardAlt → paper2 (deeper cream)
//    Border  → gold-tinted hairline
//    Gold    → editorial gold (dark enough to read as text on cream)
//    GoldSoft→ a readable gold for text accents (NOT the light goldSoft, which
//              is too light on cream — use the darker editorial gold for text)
//    TextSubtle → muted ink
//    Bronze  → amber (semantic warm accent)
//  Every Color.White that previously sat on the dark MenInfo surfaces has been
//  audited and moved to ink/muted; whites that remain sit on a filled accent,
//  a gradient, or a photo scrim.
private val MenInfoBg = BritTokens.paper
private val MenInfoGold = BritTokens.gold
private val MenInfoGoldSoft = BritTokens.gold
private val MenInfoTextSubtle = BritTokens.muted

private fun isMenPalette(): Boolean = !PlatformColors.palette.isYouth
private fun playerInfoAccentColor(): Color = if (isMenPalette()) MenInfoGold else PlatformColors.palette.accent

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun PlayerInfoScreen(
    viewModel: IPlayerInfoViewModel = koinViewModel(),
    playerId: String,
    autoRefresh: Boolean = false,
    navController: NavController
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val platformManager: PlatformManager = koinInject()
    val currentPlatform by platformManager.current.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    var playerToPresent by remember {
        mutableStateOf<Player?>(null)
    }

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

    val isRefreshingPlayer by viewModel.updatePlayerFlow.collectAsStateWithLifecycle(initialValue = UiResult.UnInitialized)

    var showDeletePlayerIcon by remember { mutableStateOf(false) }

    // Dossier tab state: 0 Overview · 1 Performance · 2 Documents · 3 Notes
    var selectedTab by remember { mutableIntStateOf(0) }

    var showDeleteDialog by remember { mutableStateOf(false) }
    var showSalaryTransferFeeSheet by remember { mutableStateOf(false) }
    var showAddNoteSheet by remember { mutableStateOf(false) }
    var showAllNotes by remember { mutableStateOf(false) }
    var showAddPlayerTaskSheet by remember { mutableStateOf(false) }
    var playerTasksList by remember { mutableStateOf<List<AgentTask>>(emptyList()) }
    var playerDocumentId by remember { mutableStateOf<String?>(null) }
    var allAccounts by remember { mutableStateOf<List<com.liordahan.mgsrteam.features.login.models.Account>>(emptyList()) }
    var documentsList by remember { mutableStateOf<List<PlayerDocument>>(emptyList()) }
    val isHighlightsSaving by viewModel.isHighlightsSaving.collectAsStateWithLifecycle()
    val fmIntelligenceData by viewModel.fmIntelligenceFlow.collectAsStateWithLifecycle()
    val isFmIntelligenceLoading by viewModel.isFmIntelligenceLoading.collectAsStateWithLifecycle()
    val fmIntelligenceError by viewModel.fmIntelligenceError.collectAsStateWithLifecycle()
    val deletingDocId by viewModel.deletingDocIdFlow.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var docToDelete by remember { mutableStateOf<PlayerDocument?>(null) }
    var deleteInFlight by remember { mutableStateOf(false) }
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

            launch {
                viewModel.transferSuccessFlow.collect { event ->
                    when (event) {
                        "request_sent" -> ToastManager.showSuccess(context.getString(R.string.agent_transfer_request_sent))
                        "request_already_pending" -> ToastManager.showInfo(context.getString(R.string.agent_transfer_already_pending))
                        "transfer_approved" -> ToastManager.showSuccess(context.getString(R.string.agent_transfer_approved))
                        "transfer_rejected" -> ToastManager.showInfo(context.getString(R.string.agent_transfer_rejected))
                        "request_cancelled" -> ToastManager.showInfo(context.getString(R.string.agent_transfer_cancelled))
                        "request_failed" -> ToastManager.showError(context.getString(R.string.agent_transfer_request_failed))
                    }
                }
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = if (currentPlatform == Platform.MEN) MenInfoBg else PlatformColors.palette.background
    ) { paddingValues ->

        if (showLoader) {
            SkeletonPlayerInfoLayout(
                modifier = Modifier
                    .fillMaxSize()
                    .background(if (currentPlatform == Platform.MEN) MenInfoBg else PlatformColors.palette.background)
            )
            return@Scaffold
        }

        if (showDeleteDialog) {
            val isDeleting by viewModel.showButtonProgress.collectAsStateWithLifecycle()
            DeletePlayerDialog(
                onDismissRequest = { if (!isDeleting) showDeleteDialog = false },
                isDeleting = isDeleting,
                onDeletePlayerClicked = {
                    viewModel.deletePlayer(
                        playerToPresent?.tmProfile ?: playerToPresent?.id ?: "",
                        onDeleteSuccessfully = {
                            showDeleteDialog = false
                            navController.popBackStack()
                        })
                }
            )
        }
        if (showAddNoteSheet) {
            AddNoteBottomSheet(
                accounts = allAccounts,
                onDismiss = { showAddNoteSheet = false },
                onSaveNote = { text, taggedIds ->
                    viewModel.updateNotes(
                        NotesModel(
                            notes = text,
                            createBy = "",
                            createdAt = Date().time,
                            taggedAgentIds = taggedIds.ifEmpty { null }
                        )
                    )
                    showAddNoteSheet = false
                }
            )
        }
        if (showAllNotes) {
            AllNotesScreen(
                noteList = playerToPresent?.noteList.orEmpty(),
                accounts = allAccounts,
                onBackClick = { showAllNotes = false },
                onAddNote = { text, taggedIds ->
                    viewModel.updateNotes(
                        NotesModel(
                            notes = text,
                            createBy = "",
                            createdAt = Date().time,
                            taggedAgentIds = taggedIds.ifEmpty { null }
                        )
                    )
                },
                onDeleteNote = { viewModel.onDeleteNoteClicked(it) }
            )
            return@Scaffold
        }
        if (FeatureFlags.TASKS_ENABLED && showAddPlayerTaskSheet && playerToPresent != null && playerDocumentId != null) {
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
            val isDocDeleting = deletingDocId != null
            DeleteDocumentDialog(
                documentName = docToDelete?.name ?: docToDelete?.documentType?.displayName ?: "document",
                isDeleting = isDocDeleting,
                onDismissRequest = { if (!isDocDeleting) docToDelete = null },
                onDeleteClicked = {
                    docToDelete?.let { doc ->
                        doc.id?.let {
                            deleteInFlight = true
                            viewModel.deleteDocument(it, doc.documentType == DocumentType.PASSPORT)
                        }
                    }
                }
            )
        }
        // Auto-close dialog when delete finishes
        LaunchedEffect(deletingDocId) {
            if (deletingDocId == null && deleteInFlight) {
                kotlinx.coroutines.delay(200)
                docToDelete = null
                deleteInFlight = false
            }
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
            if (player == null) return@shareAction
            val transfermarktUrl = player.tmProfile?.trim().orEmpty()
            if (transfermarktUrl.isBlank()) {
                ToastManager.showError(context.getString(R.string.player_info_share_error))
                return@shareAction
            }
            val highlightsUrl = player.pinnedHighlights
                ?.firstOrNull { it.embedUrl.isNotBlank() }
                ?.embedUrl
                ?.trim()
                ?.takeIf { it.isNotBlank() }
            val shareText = if (highlightsUrl != null) {
                "$transfermarktUrl\n\n$highlightsUrl"
            } else {
                transfermarktUrl
            }
            com.liordahan.mgsrteam.analytics.AnalyticsHelper.logSharePlayer(player.tmProfile)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, shareText)
            }
            context.startActivity(Intent.createChooser(intent, context.getString(R.string.player_info_share_with)))
        }

        val isRefreshing = isRefreshingPlayer is UiResult.Loading

        // Status-bar icons: the dossier top is the DARK cinematic hero, so use
        // LIGHT status-bar icons while it is visible; restore the app-wide dark
        // (paper) default on dispose. Mirrors LoginScreen's DisposableEffect.
        // This runs only on the main dossier — the showAllNotes short-circuit
        // above returns early (AllNotesScreen keeps its own light bars), so this
        // effect never competes with it.
        val dossierView = LocalView.current
        DisposableEffect(Unit) {
            val window = (dossierView.context as? android.app.Activity)?.window
            val controller = window?.let {
                androidx.core.view.WindowCompat.getInsetsController(it, dossierView)
            }
            controller?.isAppearanceLightStatusBars = false
            onDispose { controller?.isAppearanceLightStatusBars = true }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            val (dossierAccent, dossierAccentSoft) = BritTokens.accentFor(currentPlatform)
            val dossierListState = rememberLazyListState()
            // Non-GPS document count for the Docs tab badge.
            val docsTabCount = remember(documentsList) {
                documentsList.count { it.documentType != DocumentType.GPS_DATA }
            }
            val notesTabCount = playerToPresent?.noteList?.size ?: 0

            Box(modifier = Modifier.weight(1f)) {
                PullToRefreshBox(
                    isRefreshing = isRefreshing,
                    onRefresh = { viewModel.refreshPlayerInfo() },
                    modifier = Modifier.fillMaxSize(),
                    indicator = { } // Use custom overlay instead
                ) {
                    LazyColumn(
                        state = dossierListState,
                        modifier = Modifier
                            .fillMaxSize()
                            .then(
                                if (isRefreshing) Modifier.blur(16.dp)
                                else Modifier
                            )
                    ) {
                        // ── (1) Cinematic hero ──
                        item(key = "dossier_hero") {
                            playerToPresent?.let { player ->
                                BritDossierCinematicHero(
                                    player = player,
                                    documentsList = documentsList,
                                    currentPlatform = currentPlatform,
                                    accent = dossierAccent,
                                    accentSoft = dossierAccentSoft,
                                    onBack = { navController.popBackStack() },
                                    onRefresh = { viewModel.refreshPlayerInfo() },
                                    onShare = shareAction,
                                )
                            }
                        }

                        // ── (2) Signals row (editable costs) ──
                        item(key = "dossier_signals") {
                            playerToPresent?.let { player ->
                                PlayerInfoSignalsRow(
                                    player = player,
                                    currentPlatform = currentPlatform,
                                    accent = dossierAccent,
                                    onEditCosts = { showSalaryTransferFeeSheet = true },
                                )
                            }
                        }

                        // ── (3) Sticky tab strip ──
                        stickyHeader(key = "dossier_tabs") {
                            PlayerInfoDossierTabs(
                                selectedTab = selectedTab,
                                docsCount = docsTabCount,
                                notesCount = notesTabCount,
                                accent = dossierAccent,
                                onTabSelected = { selectedTab = it },
                            )
                        }

                        // ── (4) Pane body (sections gated by selectedTab) ──
                        item(key = "dossier_pane") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp)
                    ) {

            // ── OVERVIEW · Value history (editorial) ──────────────────── Overview pane
            if (selectedTab == 0) playerToPresent?.let { player ->
                DossierValueHistoryModule(
                    history = player.marketValueHistory,
                    accent = dossierAccent,
                    accentSoft = dossierAccentSoft,
                )
            }

            // ── OVERVIEW · Per-90 key stats (editorial) ───────────────── Overview pane
            if (selectedTab == 0) playerToPresent?.let { player ->
                val playerStats by viewModel.playerStatsFlow.collectAsStateWithLifecycle()
                val isPlayerStatsLoading by viewModel.isPlayerStatsLoading.collectAsStateWithLifecycle()
                val playerStatsError by viewModel.playerStatsError.collectAsStateWithLifecycle()
                player.tmProfile?.takeIf { it.isNotBlank() }?.let { tmProfile ->
                    LaunchedEffect(tmProfile) {
                        viewModel.fetchPlayerStats(tmProfile)
                    }
                }
                DossierKeyStatsModule(
                    data = playerStats,
                    isLoading = isPlayerStatsLoading,
                    error = playerStatsError,
                    accent = dossierAccent,
                )
            }

            // ── OVERVIEW · Similar players (AI) ───────────────────────── Overview pane
            // Men only (AI similar-players + add-to-shortlist flow). Kept intact.
            if (selectedTab == 0 && currentPlatform == Platform.MEN) {
                playerToPresent?.let { player ->
                    PlayerInfoAiHelperSection(
                        player = player,
                        viewModel = viewModel,
                        accent = dossierAccent,
                        navController = navController,
                    )
                }
            }

            // ── OVERVIEW · Player details (editorial) ─────────────────── Overview pane
            // Owns ONLY the editable fields the cinematic hero / signals row do NOT:
            // mandate, interested-in-Israel, family status, English level.
            if (selectedTab == 0) playerToPresent?.let { player ->
                val mandateDocs = documentsList
                    .filter { it.documentType == DocumentType.MANDATE }
                val mandateExpiry = mandateDocs
                    .mapNotNull { it.expiresAt }
                    .maxOrNull()
                val mandateLeagues = mandateDocs
                    .flatMap { it.validLeagues.orEmpty() }
                    .distinct()
                val detailsSavingFields by viewModel.savingFieldsFlow.collectAsStateWithLifecycle()
                BritDossierModuleHeader(
                    title = stringResource(R.string.player_info_player_details),
                    accent = dossierAccent,
                )
                PlayerDetailsModule(
                    player = player,
                    currentPlatform = currentPlatform,
                    accent = dossierAccent,
                    mandateExpiryAt = mandateExpiry,
                    mandateValidLeagues = mandateLeagues,
                    savingFields = detailsSavingFields,
                    onMandateChanged = { viewModel.updateHaveMandate(it) },
                    onInterestedInIsraelChanged = { viewModel.updateInterestedInIsrael(it) },
                    onMarriedChanged = { viewModel.updateIsMarried(it) },
                    onKidsCountChanged = { viewModel.updateKidsCount(it) },
                    onEnglishLevelChanged = { viewModel.updateEnglishLevel(it) },
                )
            }

            // ── OVERVIEW · Contact (editorial) ────────────────────────── Overview pane
            if (selectedTab == 0) playerToPresent?.let { player ->
                BritDossierModuleHeader(
                    title = stringResource(R.string.player_info_contact_header),
                    accent = dossierAccent,
                )
                PlayerContactModule(
                    player = player,
                    context = context,
                    accent = dossierAccent,
                    platform = currentPlatform,
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
                )
            }

            // Section: Agent Transfer (men only) — Overview pane (management action)
            if (selectedTab == 0 && currentPlatform == Platform.MEN) {
                playerToPresent?.let { player ->
                    val pendingTransfer by viewModel.pendingTransferFlow.collectAsStateWithLifecycle()
                    val resolvedTransfer by viewModel.resolvedTransferFlow.collectAsStateWithLifecycle()
                    val currentUserAccount by viewModel.currentUserAccountFlow.collectAsStateWithLifecycle()
                    val transferLoading by viewModel.transferLoadingFlow.collectAsStateWithLifecycle()
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
                        allAccounts = allAccounts,
                        isLoading = transferLoading,
                        onRequestTransfer = { showTransferConfirmDialog = true },
                        onApproveTransfer = { viewModel.approveTransfer() },
                        onRejectTransfer = { viewModel.rejectTransfer() },
                        onCancelTransfer = { viewModel.cancelTransferRequest() }
                    )
                }
            }

            // Section: FM Intelligence (men only) — Performance pane (mock order: first)
            if (selectedTab == 1 && currentPlatform == Platform.MEN) {
                playerToPresent?.let { player ->
                    LaunchedEffect(player.fullName) {
                        viewModel.fetchFmIntelligence(player)
                    }
                    BritDossierModuleHeader(
                        title = stringResource(R.string.player_info_attributes),
                        actLabel = stringResource(R.string.fm_section_title),
                        actGold = true,
                        accent = dossierAccent,
                    )
                    FmIntelligenceSection(
                        data = fmIntelligenceData,
                        isLoading = isFmIntelligenceLoading,
                        error = fmIntelligenceError
                    )
                }
            }

            // Section: Matching Requests — Overview pane
            if (selectedTab == 0) playerToPresent?.let { player ->
                val matchingRequests by viewModel.matchingRequestsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
                val allAccounts by viewModel.allAccountsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
                BritDossierModuleHeader(
                    title = stringResource(R.string.player_info_matching_requests),
                    accent = dossierAccent,
                )
                MatchingRequestsSection(
                    matchingRequests = matchingRequests,
                    player = player,
                    allAccounts = allAccounts,
                    viewModel = viewModel
                )

                // Section: Proposal History (persists after request deletion)
                val proposalHistory by viewModel.proposalHistoryFlow.collectAsStateWithLifecycle(initialValue = emptyList())
                BritDossierModuleHeader(
                    title = stringResource(R.string.proposal_history_title),
                    accent = dossierAccent,
                )
                ProposalHistorySection(
                    offers = proposalHistory,
                    allAccounts = allAccounts,
                    onUpdateSummary = { offerId, summary ->
                        viewModel.updateHistorySummary(offerId, summary)
                    }
                )
            }

            // ── OVERVIEW · General info (editorial) ───────────────────── Overview pane
            // (hidden for Youth — integrated into Youth section)
            if (selectedTab == 0 && currentPlatform != Platform.YOUTH) {
                playerToPresent?.let { player ->
                    BritDossierModuleHeader(
                        title = stringResource(R.string.player_info_general_info),
                        accent = dossierAccent,
                    )
                    PlayerGeneralInfoModule(
                        player = player,
                        currentPlatform = currentPlatform,
                        accent = dossierAccent,
                        onClearAgency = { viewModel.clearAgency() },
                    )
                }
            }

            // ── Platform-specific sections ─────────────────────────────── Overview pane
            if (selectedTab == 0 && currentPlatform == Platform.YOUTH) {
                playerToPresent?.let { player ->
                    PlayerInfoYouthSection(player = player)
                }
            }
            // ── GPS Performance Section ─────────────────────────────── Performance pane
            val gpsSummary by viewModel.gpsSummaryFlow.collectAsStateWithLifecycle()
            val gpsInsights by viewModel.gpsInsightsFlow.collectAsStateWithLifecycle()
            val isGpsLoading by viewModel.isGpsLoading.collectAsStateWithLifecycle()

            if (selectedTab == 1 && (gpsSummary != null || isGpsLoading)) {
                BritDossierModuleHeader(
                    title = stringResource(R.string.player_info_gps_last_match),
                    actLabel = stringResource(R.string.gps_section_title),
                    accent = dossierAccent,
                )
                com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsPerformanceSection(
                    summary = gpsSummary,
                    insights = gpsInsights,
                    isLoading = isGpsLoading
                )
            }

            // ── Highlights (all platforms) ─────────────────────────────── Performance pane
            if (selectedTab == 1) playerToPresent?.let { player ->
                BritDossierModuleHeader(
                    title = stringResource(R.string.player_info_highlights),
                    accent = dossierAccent,
                )
                YouthHighlightsSection(
                    pinnedHighlights = player.pinnedHighlights ?: emptyList(),
                    onSave = { highlights -> viewModel.saveYouthHighlights(highlights) },
                    isSaving = isHighlightsSaving
                )
            }

            // ── Documents (GPS files in expandable group) ──────────────── Documents pane
            if (selectedTab == 2) {
                val nonGpsDocs = remember(documentsList) {
                    documentsList.filter { it.documentType != DocumentType.GPS_DATA }
                }
                val gpsDocs = remember(documentsList) {
                    documentsList.filter { it.documentType == DocumentType.GPS_DATA }
                }
                BritDossierModuleHeader(
                    title = stringResource(R.string.player_info_documents),
                    accent = dossierAccent,
                )
                DocumentsSection(
                    documents = nonGpsDocs,
                    isUploading = isUploadingDocument,
                    deletingDocId = deletingDocId,
                    onAddDocument = { documentPickerLauncher.launch("*/*") },
                    onDeleteDocument = { docToDelete = it }
                )
                if (gpsDocs.isNotEmpty()) {
                    com.liordahan.mgsrteam.features.players.playerinfo.gps.GpsDocumentsExpandable(
                        gpsDocuments = gpsDocs,
                        deletingDocId = deletingDocId,
                        onDeleteDocument = { docToDelete = it }
                    )
                }

                if (FeatureFlags.TASKS_ENABLED) {
                    BritDossierModuleHeader(
                        title = stringResource(R.string.player_tasks_section),
                        accent = dossierAccent,
                    )
                    PlayerTasksSection(
                        tasks = playerTasksList,
                        onAddTaskClick = { showAddPlayerTaskSheet = true },
                        onToggleComplete = { viewModel.togglePlayerTaskCompleted(it) },
                        onTaskClick = { navController.navigate(Screens.TasksScreen.route) }
                    )
                }
            }

            // ── Notes ──────────────────────────────────────────────────── Notes pane
            if (selectedTab == 3) {
                BritDossierModuleHeader(
                    title = stringResource(R.string.player_info_notes),
                    accent = dossierAccent,
                )
                NotesSection(
                    noteList = playerToPresent?.noteList,
                    onAddNoteClicked = { showAddNoteSheet = true },
                    onDeleteNote = { viewModel.onDeleteNoteClicked(it) },
                    onViewAllClicked = { showAllNotes = true }
                )
            }
                    } // end pane Column
                        } // end item(dossier_pane)
                    } // end LazyColumn
                } // end PullToRefreshBox
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
                },
                currentPlatform = currentPlatform
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

// ═════════════════════════════════════════════════════════════════════════════
// Editorial Overview modules (.brit-room) — replace the old Material hero /
// quick-actions / general-info Cards. Hairline rows on BritTokens.paper with
// britMono uppercase labels + britDisplay/britBody values, editorial toggles
// (gold-filled pill when ON, hairline border when OFF — never a Material Switch).
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Editorial PLAYER DETAILS module. Owns ONLY the editable fields the cinematic
 * hero / signals row do NOT already present: mandate (MEN+YOUTH),
 * interested-in-Israel (MEN), family status (MEN), English level (MEN+YOUTH).
 * Salary / transfer fee stay on the signals row and are NOT duplicated here.
 */
@Composable
private fun PlayerDetailsModule(
    player: Player,
    currentPlatform: Platform,
    accent: Color,
    mandateExpiryAt: Long?,
    mandateValidLeagues: List<String>,
    savingFields: Set<String>,
    onMandateChanged: (Boolean) -> Unit,
    onInterestedInIsraelChanged: (Boolean) -> Unit,
    onMarriedChanged: (Boolean) -> Unit,
    onKidsCountChanged: (Int) -> Unit,
    onEnglishLevelChanged: (String?) -> Unit,
) {
    val isMen = currentPlatform == Platform.MEN
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .border(1.dp, BritTokens.line)
            .background(BritTokens.paper),
    ) {
        // ── Mandate (MEN + YOUTH) ──
        var isMandateOn by remember(player.haveMandate) { mutableStateOf(player.haveMandate) }
        LaunchedEffect(player.haveMandate) { isMandateOn = player.haveMandate }
        BritDetailRow(
            label = stringResource(R.string.player_info_mandate),
            saving = "haveMandate" in savingFields,
            accent = accent,
            trailing = {
                BritEditorialToggle(
                    checked = isMandateOn,
                    accent = accent,
                    onLabel = stringResource(R.string.toggle_on),
                    offLabel = stringResource(R.string.toggle_off),
                    onToggle = {
                        isMandateOn = it
                        onMandateChanged(it)
                    },
                )
            },
            subtext = if (isMandateOn) {
                buildString {
                    mandateExpiryAt?.let {
                        append(SimpleDateFormat("dd/MM/yyyy", Locale.US).format(Date(it)))
                    }
                    if (mandateValidLeagues.isNotEmpty()) {
                        if (isNotEmpty()) append("  ·  ")
                        append(mandateValidLeagues.joinToString(", "))
                    }
                }.takeIf { it.isNotBlank() }
            } else null,
        )

        // ── Interested in Israel (MEN only) ──
        if (isMen) {
            BritDetailDivider()
            var isInterested by remember(player.interestedInIsrael) { mutableStateOf(player.interestedInIsrael) }
            LaunchedEffect(player.interestedInIsrael) { isInterested = player.interestedInIsrael }
            BritDetailRow(
                label = stringResource(R.string.player_info_interested_in_israel),
                saving = "interestedInIsrael" in savingFields,
                accent = accent,
                trailing = {
                    BritEditorialToggle(
                        checked = isInterested,
                        accent = accent,
                        onLabel = stringResource(R.string.toggle_yes),
                        offLabel = stringResource(R.string.toggle_no),
                        onToggle = {
                            isInterested = it
                            onInterestedInIsraelChanged(it)
                        },
                    )
                },
            )
        }

        // ── Family status: Married + Kids (MEN only) ──
        if (isMen) {
            BritDetailDivider()
            var isMarried by remember(player.isMarried) { mutableStateOf(player.isMarried) }
            LaunchedEffect(player.isMarried) { isMarried = player.isMarried }
            BritDetailRow(
                label = stringResource(R.string.player_info_married),
                saving = "isMarried" in savingFields,
                accent = accent,
                trailing = {
                    BritEditorialToggle(
                        checked = isMarried,
                        accent = accent,
                        onLabel = stringResource(R.string.toggle_yes),
                        offLabel = stringResource(R.string.toggle_no),
                        onToggle = {
                            isMarried = it
                            onMarriedChanged(it)
                        },
                    )
                },
            )

            BritDetailDivider()
            var kidsCount by remember(player.kidsCount) { mutableIntStateOf(player.kidsCount) }
            LaunchedEffect(player.kidsCount) { kidsCount = player.kidsCount }
            BritDetailRow(
                label = stringResource(R.string.player_info_kids),
                saving = "kidsCount" in savingFields,
                accent = accent,
                trailing = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BritStepperButton(
                            icon = Icons.Default.Remove,
                            tint = if (kidsCount > 0) accent else BritTokens.muted2,
                            enabled = kidsCount > 0,
                            onClick = {
                                if (kidsCount > 0) {
                                    kidsCount--
                                    onKidsCountChanged(kidsCount)
                                }
                            },
                        )
                        Text(
                            text = "$kidsCount",
                            style = britDisplay(BritTokens.ink, 20.sp, weight = 600),
                            modifier = Modifier.padding(horizontal = 14.dp),
                        )
                        BritStepperButton(
                            icon = Icons.Default.Add,
                            tint = accent,
                            enabled = true,
                            onClick = {
                                kidsCount++
                                onKidsCountChanged(kidsCount)
                            },
                        )
                    }
                },
            )
        }

        // ── English level (MEN + YOUTH) ──
        BritDetailDivider()
        val isSavingEnglish = "englishLevel" in savingFields
        var selectedEnglishLevel by remember(player.englishLevel) {
            mutableStateOf(EnglishLevel.fromFirestore(player.englishLevel))
        }
        LaunchedEffect(player.englishLevel) {
            selectedEnglishLevel = EnglishLevel.fromFirestore(player.englishLevel)
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.player_info_english_level).uppercase(),
                    style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
                )
                if (isSavingEnglish) {
                    Spacer(Modifier.width(8.dp))
                    CircularProgressIndicator(
                        modifier = Modifier.size(12.dp),
                        strokeWidth = 2.dp,
                        color = accent,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                EnglishLevel.entries.forEach { level ->
                    val isSelected = selectedEnglishLevel == level
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .background(if (isSelected) accent else BritTokens.paper)
                            .border(1.dp, if (isSelected) accent else BritTokens.line)
                            .clickWithNoRipple {
                                if (isSelected) {
                                    selectedEnglishLevel = null
                                    onEnglishLevelChanged(null)
                                } else {
                                    selectedEnglishLevel = level
                                    onEnglishLevelChanged(level.firestoreValue)
                                }
                            }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = level.displayName.uppercase(),
                            style = britMono(
                                if (isSelected) BritTokens.paper else BritTokens.muted,
                                9.sp,
                                letterSpacing = 0.5.sp,
                                textAlign = TextAlign.Center,
                            ),
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/** One hairline detail row: britMono uppercase label (optional saving spinner) + trailing editorial control, with optional subtext under the label. */
@Composable
private fun BritDetailRow(
    label: String,
    accent: Color,
    saving: Boolean = false,
    subtext: String? = null,
    trailing: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = label.uppercase(),
                    style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
                )
                if (saving) {
                    Spacer(Modifier.width(8.dp))
                    CircularProgressIndicator(
                        modifier = Modifier.size(12.dp),
                        strokeWidth = 2.dp,
                        color = accent,
                    )
                }
            }
            if (!subtext.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = subtext,
                    style = britBody(accent, 11.sp),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        trailing()
    }
}

@Composable
private fun BritDetailDivider() {
    HorizontalDivider(color = BritTokens.line2, thickness = 1.dp)
}

/**
 * Editorial boolean toggle — NOT a Material Switch. A small hairline pill that
 * is accent-filled with paper text when ON, and transparent with a hairline
 * border + muted text when OFF.
 */
@Composable
private fun BritEditorialToggle(
    checked: Boolean,
    accent: Color,
    onLabel: String,
    offLabel: String,
    onToggle: (Boolean) -> Unit,
) {
    Box(
        modifier = Modifier
            .background(if (checked) accent else BritTokens.paper)
            .border(1.dp, if (checked) accent else BritTokens.line)
            .clickWithNoRipple { onToggle(!checked) }
            .padding(horizontal = 14.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = (if (checked) onLabel else offLabel).uppercase(),
            style = britMono(
                if (checked) BritTokens.paper else BritTokens.muted,
                10.sp,
                letterSpacing = 0.8.sp,
            ),
            maxLines = 1,
        )
    }
}

/** Editorial stepper affordance (minus / plus) — a hairline box, accent icon. */
@Composable
private fun BritStepperButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .border(1.dp, BritTokens.line)
            .then(if (enabled) Modifier.clickWithNoRipple(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(16.dp),
        )
    }
}

/**
 * Editorial GENERAL info module (non-Youth). Hairline label/value rows on
 * BritTokens.paper: height, age, positions, foot, nationality (+EU tag),
 * contract expiry, current club, agency (with clear affordance), date added
 * (MEN), market value with trend. No Material Card.
 */
@Composable
private fun PlayerGeneralInfoModule(
    player: Player,
    currentPlatform: Platform,
    accent: Color,
    onClearAgency: () -> Unit,
) {
    val resources = LocalContext.current.resources
    val localizedFoot = when (player.foot?.lowercase()) {
        "right" -> stringResource(R.string.player_info_foot_right)
        "left" -> stringResource(R.string.player_info_foot_left)
        "both" -> stringResource(R.string.player_info_foot_both)
        else -> player.foot
    }
    val isEu = currentPlatform == Platform.MEN &&
        EuCountries.isEuNational(player.nationalities, player.nationality)
    val valueTrend = remember(player.marketValueHistory) {
        playerInfoComputeValueTrend(player.marketValueHistory)
    }
    val marketValueText = player.marketValue?.let { value ->
        when {
            valueTrend > 0 -> "$value ↑"
            valueTrend < 0 -> "$value ↓"
            else -> value
        }
    }
    val marketValueColor = when {
        valueTrend > 0 -> BritTokens.green
        valueTrend < 0 -> BritTokens.red
        else -> BritTokens.ink
    }
    val previousValue = player.marketValueHistory
        ?.takeIf { it.size > 1 }
        ?.sortedByDescending { it.date }
        ?.getOrNull(1)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .border(1.dp, BritTokens.line)
            .background(BritTokens.paper),
    ) {
        BritInfoRow(stringResource(R.string.player_info_height), player.height?.replace(",", "."))
        BritDetailDivider()
        BritInfoRow(stringResource(R.string.player_info_age), player.age?.trim())
        BritDetailDivider()
        BritInfoRow(
            stringResource(R.string.player_info_positions),
            player.positions?.filterNotNull()?.joinToString(", "),
        )
        BritDetailDivider()
        BritInfoRow(stringResource(R.string.player_info_foot), localizedFoot)
        BritDetailDivider()
        BritInfoRow(
            label = stringResource(R.string.player_info_nationality),
            value = player.nationalities?.filterNotNull()?.takeIf { it.isNotEmpty() }?.joinToString(", ")
                ?: player.nationality,
            valueBadge = if (isEu) stringResource(R.string.eu_nat_badge) else null,
            accent = accent,
        )
        BritDetailDivider()
        BritInfoRow(
            stringResource(R.string.player_info_contract_expiry_date),
            getContractStatus(resources, player.contractExpired?.replace("/", ".") ?: ""),
        )
        BritDetailDivider()
        BritInfoRow(stringResource(R.string.player_info_current_club), player.currentClub?.clubName)
        BritDetailDivider()
        // Agency row with editorial clear (✕) affordance
        val hasAgency = player.agency != null || player.agencyUrl != null
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(R.string.player_info_agency).uppercase(),
                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
            )
            Spacer(Modifier.width(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = player.agency ?: "—",
                    style = britDisplay(BritTokens.ink, 15.sp, weight = 600, textAlign = TextAlign.End),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (hasAgency) {
                    Spacer(Modifier.width(10.dp))
                    Box(
                        modifier = Modifier
                            .size(26.dp)
                            .border(1.dp, BritTokens.line)
                            .clickWithNoRipple(onClick = onClearAgency),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = null,
                            tint = BritTokens.red,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
            }
        }
        if (currentPlatform == Platform.MEN && (player.createdAt ?: 0L) > 0L) {
            BritDetailDivider()
            BritInfoRow(
                stringResource(R.string.player_info_date_added),
                SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(player.createdAt!!)),
            )
        }
        BritDetailDivider()
        BritInfoRow(
            label = stringResource(R.string.player_info_market_value),
            value = marketValueText,
            valueColor = marketValueColor,
        )
        previousValue?.let {
            Text(
                text = stringResource(
                    R.string.player_info_previously,
                    it.value ?: "",
                    SimpleDateFormat("dd.MM.yy", Locale.getDefault()).format(Date(it.date ?: 0)),
                ),
                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.4.sp),
                modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 12.dp),
            )
        }
    }
}

/** Hairline label/value info row for the editorial GENERAL module. */
@Composable
private fun BritInfoRow(
    label: String,
    value: String?,
    valueColor: Color = BritTokens.ink,
    valueBadge: String? = null,
    accent: Color = BritTokens.gold,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label.uppercase(),
            style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
        )
        Spacer(Modifier.width(12.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End,
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = value?.takeIf { it.isNotBlank() } ?: "—",
                style = britDisplay(valueColor, 15.sp, weight = 600, textAlign = TextAlign.End),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (!valueBadge.isNullOrBlank()) {
                Spacer(Modifier.width(8.dp))
                Text(
                    text = valueBadge.uppercase(),
                    style = britMono(BritTokens.paper, 8.sp, letterSpacing = 0.6.sp),
                    modifier = Modifier
                        .background(accent)
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                )
            }
        }
    }
}

/**
 * Editorial CONTACT module (option A). Hairline tappable rows for player
 * WhatsApp, agent/parent WhatsApp, and the TM profile link — no Material Card,
 * no ContactActionChip. Tapping a WhatsApp row with a number launches wa.me;
 * long-press opens the edit / remove menu; tapping an empty row starts the
 * contact picker.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlayerContactModule(
    player: Player,
    context: Context,
    accent: Color,
    platform: Platform,
    onEditPlayerNumber: () -> Unit,
    onRemovePlayerNumber: () -> Unit,
    onEditAgentNumber: () -> Unit,
    onRemoveAgentNumber: () -> Unit,
) {
    val playerPhone = player.getPlayerPhoneNumber()
    val agentPhone = if (platform == Platform.YOUTH) player.parentContact?.parentPhoneNumber else player.getAgentPhoneNumber()
    val agentLabel = if (platform == Platform.YOUTH) {
        stringResource(R.string.youth_parent_phone)
    } else {
        stringResource(R.string.player_info_agent_label)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .border(1.dp, BritTokens.line)
            .background(BritTokens.paper),
    ) {
        BritContactRow(
            label = stringResource(R.string.player_info_player_label),
            phone = playerPhone,
            accent = accent,
            context = context,
            onEditNumber = onEditPlayerNumber,
            onRemoveNumber = onRemovePlayerNumber,
        )
        BritDetailDivider()
        BritContactRow(
            label = agentLabel,
            phone = agentPhone,
            accent = accent,
            context = context,
            onEditNumber = onEditAgentNumber,
            onRemoveNumber = onRemoveAgentNumber,
        )
        player.tmProfile?.takeIf { it.isNotBlank() }?.let { url ->
            BritDetailDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    }
                    .padding(horizontal = 14.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = stringResource(R.string.player_info_tm_profile).uppercase(),
                    style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

/** One editorial contact row: WhatsApp launch on tap, edit/remove on long-press, picker when empty. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun BritContactRow(
    label: String,
    phone: String?,
    accent: Color,
    context: Context,
    onEditNumber: () -> Unit,
    onRemoveNumber: () -> Unit,
) {
    val hasPhone = !phone.isNullOrBlank()
    var showMenu by remember { mutableStateOf(false) }
    Box {
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
                                    Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$clean"))
                                )
                            },
                            onLongClick = { showMenu = true },
                        )
                    } else {
                        Modifier.clickWithNoRipple { onEditNumber() }
                    }
                )
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = label.uppercase(),
                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (hasPhone) Icons.Default.Whatsapp else Icons.Default.PersonAddAlt,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = BritTokens.card,
        ) {
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_message_whatsapp),
                        style = britBody(BritTokens.ink, 14.sp),
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Whatsapp,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = accent,
                    )
                },
                onClick = {
                    showMenu = false
                    val clean = phone.orEmpty().filter { it.isDigit() }
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$clean"))
                    )
                },
            )
            HorizontalDivider(color = BritTokens.line2, thickness = 1.dp)
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_edit_number),
                        style = britBody(BritTokens.ink, 14.sp),
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = accent,
                    )
                },
                onClick = {
                    showMenu = false
                    onEditNumber()
                },
            )
            HorizontalDivider(color = BritTokens.line2, thickness = 1.dp)
            DropdownMenuItem(
                text = {
                    Text(
                        text = stringResource(R.string.player_info_remove_number),
                        style = britBody(BritTokens.red, 14.sp),
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = BritTokens.red,
                    )
                },
                onClick = {
                    showMenu = false
                    onRemoveNumber()
                },
            )
        }
    }
}

/**
 * Editorial 'SIMILAR PLAYERS' module — the mock's grayscale `.rail` of `.scard`
 * cards (docs/mobile-prototype/player-dossier-mock.html ~136-146 / 271-277).
 *
 * Renders a [BritDossierModuleHeader] whose act label is dynamic ('AI · N found'
 * when suggestions exist, else 'AI SCOUT'), a small editorial '↻ REFRESH'
 * affordance, then a horizontal [LazyRow] of 130×160 grayscale [SimilarPlayerCard]s.
 * There is NO expandable Material search Card and NO visible options form.
 *
 * The sanctioned add-to-shortlist flow for SUGGESTED players is preserved
 * (ShortlistRepository + shortlist/justAdded/pending state + ShortlistPillButton),
 * surfaced as a compact pill under each card. The DOSSIER (roster) player gets
 * no shortlist control. Men-only (gated at the call site).
 */
@Composable
private fun PlayerInfoAiHelperSection(
    player: Player,
    viewModel: IPlayerInfoViewModel,
    accent: Color,
    navController: NavController,
    shortlistRepository: ShortlistRepository = koinInject()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val shortlistEntries by shortlistRepository.getShortlistFlow().collectAsStateWithLifecycle(initialValue = emptyList())
    val shortlistUrls = remember(shortlistEntries) { shortlistEntries.map { it.tmProfileUrl }.toSet() }
    var justAddedUrls by remember { mutableStateOf<Set<String>>(emptySet()) }
    val shortlistPendingUrls by shortlistRepository.getShortlistPendingUrlsFlow()
        .collectAsStateWithLifecycle(initialValue = emptySet())
    // Options stay a hidden default — no visible options form in the editorial rail.
    val similarPlayersOptions = remember { SimilarPlayersOptions() }
    val similarPlayers by viewModel.similarPlayersFlow.collectAsStateWithLifecycle()
    val isSimilarLoading by viewModel.isSimilarPlayersLoading.collectAsStateWithLifecycle()

    // Auto-populate the rail on first composition when empty and idle.
    LaunchedEffect(player.tmProfile) {
        if (similarPlayers.isEmpty() && !isSimilarLoading) {
            viewModel.findSimilarPlayers(player, LocaleManager.getSavedLanguage(context), similarPlayersOptions)
        }
    }

    val refresh: () -> Unit = {
        val currentNames = similarPlayers.mapNotNull { it.name.takeIf(String::isNotBlank) }
        viewModel.findSimilarPlayers(
            player,
            LocaleManager.getSavedLanguage(context),
            similarPlayersOptions,
            excludeNames = currentNames,
        )
    }

    val actLabel = if (similarPlayers.isNotEmpty()) {
        stringResource(R.string.player_info_ai_found, similarPlayers.size)
    } else {
        stringResource(R.string.player_info_ai_helper)
    }

    BritDossierModuleHeader(
        title = stringResource(R.string.player_info_similar_players),
        actLabel = actLabel,
        actGold = true,
        accent = accent,
    )

    // Small editorial refresh affordance under the header (not a dropdown form).
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 10.dp),
        horizontalArrangement = Arrangement.End,
    ) {
        Text(
            text = stringResource(R.string.player_info_ai_rail_refresh).uppercase(),
            style = britMono(accent, 10.sp, letterSpacing = 0.6.sp),
            modifier = Modifier
                .clip(RoundedCornerShape(0.dp))
                .clickWithNoRipple { refresh() }
                .padding(vertical = 4.dp, horizontal = 2.dp),
        )
    }

    when {
        isSimilarLoading && similarPlayers.isEmpty() -> {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .padding(top = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(26.dp),
                    color = accent,
                    strokeWidth = 2.dp,
                )
            }
        }

        similarPlayers.isEmpty() -> {
            Text(
                text = stringResource(R.string.player_info_ai_no_similar_players).uppercase(),
                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.6.sp),
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 16.dp),
            )
        }

        else -> {
            LazyRow(
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                itemsIndexed(
                    items = similarPlayers,
                    key = { index, suggestion -> suggestion.transfermarktUrl ?: "${suggestion.name}-$index" },
                ) { _, suggestion ->
                    val url = suggestion.transfermarktUrl
                    val isInShortlist = url != null && (url in shortlistUrls || url in justAddedUrls)
                    val isShortlistPending = url != null && url in shortlistPendingUrls
                    SimilarPlayerCard(
                        suggestion = suggestion,
                        accent = accent,
                        isInShortlist = isInShortlist,
                        isShortlistPending = isShortlistPending,
                        onOpenPlayer = url?.let {
                            {
                                navController.navigate(
                                    "${Screens.PlayerInfoScreen.route}/${Uri.encode(it)}"
                                )
                            }
                        },
                        onAddToShortlistClick = url?.let { urlVal ->
                            {
                                scope.launch {
                                    val alreadyIn = urlVal in shortlistUrls || urlVal in justAddedUrls
                                    if (alreadyIn) {
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
                    )
                }
            }
        }
    }
}

/**
 * The mock's `.scard`: a 130×160 grayscale card. Box on [BritTokens.black] with a
 * [GrayscalePlayerPhoto] (imageUrl = null → ink + initials silhouette, matching
 * the mock's gradient placeholder), a top-right match-% badge (accent fill, paper
 * text) when [AiHelperService.SimilarPlayerSuggestion.matchPercent] != null, and a
 * bottom caption: goldSoft mono 'pos · club · age', britDisplay name, mono value.
 * Tapping opens the player (when [onOpenPlayer] != null). A compact
 * [ShortlistPillButton] sits beneath the card for the sanctioned add flow.
 */
@Composable
private fun SimilarPlayerCard(
    suggestion: AiHelperService.SimilarPlayerSuggestion,
    accent: Color,
    isInShortlist: Boolean,
    isShortlistPending: Boolean,
    onOpenPlayer: (() -> Unit)?,
    onAddToShortlistClick: (() -> Unit)?,
) {
    val goldSoft = BritTokens.goldSoft
    val captionParts = listOfNotNull(
        suggestion.position?.takeIf { it.isNotBlank() },
        suggestion.club?.takeIf { it.isNotBlank() },
        suggestion.age?.takeIf { it.isNotBlank() },
    )
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .width(130.dp)
                .height(160.dp)
                .clip(RoundedCornerShape(0.dp))
                .background(BritTokens.black)
                .then(
                    if (onOpenPlayer != null) Modifier.clickWithNoRipple { onOpenPlayer() } else Modifier
                ),
        ) {
            GrayscalePlayerPhoto(
                imageUrl = null,
                name = suggestion.name,
                scrimAlpha = 0.9f,
                modifier = Modifier.fillMaxSize(),
            )

            suggestion.matchPercent?.let { pct ->
                Text(
                    text = "${pct}%",
                    style = britMono(BritTokens.paper, 9.sp, letterSpacing = 0.4.sp),
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 9.dp, end = 9.dp)
                        .background(accent)
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                )
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 10.dp, end = 10.dp, bottom = 10.dp),
            ) {
                if (captionParts.isNotEmpty()) {
                    Text(
                        text = captionParts.joinToString(" · ").uppercase(),
                        style = britMono(goldSoft, 9.sp, letterSpacing = 0.4.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = suggestion.name.uppercase(),
                    style = britDisplay(BritTokens.paper, 15.sp, weight = 600),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 5.dp, bottom = 2.dp),
                )
                suggestion.marketValue?.takeIf { it.isNotBlank() }?.let { value ->
                    Text(
                        text = value.uppercase(),
                        style = britMono(BritTokens.paper.copy(alpha = 0.75f), 9.sp, letterSpacing = 0.4.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        // Sanctioned add-to-shortlist affordance for the SUGGESTED player.
        if (onAddToShortlistClick != null) {
            Box(modifier = Modifier.width(130.dp)) {
                ShortlistPillButton(
                    state = shortlistPillState(isInShortlist, isShortlistPending),
                    onClick = { onAddToShortlistClick() },
                )
            }
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
    val accent = if (PlatformColors.palette.isYouth) BritTokens.goldYouth else BritTokens.gold
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .border(1.dp, BritTokens.line)
            .background(BritTokens.paper),
    ) {
        // Editorial add affordance (replaces the Material TextButton).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickWithNoRipple(onClick = onAddTaskClick)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End,
        ) {
            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp), tint = accent)
            Spacer(Modifier.width(6.dp))
            Text(
                text = stringResource(R.string.player_tasks_add).uppercase(),
                style = britMono(accent, 10.sp, letterSpacing = 0.8.sp),
            )
        }
        if (tasks.isEmpty()) {
            BritDetailDivider()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple(onClick = onAddTaskClick)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.player_tasks_empty).uppercase(),
                    style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
                )
            }
        } else {
            tasks.forEach { task ->
                BritDetailDivider()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickWithNoRipple(onClick = onTaskClick)
                        .padding(horizontal = 14.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Editorial completion toggle (hairline box, accent check when done).
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .border(1.dp, if (task.isCompleted) accent else BritTokens.line)
                            .background(if (task.isCompleted) accent else BritTokens.paper)
                            .clickWithNoRipple { onToggleComplete(task) },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (task.isCompleted) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                tint = BritTokens.paper,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = task.title.ifEmpty { "—" },
                            style = if (task.isCompleted) {
                                britBody(BritTokens.muted, 14.sp).copy(textDecoration = TextDecoration.LineThrough)
                            } else {
                                britDisplay(BritTokens.ink, 15.sp, weight = 600)
                            }
                        )
                        if (task.createdByAgentName.isNotBlank()) {
                            Text(
                                text = (context.getString(R.string.tasks_opened_by) + " " + task.createdByAgentName).uppercase(),
                                style = britMono(accent, 9.sp, letterSpacing = 0.4.sp),
                            )
                        }
                        if (task.agentName.isNotBlank()) {
                            Text(
                                text = (context.getString(R.string.tasks_assigned_to_label) + ": " + task.agentName).uppercase(),
                                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.4.sp),
                            )
                        }
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
                                text = metaLine.uppercase(),
                                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.4.sp),
                            )
                        }
                        if (task.linkedAgentContactName.isNotBlank()) {
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = (context.getString(R.string.tasks_linked_agent) + ": " + task.linkedAgentContactName +
                                    if (task.linkedAgentContactPhone.isNotBlank()) " · ${task.linkedAgentContactPhone}" else "").uppercase(),
                                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.4.sp),
                            )
                        }
                    }
                    Icon(
                        Icons.AutoMirrored.Filled.OpenInNew,
                        contentDescription = null,
                        tint = BritTokens.muted,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
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
        tint = playerInfoAccentColor()
    )
}


// InfoRow / ClubInfoRow / AgencyInfoRow / NationalityInfoRow / PlayerInfoCard /
// PlayerInfoSectionHeader removed — the Overview general-info + Youth sections
// now render as editorial BritDossier modules (FEAT-002/FEAT-004).

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
    val isMen = currentPlatform == Platform.MEN
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
                tint = if (isMen) MenInfoGold else PlatformColors.palette.textSecondary,
                modifier = Modifier
                    .size(24.dp)
                    .clickWithNoRipple { onBackClicked() }
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.player_info_title),
                    style = boldTextStyle(if (isMen) MenInfoGoldSoft else PlatformColors.palette.textPrimary, 26.sp)
                )
                Text(
                    text = stringResource(R.string.player_info_subtitle),
                    style = regularTextStyle(if (isMen) MenInfoTextSubtle else PlatformColors.palette.textSecondary, 12.sp),
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
    onGenerateMandateClicked: () -> Unit,
    currentPlatform: Platform = Platform.MEN
) {
    // Mock `.actionbar`: sticky-bottom opaque paper bar with a hairline top
    // rule, navigation-bar padding, a gold primary Mandate pill, a dark Share
    // pill and (optionally) a Delete pill. NO shortlist control lives here —
    // the only add-to-shortlist flow is in the AI similar-players section.
    val (accent, _) = BritTokens.accentFor(currentPlatform)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(BritTokens.paper.copy(alpha = 0.97f)),
    ) {
        HorizontalDivider(color = BritTokens.line, thickness = 1.dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 18.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (hasPassportDetails) {
                DossierActionButton(
                    label = stringResource(R.string.player_info_generate_mandate),
                    icon = Icons.Default.VerifiedUser,
                    kind = DossierActionKind.PRIMARY,
                    accent = accent,
                    enabled = !hasValidMandate,
                    onClick = { if (!hasValidMandate) onGenerateMandateClicked() },
                    modifier = Modifier.weight(1f),
                )
            }
            DossierActionButton(
                label = stringResource(R.string.player_info_share),
                icon = Icons.Default.Share,
                kind = DossierActionKind.DARK,
                accent = accent,
                enabled = true,
                onClick = onShareClicked,
                modifier = Modifier.weight(1f),
            )
            if (showDeletePlayerIcon) {
                DossierActionButton(
                    label = stringResource(R.string.player_info_delete),
                    icon = Icons.Default.Delete,
                    kind = DossierActionKind.NEUTRAL,
                    accent = accent,
                    enabled = true,
                    onClick = onDeletePlayerClicked,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private enum class DossierActionKind { PRIMARY, DARK, NEUTRAL }

/** A single `.actionbar .btn` pill: square-edged, mono uppercase label + icon. */
@Composable
private fun DossierActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    kind: DossierActionKind,
    accent: Color,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bg = when {
        !enabled -> BritTokens.paper2
        kind == DossierActionKind.PRIMARY -> accent
        kind == DossierActionKind.DARK -> BritTokens.ink
        else -> BritTokens.card
    }
    val fg = when {
        !enabled -> BritTokens.muted2
        kind == DossierActionKind.PRIMARY -> BritTokens.ink
        kind == DossierActionKind.DARK -> BritTokens.paper
        else -> BritTokens.ink
    }
    val borderColor = when (kind) {
        DossierActionKind.PRIMARY -> if (enabled) accent else BritTokens.line
        DossierActionKind.DARK -> BritTokens.ink
        else -> BritTokens.line
    }
    Row(
        modifier = modifier
            .background(bg)
            .border(1.dp, borderColor)
            .clickWithNoRipple { if (enabled) onClick() }
            .padding(vertical = 13.dp, horizontal = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = fg,
            modifier = Modifier.size(15.dp),
        )
        Spacer(Modifier.width(7.dp))
        Text(
            text = label.uppercase(),
            style = britMono(fg, 10.sp, letterSpacing = 1.0.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun DeletePlayerDialog(onDismissRequest: () -> Unit, isDeleting: Boolean = false, onDeletePlayerClicked: () -> Unit) {
    Dialog(
        onDismissRequest = { if (!isDeleting) onDismissRequest() }
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
                            .clickWithNoRipple { if (!isDeleting) onDismissRequest() },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.cancel),
                            style = boldTextStyle(
                                if (isDeleting) PlatformColors.palette.textSecondary else PlatformColors.palette.textPrimary,
                                12.sp
                            )
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                if (isDeleting) PlatformColors.palette.red.copy(alpha = 0.6f) else PlatformColors.palette.red,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { if (!isDeleting) onDeletePlayerClicked() },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isDeleting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = Color.White
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.player_info_delete),
                                style = boldTextStyle(Color.White, 12.sp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeleteDocumentDialog(
    documentName: String,
    isDeleting: Boolean,
    onDismissRequest: () -> Unit,
    onDeleteClicked: () -> Unit
) {
    Dialog(onDismissRequest = { if (!isDeleting) onDismissRequest() }) {
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
                            style = boldTextStyle(
                                if (isDeleting) PlatformColors.palette.textSecondary
                                else PlatformColors.palette.textPrimary,
                                12.sp
                            ),
                            modifier = Modifier.clickWithNoRipple { if (!isDeleting) onDismissRequest() }
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                if (isDeleting) PlatformColors.palette.red.copy(alpha = 0.6f)
                                else PlatformColors.palette.red,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple { },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isDeleting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
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
    val (youthAccent, _) = BritTokens.accentFor(Platform.YOUTH)
    val context = LocalContext.current
    BritDossierModuleHeader(
        title = stringResource(R.string.youth_section_details),
        accent = youthAccent,
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .border(1.dp, BritTokens.line)
            .background(BritTokens.paper),
    ) {
        BritInfoRow(
            stringResource(R.string.player_info_positions),
            player.positions?.filterNotNull()?.joinToString(", "),
        )
        BritDetailDivider()
        BritInfoRow(stringResource(R.string.player_info_nationality), player.nationality)
        BritDetailDivider()
        BritInfoRow(stringResource(R.string.player_info_current_club), player.currentClub?.clubName)
        if (!player.fullNameHe.isNullOrBlank()) {
            BritDetailDivider()
            BritInfoRow(stringResource(R.string.youth_hebrew_name), player.fullNameHe)
        }
        if (!player.ageGroup.isNullOrBlank()) {
            BritDetailDivider()
            BritInfoRow(stringResource(R.string.youth_age_group), player.ageGroup)
        }
        if (!player.dateOfBirth.isNullOrBlank()) {
            BritDetailDivider()
            BritInfoRow(stringResource(R.string.youth_date_of_birth), player.dateOfBirth)
        }
        if (!player.ifaUrl.isNullOrBlank()) {
            BritDetailDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickWithNoRipple {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(player.ifaUrl)))
                    }
                    .padding(horizontal = 14.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = stringResource(R.string.youth_ifa_profile).uppercase(),
                    style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = youthAccent,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        // Parent / Guardian sub-group
        player.parentContact?.let { parent ->
            val hasParent = !parent.parentName.isNullOrBlank() ||
                !parent.parentRelationship.isNullOrBlank() ||
                !parent.parentPhoneNumber.isNullOrBlank() ||
                !parent.parentEmail.isNullOrBlank()
            if (hasParent) {
                BritDetailDivider()
                Text(
                    text = stringResource(R.string.youth_parent_guardian).uppercase(),
                    style = britMono(youthAccent, 9.sp, letterSpacing = 0.8.sp),
                    modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 2.dp),
                )
                if (!parent.parentName.isNullOrBlank()) {
                    BritInfoRow(stringResource(R.string.youth_detail_name), parent.parentName)
                }
                if (!parent.parentRelationship.isNullOrBlank()) {
                    val localizedRelationship = when (parent.parentRelationship.lowercase()) {
                        "father" -> stringResource(R.string.youth_relationship_father)
                        "mother" -> stringResource(R.string.youth_relationship_mother)
                        "guardian" -> stringResource(R.string.youth_relationship_guardian)
                        else -> parent.parentRelationship
                    }
                    BritDetailDivider()
                    BritInfoRow(stringResource(R.string.youth_parent_relationship), localizedRelationship)
                }
                if (!parent.parentPhoneNumber.isNullOrBlank()) {
                    BritDetailDivider()
                    BritInfoRow(stringResource(R.string.youth_detail_phone), parent.parentPhoneNumber)
                }
                if (!parent.parentEmail.isNullOrBlank()) {
                    BritDetailDivider()
                    BritInfoRow(stringResource(R.string.youth_detail_email), parent.parentEmail)
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════

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

/** Resolves an agent name to the locale-appropriate display name using allAccounts. */
private fun resolveAgentDisplayName(
    agentId: String?,
    agentName: String?,
    allAccounts: List<com.liordahan.mgsrteam.features.login.models.Account>,
    isHebrew: Boolean
): String {
    if (allAccounts.isEmpty()) return agentName ?: "—"
    val account = allAccounts.firstOrNull { it.id == agentId }
        ?: allAccounts.firstOrNull { it.name?.trim().equals(agentName?.trim(), ignoreCase = true) }
        ?: allAccounts.firstOrNull { it.hebrewName?.trim().equals(agentName?.trim(), ignoreCase = true) }
    if (account == null) return agentName ?: "—"
    return if (isHebrew) (account.hebrewName ?: account.name).orEmpty()
    else (account.name ?: "").ifEmpty { account.hebrewName.orEmpty() }
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
    allAccounts: List<com.liordahan.mgsrteam.features.login.models.Account>,
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

    val context = LocalContext.current
    val isHebrew = LocaleManager.isHebrew(context)

    Column(modifier = modifier) {
        when {
            // Current user IS the agent in charge and there's a pending request TO review
            pendingTransfer != null && isCurrentUserAgent -> {
                AgentTransferApprovalBanner(
                    requesterName = resolveAgentDisplayName(pendingTransfer.toAgentId, pendingTransfer.toAgentName, allAccounts, isHebrew),
                    isLoading = isLoading,
                    onApprove = onApproveTransfer,
                    onReject = onRejectTransfer
                )
            }
            // Current user requested a transfer — show pending/waiting state
            pendingTransfer != null && pendingTransfer.toAgentId == currentUserAccountId -> {
                AgentTransferPendingBanner(
                    currentAgentName = resolveAgentDisplayName(pendingTransfer.fromAgentId, pendingTransfer.fromAgentName, allAccounts, isHebrew),
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
            AgentTransferResolvedBanner(
                resolvedTransfer = resolvedTransfer,
                allAccounts = allAccounts,
                isHebrew = isHebrew
            )
        }
    }
}

/**
 * Editorial resolved-transfer banner — a hairline box on BritTokens.card with a
 * 2.dp gold (approved) / red (rejected) left-rule, like the mock `.note`.
 * Title in britDisplay uppercase, body in britBody, timestamp in britMono muted.
 */
@Composable
private fun AgentTransferResolvedBanner(
    resolvedTransfer: com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest,
    allAccounts: List<com.liordahan.mgsrteam.features.login.models.Account>,
    isHebrew: Boolean
) {
    val fromName = resolveAgentDisplayName(resolvedTransfer.fromAgentId, resolvedTransfer.fromAgentName, allAccounts, isHebrew)
    val toName = resolveAgentDisplayName(resolvedTransfer.toAgentId, resolvedTransfer.toAgentName, allAccounts, isHebrew)
    val isApproved = resolvedTransfer.status == com.liordahan.mgsrteam.features.players.playerinfo.agenttransfer.AgentTransferRequest.STATUS_APPROVED
    val ruleColor = if (isApproved) BritTokens.gold else BritTokens.red
    val titleColor = if (isApproved) BritTokens.green else BritTokens.red

    AgentTransferEditorialBanner(ruleColor = ruleColor) {
        Text(
            text = stringResource(
                if (isApproved) R.string.agent_transfer_resolved_approved
                else R.string.agent_transfer_resolved_rejected
            ).uppercase(),
            style = britDisplay(titleColor, 15.sp, weight = 600, letterSpacing = 0.3.sp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = if (isApproved) {
                stringResource(R.string.agent_transfer_resolved_approved_desc, fromName, toName)
            } else {
                stringResource(R.string.agent_transfer_resolved_rejected_desc, fromName, toName)
            },
            style = britBody(BritTokens.ink, 13.sp),
        )
        resolvedTransfer.resolvedAt?.let { ts ->
            Spacer(Modifier.height(8.dp))
            Text(
                text = java.text.SimpleDateFormat("d MMM yyyy, HH:mm", java.util.Locale.getDefault()).format(java.util.Date(ts)),
                style = britMono(BritTokens.muted, 9.sp, letterSpacing = 0.4.sp),
            )
        }
    }
}

/**
 * Shared editorial banner frame for the agent-transfer status cards: a hairline
 * box on BritTokens.card with an optional gold/red left-rule (mock `.note`).
 */
@Composable
private fun AgentTransferEditorialBanner(
    ruleColor: Color = BritTokens.gold,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, BritTokens.line)
            .background(BritTokens.card),
    ) {
        Box(
            modifier = Modifier
                .width(2.dp)
                .fillMaxHeight()
                .background(ruleColor),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 15.dp, vertical = 13.dp),
            content = content,
        )
    }
}

/** Editorial action pill — gold/accent fill primary, hairline secondary, red reject. */
@Composable
private fun AgentTransferActionPill(
    label: String,
    modifier: Modifier = Modifier,
    filled: Boolean = false,
    fillColor: Color = BritTokens.gold,
    outlineColor: Color = BritTokens.line,
    textColor: Color = BritTokens.ink,
    isLoading: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .background(if (filled) fillColor else BritTokens.paper)
            .border(1.dp, if (filled) fillColor else outlineColor)
            .then(if (enabled) Modifier.clickWithNoRipple(onClick = onClick) else Modifier)
            .padding(horizontal = 18.dp, vertical = 11.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                color = if (filled) BritTokens.paper else textColor,
                strokeWidth = 2.dp,
            )
        } else {
            Text(
                text = label.uppercase(),
                style = britMono(
                    if (filled) BritTokens.paper else textColor,
                    10.sp,
                    letterSpacing = 0.8.sp,
                ),
                maxLines = 1,
            )
        }
    }
}

/** Editorial request-transfer affordance — a full-width hairline pill with a gold icon. */
@Composable
private fun AgentTransferRequestButton(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, BritTokens.line)
            .background(BritTokens.paper)
            .clickWithNoRipple(onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Filled.PersonAddAlt,
                contentDescription = null,
                tint = BritTokens.gold,
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.agent_transfer_request_button).uppercase(),
                style = britMono(BritTokens.ink, 10.sp, letterSpacing = 0.8.sp),
            )
        }
    }
}

/** Editorial pending-transfer banner — amber (gold) left-rule, mono status label, red cancel pill. */
@Composable
private fun AgentTransferPendingBanner(
    modifier: Modifier = Modifier,
    currentAgentName: String,
    onCancel: () -> Unit
) {
    AgentTransferEditorialBanner(ruleColor = BritTokens.amber) {
        Text(
            text = stringResource(R.string.agent_transfer_pending_title).uppercase(),
            style = britDisplay(BritTokens.amber, 15.sp, weight = 600, letterSpacing = 0.3.sp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.agent_transfer_pending_desc, currentAgentName),
            style = britBody(BritTokens.ink, 13.sp),
        )
        Spacer(Modifier.height(12.dp))
        AgentTransferActionPill(
            label = stringResource(R.string.agent_transfer_cancel),
            modifier = modifier,
            outlineColor = BritTokens.red,
            textColor = BritTokens.red,
            onClick = onCancel,
        )
    }
}

/** Editorial approval banner — gold left-rule, mono title, gold-fill Approve + hairline-red Reject pills. */
@Composable
private fun AgentTransferApprovalBanner(
    modifier: Modifier = Modifier,
    requesterName: String,
    isLoading: Boolean = false,
    onApprove: () -> Unit,
    onReject: () -> Unit
) {
    AgentTransferEditorialBanner(ruleColor = BritTokens.gold) {
        Text(
            text = stringResource(R.string.agent_transfer_approval_title).uppercase(),
            style = britDisplay(BritTokens.ink, 15.sp, weight = 600, letterSpacing = 0.3.sp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.agent_transfer_approval_desc, requesterName),
            style = britBody(BritTokens.ink, 13.sp),
        )
        Spacer(Modifier.height(14.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            AgentTransferActionPill(
                label = stringResource(R.string.agent_transfer_approve),
                modifier = Modifier.weight(1f),
                filled = true,
                fillColor = BritTokens.gold,
                isLoading = isLoading,
                enabled = !isLoading,
                onClick = onApprove,
            )
            AgentTransferActionPill(
                label = stringResource(R.string.agent_transfer_reject),
                modifier = Modifier.weight(1f),
                outlineColor = BritTokens.red,
                textColor = BritTokens.red,
                isLoading = isLoading,
                enabled = !isLoading,
                onClick = onReject,
            )
        }
    }
}

/** Editorial confirm dialog — a hairline card on BritTokens.card, gold top-rule, mono/display text, editorial pills. */
@Composable
private fun AgentTransferConfirmDialog(
    playerName: String,
    currentAgentName: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, BritTokens.line)
                .background(BritTokens.card)
        ) {
            // Gold top-rule (editorial accent, replaces the old glow/gradient).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(BritTokens.gold)
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.agent_transfer_confirm_title).uppercase(),
                    style = britDisplay(BritTokens.ink, 20.sp, weight = 600, letterSpacing = 0.3.sp),
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = stringResource(R.string.agent_transfer_confirm_body, playerName, currentAgentName),
                    style = britBody(BritTokens.muted, 13.sp),
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(24.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    AgentTransferActionPill(
                        label = stringResource(R.string.cancel),
                        modifier = Modifier.weight(1f),
                        outlineColor = BritTokens.line,
                        textColor = BritTokens.muted,
                        onClick = onDismiss,
                    )
                    AgentTransferActionPill(
                        label = stringResource(R.string.agent_transfer_send_request),
                        modifier = Modifier.weight(1f),
                        filled = true,
                        fillColor = BritTokens.gold,
                        onClick = onConfirm,
                    )
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// BRIT cinematic dossier — hero, signals row, sticky tab strip
// (FEAT-001: rebuilt to match docs/mobile-prototype/player-dossier-mock.html)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The mock's `.hero`: a ~430dp dark cinematic header built over
 * [GrayscalePlayerPhoto]. Layers (back-to-front): grayscale portrait + bottom
 * scrim (from GrayscalePlayerPhoto), a subtle nationality flag-wash, a gold
 * radial glow, a translucent ghost initial, the floating top chrome
 * (back / refresh / share), a floating market-value plaque with a ▲/▼ delta,
 * and the bottom copy block (flag kicker · name · pos/age/club · status tags).
 * Presentation only — all data comes from the already-loaded [player].
 */
@Composable
private fun BritDossierCinematicHero(
    player: Player,
    documentsList: List<PlayerDocument>,
    currentPlatform: Platform,
    accent: Color,
    accentSoft: Color,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onShare: () -> Unit,
) {
    val name = player.fullName ?: ""
    val isEu = EuCountries.isEuNational(player.nationalities, player.nationality)
    val nationality = player.nationalities?.firstOrNull() ?: player.nationality
    val valueTrend = playerInfoComputeValueTrend(player.marketValueHistory)
    val ghost = initialsOf(name).firstOrNull()?.toString().orEmpty()

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(430.dp)
            .background(BritTokens.black)
    ) {
        // Grayscale portrait + scrim.
        GrayscalePlayerPhoto(
            imageUrl = player.profileImage,
            name = name,
            modifier = Modifier.fillMaxSize(),
            scrimAlpha = 0.95f,
        )

        // Nationality flag-wash (teal/gold split, screen-blend feel via low alpha).
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0.0f to accentSoft.copy(alpha = 0.14f),
                        0.5f to accentSoft.copy(alpha = 0.14f),
                        0.5f to accent.copy(alpha = 0.14f),
                        1.0f to accent.copy(alpha = 0.14f),
                    )
                )
        )

        // Gold radial glow (top-right).
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(accentSoft.copy(alpha = 0.22f), Color.Transparent),
                        center = Offset(900f, 120f),
                        radius = 650f,
                    )
                )
        )

        // Translucent ghost initial.
        if (ghost.isNotBlank()) {
            Text(
                text = ghost,
                style = britDisplay(accentSoft.copy(alpha = 0.08f), 260.sp, weight = 600, letterSpacing = (-8).sp),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 4.dp),
            )
        }

        // Floating top chrome: back / refresh / share.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 18.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DossierChromeIcon(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                tint = BritTokens.paper,
                borderColor = BritTokens.paper.copy(alpha = 0.18f),
                onClick = onBack,
            )
            Spacer(Modifier.weight(1f))
            DossierChromeIcon(
                icon = Icons.Default.Refresh,
                tint = BritTokens.paper,
                borderColor = BritTokens.paper.copy(alpha = 0.18f),
                onClick = onRefresh,
            )
            Spacer(Modifier.width(10.dp))
            DossierChromeIcon(
                icon = Icons.Default.Share,
                tint = accentSoft,
                borderColor = accentSoft,
                onClick = onShare,
            )
        }

        // Floating market-value plaque (top-right, below chrome).
        Column(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 118.dp, end = 22.dp),
            horizontalAlignment = Alignment.End,
        ) {
            Text(
                text = player.marketValue.orEmpty(),
                style = britDisplay(accentSoft, 34.sp, weight = 600, letterSpacing = (-1).sp),
                textAlign = TextAlign.End,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.player_info_market_value_label).uppercase(),
                style = britMono(BritTokens.muted2, 8.sp, letterSpacing = 1.4.sp, textAlign = TextAlign.End),
            )
            if (valueTrend != 0) {
                Spacer(Modifier.height(7.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (valueTrend > 0) Icons.AutoMirrored.Filled.TrendingUp
                        else Icons.AutoMirrored.Filled.TrendingDown,
                        contentDescription = null,
                        modifier = Modifier.size(13.dp),
                        tint = if (valueTrend > 0) BritTokens.green else BritTokens.red,
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = "${if (valueTrend > 0) "+" else ""}$valueTrend%",
                        style = britMono(
                            if (valueTrend > 0) BritTokens.green else BritTokens.red,
                            10.sp,
                            letterSpacing = 0.8.sp,
                        ),
                    )
                }
            }
        }

        // Bottom copy block.
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 22.dp, end = 22.dp, bottom = 22.dp),
        ) {
            // Flag kicker: nationality · EU eligible
            val kickerParts = listOfNotNull(
                nationality?.takeIf { it.isNotBlank() },
                if (isEu) stringResource(R.string.player_info_eu_eligible) else null,
            )
            if (kickerParts.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .width(16.dp)
                            .height(11.dp)
                            .background(
                                Brush.horizontalGradient(
                                    0.0f to accent,
                                    0.5f to accent,
                                    0.5f to accentSoft,
                                    1.0f to accentSoft,
                                )
                            )
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = kickerParts.joinToString(" · ").uppercase(),
                        style = britMono(accentSoft, 9.sp, letterSpacing = 1.8.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(10.dp))
            }

            // Name (big Oswald).
            Text(
                text = name,
                style = britDisplay(BritTokens.paper, 48.sp, weight = 600, letterSpacing = (-1.5).sp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            // Sub-line: POS · AGEy + club with crest.
            val posLine = player.positions?.filterNotNull()?.joinToString(" · ")
            val ageText = player.age?.takeIf { it.isNotBlank() }?.let { "${it}y" }
            val posAge = listOfNotNull(posLine, ageText).joinToString(" · ")
            Spacer(Modifier.height(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (posAge.isNotBlank()) {
                    Text(
                        text = posAge.uppercase(),
                        style = britMono(BritTokens.paper.copy(alpha = 0.85f), 11.sp, letterSpacing = 1.2.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                player.currentClub?.clubName?.takeIf { it.isNotBlank() }?.let { club ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!player.currentClub?.clubLogo.isNullOrBlank()) {
                            AsyncImage(
                                model = player.currentClub?.clubLogo,
                                contentDescription = null,
                                modifier = Modifier
                                    .size(16.dp)
                                    .clip(CircleShape)
                                    .border(1.dp, accentSoft, CircleShape),
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(16.dp)
                                    .clip(CircleShape)
                                    .background(BritTokens.ink)
                                    .border(1.dp, accentSoft, CircleShape)
                            )
                        }
                        Spacer(Modifier.width(7.dp))
                        Text(
                            text = club.uppercase(),
                            style = britMono(BritTokens.paper.copy(alpha = 0.85f), 11.sp, letterSpacing = 1.0.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            // Status tags.
            val tags = buildList {
                if (player.isOurAsset == true) add(stringResource(R.string.player_info_tag_our_asset) to true)
                if (player.haveMandate) add(stringResource(R.string.player_info_mandate) to true)
                if (isEu) add("\uD83C\uDDEA\uD83C\uDDFA " + stringResource(R.string.player_info_tag_eu_nat) to false)
                if (player.isOnLoan && !player.onLoanFromClub.isNullOrBlank()) {
                    add(stringResource(R.string.player_info_on_loan_from, player.onLoanFromClub!!) to false)
                }
            }
            if (tags.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    tags.forEach { (label, gold) ->
                        Text(
                            text = label,
                            style = britMono(
                                if (gold) accentSoft else BritTokens.paper.copy(alpha = 0.9f),
                                8.sp,
                                letterSpacing = 0.8.sp,
                            ),
                            modifier = Modifier
                                .border(
                                    1.dp,
                                    if (gold) accentSoft else BritTokens.paper.copy(alpha = 0.18f),
                                )
                                .padding(horizontal = 8.dp, vertical = 5.dp),
                        )
                    }
                }
            }
        }
    }
}

/** A single floating top-chrome icon button over the dossier hero. */
@Composable
private fun DossierChromeIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    borderColor: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .background(BritTokens.black.copy(alpha = 0.3f))
            .border(1.dp, borderColor)
            .clickWithNoRipple { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(17.dp),
        )
    }
}

/**
 * The mock's `.sig` strip: Age · Height · Foot · Contract cells plus a
 * full-width editable costs row (Salary / Transfer fee) with a ✎ pencil that
 * opens the existing SalaryTransferFeeBottomSheet via [onEditCosts]. Values use
 * gold Oswald on cream; labels use mono uppercase on hairline dividers.
 */
@Composable
private fun PlayerInfoSignalsRow(
    player: Player,
    currentPlatform: Platform,
    accent: Color,
    onEditCosts: () -> Unit,
) {
    val footLabel = when (player.foot?.lowercase()) {
        "right" -> stringResource(R.string.player_info_foot_right)
        "left" -> stringResource(R.string.player_info_foot_left)
        "both" -> stringResource(R.string.player_info_foot_both)
        else -> player.foot
    }
    val contractValue = player.contractExpired?.takeIf { it.isNotBlank() }?.let {
        getContractStatus(LocalContext.current.resources, it.replace("/", "."))
    } ?: "--"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(BritTokens.paper),
    ) {
        // Top row: Age · Height · Foot · Contract
        Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            SignalCell(
                label = stringResource(R.string.player_info_age),
                value = player.age?.takeIf { it.isNotBlank() } ?: "--",
                modifier = Modifier.weight(1f),
            )
            SignalDivider()
            SignalCell(
                label = stringResource(R.string.player_info_height),
                value = player.height?.replace(",", ".")?.takeIf { it.isNotBlank() } ?: "--",
                modifier = Modifier.weight(1f),
            )
            SignalDivider()
            SignalCell(
                label = stringResource(R.string.player_info_foot),
                value = footLabel ?: "--",
                modifier = Modifier.weight(1f),
            )
            SignalDivider()
            SignalCell(
                label = stringResource(R.string.player_info_contract_short),
                value = contractValue,
                modifier = Modifier.weight(1.4f),
            )
        }
        HorizontalDivider(color = BritTokens.line2, thickness = 1.dp)
        // Costs row: Salary / Transfer fee (editable).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
                .clickWithNoRipple { onEditCosts() },
        ) {
            CostsCell(
                label = stringResource(R.string.player_info_salary),
                value = player.salaryRange?.takeIf { it.isNotBlank() } ?: "--",
                accent = accent,
                showPencil = true,
                modifier = Modifier.weight(1f),
            )
            SignalDivider()
            CostsCell(
                label = stringResource(R.string.player_info_transfer_fee),
                value = player.transferFee?.takeIf { it.isNotBlank() } ?: "--",
                accent = accent,
                showPencil = false,
                modifier = Modifier.weight(1f),
            )
        }
        HorizontalDivider(color = BritTokens.line, thickness = 1.dp)
    }
}

@Composable
private fun SignalCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(horizontal = 12.dp, vertical = 14.dp)) {
        Text(
            text = label.uppercase(),
            style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = value,
            style = britDisplay(BritTokens.ink, 19.sp, weight = 600, letterSpacing = 0.2.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CostsCell(
    label: String,
    value: String,
    accent: Color,
    showPencil: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.padding(horizontal = 12.dp, vertical = 14.dp)) {
        Column {
            Text(
                text = label.uppercase(),
                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(7.dp))
            Text(
                text = value,
                style = britDisplay(accent, 15.sp, weight = 600),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (showPencil) {
            Icon(
                imageVector = Icons.Default.Edit,
                contentDescription = null,
                tint = BritTokens.muted2,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(14.dp),
            )
        }
    }
}

@Composable
private fun SignalDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .fillMaxHeight()
            .background(BritTokens.line2)
    )
}

/**
 * The mock's sticky `.tabs`: four equal-width tabs (Overview · Performance ·
 * Docs · Notes) with Oswald uppercase labels, a gold underline under the active
 * tab, and mono count badges next to Docs and Notes.
 */
@Composable
private fun PlayerInfoDossierTabs(
    selectedTab: Int,
    docsCount: Int,
    notesCount: Int,
    accent: Color,
    onTabSelected: (Int) -> Unit,
) {
    val tabs = listOf(
        stringResource(R.string.player_info_tab_overview) to null,
        stringResource(R.string.player_info_tab_performance) to null,
        stringResource(R.string.player_info_tab_documents) to docsCount,
        stringResource(R.string.player_info_tab_notes) to notesCount,
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(BritTokens.paper),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp),
        ) {
            tabs.forEachIndexed { index, (label, count) ->
                val selected = index == selectedTab
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickWithNoRipple { onTabSelected(index) }
                        .padding(top = 15.dp, bottom = 11.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Row(verticalAlignment = Alignment.Top) {
                        Text(
                            text = label.uppercase(),
                            style = britDisplay(
                                if (selected) BritTokens.ink else BritTokens.muted,
                                12.sp,
                                weight = 600,
                                letterSpacing = 0.5.sp,
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (count != null && count > 0) {
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = count.toString(),
                                style = britMono(accent, 8.sp, letterSpacing = 0.4.sp),
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(2.dp)
                            .padding(horizontal = 14.dp)
                            .background(if (selected) accent else Color.Transparent)
                    )
                }
            }
        }
        HorizontalDivider(color = BritTokens.line, thickness = 1.dp)
    }
}

/**
 * The mock's `.mod .mh` module header: an Oswald uppercase title with an
 * optional mono "act" label on the trailing side, sitting over a hairline rule.
 */
@Composable
private fun BritDossierModuleHeader(
    title: String,
    actLabel: String? = null,
    actGold: Boolean = false,
    accent: Color = BritTokens.gold,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 22.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                text = title.uppercase(),
                style = britDisplay(BritTokens.ink, 20.sp, weight = 600, letterSpacing = 0.3.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (!actLabel.isNullOrBlank()) {
                Spacer(Modifier.width(12.dp))
                Text(
                    text = actLabel.uppercase(),
                    style = britMono(
                        if (actGold) accent else BritTokens.muted,
                        9.sp,
                        letterSpacing = 0.6.sp,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = BritTokens.line, thickness = 1.dp)
    }
}

/**
 * The mock's `.chart` value-history module: a Compose-Canvas polyline + area
 * fill drawn from [history] market-value entries, plus a Low / Peak / Change
 * stats strip. Change uses the ▲/▼ % from [playerInfoComputeValueTrend].
 * Renders nothing meaningful when there are fewer than two priced points.
 */
@Composable
private fun DossierValueHistoryModule(
    history: List<com.liordahan.mgsrteam.features.players.models.MarketValueEntry>?,
    accent: Color,
    accentSoft: Color,
) {
    val priced = remember(history) {
        history.orEmpty()
            .sortedBy { it.date ?: 0L }
            .mapNotNull { entry ->
                entry.value?.takeIf { it.isNotBlank() }?.let { raw -> raw to raw.toMarketValueDouble() }
            }
            .filter { it.second > 0.0 }
    }
    if (priced.size < 2) return

    val values = priced.map { it.second }
    val minVal = values.min()
    val maxVal = values.max()
    val lowLabelValue = priced.first { it.second == minVal }.first
    val peakLabelValue = priced.last { it.second == maxVal }.first
    val trend = playerInfoComputeValueTrend(history)

    BritDossierModuleHeader(
        title = stringResource(R.string.player_info_value_history),
        actLabel = stringResource(R.string.player_info_value_points, priced.size),
        actGold = true,
        accent = accent,
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 6.dp),
    ) {
        val range = (maxVal - minVal).takeIf { it > 0.0 } ?: 1.0
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp),
        ) {
            val w = size.width
            val h = size.height
            val padV = h * 0.12f
            val usableH = h - padV * 2
            val stepX = if (values.size > 1) w / (values.size - 1) else w
            val points = values.mapIndexed { index, v ->
                val x = stepX * index
                val norm = ((v - minVal) / range).toFloat().coerceIn(0f, 1f)
                val y = padV + (1f - norm) * usableH
                Offset(x, y)
            }

            // Area fill under the line.
            val areaPath = Path().apply {
                moveTo(points.first().x, h)
                points.forEach { lineTo(it.x, it.y) }
                lineTo(points.last().x, h)
                close()
            }
            drawPath(
                path = areaPath,
                brush = Brush.verticalGradient(
                    colors = listOf(accent.copy(alpha = 0.14f), accent.copy(alpha = 0.0f)),
                ),
            )

            // Line.
            val linePath = Path().apply {
                moveTo(points.first().x, points.first().y)
                for (i in 1 until points.size) lineTo(points[i].x, points[i].y)
            }
            drawPath(
                path = linePath,
                color = accent,
                style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
            )

            // Endpoint dot.
            drawCircle(
                color = accent,
                radius = 3.dp.toPx(),
                center = points.last(),
            )
        }

        Spacer(Modifier.height(14.dp))
        HorizontalDivider(color = BritTokens.line2, thickness = 1.dp)
        Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            ValueStatCell(
                label = stringResource(R.string.player_info_value_low),
                value = lowLabelValue,
                valueColor = BritTokens.ink,
                modifier = Modifier.weight(1f),
            )
            SignalDivider()
            ValueStatCell(
                label = stringResource(R.string.player_info_value_peak),
                value = peakLabelValue,
                valueColor = accent,
                modifier = Modifier.weight(1f),
            )
            SignalDivider()
            ValueStatCell(
                label = stringResource(R.string.player_info_value_change),
                value = when {
                    trend > 0 -> "▲ $trend%"
                    trend < 0 -> "▼ ${-trend}%"
                    else -> "—"
                },
                valueColor = when {
                    trend > 0 -> BritTokens.green
                    trend < 0 -> BritTokens.red
                    else -> BritTokens.ink
                },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ValueStatCell(
    label: String,
    value: String,
    valueColor: Color,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.padding(horizontal = 4.dp, vertical = 12.dp)) {
        Text(
            text = label.uppercase(),
            style = britMono(BritTokens.muted, 8.sp, letterSpacing = 0.6.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(7.dp))
        Text(
            text = value,
            style = britDisplay(valueColor, 18.sp, weight = 600),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** A single per-90 stat tile value + label (mock `.kstats .k`). */
private data class DossierStatTile(val value: String, val label: String, val gold: Boolean)

/**
 * The mock's `.kstats` per-90 key-stats grid: a 3-column grid of hairline
 * tiles with Oswald hero numbers (key ones in gold) and mono labels, driven by
 * the real [data] fields. Handles the loading / unavailable states.
 */
@Composable
private fun DossierKeyStatsModule(
    data: com.liordahan.mgsrteam.features.players.playerinfo.playerstats.PlayerStatsData?,
    isLoading: Boolean,
    error: String?,
    accent: Color,
) {
    val fmt = { v: Double -> String.format(Locale.US, "%.2f", v) }

    val tiles = remember(data) {
        if (data == null) emptyList()
        else buildList {
            data.apiGoalsPer90?.let { add(DossierStatTile(fmt(it), "stat_goals_90", true)) }
            data.apiAssistsPer90?.let { add(DossierStatTile(fmt(it), "stat_assists_90", false)) }
            data.apiShotsPer90?.let { add(DossierStatTile(fmt(it), "stat_shots_90", false)) }
            data.apiKeyPassesPer90?.let { add(DossierStatTile(fmt(it), "stat_key_passes_90", false)) }
            data.apiDribblesSuccessPer90?.let { add(DossierStatTile(fmt(it), "stat_dribbles_90", false)) }
            data.apiRating?.let { add(DossierStatTile(String.format(Locale.US, "%.1f", it), "stat_rating", true)) }
            if (none { it.label == "stat_rating" }) {
                data.apiGoalContributionsPer90?.let { add(DossierStatTile(fmt(it), "stat_ga_90", true)) }
            }
        }
    }

    val apps = data?.apiAppearances
    val actLabel = if (apps != null && apps > 0) {
        stringResource(R.string.player_info_per_90_apps, apps)
    } else {
        stringResource(R.string.player_info_per_90)
    }

    BritDossierModuleHeader(
        title = stringResource(R.string.player_info_this_season),
        actLabel = actLabel,
    )

    when {
        isLoading && data == null -> {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    strokeWidth = 2.dp,
                    color = accent,
                )
            }
        }
        tiles.isEmpty() -> {
            Text(
                text = stringResource(R.string.player_info_stats_unavailable),
                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.6.sp),
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
            )
        }
        else -> {
            // Pad to a multiple of 3 so the grid border stays rectangular.
            val rows = tiles.chunked(3)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 18.dp)
                    .border(1.dp, BritTokens.line),
            ) {
                rows.forEachIndexed { rowIndex, row ->
                    if (rowIndex > 0) HorizontalDivider(color = BritTokens.line, thickness = 1.dp)
                    Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                        for (col in 0 until 3) {
                            if (col > 0) {
                                Box(
                                    modifier = Modifier
                                        .width(1.dp)
                                        .fillMaxHeight()
                                        .background(BritTokens.line)
                                )
                            }
                            val tile = row.getOrNull(col)
                            Box(modifier = Modifier.weight(1f)) {
                                if (tile != null) {
                                    DossierStatTileCell(tile = tile, accent = accent)
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
private fun DossierStatTileCell(tile: DossierStatTile, accent: Color) {
    val labelText = when (tile.label) {
        "stat_goals_90" -> stringResource(R.string.player_info_stat_goals_90)
        "stat_assists_90" -> stringResource(R.string.player_info_stat_assists_90)
        "stat_shots_90" -> stringResource(R.string.player_info_stat_shots_90)
        "stat_key_passes_90" -> stringResource(R.string.player_info_stat_key_passes_90)
        "stat_dribbles_90" -> stringResource(R.string.player_info_stat_dribbles_90)
        "stat_rating" -> stringResource(R.string.player_info_stat_rating)
        "stat_ga_90" -> stringResource(R.string.player_info_stat_ga_90)
        else -> tile.label
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(BritTokens.paper)
            .padding(horizontal = 10.dp, vertical = 15.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = tile.value,
            style = britDisplay(if (tile.gold) accent else BritTokens.ink, 26.sp, weight = 600, letterSpacing = (-0.5).sp),
            maxLines = 1,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = labelText.uppercase(),
            style = britMono(BritTokens.muted, 8.sp, letterSpacing = 0.4.sp, textAlign = TextAlign.Center),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
