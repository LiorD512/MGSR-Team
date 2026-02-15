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
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.PhoneIphone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Whatsapp
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
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
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.features.players.models.getAgentPhoneNumber
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.ui.components.setSearchViewTextFieldColors
import com.liordahan.mgsrteam.ui.components.setSearchViewTextFieldColorsDarkTheme
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
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

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
        mutableStateOf(false)
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

    var showPlayerUpdateUi by remember {
        mutableStateOf(false)
    }

    var playerUpdateUiMessage by remember {
        mutableStateOf("")
    }

    var showDeletePlayerIcon by remember { mutableStateOf(false) }

    var notesInputText by remember(playerToPresent) {
        mutableStateOf(
            TextFieldValue(
                text = playerToPresent?.notes ?: ""
            )
        )
    }

    var showDeleteDialog by remember { mutableStateOf(false) }
    var noteToDelete by remember { mutableStateOf<NotesModel?>(null) }
    var documentsList by remember { mutableStateOf<List<PlayerDocument>>(emptyList()) }
    var docToDelete by remember { mutableStateOf<PlayerDocument?>(null) }
    var isUploadingDocument by remember { mutableStateOf(false) }

    val updatingText = stringResource(R.string.player_info_updating)

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
                            showPlayerUpdateUi = true
                            playerUpdateUiMessage = it.cause
                            delay(1000)
                            showPlayerUpdateUi = false
                        }

                        UiResult.Loading -> {
                            showPlayerUpdateUi = true
                            playerUpdateUiMessage = updatingText
                        }

                        is UiResult.Success<String> -> {
                            showPlayerUpdateUi = true
                            playerUpdateUiMessage = it.data
                            delay(1000)
                            showPlayerUpdateUi = false
                        }

                        UiResult.UnInitialized -> {}
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
                    android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground
    ) { paddingValues ->

        if (showLoader) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(HomeDarkBackground),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = HomeTealAccent, strokeWidth = 3.dp)
            }

            return@Scaffold
        }

        if (showPlayerUpdateUi) {
            UpdatePlayerUi(
                modifier = Modifier.padding(paddingValues),
                message = playerUpdateUiMessage,
                useDarkTheme = true
            )
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
        if (noteToDelete != null) {
            DeleteNoteDialog(
                onDismissRequest = { noteToDelete = null },
                onDeleteClicked = {
                    noteToDelete?.let { viewModel.onDeleteNoteClicked(it) }
                    noteToDelete = null
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

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            PlayerInfoHeader(onBackClicked = { navController.popBackStack() })

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(scrollState)
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
                    onMandateChanged = { viewModel.updateHaveMandate(it) }
                )
            }

            // Quick Actions
            playerToPresent?.let { player ->
                PlayerInfoQuickActions(player = player, context = context)
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
            PlayerInfoSectionHeader(stringResource(R.string.player_info_contact_header))
            PlayerInfoCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    PhoneInfoRow(
                        stringResource(R.string.player_info_player_phone),
                        playerToPresent?.getPlayerPhoneNumber(),
                        darkTheme = true,
                        onEditPhoneClicked = {
                            launchPlayerContactPicker(
                                context,
                                playerNumberLauncher,
                                playerNumberPermissionLauncher
                            )
                        },
                        onClearClicked = {
                            viewModel.updatePlayerNumber("")
                        })
                    HorizontalDivider(
                        color = HomeDarkCardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    PhoneInfoRow(
                        stringResource(R.string.player_info_agent_phone),
                        playerToPresent?.getAgentPhoneNumber(),
                        darkTheme = true,
                        onEditPhoneClicked = {
                            launchPlayerContactPicker(
                                context,
                                agentNumberLauncher,
                                agentNumberPermissionLauncher
                            )
                        },
                        onClearClicked = {
                            viewModel.updateAgentNumber("")
                        })
                    HorizontalDivider(
                        color = HomeDarkCardBorder,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    TransfermarketRow(context, stringResource(R.string.player_info_tm_profile), playerToPresent?.tmProfile, darkTheme = true)
                }

            PlayerInfoSectionHeader(stringResource(R.string.player_info_documents))
            PlayerInfoCard(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                    if (isUploadingDocument) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = HomeTealAccent,
                                strokeWidth = 2.dp
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                text = stringResource(R.string.player_info_uploading),
                                style = regularTextStyle(HomeTextSecondary, 14.sp),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    if (documentsList.isEmpty() && !isUploadingDocument) {
                        Text(
                            text = stringResource(R.string.player_info_no_documents),
                            style = regularTextStyle(HomeTextSecondary, 14.sp),
                        )
                    } else {
                        documentsList.forEach { doc ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = doc.name ?: doc.documentType.displayName,
                                    style = regularTextStyle(HomeTextPrimary, 14.sp),
                                    modifier = Modifier.weight(1f)
                                )
                                Spacer(Modifier.width(16.dp))
                                Icon(
                                    imageVector = Icons.Default.Link,
                                    contentDescription = null,
                                    modifier = Modifier
                                        .size(20.dp)
                                        .clickWithNoRipple {
                                            doc.storageUrl?.let { url ->
                                                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                                                context.startActivity(intent)
                                            }
                                        },
                                    tint = HomeTealAccent
                                )
                                Spacer(Modifier.width(16.dp))
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = null,
                                    modifier = Modifier
                                        .size(20.dp)
                                        .clickWithNoRipple { docToDelete = doc },
                                    tint = HomeTextSecondary
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.player_info_add_document),
                        style = boldTextStyle(HomeTealAccent, 14.sp),
                        modifier = Modifier.clickWithNoRipple {
                            documentPickerLauncher.launch("*/*")
                        }
                    )
                }

            PlayerInfoSectionHeader(stringResource(R.string.player_info_notes))
            PlayerInfoCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.player_info_notes),
                            style = boldTextStyle(HomeTextPrimary, 16.sp),
                            modifier = Modifier.weight(1f)
                        )
                        Box(
                            modifier = Modifier
                                .background(
                                    HomeTealAccent,
                                    shape = RoundedCornerShape(32.dp)
                                )
                                .padding(horizontal = 14.dp, vertical = 4.dp)
                                .clickWithNoRipple {
                                    keyboardController?.hide()
                                    focusManager.clearFocus()
                                    viewModel.updateNotes(
                                        NotesModel(
                                            notes = notesInputText.text,
                                            createBy = "",
                                            createdAt = Date().time
                                        )
                                    )
                                    notesInputText = TextFieldValue(text = "")
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = stringResource(R.string.player_info_add_note),
                                style = boldTextStyle(HomeDarkBackground, 12.sp),
                            )
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                    BasicTextField(
                        value = notesInputText,
                        onValueChange = {
                            notesInputText = it
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(80.dp),
                        textStyle = regularTextStyle(HomeTextPrimary, 14.sp, direction = TextDirection.ContentOrRtl),
                        enabled = true,
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Done,
                            keyboardType = KeyboardType.Text
                        ),
                        decorationBox = { innerTextField ->
                            TextFieldDefaults.DecorationBox(
                                value = notesInputText.text,
                                innerTextField = innerTextField,
                                visualTransformation = VisualTransformation.None,
                                singleLine = false,
                                enabled = false,
                                isError = false,
                                contentPadding = PaddingValues(16.dp),
                                shape = RoundedCornerShape(16.dp),
                                colors = setSearchViewTextFieldColorsDarkTheme(),
                                interactionSource = remember { MutableInteractionSource() },
                                placeholder = {
                                    Text(
                                        stringResource(R.string.player_info_note_placeholder),
                                        style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.5f), 14.sp),
                                        maxLines = 1
                                    )
                                }
                            )
                        }
                    )

                    Spacer(Modifier.height(16.dp))

                    val notesList = playerToPresent?.noteList?.sortedByDescending { it.createdAt }

                    notesList?.forEach {
                        NoteItemUi(it, onDeleteNoteClicked = { noteToDelete = it }, darkTheme = true)
                        Spacer(Modifier.height(4.dp))
                    }
                }
            }

            val hasValidMandate = documentsList.any {
                it.documentType == DocumentType.MANDATE &&
                    (it.expiresAt == null || it.expiresAt >= System.currentTimeMillis())
            }
            PlayerInfoBottomBar(
                showDeletePlayerIcon = showDeletePlayerIcon,
                hasPassportDetails = playerToPresent?.passportDetails != null,
                hasValidMandate = hasValidMandate,
                onRefreshClicked = { viewModel.refreshPlayerInfo() },
                onDeletePlayerClicked = { showDeleteDialog = true },
                onShareClicked = shareAction,
                onGenerateMandateClicked = {
                    navController.navigate("${Screens.GenerateMandateScreen.route}/${Uri.encode(playerId)}")
                }
            )
        }
    }
}

@Composable
private fun PlayerInfoHeroCard(
    player: Player,
    mandateExpiryAt: Long? = null,
    onMandateChanged: (Boolean) -> Unit
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
                            val mandateExpiryStr = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.US).format(java.util.Date(mandateExpiryAt))
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
    context: Context
) {
    val playerPhone = player.getPlayerPhoneNumber()
    val agentPhone = player.getAgentPhoneNumber()
    val hasTmProfile = player.tmProfile != null
    val hasAnyAction = playerPhone != null || agentPhone != null || hasTmProfile
    if (!hasAnyAction) return

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            if (playerPhone != null) {
                PlayerInfoQuickActionWhatsApp(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.player_info_player_label),
                    phone = playerPhone,
                    context = context
                )
                if (agentPhone != null || hasTmProfile) {
                    Box(modifier = Modifier.width(1.dp).height(32.dp).background(HomeDarkCardBorder))
                }
            }
            if (agentPhone != null) {
                PlayerInfoQuickActionWhatsApp(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.player_info_agent_label),
                    phone = agentPhone,
                    context = context
                )
                if (hasTmProfile) {
                    Box(modifier = Modifier.width(1.dp).height(32.dp).background(HomeDarkCardBorder))
                }
            }
            if (hasTmProfile) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(14.dp)
                        .clickWithNoRipple {
                            player.tmProfile.let { url ->
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            }
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Link,
                        contentDescription = null,
                        modifier = Modifier.size(22.dp),
                        tint = HomeTealAccent
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.player_info_tm_profile),
                        style = boldTextStyle(HomeTextSecondary, 11.sp)
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayerInfoQuickActionWhatsApp(
    modifier: Modifier = Modifier,
    label: String,
    phone: String,
    context: Context
) {
    Row(
        modifier = modifier
            .padding(14.dp)
            .clickWithNoRipple {
                val clean = phone.filter { it.isDigit() }
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$clean")))
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Whatsapp,
            contentDescription = null,
            modifier = Modifier.size(22.dp),
            tint = HomeTealAccent
        )
        Spacer(Modifier.width(6.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.player_info_whatsapp),
                style = boldTextStyle(HomeTextSecondary, 11.sp)
            )
            Text(
                text = label,
                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.9f), 10.sp)
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
fun NoteItemUi(
    notesModel: NotesModel,
    onDeleteNoteClicked: (NotesModel) -> Unit,
    darkTheme: Boolean = false
) {
    var isInEditMode by remember { mutableStateOf(false) }
    val cardColor = if (darkTheme) HomeDarkCard else Color.White
    val textColor = if (darkTheme) HomeTextPrimary else contentDefault

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .shadow(2.dp, RoundedCornerShape(4.dp))
            .clickWithNoRipple { isInEditMode = !isInEditMode },
        shape = RoundedCornerShape(4.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor),
        elevation = CardDefaults.cardElevation(4.dp)
    ) {
        val sdf = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.End
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {

                AnimatedVisibility(isInEditMode, modifier = Modifier.padding(end = 8.dp)) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                        modifier = Modifier.clickWithNoRipple {
                            onDeleteNoteClicked(notesModel)
                            isInEditMode = false
                        },
                        tint = HomeTealAccent
                    )
                }
                Text(
                    text = sdf.format(notesModel.createdAt),
                    style = boldTextStyle(textColor, 12.sp),
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = notesModel.createBy ?: "",
                    style = boldTextStyle(textColor, 12.sp)
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = notesModel.notes ?: "",
                style = regularTextStyle(textColor, 14.sp, direction = TextDirection.ContentOrRtl),
                textAlign = TextAlign.Start,
                modifier = Modifier.fillMaxWidth()
            )
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

@Composable
fun PhoneInfoRow(
    title: String,
    phoneNumber: String?,
    darkTheme: Boolean = false,
    onEditPhoneClicked: () -> Unit,
    onClearClicked: () -> Unit
) {
    val labelColor = if (darkTheme) HomeTextSecondary else contentDefault
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Icon(
            modifier = Modifier.size(24.dp),
            imageVector = Icons.Default.PhoneIphone,
            contentDescription = null,
            tint = if (darkTheme) HomeTextSecondary else contentDefault
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = title,
            style = regularTextStyle(labelColor, 14.sp),
            modifier = Modifier.weight(1f)
        )

        if (phoneNumber.isNullOrEmpty()) {
            Text(
                text = "--",
                style = boldTextStyle(if (darkTheme) HomeTextSecondary else contentDefault, 14.sp),
                textAlign = TextAlign.End
            )
        } else {
            WhatsAppIcon(phoneNumber)
        }
        Spacer(Modifier.width(24.dp))
        Icon(
            imageVector = Icons.Default.Edit,
            contentDescription = null,
            modifier = Modifier.clickWithNoRipple { onEditPhoneClicked() },
            tint = if (darkTheme) HomeTealAccent else contentDefault
        )
        if (phoneNumber?.isNotEmpty() == true) {
            Spacer(Modifier.width(24.dp))
            Icon(
                imageVector = Icons.Default.Clear,
                contentDescription = null,
                modifier = Modifier.clickWithNoRipple { onClearClicked() },
                tint = if (darkTheme) HomeTextSecondary else contentDefault
            )
        }
    }
}

@Composable
fun TransfermarketRow(
    context: Context,
    title: String,
    tmLink: String?,
    darkTheme: Boolean = false
) {
    val labelColor = if (darkTheme) HomeTextSecondary else contentDefault
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Image(
            modifier = Modifier.size(24.dp),
            painter = painterResource(R.drawable.transfermarkt_logo),
            contentDescription = null
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = title,
            style = regularTextStyle(labelColor, 14.sp),
            modifier = Modifier.weight(1f)
        )
        Icon(
            imageVector = Icons.Default.Link,
            contentDescription = null,
            modifier = Modifier
                .size(width = 40.dp, height = 30.dp)
                .clickWithNoRipple {
                    tmLink?.let { link ->
                        val intent = Intent(Intent.ACTION_VIEW, link.toUri())
                        context.startActivity(intent)
                    }
                },
            tint = if (darkTheme) HomeTealAccent else contentDefault
        )
    }
}

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
    onRefreshClicked: () -> Unit,
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
                    .clickWithNoRipple { onRefreshClicked() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.player_info_refresh_cd),
                    modifier = Modifier.size(24.dp),
                    tint = HomeTealAccent
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.player_info_refresh),
                    style = boldTextStyle(HomeTextSecondary, 12.sp)
                )
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
private fun DeleteNoteDialog(
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
                    text = stringResource(R.string.player_info_delete_note_confirm),
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
