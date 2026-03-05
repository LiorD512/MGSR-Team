package com.liordahan.mgsrteam.features.youth.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.youth.models.YouthContact
import com.liordahan.mgsrteam.features.youth.models.YouthContactType
import com.liordahan.mgsrteam.features.youth.models.YouthPlayer
import com.liordahan.mgsrteam.features.youth.repository.YouthContactsRepository
import com.liordahan.mgsrteam.features.youth.repository.YouthPlayersRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

data class YouthContactsUiState(
    val contacts: List<YouthContact> = emptyList(),
    val players: List<YouthPlayer> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

abstract class IYouthContactsViewModel : ViewModel() {
    abstract val contactsState: StateFlow<YouthContactsUiState>
    abstract fun addContact(contact: YouthContact)
    abstract fun updateContact(contact: YouthContact)
    abstract fun deleteContact(contactId: String)
}

fun youthPlayersForAgencyContact(contact: YouthContact, players: List<YouthPlayer>): List<YouthPlayer> {
    if (contact.contactTypeEnum != YouthContactType.AGENCY) return emptyList()
    val agencyName = contact.agencyName?.trim()?.takeIf { it.isNotBlank() }
    val agencyUrl = contact.agencyUrl?.trim()?.takeIf { it.isNotBlank() }
    return players.filter { player ->
        player.linkedContactId == contact.id ||
                (agencyName != null && player.agency?.trim().equals(agencyName, ignoreCase = true)) ||
                (agencyUrl != null && player.agencyUrl?.trim() == agencyUrl)
    }
}

class YouthContactsViewModel(
    private val repository: YouthContactsRepository,
    private val playersRepository: YouthPlayersRepository
) : IYouthContactsViewModel() {

    private val _contactsState = MutableStateFlow(YouthContactsUiState())
    override val contactsState: StateFlow<YouthContactsUiState> = _contactsState.asStateFlow()

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

    override fun addContact(contact: YouthContact) {
        viewModelScope.launch { repository.addContact(contact) }
    }

    override fun updateContact(contact: YouthContact) {
        viewModelScope.launch { repository.updateContact(contact) }
    }

    override fun deleteContact(contactId: String) {
        viewModelScope.launch { repository.deleteContact(contactId) }
    }
}
