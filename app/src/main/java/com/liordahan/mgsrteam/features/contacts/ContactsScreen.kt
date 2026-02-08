package com.liordahan.mgsrteam.features.contacts

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContactPage
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.models.ContactRole
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.playerinfo.WhatsAppIcon
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.ProgressIndicator
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.delay
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

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
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
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
                    style = boldTextStyle(contentDefault, 14.sp)
                )
                club.clubCountry?.let { country ->
                    Text(
                        text = country,
                        style = regularTextStyle(contentDefault, 12.sp)
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
    viewModel: IContactsViewModel = koinViewModel()
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
        containerColor = Color.White,
        topBar = {
            Surface(shadowElevation = 12.dp, color = Color.White) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp)
                ) {
                    TopAppBar(
                        title = {
                            Text(
                                text = "Worldwide Contacts",
                                style = boldTextStyle(contentDefault, 21.sp)
                            )
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                        actions = {
                            IconButton(onClick = {
                                editingContact = null
                                showAddEditSheet = true
                            }) {
                                Icon(Icons.Default.Add, contentDescription = "Add contact")
                            }
                        }
                    )
                    AnimatedVisibility(visible = state.contacts.isNotEmpty()) {
                        Column {
                            HorizontalDivider(
                                color = dividerColor,
                                thickness = 1.dp,
                                modifier = Modifier.padding(vertical = 16.dp)
                            )
                            AppTextField(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                textInput = searchContactInput,
                                hint = stringResource(R.string.contacts_screen_search_hint),
                                leadingIcon = Icons.Default.Search,
                                trailingIcon = ImageVector.vectorResource(R.drawable.ic_clear_search_button),
                                keyboardOptions = KeyboardOptions(
                                    imeAction = ImeAction.Done,
                                    keyboardType = KeyboardType.Text
                                ),
                                onTrailingIconClicked = {
                                    searchContactInput = TextFieldValue("")
                                    keyboardController?.hide()
                                    focusManager.clearFocus()
                                },
                                onValueChange = { searchContactInput = it }
                            )
                        }
                    }
                }
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    editingContact = null
                    showAddEditSheet = true
                },
                shape = RoundedCornerShape(16.dp),
                containerColor = contentDefault,
                contentColor = Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add contact")
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                state.isLoading -> {
                    Box(Modifier.fillMaxSize()) {
                        ProgressIndicator(Modifier.align(Alignment.Center))
                    }
                }

                state.contacts.isEmpty() -> {
                    EmptyState(
                        text = "No contacts yet\nAdd your first club contact",
                        optionalButtonText = "Add contact",
                        onResetFiltersClicked = { showAddEditSheet = true }
                    )
                }

                filteredContacts.isEmpty() -> {
                    EmptyState(
                        text = "No contacts found",
                        optionalButtonText = "Clear search",
                        onResetFiltersClicked = { searchContactInput = TextFieldValue("") }
                    )
                }

                else -> {
                    val listItems = remember(filteredContacts) {
                        buildContactsListGroupedByCountry(filteredContacts)
                    }
                    LazyColumn(
                        contentPadding = PaddingValues(
                            top = 16.dp,
                            bottom = 88.dp,
                            start = 12.dp,
                            end = 12.dp
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
                            style = boldTextStyle(contentDefault, 18.sp)
                        )
                    },
                    text = {
                        Text(
                            "Delete ${contact.name ?: "this contact"}?",
                            style = regularTextStyle(contentDefault, 14.sp)
                        )
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                viewModel.deleteContact(contact.id!!)
                                contactToDelete = null
                            }
                        ) {
                            Text("Delete", style = boldTextStyle(Color.White, 14.sp))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { contactToDelete = null }) {
                            Text("Cancel", style = regularTextStyle(contentDefault, 14.sp))
                        }
                    }
                )
            }
        }
    }
}

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

            AsyncImage(
                model = countryFlagUrl,
                contentDescription = null,
                modifier = Modifier.size(width = 40.dp, height = 20.dp),
                contentScale = ContentScale.Fit
            )

            Spacer(Modifier.width(4.dp))
        }

        Text(
            text = country,
            style = boldTextStyle(contentDefault, 14.sp)
        )
    }
}

@Composable
private fun ContactCard(
    contact: Contact,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickWithNoRipple { },
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
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
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = contact.name ?: "",
                        style = boldTextStyle(contentDefault, 16.sp)
                    )
                    contact.roleEnum?.let { role ->
                        Text(
                            text = role.displayName,
                            style = regularTextStyle(contentDefault, 12.sp)
                        )
                    }
                    if (!contact.clubName.isNullOrBlank()) {
                        Text(
                            text = buildString {
                                append(contact.clubName)
                                contact.clubCountry?.takeIf { it.isNotBlank() }
                                    ?.let { append(" • $it") }
                            },
                            style = regularTextStyle(contentDefault, 12.sp)
                        )
                    } else {
                        Text(
                            text = "Without club",
                            style = regularTextStyle(contentDefault, 12.sp)
                        )
                    }

                    contact.phoneNumber?.takeIf { it.isNotBlank() }?.let { phone ->
                        Text(
                            text = phone,
                            style = regularTextStyle(contentDefault, 12.sp)
                        )
                    }
                }

                WhatsAppIcon(contact.phoneNumber ?: "")

                Spacer(Modifier.width(4.dp))

                IconButton(onClick = onEdit) {
                    Icon(
                        Icons.Default.Edit,
                        contentDescription = "Edit",
                        tint = contentDefault
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Delete",
                        tint = contentDefault
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEditContactBottomSheet(
    modifier: Modifier,
    initialContact: Contact?,
    pickedName: String,
    pickedPhone: String,
    onPickContact: () -> Unit,
    onDismiss: () -> Unit,
    onSave: (Contact) -> Unit
) {

    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true
    )

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

    var expandedRole by remember { mutableStateOf(false) }
    var selectedRole by remember(initialContact) {
        mutableStateOf(initialContact?.roleEnum ?: ContactRole.UNKNOWN)
    }

    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density

    ModalBottomSheet(
        sheetState = sheetState,
        modifier = modifier.height(screenHeight * 0.75f),
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = Color.White,
        tonalElevation = 8.dp,
        dragHandle = null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp)
        ) {
            Text(
                text = if (initialContact != null) "Edit contact" else "Add contact",
                style = boldTextStyle(contentDefault, 20.sp),
                modifier = Modifier.padding(vertical = 8.dp)
            )
            HorizontalDivider(color = dividerColor, thickness = 1.dp)

            Spacer(Modifier.height(16.dp))

            OutlinedCard(
                onClick = onPickContact,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.outlinedCardColors()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.ContactPage,
                        contentDescription = null,
                        tint = contentDefault,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = "Contact",
                            style = boldTextStyle(contentDefault, 14.sp)
                        )
                        Text(
                            text = when {
                                pickedName.isNotBlank() && pickedPhone.isNotBlank() -> "$pickedName • $pickedPhone"
                                pickedName.isNotBlank() -> pickedName
                                pickedPhone.isNotBlank() -> pickedPhone
                                else -> "Tap to select from phone contacts"
                            },
                            style = regularTextStyle(contentDefault, 14.sp)
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            ExposedDropdownMenuBox(
                expanded = expandedRole,
                onExpandedChange = { expandedRole = it }
            ) {
                OutlinedTextField(
                    value = selectedRole.displayName,
                    onValueChange = {},
                    readOnly = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    label = { Text("Role") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedRole) },
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                )
                ExposedDropdownMenu(
                    expanded = expandedRole,
                    containerColor = Color.White,
                    onDismissRequest = { expandedRole = false }
                ) {
                    ContactRole.entries.forEach { role ->
                        DropdownMenuItem(
                            text = { Text(role.displayName) },
                            onClick = {
                                selectedRole = role
                                expandedRole = false
                            }
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            Text(
                text = "Club",
                style = boldTextStyle(contentDefault, 14.sp),
                modifier = Modifier.padding(bottom = 4.dp)
            )
            OutlinedTextField(
                value = clubSearchQuery,
                onValueChange = {
                    clubSearchQuery = it
                    if (selectedClub != null && it != selectedClub?.clubName) selectedClub = null
                },
                placeholder = {
                    Text(
                        "Start typing club name...",
                        style = regularTextStyle(contentDefault, 14.sp)
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                trailingIcon = {
                    if (isSearchingClubs) {
                        Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) {
                            ProgressIndicator(Modifier.size(24.dp))
                        }
                    }
                }
            )
            if (clubSearchResults.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 200.dp)
                        .padding(vertical = 4.dp),
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
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    club.clubLogo?.let { logo ->
                        AsyncImage(
                            model = logo,
                            contentDescription = null,
                            modifier = Modifier.size(28.dp),
                            contentScale = ContentScale.Fit
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(club.clubName ?: "", style = boldTextStyle(contentDefault, 12.sp))
                        club.clubCountry?.let { c ->
                            Text(
                                c,
                                style = regularTextStyle(contentDefault, 11.sp)
                            )
                        }
                    }
                    TextButton(onClick = { selectedClub = null; clubSearchQuery = "" }) {
                        Text("Change", style = regularTextStyle(contentDefault, 12.sp))
                    }
                }
            }
            Spacer(Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                androidx.compose.material3.TextButton(onClick = onDismiss) {
                    Text("Cancel", style = regularTextStyle(contentDefault, 14.sp))
                }
                Spacer(Modifier.width(8.dp))
                androidx.compose.material3.Button(
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
                    shape = RoundedCornerShape(500.dp)
                ) {
                    Text(
                        if (initialContact != null) "Save" else "Add",
                        style = boldTextStyle(Color.White, 14.sp)
                    )
                }
            }
        }
    }
}
