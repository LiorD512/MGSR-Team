package com.liordahan.mgsrteam.features.youth.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.youth.data.YouthFirebaseHandler
import com.liordahan.mgsrteam.features.youth.models.YouthFeedEvent
import com.liordahan.mgsrteam.features.youth.models.YouthRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Youth-dedicated requests repository.
 * Hardcoded to "ClubRequestsYouth" collection — no PlatformManager dependency.
 */
class YouthRequestsRepository(
    private val firebaseHandler: YouthFirebaseHandler
) {

    fun requestsFlow(): Flow<List<YouthRequest>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.documents?.mapNotNull { doc ->
                    doc.toObject(YouthRequest::class.java)?.copy(id = doc.id)
                } ?: emptyList()
                trySend(list.sortedByDescending { it.createdAt ?: 0L })
            }
        awaitClose { listener.remove() }
    }

    private suspend fun getCurrentUserAccountName(): String? {
        val email = FirebaseAuth.getInstance().currentUser?.email ?: return null
        val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
        return snapshot.toObjects(Account::class.java)
            .firstOrNull { it.email?.equals(email, ignoreCase = true) == true }
            ?.name
    }

    private fun writeFeedEvent(type: String, request: YouthRequest, agentName: String?) {
        try {
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                YouthFeedEvent(
                    type = type,
                    playerName = request.clubName,
                    playerImage = request.clubLogo,
                    playerTmProfile = request.clubTmProfile,
                    newValue = request.position,
                    timestamp = request.createdAt ?: System.currentTimeMillis(),
                    agentName = agentName
                )
            )
        } catch (_: Exception) { /* fire-and-forget */ }
    }

    suspend fun addRequest(request: YouthRequest): Result<Unit> = runCatching {
        val agentName = getCurrentUserAccountName() ?: FirebaseAuth.getInstance().currentUser?.displayName
        val data = mapOf(
            "clubTmProfile" to (request.clubTmProfile ?: ""),
            "clubName" to (request.clubName ?: ""),
            "clubLogo" to (request.clubLogo ?: ""),
            "clubCountry" to (request.clubCountry ?: ""),
            "clubCountryFlag" to (request.clubCountryFlag ?: ""),
            "contactId" to (request.contactId ?: ""),
            "contactName" to (request.contactName ?: ""),
            "contactPhoneNumber" to (request.contactPhoneNumber ?: ""),
            "position" to (request.position ?: ""),
            "quantity" to (request.quantity ?: 1),
            "notes" to (request.notes ?: ""),
            "minAge" to request.minAge,
            "maxAge" to request.maxAge,
            "ageDoesntMatter" to (request.ageDoesntMatter ?: true),
            "salaryRange" to (request.salaryRange ?: ""),
            "transferFee" to (request.transferFee ?: ""),
            "dominateFoot" to (request.dominateFoot ?: ""),
            "createdAt" to (request.createdAt ?: System.currentTimeMillis()),
            "status" to (request.status ?: "pending")
        )
        firebaseHandler.firebaseStore.collection(firebaseHandler.clubRequestsTable).add(data).await()
        writeFeedEvent(YouthFeedEvent.TYPE_REQUEST_ADDED, request, agentName)
    }

    suspend fun updateRequest(request: YouthRequest): Result<Unit> = runCatching {
        val id = request.id ?: throw IllegalArgumentException("Request id required for update")
        val data = mapOf(
            "clubTmProfile" to (request.clubTmProfile ?: ""),
            "clubName" to (request.clubName ?: ""),
            "clubLogo" to (request.clubLogo ?: ""),
            "clubCountry" to (request.clubCountry ?: ""),
            "clubCountryFlag" to (request.clubCountryFlag ?: ""),
            "contactId" to (request.contactId ?: ""),
            "contactName" to (request.contactName ?: ""),
            "contactPhoneNumber" to (request.contactPhoneNumber ?: ""),
            "position" to (request.position ?: ""),
            "quantity" to (request.quantity ?: 1),
            "notes" to (request.notes ?: ""),
            "minAge" to request.minAge,
            "maxAge" to request.maxAge,
            "ageDoesntMatter" to (request.ageDoesntMatter ?: true),
            "salaryRange" to (request.salaryRange ?: ""),
            "transferFee" to (request.transferFee ?: ""),
            "dominateFoot" to (request.dominateFoot ?: ""),
            "createdAt" to (request.createdAt ?: System.currentTimeMillis()),
            "status" to (request.status ?: "pending")
        )
        firebaseHandler.firebaseStore.collection(firebaseHandler.clubRequestsTable).document(id).set(data).await()
    }

    suspend fun deleteRequest(requestId: String): Result<Unit> = runCatching {
        firebaseHandler.firebaseStore.collection(firebaseHandler.clubRequestsTable).document(requestId).delete().await()
    }
}
