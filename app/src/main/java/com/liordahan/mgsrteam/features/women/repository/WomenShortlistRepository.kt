package com.liordahan.mgsrteam.features.women.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.women.data.WomenFirebaseHandler
import com.liordahan.mgsrteam.features.women.models.WomenFeedEvent
import com.liordahan.mgsrteam.features.women.models.WomenShortlistEntry
import com.liordahan.mgsrteam.features.women.models.WomenShortlistNote
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Women-dedicated shortlist repository.
 * Hardcoded to "ShortlistsWomen" collection — no PlatformManager dependency.
 */
class WomenShortlistRepository(
    private val firebaseHandler: WomenFirebaseHandler
) {

    private val store = FirebaseFirestore.getInstance()

    private val _shortlistPendingUrls = MutableStateFlow<Set<String>>(emptySet())
    fun getShortlistPendingUrlsFlow(): Flow<Set<String>> = _shortlistPendingUrls.asStateFlow()

    private val sharedShortlistDocId = "team"

    private fun shortlistDocRef() =
        store.collection(firebaseHandler.shortlistsTable).document(sharedShortlistDocId)

    @Suppress("UNCHECKED_CAST")
    private fun DocumentSnapshot?.getEntriesList(): List<Map<String, Any>> =
        (this?.get("entries") as? List<Map<String, Any>>) ?: emptyList()

    fun getShortlistFlow(): Flow<List<WomenShortlistEntry>> = callbackFlow {
        val docRef = shortlistDocRef()
        val listener = docRef.addSnapshotListener { snapshot, _ ->
            val list = snapshot.getEntriesList()
            val entries = list.mapNotNull { map -> parseEntryFromMap(map) }
                .sortedByDescending { it.addedAt }
            trySend(entries)
        }
        awaitClose { listener.remove() }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseEntryFromMap(map: Map<String, Any>): WomenShortlistEntry? {
        val url = map["tmProfileUrl"] as? String ?: return null
        val addedAt = (map["addedAt"] as? Number)?.toLong() ?: 0L
        val notesList = (map["notes"] as? List<Map<String, Any>>)?.mapNotNull { noteMap ->
            val text = noteMap["text"] as? String ?: return@mapNotNull null
            WomenShortlistNote(
                text = text,
                createdBy = noteMap["createdBy"] as? String,
                createdByHebrewName = noteMap["createdByHebrewName"] as? String,
                createdById = noteMap["createdById"] as? String,
                createdAt = (noteMap["createdAt"] as? Number)?.toLong() ?: 0L
            )
        } ?: emptyList()
        return WomenShortlistEntry(
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

    suspend fun addToShortlist(release: LatestTransferModel): AddToShortlistResult {
        val url = release.playerUrl ?: return AddToShortlistResult.AlreadyInShortlist
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        return try {
            val rosterSnapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                .whereEqualTo("tmProfile", url).get().await()
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
            writeFeedEventShortlist(release.playerName, release.playerImage, url, getCurrentUserAccountName())
            AddToShortlistResult.Added
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    suspend fun addToShortlistByUrl(tmProfileUrl: String): AddToShortlistResult {
        val url = tmProfileUrl.trim().takeIf { it.isNotBlank() } ?: return AddToShortlistResult.AlreadyInShortlist
        if (!url.contains("transfermarkt", ignoreCase = true)) return AddToShortlistResult.AlreadyInShortlist
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        return try {
            val rosterSnapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.playersTable)
                .whereEqualTo("tmProfile", url).get().await()
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
            writeFeedEventShortlist(null, null, url, getCurrentUserAccountName())
            AddToShortlistResult.Added
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    private suspend fun getCurrentUserAccount(): Account? {
        val email = FirebaseAuth.getInstance().currentUser?.email ?: return null
        val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get().await()
        return snapshot.toObjects(Account::class.java)
            .firstOrNull { it.email?.equals(email, ignoreCase = true) == true }
    }

    private suspend fun getCurrentUserAccountName(): String? = getCurrentUserAccount()?.name

    private fun writeFeedEventShortlist(playerName: String?, playerImage: String?, playerTmProfile: String, agentName: String?) {
        try {
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                WomenFeedEvent(
                    type = WomenFeedEvent.TYPE_SHORTLIST_ADDED,
                    playerName = playerName,
                    playerImage = playerImage,
                    playerTmProfile = playerTmProfile,
                    timestamp = System.currentTimeMillis(),
                    agentName = agentName ?: FirebaseAuth.getInstance().currentUser?.displayName
                )
            )
        } catch (_: Exception) {}
    }

    private fun writeFeedEventShortlistRemoved(playerName: String?, playerImage: String?, playerTmProfile: String, agentName: String?) {
        try {
            firebaseHandler.firebaseStore.collection(firebaseHandler.feedEventsTable).add(
                WomenFeedEvent(
                    type = WomenFeedEvent.TYPE_SHORTLIST_REMOVED,
                    playerName = playerName,
                    playerImage = playerImage,
                    playerTmProfile = playerTmProfile,
                    timestamp = System.currentTimeMillis(),
                    agentName = agentName ?: FirebaseAuth.getInstance().currentUser?.displayName
                )
            )
        } catch (_: Exception) {}
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
            writeFeedEventShortlistRemoved(playerName?.takeIf { it.isNotBlank() }, playerImage?.takeIf { it.isNotBlank() }, url, getCurrentUserAccountName())
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
            val noteMap = mutableMapOf<String, Any>("text" to noteText, "createdAt" to System.currentTimeMillis())
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
