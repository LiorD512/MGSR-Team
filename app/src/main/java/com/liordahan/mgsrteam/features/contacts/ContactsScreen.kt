package com.liordahan.mgsrteam.features.contacts

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.content.ContentUris
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.rememberNestedScrollInteropConnection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.models.ContactRole
import com.liordahan.mgsrteam.features.contacts.models.ContactType
import com.liordahan.mgsrteam.features.contacts.playersForAgencyContact
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.playerinfo.WhatsAppIcon
import com.liordahan.mgsrteam.features.contacts.agency.AgencyDiscoveryService
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import com.liordahan.mgsrteam.ui.components.DarkSystemBarsForBottomSheet
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.components.SkeletonContactList
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

private fun getContactId(context: android.content.Context, contactUri: Uri): String? {
    // Try parseId first (works for content://.../contacts/ID)
    try {
        val id = ContentUris.parseId(contactUri)
        return id.toString()
    } catch (_: Exception) { /* not a content ID URI */ }
    // Direct query (works for content://.../contacts/ID)
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
    // Fallback: resolve lookup URI (content://.../contacts/lookup/0rXXX/ID)
    val resolved = try {
        ContactsContract.Contacts.lookupContact(context.contentResolver, contactUri)
    } catch (_: Exception) { null }
    resolved?.lastPathSegment?.let { id ->
        if (id.all { it.isDigit() }) return id
    }
    return null
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
    // Fallback: resolve lookup URI then query
    val resolved = try {
        ContactsContract.Contacts.lookupContact(context.contentResolver, contactUri)
    } catch (_: Exception) { null }
    resolved?.let { uri ->
        context.contentResolver.query(uri, arrayOf(ContactsContract.Contacts.DISPLAY_NAME), null, null, null)
            ?.use { c -> if (c.moveToFirst()) return c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME)) }
    }
    return null
}

private fun getPhoneNumberFromContactUri(
    context: android.content.Context,
    contactUri: Uri
): String? {
    val contactId = getContactId(context, contactUri) ?: return null
    context.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
        "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
        arrayOf(contactId),
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
        .groupBy { it.displayCountry?.takeIf { c -> c.isNotBlank() } ?: otherLabel }
    val sortedCountries =
        grouped.keys.sortedBy { if (it == otherLabel) "\uFFFF" else it.lowercase() }
    return sortedCountries.flatMap { country ->
        val list = grouped[country]!!.sortedBy { it.displayOrganization?.lowercase() ?: "" }
        val flagUrl = list.firstOrNull()?.clubCountryFlag
        listOf(
            ContactListItem.CountryHeader(
                country,
                flagUrl
            )
        ) + list.map { ContactListItem.ContactRow(it) }
    }
}

private data class CountryGroup(val country: String, val flagUrl: String?, val contacts: List<Contact>)

private fun buildContactsGroupedByCountry(contacts: List<Contact>): List<CountryGroup> {
    val otherLabel = "Other"
    val grouped = contacts
        .groupBy { it.displayCountry?.takeIf { c -> c.isNotBlank() } ?: otherLabel }
    val sortedCountries =
        grouped.keys.sortedBy { if (it == otherLabel) "\uFFFF" else it.lowercase() }
    return sortedCountries.map { country ->
        val list = grouped[country]!!.sortedBy { it.displayOrganization?.lowercase() ?: "" }
        val flagUrl = list.firstOrNull()?.clubCountryFlag
        CountryGroup(country, flagUrl, list)
    }
}

private fun getCountryChipsFromContacts(contacts: List<Contact>): List<String> {
    val otherLabel = "Other"
    val byCountry = contacts
        .groupBy { it.displayCountry?.takeIf { c -> c.isNotBlank() } ?: otherLabel }
    return byCountry.keys
        .sortedBy { if (it == otherLabel) "\uFFFF" else it.lowercase() }
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
    var selectedCountryFilter by rememberSaveable { mutableStateOf<String?>(null) }

    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    var selectedTab by rememberSaveable { mutableStateOf(ContactType.CLUB) }
    val tabContacts = remember(state.contacts, selectedTab) {
        state.contacts.filter { it.contactTypeEnum == selectedTab }
    }
    val searchQuery = searchContactInput.text.trim()
    val filteredContacts = remember(tabContacts, searchQuery, selectedTab) {
        if (searchQuery.isBlank()) tabContacts
        else when (selectedTab) {
            ContactType.AGENCY -> tabContacts.filter { contact ->
                contact.name?.contains(searchQuery, ignoreCase = true) == true
            }
            else -> tabContacts.filter { contact ->
                contact.name?.contains(searchQuery, ignoreCase = true) == true ||
                        contact.clubName?.contains(searchQuery, ignoreCase = true) == true ||
                        contact.clubCountry?.contains(searchQuery, ignoreCase = true) == true
            }
        }
    }
    val countryFilteredContacts = remember(filteredContacts, selectedCountryFilter, selectedTab) {
        if (selectedTab == ContactType.AGENCY) filteredContacts
        else if (selectedCountryFilter == null) filteredContacts
        else filteredContacts.filter {
            (it.displayCountry?.takeIf { c -> c.isNotBlank() } ?: "Other") == selectedCountryFilter
        }
    }
    val countryChips = remember(tabContacts) {
        getCountryChipsFromContacts(tabContacts)
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
                    contentDescription = stringResource(R.string.contacts_add),
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

                ContactsTabBar(
                    selectedTab = selectedTab,
                    clubCount = state.contacts.count { it.contactTypeEnum == ContactType.CLUB },
                    agencyCount = state.contacts.count { it.contactTypeEnum == ContactType.AGENCY },
                    onTabSelected = { selectedTab = it }
                )

                when {
                    state.isLoading -> {
                        SkeletonContactList(modifier = Modifier.fillMaxSize())
                    }

                    tabContacts.isEmpty() -> {
                        ContactsStatsStrip(
                            total = 0,
                            countries = 0,
                            showCountries = selectedTab != ContactType.AGENCY
                        )
                        ContactsSearchBar(
                            query = searchContactInput.text,
                            onQueryChange = { searchContactInput = TextFieldValue(it) },
                            onClear = {
                                searchContactInput = TextFieldValue("")
                                keyboardController?.hide()
                                focusManager.clearFocus()
                            },
                            searchHint = if (selectedTab == ContactType.AGENCY) R.string.contacts_search_name_hint else R.string.contacts_screen_search_hint
                        )
                        ContactsEmptyState(
                            title = when (selectedTab) {
                                ContactType.CLUB -> stringResource(R.string.contacts_empty_club)
                                ContactType.AGENCY -> stringResource(R.string.contacts_empty_agency)
                            },
                            subtitle = when (selectedTab) {
                                ContactType.CLUB -> stringResource(R.string.contacts_empty_club_hint)
                                ContactType.AGENCY -> stringResource(R.string.contacts_empty_agency_hint)
                            },
                            buttonText = when (selectedTab) {
                                ContactType.CLUB -> stringResource(R.string.contacts_add_club_contact)
                                ContactType.AGENCY -> stringResource(R.string.contacts_add_agency_contact)
                            },
                            onAddContact = { showAddEditSheet = true }
                        )
                    }

                    filteredContacts.isEmpty() -> {
                        ContactsStatsStrip(
                            total = tabContacts.size,
                            countries = tabContacts.map {
                                it.displayCountry?.takeIf { c -> c.isNotBlank() } ?: "Other"
                            }.toSet().size,
                            showCountries = selectedTab != ContactType.AGENCY
                        )
                        ContactsSearchBar(
                            query = searchContactInput.text,
                            onQueryChange = { searchContactInput = TextFieldValue(it) },
                            onClear = {
                                searchContactInput = TextFieldValue("")
                                keyboardController?.hide()
                                focusManager.clearFocus()
                            },
                            searchHint = if (selectedTab == ContactType.AGENCY) R.string.contacts_search_name_hint else R.string.contacts_screen_search_hint
                        )
                        ContactsEmptyState(
                            title = stringResource(R.string.contacts_no_contacts_found),
                            subtitle = stringResource(R.string.contacts_try_different_search),
                            buttonText = stringResource(R.string.contacts_clear_search),
                            onButtonClick = { searchContactInput = TextFieldValue("") }
                        )
                    }

                    countryFilteredContacts.isEmpty() -> {
                        ContactsStatsStrip(
                            total = filteredContacts.size,
                            countries = filteredContacts.map {
                                it.displayCountry?.takeIf { c -> c.isNotBlank() } ?: "Other"
                            }.toSet().size,
                            showCountries = selectedTab != ContactType.AGENCY
                        )
                        ContactsSearchBar(
                            query = searchContactInput.text,
                            onQueryChange = { searchContactInput = TextFieldValue(it) },
                            onClear = {
                                searchContactInput = TextFieldValue("")
                                keyboardController?.hide()
                                focusManager.clearFocus()
                            },
                            searchHint = if (selectedTab == ContactType.AGENCY) R.string.contacts_search_name_hint else R.string.contacts_screen_search_hint
                        )
                        if (selectedTab != ContactType.AGENCY) {
                            ContactsFilterChips(
                                countries = countryChips,
                                selectedCountry = selectedCountryFilter,
                                onCountrySelected = { selectedCountryFilter = it },
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                            )
                        }
                        ContactsEmptyState(
                            title = stringResource(R.string.contacts_no_contacts_found),
                            subtitle = stringResource(R.string.contacts_try_different_search),
                            buttonText = stringResource(R.string.contacts_filter_all),
                            onButtonClick = { selectedCountryFilter = null }
                        )
                    }

                    else -> {
                        val uniqueCountries = countryFilteredContacts.map {
                            it.displayCountry?.takeIf { c -> c.isNotBlank() } ?: "Other"
                        }.toSet().size
                        ContactsStatsStrip(
                            total = countryFilteredContacts.size,
                            countries = uniqueCountries,
                            showCountries = selectedTab != ContactType.AGENCY
                        )
                        ContactsSearchBar(
                            query = searchContactInput.text,
                            onQueryChange = { searchContactInput = TextFieldValue(it) },
                            onClear = {
                                searchContactInput = TextFieldValue("")
                                keyboardController?.hide()
                                focusManager.clearFocus()
                            },
                            searchHint = if (selectedTab == ContactType.AGENCY) R.string.contacts_search_name_hint else R.string.contacts_screen_search_hint
                        )
                        if (selectedTab != ContactType.AGENCY) {
                            ContactsFilterChips(
                                countries = countryChips,
                                selectedCountry = selectedCountryFilter,
                                onCountrySelected = { selectedCountryFilter = it },
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                            )
                        }
                        val isAgencyTab = selectedTab == ContactType.AGENCY
                        val agencyContacts = if (isAgencyTab) countryFilteredContacts.sortedBy { it.name?.lowercase() ?: "" } else null
                        val showGroupedByCountry = !isAgencyTab && selectedCountryFilter == null
                        val grouped = remember(countryFilteredContacts, showGroupedByCountry) {
                            if (showGroupedByCountry) buildContactsGroupedByCountry(countryFilteredContacts)
                            else null
                        }
                        val flatContacts = remember(countryFilteredContacts, showGroupedByCountry, isAgencyTab) {
                            if (isAgencyTab) null
                            else if (!showGroupedByCountry) countryFilteredContacts.sortedBy {
                                it.displayOrganization?.lowercase() ?: ""
                            } else null
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
                            if (isAgencyTab && agencyContacts != null) {
                                items(
                                    items = agencyContacts,
                                    key = { it.id ?: it.name ?: "" }
                                ) { contact ->
                                    AgencyContactCard(
                                        contact = contact,
                                        players = playersForAgencyContact(contact, state.players),
                                        onEdit = {
                                            editingContact = contact
                                            showAddEditSheet = true
                                        },
                                        onDelete = { contactToDelete = contact },
                                        onOpenTransfermarkt = {
                                            contact.agencyUrl?.takeIf { u -> u.isNotBlank() }?.let { url ->
                                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                                try { context.startActivity(intent) }
                                                catch (_: ActivityNotFoundException) { }
                                            }
                                        },
                                        onPlayerClick = { player ->
                                            player.tmProfile?.let { url ->
                                                navController.navigate("${com.liordahan.mgsrteam.navigation.Screens.PlayerInfoScreen.route}/${android.net.Uri.encode(url)}")
                                            }
                                        }
                                    )
                                }
                            } else if (showGroupedByCountry && grouped != null) {
                                grouped.forEach { group ->
                                    item(key = "header_${group.country}") {
                                        CountrySectionHeader(
                                            country = group.country,
                                            countryFlagUrl = group.flagUrl
                                        )
                                    }
                                    items(
                                        items = group.contacts,
                                        key = { it.id ?: it.name ?: "" }
                                    ) { contact ->
                                        ContactCard(
                                            contact = contact,
                                            onEdit = {
                                                editingContact = contact
                                                showAddEditSheet = true
                                            },
                                            onDelete = { contactToDelete = contact }
                                        )
                                    }
                                }
                            } else if (!showGroupedByCountry && flatContacts != null) {
                                items(
                                    items = flatContacts,
                                    key = { it.id ?: it.name ?: "" }
                                ) { contact ->
                                    ContactCard(
                                        contact = contact,
                                        onEdit = {
                                            editingContact = contact
                                            showAddEditSheet = true
                                        },
                                        onDelete = { contactToDelete = contact }
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
                        try {
                            val name = getContactNameFromUri(context, uri)
                            if (!name.isNullOrBlank()) pickedName = name
                            try {
                                val phone = getPhoneNumberFromContactUri(context, uri)
                                if (!phone.isNullOrBlank()) pickedPhone = phone
                                else if (!name.isNullOrBlank()) ToastManager.showInfo(context.getString(R.string.contacts_import_no_phone))
                            } catch (_: Exception) {
                                if (!name.isNullOrBlank()) ToastManager.showInfo(context.getString(R.string.contacts_import_no_phone))
                            }
                            if (name.isNullOrBlank() && pickedPhone.isBlank()) ToastManager.showError(context.getString(R.string.contacts_import_error))
                        } catch (e: Exception) {
                            android.util.Log.e("ContactsScreen", "Contact picker failed", e)
                            ToastManager.showError(context.getString(R.string.contacts_import_error))
                        }
                    }
                }
                val permissionLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestPermission()
                ) { isGranted ->
                    if (isGranted) contactPickerLauncher.launch(null)
                    else ToastManager.showError(context.getString(R.string.contacts_permission_denied))
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
                            stringResource(R.string.contacts_delete_title),
                            style = boldTextStyle(HomeTextPrimary, 18.sp)
                        )
                    },
                    text = {
                        Text(
                            stringResource(R.string.contacts_delete_confirm, contact.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.contacts_this_contact)),
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
                            Text(stringResource(R.string.contacts_delete), style = boldTextStyle(Color.White, 14.sp))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { contactToDelete = null }) {
                            Text(stringResource(R.string.cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
                        }
                    },
                    containerColor = HomeDarkCard
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONTACTS TAB BAR
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactsTabBar(
    selectedTab: ContactType,
    clubCount: Int,
    agencyCount: Int,
    onTabSelected: (ContactType) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        TabChip(
            label = stringResource(R.string.contacts_tab_club),
            count = clubCount,
            selected = selectedTab == ContactType.CLUB,
            onClick = { onTabSelected(ContactType.CLUB) },
            modifier = Modifier.weight(1f)
        )
        TabChip(
            label = stringResource(R.string.contacts_tab_agency),
            count = agencyCount,
            selected = selectedTab == ContactType.AGENCY,
            onClick = { onTabSelected(ContactType.AGENCY) },
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun TabChip(
    label: String,
    count: Int,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) HomeTealAccent.copy(alpha = 0.2f) else HomeDarkCard,
        border = BorderStroke(
            width = 1.dp,
            color = if (selected) HomeTealAccent else HomeDarkCardBorder
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Text(
                text = "$label ($count)",
                style = regularTextStyle(
                    color = if (selected) HomeTealAccent else HomeTextSecondary,
                    fontSize = 14.sp
                )
            )
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
                text = stringResource(R.string.contacts_title),
                style = boldTextStyle(HomeTextPrimary, 26.sp)
            )
            Text(
                text = stringResource(R.string.contacts_subtitle),
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
                contentDescription = stringResource(R.string.contacts_add),
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
    countries: Int,
    showCountries: Boolean = true
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
            label = stringResource(R.string.players_stat_total),
            accentColor = HomeTealAccent,
            modifier = Modifier.weight(1f)
        )
        if (showCountries) {
            ContactsStatsStripDivider()
            ContactsStatItem(
                value = countries.toString(),
                label = stringResource(R.string.contacts_stat_countries),
                accentColor = HomeBlueAccent,
                modifier = Modifier.weight(1f)
            )
        }
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
//  FILTER CHIPS
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactsFilterChips(
    countries: List<String>,
    selectedCountry: String?,
    onCountrySelected: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    if (countries.isEmpty()) return
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(vertical = 4.dp)
    ) {
        item(key = "all") {
            FilterChip(
                label = stringResource(R.string.contacts_filter_all),
                selected = selectedCountry == null,
                onClick = { onCountrySelected(null) }
            )
        }
        items(countries, key = { it }) { country ->
            FilterChip(
                label = country,
                selected = selectedCountry == country,
                onClick = { onCountrySelected(country) }
            )
        }
    }
}

@Composable
private fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        color = if (selected) HomeTealAccent.copy(alpha = 0.2f) else Color.Transparent,
        border = BorderStroke(
            width = 1.dp,
            color = if (selected) HomeTealAccent else HomeDarkCardBorder
        )
    ) {
        Text(
            text = label,
            style = regularTextStyle(
                color = if (selected) HomeTealAccent else HomeTextSecondary,
                fontSize = 12.sp
            ),
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SEARCH BAR
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun ContactsSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    searchHint: Int = R.string.contacts_screen_search_hint
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
                text = stringResource(searchHint),
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
                    contentDescription = stringResource(R.string.contacts_clear),
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
    val layoutDirection = LocalLayoutDirection.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(HomeDarkBackground)
            .drawBehind {
                val barWidth = 4.dp.toPx()
                val x = when (layoutDirection) {
                    LayoutDirection.Rtl -> size.width - barWidth
                    LayoutDirection.Ltr -> 0f
                }
                drawRect(
                    color = HomeTealAccent,
                    topLeft = Offset(x, 0f),
                    size = Size(barWidth, size.height)
                )
            }
            .padding(
                start = if (layoutDirection == LayoutDirection.Ltr) 4.dp else 16.dp,
                end = if (layoutDirection == LayoutDirection.Rtl) 4.dp else 16.dp,
                top = 12.dp,
                bottom = 12.dp
            ),
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ContactCard(
    contact: Contact,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        val layoutDirection = LocalLayoutDirection.current
        Box(modifier = Modifier.fillMaxWidth()) {
            Row(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClick = { },
                    onLongClick = { showMenu = true }
                )
                .drawBehind {
                    val barWidth = 3.dp.toPx()
                    val x = when (layoutDirection) {
                        LayoutDirection.Rtl -> size.width - barWidth
                        LayoutDirection.Ltr -> 0f
                    }
                    val accentColor = when (contact.contactTypeEnum) {
                        ContactType.AGENCY -> HomeBlueAccent
                        ContactType.CLUB -> HomeTealAccent
                    }
                    drawRect(
                        color = accentColor,
                        topLeft = Offset(x, 0f),
                        size = Size(barWidth, size.height)
                    )
                }
                .padding(start = 3.dp)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder)
                    .border(2.dp, HomeDarkCardBorder, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                contact.clubLogo?.let { logo ->
                    AsyncImage(
                        model = logo,
                        contentDescription = null,
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(CircleShape),
                        contentScale = ContentScale.Fit
                    )
                } ?: run {
                    Text(
                        text = getInitialsFromName(contact.name),
                        style = boldTextStyle(HomeTextSecondary, 12.sp)
                    )
                }
            }

            Spacer(Modifier.width(10.dp))

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 8.dp),
                horizontalAlignment = Alignment.Start
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = contact.name ?: "",
                        style = boldTextStyle(HomeTextPrimary, 13.sp)
                    )
                    contact.roleEnum?.let { role ->
                        val roleAccent = when (contact.contactTypeEnum) {
                            ContactType.AGENCY -> HomeBlueAccent
                            ContactType.CLUB -> HomeTealAccent
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(roleAccent.copy(alpha = 0.15f))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = getRoleDisplayLabel(role),
                                style = regularTextStyle(roleAccent, 10.sp)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    text = when {
                        !contact.displayOrganization.isNullOrBlank() -> buildString {
                            append(contact.displayOrganization)
                            contact.displayCountry?.takeIf { it.isNotBlank() }
                                ?.let { append(" • $it") }
                        }
                        contact.contactTypeEnum == ContactType.AGENCY -> stringResource(R.string.contacts_without_agency)
                        else -> stringResource(R.string.contacts_without_club)
                    },
                    style = regularTextStyle(HomeTextSecondary, 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Box(
                modifier = Modifier.size(20.dp),
                contentAlignment = Alignment.Center
            ) {
                WhatsAppIcon(contact.phoneNumber ?: "")
            }
        }

            DropdownMenu(
                expanded = showMenu,
                onDismissRequest = { showMenu = false },
                containerColor = HomeDarkCard
            ) {
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Edit,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                                tint = HomeTextPrimary
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                stringResource(R.string.contacts_edit),
                                style = regularTextStyle(HomeTextPrimary, 14.sp)
                            )
                        }
                    },
                    onClick = {
                        showMenu = false
                        onEdit()
                    }
                )
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                                tint = HomeRedAccent
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                stringResource(R.string.contacts_delete),
                                style = regularTextStyle(HomeRedAccent, 14.sp)
                            )
                        }
                    },
                    onClick = {
                        showMenu = false
                        onDelete()
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AgencyContactCard(
    contact: Contact,
    players: List<Player>,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onOpenTransfermarkt: () -> Unit,
    onPlayerClick: (Player) -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf(false) }
    val layoutDirection = LocalLayoutDirection.current

    Box(modifier = Modifier.fillMaxWidth()) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    val barWidth = 3.dp.toPx()
                    val x = when (layoutDirection) {
                        LayoutDirection.Rtl -> size.width - barWidth
                        LayoutDirection.Ltr -> 0f
                    }
                    drawRect(
                        color = HomeBlueAccent,
                        topLeft = Offset(x, 0f),
                        size = Size(barWidth, size.height)
                    )
                }
                .padding(start = 3.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .combinedClickable(
                        onClick = { expanded = !expanded },
                        onLongClick = { showMenu = true }
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(HomeBlueAccent.copy(alpha = 0.2f))
                        .border(2.dp, HomeBlueAccent.copy(alpha = 0.5f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = getInitialsFromName(contact.name),
                        style = boldTextStyle(HomeBlueAccent, 12.sp)
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = contact.name ?: "",
                        style = boldTextStyle(HomeTextPrimary, 13.sp)
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = contact.displayOrganization?.takeIf { it.isNotBlank() }
                            ?: stringResource(R.string.contacts_without_agency),
                        style = regularTextStyle(HomeTextSecondary, 11.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (players.isNotEmpty()) {
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = stringResource(R.string.contacts_agency_players_count, players.size),
                            style = regularTextStyle(HomeBlueAccent, 11.sp)
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (contact.agencyUrl?.isNotBlank() == true) {
                        IconButton(
                            onClick = { onOpenTransfermarkt() },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.OpenInNew,
                                contentDescription = stringResource(R.string.contacts_open_transfermarkt),
                                tint = HomeBlueAccent,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    WhatsAppIcon(contact.phoneNumber ?: "")
                    Icon(
                        imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        tint = HomeTextSecondary,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
            AnimatedVisibility(visible = expanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 0.dp)
                        .padding(bottom = 12.dp)
                ) {
                    HorizontalDivider(color = HomeDarkCardBorder, thickness = 1.dp)
                    Spacer(Modifier.height(8.dp))
                    if (players.isEmpty()) {
                        Text(
                            text = stringResource(R.string.contacts_agency_no_players),
                            style = regularTextStyle(HomeTextSecondary, 12.sp),
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    } else {
                        players.forEach { player ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickWithNoRipple { onPlayerClick(player) }
                                    .padding(vertical = 6.dp, horizontal = 8.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(HomeDarkBackground)
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                player.profileImage?.let { img ->
                                    AsyncImage(
                                        model = img,
                                        contentDescription = null,
                                        modifier = Modifier
                                            .size(28.dp)
                                            .clip(CircleShape),
                                        contentScale = ContentScale.Crop
                                    )
                                    Spacer(Modifier.width(10.dp))
                                } ?: run {
                                    Box(
                                        modifier = Modifier
                                            .size(28.dp)
                                            .clip(CircleShape)
                                            .background(HomeDarkCardBorder),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = getInitialsFromName(player.fullName),
                                            style = boldTextStyle(HomeTextSecondary, 10.sp)
                                        )
                                    }
                                    Spacer(Modifier.width(10.dp))
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = player.fullName ?: "",
                                        style = boldTextStyle(HomeTextPrimary, 13.sp)
                                    )
                                    player.positions?.filterNotNull()?.take(2)?.joinToString(", ")?.let { pos ->
                                        Text(
                                            text = pos,
                                            style = regularTextStyle(HomeTextSecondary, 11.sp)
                                        )
                                    }
                                }
                                player.marketValue?.takeIf { it.isNotBlank() }?.let { value ->
                                    Text(
                                        text = value,
                                        style = boldTextStyle(HomeTealAccent, 11.sp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = HomeDarkCard
        ) {
            DropdownMenuItem(
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp), tint = HomeTextPrimary)
                        Spacer(Modifier.width(12.dp))
                        Text(stringResource(R.string.contacts_edit), style = regularTextStyle(HomeTextPrimary, 14.sp))
                    }
                },
                onClick = { showMenu = false; onEdit() }
            )
            DropdownMenuItem(
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp), tint = HomeRedAccent)
                        Spacer(Modifier.width(12.dp))
                        Text(stringResource(R.string.contacts_delete), style = regularTextStyle(HomeRedAccent, 14.sp))
                    }
                },
                onClick = { showMenu = false; onDelete() }
            )
        }
    }
}

@Composable
private fun getRoleDisplayLabel(role: ContactRole): String = when (role) {
    ContactRole.UNKNOWN -> stringResource(R.string.contact_role_other)
    ContactRole.COACH -> stringResource(R.string.contact_role_coach)
    ContactRole.ASSISTANT_COACH -> stringResource(R.string.contact_role_asst_coach)
    ContactRole.SPORT_DIRECTOR -> stringResource(R.string.contact_role_sport_dir)
    ContactRole.BOARD_MEMBER -> stringResource(R.string.contact_role_board)
    ContactRole.CEO -> stringResource(R.string.contact_role_ceo)
    ContactRole.PRESIDENT -> stringResource(R.string.contact_role_president)
    ContactRole.SCOUT -> stringResource(R.string.contact_role_scout)
    ContactRole.AGENT -> stringResource(R.string.contact_role_agent)
    ContactRole.INTERMEDIARY -> stringResource(R.string.contact_role_intermediary)
    ContactRole.AGENCY_DIRECTOR -> stringResource(R.string.contact_role_agency_dir)
}

private val clubRoles = listOf(
    ContactRole.UNKNOWN, ContactRole.COACH, ContactRole.ASSISTANT_COACH,
    ContactRole.SPORT_DIRECTOR, ContactRole.CEO, ContactRole.BOARD_MEMBER,
    ContactRole.PRESIDENT, ContactRole.SCOUT
)
private val agencyRoles = listOf(
    ContactRole.UNKNOWN, ContactRole.AGENT, ContactRole.INTERMEDIARY,
    ContactRole.AGENCY_DIRECTOR, ContactRole.SCOUT
)

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
    val agencyDiscovery: AgencyDiscoveryService = koinInject()
    val isEdit = initialContact != null

    var selectedContactType by remember(initialContact) {
        mutableStateOf<ContactType?>(initialContact?.contactTypeEnum)
    }

    var clubSearchQuery by remember(initialContact) {
        mutableStateOf(
            if (initialContact != null && !initialContact.clubName.isNullOrBlank()) ""
            else initialContact?.clubName ?: ""
        )
    }

    var agencyName by remember(initialContact) {
        mutableStateOf(initialContact?.agencyName ?: "")
    }
    var agencyCountry by remember(initialContact) {
        mutableStateOf(initialContact?.agencyCountry ?: "")
    }
    var agencyUrl by remember(initialContact) {
        mutableStateOf(initialContact?.agencyUrl ?: "")
    }
    var isDiscoveringAgency by remember { mutableStateOf(false) }
    var discoveryError by remember { mutableStateOf<String?>(null) }

    var clubSearchResults by remember { mutableStateOf<List<ClubSearchModel>>(emptyList()) }
    val clubSearchFocusRequester = remember { FocusRequester() }
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

    androidx.compose.runtime.LaunchedEffect(clubSearchQuery, selectedClub) {
        if (selectedClub != null) {
            clubSearchResults = emptyList()
            return@LaunchedEffect
        }
        if (clubSearchQuery.length < 2) {
            clubSearchResults = emptyList()
            return@LaunchedEffect
        }
        delay(250)
        isSearchingClubs = true

        clubSearchResults = when (val result = clubSearch.getClubSearchResults(clubSearchQuery)) {
            is TransfermarktResult.Success -> result.data
            is TransfermarktResult.Failed -> emptyList()
        }
        isSearchingClubs = false
    }

    androidx.compose.runtime.LaunchedEffect(pickedName, selectedContactType, isEdit) {
        if (isEdit || selectedContactType != ContactType.AGENCY) return@LaunchedEffect
        val name = pickedName.trim()
        if (name.length < 2) return@LaunchedEffect
        try {
            isDiscoveringAgency = true
            discoveryError = null
            agencyDiscovery.discoverAgencyForPerson(name)
                .onSuccess { discovered ->
                    discovered?.let {
                        agencyName = it.agencyName
                        agencyUrl = it.agencyUrl
                        agencyCountry = it.agencyCountry ?: agencyCountry
                        it.personNameOnTransfermarkt?.takeIf { n -> n.isNotBlank() && n != pickedName.trim() }
                            ?.let { tmName -> onNameChange(tmName) }
                    }
                }
                .onFailure { e ->
                    discoveryError = e.message ?: "Search failed"
                }
        } finally {
            isDiscoveringAgency = false
        }
    }

    val rolesForType = when (selectedContactType) {
        ContactType.AGENCY -> agencyRoles
        else -> clubRoles
    }
    var selectedRole by remember(initialContact, selectedContactType) {
        val initial = initialContact?.roleEnum ?: ContactRole.UNKNOWN
        val valid = if (selectedContactType == ContactType.AGENCY) agencyRoles else clubRoles
        mutableStateOf(if (initial in valid) initial else valid.first())
    }

    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density
    val keyboardController = LocalSoftwareKeyboardController.current

    val totalSteps = when {
        isEdit && selectedContactType == ContactType.AGENCY -> 1
        selectedContactType == ContactType.AGENCY -> 2
        isEdit -> 3
        else -> 4
    }
    var currentStep by rememberSaveable(initialContact?.id ?: "add") { mutableStateOf(0) }

    val canProceedStepType = selectedContactType != null
    val canProceedStepOrg = when (selectedContactType) {
        ContactType.CLUB -> selectedClub != null || clubSearchQuery.trim().isNotBlank()
        ContactType.AGENCY -> pickedName.isNotBlank() && pickedPhone.isNotBlank() && agencyName.trim().isNotBlank()
        null -> false
    }
    val canProceedStepContact = pickedName.isNotBlank() && pickedPhone.isNotBlank()

    ModalBottomSheet(
        sheetState = sheetState,
        modifier = modifier.height(screenHeight * 0.65f),
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        containerColor = HomeDarkCard,
        tonalElevation = 8.dp,
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp, bottom = 2.dp),
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
        DarkSystemBarsForBottomSheet()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(horizontal = 16.dp)
                .imePadding()
                .navigationBarsPadding()
                .nestedScroll(rememberNestedScrollInteropConnection())
                .padding(bottom = 48.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    if (currentStep > 0) {
                        IconButton(
                            onClick = { currentStep = currentStep - 1 },
                            modifier = Modifier.size(40.dp)
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.contacts_close),
                                tint = HomeTextSecondary
                            )
                        }
                    }
                    Text(
                        text = if (initialContact != null) stringResource(R.string.contacts_edit_contact) else stringResource(R.string.contacts_add_contact),
                        style = boldTextStyle(HomeTextPrimary, 20.sp)
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = stringResource(R.string.contacts_close), tint = HomeTextSecondary)
                }
            }

            StepIndicator(
                currentStep = currentStep,
                totalSteps = totalSteps,
                stepLabels = buildStepLabels(isEdit, selectedContactType),
                currentStepLabel = getCurrentStepLabel(isEdit, currentStep, selectedContactType)
            )

            Spacer(Modifier.height(16.dp))

            AnimatedContent(
                modifier = Modifier.weight(1f, fill = true),
                targetState = currentStep,
                transitionSpec = {
                    if (targetState > initialState) {
                        slideInHorizontally(animationSpec = tween(200)) { it } + fadeIn(tween(200)) togetherWith
                            slideOutHorizontally(animationSpec = tween(200)) { -it } + fadeOut(tween(200))
                    } else {
                        slideInHorizontally(animationSpec = tween(200)) { -it } + fadeIn(tween(200)) togetherWith
                            slideOutHorizontally(animationSpec = tween(200)) { it } + fadeOut(tween(200))
                    }
                },
                label = "contact_add_steps"
            ) { step ->
                val orgStep = if (isEdit) 0 else 1
                val contactStep = if (isEdit) 1 else 2
                val roleStep = if (isEdit) 2 else 3
                when {
                    !isEdit && step == 0 -> Step0TypeContent(
                        selectedType = selectedContactType,
                        onTypeSelected = { selectedContactType = it }
                    )
                    step == orgStep -> when (selectedContactType) {
                        ContactType.CLUB -> Step1ClubContent(
                            clubSearchQuery = clubSearchQuery,
                            onClubSearchChange = {
                                clubSearchQuery = it
                                if (selectedClub != null && it != selectedClub?.clubName) selectedClub = null
                            },
                            clubSearchResults = clubSearchResults,
                            isSearchingClubs = isSearchingClubs,
                            selectedClub = selectedClub,
                            clubSearchFocusRequester = clubSearchFocusRequester,
                            keyboardController = keyboardController,
                            onSelectClub = {
                                selectedClub = it
                                clubSearchQuery = ""
                                clubSearchResults = emptyList()
                            },
                            onChangeClub = {
                                selectedClub = null
                                clubSearchQuery = ""
                                clubSearchResults = emptyList()
                                clubSearchFocusRequester.requestFocus()
                                keyboardController?.show()
                            }
                        )
                        ContactType.AGENCY -> Step1AgencyContent(
                            pickedName = pickedName,
                            pickedPhone = pickedPhone,
                            agencyName = agencyName,
                            agencyCountry = agencyCountry,
                            agencyUrl = agencyUrl,
                            isDiscovering = isDiscoveringAgency,
                            discoveryError = discoveryError,
                            onPickContact = onPickContact,
                            onNameChange = onNameChange,
                            onPhoneChange = onPhoneChange,
                            onAgencyNameChange = { agencyName = it },
                            onAgencyCountryChange = { agencyCountry = it }
                        )
                        null -> Step1ClubContent(
                            clubSearchQuery = clubSearchQuery,
                            onClubSearchChange = {
                                clubSearchQuery = it
                                if (selectedClub != null && it != selectedClub?.clubName) selectedClub = null
                            },
                            clubSearchResults = clubSearchResults,
                            isSearchingClubs = isSearchingClubs,
                            selectedClub = selectedClub,
                            clubSearchFocusRequester = clubSearchFocusRequester,
                            keyboardController = keyboardController,
                            onSelectClub = {
                                selectedClub = it
                                clubSearchQuery = ""
                                clubSearchResults = emptyList()
                            },
                            onChangeClub = {
                                selectedClub = null
                                clubSearchQuery = ""
                                clubSearchResults = emptyList()
                                clubSearchFocusRequester.requestFocus()
                                keyboardController?.show()
                            }
                        )
                    }
                    step == contactStep && selectedContactType != ContactType.AGENCY -> Step2ContactContent(
                        pickedName = pickedName,
                        pickedPhone = pickedPhone,
                        onNameChange = onNameChange,
                        onPhoneChange = onPhoneChange,
                        onPickContact = onPickContact
                    )
                    step == roleStep && selectedContactType != ContactType.AGENCY -> Step3RoleContent(
                        selectedRole = selectedRole,
                        onRoleSelect = { selectedRole = it },
                        roles = rolesForType,
                        initialContact = initialContact,
                        onDismiss = onDismiss,
                        onSave = {
                            val type = selectedContactType ?: ContactType.CLUB
                            onSave(
                                Contact(
                                    id = initialContact?.id,
                                    name = pickedName.trim(),
                                    phoneNumber = pickedPhone.trim(),
                                    role = selectedRole.name,
                                    clubName = if (type == ContactType.CLUB) selectedClub?.clubName ?: clubSearchQuery.trim().takeIf { it.isNotBlank() } else null,
                                    clubCountry = if (type == ContactType.CLUB) selectedClub?.clubCountry else null,
                                    clubLogo = if (type == ContactType.CLUB) selectedClub?.clubLogo else null,
                                    clubCountryFlag = if (type == ContactType.CLUB) selectedClub?.clubCountryFlag else null,
                                    contactType = type.name,
                                    agencyName = if (type == ContactType.AGENCY) agencyName.trim().takeIf { it.isNotBlank() } else null,
                                    agencyCountry = if (type == ContactType.AGENCY) agencyCountry.trim().takeIf { it.isNotBlank() } else null,
                                    agencyUrl = if (type == ContactType.AGENCY) agencyUrl.trim().takeIf { it.isNotBlank() } else null
                                )
                            )
                        }
                    )
                }
            }

            val lastStepIndex = totalSteps - 1
            val orgStepIndex = if (isEdit) 0 else 1
            val isAgencyLastStep = currentStep == orgStepIndex && selectedContactType == ContactType.AGENCY
            Spacer(Modifier.height(24.dp))
            if (isAgencyLastStep) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(stringResource(R.string.cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
                    }
                    Button(
                        onClick = {
                            onSave(
                                Contact(
                                    id = initialContact?.id,
                                    name = pickedName.trim(),
                                    phoneNumber = pickedPhone.trim(),
                                    role = ContactRole.AGENT.name,
                                    clubName = null,
                                    clubCountry = null,
                                    clubLogo = null,
                                    clubCountryFlag = null,
                                    contactType = ContactType.AGENCY.name,
                                    agencyName = agencyName.trim().takeIf { it.isNotBlank() },
                                    agencyCountry = agencyCountry.trim().takeIf { it.isNotBlank() },
                                    agencyUrl = agencyUrl.trim().takeIf { it.isNotBlank() }
                                )
                            )
                        },
                        enabled = canProceedStepOrg,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = HomeTealAccent,
                            disabledContainerColor = HomeTealAccent.copy(alpha = 0.4f)
                        )
                    ) {
                        Text(
                            if (initialContact != null) stringResource(R.string.contacts_button_save) else stringResource(R.string.contacts_button_add),
                            style = boldTextStyle(Color.White, 14.sp)
                        )
                    }
                }
            } else if (currentStep < lastStepIndex) {
                Button(
                    onClick = { currentStep++ },
                    enabled = when (currentStep) {
                        0 -> if (isEdit) canProceedStepOrg else canProceedStepType
                        1 -> if (isEdit) canProceedStepContact else canProceedStepOrg
                        2 -> canProceedStepContact
                        else -> true
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HomeTealAccent,
                        disabledContainerColor = HomeTealAccent.copy(alpha = 0.4f)
                    )
                ) {
                    Text(stringResource(R.string.contacts_next), style = boldTextStyle(Color.White, 14.sp))
                }
            }
        }
    }
}

@Composable
private fun buildStepLabels(isEdit: Boolean, selectedContactType: ContactType?): List<String> {
    val typeLabel = stringResource(R.string.contacts_step_type)
    val clubLabel = stringResource(R.string.contacts_step_club)
    val agencyLabel = stringResource(R.string.contacts_step_agency)
    val contactLabel = stringResource(R.string.contacts_step_contact)
    val roleLabel = stringResource(R.string.contacts_step_role)
    return when {
        isEdit && selectedContactType == ContactType.AGENCY -> listOf(agencyLabel)
        isEdit -> listOf(if (selectedContactType == ContactType.AGENCY) agencyLabel else clubLabel, contactLabel, roleLabel)
        selectedContactType == ContactType.AGENCY -> listOf(typeLabel, agencyLabel)
        else -> listOf(typeLabel, clubLabel, contactLabel, roleLabel)
    }
}

@Composable
private fun getCurrentStepLabel(isEdit: Boolean, currentStep: Int, selectedContactType: ContactType?): String =
    buildStepLabels(isEdit, selectedContactType).getOrElse(currentStep) { "" }

@Composable
private fun StepIndicator(
    currentStep: Int,
    totalSteps: Int,
    stepLabels: List<String>,
    currentStepLabel: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(totalSteps) { index ->
            if (index > 0) Spacer(Modifier.width(6.dp))
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(
                        if (index <= currentStep) HomeTealAccent else HomeDarkCardBorder
                    )
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            text = stringResource(R.string.contacts_step_of, currentStep + 1, totalSteps) + " — " + currentStepLabel,
            style = regularTextStyle(HomeTextSecondary, 12.sp)
        )
    }
}

@Composable
private fun Step0TypeContent(
    selectedType: ContactType?,
    onTypeSelected: (ContactType) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = stringResource(R.string.contacts_add_type_title),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        OutlinedCard(
            onClick = { onTypeSelected(ContactType.CLUB) },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.outlinedCardColors(
                containerColor = if (selectedType == ContactType.CLUB) HomeTealAccent.copy(alpha = 0.15f) else HomeDarkBackground
            ),
            border = BorderStroke(
                width = 1.dp,
                color = if (selectedType == ContactType.CLUB) HomeTealAccent else HomeDarkCardBorder
            )
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.SportsSoccer,
                    contentDescription = null,
                    tint = if (selectedType == ContactType.CLUB) HomeTealAccent else HomeTextSecondary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.contacts_add_type_club),
                        style = boldTextStyle(HomeTextPrimary, 14.sp)
                    )
                    Text(
                        text = stringResource(R.string.contacts_add_type_club_hint),
                        style = regularTextStyle(HomeTextSecondary, 11.sp)
                    )
                }
            }
        }
        OutlinedCard(
            onClick = { onTypeSelected(ContactType.AGENCY) },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.outlinedCardColors(
                containerColor = if (selectedType == ContactType.AGENCY) HomeBlueAccent.copy(alpha = 0.15f) else HomeDarkBackground
            ),
            border = BorderStroke(
                width = 1.dp,
                color = if (selectedType == ContactType.AGENCY) HomeBlueAccent else HomeDarkCardBorder
            )
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Business,
                    contentDescription = null,
                    tint = if (selectedType == ContactType.AGENCY) HomeBlueAccent else HomeTextSecondary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.contacts_add_type_agency),
                        style = boldTextStyle(HomeTextPrimary, 14.sp)
                    )
                    Text(
                        text = stringResource(R.string.contacts_add_type_agency_hint),
                        style = regularTextStyle(HomeTextSecondary, 11.sp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Step1ClubContent(
    clubSearchQuery: String,
    onClubSearchChange: (String) -> Unit,
    clubSearchResults: List<ClubSearchModel>,
    isSearchingClubs: Boolean,
    selectedClub: ClubSearchModel?,
    clubSearchFocusRequester: FocusRequester,
    keyboardController: androidx.compose.ui.platform.SoftwareKeyboardController?,
    onSelectClub: (ClubSearchModel) -> Unit,
    onChangeClub: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.contacts_search_for_club),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        OutlinedTextField(
            value = clubSearchQuery,
            onValueChange = onClubSearchChange,
            placeholder = {
                Text(
                    stringResource(R.string.requests_search_club),
                    style = regularTextStyle(HomeTextSecondary, 14.sp)
                )
            },
            modifier = Modifier.fillMaxWidth().focusRequester(clubSearchFocusRequester),
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
                    .heightIn(max = 260.dp)
                    .padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                items(clubSearchResults) { clubItem ->
                    ClubSearchResultRow(
                        club = clubItem,
                        onClick = { onSelectClub(clubItem) }
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
                        Text(c, style = regularTextStyle(HomeTextSecondary, 11.sp))
                    }
                }
                TextButton(onClick = onChangeClub) {
                    Text(stringResource(R.string.contacts_change), style = regularTextStyle(HomeTealAccent, 12.sp))
                }
            }
        }
    }
}

@Composable
private fun Step1AgencyContent(
    pickedName: String,
    pickedPhone: String,
    agencyName: String,
    agencyCountry: String,
    agencyUrl: String,
    isDiscovering: Boolean,
    discoveryError: String?,
    onPickContact: () -> Unit,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onAgencyNameChange: (String) -> Unit,
    onAgencyCountryChange: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.contacts_agency_import_only_hint),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 12.dp)
        )
        OutlinedCard(
            onClick = onPickContact,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.outlinedCardColors(containerColor = HomeBlueAccent.copy(alpha = 0.15f)),
            border = BorderStroke(1.dp, HomeBlueAccent)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = HomeBlueAccent,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = stringResource(R.string.contacts_import),
                    style = boldTextStyle(HomeBlueAccent, 14.sp)
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        AddContactTextField(
            label = stringResource(R.string.contacts_label_name),
            value = pickedName,
            onValueChange = onNameChange,
            placeholder = stringResource(R.string.contacts_placeholder_name),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        AddContactTextField(
            label = stringResource(R.string.contacts_label_phone),
            value = pickedPhone,
            onValueChange = onPhoneChange,
            placeholder = stringResource(R.string.contacts_placeholder_phone),
            keyboardType = KeyboardType.Phone,
            contentTextDirection = TextDirection.Ltr,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.contacts_agency_discovering),
            style = regularTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        if (isDiscovering) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                CircularProgressIndicator(
                    color = HomeBlueAccent,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = stringResource(R.string.contacts_agency_searching_web),
                    style = regularTextStyle(HomeTextSecondary, 13.sp)
                )
            }
        } else if (agencyName.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(HomeDarkBackground)
                    .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(10.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Business,
                    contentDescription = null,
                    tint = HomeBlueAccent,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(agencyName, style = boldTextStyle(HomeTextPrimary, 14.sp))
                    if (agencyUrl.isNotBlank()) {
                        Text(
                            text = stringResource(R.string.contacts_agency_found_on_tm),
                            style = regularTextStyle(HomeTextSecondary, 11.sp)
                        )
                    }
                }
            }
        }
        discoveryError?.let { err ->
            Spacer(Modifier.height(8.dp))
            Text(
                text = err,
                style = regularTextStyle(HomeRedAccent, 11.sp)
            )
        }
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.contacts_agency_manual_fallback),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        AddContactTextField(
            label = stringResource(R.string.contacts_label_agency),
            value = agencyName,
            onValueChange = onAgencyNameChange,
            placeholder = stringResource(R.string.contacts_placeholder_agency),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        AddContactTextField(
            label = stringResource(R.string.contacts_label_agency_country),
            value = agencyCountry,
            onValueChange = onAgencyCountryChange,
            placeholder = stringResource(R.string.contacts_placeholder_agency_country),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun Step2ContactContent(
    pickedName: String,
    pickedPhone: String,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onPickContact: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.contacts_how_add_contact),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 12.dp)
        )
        OutlinedCard(
            onClick = onPickContact,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.outlinedCardColors(containerColor = HomeTealAccent.copy(alpha = 0.15f)),
            border = BorderStroke(1.dp, HomeTealAccent)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(14.dp),
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
                    text = stringResource(R.string.contacts_import),
                    style = boldTextStyle(HomeTealAccent, 14.sp)
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.contacts_or_enter_manually),
            style = regularTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.padding(bottom = 12.dp)
        )
        AddContactTextField(
            label = stringResource(R.string.contacts_label_name),
            value = pickedName,
            onValueChange = onNameChange,
            placeholder = stringResource(R.string.contacts_placeholder_name),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        AddContactTextField(
            label = stringResource(R.string.contacts_label_phone),
            value = pickedPhone,
            onValueChange = onPhoneChange,
            placeholder = stringResource(R.string.contacts_placeholder_phone),
            keyboardType = KeyboardType.Phone,
            contentTextDirection = TextDirection.Ltr,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun Step3RoleContent(
    selectedRole: ContactRole,
    onRoleSelect: (ContactRole) -> Unit,
    roles: List<ContactRole>,
    initialContact: Contact?,
    onDismiss: () -> Unit,
    onSave: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        Text(
            text = stringResource(R.string.contacts_role_optional),
            style = regularTextStyle(HomeTextSecondary, 11.sp),
            modifier = Modifier.padding(bottom = 12.dp)
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            roles.forEach { role ->
                RoleChip(
                    label = getRoleDisplayLabel(role),
                    isSelected = selectedRole == role,
                    onClick = { onRoleSelect(role) }
                )
            }
        }
        Spacer(Modifier.height(24.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.weight(1f)
            ) {
                Text(stringResource(R.string.cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
            }
            Button(
                onClick = onSave,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent)
            ) {
                Text(
                    if (initialContact != null) stringResource(R.string.contacts_button_save) else stringResource(R.string.contacts_button_add),
                    style = boldTextStyle(Color.White, 14.sp)
                )
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
    keyboardType: KeyboardType = KeyboardType.Text,
    contentTextDirection: TextDirection? = null,
    modifier: Modifier = Modifier
) {
    val textStyle = if (contentTextDirection != null) {
        regularTextStyle(HomeTextPrimary, 14.sp, direction = contentTextDirection)
    } else null
    val placeholderStyle = if (contentTextDirection != null) {
        regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 14.sp, direction = contentTextDirection)
    } else {
        regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 14.sp)
    }
    Column(modifier = modifier) {
        Text(
            text = label,
            style = regularTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.padding(bottom = 4.dp)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = textStyle ?: TextStyle(),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            placeholder = {
                Text(
                    placeholder,
                    style = placeholderStyle
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
