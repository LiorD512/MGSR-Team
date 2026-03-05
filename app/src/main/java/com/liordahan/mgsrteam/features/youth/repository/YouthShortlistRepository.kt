package com.liordahan.mgsrteam.features.youth.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.youth.data.YouthFirebaseHandler
import com.liordahan.mgsrteam.features.youth.models.YouthFeedEvent
import com.liordahan.mgsrteam.features.youth.models.YouthShortlistEntry
import com.liordahan.mgsrteam.features.youth.models.YouthShortlistNote
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Youth-dedicated shortlist repository.
 * Hardcoded to "ShortlistsYouth" collection — no PlatformManager dependency.
 */
class YouthShortlistRepository(
    private val firebaseHandler: YouthFirebaseHandler
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

    fun getShortlistFlow(): Flow<List<YouthShortlistEntry>> = callbackFlow {
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
    private fun parseEntryFromMap(map: Map<String, Any>): YouthShortlistEntry? {
        val url = map["tmProfileUrl"] as? String ?: return null
        val addedAt = (map["addedAt"] as? Number)?.toLong() ?: 0L
        val notesList = (map["notes"] as? List<Map<String, Any>>)?.mapNotNull { noteMap ->
            val text = noteMap["text"] as? String ?: return@mapNotNull null
            YouthShortlistNote(
                text = text,
                createdBy = noteMap["createdBy"] as? String,
                createdByHebrewName = noteMap["createdByHebrewName"] as? String,
                createdById = noteMap["createdById"] as? String,
                createdAt = (noteMap["createdAt"] as? Number)?.toLong() ?: 0L
            )
        } ?: emptyList()
        return YouthShortlistEntry(
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

    suspend fun addToShortlistByUrl(tmProfileUrl: String) {
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + tmProfileUrl
        try {
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val entries = snapshot.getEntriesList().toMutableList()
            if (entries.any { (it["tmProfileUrl"] as? String) == tmProfileUrl }) {
                _shortlistPendingUrls.value = _shortlistPendingUrls.value - tmProfileUrl
                return
            }
            val agentInfo = getAgentInfo()
            val newEntry = mapOf(
                "tmProfileUrl" to tmProfileUrl,
                "addedAt" to System.currentTimeMillis(),
                "addedByAgentId" to (agentInfo?.first ?: ""),
                "addedByAgentName" to (agentInfo?.second ?: ""),
                "addedByAgentHebrewName" to (agentInfo?.third ?: ""),
                "notes" to emptyList<Map<String, Any>>()
            )
            entries.add(0, newEntry)
            docRef.set(mapOf("entries" to entries)).await()
            writeFeedEvent(YouthFeedEvent.TYPE_SHORTLIST_ADDED, tmProfileUrl, agentInfo?.second)
        } catch (_: Exception) { }
        _shortlistPendingUrls.value = _shortlistPendingUrls.value - tmProfileUrl
    }

    suspend fun removeFromShortlist(tmProfileUrl: String) {
        try {
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val entries = snapshot.getEntriesList().toMutableList()
            entries.removeAll { (it["tmProfileUrl"] as? String) == tmProfileUrl }
            docRef.set(mapOf("entries" to entries)).await()
            val agentInfo = getAgentInfo()
            writeFeedEvent(YouthFeedEvent.TYPE_SHORTLIST_REMOVED, tmProfileUrl, agentInfo?.second)
        } catch (_: Exception) { }
    }

    suspend fun addNoteToEntry(tmProfileUrl: String, text: String) {
        try {
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val entries = snapshot.getEntriesList().toMutableList()
            val index = entries.indexOfFirst { (it["tmProfileUrl"] as? String) == tmProfileUrl }
            if (index < 0) return
            val agentInfo = getAgentInfo()
            @Suppress("UNCHECKED_CAST")
            val notes = ((entries[index]["notes"] as? List<Map<String, Any>>) ?: emptyList()).toMutableList()
            notes.add(
                mapOf(
                    "text" to text,
                    "createdBy" to (agentInfo?.second ?: ""),
                    "createdByHebrewName" to (agentInfo?.third ?: ""),
                    "createdById" to (agentInfo?.first ?: ""),
                    "createdAt" to System.currentTimeMillis()
                )
            )
            entries[index] = entries[index].toMutableMap().apply { put("notes", notes) }
            docRef.set(mapOf("entries" to entries)).await()
        } catch (_: Exception) { }
    }

    suspend fun updateNoteInEntry(tmProfileUrl: String, noteIndex: Int, newText: String) {
        try {
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val entries = snapshot.getEntriesList().toMutableList()
            val entryIndex = entries.indexOfFirst { (it["tmProfileUrl"] as? String) == tmProfileUrl }
            if (entryIndex < 0) return
            @Suppress("UNCHECKED_CAST")
            val notes = ((entries[entryIndex]["notes"] as? List<Map<String, Any>>) ?: emptyList()).toMutableList()
            if (noteIndex !in notes.indices) return
            notes[noteIndex] = notes[noteIndex].toMutableMap().apply { put("text", newText) }
            entries[entryIndex] = entries[entryIndex].toMutableMap().apply { put("notes", notes) }
            docRef.set(mapOf("entries" to entries)).await()
        } catch (_: Exception) { }
    }

    suspend fun deleteNoteFromEntry(tmProfileUrl: String, noteIndex: Int) {
        try {
            val docRef = shortlistDocRef()
            val snapshot = docRef.get().await()
            val entries = snapshot.getEntriesList().toMutableList()
            val entryIndex = entries.indexOfFirst { (it["tmProfileUrl"] as? String) == tmProfileUrl }
            if (entryIndex < 0) return
            @Suppress("UNCHECKED_CAST")
            val notes = ((entries[entryIndex]["notes"] as? List<Map<String, Any>>) ?: emptyList()).toMutableList()
            if (noteIndex !in notes.indices) return
            notes.removeAt(noteIndex)
            entries[entryIndex] = entries[entryIndex].toMutableMap().apply { put("notes", notes) }
            docRef.set(mapOf("entries" to entries)).await()
        } catch (_: Exception) { }
    }

    private suspend fun getAgentInfo(): Triple<String, String, String>? {
        val user = FirebaseAuth.getInstance().currentUser ?: return null
        return try {
            val snapshot = store.collection(firebaseHandler.accountsTable).get().await()
            val account = snapshot.toObjects(Account::class.java)
                .firstOrNull { it.email?.equals(user.email, ignoreCase = true) == true }
            Triple(
                account?.id ?: user.uid,
                account?.name ?: user.displayName ?: "",
                account?.hebrewName ?: ""
            )
        } catch (_: Exception) {
            Triple(user.uid, user.displayName ?: "", "")
        }
    }

    private fun writeFeedEvent(type: String, tmProfileUrl: String, agentName: String?) {
        try {
            store.collection(firebaseHandler.feedEventsTable).add(
                YouthFeedEvent(
                    type = type,
                    playerTmProfile = tmProfileUrl,
                    timestamp = System.currentTimeMillis(),
                    agentName = agentName
                )
            )
        } catch (_: Exception) { }
    }
}
