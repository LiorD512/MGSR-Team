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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.platform.LocalFocusManager
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
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.components.SkeletonPlayerCardList
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.transfermarket.SoccerDonnaSearchResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AddPlayerScreen(
    navController: NavController,
    initialTmProfileUrl: String = "",
    forShortlist: Boolean = false,
    viewModel: IAddPlayerViewModel = koinViewModel(),
    platformManager: PlatformManager = koinInject()
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val context = LocalContext.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val currentPlatform by platformManager.current.collectAsStateWithLifecycle()

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

    var womenSearchResults by remember {
        mutableStateOf(listOf<SoccerDonnaSearchResult>())
    }

    var youthSearchResults by remember {
        mutableStateOf(listOf<YouthIFASearchResult>())
    }

    var soccerDonnaUrlInput by remember { mutableStateOf("") }

    var manualNameInput by remember { mutableStateOf("") }

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
                    womenSearchResults = it.womenSearchResults
                    youthSearchResults = it.youthSearchResults
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
                    if (it && (!forShortlist || currentPlatform == Platform.WOMEN || currentPlatform == Platform.YOUTH)) {
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
        containerColor = PlatformColors.palette.background,
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
                    if (currentPlatform == Platform.MEN || currentPlatform == Platform.WOMEN || currentPlatform == Platform.YOUTH) {
                        viewModel.updateSearchQuery(searchText.text)
                    }
                },
                onBackClicked = { navController.popBackStack() },
                forShortlist = forShortlist,
                platform = currentPlatform
            )

            if (showSearchProgress && (currentPlatform == Platform.MEN || currentPlatform == Platform.WOMEN || currentPlatform == Platform.YOUTH)) {
                SkeletonPlayerCardList(
                    modifier = Modifier.fillMaxSize(),
                    itemCount = 4
                )
                return@Scaffold
            }

            Box(modifier = Modifier.fillMaxSize()) {
                if (currentPlatform == Platform.WOMEN) {
                    // Women — Single-page form (matches web AddWomanPlayerForm)
                    val womanForm by viewModel.womanFormState.collectAsStateWithLifecycle()

                    // Contact picker launchers for player phone
                    val womenPlayerPhoneLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.PickContact()
                    ) { uri ->
                        uri?.let {
                            getPhoneNumberFromContactUri(context, it)?.let { phone ->
                                viewModel.updateWomanForm { f -> f.copy(playerPhone = phone) }
                            }
                        }
                    }
                    val womenPlayerPhonePermLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.RequestPermission()
                    ) { granted ->
                        if (granted) womenPlayerPhoneLauncher.launch(null)
                    }

                    // Contact picker launchers for agent phone
                    val womenAgentPhoneLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.PickContact()
                    ) { uri ->
                        uri?.let {
                            getPhoneNumberFromContactUri(context, it)?.let { phone ->
                                viewModel.updateWomanForm { f -> f.copy(agentPhone = phone) }
                            }
                        }
                    }
                    val womenAgentPhonePermLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.RequestPermission()
                    ) { granted ->
                        if (granted) womenAgentPhoneLauncher.launch(null)
                    }

                    Box(modifier = Modifier.fillMaxSize()) {
                        // Base layer: always-visible scrollable form
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(
                                start = 16.dp,
                                end = 16.dp,
                                top = 8.dp,
                                bottom = 32.dp
                            ),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // "Or add manually" link
                            item {
                                Text(
                                    text = stringResource(R.string.women_or_add_manually),
                                    style = regularTextStyle(currentPlatform.accent, 13.sp),
                                    modifier = Modifier
                                        .clickWithNoRipple {
                                            viewModel.clearWomanForm()
                                            searchText = TextFieldValue("")
                                        }
                                        .padding(vertical = 4.dp)
                                )
                            }

                            // SoccerDonna URL paste section
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        stringResource(R.string.women_paste_url),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(soccerDonnaUrlInput),
                                        hint = "https://www.soccerdonna.de/...",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Done,
                                            keyboardType = KeyboardType.Uri
                                        ),
                                        onValueChange = { soccerDonnaUrlInput = it.text },
                                        darkTheme = true
                                    )
                                    PrimaryButtonNewDesign(
                                        buttonText = stringResource(R.string.women_load_url),
                                        isEnabled = soccerDonnaUrlInput.contains("soccerdonna"),
                                        showProgress = showSelectedPlayerProgress,
                                        containerColor = currentPlatform.accent,
                                        onButtonClicked = {
                                            focusManager.clearFocus()
                                            keyboardController?.hide()
                                            viewModel.loadWomanPlayerByUrl(soccerDonnaUrlInput)
                                        }
                                    )
                                }
                            }

                            // Divider
                            item {
                                HorizontalDivider(
                                    thickness = 1.dp,
                                    color = PlatformColors.palette.cardBorder,
                                    modifier = Modifier.padding(vertical = 4.dp)
                                )
                            }

                            // Full Name *
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        stringResource(R.string.women_full_name),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(womanForm.fullName),
                                        hint = "e.g. Lauren James",
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                        onValueChange = { tf ->
                                            viewModel.updateWomanForm { it.copy(fullName = tf.text) }
                                        },
                                        darkTheme = true
                                    )
                                }
                            }

                            // Positions chips
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        stringResource(R.string.women_positions),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    FlowRow(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        WomanPlayerFormState.WOMEN_POSITIONS.forEach { pos ->
                                            val isSelected = pos in womanForm.positions
                                            Text(
                                                text = pos,
                                                style = boldTextStyle(
                                                    if (isSelected) PlatformColors.palette.background else PlatformColors.palette.textSecondary,
                                                    11.sp
                                                ),
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(20.dp))
                                                    .background(
                                                        if (isSelected) currentPlatform.accent
                                                        else Color.Transparent
                                                    )
                                                    .border(
                                                        1.dp,
                                                        if (isSelected) currentPlatform.accent
                                                        else PlatformColors.palette.cardBorder,
                                                        RoundedCornerShape(20.dp)
                                                    )
                                                    .clickWithNoRipple {
                                                        viewModel.toggleWomanPosition(pos)
                                                    }
                                                    .padding(
                                                        horizontal = 14.dp,
                                                        vertical = 6.dp
                                                    )
                                            )
                                        }
                                    }
                                }
                            }

                            // Club + Age row
                            item {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            stringResource(R.string.women_club),
                                            style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                        )
                                        AppTextField(
                                            textInput = TextFieldValue(womanForm.currentClub),
                                            hint = "Club name",
                                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                            onValueChange = { tf ->
                                                viewModel.updateWomanForm {
                                                    it.copy(currentClub = tf.text)
                                                }
                                            },
                                            darkTheme = true
                                        )
                                    }
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            stringResource(R.string.women_age),
                                            style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                        )
                                        AppTextField(
                                            textInput = TextFieldValue(womanForm.age),
                                            hint = "e.g. 25",
                                            keyboardOptions = KeyboardOptions(
                                                imeAction = ImeAction.Next,
                                                keyboardType = KeyboardType.Number
                                            ),
                                            onValueChange = { tf ->
                                                viewModel.updateWomanForm {
                                                    it.copy(age = tf.text)
                                                }
                                            },
                                            darkTheme = true
                                        )
                                    }
                                }
                            }

                            // Nationality + Market Value row
                            item {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            stringResource(R.string.women_nationality),
                                            style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                        )
                                        AppTextField(
                                            textInput = TextFieldValue(womanForm.nationality),
                                            hint = "e.g. England",
                                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                            onValueChange = { tf ->
                                                viewModel.updateWomanForm {
                                                    it.copy(nationality = tf.text)
                                                }
                                            },
                                            darkTheme = true
                                        )
                                    }
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(
                                            stringResource(R.string.women_market_value),
                                            style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                        )
                                        AppTextField(
                                            textInput = TextFieldValue(womanForm.marketValue),
                                            hint = "e.g. €500k",
                                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                            onValueChange = { tf ->
                                                viewModel.updateWomanForm {
                                                    it.copy(marketValue = tf.text)
                                                }
                                            },
                                            darkTheme = true
                                        )
                                    }
                                }
                            }

                            // SoccerDonna URL (editable, auto-filled from search)
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        stringResource(R.string.women_soccerdonna_url),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(womanForm.soccerDonnaUrl),
                                        hint = "Auto-filled from search",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Next,
                                            keyboardType = KeyboardType.Uri
                                        ),
                                        onValueChange = { tf ->
                                            viewModel.updateWomanForm {
                                                it.copy(soccerDonnaUrl = tf.text)
                                            }
                                        },
                                        darkTheme = true
                                    )
                                }
                            }

                            // Profile Image URL
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        stringResource(R.string.women_profile_image_url),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(womanForm.profileImage),
                                        hint = "Image URL",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Next,
                                            keyboardType = KeyboardType.Uri
                                        ),
                                        onValueChange = { tf ->
                                            viewModel.updateWomanForm {
                                                it.copy(profileImage = tf.text)
                                            }
                                        },
                                        darkTheme = true
                                    )
                                }
                            }

                            // Player Phone + Agent Phone (roster only)
                            if (!forShortlist) {
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    // Player Phone with import button
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                stringResource(R.string.women_player_phone),
                                                style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                            )
                                            Text(
                                                text = "📇 " + stringResource(R.string.youth_import_contact),
                                                style = boldTextStyle(currentPlatform.accent, 11.sp),
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(12.dp))
                                                    .clickWithNoRipple {
                                                        launchPlayerContactPicker(
                                                            context,
                                                            womenPlayerPhoneLauncher,
                                                            womenPlayerPhonePermLauncher
                                                        )
                                                    }
                                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                        AppTextField(
                                            modifier = Modifier.fillMaxWidth(),
                                            textInput = TextFieldValue(womanForm.playerPhone),
                                            hint = "Phone number",
                                            keyboardOptions = KeyboardOptions(
                                                imeAction = ImeAction.Next,
                                                keyboardType = KeyboardType.Phone
                                            ),
                                            onValueChange = { tf ->
                                                viewModel.updateWomanForm {
                                                    it.copy(playerPhone = tf.text)
                                                }
                                            },
                                            darkTheme = true
                                        )
                                    }

                                    // Agent Phone with import button
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                stringResource(R.string.women_agent_phone),
                                                style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                            )
                                            Text(
                                                text = "📇 " + stringResource(R.string.youth_import_contact),
                                                style = boldTextStyle(currentPlatform.accent, 11.sp),
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(12.dp))
                                                    .clickWithNoRipple {
                                                        launchPlayerContactPicker(
                                                            context,
                                                            womenAgentPhoneLauncher,
                                                            womenAgentPhonePermLauncher
                                                        )
                                                    }
                                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                        AppTextField(
                                            modifier = Modifier.fillMaxWidth(),
                                            textInput = TextFieldValue(womanForm.agentPhone),
                                            hint = "Phone number",
                                            keyboardOptions = KeyboardOptions(
                                                imeAction = ImeAction.Next,
                                                keyboardType = KeyboardType.Phone
                                            ),
                                            onValueChange = { tf ->
                                                viewModel.updateWomanForm {
                                                    it.copy(agentPhone = tf.text)
                                                }
                                            },
                                            darkTheme = true
                                        )
                                    }
                                }
                            }

                            // Notes
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        stringResource(R.string.women_notes),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(womanForm.notes),
                                        hint = "Additional notes...",
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                        onValueChange = { tf ->
                                            viewModel.updateWomanForm {
                                                it.copy(notes = tf.text)
                                            }
                                        },
                                        darkTheme = true
                                    )
                                }
                            }
                            } // end if (!forShortlist)

                            // Save / Add to shortlist button
                            item {
                                Spacer(modifier = Modifier.height(8.dp))
                                PrimaryButtonNewDesign(
                                    buttonText = if (forShortlist) stringResource(R.string.add_player_to_shortlist) else stringResource(R.string.women_save_player),
                                    isEnabled = womanForm.fullName.isNotBlank() && !womanForm.isSaving,
                                    showProgress = womanForm.isSaving,
                                    containerColor = currentPlatform.accent,
                                    onButtonClicked = {
                                        focusManager.clearFocus()
                                        keyboardController?.hide()
                                        if (forShortlist) viewModel.saveWomanToShortlist() else viewModel.saveWomanPlayer()
                                    }
                                )
                            }
                        }

                        // Overlay: search results dropdown
                        if (womenSearchResults.isNotEmpty()) {
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp)
                                    .heightIn(max = 320.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
                                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                            ) {
                                LazyColumn {
                                    items(
                                        womenSearchResults,
                                        key = { it.soccerDonnaUrl ?: it.hashCode() }
                                    ) { result ->
                                        WomenSearchListItem(
                                            result = result,
                                            accentColor = currentPlatform.accent,
                                            onCardClicked = {
                                                focusManager.clearFocus()
                                                keyboardController?.hide()
                                                viewModel.onWomanPlayerSelected(it)
                                                searchText = TextFieldValue("")
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else if (currentPlatform == Platform.YOUTH) {
                    // Youth — Single-page form (matches web AddYouthPlayerForm)
                    val youthForm by viewModel.youthFormState.collectAsStateWithLifecycle()
                    var showAgeGroupDropdown by remember { mutableStateOf(false) }
                    var showRelationshipDropdown by remember { mutableStateOf(false) }

                    // Contact picker launchers for player phone
                    var youthPlayerPhone by remember { mutableStateOf(youthForm.playerPhone) }
                    val youthPlayerPhoneLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.PickContact()
                    ) { uri ->
                        uri?.let {
                            getPhoneNumberFromContactUri(context, it)?.let { phone ->
                                youthPlayerPhone = phone
                                viewModel.updateYouthForm { f -> f.copy(playerPhone = phone) }
                            }
                        }
                    }
                    val youthPlayerPhonePermLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.RequestPermission()
                    ) { granted ->
                        if (granted) youthPlayerPhoneLauncher.launch(null)
                    }

                    // Contact picker launchers for parent phone
                    var youthParentPhone by remember { mutableStateOf(youthForm.parentPhone) }
                    val youthParentPhoneLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.PickContact()
                    ) { uri ->
                        uri?.let {
                            getPhoneNumberFromContactUri(context, it)?.let { phone ->
                                youthParentPhone = phone
                                viewModel.updateYouthForm { f -> f.copy(parentPhone = phone) }
                            }
                        }
                    }
                    val youthParentPhonePermLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.RequestPermission()
                    ) { granted ->
                        if (granted) youthParentPhoneLauncher.launch(null)
                    }

                    Box(modifier = Modifier.fillMaxSize()) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = 16.dp,
                            end = 16.dp,
                            top = 8.dp,
                            bottom = 32.dp
                        ),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Full Name (English) — optional
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    stringResource(R.string.youth_full_name),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                AppTextField(
                                    modifier = Modifier.fillMaxWidth(),
                                    textInput = TextFieldValue(youthForm.fullName),
                                    hint = "e.g. John Doe",
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                    onValueChange = { tf ->
                                        viewModel.updateYouthForm { it.copy(fullName = tf.text) }
                                    },
                                    darkTheme = true
                                )
                            }
                        }

                        // Full Name (Hebrew)
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    stringResource(R.string.youth_full_name_he),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                AppTextField(
                                    modifier = Modifier.fillMaxWidth(),
                                    textInput = TextFieldValue(youthForm.fullNameHe),
                                    hint = "שם מלא בעברית",
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                    onValueChange = { tf ->
                                        viewModel.updateYouthForm { it.copy(fullNameHe = tf.text) }
                                    },
                                    darkTheme = true
                                )
                            }
                        }

                        // Positions chips
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    stringResource(R.string.youth_positions),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                FlowRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    YouthPlayerFormState.YOUTH_POSITIONS.forEach { pos ->
                                        val isSelected = pos in youthForm.positions
                                        Text(
                                            text = pos,
                                            style = boldTextStyle(
                                                if (isSelected) PlatformColors.palette.background else PlatformColors.palette.textSecondary,
                                                11.sp
                                            ),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(20.dp))
                                                .background(
                                                    if (isSelected) currentPlatform.accent
                                                    else Color.Transparent
                                                )
                                                .border(
                                                    1.dp,
                                                    if (isSelected) currentPlatform.accent
                                                    else PlatformColors.palette.cardBorder,
                                                    RoundedCornerShape(20.dp)
                                                )
                                                .clickWithNoRipple {
                                                    viewModel.toggleYouthPosition(pos)
                                                }
                                                .padding(
                                                    horizontal = 14.dp,
                                                    vertical = 6.dp
                                                )
                                        )
                                    }
                                }
                            }
                        }

                        // Club (full width — academy removed)
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    stringResource(R.string.youth_club),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                AppTextField(
                                    modifier = Modifier.fillMaxWidth(),
                                    textInput = TextFieldValue(youthForm.currentClub),
                                    hint = "Club name",
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                    onValueChange = { tf ->
                                        viewModel.updateYouthForm { it.copy(currentClub = tf.text) }
                                    },
                                    darkTheme = true
                                )
                            }
                        }

                        // Date of Birth + Age Group row
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        stringResource(R.string.youth_date_of_birth),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        textInput = TextFieldValue(youthForm.dateOfBirth),
                                        hint = "DD/MM/YYYY",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Next,
                                            keyboardType = KeyboardType.Number
                                        ),
                                        onValueChange = { tf ->
                                            val computed = YouthPlayerFormState.computeAgeGroup(tf.text)
                                            viewModel.updateYouthForm {
                                                it.copy(
                                                    dateOfBirth = tf.text,
                                                    ageGroup = computed.ifBlank { it.ageGroup }
                                                )
                                            }
                                        },
                                        darkTheme = true
                                    )
                                }
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        stringResource(R.string.youth_age_group),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    Box {
                                        AppTextField(
                                            textInput = TextFieldValue(youthForm.ageGroup),
                                            hint = "Select…",
                                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                            onValueChange = { },
                                            darkTheme = true,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickWithNoRipple {
                                                    showAgeGroupDropdown = !showAgeGroupDropdown
                                                }
                                        )
                                        androidx.compose.material3.DropdownMenu(
                                            expanded = showAgeGroupDropdown,
                                            onDismissRequest = { showAgeGroupDropdown = false },
                                            containerColor = PlatformColors.palette.card
                                        ) {
                                            YouthPlayerFormState.AGE_GROUPS.forEach { group ->
                                                androidx.compose.material3.DropdownMenuItem(
                                                    text = {
                                                        Text(
                                                            group,
                                                            style = regularTextStyle(
                                                                PlatformColors.palette.textPrimary, 14.sp
                                                            )
                                                        )
                                                    },
                                                    onClick = {
                                                        viewModel.updateYouthForm { it.copy(ageGroup = group) }
                                                        showAgeGroupDropdown = false
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Nationality
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    stringResource(R.string.youth_nationality),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                AppTextField(
                                    modifier = Modifier.fillMaxWidth(),
                                    textInput = TextFieldValue(youthForm.nationality),
                                    hint = "e.g. Israel",
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                    onValueChange = { tf ->
                                        viewModel.updateYouthForm { it.copy(nationality = tf.text) }
                                    },
                                    darkTheme = true
                                )
                            }
                        }

                        // Profile Image URL (full width)
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    stringResource(R.string.youth_profile_image_url),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                AppTextField(
                                    modifier = Modifier.fillMaxWidth(),
                                    textInput = TextFieldValue(youthForm.profileImage),
                                    hint = "https://example.com/image.jpg",
                                    keyboardOptions = KeyboardOptions(
                                        imeAction = ImeAction.Next,
                                        keyboardType = KeyboardType.Uri
                                    ),
                                    onValueChange = { tf ->
                                        viewModel.updateYouthForm { it.copy(profileImage = tf.text) }
                                    },
                                    darkTheme = true
                                )
                            }
                        }

                        // IFA Profile URL (full width)
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    stringResource(R.string.youth_ifa_url),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                AppTextField(
                                    modifier = Modifier.fillMaxWidth(),
                                    textInput = TextFieldValue(youthForm.ifaUrl),
                                    hint = "https://www.football.org.il/players/player/?player_id=…",
                                    keyboardOptions = KeyboardOptions(
                                        imeAction = ImeAction.Next,
                                        keyboardType = KeyboardType.Uri
                                    ),
                                    onValueChange = { tf ->
                                        viewModel.updateYouthForm { it.copy(ifaUrl = tf.text) }
                                    },
                                    darkTheme = true
                                )
                            }
                        }

                        // Player Phone (with contact import) + Player Email row (roster only)
                        if (!forShortlist) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                // Player Phone with import button
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            stringResource(R.string.youth_player_phone),
                                            style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                        )
                                        Text(
                                            text = "📇 " + stringResource(R.string.youth_import_contact),
                                            style = boldTextStyle(currentPlatform.accent, 11.sp),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(12.dp))
                                                .clickWithNoRipple {
                                                    launchPlayerContactPicker(
                                                        context,
                                                        youthPlayerPhoneLauncher,
                                                        youthPlayerPhonePermLauncher
                                                    )
                                                }
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(youthForm.playerPhone),
                                        hint = "Phone number",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Next,
                                            keyboardType = KeyboardType.Phone
                                        ),
                                        onValueChange = { tf ->
                                            viewModel.updateYouthForm { it.copy(playerPhone = tf.text) }
                                        },
                                        darkTheme = true
                                    )
                                }

                                // Player Email
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        stringResource(R.string.youth_player_email),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(youthForm.playerEmail),
                                        hint = "Email address",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Next,
                                            keyboardType = KeyboardType.Email
                                        ),
                                        onValueChange = { tf ->
                                            viewModel.updateYouthForm { it.copy(playerEmail = tf.text) }
                                        },
                                        darkTheme = true
                                    )
                                }
                            }
                        }

                        // ── Parent / Guardian Section ──
                        item {
                            HorizontalDivider(
                                thickness = 1.dp,
                                color = PlatformColors.palette.cardBorder,
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                stringResource(R.string.youth_parent_section),
                                style = boldTextStyle(currentPlatform.accent, 14.sp)
                            )
                        }

                        // Parent Name + Relationship row
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        stringResource(R.string.youth_parent_name),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        textInput = TextFieldValue(youthForm.parentName),
                                        hint = "Parent name",
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                        onValueChange = { tf ->
                                            viewModel.updateYouthForm { it.copy(parentName = tf.text) }
                                        },
                                        darkTheme = true
                                    )
                                }
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        stringResource(R.string.youth_parent_relationship),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    Box {
                                        AppTextField(
                                            textInput = TextFieldValue(youthForm.parentRelationship),
                                            hint = "Select…",
                                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                            onValueChange = { },
                                            darkTheme = true,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickWithNoRipple {
                                                    showRelationshipDropdown = !showRelationshipDropdown
                                                }
                                        )
                                        androidx.compose.material3.DropdownMenu(
                                            expanded = showRelationshipDropdown,
                                            onDismissRequest = { showRelationshipDropdown = false },
                                            containerColor = PlatformColors.palette.card
                                        ) {
                                            YouthPlayerFormState.PARENT_RELATIONSHIPS.forEach { rel ->
                                                androidx.compose.material3.DropdownMenuItem(
                                                    text = {
                                                        Text(
                                                            rel,
                                                            style = regularTextStyle(
                                                                PlatformColors.palette.textPrimary, 14.sp
                                                            )
                                                        )
                                                    },
                                                    onClick = {
                                                        viewModel.updateYouthForm { it.copy(parentRelationship = rel) }
                                                        showRelationshipDropdown = false
                                                    }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Parent Phone (with contact import) + Parent Email
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                // Parent Phone with import button
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            stringResource(R.string.youth_parent_phone),
                                            style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                        )
                                        Text(
                                            text = "📇 " + stringResource(R.string.youth_import_contact),
                                            style = boldTextStyle(currentPlatform.accent, 11.sp),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(12.dp))
                                                .clickWithNoRipple {
                                                    launchPlayerContactPicker(
                                                        context,
                                                        youthParentPhoneLauncher,
                                                        youthParentPhonePermLauncher
                                                    )
                                                }
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(youthForm.parentPhone),
                                        hint = "Phone number",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Next,
                                            keyboardType = KeyboardType.Phone
                                        ),
                                        onValueChange = { tf ->
                                            viewModel.updateYouthForm { it.copy(parentPhone = tf.text) }
                                        },
                                        darkTheme = true
                                    )
                                }

                                // Parent Email
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        stringResource(R.string.youth_parent_email),
                                        style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                    )
                                    AppTextField(
                                        modifier = Modifier.fillMaxWidth(),
                                        textInput = TextFieldValue(youthForm.parentEmail),
                                        hint = "Email address",
                                        keyboardOptions = KeyboardOptions(
                                            imeAction = ImeAction.Next,
                                            keyboardType = KeyboardType.Email
                                        ),
                                        onValueChange = { tf ->
                                            viewModel.updateYouthForm { it.copy(parentEmail = tf.text) }
                                        },
                                        darkTheme = true
                                    )
                                }
                            }
                        }

                        // Notes
                        item {
                            HorizontalDivider(
                                thickness = 1.dp,
                                color = PlatformColors.palette.cardBorder,
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    stringResource(R.string.youth_notes),
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                AppTextField(
                                    modifier = Modifier.fillMaxWidth(),
                                    textInput = TextFieldValue(youthForm.notes),
                                    hint = "Additional notes...",
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    onValueChange = { tf ->
                                        viewModel.updateYouthForm { it.copy(notes = tf.text) }
                                    },
                                    darkTheme = true
                                )
                            }
                        }
                        } // end if (!forShortlist)

                        // Save / Add to shortlist button
                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            PrimaryButtonNewDesign(
                                buttonText = if (forShortlist) stringResource(R.string.add_player_to_shortlist) else stringResource(R.string.youth_save_player),
                                isEnabled = (youthForm.fullName.isNotBlank() || youthForm.fullNameHe.isNotBlank()) && !youthForm.isSaving,
                                showProgress = youthForm.isSaving,
                                containerColor = currentPlatform.accent,
                                onButtonClicked = {
                                    focusManager.clearFocus()
                                    keyboardController?.hide()
                                    if (forShortlist) viewModel.saveYouthToShortlist() else viewModel.saveYouthPlayer()
                                }
                            )
                        }
                    }

                    // IFA Search results overlay
                    if (youthSearchResults.isNotEmpty()) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp)
                                .heightIn(max = 320.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
                            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                        ) {
                            LazyColumn {
                                items(
                                    youthSearchResults,
                                    key = { it.ifaPlayerId ?: it.fullName.hashCode() }
                                ) { result ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickWithNoRipple {
                                                focusManager.clearFocus()
                                                keyboardController?.hide()
                                                viewModel.onYouthIFAResultSelected(result)
                                                searchText = TextFieldValue("")
                                            }
                                            .padding(
                                                horizontal = 16.dp,
                                                vertical = 12.dp
                                            ),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        // IFA icon
                                        Box(
                                            modifier = Modifier
                                                .size(36.dp)
                                                .clip(CircleShape)
                                                .background(currentPlatform.accent.copy(alpha = 0.15f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = result.fullName.take(2).uppercase(),
                                                style = boldTextStyle(currentPlatform.accent, 12.sp)
                                            )
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = result.fullName,
                                                style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                                                maxLines = 1,
                                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                            )
                                            if (!result.currentClub.isNullOrBlank()) {
                                                Text(
                                                    text = result.currentClub,
                                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                                                    maxLines = 1,
                                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                                )
                                            }
                                        }
                                        Text(
                                            text = "IFA",
                                            style = boldTextStyle(currentPlatform.accent.copy(alpha = 0.7f), 10.sp),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(currentPlatform.accent.copy(alpha = 0.1f))
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                    HorizontalDivider(
                                        color = PlatformColors.palette.cardBorder.copy(alpha = 0.5f),
                                        thickness = 0.5.dp
                                    )
                                }
                            }
                        }
                    }

                    // Loading overlay for profile fetch
                    if (showSelectedPlayerProgress) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(PlatformColors.palette.background.copy(alpha = 0.7f)),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(
                                color = currentPlatform.accent,
                                strokeWidth = 3.dp,
                                modifier = Modifier.size(44.dp)
                            )
                        }
                    }
                    } // end Box
                } else {
                    // Men — Transfermarkt search
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
                        items(playerOptionsList, key = { it.tmProfile ?: it.hashCode() }) { playerSearchModel ->
                            SearchListItem(
                                playerSearchModel = playerSearchModel,
                                onCardClicked = {
                                    focusManager.clearFocus()
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
                } // end Men else branch

                if (showSelectedPlayerProgress && currentPlatform != Platform.WOMEN) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(PlatformColors.palette.background.copy(alpha = 0.7f)),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = PlatformColors.palette.accent,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(44.dp)
                        )
                    }
                }

                if (showAddContactBottomSheet && currentPlatform != Platform.WOMEN) {
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
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = PlatformColors.palette.accent,
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
                        .border(2.dp, PlatformColors.palette.cardBorder, CircleShape),
                    contentScale = ContentScale.Crop
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        playerSearchModel.playerName ?: "Unknown",
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
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
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
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

@Composable
fun WomenSearchListItem(
    result: SoccerDonnaSearchResult,
    accentColor: androidx.compose.ui.graphics.Color,
    onCardClicked: (SoccerDonnaSearchResult) -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { onCardClicked(result) },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = accentColor,
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
                // Initial avatar (no images in search results)
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = 0.15f))
                        .border(2.dp, PlatformColors.palette.cardBorder, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = result.fullName.firstOrNull()?.uppercase() ?: "?",
                        style = boldTextStyle(accentColor, 20.sp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        result.fullName,
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                    )
                    val meta = buildList {
                        result.currentClub?.let { add(it) }
                        add("SoccerDonna")
                    }
                    Text(
                        text = meta.joinToString(" • "),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = PlatformColors.palette.textSecondary,
                    modifier = Modifier.size(20.dp)
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
            text = stringResource(R.string.add_player_contact_title),
            style = boldTextStyle(PlatformColors.palette.textPrimary, 20.sp)
        )
        val subtitle = buildString {
            selectedPlayer?.fullName?.let { append(it) }
            selectedPlayer?.positions?.firstOrNull()?.let { append(" • $it") }
            selectedPlayer?.currentClub?.clubName?.let { append(" • $it") }
        }
        if (subtitle.isNotEmpty()) {
            Text(
                text = subtitle,
                style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        HorizontalDivider(
            thickness = 1.dp,
            color = PlatformColors.palette.cardBorder,
            modifier = Modifier.padding(vertical = 16.dp)
        )

        ContactPickerRow(
            label = stringResource(R.string.add_player_label_player_number),
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
            label = stringResource(R.string.add_player_label_agent_number),
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

        val isSaving by viewModel.isSavingPlayerFlow.collectAsStateWithLifecycle()

        PrimaryButtonNewDesign(
            buttonText = stringResource(R.string.add_player_save),
            isEnabled = !isSaving,
            showProgress = isSaving,
            onButtonClicked = { viewModel.onSavePlayerClicked() },
            containerColor = PlatformColors.palette.accent
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
    var isAddingToShortlist by remember { mutableStateOf(false) }
    val alreadyInShortlistMsg = stringResource(R.string.add_player_already_in_shortlist)
    val alreadyInRosterMsg = stringResource(R.string.add_player_already_in_roster)

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        modifier = modifier,
        onDismissRequest = onDismissRequest,
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
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.add_player_to_shortlist),
                style = boldTextStyle(PlatformColors.palette.textPrimary, 20.sp)
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
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp),
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
            errorMessage?.let { msg ->
                Text(
                    text = msg,
                    style = regularTextStyle(PlatformColors.palette.red, 13.sp),
                    modifier = Modifier.padding(bottom = 8.dp),
                    textAlign = TextAlign.Center
                )
            }
            HorizontalDivider(
                thickness = 1.dp,
                color = PlatformColors.palette.cardBorder,
                modifier = Modifier.padding(vertical = 16.dp)
            )
            PrimaryButtonNewDesign(
                buttonText = stringResource(R.string.add_player_to_shortlist),
                isEnabled = selectedPlayer != null && !isAddingToShortlist,
                showProgress = isAddingToShortlist,
                onButtonClicked = {
                    if (isAddingToShortlist) return@PrimaryButtonNewDesign
                    selectedPlayer?.let { player ->
                        errorMessage = null
                        isAddingToShortlist = true
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
                            try {
                                when (shortlistRepository.addToShortlist(release)) {
                                    is ShortlistRepository.AddToShortlistResult.Added -> {
                                        viewModel.resetAfterAdd()
                                        onAdded()
                                    }
                                    is ShortlistRepository.AddToShortlistResult.AlreadyInShortlist ->
                                        errorMessage = alreadyInShortlistMsg
                                    is ShortlistRepository.AddToShortlistResult.AlreadyInRoster ->
                                        errorMessage = alreadyInRosterMsg
                                }
                            } finally {
                                isAddingToShortlist = false
                            }
                        }
                    }
                },
                containerColor = PlatformColors.palette.accent
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
        containerColor = PlatformColors.palette.card,
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
            .border(1.dp, PlatformColors.palette.cardBorder, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.background)
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
                tint = PlatformColors.palette.accent,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                )
                Text(
                    text = value.takeIf { !it.isNullOrEmpty() } ?: stringResource(R.string.add_player_tap_to_select),
                    style = regularTextStyle(
                        if (value.isNullOrEmpty()) PlatformColors.palette.textSecondary else PlatformColors.palette.textPrimary,
                        14.sp,
                        direction = if (value.isNullOrEmpty()) TextDirection.Content else TextDirection.Ltr
                    )
                )
            }
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = PlatformColors.palette.textSecondary,
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
    forShortlist: Boolean = false,
    platform: Platform = Platform.MEN
) {
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
                    text = if (platform == Platform.WOMEN) stringResource(R.string.women_add_player_title) else stringResource(R.string.add_player_title),
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 26.sp)
                )
                Text(
                    text = when {
                        forShortlist && platform == Platform.WOMEN -> stringResource(R.string.women_search_shortlist_subtitle)
                        forShortlist && platform == Platform.YOUTH -> stringResource(R.string.youth_search_shortlist_subtitle)
                        forShortlist -> stringResource(R.string.add_player_search_shortlist)
                        platform == Platform.WOMEN -> stringResource(R.string.women_search_subtitle)
                        platform == Platform.YOUTH -> stringResource(R.string.youth_search_subtitle)
                        else -> stringResource(R.string.add_player_search_roster)
                    },
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        AppTextField(
            modifier = Modifier.fillMaxWidth(),
            textInput = searchPlayerInput,
            hint = when (platform) {
                Platform.WOMEN -> stringResource(R.string.women_search_hint)
                Platform.YOUTH -> stringResource(R.string.youth_search_hint)
                else -> stringResource(R.string.add_player_screen_hint)
            },
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
            tint = PlatformColors.palette.textSecondary.copy(alpha = 0.4f)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.add_player_search_hint_title),
            style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.add_player_search_desc),
            style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
        )
    }
}

@Composable
fun SnakeBarMessage(
    message: String
) {
    Snackbar(
        modifier = Modifier.padding(16.dp),
        containerColor = PlatformColors.palette.card,
        contentColor = PlatformColors.palette.textPrimary
    ) {
        Text(
            text = message,
            style = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp),
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