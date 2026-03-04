package com.liordahan.mgsrteam.features.women.repository

import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenContact
import com.liordahan.mgsrteam.features.women.models.WomenContactType
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Women-dedicated contacts repository.
 * Hardcoded to "ContactsWomen" collection — no PlatformManager dependency.
 */
class WomenContactsRepository(
    private val firebaseHandler: WomenFirebaseHandler
) {

    fun contactsFlow(): Flow<List<WomenContact>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.contactsTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.toObjects(WomenContact::class.java) ?: emptyList()
                trySend(list.sortedBy { it.name?.lowercase() })
            }
        awaitClose { listener.remove() }
    }

    suspend fun addContact(contact: WomenContact): Result<Unit> = runCatching {
        val data = mapOf(
            "name" to (contact.name ?: ""),
            "phoneNumber" to (contact.phoneNumber ?: ""),
            "role" to (contact.role ?: ""),
            "clubName" to (contact.clubName ?: ""),
            "clubCountry" to (contact.clubCountry ?: ""),
            "clubLogo" to (contact.clubLogo ?: ""),
            "clubCountryFlag" to (contact.clubCountryFlag ?: ""),
            "clubTmProfile" to (contact.clubTmProfile ?: ""),
            "contactType" to (contact.contactType ?: WomenContactType.CLUB.name),
            "agencyName" to (contact.agencyName ?: ""),
            "agencyCountry" to (contact.agencyCountry ?: ""),
            "agencyUrl" to (contact.agencyUrl ?: "")
        )
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.contactsTable)
            .add(data)
            .await()
    }

    suspend fun updateContact(contact: WomenContact): Result<Unit> = runCatching {
        val id = contact.id ?: throw IllegalArgumentException("Contact id required for update")
        val data = mapOf(
            "name" to (contact.name ?: ""),
            "phoneNumber" to (contact.phoneNumber ?: ""),
            "role" to (contact.role ?: ""),
            "clubName" to (contact.clubName ?: ""),
            "clubCountry" to (contact.clubCountry ?: ""),
            "clubLogo" to (contact.clubLogo ?: ""),
            "clubCountryFlag" to (contact.clubCountryFlag ?: ""),
            "clubTmProfile" to (contact.clubTmProfile ?: ""),
            "contactType" to (contact.contactType ?: WomenContactType.CLUB.name),
            "agencyName" to (contact.agencyName ?: ""),
            "agencyCountry" to (contact.agencyCountry ?: ""),
            "agencyUrl" to (contact.agencyUrl ?: "")
        )
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.contactsTable)
            .document(id)
            .set(data)
            .await()
    }

    suspend fun deleteContact(contactId: String): Result<Unit> = runCatching {
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.contactsTable)
            .document(contactId)
            .delete()
            .await()
    }
}
