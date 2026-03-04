package com.liordahan.mgsrteam.features.women.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.women.models.WomenContact
import com.liordahan.mgsrteam.features.women.models.WomenContactType
import com.liordahan.mgsrteam.features.women.models.WomenPlayer
import com.liordahan.mgsrteam.features.women.repository.WomenContactsRepository
import com.liordahan.mgsrteam.features.women.repository.WomenPlayersRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * Women-dedicated contacts UI state.
 */
data class WomenContactsUiState(
    val contacts: List<WomenContact> = emptyList(),
    val players: List<WomenPlayer> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

/**
 * Women-dedicated contacts abstract ViewModel.
 */
abstract class IWomenContactsViewModel : ViewModel() {
    abstract val contactsState: StateFlow<WomenContactsUiState>
    abstract fun addContact(contact: WomenContact)
    abstract fun updateContact(contact: WomenContact)
    abstract fun deleteContact(contactId: String)
}

/** Returns women players that belong to this agency contact. */
fun womenPlayersForAgencyContact(contact: WomenContact, players: List<WomenPlayer>): List<WomenPlayer> {
    if (contact.contactTypeEnum != WomenContactType.AGENCY) return emptyList()
    val agencyName = contact.agencyName?.trim()?.takeIf { it.isNotBlank() }
    val agencyUrl = contact.agencyUrl?.trim()?.takeIf { it.isNotBlank() }
    return players.filter { player ->
        player.linkedContactId == contact.id ||
                (agencyName != null && player.agency?.trim().equals(agencyName, ignoreCase = true)) ||
                (agencyUrl != null && player.agencyUrl?.trim() == agencyUrl)
    }
}

/**
 * Women-dedicated contacts ViewModel implementation.
 */
class WomenContactsViewModel(
    private val repository: WomenContactsRepository,
    private val playersRepository: WomenPlayersRepository
) : IWomenContactsViewModel() {

    private val _contactsState = MutableStateFlow(WomenContactsUiState())
    override val contactsState: StateFlow<WomenContactsUiState> = _contactsState.asStateFlow()

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

    override fun addContact(contact: WomenContact) {
        viewModelScope.launch { repository.addContact(contact) }
    }

    override fun updateContact(contact: WomenContact) {
        viewModelScope.launch { repository.updateContact(contact) }
    }

    override fun deleteContact(contactId: String) {
        viewModelScope.launch { repository.deleteContact(contactId) }
    }
}
