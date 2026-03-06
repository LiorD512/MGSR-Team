package com.liordahan.mgsrteam.features.youth.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
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
 * Each shortlist entry is stored as its own Firestore document.
 */
class YouthShortlistRepository(
    private val firebaseHandler: YouthFirebaseHandler
) {

    private val store = FirebaseFirestore.getInstance()

    private val _shortlistPendingUrls = MutableStateFlow<Set<String>>(emptySet())
    fun getShortlistPendingUrlsFlow(): Flow<Set<String>> = _shortlistPendingUrls.asStateFlow()

    private fun shortlistCollection() =
        store.collection(firebaseHandler.shortlistsTable)

    // ── Migration from legacy single-document format ────────────────────

    @Suppress("UNCHECKED_CAST")
    suspend fun migrateFromLegacyIfNeeded() {
        try {
            val legacyDoc = shortlistCollection().document("team").get().await()
            if (!legacyDoc.exists()) return
            val entries = (legacyDoc.get("entries") as? List<Map<String, Any>>)
            if (entries.isNullOrEmpty()) {
                shortlistCollection().document("team").delete().await()
                return
            }

            val existingSnap = shortlistCollection().get().await()
            val existingUrls = mutableSetOf<String>()
            val duplicateRefs = mutableListOf<com.google.firebase.firestore.DocumentReference>()
            for (doc in existingSnap.documents) {
                if (doc.id == "team") continue
                val url = doc.getString("tmProfileUrl") ?: continue
                if (!existingUrls.add(url)) {
                    duplicateRefs.add(doc.reference)
                }
            }

            val batch = store.batch()
            for (entry in entries) {
                val url = entry["tmProfileUrl"] as? String ?: continue
                if (existingUrls.contains(url)) continue
                existingUrls.add(url)
                batch.set(shortlistCollection().document(), entry)
            }
            for (ref in duplicateRefs) {
                batch.delete(ref)
            }
            batch.delete(legacyDoc.reference)
            batch.commit().await()
        } catch (_: Exception) { /* migration is best-effort */ }
    }

    // ── Read ─────────────────────────────────────────────────────────────

    fun getShortlistFlow(): Flow<List<YouthShortlistEntry>> = callbackFlow {
        val listener: ListenerRegistration = shortlistCollection()
            .addSnapshotListener { value, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                val seen = mutableSetOf<String>()
                val entries = value?.documents?.mapNotNull { doc ->
                    parseEntryFromMap(doc.data ?: return@mapNotNull null)
                }?.filter { seen.add(it.tmProfileUrl) }
                    ?.sortedByDescending { it.addedAt } ?: emptyList()
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

    // ── Write ────────────────────────────────────────────────────────────

    suspend fun addToShortlistByUrl(tmProfileUrl: String) {
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + tmProfileUrl
        try {
            val existing = shortlistCollection()
                .whereEqualTo("tmProfileUrl", tmProfileUrl).get().await()
            if (!existing.isEmpty) {
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
            shortlistCollection().add(newEntry).await()
            writeFeedEvent(YouthFeedEvent.TYPE_SHORTLIST_ADDED, tmProfileUrl, agentInfo?.second)
        } catch (_: Exception) { }
        _shortlistPendingUrls.value = _shortlistPendingUrls.value - tmProfileUrl
    }

    suspend fun removeFromShortlist(tmProfileUrl: String) {
        try {
            val querySnapshot = shortlistCollection()
                .whereEqualTo("tmProfileUrl", tmProfileUrl).get().await()
            for (doc in querySnapshot.documents) {
                doc.reference.delete().await()
            }
            val agentInfo = getAgentInfo()
            writeFeedEvent(YouthFeedEvent.TYPE_SHORTLIST_REMOVED, tmProfileUrl, agentInfo?.second)
        } catch (_: Exception) { }
    }

    // ── Notes CRUD ──────────────────────────────────────────────────────────

    private suspend fun findDocByUrl(tmProfileUrl: String) =
        shortlistCollection().whereEqualTo("tmProfileUrl", tmProfileUrl)
            .get().await().documents.firstOrNull()

    @Suppress("UNCHECKED_CAST")
    suspend fun addNoteToEntry(tmProfileUrl: String, text: String) {
        try {
            val docSnapshot = findDocByUrl(tmProfileUrl) ?: return
            val docRef = docSnapshot.reference
            val agentInfo = getAgentInfo()
            store.runTransaction { transaction ->
                val snapshot = transaction.get(docRef)
                val notes = ((snapshot.get("notes") as? List<Map<String, Any>>) ?: emptyList())
                    .map { it.toMutableMap() }.toMutableList()
                notes.add(
                    hashMapOf<String, Any>(
                        "text" to text,
                        "createdBy" to (agentInfo?.second ?: ""),
                        "createdByHebrewName" to (agentInfo?.third ?: ""),
                        "createdById" to (agentInfo?.first ?: ""),
                        "createdAt" to System.currentTimeMillis()
                    )
                )
                transaction.update(docRef, "notes", notes)
            }.await()
        } catch (_: Exception) { }
    }

    @Suppress("UNCHECKED_CAST")
    suspend fun updateNoteInEntry(tmProfileUrl: String, noteIndex: Int, newText: String) {
        try {
            val docSnapshot = findDocByUrl(tmProfileUrl) ?: return
            val docRef = docSnapshot.reference
            store.runTransaction { transaction ->
                val snapshot = transaction.get(docRef)
                val notes = ((snapshot.get("notes") as? List<Map<String, Any>>) ?: emptyList())
                    .map { it.toMutableMap() }.toMutableList()
                if (noteIndex !in notes.indices) return@runTransaction
                notes[noteIndex] = notes[noteIndex].toMutableMap().apply { put("text", newText) }
                transaction.update(docRef, "notes", notes)
            }.await()
        } catch (_: Exception) { }
    }

    @Suppress("UNCHECKED_CAST")
    suspend fun deleteNoteFromEntry(tmProfileUrl: String, noteIndex: Int) {
        try {
            val docSnapshot = findDocByUrl(tmProfileUrl) ?: return
            val docRef = docSnapshot.reference
            store.runTransaction { transaction ->
                val snapshot = transaction.get(docRef)
                val notes = ((snapshot.get("notes") as? List<Map<String, Any>>) ?: emptyList())
                    .map { it.toMutableMap() }.toMutableList()
                if (noteIndex !in notes.indices) return@runTransaction
                notes.removeAt(noteIndex)
                transaction.update(docRef, "notes", notes)
            }.await()
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
