package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import android.net.Uri
import android.util.Log
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.playerinfo.IPlayerInfoViewModel
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenerateMandateScreen(
    playerId: String,
    navController: NavController
) {
    val viewModel: IPlayerInfoViewModel = koinViewModel(
        viewModelStoreOwner = navController.previousBackStackEntry!!
    )
    val mandateViewModel: GenerateMandateViewModel = koinViewModel(
        viewModelStoreOwner = navController.currentBackStackEntry!!
    )
    val player by viewModel.playerInfoFlow.collectAsState(initial = null)
    val passportDetails = player?.passportDetails
    val firebaseHandler: FirebaseHandler = koinInject()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val currentStep by mandateViewModel.currentStep.collectAsState()
    val isLoadingAgents by mandateViewModel.isLoadingAgents.collectAsState()
    val agentsWithFifaLicense by mandateViewModel.agentsWithFifaLicense.collectAsState()
    val selectedAgent by mandateViewModel.selectedAgent.collectAsState()
    val expiryDate by mandateViewModel.expiryDate.collectAsState()
    val showDatePicker by mandateViewModel.showDatePicker.collectAsState()
    val showAddLeagueSheet by mandateViewModel.showAddLeagueSheet.collectAsState()
    val isGenerating by mandateViewModel.isGenerating.collectAsState()

    val validLeagues = remember(
        mandateViewModel.countryOnly.collectAsState().value,
        mandateViewModel.selectedClubs.collectAsState().value
    ) { mandateViewModel.validLeagues }

    LaunchedEffect(Unit) {
        val snapshot = firebaseHandler.firebaseStore
            .collection(firebaseHandler.accountsTable)
            .get()
            .await()
        mandateViewModel.setAgentsWithFifaLicense(
            snapshot.toObjects(Account::class.java).filter { it.fifaLicenseId?.isNotBlank() == true }
        )
    }

    val stepLabels = listOf(
        stringResource(R.string.mandate_step_agent),
        stringResource(R.string.mandate_step_validity),
        stringResource(R.string.mandate_step_review)
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.mandate_generate_title),
                        style = boldTextStyle(HomeTextPrimary, 20.sp)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (currentStep > 0) mandateViewModel.goBack()
                        else navController.popBackStack()
                    }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.player_info_cd_go_back),
                            tint = HomeTextPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = HomeDarkBackground,
                    titleContentColor = HomeTextPrimary
                )
            )
        },
        containerColor = HomeDarkBackground
    ) { paddingValues ->
        if (passportDetails == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.player_info_passport_details),
                    style = regularTextStyle(HomeTextSecondary, 14.sp)
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 16.dp)
            ) {
                Spacer(Modifier.height(4.dp))

                MandateStepIndicator(
                    currentStep = currentStep,
                    stepLabels = stepLabels
                )

                Spacer(Modifier.height(20.dp))

                AnimatedContent(
                    modifier = Modifier.weight(1f, fill = true),
                    targetState = currentStep,
                    transitionSpec = {
                        if (targetState > initialState) {
                            slideInHorizontally(animationSpec = tween(250)) { it } + fadeIn(tween(250)) togetherWith
                                slideOutHorizontally(animationSpec = tween(250)) { -it } + fadeOut(tween(250))
                        } else {
                            slideInHorizontally(animationSpec = tween(250)) { -it } + fadeIn(tween(250)) togetherWith
                                slideOutHorizontally(animationSpec = tween(250)) { it } + fadeOut(tween(250))
                        }
                    },
                    label = "mandate_wizard_steps"
                ) { step ->
                    when (step) {
                        0 -> MandateStep1AgentContent(
                            isLoading = isLoadingAgents,
                            agents = agentsWithFifaLicense,
                            selectedAgent = selectedAgent,
                            onSelectAgent = { mandateViewModel.setSelectedAgent(it) }
                        )
                        1 -> MandateStep2ValidityContent(
                            expiryDate = expiryDate,
                            validLeagues = validLeagues,
                            onDatePickerRequest = { mandateViewModel.setShowDatePicker(true) },
                            onAddLeagueRequest = { mandateViewModel.setShowAddLeagueSheet(true) },
                            onRemoveLeague = { entry ->
                                if (Countries.all.contains(entry)) {
                                    mandateViewModel.removeFromCountryOnly(entry)
                                } else {
                                    val parts = entry.split(" - ", limit = 2)
                                    if (parts.size == 2) {
                                        mandateViewModel.removeClubFromSelected(parts[0], parts[1])
                                    }
                                }
                            }
                        )
                        2 -> MandateStep3ReviewContent(
                            passportDetails = passportDetails,
                            selectedAgent = selectedAgent,
                            expiryDate = expiryDate,
                            validLeagues = validLeagues,
                            onEditAgent = { mandateViewModel.editAgent() },
                            onEditValidity = { mandateViewModel.editValidity() }
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                val canProceedStep1 = selectedAgent != null
                val canProceedStep2 = expiryDate != null && validLeagues.isNotEmpty()

                when (currentStep) {
                    0 -> {
                        Button(
                            onClick = { mandateViewModel.goNext() },
                            enabled = canProceedStep1,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = HomeTealAccent,
                                disabledContainerColor = HomeTealAccent.copy(alpha = 0.3f)
                            )
                        ) {
                            Text(
                                stringResource(R.string.mandate_next),
                                style = boldTextStyle(Color.White, 15.sp)
                            )
                        }
                        if (!canProceedStep1) {
                            Text(
                                text = stringResource(R.string.mandate_hint_select_agent),
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp),
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                    1 -> {
                        Button(
                            onClick = { mandateViewModel.goNext() },
                            enabled = canProceedStep2,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = HomeTealAccent,
                                disabledContainerColor = HomeTealAccent.copy(alpha = 0.3f)
                            )
                        ) {
                            Text(
                                stringResource(R.string.mandate_next),
                                style = boldTextStyle(Color.White, 15.sp)
                            )
                        }
                        if (!canProceedStep2) {
                            val hint = when {
                                expiryDate == null && validLeagues.isEmpty() ->
                                    stringResource(R.string.mandate_hint_date_and_leagues)
                                expiryDate == null ->
                                    stringResource(R.string.mandate_hint_select_date)
                                else ->
                                    stringResource(R.string.mandate_hint_add_league)
                            }
                            Text(
                                text = hint,
                                style = regularTextStyle(HomeTextSecondary, 12.sp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp),
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                    2 -> {
                        Button(
                            onClick = {
                                if (expiryDate == null || validLeagues.isEmpty()) return@Button
                                mandateViewModel.setIsGenerating(true)
                                scope.launch {
                                    val result = withContext(Dispatchers.IO) {
                                        val cacheDir = File(context.cacheDir, "mandate_pdfs").apply { mkdirs() }
                                        val playerName = listOfNotNull(passportDetails.firstName, passportDetails.lastName)
                                            .joinToString("_").replace(Regex("[^a-zA-Z0-9_-]"), "")
                                        val fileName = "Mandate_${playerName.ifBlank { "player" }}.pdf"
                                        val file = File(cacheDir, fileName)
                                        val agentName = selectedAgent?.name ?: "Lior Dahan"
                                        val fifaLicenseId = selectedAgent?.fifaLicenseId ?: "22412-9595"
                                        val data = MandatePdfGenerator.MandateData(
                                            passportDetails = passportDetails,
                                            effectiveDate = Date(),
                                            expiryDate = expiryDate!!,
                                            validLeagues = validLeagues,
                                            agentName = agentName,
                                            fifaLicenseId = fifaLicenseId
                                        )
                                        MandatePdfGenerator.generatePdf(data, file, context)
                                    }
                                    mandateViewModel.setIsGenerating(false)
                                    result.fold(
                                        onSuccess = { pdfFile ->
                                            navController.navigate(
                                                "${Screens.MandatePreviewScreen.route}/${Uri.encode(playerId)}/${Uri.encode(pdfFile.name)}"
                                            )
                                        },
                                        onFailure = { e ->
                                            Log.e("GenerateMandate", "PDF generation failed", e)
                                            ToastManager.showError(
                                                context.getString(R.string.mandate_error_generate_failed, e.message ?: "")
                                            )
                                        }
                                    )
                                }
                            },
                            enabled = !isGenerating,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = HomeTealAccent,
                                disabledContainerColor = HomeTealAccent.copy(alpha = 0.5f)
                            )
                        ) {
                            if (isGenerating) {
                                CircularProgressIndicator(
                                    color = Color.White,
                                    modifier = Modifier.size(22.dp),
                                    strokeWidth = 2.5.dp
                                )
                                Spacer(Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.mandate_generating),
                                    style = boldTextStyle(Color.White, 15.sp)
                                )
                            } else {
                                Icon(
                                    Icons.Default.SportsSoccer,
                                    contentDescription = null,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    stringResource(R.string.mandate_generate_pdf),
                                    style = boldTextStyle(Color.White, 15.sp)
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))
            }
        }
    }

    // Date picker dialog
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = expiryDate?.time
                ?: Calendar.getInstance().apply { add(Calendar.MONTH, 6) }.timeInMillis
        )
        DatePickerDialog(
            onDismissRequest = { mandateViewModel.setShowDatePicker(false) },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { ms ->
                            mandateViewModel.setExpiryDate(Date(ms))
                        }
                        mandateViewModel.setShowDatePicker(false)
                    }
                ) {
                    Text(stringResource(R.string.mandate_confirm), color = HomeTealAccent)
                }
            },
            dismissButton = {
                TextButton(onClick = { mandateViewModel.setShowDatePicker(false) }) {
                    Text(stringResource(R.string.mandate_cancel), color = HomeTextSecondary)
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }

    // Add league bottom sheet
    if (showAddLeagueSheet) {
        AddLeagueBottomSheet(
            mandateViewModel = mandateViewModel,
            onDismiss = { mandateViewModel.setShowAddLeagueSheet(false) }
        )
    }
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

@Composable
private fun MandateStepIndicator(currentStep: Int, stepLabels: List<String>) {
    Column(modifier = Modifier.fillMaxWidth()) {
        LinearProgressIndicator(
            progress = { (currentStep + 1) / stepLabels.size.toFloat() },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = HomeTealAccent,
            trackColor = HomeDarkCardBorder,
            strokeCap = StrokeCap.Round
        )
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            stepLabels.forEachIndexed { index, _ ->
                if (index > 0) Spacer(Modifier.width(6.dp))
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                index < currentStep -> HomeGreenAccent
                                index == currentStep -> HomeTealAccent
                                else -> HomeDarkCardBorder
                            }
                        )
                )
            }
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.mandate_step_of, currentStep + 1) + " \u2014 " + stepLabels[currentStep],
                style = regularTextStyle(HomeTextSecondary, 12.sp)
            )
        }
    }
}

// ─── Step 1: Agent Selection ─────────────────────────────────────────────────

@Composable
private fun MandateStep1AgentContent(
    isLoading: Boolean,
    agents: List<Account>,
    selectedAgent: Account?,
    onSelectAgent: (Account) -> Unit
) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.mandate_step1_title),
            style = boldTextStyle(HomeTextPrimary, 22.sp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.mandate_step1_subtitle),
            style = regularTextStyle(HomeTextSecondary, 14.sp)
        )
        Spacer(Modifier.height(24.dp))

        if (isLoading) {
            repeat(3) { index ->
                AgentSkeletonCard(index)
                if (index < 2) Spacer(Modifier.height(8.dp))
            }
        } else if (agents.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
                border = BorderStroke(1.dp, HomeDarkCardBorder)
            ) {
                Text(
                    text = stringResource(R.string.mandate_no_agents_fifa),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    modifier = Modifier.padding(20.dp)
                )
            }
        } else {
            agents.forEach { agent ->
                val isSelected = selectedAgent?.id == agent.id
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clickable { onSelectAgent(agent) },
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isSelected) HomeTealAccent.copy(alpha = 0.12f) else HomeDarkCard
                    ),
                    border = BorderStroke(
                        if (isSelected) 2.dp else 1.dp,
                        if (isSelected) HomeTealAccent else HomeDarkCardBorder
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = { onSelectAgent(agent) },
                            colors = RadioButtonDefaults.colors(
                                selectedColor = HomeTealAccent,
                                unselectedColor = HomeTextSecondary
                            )
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = agent.getDisplayName(context),
                                style = boldTextStyle(HomeTextPrimary, 15.sp)
                            )
                            agent.fifaLicenseId?.let { id ->
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = stringResource(R.string.mandate_fifa_license, id),
                                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                                )
                            }
                        }
                        if (isSelected) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                tint = HomeTealAccent,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AgentSkeletonCard(index: Int) {
    val infiniteTransition = rememberInfiniteTransition(label = "skeleton_$index")
    val shimmerAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = 900,
                delayMillis = index * 80,
                easing = FastOutSlowInEasing
            ),
            repeatMode = RepeatMode.Reverse
        ),
        label = "shimmer_$index"
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder.copy(alpha = shimmerAlpha))
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.55f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(HomeDarkCardBorder.copy(alpha = shimmerAlpha))
                )
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.35f)
                        .height(10.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(HomeDarkCardBorder.copy(alpha = shimmerAlpha * 0.7f))
                )
            }
        }
    }
}

// ─── Step 2: Validity ────────────────────────────────────────────────────────

@Composable
private fun MandateStep2ValidityContent(
    expiryDate: Date?,
    validLeagues: List<String>,
    onDatePickerRequest: () -> Unit,
    onAddLeagueRequest: () -> Unit,
    onRemoveLeague: (String) -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("dd/MM/yyyy", Locale.US) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.mandate_step2_title),
            style = boldTextStyle(HomeTextPrimary, 22.sp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.mandate_step2_subtitle),
            style = regularTextStyle(HomeTextSecondary, 14.sp)
        )

        Spacer(Modifier.height(24.dp))

        // Expiry date card
        Text(
            text = stringResource(R.string.mandate_expiry_date),
            style = boldTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onDatePickerRequest() },
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(
                1.dp,
                if (expiryDate != null) HomeTealAccent.copy(alpha = 0.5f) else HomeDarkCardBorder
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(HomeTealAccent.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.CalendarMonth,
                        contentDescription = null,
                        tint = HomeTealAccent,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = expiryDate?.let { dateFormat.format(it) }
                            ?: stringResource(R.string.mandate_select_expiry),
                        style = boldTextStyle(
                            if (expiryDate != null) HomeTextPrimary else HomeTextSecondary,
                            15.sp
                        )
                    )
                    if (expiryDate != null) {
                        Text(
                            text = stringResource(R.string.mandate_tap_to_change),
                            style = regularTextStyle(HomeTextSecondary, 11.sp)
                        )
                    }
                }
                if (expiryDate != null) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        tint = HomeGreenAccent,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(28.dp))

        // Valid leagues section
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = stringResource(R.string.mandate_valid_leagues),
                style = boldTextStyle(HomeTextSecondary, 12.sp)
            )
            if (validLeagues.isNotEmpty()) {
                Text(
                    text = validLeagues.size.toString(),
                    style = boldTextStyle(HomeTealAccent, 12.sp),
                    modifier = Modifier
                        .background(HomeTealAccent.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                )
            }
        }
        Spacer(Modifier.height(10.dp))

        // Add league button
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onAddLeagueRequest() },
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = HomeTealAccent.copy(alpha = 0.08f)),
            border = BorderStroke(1.dp, HomeTealAccent.copy(alpha = 0.3f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = null,
                    tint = HomeTealAccent,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.mandate_add_country_league),
                    style = boldTextStyle(HomeTealAccent, 14.sp)
                )
            }
        }

        // Added leagues list
        if (validLeagues.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            validLeagues.forEach { entry ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
                    border = BorderStroke(1.dp, HomeDarkCardBorder)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (Countries.all.contains(entry)) Icons.Default.Public else Icons.Default.SportsSoccer,
                            contentDescription = null,
                            tint = HomeTealAccent.copy(alpha = 0.7f),
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = entry,
                            style = regularTextStyle(HomeTextPrimary, 14.sp),
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = { onRemoveLeague(entry) },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = stringResource(R.string.mandate_remove),
                                tint = HomeTextSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        } else {
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.mandate_no_leagues_hint),
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
        }

        Spacer(Modifier.height(24.dp))
    }
}

// ─── Step 3: Review & Generate ───────────────────────────────────────────────

@Composable
private fun MandateStep3ReviewContent(
    passportDetails: com.liordahan.mgsrteam.features.players.models.PassportDetails,
    selectedAgent: Account?,
    expiryDate: Date?,
    validLeagues: List<String>,
    onEditAgent: () -> Unit,
    onEditValidity: () -> Unit
) {
    val context = LocalContext.current
    val dateFormat = remember { SimpleDateFormat("dd/MM/yyyy", Locale.US) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.mandate_step3_title),
            style = boldTextStyle(HomeTextPrimary, 22.sp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.mandate_step3_subtitle),
            style = regularTextStyle(HomeTextSecondary, 14.sp)
        )
        Spacer(Modifier.height(24.dp))

        // Player card (read-only)
        ReviewCard(
            icon = Icons.Default.Person,
            title = stringResource(R.string.mandate_review_player),
            onEdit = null
        ) {
            ReviewRow(stringResource(R.string.player_info_passport_first_name), passportDetails.firstName ?: "—")
            ReviewRow(stringResource(R.string.player_info_passport_last_name), passportDetails.lastName ?: "—")
            ReviewRow(stringResource(R.string.player_info_passport_dob), passportDetails.dateOfBirth ?: "—")
            ReviewRow(stringResource(R.string.player_info_passport_number), passportDetails.passportNumber ?: "—")
        }

        Spacer(Modifier.height(12.dp))

        // Agent card
        ReviewCard(
            icon = Icons.Default.Person,
            title = stringResource(R.string.mandate_review_agent),
            onEdit = onEditAgent
        ) {
            ReviewRow(
                stringResource(R.string.player_info_passport_first_name),
                selectedAgent?.getDisplayName(context) ?: "—"
            )
            ReviewRow(
                stringResource(R.string.mandate_review_fifa_id),
                selectedAgent?.fifaLicenseId ?: "—"
            )
        }

        Spacer(Modifier.height(12.dp))

        // Validity card
        ReviewCard(
            icon = Icons.Default.CalendarMonth,
            title = stringResource(R.string.mandate_review_validity),
            onEdit = onEditValidity
        ) {
            ReviewRow(
                stringResource(R.string.mandate_expiry_date),
                expiryDate?.let { dateFormat.format(it) } ?: "—"
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.mandate_valid_leagues),
                style = regularTextStyle(HomeTextSecondary, 12.sp)
            )
            Spacer(Modifier.height(4.dp))
            validLeagues.forEach { league ->
                Row(
                    modifier = Modifier.padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        if (Countries.all.contains(league)) Icons.Default.Public else Icons.Default.SportsSoccer,
                        contentDescription = null,
                        tint = HomeTealAccent.copy(alpha = 0.7f),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = league,
                        style = regularTextStyle(HomeTextPrimary, 14.sp)
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun ReviewCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    onEdit: (() -> Unit)?,
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = HomeTealAccent,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = title,
                    style = boldTextStyle(HomeTextPrimary, 15.sp),
                    modifier = Modifier.weight(1f)
                )
                if (onEdit != null) {
                    IconButton(
                        onClick = onEdit,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            Icons.Default.Edit,
                            contentDescription = stringResource(R.string.contacts_edit),
                            tint = HomeTealAccent,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = HomeDarkCardBorder, thickness = 1.dp)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun ReviewRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = regularTextStyle(HomeTextSecondary, 13.sp)
        )
        Text(
            text = value,
            style = boldTextStyle(HomeTextPrimary, 13.sp)
        )
    }
}

// ─── Add League Bottom Sheet ─────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddLeagueBottomSheet(
    mandateViewModel: GenerateMandateViewModel,
    onDismiss: () -> Unit
) {
    val clubSearch: ClubSearch = koinInject()

    val sheetCountryQuery by mandateViewModel.sheetCountryQuery.collectAsState()
    val sheetSelectedCountry by mandateViewModel.sheetSelectedCountry.collectAsState()
    val sheetEntireCountry by mandateViewModel.sheetEntireCountry.collectAsState()
    val sheetClubQuery by mandateViewModel.sheetClubQuery.collectAsState()
    val sheetPendingClubs by mandateViewModel.sheetPendingClubs.collectAsState()

    var clubSearchResults by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    var isSearchingClubs by remember { mutableStateOf(false) }

    LaunchedEffect(sheetClubQuery) {
        if (sheetClubQuery.length < 2) {
            clubSearchResults = emptyList()
            return@LaunchedEffect
        }
        delay(350)
        isSearchingClubs = true
        clubSearchResults = when (val result = clubSearch.getClubSearchResults(sheetClubQuery)) {
            is TransfermarktResult.Success -> result.data
            is TransfermarktResult.Failed -> emptyList()
        }
        isSearchingClubs = false
    }

    val filteredClubResults = remember(clubSearchResults, sheetSelectedCountry) {
        if (sheetSelectedCountry.isNullOrBlank()) clubSearchResults
        else clubSearchResults.filter { it.clubCountry.equals(sheetSelectedCountry, ignoreCase = true) }
    }

    val filteredCountries = remember(sheetCountryQuery) {
        if (sheetCountryQuery.isBlank()) Countries.all
        else Countries.all.filter { it.contains(sheetCountryQuery, ignoreCase = true) }
    }

    val canAdd = sheetSelectedCountry != null && (sheetEntireCountry || sheetPendingClubs.isNotEmpty())

    ModalBottomSheet(
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        containerColor = HomeDarkCard,
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp, 4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(HomeDarkCardBorder)
                )
            }
        },
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .imePadding()
                .navigationBarsPadding()
                .padding(bottom = 24.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.mandate_add_country_league),
                    style = boldTextStyle(HomeTextPrimary, 18.sp)
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = null, tint = HomeTextSecondary)
                }
            }

            Spacer(Modifier.height(16.dp))

            if (sheetSelectedCountry == null) {
                // Country search
                Text(
                    text = stringResource(R.string.mandate_sheet_search_country),
                    style = regularTextStyle(HomeTextSecondary, 13.sp),
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                OutlinedTextField(
                    value = sheetCountryQuery,
                    onValueChange = { mandateViewModel.setSheetCountryQuery(it) },
                    placeholder = {
                        Text(
                            stringResource(R.string.mandate_select_country),
                            style = regularTextStyle(HomeTextSecondary, 14.sp)
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(
                        focusedTextColor = HomeTextPrimary,
                        unfocusedTextColor = HomeTextPrimary,
                        focusedBorderColor = HomeTealAccent,
                        unfocusedBorderColor = HomeDarkCardBorder,
                        cursorColor = HomeTealAccent
                    )
                )

                Spacer(Modifier.height(8.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 300.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(filteredCountries.take(50)) { country ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    mandateViewModel.setSheetSelectedCountry(country)
                                    mandateViewModel.setSheetCountryQuery("")
                                },
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = HomeDarkBackground),
                            border = BorderStroke(1.dp, HomeDarkCardBorder)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Public,
                                    contentDescription = null,
                                    tint = HomeTextSecondary,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    text = country,
                                    style = regularTextStyle(HomeTextPrimary, 14.sp)
                                )
                            }
                        }
                    }
                }
            } else {
                // Country selected — show options
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = HomeTealAccent.copy(alpha = 0.1f)),
                    border = BorderStroke(1.dp, HomeTealAccent.copy(alpha = 0.3f))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Public,
                            contentDescription = null,
                            tint = HomeTealAccent,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = sheetSelectedCountry!!,
                            style = boldTextStyle(HomeTextPrimary, 15.sp),
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { mandateViewModel.setSheetSelectedCountry(null) }) {
                            Text(
                                stringResource(R.string.contacts_change),
                                style = regularTextStyle(HomeTealAccent, 13.sp)
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Entire country toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = stringResource(R.string.mandate_entire_country),
                        style = regularTextStyle(HomeTextPrimary, 14.sp)
                    )
                    Switch(
                        checked = sheetEntireCountry,
                        onCheckedChange = { mandateViewModel.setSheetEntireCountry(it) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = HomeTealAccent,
                            checkedTrackColor = HomeTealAccent.copy(alpha = 0.5f)
                        )
                    )
                }

                if (!sheetEntireCountry) {
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = sheetClubQuery,
                        onValueChange = { mandateViewModel.setSheetClubQuery(it) },
                        placeholder = {
                            Text(
                                stringResource(R.string.mandate_sheet_search_clubs, sheetSelectedCountry!!),
                                style = regularTextStyle(HomeTextSecondary, 14.sp)
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(
                            focusedTextColor = HomeTextPrimary,
                            unfocusedTextColor = HomeTextPrimary,
                            focusedBorderColor = HomeTealAccent,
                            unfocusedBorderColor = HomeDarkCardBorder,
                            cursorColor = HomeTealAccent
                        ),
                        trailingIcon = {
                            if (isSearchingClubs) {
                                Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(
                                        color = HomeTealAccent,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            }
                        }
                    )

                    // Search results
                    if (filteredClubResults.isNotEmpty()) {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 160.dp)
                                .padding(vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            items(filteredClubResults) { club ->
                                ClubRow(
                                    club = club,
                                    onClick = {
                                        mandateViewModel.addToSheetPendingClubs(club)
                                        mandateViewModel.setSheetClubQuery("")
                                    }
                                )
                            }
                        }
                    }

                    // Pending clubs chips
                    if (sheetPendingClubs.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.mandate_selected_clubs, sheetPendingClubs.size),
                            style = regularTextStyle(HomeTextSecondary, 12.sp),
                            modifier = Modifier.padding(bottom = 6.dp)
                        )
                        sheetPendingClubs.forEach { club ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = HomeDarkBackground),
                                border = BorderStroke(1.dp, HomeDarkCardBorder)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(start = 12.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    club.clubLogo?.let { logo ->
                                        AsyncImage(
                                            model = logo,
                                            contentDescription = null,
                                            modifier = Modifier.size(24.dp),
                                            contentScale = ContentScale.Fit
                                        )
                                        Spacer(Modifier.width(8.dp))
                                    }
                                    Text(
                                        text = club.clubName ?: "",
                                        style = regularTextStyle(HomeTextPrimary, 13.sp),
                                        modifier = Modifier.weight(1f)
                                    )
                                    IconButton(
                                        onClick = { mandateViewModel.removeFromSheetPendingClubs(club) },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Close,
                                            contentDescription = null,
                                            tint = HomeTextSecondary,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(20.dp))

                // Add button
                Button(
                    onClick = { mandateViewModel.confirmSheetSelection() },
                    enabled = canAdd,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HomeTealAccent,
                        disabledContainerColor = HomeTealAccent.copy(alpha = 0.3f)
                    )
                ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.mandate_sheet_add_button),
                        style = boldTextStyle(Color.White, 14.sp)
                    )
                }
            }
        }
    }
}

// ─── Reusable Club Row ───────────────────────────────────────────────────────

@Composable
private fun ClubRow(club: ClubSearchModel, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple(onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkBackground),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            club.clubLogo?.let { logo ->
                AsyncImage(
                    model = logo,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                    contentScale = ContentScale.Fit
                )
                Spacer(Modifier.width(10.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(club.clubName ?: "", style = boldTextStyle(HomeTextPrimary, 14.sp))
                club.clubCountry?.let { c ->
                    Text(c, style = regularTextStyle(HomeTextSecondary, 12.sp))
                }
            }
            Icon(
                Icons.Default.Add,
                contentDescription = null,
                tint = HomeTealAccent,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
