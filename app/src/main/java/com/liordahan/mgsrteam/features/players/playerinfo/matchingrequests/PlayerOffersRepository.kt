package com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests

import com.google.firebase.auth.FirebaseAuth
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.SharedCallables
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

interface IPlayerOffersRepository {
    fun offersForPlayerFlow(playerTmProfile: String): Flow<List<PlayerOffer>>
    suspend fun addOffer(offer: PlayerOffer): Result<Unit>
    suspend fun updateClubFeedback(offerId: String, clubFeedback: String?): Result<Unit>
    suspend fun updateHistorySummary(offerId: String, summary: String?): Result<Unit>
}

class PlayerOffersRepository(
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager
) : IPlayerOffersRepository {

    override fun offersForPlayerFlow(playerTmProfile: String): Flow<List<PlayerOffer>> = callbackFlow {
        if (playerTmProfile.isBlank()) {
            trySend(emptyList())
            awaitClose { }
            return@callbackFlow
        }
        val listener = firebaseHandler.firebaseStore
            .collection(firebaseHandler.playerOffersTable)
            .whereEqualTo("playerTmProfile", playerTmProfile)
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val list = value?.toObjects(PlayerOffer::class.java) ?: emptyList()
                trySend(list.sortedByDescending { it.offeredAt ?: 0L })
            }
        awaitClose { listener.remove() }
    }

    override suspend fun addOffer(offer: PlayerOffer): Result<Unit> = runCatching {
        val agentName = getCurrentUserAccountName() ?: FirebaseAuth.getInstance().currentUser?.displayName
        SharedCallables.offersCreate(platformManager.value, mapOf(
            "playerTmProfile" to (offer.playerTmProfile ?: ""),
            "playerName" to (offer.playerName ?: ""),
            "playerImage" to (offer.playerImage ?: ""),
            "requestId" to (offer.requestId ?: ""),
            "clubTmProfile" to (offer.clubTmProfile ?: ""),
            "clubName" to (offer.clubName ?: ""),
            "clubLogo" to (offer.clubLogo ?: ""),
            "position" to (offer.position ?: ""),
            "clubFeedback" to (offer.clubFeedback ?: ""),
            "markedByAgentName" to (agentName ?: ""),
        ))
        // FeedEvent is now written server-side by the callable
    }

    override suspend fun updateClubFeedback(offerId: String, clubFeedback: String?): Result<Unit> = runCatching {
        SharedCallables.offersUpdateFeedback(offerId, clubFeedback ?: "")
    }

    override suspend fun updateHistorySummary(offerId: String, summary: String?): Result<Unit> = runCatching {
        SharedCallables.offersUpdateHistorySummary(offerId, summary ?: "")
    }

    private suspend fun getCurrentUserAccountName(): String? =
        firebaseHandler.getCurrentUserAccountName()
}
