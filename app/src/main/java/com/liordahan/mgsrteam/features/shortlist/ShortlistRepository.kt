package com.liordahan.mgsrteam.features.shortlist

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.liordahan.mgsrteam.features.home.models.FeedEvent
import com.liordahan.mgsrteam.features.login.models.Account
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.tasks.await

data class ShortlistNote(
    val text: String,
    val createdBy: String? = null,
    val createdByHebrewName: String? = null,
    val createdById: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

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
    val marketValue: String? = null,
    val addedByAgentId: String? = null,
    val addedByAgentName: String? = null,
    val addedByAgentHebrewName: String? = null,
    val notes: List<ShortlistNote> = emptyList()
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

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class ShortlistRepository(
    private val firebaseHandler: FirebaseHandler,
    private val platformManager: PlatformManager
) {

    private val store = FirebaseFirestore.getInstance()

    private val _shortlistPendingUrls = MutableStateFlow<Set<String>>(emptySet())
    /** URLs currently being added or removed. Use for loading overlay on list items. */
    fun getShortlistPendingUrlsFlow(): Flow<Set<String>> = _shortlistPendingUrls.asStateFlow()

    /** Shared shortlist document ID - all agents see the same shortlist (matches web). */
    private val sharedShortlistDocId = "team"

    private fun shortlistDocRef() =
        store.collection(firebaseHandler.shortlistsTable).document(sharedShortlistDocId)

    @Suppress("UNCHECKED_CAST")
    private fun DocumentSnapshot?.getEntriesList(): List<Map<String, Any>> =
        (this?.get("entries") as? List<Map<String, Any>>) ?: emptyList()

    /**
     * Auto-reconnects on platform switch so the listener always targets
     * the correct Shortlists collection.
     */
    fun getShortlistFlow(): Flow<List<ShortlistEntry>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
                val docRef = shortlistDocRef()
                val listener = docRef.addSnapshotListener { snapshot, _ ->
                    val list = snapshot.getEntriesList()
                    val entries = list.mapNotNull { map ->
                        parseEntryFromMap(map)
                    }.sortedByDescending { it.addedAt }
                    trySend(entries)
                }
                awaitClose { listener.remove() }
            }
        }

    @Suppress("UNCHECKED_CAST")
    private fun parseEntryFromMap(map: Map<String, Any>): ShortlistEntry? {
        val url = map["tmProfileUrl"] as? String ?: return null
        val addedAt = (map["addedAt"] as? Number)?.toLong() ?: 0L
        @Suppress("UNCHECKED_CAST")
        val notesList = (map["notes"] as? List<Map<String, Any>>)?.mapNotNull { noteMap ->
            val text = noteMap["text"] as? String ?: return@mapNotNull null
            ShortlistNote(
                text = text,
                createdBy = noteMap["createdBy"] as? String,
                createdByHebrewName = noteMap["createdByHebrewName"] as? String,
                createdById = noteMap["createdById"] as? String,
                createdAt = (noteMap["createdAt"] as? Number)?.toLong() ?: 0L
            )
        } ?: emptyList()
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
            marketValue = map["marketValue"] as? String,
            addedByAgentId = map["addedByAgentId"] as? String,
            addedByAgentName = map["addedByAgentName"] as? String,
            addedByAgentHebrewName = map["addedByAgentHebrewName"] as? String,
            notes = notesList
        )
    }

    sealed class AddToShortlistResult {
        object Added : AddToShortlistResult()
        object AlreadyInShortlist : AddToShortlistResult()
        object AlreadyInRoster : AddToShortlistResult()
    }

    /**
     * Adds a player to shortlist.
     */
    suspend fun addToShortlist(release: LatestTransferModel): AddToShortlistResult {
        val url = release.playerUrl ?: return AddToShortlistResult.AlreadyInShortlist
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        return try {
            val rosterSnapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                .whereEqualTo("tmProfile", url)
                .get()
                .await()
            if (!rosterSnapshot.isEmpty) return AddToShortlistResult.AlreadyInRoster
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val current = snapshot.getEntriesList().toMutableList()
            if (current.any { (it["tmProfileUrl"] as? String) == url }) return AddToShortlistResult.AlreadyInShortlist
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
            getCurrentUserAccount()?.let { acc ->
                acc.id?.let { entryMap["addedByAgentId"] = it }
                acc.name?.takeIf { it.isNotBlank() }?.let { entryMap["addedByAgentName"] = it }
                acc.hebrewName?.takeIf { it.isNotBlank() }?.let { entryMap["addedByAgentHebrewName"] = it }
            }
            current.add(entryMap)
            docRef.set(mapOf("entries" to current)).await()
            writeFeedEventShortlist(
                playerName = release.playerName,
                playerImage = release.playerImage,
                playerTmProfile = url,
                agentName = getCurrentUserAccountName()
            )
            AddToShortlistResult.Added
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    /**
     * Add a player to shortlist by URL only (e.g. from manual paste).
     * Stores minimal data; display will show Profile #ID until enriched from other sources.
     * Returns AddToShortlistResult.
     */
    suspend fun addToShortlistByUrl(tmProfileUrl: String): AddToShortlistResult {
        val url = tmProfileUrl.trim().takeIf { it.isNotBlank() } ?: return AddToShortlistResult.AlreadyInShortlist
        if (!url.contains("transfermarkt", ignoreCase = true)) return AddToShortlistResult.AlreadyInShortlist
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        return try {
            val rosterSnapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                .whereEqualTo("tmProfile", url)
                .get()
                .await()
            if (!rosterSnapshot.isEmpty) return AddToShortlistResult.AlreadyInRoster
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val current = snapshot.getEntriesList().toMutableList()
            if (current.any { (it["tmProfileUrl"] as? String) == url }) return AddToShortlistResult.AlreadyInShortlist
            val urlEntryMap = mutableMapOf<String, Any>(
                "tmProfileUrl" to url,
                "addedAt" to System.currentTimeMillis()
            )
            getCurrentUserAccount()?.let { acc ->
                acc.id?.let { urlEntryMap["addedByAgentId"] = it }
                acc.name?.takeIf { it.isNotBlank() }?.let { urlEntryMap["addedByAgentName"] = it }
                acc.hebrewName?.takeIf { it.isNotBlank() }?.let { urlEntryMap["addedByAgentHebrewName"] = it }
            }
            current.add(urlEntryMap)
            docRef.set(mapOf("entries" to current)).await()
            writeFeedEventShortlist(playerName = null, playerImage = null, playerTmProfile = url, agentName = getCurrentUserAccountName())
            AddToShortlistResult.Added
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    /** @deprecated Use addToShortlistByUrl for result. Kept for backward compatibility. */
    @Deprecated("Use addToShortlistByUrl", ReplaceWith("addToShortlistByUrl(tmProfileUrl)"))
    suspend fun addToShortlist(tmProfileUrl: String) {
        addToShortlistByUrl(tmProfileUrl)
    }

    private suspend fun getCurrentUserAccount(): Account? {
        val email = FirebaseAuth.getInstance().currentUser?.email ?: return null
        val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
        return snapshot.toObjects(Account::class.java)
            .firstOrNull { it.email?.equals(email, ignoreCase = true) == true }
    }

    private suspend fun getCurrentUserAccountName(): String? =
        getCurrentUserAccount()?.name

    private fun writeFeedEventShortlist(
        playerName: String?,
        playerImage: String?,
        playerTmProfile: String,
        agentName: String?
    ) {
        try {
            val resolvedAgent = agentName ?: FirebaseAuth.getInstance().currentUser?.displayName
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                FeedEvent(
                    type = FeedEvent.TYPE_SHORTLIST_ADDED,
                    playerName = playerName,
                    playerImage = playerImage,
                    playerTmProfile = playerTmProfile,
                    timestamp = System.currentTimeMillis(),
                    agentName = resolvedAgent
                )
            )
        } catch (_: Exception) { /* fire-and-forget */ }
    }

    private fun writeFeedEventShortlistRemoved(
        playerName: String?,
        playerImage: String?,
        playerTmProfile: String,
        agentName: String?
    ) {
        try {
            val resolvedAgent = agentName ?: FirebaseAuth.getInstance().currentUser?.displayName
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                FeedEvent(
                    type = FeedEvent.TYPE_SHORTLIST_REMOVED,
                    playerName = playerName,
                    playerImage = playerImage,
                    playerTmProfile = playerTmProfile,
                    timestamp = System.currentTimeMillis(),
                    agentName = resolvedAgent
                )
            )
        } catch (_: Exception) { /* fire-and-forget */ }
    }

    suspend fun removeFromShortlist(tmProfileUrl: String) {
        val url = tmProfileUrl.trim().takeIf { it.isNotBlank() } ?: return
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        try {
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val current = snapshot.getEntriesList().toMutableList()
            if (current.isEmpty()) return
            val entry = current.find { (it["tmProfileUrl"] as? String) == url }
            val playerName = entry?.get("playerName") as? String
            val playerImage = entry?.get("playerImage") as? String
            current.removeAll { (it["tmProfileUrl"] as? String) == url }
            docRef.set(mapOf("entries" to current)).await()
            writeFeedEventShortlistRemoved(
                playerName = playerName?.takeIf { it.isNotBlank() },
                playerImage = playerImage?.takeIf { it.isNotBlank() },
                playerTmProfile = url,
                agentName = getCurrentUserAccountName()
            )
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    suspend fun isInShortlist(tmProfileUrl: String): Boolean {
        val snapshot = shortlistDocRef().get().await()
        return snapshot.getEntriesList().any { (it["tmProfileUrl"] as? String) == tmProfileUrl }
    }

    // ── Notes CRUD ──────────────────────────────────────────────────────────

    @Suppress("UNCHECKED_CAST")
    suspend fun addNoteToEntry(tmProfileUrl: String, noteText: String) {
        val docRef = shortlistDocRef()
        val account = getCurrentUserAccount()
        store.runTransaction { transaction ->
            val snapshot = transaction.get(docRef)
            val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.map { it.toMutableMap() }?.toMutableList() ?: return@runTransaction
            val idx = current.indexOfFirst { (it["tmProfileUrl"] as? String) == tmProfileUrl }
            if (idx == -1) return@runTransaction
            val entry = current[idx].toMutableMap()
            val notes = ((entry["notes"] as? List<Map<String, Any>>) ?: emptyList()).map { it.toMutableMap() }.toMutableList()
            val noteMap = mutableMapOf<String, Any>(
                "text" to noteText,
                "createdAt" to System.currentTimeMillis()
            )
            account?.let { acc ->
                acc.id?.let { noteMap["createdById"] = it }
                acc.name?.takeIf { it.isNotBlank() }?.let { noteMap["createdBy"] = it }
                acc.hebrewName?.takeIf { it.isNotBlank() }?.let { noteMap["createdByHebrewName"] = it }
            }
            notes.add(noteMap)
            entry["notes"] = notes
            current[idx] = entry
            transaction.set(docRef, mapOf("entries" to current))
        }.await()
    }

    @Suppress("UNCHECKED_CAST")
    suspend fun updateNoteInEntry(tmProfileUrl: String, noteIndex: Int, newText: String) {
        val docRef = shortlistDocRef()
        store.runTransaction { transaction ->
            val snapshot = transaction.get(docRef)
            val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.map { it.toMutableMap() }?.toMutableList() ?: return@runTransaction
            val idx = current.indexOfFirst { (it["tmProfileUrl"] as? String) == tmProfileUrl }
            if (idx == -1) return@runTransaction
            val entry = current[idx].toMutableMap()
            val notes = ((entry["notes"] as? List<Map<String, Any>>) ?: emptyList()).map { it.toMutableMap() }.toMutableList()
            if (noteIndex !in notes.indices) return@runTransaction
            val updatedNote = notes[noteIndex].toMutableMap()
            updatedNote["text"] = newText
            notes[noteIndex] = updatedNote
            entry["notes"] = notes
            current[idx] = entry
            transaction.set(docRef, mapOf("entries" to current))
        }.await()
    }

    @Suppress("UNCHECKED_CAST")
    suspend fun deleteNoteFromEntry(tmProfileUrl: String, noteIndex: Int) {
        val docRef = shortlistDocRef()
        store.runTransaction { transaction ->
            val snapshot = transaction.get(docRef)
            val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.map { it.toMutableMap() }?.toMutableList() ?: return@runTransaction
            val idx = current.indexOfFirst { (it["tmProfileUrl"] as? String) == tmProfileUrl }
            if (idx == -1) return@runTransaction
            val entry = current[idx].toMutableMap()
            val notes = ((entry["notes"] as? List<Map<String, Any>>) ?: emptyList()).map { it.toMutableMap() }.toMutableList()
            if (noteIndex !in notes.indices) return@runTransaction
            notes.removeAt(noteIndex)
            entry["notes"] = notes
            current[idx] = entry
            transaction.set(docRef, mapOf("entries" to current))
        }.await()
    }
}
