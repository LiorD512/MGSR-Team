package com.liordahan.mgsrteam.features.add

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.ManagedActivityResultLauncher
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddIcCall
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.transfermarket.PlayerSearchModel
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.components.PrimaryButtonNewDesign
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddPlayerScreen(
    viewModel: IAddPlayerViewModel = koinViewModel(),
    navController: NavController
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current

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

    LaunchedEffect(Unit) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.playerSearchStateFlow.collect {
                    playerOptionsList = it.playerSearchResults
                    showSearchProgress = it.showSearchProgress
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
                    if (it) {
                        showAddContactBottomSheet = false
                        navController.popBackStack()
                    }
                }
            }
        }
    }


    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            AddPlayerTopBar(
                searchPlayerInput = searchText,
                onValueChange = {
                    searchText = it
                    if (searchText.text.length >= 2) {
                        viewModel.getSearchResults(searchText.text)
                    }
                },
                onBackClicked = {
                    navController.popBackStack()
                }
            )
        }
    ) { paddingValues ->

        if (showSearchProgress) {
            Box(modifier = Modifier.fillMaxSize()) {
                ProgressIndicator(
                    modifier = Modifier.align(Alignment.Center)
                )
            }

            return@Scaffold
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {

            if (playerOptionsList.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(vertical = 24.dp, horizontal = 16.dp)
                ) {
                    items(playerOptionsList) { playerSearchModel ->
                        SearchListItem(
                            playerSearchModel = playerSearchModel,
                            onCardClicked = { viewModel.onPlayerSelected(it) }
                        )
                    }

                }
            }

            if (showAddContactBottomSheet) {
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

@Composable
fun SearchListItem(
    playerSearchModel: PlayerSearchModel,
    onCardClicked: (PlayerSearchModel) -> Unit = {}
) {

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple {
                onCardClicked(playerSearchModel)
            },
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = playerSearchModel.playerImage,
                contentDescription = null,
                modifier = Modifier.size(60.dp),
                contentScale = ContentScale.Crop
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    playerSearchModel.playerName ?: "Unknown",
                    style = boldTextStyle(contentDefault, 16.sp)
                )
                Text(
                    text = buildAnnotatedString {
                        append("Position: ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(playerSearchModel.playerPosition)
                        }
                    },
                    style = regularTextStyle(
                        contentDefault, 12.sp
                    )
                )
                Text(
                    text = buildAnnotatedString {
                        append("Age: ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(playerSearchModel.playerAge ?: "-")
                        }
                    },
                    style = regularTextStyle(
                        contentDefault, 12.sp
                    )
                )
                Text(
                    text = buildAnnotatedString {
                        append("Market value: ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                            append(playerSearchModel.playerValue ?: "--")
                        }
                    },
                    style = regularTextStyle(
                        contentDefault, 12.sp
                    )
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

    ModalBottomSheet(
        modifier = modifier,
        onDismissRequest = { onDismissRequest() },
        sheetState = sheetState,
        containerColor = Color.White,
        shape = RoundedCornerShape(16.dp),
        tonalElevation = 8.dp
    ) {

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp)
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Add Player Contact",
                style = boldTextStyle(contentDefault, 21.sp),
            )

            HorizontalDivider(
                thickness = 1.dp,
                color = dividerColor,
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
                onButtonClicked = {
                    viewModel.onSavePlayerClicked()
                }
            )
        }
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
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = boldTextStyle(contentDefault, 16.sp),
                )
                Text(
                    text = value.takeIf { !it.isNullOrEmpty() } ?: "Tap to select",
                    style = regularTextStyle(contentDefault, 14.sp),
                    color = if (value == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
                )
            }

            Icon(
                imageVector = Icons.Default.AddIcCall,
                contentDescription = null,
                tint = contentDefault
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddPlayerTopBar(
    searchPlayerInput: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    onBackClicked: () -> Unit
) {

    Surface(shadowElevation = 12.dp, color = Color.White) {

        Column(modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 24.dp)) {

            TopAppBar(
                title = {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(end = 12.dp),
                        verticalArrangement = Arrangement.Center
                    ) {

                        Row(verticalAlignment = Alignment.CenterVertically) {

                            Text(
                                text = "Add Player",
                                style = boldTextStyle(contentDefault, 21.sp),
                                modifier = Modifier.weight(1f)
                            )

                        }

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

            HorizontalDivider(
                color = dividerColor,
                thickness = 1.dp,
                modifier = Modifier.padding(vertical = 16.dp)
            )

            AppTextField(
                modifier = Modifier.padding(horizontal = 16.dp),
                textInput = searchPlayerInput,
                hint = stringResource(R.string.add_player_screen_hint),
                leadingIcon = Icons.Default.Search,
                keyboardOptions = KeyboardOptions(
                    imeAction = ImeAction.Done,
                    keyboardType = KeyboardType.Text
                ),
                onValueChange = { onValueChange(it) }
            )
        }
    }
}