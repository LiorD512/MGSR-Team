package com.liordahan.mgsrteam.features.players.playerinfo

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.ManagedActivityResultLauncher
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Whatsapp
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getAgentPhoneNumber
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.components.PrimaryButtonNewDesign
import com.liordahan.mgsrteam.ui.components.setSearchViewTextFieldColors
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.theme.redErrorColor
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
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
                            playerUpdateUiMessage = "Updating..."
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
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            PlayerInfoTopBar(
                showDeletePlayerIcon = showDeletePlayerIcon,
                onDeletePlayerClicked = {
                    showDeleteDialog = true
                },
                onShareClicked = {
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
                            append("Current Club: ${player.currentClub?.clubName ?: "Unknown"}")
                        } ?: append("Player data not available.")
                    }
                    sharePlayerOnWhatsapp(context, textToSend.toString())
                },
                onBackClicked = {
                    navController.popBackStack()
                }
            )
        }
    ) { paddingValues ->

        if (showLoader) {
            Box(Modifier.fillMaxSize()) {
                ProgressIndicator(
                    modifier = Modifier.align(Alignment.Center)
                )
            }

            return@Scaffold
        }

        if (showPlayerUpdateUi) {
            UpdatePlayerUi(
                modifier = Modifier.padding(paddingValues),
                message = playerUpdateUiMessage
            )
        }

        if (showDeleteDialog) {
            DeletePlayerDialog(
                onDismissRequest = { showDeleteDialog = false },
                onDeletePlayerClicked = {
                    viewModel.deletePlayer(
                        playerToPresent?.tmProfile ?: "",
                        onDeleteSuccessfully = { navController.popBackStack() })
                }
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(paddingValues)
                .padding(top = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Profile Image
            AsyncImage(
                model = playerToPresent?.profileImage ?: "",
                contentDescription = "Player Image",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(120.dp)
                    .clip(CircleShape)
                    .border(width = 0.5.dp, color = contentDefault, shape = CircleShape)
                    .shadow(elevation = 8.dp, shape = CircleShape)
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Name
            Text(
                text = playerToPresent?.fullName ?: "Unknown",
                style = boldTextStyle(contentDefault, 20.sp)
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = buildAnnotatedString {
                    append("Added by - ")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(playerToPresent?.agentInChargeName)
                    }
                }
            )

            Spacer(modifier = Modifier.height(16.dp))

            Card(
                modifier = Modifier.padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(8.dp)
            ) {

                Column(modifier = Modifier.padding(16.dp)) {

                    Text(
                        text = "General Info",
                        style = boldTextStyle(contentDefault, 16.sp),
                    )

                    Spacer(Modifier.height(24.dp))

                    InfoRow(
                        "Height",
                        playerToPresent?.height?.replace(",", "."),
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_height),
                                contentDescription = null,
                                tint = contentDefault
                            )
                        })
                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    InfoRow(
                        "Age",
                        playerToPresent?.age,
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                imageVector = Icons.Default.CalendarMonth,
                                contentDescription = null,
                                tint = contentDefault
                            )
                        })
                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    InfoRow(
                        "Positions",
                        playerToPresent?.positions?.filterNotNull()?.joinToString(", "),
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_soccer),
                                contentDescription = null,
                                tint = contentDefault
                            )
                        }
                    )

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    NationalityInfoRow(
                        "Nationality",
                        playerToPresent?.nationality,
                        playerToPresent?.nationalityFlag
                    )

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    InfoRow(
                        "Contract Expiry Date",
                        getContractStatus(playerToPresent?.contractExpired ?: ""),
                        icon = {
                            Icon(
                                modifier = Modifier.size(24.dp),
                                painter = painterResource(R.drawable.ic_contract),
                                contentDescription = null,
                                tint = contentDefault
                            )
                        })

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    ClubInfoRow(
                        "Current Club",
                        playerToPresent?.currentClub?.clubName,
                        playerToPresent?.currentClub?.clubLogo
                    )

                    HorizontalDivider(
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    InfoRow("Market Value", playerToPresent?.marketValue, icon = {
                        Icon(
                            modifier = Modifier.size(24.dp),
                            painter = painterResource(R.drawable.ic_euro),
                            contentDescription = null,
                            tint = contentDefault
                        )
                    })

                }
            }

            Card(
                modifier = Modifier.padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(8.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {

                    Text(
                        text = "Contact Info",
                        style = boldTextStyle(contentDefault, 16.sp),
                    )

                    Spacer(Modifier.height(24.dp))

                    PhoneInfoRow(
                        "Player Phone",
                        playerToPresent?.getPlayerPhoneNumber(),
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
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    PhoneInfoRow(
                        "Agent Phone",
                        playerToPresent?.getAgentPhoneNumber(),
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
                        color = dividerColor,
                        thickness = 0.5.dp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )

                    TransfermarketRow(context, "TM Profile", playerToPresent?.tmProfile)
                }
            }

            Card(
                modifier = Modifier.padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(8.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {

                        Text(
                            text = "Notes",
                            style = boldTextStyle(contentDefault, 16.sp),
                            modifier = Modifier.weight(1f)
                        )

                        Box(
                            modifier = Modifier
                                .background(
                                    contentDefault,
                                    shape = RoundedCornerShape(32.dp)
                                )
                                .padding(horizontal = 14.dp, vertical = 4.dp)
                                .clickWithNoRipple {
                                    keyboardController?.hide()
                                    focusManager.clearFocus()
                                    viewModel.updateNotes(notesInputText.text)
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Save",
                                style = boldTextStyle(Color.White, 12.sp),
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
                            .height(150.dp),
                        textStyle = regularTextStyle(contentDefault, 14.sp),
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
                                colors = setSearchViewTextFieldColors(),
                                interactionSource = remember { MutableInteractionSource() },
                                placeholder = {
                                    Text(
                                        "Write your notes here...",
                                        style = regularTextStyle(contentDefault, 14.sp),
                                        maxLines = 1
                                    )
                                }
                            )
                        }
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
        }
    )
}


@Composable
fun InfoRow(title: String, value: String?, icon: @Composable (() -> Unit)? = null) {
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
            style = regularTextStyle(contentDefault, 14.sp),
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value ?: "--",
            style = boldTextStyle(contentDefault, 14.sp),
            textAlign = TextAlign.End
        )
    }
}

@Composable
fun ClubInfoRow(title: String, value: String?, clubLogo: String?) {
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
            style = regularTextStyle(contentDefault, 14.sp),
            modifier = Modifier.weight(1f)
        )

        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = value ?: "--",
                style = boldTextStyle(
                    if (value.equals("Without club", true)) redErrorColor else contentDefault,
                    14.sp
                ),
                textAlign = TextAlign.End
            )

            Spacer(Modifier.width(8.dp))

            AsyncImage(
                model = clubLogo,
                contentDescription = null,
                modifier = Modifier.size(25.dp)
            )
        }
    }
}

@Composable
fun NationalityInfoRow(title: String, value: String?, nationalityFlag: String?) {
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
            tint = contentDefault
        )

        Spacer(Modifier.width(4.dp))

        Text(
            text = title,
            style = regularTextStyle(contentDefault, 14.sp),
            modifier = Modifier.weight(1f)
        )

        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = value ?: "--",
                style = boldTextStyle(contentDefault, 14.sp),
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
    onEditPhoneClicked: () -> Unit,
    onClearClicked: () -> Unit
) {
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
            tint = contentDefault
        )

        Spacer(Modifier.width(4.dp))

        Text(
            text = title,
            style = regularTextStyle(contentDefault, 14.sp),
            modifier = Modifier.weight(1f)
        )

        if (phoneNumber.isNullOrEmpty()) {
            Text(
                text = "--",
                style = boldTextStyle(contentDefault, 14.sp),
                textAlign = TextAlign.End
            )
        } else {
            WhatsAppIcon(phoneNumber)
        }

        Spacer(Modifier.width(24.dp))

        Icon(
            imageVector = Icons.Default.Edit,
            contentDescription = null,
            modifier = Modifier.clickWithNoRipple { onEditPhoneClicked() }
        )

        if (phoneNumber?.isNotEmpty() == true) {
            Spacer(Modifier.width(24.dp))
            Icon(
                imageVector = Icons.Default.Clear,
                contentDescription = null,
                modifier = Modifier.clickWithNoRipple { onClearClicked() }
            )
        }

    }
}

@Composable
fun TransfermarketRow(context: Context, title: String, tmLink: String?) {
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
            style = regularTextStyle(contentDefault, 14.sp),
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
                }
        )

    }
}

@Composable
fun UpdatePlayerUi(modifier: Modifier, message: String) {

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .zIndex(5f)
    ) {


        Column(
            modifier = Modifier.align(Alignment.Center)
        ) {

            CircularProgressIndicator(
                modifier = Modifier
                    .size(48.dp)
                    .align(Alignment.CenterHorizontally),
                color = Color.White,
                strokeWidth = 4.dp
            )

            Spacer(Modifier.height(24.dp))

            Text(
                text = message,
                style = regularTextStyle(Color.White, 18.sp),
                textAlign = TextAlign.Center
            )

        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerInfoTopBar(
    showDeletePlayerIcon: Boolean,
    onShareClicked: () -> Unit,
    onDeletePlayerClicked: () -> Unit,
    onBackClicked: () -> Unit = {}
) {
    Surface(shadowElevation = 12.dp, color = Color.White) {
        TopAppBar(
            title = {

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp)
                ) {

                    Text(
                        text = "Player details",
                        style = boldTextStyle(contentDefault, 21.sp),
                        modifier = Modifier.weight(1f)
                    )

                    if (showDeletePlayerIcon) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = null,
                            modifier = Modifier
                                .padding(end = 16.dp)
                                .clickWithNoRipple { onDeletePlayerClicked() }
                        )
                    }

                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = null,
                        modifier = Modifier.clickWithNoRipple { onShareClicked() }
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            navigationIcon = {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                    modifier = Modifier
                        .padding(12.dp)
                        .clickWithNoRipple { onBackClicked() }
                )
            }
        )
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
            colors = CardDefaults.cardColors(containerColor = Color.White),
        ) {

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {

                Text(
                    text = "Are you sure you want to delete this player?",
                    style = boldTextStyle(contentDefault, 16.sp),
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
                                Color.White,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .border(1.dp, contentDefault, RoundedCornerShape(100.dp))
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple {},
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Cancel",
                            style = boldTextStyle(contentDefault, 12.sp),
                            modifier = Modifier.clickWithNoRipple {
                                onDismissRequest()
                            }
                        )
                    }

                    Spacer(Modifier.width(8.dp))

                    Box(
                        modifier = Modifier
                            .background(
                                contentDefault,
                                shape = RoundedCornerShape(100.dp)
                            )
                            .size(width = 80.dp, height = 30.dp)
                            .clickWithNoRipple {},
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Delete",
                            style = boldTextStyle(Color.White, 12.sp),
                            modifier = Modifier.clickWithNoRipple { onDeletePlayerClicked() }
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
    context.startActivity(Intent.createChooser(i, "Share with"))
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

private fun getContractStatus(expiryDate: String): String {
    val sdf = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
    sdf.isLenient = false

    return try {
        val contractDate: Date = sdf.parse(expiryDate)!!
        val today = Calendar.getInstance().time

        if (contractDate.before(today)) {
            "Contract Expired"
        } else {
            expiryDate
        }
    } catch (e: Exception) {
        "--"
    }
}
