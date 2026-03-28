package com.liordahan.mgsrteam.features.contacts.repository

import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.contacts.models.Contact
import com.liordahan.mgsrteam.features.contacts.models.ContactType
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.SharedCallables
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.tasks.await

interface IContactsRepository {
    fun contactsFlow(): Flow<List<Contact>>
    suspend fun addContact(contact: Contact): Result<Unit>
    suspend fun updateContact(contact: Contact): Result<Unit>
    suspend fun deleteContact(contactId: String): Result<Unit>
}

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class ContactsRepository(
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager
) : IContactsRepository {

    /**
     * Auto-reconnects when platform switches so the snapshot listener
     * always targets the correct Contacts collection.
     */
    override fun contactsFlow(): Flow<List<Contact>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val listener: ListenerRegistration = firebaseHandler.firebaseStore
                    .collection(firebaseHandler.contactsTable)
                    .addSnapshotListener { value, error ->
                        if (error != null) {
                            trySend(emptyList())
                            return@addSnapshotListener
                        }
                        val list = value?.toObjects(Contact::class.java) ?: emptyList()
                        trySend(list.sortedBy { it.name?.lowercase() })
                    }
                awaitClose { listener.remove() }
            }
        }

    override suspend fun addContact(contact: Contact): Result<Unit> = runCatching {
        val data = buildContactFields(contact)
        SharedCallables.contactsCreate(platformManager.value, data)
    }

    override suspend fun updateContact(contact: Contact): Result<Unit> = runCatching {
        val id = contact.id ?: throw IllegalArgumentException("Contact id required for update")
        val data = buildContactFields(contact)
        SharedCallables.contactsUpdate(platformManager.value, id, data)
    }

    override suspend fun deleteContact(contactId: String): Result<Unit> = runCatching {
        SharedCallables.contactsDelete(platformManager.value, contactId)
    }

    private fun buildContactFields(contact: Contact): Map<String, String> = mapOf(
        "name" to (contact.name ?: ""),
        "phoneNumber" to (contact.phoneNumber ?: ""),
        "role" to (contact.role ?: ""),
        "clubName" to (contact.clubName ?: ""),
        "clubCountry" to (contact.clubCountry ?: ""),
        "clubLogo" to (contact.clubLogo ?: ""),
        "clubCountryFlag" to (contact.clubCountryFlag ?: ""),
        "clubTmProfile" to (contact.clubTmProfile ?: ""),
        "contactType" to (contact.contactType ?: ContactType.CLUB.name),
        "agencyName" to (contact.agencyName ?: ""),
        "agencyCountry" to (contact.agencyCountry ?: ""),
        "agencyUrl" to (contact.agencyUrl ?: ""),
    )
}
