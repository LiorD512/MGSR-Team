package com.liordahan.mgsrteam.features.shortlist

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

data class ShortlistEntry(
    val tmProfileUrl: String,
    val addedAt: Long = System.currentTimeMillis(),
    val playerImage: String? = null,
    val playerName: String? = null,
    val playerPosition: String? = null,
    val playerAge: String? = null,
    val playerNationality: String? = null,
    val playerNationalityFlag: String? = null,
    val clubJoinedLogo: String? = null,
    val clubJoinedName: String? = null,
    val transferDate: String? = null,
    val marketValue: String? = null
) {
    /** Converts to LatestTransferModel for display in ReleaseListItem-style UI. */
    fun toLatestTransferModel(): LatestTransferModel = LatestTransferModel(
        playerImage = playerImage,
        playerName = playerName,
        playerUrl = tmProfileUrl,
        playerPosition = playerPosition,
        playerAge = playerAge,
        playerNationality = playerNationality,
        playerNationalityFlag = playerNationalityFlag,
        clubJoinedLogo = clubJoinedLogo,
        clubJoinedName = clubJoinedName,
        transferDate = transferDate,
        marketValue = marketValue
    )

    val hasEnrichedData: Boolean
        get() = !playerName.isNullOrBlank()
}

class ShortlistRepository(
    private val firebaseHandler: FirebaseHandler
) {

    private val store = FirebaseFirestore.getInstance()

    private fun shortlistDocRef() =
        store.collection(firebaseHandler.shortlistsTable).document(
            FirebaseAuth.getInstance().currentUser?.uid ?: "anonymous"
        )

    fun getShortlistFlow(): Flow<List<ShortlistEntry>> = callbackFlow {
        val docRef = shortlistDocRef()
        val listener = docRef.addSnapshotListener { snapshot, _ ->
            val list = snapshot?.get("entries") as? List<Map<String, Any>> ?: emptyList()
            val entries = list.mapNotNull { map ->
                parseEntryFromMap(map)
            }.sortedByDescending { it.addedAt }
            trySend(entries)
        }
        awaitClose { listener.remove() }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseEntryFromMap(map: Map<String, Any>): ShortlistEntry? {
        val url = map["tmProfileUrl"] as? String ?: return null
        val addedAt = (map["addedAt"] as? Number)?.toLong() ?: 0L
        return ShortlistEntry(
            tmProfileUrl = url,
            addedAt = addedAt,
            playerImage = map["playerImage"] as? String,
            playerName = map["playerName"] as? String,
            playerPosition = map["playerPosition"] as? String,
            playerAge = map["playerAge"] as? String,
            playerNationality = map["playerNationality"] as? String,
            playerNationalityFlag = map["playerNationalityFlag"] as? String,
            clubJoinedLogo = map["clubJoinedLogo"] as? String,
            clubJoinedName = map["clubJoinedName"] as? String,
            transferDate = map["transferDate"] as? String,
            marketValue = map["marketValue"] as? String
        )
    }

    /**
     * Adds a player to shortlist. Returns true if added, false if already in shortlist.
     */
    suspend fun addToShortlist(release: LatestTransferModel): Boolean {
        val url = release.playerUrl ?: return false
        val docRef = shortlistDocRef()
        val snapshot = docRef.get().await()
        @Suppress("UNCHECKED_CAST")
        val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.toMutableList() ?: mutableListOf()
        if (current.any { (it["tmProfileUrl"] as? String) == url }) return false
        val entryMap = mutableMapOf<String, Any>(
            "tmProfileUrl" to url,
            "addedAt" to System.currentTimeMillis()
        )
        release.playerImage?.takeIf { it.isNotBlank() }?.let { entryMap["playerImage"] = it }
        release.playerName?.takeIf { it.isNotBlank() }?.let { entryMap["playerName"] = it }
        release.playerPosition?.takeIf { it.isNotBlank() }?.let { entryMap["playerPosition"] = it }
        release.playerAge?.takeIf { it.isNotBlank() }?.let { entryMap["playerAge"] = it }
        release.playerNationality?.takeIf { it.isNotBlank() }?.let { entryMap["playerNationality"] = it }
        release.playerNationalityFlag?.takeIf { it.isNotBlank() }?.let { entryMap["playerNationalityFlag"] = it }
        release.clubJoinedLogo?.takeIf { it.isNotBlank() }?.let { entryMap["clubJoinedLogo"] = it }
        release.clubJoinedName?.takeIf { it.isNotBlank() }?.let { entryMap["clubJoinedName"] = it }
        release.transferDate?.takeIf { it.isNotBlank() }?.let { entryMap["transferDate"] = it }
        release.marketValue?.takeIf { it.isNotBlank() }?.let { entryMap["marketValue"] = it }
        current.add(entryMap)
        docRef.set(mapOf("entries" to current)).await()
        return true
    }

    /**
     * Add a player to shortlist by URL only (e.g. from manual paste).
     * Stores minimal data; display will show Profile #ID until enriched from other sources.
     */
    suspend fun addToShortlist(tmProfileUrl: String) {
        val url = tmProfileUrl.trim().takeIf { it.isNotBlank() } ?: return
        if (!url.contains("transfermarkt", ignoreCase = true)) return
        val docRef = shortlistDocRef()
        val snapshot = docRef.get().await()
        @Suppress("UNCHECKED_CAST")
        val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.toMutableList() ?: mutableListOf()
        if (current.any { (it["tmProfileUrl"] as? String) == url }) return
        current.add(mapOf(
            "tmProfileUrl" to url,
            "addedAt" to System.currentTimeMillis()
        ))
        docRef.set(mapOf("entries" to current)).await()
    }

    suspend fun removeFromShortlist(tmProfileUrl: String) {
        val docRef = shortlistDocRef()
        val snapshot = docRef.get().await()
        @Suppress("UNCHECKED_CAST")
        val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.toMutableList() ?: return
        current.removeAll { (it["tmProfileUrl"] as? String) == tmProfileUrl }
        docRef.set(mapOf("entries" to current)).await()
    }

    suspend fun isInShortlist(tmProfileUrl: String): Boolean {
        val snapshot = shortlistDocRef().get().await()
        @Suppress("UNCHECKED_CAST")
        val list = snapshot.get("entries") as? List<Map<String, Any>> ?: return false
        return list.any { (it["tmProfileUrl"] as? String) == tmProfileUrl }
    }
}
