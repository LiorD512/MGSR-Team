package com.liordahan.mgsrteam.features.contacts

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContactPage
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.models.ContactRole
import com.liordahan.mgsrteam.features.players.playerinfo.WhatsAppIcon
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.delay
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

private fun getInitialsFromName(name: String?): String {
    if (name.isNullOrBlank()) return "?"
    val parts = name.trim().split(" ").filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> "${parts.first().first()}${parts.last().first()}".uppercase()
    }
}

@Composable
private fun ClubSearchResultRow(
    club: ClubSearchModel,
    onClick: () -> Unit
) {
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
                Text(
                    text = club.clubName ?: "",
                    style = boldTextStyle(HomeTextPrimary, 14.sp)
                )
                club.clubCountry?.let { country ->
                    Text(
                        text = country,
                        style = regularTextStyle(HomeTextSecondary, 12.sp)
                    )
                }
            }
        }
    }
}

private fun getContactId(context: android.content.Context, contactUri: Uri): String {
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

private fun getContactNameFromUri(context: android.content.Context, contactUri: Uri): String? {
    context.contentResolver.query(
        contactUri,
        arrayOf(ContactsContract.Contacts.DISPLAY_NAME),
        null,
        null,
        null
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            return cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME))
        }
    }
    return null
}

private fun getPhoneNumberFromContactUri(
    context: android.content.Context,
    contactUri: Uri
): String? {
    context.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
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

private fun openWhatsApp(context: android.content.Context, phoneNumber: String?) {
    val digits = phoneNumber?.replace(Regex("[^0-9]"), "") ?: return
    if (digits.isEmpty()) return
    val uri = Uri.parse("https://wa.me/$digits")
    val intent = Intent(Intent.ACTION_VIEW, uri)
    val chooser = Intent.createChooser(intent, null)
    try {
        context.startActivity(chooser)
    } catch (e: ActivityNotFoundException) {
        // No app can handle wa.me; try opening in browser as fallback
        try {
            val browserIntent = Intent(Intent.ACTION_VIEW, uri)
            context.startActivity(browserIntent)
        } catch (_: ActivityNotFoundException) {
        }
    }
}

private sealed class ContactListItem {
    data class CountryHeader(val country: String, val countryFlagUrl: String?) : ContactListItem()
    data class ContactRow(val contact: Contact) : ContactListItem()
}

private fun buildContactsListGroupedByCountry(contacts: List<Contact>): List<ContactListItem> {
    val otherLabel = "Other"
    val grouped = contacts
        .groupBy { it.clubCountry?.takeIf { c -> c.isNotBlank() } ?: otherLabel }
    val sortedCountries =
        grouped.keys.sortedBy { if (it == otherLabel) "\uFFFF" else it.lowercase() }
    return sortedCountries.flatMap { country ->
        val list = grouped[country]!!.sortedBy { it.clubName?.lowercase() ?: "" }
        val flagUrl = list.firstOrNull()?.clubCountryFlag
        listOf(
            ContactListItem.CountryHeader(
                country,
                flagUrl
            )
        ) + list.map { ContactListItem.ContactRow(it) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsScreen(
    viewModel: IContactsViewModel = koinViewModel(),
    navController: NavController
) {
    val context = LocalContext.current
    val state by viewModel.contactsState.collectAsStateWithLifecycle()
    var showAddEditSheet by remember { mutableStateOf(false) }
    var editingContact by remember { mutableStateOf<Contact?>(null) }
    var contactToDelete by remember { mutableStateOf<Contact?>(null) }
    var searchContactInput by remember { mutableStateOf(TextFieldValue("")) }

    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    val searchQuery = searchContactInput.text.trim()
    val filteredContacts = remember(state.contacts, searchQuery) {
        if (searchQuery.isBlank()) state.contacts
        else state.contacts.filter { contact ->
            contact.name?.contains(searchQuery, ignoreCase = true) == true ||
                    contact.clubName?.contains(searchQuery, ignoreCase = true) == true ||
                    contact.clubCountry?.contains(searchQuery, ignoreCase = true) == true
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground,
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    editingContact = null
                    showAddEditSheet = true
                },
                shape = RoundedCornerShape(18.dp),
                containerColor = HomeTealAccent,
                contentColor = HomeDarkBackground
            ) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = "Add contact",
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(HomeDarkBackground)
            ) {
                ContactsHeader(
                    onAddClick = {
                        editingContact = null
                        showAddEditSheet = true
                    },
                    onBackClicked = { navController.popBackStack() })

                when {
                    state.isLoading -> {
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
                    }

                    state.contacts.isEmpty() -> {
                        ContactsStatsStrip(
                            total = 0,
                            countries = 0,
                        )
                        ContactsSearchBar(
                            query = searchContactInput.text,
                            onQueryChange = { searchContactInput = TextFieldValue(it) },
                            onClear = {
                                searchContactInput = TextFieldValue("")
                                keyboardController?.hide()
                                focusManager.clearFocus()
                            }
                        )
                        ContactsEmptyState(onAddContact = { showAddEditSheet = true })
                    }

                    filteredContacts.isEmpty() -> {
                        ContactsStatsStrip(
                            total = state.contacts.size,
                            countries = state.contacts.map {
                                it.clubCountry?.takeIf { c -> c.isNotBlank() } ?: "Other"
                            }.toSet().size
                        )
                        ContactsSearchBar(
                            query = searchContactInput.text,
                            onQueryChange = { searchContactInput = TextFieldValue(it) },
                            onClear = {
                                searchContactInput = TextFieldValue("")
                                keyboardController?.hide()
                                focusManager.clearFocus()
                            }
                        )
                        ContactsEmptyState(
                            title = "No contacts found",
                            subtitle = "Try a different search or add a new contact",
                            buttonText = "Clear search",
                            onButtonClick = { searchContactInput = TextFieldValue("") }
                        )
                    }

                    else -> {
                        val uniqueCountries = filteredContacts.map {
                            it.clubCountry?.takeIf { c -> c.isNotBlank() } ?: "Other"
                        }.toSet().size
                        val withWhatsApp =
                            filteredContacts.count { !it.phoneNumber.isNullOrBlank() }
                        ContactsStatsStrip(
                            total = filteredContacts.size,
                            countries = uniqueCountries
                        )
                        ContactsSearchBar(
                            query = searchContactInput.text,
                            onQueryChange = { searchContactInput = TextFieldValue(it) },
                            onClear = {
                                searchContactInput = TextFieldValue("")
                                keyboardController?.hide()
                                focusManager.clearFocus()
                            }
                        )
                        val listItems = remember(filteredContacts) {
                            buildContactsListGroupedByCountry(filteredContacts)
                        }
                        LazyColumn(
                            contentPadding = PaddingValues(
                                top = 4.dp,
                                bottom = 100.dp,
                                start = 16.dp,
                                end = 16.dp
                            ),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(
                                items = listItems,
                                key = { item ->
                                    when (item) {
                                        is ContactListItem.CountryHeader -> "header_${item.country}"
                                        is ContactListItem.ContactRow -> "contact_${item.contact.id}"
                                    }
                                }
                            ) { item ->
                                when (item) {
                                    is ContactListItem.CountryHeader -> CountrySectionHeader(
                                        country = item.country,
                                        countryFlagUrl = item.countryFlagUrl
                                    )

                                    is ContactListItem.ContactRow -> ContactCard(
                                        contact = item.contact,
                                        onEdit = {
                                            editingContact = item.contact
                                            showAddEditSheet = true
                                        },
                                        onDelete = { contactToDelete = item.contact }
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (showAddEditSheet) {
                var pickedName by remember(editingContact) {
                    mutableStateOf(editingContact?.name ?: "")
                }
                var pickedPhone by remember(editingContact) {
                    mutableStateOf(editingContact?.phoneNumber ?: "")
                }
                val contactPickerLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.PickContact()
                ) { contactUri ->
                    contactUri?.let { uri ->
                        val name = getContactNameFromUri(context, uri)
                        val phone = getPhoneNumberFromContactUri(context, uri)
                        if (name != null) pickedName = name
                        if (phone != null) pickedPhone = phone
                    }
                }
                val permissionLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestPermission()
                ) { isGranted ->
                    if (isGranted) contactPickerLauncher.launch(null)
                }
                AddEditContactBottomSheet(
                    modifier = Modifier.align(Alignment.BottomCenter),
                    initialContact = editingContact,
                    pickedName = pickedName,
                    pickedPhone = pickedPhone,
                    onNameChange = { pickedName = it },
                    onPhoneChange = { pickedPhone = it },
                    onPickContact = {
                        if (ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.READ_CONTACTS
                            ) == PackageManager.PERMISSION_GRANTED
                        ) {
                            contactPickerLauncher.launch(null)
                        } else {
                            permissionLauncher.launch(Manifest.permission.READ_CONTACTS)
                        }
                    },
                    onDismiss = {
                        showAddEditSheet = false
                        editingContact = null
                    },
                    onSave = { contact ->
                        if (contact.id != null) {
                            viewModel.updateContact(contact)
                        } else {
                            viewModel.addContact(contact)
                        }
                        showAddEditSheet = false
                        editingContact = null
                    }
                )
            }

            contactToDelete?.let { contact ->
                AlertDialog(
                    onDismissRequest = { contactToDelete = null },
                    title = {
                        Text(
                            "Delete contact",
                            style = boldTextStyle(HomeTextPrimary, 18.sp)
                        )
                    },
                    text = {
                        Text(
                            "Delete ${contact.name ?: "this contact"}?",
                            style = regularTextStyle(HomeTextSecondary, 14.sp)
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                viewModel.deleteContact(contact.id!!)
                                contactToDelete = null
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = HomeRedAccent)
                        ) {
                            Text("Delete", style = boldTextStyle(Color.White, 14.sp))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { contactToDelete = null }) {
                            Text("Cancel", style = regularTextStyle(HomeTextSecondary, 14.sp))
                        }
                    },
                    containerColor = HomeDarkCard
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONTACTS HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactsHeader(onAddClick: () -> Unit, onBackClicked: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 12.dp, top = 48.dp, bottom = 4.dp),
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
                text = "Worldwide Contacts",
                style = boldTextStyle(HomeTextPrimary, 26.sp)
            )
            Text(
                text = "Club contacts for player recruitment",
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        IconButton(
            onClick = onAddClick,
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                Icons.Default.Add,
                contentDescription = "Add contact",
                tint = HomeTealAccent
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATS STRIP
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactsStatsStrip(
    total: Int,
    countries: Int
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        ContactsStatItem(
            value = total.toString(),
            label = "Total",
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        ContactsStatsStripDivider()
        ContactsStatItem(
            value = countries.toString(),
            label = "Countries",
            accentColor = HomeBlueAccent,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ContactsStatItem(
    value: String,
    label: String,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(accentColor)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = value,
            style = boldTextStyle(HomeTextPrimary, 18.sp)
        )
        Text(
            text = label,
            style = regularTextStyle(HomeTextSecondary, 9.sp)
        )
    }
}

@Composable
private fun ContactsStatsStripDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .padding(vertical = 4.dp)
            .background(HomeDarkCardBorder)
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  SEARCH BAR
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactsSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    TextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp)),
        placeholder = {
            Text(
                text = stringResource(R.string.contacts_screen_search_hint),
                style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.5f), 13.sp)
            )
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = HomeTextSecondary,
                modifier = Modifier.size(20.dp)
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Clear",
                    tint = HomeTextSecondary,
                    modifier = Modifier
                        .size(18.dp)
                        .clickWithNoRipple {
                            onClear()
                            keyboardController?.hide()
                            focusManager.clearFocus()
                        }
                )
            }
        },
        textStyle = regularTextStyle(HomeTextPrimary, 13.sp),
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            imeAction = ImeAction.Done,
            keyboardType = KeyboardType.Text
        ),
        keyboardActions = KeyboardActions(
            onDone = {
                keyboardController?.hide()
                focusManager.clearFocus()
            }
        ),
        colors = TextFieldDefaults.colors(
            focusedTextColor = HomeTextPrimary,
            unfocusedTextColor = HomeTextPrimary,
            disabledTextColor = HomeTextSecondary,
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            disabledContainerColor = Color.Transparent,
            cursorColor = HomeTealAccent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent
        )
    )
}

// ═════════════════════════════════════════════════════════════════════════════
//  EMPTY STATE
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactsEmptyState(
    title: String = "No contacts yet",
    subtitle: String = "Add club contacts for player recruitment. Pick from your phone or add manually.",
    buttonText: String = "Add contact",
    onAddContact: () -> Unit = {},
    onButtonClick: (() -> Unit)? = null
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 48.dp, vertical = 50.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = HomeTextSecondary.copy(alpha = 0.5f)
            )
            Spacer(Modifier.height(20.dp))
            Text(
                text = title,
                style = boldTextStyle(HomeTextPrimary, 18.sp),
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = subtitle,
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(28.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(HomeTealAccent)
                    .clickWithNoRipple { (onButtonClick ?: onAddContact)() }
                    .padding(horizontal = 28.dp, vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = buttonText,
                    style = boldTextStyle(HomeDarkBackground, 14.sp)
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  COUNTRY SECTION HEADER
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun CountrySectionHeader(
    country: String,
    countryFlagUrl: String?
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (countryFlagUrl?.isNotEmpty() == true) {
            Surface(tonalElevation = 4.dp, shadowElevation = 4.dp, shape = CircleShape) {
                AsyncImage(
                    model = countryFlagUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .size(25.dp)
                        .clip(CircleShape)
                )
            }
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = country,
            style = boldTextStyle(HomeTextPrimary, 14.sp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONTACT CARD
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactCard(
    contact: Contact,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val context = LocalContext.current
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRect(
                        color = HomeTealAccent,
                        topLeft = Offset.Zero,
                        size = Size(3.dp.toPx(), size.height)
                    )
                }
                .padding(start = 3.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(HomeDarkCardBorder)
                            .border(2.dp, HomeDarkCardBorder, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = getInitialsFromName(contact.name),
                            style = boldTextStyle(HomeTextSecondary, 14.sp)
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = contact.name ?: "",
                            style = boldTextStyle(HomeTextPrimary, 14.sp)
                        )
                        contact.roleEnum?.let { role ->
                            Spacer(Modifier.height(4.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(HomeTealAccent.copy(alpha = 0.15f))
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = role.displayName,
                                    style = regularTextStyle(HomeTealAccent, 10.sp)
                                )
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = when {
                                !contact.clubName.isNullOrBlank() -> buildString {
                                    append(contact.clubName)
                                    contact.clubCountry?.takeIf { it.isNotBlank() }
                                        ?.let { append(" • $it") }
                                }

                                else -> "Without club"
                            },
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                    contact.clubLogo?.let { logo ->
                        Spacer(Modifier.width(8.dp))
                        AsyncImage(
                            model = logo,
                            contentDescription = null,
                            modifier = Modifier.size(28.dp),
                            contentScale = ContentScale.Fit
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    WhatsAppIcon(contact.phoneNumber ?: "")
                    Spacer(Modifier.width(4.dp))
                    IconButton(onClick = onEdit, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Default.Edit,
                            contentDescription = "Edit",
                            tint = HomeTextSecondary
                        )
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Delete",
                            tint = HomeRedAccent
                        )
                    }
                }
            }
        }
    }
}

private fun getRoleChipLabel(role: ContactRole): String = when (role) {
    ContactRole.UNKNOWN -> "Other"
    ContactRole.ASSISTANT_COACH -> "Asst Coach"
    ContactRole.SPORT_DIRECTOR -> "Sport Dir"
    ContactRole.BOARD_MEMBER -> "Board"
    else -> role.displayName
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEditContactBottomSheet(
    modifier: Modifier,
    initialContact: Contact?,
    pickedName: String,
    pickedPhone: String,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onPickContact: () -> Unit,
    onDismiss: () -> Unit,
    onSave: (Contact) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val clubSearch: ClubSearch = koinInject()

    var clubSearchQuery by remember(initialContact) {
        mutableStateOf(initialContact?.clubName ?: "")
    }

    var clubSearchResults by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    var isSearchingClubs by remember { mutableStateOf(false) }
    var selectedClub by remember(initialContact) {
        mutableStateOf(
            if (initialContact != null && !initialContact.clubName.isNullOrBlank())
                ClubSearchModel(
                    clubName = initialContact.clubName,
                    clubLogo = initialContact.clubLogo,
                    clubTmProfile = null,
                    clubCountry = initialContact.clubCountry,
                    clubCountryFlag = initialContact.clubCountryFlag
                )
            else null
        )
    }

    androidx.compose.runtime.LaunchedEffect(clubSearchQuery) {
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

    var selectedRole by remember(initialContact) {
        mutableStateOf(initialContact?.roleEnum ?: ContactRole.UNKNOWN)
    }

    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density

    ModalBottomSheet(
        sheetState = sheetState,
        modifier = modifier.height(screenHeight * 0.95f),
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = HomeDarkCard,
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
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp)
                .navigationBarsPadding()
        ) {
            Text(
                text = if (initialContact != null) "Edit contact" else "Add contact",
                style = boldTextStyle(HomeTextPrimary, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            HorizontalDivider(color = HomeDarkCardBorder, thickness = 1.dp)

            Spacer(Modifier.height(16.dp))

            // ── WHO section ──
            Text(
                text = "WHO",
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                modifier = Modifier.padding(bottom = 10.dp)
            )
            OutlinedCard(
                onClick = onPickContact,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.outlinedCardColors(containerColor = HomeTealAccent.copy(alpha = 0.15f)),
                border = BorderStroke(1.dp, HomeTealAccent)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = HomeTealAccent,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = "Import from phone contacts",
                        style = boldTextStyle(HomeTealAccent, 14.sp)
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "or enter manually",
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                modifier = Modifier.padding(bottom = 8.dp)
            )
            AddContactTextField(
                label = "Name",
                value = pickedName,
                onValueChange = onNameChange,
                placeholder = "Contact name",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            AddContactTextField(
                label = "Phone (optional)",
                value = pickedPhone,
                onValueChange = onPhoneChange,
                placeholder = "Contact number (including phone code)",
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))

            // ── ROLE section ──
            Text(
                text = "ROLE",
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                modifier = Modifier.padding(bottom = 10.dp)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ContactRole.entries.forEach { role ->
                    RoleChip(
                        label = getRoleChipLabel(role),
                        isSelected = selectedRole == role,
                        onClick = { selectedRole = role }
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // ── CLUB section ──
            Text(
                text = "CLUB",
                style = regularTextStyle(HomeTextSecondary, 11.sp),
                modifier = Modifier.padding(bottom = 10.dp)
            )
            OutlinedTextField(
                value = clubSearchQuery,
                onValueChange = {
                    clubSearchQuery = it
                    if (selectedClub != null && it != selectedClub?.clubName) selectedClub = null
                },
                placeholder = {
                    Text(
                        "Search club...",
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
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }
            )
            if (clubSearchResults.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 180.dp)
                        .padding(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(clubSearchResults) { clubItem ->
                        ClubSearchResultRow(
                            club = clubItem,
                            onClick = {
                                selectedClub = clubItem
                                clubSearchQuery = ""
                                clubSearchResults = emptyList()
                            }
                        )
                    }
                }
            }
            selectedClub?.let { club ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(HomeDarkBackground)
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    club.clubLogo?.let { logo ->
                        AsyncImage(
                            model = logo,
                            contentDescription = null,
                            modifier = Modifier.size(28.dp),
                            contentScale = ContentScale.Fit
                        )
                        Spacer(Modifier.width(10.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(club.clubName ?: "", style = boldTextStyle(HomeTextPrimary, 12.sp))
                        club.clubCountry?.let { c ->
                            Text(
                                c,
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                        }
                    }
                    TextButton(onClick = { selectedClub = null; clubSearchQuery = "" }) {
                        Text("Change", style = regularTextStyle(HomeTealAccent, 12.sp))
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // ── Actions ──
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Cancel", style = regularTextStyle(HomeTextSecondary, 14.sp))
                }
                Button(
                    onClick = {
                        if (pickedName.isNotBlank()) {
                            onSave(
                                Contact(
                                    id = initialContact?.id,
                                    name = pickedName.trim(),
                                    phoneNumber = pickedPhone.trim().takeIf { it.isNotBlank() },
                                    role = selectedRole.name,
                                    clubName = selectedClub?.clubName ?: clubSearchQuery.trim()
                                        .takeIf { it.isNotBlank() },
                                    clubCountry = selectedClub?.clubCountry,
                                    clubLogo = selectedClub?.clubLogo,
                                    clubCountryFlag = selectedClub?.clubCountryFlag
                                )
                            )
                        }
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent)
                ) {
                    Text(
                        if (initialContact != null) "Save" else "Add contact",
                        style = boldTextStyle(HomeDarkBackground, 14.sp)
                    )
                }
            }
        }
    }
}

@Composable
private fun RoleChip(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val bgColor = if (isSelected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent
    val textColor = if (isSelected) HomeTealAccent else HomeTextSecondary
    val borderColor = if (isSelected) HomeTealAccent else HomeDarkCardBorder

    Text(
        text = label,
        style = regularTextStyle(textColor, 12.sp),
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(20.dp))
            .clickWithNoRipple(onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddContactTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = label,
            style = regularTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.padding(bottom = 4.dp)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = {
                Text(
                    placeholder,
                    style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 14.sp)
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
    }
}
