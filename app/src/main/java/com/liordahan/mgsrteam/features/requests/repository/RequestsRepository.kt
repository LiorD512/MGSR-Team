package com.liordahan.mgsrteam.features.requests.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

interface IRequestsRepository {
    fun requestsFlow(): Flow<List<Request>>
    suspend fun addRequest(request: Request): Result<Unit>
    suspend fun updateRequest(request: Request): Result<Unit>
    suspend fun deleteRequest(request: Request): Result<Unit>
}

class RequestsRepository(
    private val firebaseHandler: FirebaseHandler
) : IRequestsRepository {

    /**
     * All ClubRequests are shared — no filtering by user/agent.
     * Any authenticated user can see all requests.
     */
    override fun requestsFlow(): Flow<List<Request>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.documents?.mapNotNull { doc ->
                    doc.toObject(Request::class.java)?.copy(id = doc.id)
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

    private fun writeFeedEventRequest(request: Request, agentName: String?) {
        try {
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                FeedEvent(
                    type = FeedEvent.TYPE_REQUEST_ADDED,
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

    private fun writeFeedEventRequestDeleted(request: Request, agentName: String?) {
        try {
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                FeedEvent(
                    type = FeedEvent.TYPE_REQUEST_DELETED,
                    playerName = request.clubName,
                    playerImage = request.clubLogo,
                    playerTmProfile = request.clubTmProfile,
                    newValue = request.position,
                    timestamp = System.currentTimeMillis(),
                    agentName = agentName
                )
            )
        } catch (_: Exception) { /* fire-and-forget */ }
    }

    override suspend fun addRequest(request: Request): Result<Unit> = runCatching {
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
            "minAge" to (request.minAge ?: 0),
            "maxAge" to (request.maxAge ?: 0),
            "ageDoesntMatter" to (request.ageDoesntMatter ?: true),
            "salaryRange" to (request.salaryRange ?: ""),
            "transferFee" to (request.transferFee ?: ""),
            "dominateFoot" to (request.dominateFoot ?: ""),
            "createdAt" to (request.createdAt ?: System.currentTimeMillis()),
            "status" to (request.status ?: "pending")
        )
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .add(data)
            .await()
        writeFeedEventRequest(request, agentName)
    }

    override suspend fun updateRequest(request: Request): Result<Unit> = runCatching {
        val requestId = request.id ?: return@runCatching
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
            "minAge" to (request.minAge ?: 0),
            "maxAge" to (request.maxAge ?: 0),
            "ageDoesntMatter" to (request.ageDoesntMatter ?: true),
            "salaryRange" to (request.salaryRange ?: ""),
            "transferFee" to (request.transferFee ?: ""),
            "dominateFoot" to (request.dominateFoot ?: ""),
            "status" to (request.status ?: "pending")
        )
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .document(requestId)
            .update(data)
            .await()
    }

    override suspend fun deleteRequest(request: Request): Result<Unit> = runCatching {
        val requestId = request.id ?: return@runCatching
        val agentName = getCurrentUserAccountName() ?: FirebaseAuth.getInstance().currentUser?.displayName
        writeFeedEventRequestDeleted(request, agentName)
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .document(requestId)
            .delete()
            .await()
    }
}
