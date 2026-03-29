package com.liordahan.mgsrteam.features.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.models.ContactType
import com.liordahan.mgsrteam.features.contacts.repository.IContactsRepository
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.repository.IPlayersRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

data class ContactsUiState(
    val contacts: List<Contact> = emptyList(),
    val players: List<Player> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val isSaving: Boolean = false,
    val isDeleting: Boolean = false
)

abstract class IContactsViewModel: ViewModel() {
    abstract val contactsState: StateFlow<ContactsUiState>
    abstract fun addContact(contact: Contact)
    abstract fun updateContact(contact: Contact)
    abstract fun deleteContact(contactId: String)
}

/** Returns players that belong to this agency contact (by linkedContactId or agency name/URL match). */
fun playersForAgencyContact(contact: Contact, players: List<Player>): List<Player> {
    if (contact.contactTypeEnum != ContactType.AGENCY) return emptyList()
    val agencyName = contact.agencyName?.trim()?.takeIf { it.isNotBlank() }
    val agencyUrl = contact.agencyUrl?.trim()?.takeIf { it.isNotBlank() }
    return players.filter { player ->
        player.linkedContactId == contact.id ||
        (agencyName != null && player.agency?.trim().equals(agencyName, ignoreCase = true)) ||
        (agencyUrl != null && player.agencyUrl?.trim() == agencyUrl)
    }
}

class ContactsViewModel(
    private val repository: IContactsRepository,
    private val playersRepository: IPlayersRepository
) : IContactsViewModel() {

    private val _contactsState = MutableStateFlow(ContactsUiState())
    override val contactsState: StateFlow<ContactsUiState> = _contactsState.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                repository.contactsFlow().catch { emit(emptyList()) },
                playersRepository.playersFlow().catch { emit(emptyList()) }
            ) { contacts, players ->
                contacts to players
            }.collect { (contacts, players) ->
                _contactsState.value = _contactsState.value.copy(
                    contacts = contacts.sortedBy { it.name?.lowercase() },
                    players = players,
                    isLoading = false,
                    errorMessage = null
                )
            }
        }
    }

    override fun addContact(contact: Contact) {
        viewModelScope.launch {
            _contactsState.value = _contactsState.value.copy(isSaving = true)
            try {
                repository.addContact(contact)
            } finally {
                _contactsState.value = _contactsState.value.copy(isSaving = false)
            }
        }
    }

    override fun updateContact(contact: Contact) {
        viewModelScope.launch {
            _contactsState.value = _contactsState.value.copy(isSaving = true)
            try {
                repository.updateContact(contact)
            } finally {
                _contactsState.value = _contactsState.value.copy(isSaving = false)
            }
        }
    }

    override fun deleteContact(contactId: String) {
        viewModelScope.launch {
            _contactsState.value = _contactsState.value.copy(isDeleting = true)
            try {
                repository.deleteContact(contactId)
            } finally {
                _contactsState.value = _contactsState.value.copy(isDeleting = false)
            }
        }
    }
}
