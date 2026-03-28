package com.liordahan.mgsrteam.features.requests.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.features.requests.models.Request
import com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests.IPlayerOffersRepository
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.SharedCallables
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flatMapLatest

interface IRequestsRepository {
    fun requestsFlow(): Flow<List<Request>>
    suspend fun addRequest(request: Request): Result<Unit>
    suspend fun updateRequest(request: Request): Result<Unit>
    suspend fun deleteRequest(request: Request): Result<Unit>
}

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class RequestsRepository(
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager,
    private val offersRepository: IPlayerOffersRepository
) : IRequestsRepository {

    /**
     * All ClubRequests are shared — no filtering by user/agent.
     * Auto-reconnects on platform switch.
     */
    override fun requestsFlow(): Flow<List<Request>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
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
        }

    private suspend fun getCurrentUserAccountName(): String? =
        firebaseHandler.getCurrentUserAccountName()

    override suspend fun addRequest(request: Request): Result<Unit> = runCatching {
        val agentName = getCurrentUserAccountName() ?: FirebaseAuth.getInstance().currentUser?.displayName
        SharedCallables.requestsCreate(platformManager.value, buildRequestFields(request, agentName))
        // FeedEvent is now written server-side by the callable
    }

    override suspend fun updateRequest(request: Request): Result<Unit> = runCatching {
        val requestId = request.id ?: return@runCatching
        SharedCallables.requestsUpdate(platformManager.value, requestId, buildRequestFields(request, null))
    }

    override suspend fun deleteRequest(request: Request): Result<Unit> = runCatching {
        val requestId = request.id ?: return@runCatching
        val agentName = getCurrentUserAccountName() ?: FirebaseAuth.getInstance().currentUser?.displayName
        val snapshot = buildRequestSnapshot(request)
        // FeedEvent + offer stamping are now done server-side by the callable
        SharedCallables.requestsDelete(platformManager.value, requestId, snapshot, agentName)
    }

    private fun buildRequestFields(request: Request, agentName: String?): Map<String, Any?> = mapOf(
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
        "status" to (request.status ?: "pending"),
        "euOnly" to (request.euOnly ?: false),
        "createdByAgent" to (request.createdByAgent ?: agentName ?: ""),
    )

    private fun buildRequestSnapshot(request: Request): String {
        val parts = mutableListOf<String>()
        if (request.ageDoesntMatter != true && request.minAge != null && request.maxAge != null && request.minAge > 0 && request.maxAge > 0) {
            parts.add("Age: ${request.minAge}-${request.maxAge}")
        }
        request.salaryRange?.takeIf { it.isNotBlank() }?.let { parts.add("Salary: $it") }
        request.transferFee?.takeIf { it.isNotBlank() }?.let { parts.add("Fee: $it") }
        request.dominateFoot?.takeIf { it.isNotBlank() && it != "any" }?.let { parts.add("Foot: $it") }
        return parts.joinToString(" • ")
    }
}
