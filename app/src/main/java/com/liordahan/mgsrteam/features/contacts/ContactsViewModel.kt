package com.liordahan.mgsrteam.features.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.repository.IContactsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

data class ContactsUiState(
    val contacts: List<Contact> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

abstract class IContactsViewModel: ViewModel() {
    abstract val contactsState: StateFlow<ContactsUiState>
    abstract fun addContact(contact: Contact)
    abstract fun updateContact(contact: Contact)
    abstract fun deleteContact(contactId: String)
}

class ContactsViewModel(
    private val repository: IContactsRepository
) : IContactsViewModel() {

    private val _contactsState = MutableStateFlow(ContactsUiState())
    override val contactsState: StateFlow<ContactsUiState> = _contactsState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.contactsFlow()
                .catch { e ->
                    _contactsState.value = _contactsState.value.copy(
                        contacts = emptyList(),
                        isLoading = false,
                        errorMessage = e.message
                    )
                }
                .collect { list ->
                    _contactsState.value = _contactsState.value.copy(
                        contacts = list,
                        isLoading = false,
                        errorMessage = null
                    )
                }
        }
    }

    override fun addContact(contact: Contact) {
        viewModelScope.launch {
            repository.addContact(contact)
        }
    }

    override fun updateContact(contact: Contact) {
        viewModelScope.launch {
            repository.updateContact(contact)
        }
    }

    override fun deleteContact(contactId: String) {
        viewModelScope.launch {
            repository.deleteContact(contactId)
        }
    }
}
