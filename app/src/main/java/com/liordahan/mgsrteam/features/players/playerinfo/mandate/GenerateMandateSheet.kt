package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import android.content.Context
import android.content.Intent
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Image
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.models.PassportDetails
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject
import java.io.File
import java.util.Calendar
import java.util.Date

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenerateMandateSheet(
    player: Player,
    onDismiss: () -> Unit,
    onGenerated: (File) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val clubSearch: ClubSearch = koinInject()
    val context = LocalContext.current
    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density

    val passportDetails = player.passportDetails ?: return

    var expiryDate by remember { mutableStateOf<Date?>(null) }
    var showDatePicker by remember { mutableStateOf(false) }
    var countryOnly by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedClubs by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    var pendingClubs by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }

    var currentCountry by remember { mutableStateOf<String?>(null) }
    var entireCountry by remember { mutableStateOf(true) }
    var clubSearchQuery by remember { mutableStateOf("") }
    var clubSearchResults by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    var isSearchingClubs by remember { mutableStateOf(false) }
    var countrySearchQuery by remember { mutableStateOf("") }
    var isGenerating by remember { mutableStateOf(false) }
    var generatedPdfFile by remember { mutableStateOf<File?>(null) }
    val scope = rememberCoroutineScope()

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

    ModalBottomSheet(
        sheetState = sheetState,
        modifier = Modifier.height(screenHeight * 0.95f),
        onDismissRequest = {
            generatedPdfFile?.let { onGenerated(it) }
            onDismiss()
        },
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = HomeDarkCard,
        tonalElevation = 8.dp,
        properties = ModalBottomSheetProperties(
            isAppearanceLightStatusBars = true,
            isAppearanceLightNavigationBars = true
        )
    ) {
        DarkSystemBarsForBottomSheet()
        if (generatedPdfFile != null) {
            MandatePreviewContent(
                pdfFile = generatedPdfFile!!,
                onShare = {
                    shareMandatePdf(context, generatedPdfFile!!)
                },
                onDone = {
                    onGenerated(generatedPdfFile!!)
                    onDismiss()
                }
            )
        } else {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp)
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                text = stringResource(R.string.mandate_generate_title),
                style = boldTextStyle(HomeTextPrimary, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
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
                    .clickable { showDatePicker = true },
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
                    onDismissRequest = { showDatePicker = false },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                datePickerState.selectedDateMillis?.let { ms ->
                                    expiryDate = Date(ms)
                                }
                                showDatePicker = false
                            }
                        ) {
                            Text(stringResource(R.string.mandate_confirm), color = HomeTealAccent)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showDatePicker = false }) {
                            Text(stringResource(R.string.mandate_cancel), color = HomeTextSecondary)
                        }
                    }
                ) {
                    DatePicker(state = datePickerState)
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
                    if (currentCountry != null) currentCountry = null
                    countrySearchQuery = it
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
            if (filteredCountries.isNotEmpty() && currentCountry == null) {
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
                                    currentCountry = country
                                    countrySearchQuery = ""
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
                    onCheckedChange = { entireCountry = it },
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
                    onValueChange = { clubSearchQuery = it },
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
                                    if (pendingClubs.none { it.clubName == club.clubName && it.clubCountry == club.clubCountry }) {
                                        pendingClubs = pendingClubs + club
                                    }
                                    clubSearchQuery = ""
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
                            countryOnly = (countryOnly + country).distinct().sorted()
                        } else {
                            val toAdd = pendingClubs.filter { it.clubCountry.equals(country, ignoreCase = true) }
                            selectedClubs = (selectedClubs + toAdd).distinctBy { "${it.clubName}-${it.clubCountry}" }
                        }
                        currentCountry = null
                        entireCountry = true
                        pendingClubs = emptyList()
                        clubSearchQuery = ""
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
                                    countryOnly = countryOnly - entry
                                } else {
                                    val parts = entry.split(" - ", limit = 2)
                                    if (parts.size == 2) {
                                        val (clubName, country) = parts
                                        selectedClubs = selectedClubs.filter { !(it.clubName == clubName && it.clubCountry == country) }
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
                    isGenerating = true
                    scope.launch {
                        val result = withContext(Dispatchers.IO) {
                            val cacheDir = File(context.cacheDir, "mandate_pdfs").apply { mkdirs() }
                            val playerName = listOfNotNull(passportDetails.firstName, passportDetails.lastName)
                                .joinToString("_").replace(Regex("[^a-zA-Z0-9_-]"), "")
                            val fileName = "Mandate_${playerName.ifBlank { "player" }}.pdf"
                            val file = File(cacheDir, fileName)
                            val data = MandatePdfGenerator.MandateData(
                                passportDetails = passportDetails,
                                effectiveDate = Date(),
                                expiryDate = expiryDate!!,
                                validLeagues = validLeagues
                            )
                            MandatePdfGenerator.generatePdf(data, file)
                        }
                        isGenerating = false
                        result.onSuccess { pdfFile ->
                            generatedPdfFile = pdfFile
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = expiryDate != null && validLeagues.isNotEmpty() && !isGenerating,
                colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (isGenerating) {
                    CircularProgressIndicator(color = androidx.compose.ui.graphics.Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Text(stringResource(R.string.mandate_generate_pdf))
                }
            }
        }
        }
    }
}

@Composable
private fun MandatePreviewContent(
    pdfFile: File,
    onShare: () -> Unit,
    onDone: () -> Unit
) {
    var pageBitmaps by remember { mutableStateOf<List<android.graphics.Bitmap>>(emptyList()) }

    LaunchedEffect(pdfFile) {
        pageBitmaps = withContext(Dispatchers.IO) {
            try {
                val pfd = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(pfd)
                val list = mutableListOf<android.graphics.Bitmap>()
                for (i in 0 until renderer.pageCount) {
                    val page = renderer.openPage(i)
                    val bitmap = android.graphics.Bitmap.createBitmap(
                        page.width * 2,
                        page.height * 2,
                        android.graphics.Bitmap.Config.ARGB_8888
                    )
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()
                    list.add(bitmap)
                }
                renderer.close()
                pfd.close()
                list
            } catch (_: Exception) {
                emptyList()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight()
            .padding(16.dp)
            .navigationBarsPadding()
    ) {
        Text(
            text = stringResource(R.string.mandate_preview_title),
            style = boldTextStyle(HomeTextPrimary, 20.sp),
            modifier = Modifier.padding(bottom = 16.dp)
        )
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(pageBitmaps.size) { index ->
                val bitmap = pageBitmaps.getOrNull(index)
                if (bitmap != null) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, HomeDarkCardBorder)
                    ) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = stringResource(R.string.mandate_preview_page, index + 1),
                            modifier = Modifier.fillMaxWidth(),
                            contentScale = ContentScale.Fit
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = onShare,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.player_info_share))
            }
            Button(
                onClick = onDone,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = HomeDarkCardBorder),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(stringResource(R.string.mandate_done))
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

private fun shareMandatePdf(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file
    )
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "application/pdf"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.player_info_share_with)))
}
