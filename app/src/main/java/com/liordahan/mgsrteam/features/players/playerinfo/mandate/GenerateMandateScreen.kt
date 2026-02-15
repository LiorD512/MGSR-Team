package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.layout.ContentScale
import android.util.Log
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import com.liordahan.mgsrteam.features.players.playerinfo.IPlayerInfoViewModel
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import android.net.Uri
import java.io.File
import java.util.Calendar
import java.util.Date

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
    val clubSearch: ClubSearch = koinInject()
    val firebaseHandler: FirebaseHandler = koinInject()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val agentsWithFifaLicense by mandateViewModel.agentsWithFifaLicense.collectAsState()
    val selectedAgent by mandateViewModel.selectedAgent.collectAsState()
    val expiryDate by mandateViewModel.expiryDate.collectAsState()
    val showDatePicker by mandateViewModel.showDatePicker.collectAsState()
    val countryOnly by mandateViewModel.countryOnly.collectAsState()
    val selectedClubs by mandateViewModel.selectedClubs.collectAsState()
    val pendingClubs by mandateViewModel.pendingClubs.collectAsState()
    val currentCountry by mandateViewModel.currentCountry.collectAsState()
    val entireCountry by mandateViewModel.entireCountry.collectAsState()
    val clubSearchQuery by mandateViewModel.clubSearchQuery.collectAsState()
    val countrySearchQuery by mandateViewModel.countrySearchQuery.collectAsState()
    val isGenerating by mandateViewModel.isGenerating.collectAsState()

    var clubSearchResults by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    var isSearchingClubs by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val snapshot = firebaseHandler.firebaseStore
            .collection(firebaseHandler.accountsTable)
            .get()
            .await()
        mandateViewModel.setAgentsWithFifaLicense(
            snapshot.toObjects(Account::class.java).filter { it.fifaLicenseId?.isNotBlank() == true }
        )
    }

    LaunchedEffect(clubSearchQuery) {
        if (clubSearchQuery.length < 2) {
            clubSearchResults = emptyList()
            return@LaunchedEffect
        }
        delay(350)
        isSearchingClubs = true
        clubSearchResults = when (val result = clubSearch.getClubSearchResults(clubSearchQuery)) {
            is TransfermarktResult.Success -> result.data
            is TransfermarktResult.Failed -> emptyList()
        }
        isSearchingClubs = false
    }

    val filteredClubResults = remember(clubSearchResults, currentCountry) {
        if (currentCountry.isNullOrBlank()) clubSearchResults
        else clubSearchResults.filter { it.clubCountry.equals(currentCountry, ignoreCase = true) }
    }

    val validLeagues = remember(countryOnly, selectedClubs) {
        MandatePdfGenerator.buildValidLeagues(countryOnly, selectedClubs)
    }

    val filteredCountries = remember(Countries.all, countrySearchQuery) {
        if (countrySearchQuery.isBlank()) Countries.all
        else Countries.all.filter { it.contains(countrySearchQuery, ignoreCase = true) }
    }

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
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
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
                    .verticalScroll(rememberScrollState())
            ) {
                HorizontalDivider(color = HomeDarkCardBorder, thickness = 1.dp)
                Spacer(Modifier.height(16.dp))

                // Expiry date
                Text(
                    text = stringResource(R.string.mandate_expiry_date),
                    style = regularTextStyle(HomeTextSecondary, 11.sp),
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { mandateViewModel.setShowDatePicker(true) },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
                    border = BorderStroke(1.dp, HomeDarkCardBorder)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.CalendarMonth,
                            contentDescription = null,
                            tint = HomeTealAccent,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = expiryDate?.let { java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.US).format(it) }
                                ?: stringResource(R.string.mandate_select_expiry),
                            style = regularTextStyle(
                                if (expiryDate != null) HomeTextPrimary else HomeTextSecondary,
                                14.sp
                            )
                        )
                    }
                }
                if (showDatePicker) {
                    val datePickerState = rememberDatePickerState(
                        initialSelectedDateMillis = Calendar.getInstance().apply { add(Calendar.MONTH, 6) }.timeInMillis
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

                Spacer(Modifier.height(24.dp))

                // Agent selection
                Text(
                    text = stringResource(R.string.mandate_select_agent),
                    style = regularTextStyle(HomeTextSecondary, 11.sp),
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                if (agentsWithFifaLicense.isEmpty()) {
                    Text(
                        text = stringResource(R.string.mandate_no_agents_fifa),
                        style = regularTextStyle(HomeTextSecondary, 14.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp)
                    )
                } else {
                    agentsWithFifaLicense.forEach { agent ->
                        val isSelected = selectedAgent?.id == agent.id
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickWithNoRipple { mandateViewModel.setSelectedAgent(agent) },
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else HomeDarkCard
                            ),
                            border = BorderStroke(
                                if (isSelected) 2.dp else 1.dp,
                                if (isSelected) HomeTealAccent else HomeDarkCardBorder
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = agent.getDisplayName(context),
                                    style = regularTextStyle(HomeTextPrimary, 14.sp),
                                    modifier = Modifier.weight(1f)
                                )
                                agent.fifaLicenseId?.let { id ->
                                    Text(
                                        text = id,
                                        style = regularTextStyle(HomeTextSecondary, 12.sp)
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))

                // Valid leagues / countries
                Text(
                    text = stringResource(R.string.mandate_valid_leagues),
                    style = regularTextStyle(HomeTextSecondary, 11.sp),
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                // Country search/select
                OutlinedTextField(
                    value = currentCountry ?: countrySearchQuery,
                    onValueChange = {
                        if (currentCountry != null) mandateViewModel.setCurrentCountry(null)
                        mandateViewModel.setCountrySearchQuery(it)
                    },
                    placeholder = { Text(stringResource(R.string.mandate_select_country), style = regularTextStyle(HomeTextSecondary, 14.sp)) },
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
                if (countrySearchQuery.isNotBlank() && filteredCountries.isNotEmpty() && currentCountry == null) {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 180.dp)
                            .padding(vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(filteredCountries.take(50)) { country ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickWithNoRipple {
                                        mandateViewModel.setCurrentCountry(country)
                                        mandateViewModel.setCountrySearchQuery("")
                                    },
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
                                border = BorderStroke(1.dp, HomeDarkCardBorder)
                            ) {
                                Text(
                                    text = country,
                                    style = regularTextStyle(HomeTextPrimary, 14.sp),
                                    modifier = Modifier.padding(12.dp)
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                // Entire country checkbox
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
                        checked = entireCountry,
                        onCheckedChange = { mandateViewModel.setEntireCountry(it) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = HomeTealAccent,
                            checkedTrackColor = HomeTealAccent.copy(alpha = 0.5f)
                        )
                    )
                }

                if (!entireCountry && currentCountry != null) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = clubSearchQuery,
                        onValueChange = { mandateViewModel.setClubSearchQuery(it) },
                        placeholder = { Text(stringResource(R.string.requests_search_club), style = regularTextStyle(HomeTextSecondary, 14.sp)) },
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
                                    CircularProgressIndicator(color = HomeTealAccent, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                    )
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
                                        mandateViewModel.addToPendingClubs(club)
                                        mandateViewModel.setClubSearchQuery("")
                                    }
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                if (!entireCountry && pendingClubs.isNotEmpty()) {
                    Text(
                        text = stringResource(R.string.mandate_pending_clubs, pendingClubs.size),
                        style = regularTextStyle(HomeTextSecondary, 12.sp),
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                }

                Button(
                    onClick = {
                        val country = currentCountry
                        if (country != null && (entireCountry || pendingClubs.isNotEmpty())) {
                            if (entireCountry) {
                                mandateViewModel.addToCountryOnly(country)
                            } else {
                                val toAdd = pendingClubs.filter { it.clubCountry.equals(country, ignoreCase = true) }
                                mandateViewModel.addToSelectedClubs(toAdd)
                            }
                            mandateViewModel.resetCountrySelection()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.mandate_add_to_list))
                }

                if (validLeagues.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.mandate_added_entries),
                        style = regularTextStyle(HomeTextSecondary, 11.sp),
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    validLeagues.forEach { entry ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "• $entry",
                                style = regularTextStyle(HomeTextPrimary, 13.sp),
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = {
                                    if (Countries.all.contains(entry)) {
                                        mandateViewModel.removeFromCountryOnly(entry)
                                    } else {
                                        val parts = entry.split(" - ", limit = 2)
                                        if (parts.size == 2) {
                                            val (clubName, country) = parts
                                            mandateViewModel.removeClubFromSelected(clubName, country)
                                        }
                                    }
                                }
                            ) {
                                Icon(Icons.Default.Close, contentDescription = null, tint = HomeTextSecondary, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))

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
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.mandate_error_generate_failed, e.message ?: ""),
                                        Toast.LENGTH_LONG
                                    ).show()
                                }
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = expiryDate != null && selectedAgent != null && validLeagues.isNotEmpty() && !isGenerating,
                    colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (isGenerating) {
                        CircularProgressIndicator(color = androidx.compose.ui.graphics.Color.White, modifier = Modifier.size(24.dp))
                    } else {
                        Text(stringResource(R.string.mandate_generate_pdf))
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun ClubRow(club: ClubSearchModel, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple(onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
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
                    modifier = Modifier.size(36.dp),
                    contentScale = ContentScale.Fit
                )
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(club.clubName ?: "", style = boldTextStyle(HomeTextPrimary, 14.sp))
                club.clubCountry?.let { c ->
                    Text(c, style = regularTextStyle(HomeTextSecondary, 12.sp))
                }
            }
        }
    }
}
