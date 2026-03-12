package com.liordahan.mgsrteam.features.players.playerinfo.matchingrequests

import com.google.firebase.auth.FirebaseAuth
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

interface IPlayerOffersRepository {
    fun offersForPlayerFlow(playerTmProfile: String): Flow<List<PlayerOffer>>
    suspend fun addOffer(offer: PlayerOffer): Result<Unit>
    suspend fun updateClubFeedback(offerId: String, clubFeedback: String?): Result<Unit>
    suspend fun stampOffersAsDeleted(requestId: String, requestSnapshot: String?): Result<Unit>
    suspend fun updateHistorySummary(offerId: String, summary: String?): Result<Unit>
}

class PlayerOffersRepository(
    private val firebaseHandler: FirebaseHandler
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
        val data = mapOf(
            "playerTmProfile" to (offer.playerTmProfile ?: ""),
            "playerName" to (offer.playerName ?: ""),
            "playerImage" to (offer.playerImage ?: ""),
            "requestId" to (offer.requestId ?: ""),
            "clubTmProfile" to (offer.clubTmProfile ?: ""),
            "clubName" to (offer.clubName ?: ""),
            "clubLogo" to (offer.clubLogo ?: ""),
            "position" to (offer.position ?: ""),
            "offeredAt" to (offer.offeredAt ?: System.currentTimeMillis()),
            "clubFeedback" to (offer.clubFeedback ?: ""),
            "markedByAgentName" to (agentName ?: "")
        )
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.playerOffersTable)
            .add(data)
            .await()
        writeFeedEventPlayerOffered(
            playerName = offer.playerName,
            playerImage = offer.playerImage,
            playerTmProfile = offer.playerTmProfile,
            clubName = offer.clubName,
            clubFeedback = offer.clubFeedback,
            offeredAt = offer.offeredAt ?: System.currentTimeMillis(),
            agentName = agentName
        )
    }

    override suspend fun updateClubFeedback(offerId: String, clubFeedback: String?): Result<Unit> = runCatching {
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.playerOffersTable)
            .document(offerId)
            .update("clubFeedback", clubFeedback ?: "")
            .await()
    }

    override suspend fun stampOffersAsDeleted(requestId: String, requestSnapshot: String?): Result<Unit> = runCatching {
        val snapshot = firebaseHandler.firebaseStore
            .collection(firebaseHandler.playerOffersTable)
            .whereEqualTo("requestId", requestId)
            .get()
            .await()
        val batch = firebaseHandler.firebaseStore.batch()
        for (doc in snapshot.documents) {
            batch.update(doc.reference, mapOf(
                "requestStatus" to "deleted",
                "requestSnapshot" to (requestSnapshot ?: "")
            ))
        }
        batch.commit().await()
    }

    override suspend fun updateHistorySummary(offerId: String, summary: String?): Result<Unit> = runCatching {
        firebaseHandler.firebaseStore
            .collection(firebaseHandler.playerOffersTable)
            .document(offerId)
            .update("historySummary", summary ?: "")
            .await()
    }

    private suspend fun getCurrentUserAccountName(): String? =
        firebaseHandler.getCurrentUserAccountName()

    private fun writeFeedEventPlayerOffered(
        playerName: String?,
        playerImage: String?,
        playerTmProfile: String?,
        clubName: String?,
        clubFeedback: String?,
        offeredAt: Long,
        agentName: String?
    ) {
        try {
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                FeedEvent(
                    type = FeedEvent.TYPE_PLAYER_OFFERED_TO_CLUB,
                    playerName = playerName,
                    playerImage = playerImage,
                    playerTmProfile = playerTmProfile,
                    newValue = clubName,
                    extraInfo = clubFeedback?.takeIf { it.isNotBlank() },
                    timestamp = offeredAt,
                    agentName = agentName
                )
            )
        } catch (_: Exception) { /* fire-and-forget */ }
    }
}
