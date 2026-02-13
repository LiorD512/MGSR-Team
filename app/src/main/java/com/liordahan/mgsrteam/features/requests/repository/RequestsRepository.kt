package com.liordahan.mgsrteam.features.requests.repository

import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

interface IRequestsRepository {
    fun requestsFlow(): Flow<List<Request>>
    suspend fun addRequest(request: Request): Result<Unit>
    suspend fun deleteRequest(requestId: String): Result<Unit>
}

class RequestsRepository(
    private val firebaseHandler: FirebaseHandler
) : IRequestsRepository {

    override fun requestsFlow(): Flow<List<Request>> = callbackFlow {
        val listener: ListenerRegistration = firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.toObjects(Request::class.java) ?: emptyList()
                trySend(list.sortedByDescending { it.createdAt ?: 0L })
            }
        awaitClose { listener.remove() }
    }

    override suspend fun addRequest(request: Request): Result<Unit> = runCatching {
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
            "createdAt" to (request.createdAt ?: System.currentTimeMillis()),
            "status" to (request.status ?: "pending")
        )
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .add(data)
            .await()
    }

    override suspend fun deleteRequest(requestId: String): Result<Unit> = runCatching {
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.clubRequestsTable)
            .document(requestId)
            .delete()
            .await()
    }
}
