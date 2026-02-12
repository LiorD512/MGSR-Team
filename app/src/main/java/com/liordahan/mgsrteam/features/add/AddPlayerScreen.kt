package com.liordahan.mgsrteam.features.add

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.ManagedActivityResultLauncher
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddIcCall
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.shortlist.ShortlistRepository
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.PrimaryButtonNewDesign
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddPlayerScreen(
    navController: NavController,
    initialTmProfileUrl: String = "",
    forShortlist: Boolean = false,
    viewModel: IAddPlayerViewModel = koinViewModel()
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current
    val keyboardController = LocalSoftwareKeyboardController.current

    val snackBarHostState = remember { SnackbarHostState() }

    var showAddContactBottomSheet by remember {
        mutableStateOf(false)
    }

    var searchText by remember { mutableStateOf(TextFieldValue()) }

    var playerOptionsList by rememberSaveable {
        mutableStateOf(listOf<PlayerSearchModel>())
    }

    var showSearchProgress by remember {
        mutableStateOf(false)
    }

    var showSelectedPlayerProgress by remember {
        mutableStateOf(false)
    }

    var errorMessage by remember {
        mutableStateOf<String?>("")
    }

    LaunchedEffect(initialTmProfileUrl) {
        if (initialTmProfileUrl.isNotBlank()) {
            viewModel.loadPlayerByTmProfileUrl(Uri.decode(initialTmProfileUrl))
        }
    }

    LaunchedEffect(Unit) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.playerSearchStateFlow.collect {
                    playerOptionsList = it.playerSearchResults
                    showSearchProgress = it.showSearchProgress
                    showSelectedPlayerProgress = it.showPlayerSelectedSearchProgress
                }
            }

            launch {
                viewModel.selectedPlayerFlow.collect {
                    if (it != null) {
                        showAddContactBottomSheet = true
                    }
                }
            }

            launch {
                viewModel.isPlayerAddedFlow.collect {
                    if (it && !forShortlist) {
                        showAddContactBottomSheet = false
                        navController.popBackStack()
                    }
                }
            }

            launch {
                viewModel.errorMessageFlow.collect { message ->
                    if (!message.isNullOrEmpty()) {
                        errorMessage = message
                        showSnakeBarMessage(
                            scope = this,
                            snackBarHostState = snackBarHostState,
                            message = message
                        )
                    }
                }
            }
        }
    }


    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground,
        snackbarHost = {
            SnackbarHost(
                hostState = snackBarHostState,
                snackbar = {
                    SnakeBarMessage(
                        message = it.visuals.message
                    )
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            AddPlayerHeader(
                searchPlayerInput = searchText,
                onValueChange = {
                    searchText = it
                    viewModel.updateSearchQuery(searchText.text)
                },
                onBackClicked = { navController.popBackStack() },
                forShortlist = forShortlist
            )

            if (showSearchProgress) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = HomeTealAccent,
                        strokeWidth = 3.dp,
                        modifier = Modifier.size(44.dp)
                    )
                }
                return@Scaffold
            }

            Box(modifier = Modifier.fillMaxSize()) {
                if (playerOptionsList.isNotEmpty()) {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(
                            top = 4.dp,
                            bottom = 24.dp,
                            start = 16.dp,
                            end = 16.dp
                        )
                    ) {
                        items(playerOptionsList) { playerSearchModel ->
                            SearchListItem(
                                playerSearchModel = playerSearchModel,
                                onCardClicked = {
                                    keyboardController?.hide()
                                    viewModel.onPlayerSelected(it)
                                }
                            )
                        }
                    }
                } else if (searchText.text.isBlank()) {
                    AddPlayerEmptyState(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 24.dp)
                    )
                }

                if (showSelectedPlayerProgress) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(HomeDarkBackground.copy(alpha = 0.7f)),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = HomeTealAccent,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(44.dp)
                        )
                    }
                }

                if (showAddContactBottomSheet) {
                    if (forShortlist) {
                        AddToShortlistBottomSheetContent(
                            modifier = Modifier,
                            context = context,
                            onDismissRequest = { showAddContactBottomSheet = false },
                            viewModel = viewModel,
                            onAdded = { navController.popBackStack() }
                        )
                    } else {
                        SavePlayerBottomSheetContent(
                            modifier = Modifier,
                            context = context,
                            onDismissRequest = { showAddContactBottomSheet = false },
                            viewModel = viewModel
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun SearchListItem(
    playerSearchModel: PlayerSearchModel,
    onCardClicked: (PlayerSearchModel) -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { onCardClicked(playerSearchModel) },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = HomeTealAccent,
                        topLeft = Offset.Zero,
                        size = androidx.compose.ui.geometry.Size(
                            width = 3.dp.toPx(),
                            height = size.height
                        )
                    )
                }
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AsyncImage(
                    model = playerSearchModel.playerImage,
                    contentDescription = null,
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .border(2.dp, HomeDarkCardBorder, CircleShape),
                    contentScale = ContentScale.Crop
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        playerSearchModel.playerName ?: "Unknown",
                        style = boldTextStyle(HomeTextPrimary, 14.sp)
                    )
                    val clubName = playerSearchModel.currentClub?.takeIf { it.isNotBlank() }
                    val metaParts = buildList {
                        clubName?.let { add(it) }
                        add(playerSearchModel.playerPosition)
                        add(playerSearchModel.playerAge ?: "-")
                        add(playerSearchModel.playerValue ?: "--")
                    }
                    Text(
                        text = metaParts.joinToString(" • "),
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                AsyncImage(
                    model = playerSearchModel.currentClubLogo,
                    contentDescription = null,
                    modifier = Modifier.size(36.dp)
                )
            }
        }
    }
}

/** Reusable form content for adding player contact (used in Add Player screen and in Releases "Add to agency" bottom sheet). */
@Composable
fun AddPlayerContactFormContent(
    context: Context,
    viewModel: IAddPlayerViewModel
) {
    val selectedPlayer by viewModel.selectedPlayerFlow.collectAsStateWithLifecycle(initialValue = null)
    var playerNumber by remember { mutableStateOf("") }
    var agentNumber by remember { mutableStateOf("") }

    val playerNumberLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickContact()
    ) { contactUri ->
        contactUri?.let {
            val phone = getPhoneNumberFromContactUri(context, it)
            if (phone != null) {
                playerNumber = phone
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
                agentNumber = phone
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

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp)
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Add Player Contact",
            style = boldTextStyle(HomeTextPrimary, 20.sp)
        )
        val subtitle = buildString {
            selectedPlayer?.fullName?.let { append(it) }
            selectedPlayer?.positions?.firstOrNull()?.let { append(" • $it") }
            selectedPlayer?.currentClub?.clubName?.let { append(" • $it") }
        }
        if (subtitle.isNotEmpty()) {
            Text(
                text = subtitle,
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        HorizontalDivider(
            thickness = 1.dp,
            color = HomeDarkCardBorder,
            modifier = Modifier.padding(vertical = 16.dp)
        )

        ContactPickerRow(
            label = "Player Number",
            value = playerNumber,
            onClick = {
                launchPlayerContactPicker(
                    context,
                    playerNumberLauncher,
                    playerNumberPermissionLauncher
                )
            }
        )

        Spacer(modifier = Modifier.height(12.dp))

        ContactPickerRow(
            label = "Agent Number",
            value = agentNumber,
            onClick = {
                launchPlayerContactPicker(
                    context,
                    agentNumberLauncher,
                    agentNumberPermissionLauncher
                )
            }
        )

        Spacer(modifier = Modifier.height(24.dp))

        PrimaryButtonNewDesign(
            buttonText = "Save Player",
            isEnabled = true,
            showProgress = false,
            onButtonClicked = { viewModel.onSavePlayerClicked() },
            containerColor = HomeTealAccent
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToShortlistBottomSheetContent(
    modifier: Modifier,
    context: Context,
    onDismissRequest: () -> Unit,
    viewModel: IAddPlayerViewModel,
    onAdded: () -> Unit,
    shortlistRepository: ShortlistRepository = koinInject()
) {
    val selectedPlayer by viewModel.selectedPlayerFlow.collectAsStateWithLifecycle(initialValue = null)
    val scope = rememberCoroutineScope()
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        modifier = modifier,
        onDismissRequest = onDismissRequest,
        sheetState = sheetState,
        containerColor = HomeDarkCard,
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
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Add to shortlist",
                style = boldTextStyle(HomeTextPrimary, 20.sp)
            )
            selectedPlayer?.let { player ->
                val subtitle = buildString {
                    player.fullName?.let { append(it) }
                    player.positions?.firstOrNull()?.let { append(" • $it") }
                    player.currentClub?.clubName?.let { append(" • $it") }
                }
                if (subtitle.isNotEmpty()) {
                    Text(
                        text = subtitle,
                        style = regularTextStyle(HomeTextSecondary, 13.sp),
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
            errorMessage?.let { msg ->
                Text(
                    text = msg,
                    style = regularTextStyle(HomeRedAccent, 13.sp),
                    modifier = Modifier.padding(bottom = 8.dp),
                    textAlign = TextAlign.Center
                )
            }
            HorizontalDivider(
                thickness = 1.dp,
                color = HomeDarkCardBorder,
                modifier = Modifier.padding(vertical = 16.dp)
            )
            PrimaryButtonNewDesign(
                buttonText = "Add to shortlist",
                isEnabled = selectedPlayer != null,
                showProgress = false,
                onButtonClicked = {
                    selectedPlayer?.let { player ->
                        errorMessage = null
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
                        scope.launch {
                            val added = shortlistRepository.addToShortlist(release)
                            if (added) {
                                viewModel.resetAfterAdd()
                                onAdded()
                            } else {
                                errorMessage = "Player is already in your shortlist"
                            }
                        }
                    }
                },
                containerColor = HomeTealAccent
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavePlayerBottomSheetContent(
    modifier: Modifier,
    context: Context,
    onDismissRequest: () -> Unit,
    viewModel: IAddPlayerViewModel
) {

    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true
    )

    ModalBottomSheet(
        modifier = modifier,
        onDismissRequest = { onDismissRequest() },
        sheetState = sheetState,
        containerColor = HomeDarkCard,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        tonalElevation = 8.dp,
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        AddPlayerContactFormContent(context = context, viewModel = viewModel)
    }
}


@Composable
fun ContactPickerRow(
    label: String,
    value: String?,
    onClick: () -> Unit
) {
    OutlinedCard(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = HomeDarkBackground)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.AddIcCall,
                contentDescription = null,
                tint = HomeTealAccent,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = boldTextStyle(HomeTextPrimary, 14.sp)
                )
                Text(
                    text = value.takeIf { !it.isNullOrEmpty() } ?: "Tap to select",
                    style = regularTextStyle(
                        if (value.isNullOrEmpty()) HomeTextSecondary else HomeTextPrimary,
                        14.sp
                    )
                )
            }
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}


fun getPhoneNumberFromContactUri(context: Context, contactUri: Uri): String? {
    val projection = arrayOf(
        ContactsContract.CommonDataKinds.Phone.NUMBER
    )

    context.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        projection,
        "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
        arrayOf(getContactId(context, contactUri)),
        null
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            return cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER))
        }
    }

    return null
}

fun getContactId(context: Context, contactUri: Uri): String {
    context.contentResolver.query(
        contactUri,
        arrayOf(ContactsContract.Contacts._ID),
        null,
        null,
        null
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            return cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.Contacts._ID))
        }
    }
    throw IllegalArgumentException("Invalid contact Uri")
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

@Composable
fun AddPlayerHeader(
    searchPlayerInput: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    onBackClicked: () -> Unit,
    forShortlist: Boolean = false
) {
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
                    text = "Add Player",
                    style = boldTextStyle(HomeTextPrimary, 26.sp)
                )
                Text(
                    text = if (forShortlist) "Search Transfermarkt to add to shortlist" else "Search Transfermarkt to add to roster",
                    style = regularTextStyle(HomeTextSecondary, 12.sp),
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        AppTextField(
            modifier = Modifier.fillMaxWidth(),
            textInput = searchPlayerInput,
            hint = stringResource(R.string.add_player_screen_hint),
            leadingIcon = Icons.Default.Search,
            keyboardOptions = KeyboardOptions(
                imeAction = ImeAction.Done,
                keyboardType = KeyboardType.Text
            ),
            onValueChange = { onValueChange(it) },
            darkTheme = true
        )
    }
}

@Composable
private fun AddPlayerEmptyState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Search,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = HomeTextSecondary.copy(alpha = 0.4f)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Search for a player to add",
            style = boldTextStyle(HomeTextPrimary, 16.sp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Type a name to find players on Transfermarkt",
            style = regularTextStyle(HomeTextSecondary, 13.sp)
        )
    }
}

@Composable
fun SnakeBarMessage(
    message: String
) {
    Snackbar(
        modifier = Modifier.padding(16.dp),
        containerColor = HomeDarkCard,
        contentColor = HomeTextPrimary
    ) {
        Text(
            text = message,
            style = regularTextStyle(HomeTextPrimary, 14.sp),
            textAlign = TextAlign.Start
        )
    }
}

fun showSnakeBarMessage(
    scope: CoroutineScope,
    snackBarHostState: SnackbarHostState,
    message: String
) {
    scope.launch {
        snackBarHostState.showSnackbar(
            message = message,
            duration = SnackbarDuration.Short,
        )
    }
}