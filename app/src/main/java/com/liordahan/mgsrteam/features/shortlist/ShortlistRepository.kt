package com.liordahan.mgsrteam.features.shortlist

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.platform.PlatformManager
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.firebase.SharedCallables
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
    val notes: List<ShortlistNote> = emptyList(),
    val instagramHandle: String? = null,
    val instagramUrl: String? = null,
    val instagramSentAt: Long? = null
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

    private fun shortlistCollection() =
        store.collection(firebaseHandler.shortlistsTable)

    // ── Migration from legacy single-document format ────────────────────

    /**
     * One-time migration: reads the old "team" document's entries array
     * and writes each entry as its own document. Deletes the legacy doc after.
     * Safe to call multiple times (idempotent).
     */
    @Suppress("UNCHECKED_CAST")
    suspend fun migrateFromLegacyIfNeeded() {
        try {
            val legacyDoc = shortlistCollection().document("team").get().await()
            if (!legacyDoc.exists()) return
            val entries = (legacyDoc.get("entries") as? List<Map<String, Any>>)
            if (entries.isNullOrEmpty()) {
                // team doc exists but has no entries — just delete it
                shortlistCollection().document("team").delete().await()
                return
            }

            // Check which URLs already have individual docs (handles partial/duplicate migration)
            val existingSnap = shortlistCollection().get().await()
            val existingUrls = mutableSetOf<String>()
            val duplicateRefs = mutableListOf<com.google.firebase.firestore.DocumentReference>()
            for (doc in existingSnap.documents) {
                if (doc.id == "team") continue
                val url = doc.getString("tmProfileUrl") ?: continue
                if (!existingUrls.add(url)) {
                    duplicateRefs.add(doc.reference) // duplicate — mark for deletion
                }
            }

            val batch = store.batch()
            // Write only entries that don't already exist as individual docs
            for (entry in entries) {
                val url = entry["tmProfileUrl"] as? String ?: continue
                if (existingUrls.contains(url)) continue
                existingUrls.add(url)
                batch.set(shortlistCollection().document(), entry)
            }
            // Delete duplicates found
            for (ref in duplicateRefs) {
                batch.delete(ref)
            }
            // Delete team doc in the same atomic batch
            batch.delete(legacyDoc.reference)
            batch.commit().await()
        } catch (_: Exception) { /* migration is best-effort */ }
    }

    // ── Read ─────────────────────────────────────────────────────────────

    /**
     * Auto-reconnects on platform switch so the listener always targets
     * the correct Shortlists collection.
     * Each shortlist entry is now its own document in the collection.
     */
    fun getShortlistFlow(): Flow<List<ShortlistEntry>> =
        platformManager.current.flatMapLatest {
            callbackFlow {
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
            notes = notesList,
            instagramHandle = map["instagramHandle"] as? String,
            instagramUrl = map["instagramUrl"] as? String,
            instagramSentAt = (map["instagramSentAt"] as? Number)?.toLong()
        )
    }

    // ── Write ────────────────────────────────────────────────────────────

    sealed class AddToShortlistResult {
        object Added : AddToShortlistResult()
        object AlreadyInShortlist : AddToShortlistResult()
        object AlreadyInRoster : AddToShortlistResult()
    }

    /**
     * Adds a player to shortlist as an individual document.
     */
    suspend fun addToShortlist(release: LatestTransferModel): AddToShortlistResult {
        val url = release.playerUrl ?: return AddToShortlistResult.AlreadyInShortlist
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        return try {
            val fields = mutableMapOf<String, Any?>()
            release.playerImage?.takeIf { it.isNotBlank() }?.let { fields["playerImage"] = it }
            release.playerName?.takeIf { it.isNotBlank() }?.let { fields["playerName"] = it }
            release.playerPosition?.takeIf { it.isNotBlank() }?.let { fields["playerPosition"] = it }
            release.playerAge?.takeIf { it.isNotBlank() }?.let { fields["playerAge"] = it }
            release.playerNationality?.takeIf { it.isNotBlank() }?.let { fields["playerNationality"] = it }
            release.playerNationalityFlag?.takeIf { it.isNotBlank() }?.let { fields["playerNationalityFlag"] = it }
            release.clubJoinedLogo?.takeIf { it.isNotBlank() }?.let { fields["clubJoinedLogo"] = it }
            release.clubJoinedName?.takeIf { it.isNotBlank() }?.let { fields["clubJoinedName"] = it }
            release.transferDate?.takeIf { it.isNotBlank() }?.let { fields["transferDate"] = it }
            release.marketValue?.takeIf { it.isNotBlank() }?.let { fields["marketValue"] = it }
            getCurrentUserAccount()?.let { acc ->
                acc.id?.let { fields["addedByAgentId"] = it }
                acc.name?.takeIf { it.isNotBlank() }?.let { fields["addedByAgentName"] = it }
                acc.hebrewName?.takeIf { it.isNotBlank() }?.let { fields["addedByAgentHebrewName"] = it }
            }
            val status = SharedCallables.shortlistAdd(platformManager.value, url, fields)
            when (status) {
                "already_in_roster" -> AddToShortlistResult.AlreadyInRoster
                "already_exists" -> AddToShortlistResult.AlreadyInShortlist
                else -> AddToShortlistResult.Added
            }
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    /**
     * Add a player to shortlist by URL only (e.g. from manual paste).
     * Stores minimal data; display will show Profile #ID until enriched from other sources.
     */
    suspend fun addToShortlistByUrl(tmProfileUrl: String): AddToShortlistResult {
        val url = tmProfileUrl.trim().takeIf { it.isNotBlank() } ?: return AddToShortlistResult.AlreadyInShortlist
        if (!url.contains("transfermarkt", ignoreCase = true)) return AddToShortlistResult.AlreadyInShortlist
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        return try {
            val fields = mutableMapOf<String, Any?>()
            getCurrentUserAccount()?.let { acc ->
                acc.id?.let { fields["addedByAgentId"] = it }
                acc.name?.takeIf { it.isNotBlank() }?.let { fields["addedByAgentName"] = it }
                acc.hebrewName?.takeIf { it.isNotBlank() }?.let { fields["addedByAgentHebrewName"] = it }
            }
            val status = SharedCallables.shortlistAdd(platformManager.value, url, fields)
            when (status) {
                "already_in_roster" -> AddToShortlistResult.AlreadyInRoster
                "already_exists" -> AddToShortlistResult.AlreadyInShortlist
                else -> AddToShortlistResult.Added
            }
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    /** @deprecated Use addToShortlistByUrl for result. Kept for backward compatibility. */
    @Deprecated("Use addToShortlistByUrl", ReplaceWith("addToShortlistByUrl(tmProfileUrl)"))
    suspend fun addToShortlist(tmProfileUrl: String) {
        addToShortlistByUrl(tmProfileUrl)
    }

    /**
     * Add a player to the shortlist from form data (Women / Youth).
     * Uses the provided URL as the tmProfileUrl identifier.
     * Checks for duplicates in shortlist and optionally in roster.
     */
    suspend fun addToShortlistFromForm(
        tmProfileUrl: String,
        playerName: String?,
        playerPosition: String?,
        playerAge: String?,
        playerNationality: String?,
        clubJoinedName: String?,
        marketValue: String?,
        playerImage: String?
    ): AddToShortlistResult {
        val url = tmProfileUrl.trim().takeIf { it.isNotBlank() } ?: return AddToShortlistResult.AlreadyInShortlist
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        return try {
            val fields = mutableMapOf<String, Any?>()
            playerImage?.let { fields["playerImage"] = it }
            playerName?.let { fields["playerName"] = it }
            playerPosition?.let { fields["playerPosition"] = it }
            playerAge?.let { fields["playerAge"] = it }
            playerNationality?.let { fields["playerNationality"] = it }
            clubJoinedName?.let { fields["clubJoinedName"] = it }
            marketValue?.let { fields["marketValue"] = it }
            getCurrentUserAccount()?.let { acc ->
                acc.id?.let { fields["addedByAgentId"] = it }
                acc.name?.takeIf { it.isNotBlank() }?.let { fields["addedByAgentName"] = it }
                acc.hebrewName?.takeIf { it.isNotBlank() }?.let { fields["addedByAgentHebrewName"] = it }
            }
            val status = SharedCallables.shortlistAdd(platformManager.value, url, fields)
            when (status) {
                "already_in_roster" -> AddToShortlistResult.AlreadyInRoster
                "already_exists" -> AddToShortlistResult.AlreadyInShortlist
                else -> AddToShortlistResult.Added
            }
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    private suspend fun getCurrentUserAccountName(): String? =
        firebaseHandler.getCurrentUserAccountName()

    private suspend fun getCurrentUserAccount(): Account? {
        val email = firebaseHandler.firebaseAuth.currentUser?.email ?: return null
        val snapshot = firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable)
            .whereEqualTo("email", email)
            .limit(1)
            .get()
            .await()
        return snapshot.toObjects(Account::class.java).firstOrNull()
    }

    suspend fun removeFromShortlist(tmProfileUrl: String) {
        val url = tmProfileUrl.trim().takeIf { it.isNotBlank() } ?: return
        _shortlistPendingUrls.value = _shortlistPendingUrls.value + url
        try {
            val agentName = getCurrentUserAccountName()
            SharedCallables.shortlistRemove(platformManager.value, url, agentName)
        } finally {
            _shortlistPendingUrls.value = _shortlistPendingUrls.value - url
        }
    }

    suspend fun isInShortlist(tmProfileUrl: String): Boolean {
        val snapshot = shortlistCollection()
            .whereEqualTo("tmProfileUrl", tmProfileUrl).get().await()
        return !snapshot.isEmpty
    }

    // ── Notes CRUD ──────────────────────────────────────────────────────────

    suspend fun addNoteToEntry(
        tmProfileUrl: String,
        noteText: String,
        taggedAgentIds: List<String> = emptyList(),
        playerName: String? = null,
        playerImage: String? = null
    ) {
        val account = getCurrentUserAccount()
        SharedCallables.shortlistAddNote(
            platform = platformManager.value,
            tmProfileUrl = tmProfileUrl,
            noteText = noteText,
            createdBy = account?.name,
            createdByHebrewName = account?.hebrewName,
            createdById = account?.id,
            taggedAgentIds = taggedAgentIds,
            agentName = account?.name,
            playerName = playerName,
            playerImage = playerImage
        )
    }

    suspend fun updateNoteInEntry(tmProfileUrl: String, noteIndex: Int, newText: String) {
        SharedCallables.shortlistUpdateNote(
            platform = platformManager.value,
            tmProfileUrl = tmProfileUrl,
            noteIndex = noteIndex,
            newText = newText
        )
    }

    suspend fun markInstagramSent(tmProfileUrl: String) {
        SharedCallables.shortlistUpdate(
            platform = platformManager.value,
            tmProfileUrl = tmProfileUrl,
            fields = mapOf("instagramSentAt" to System.currentTimeMillis())
        )
    }

    suspend fun deleteNoteFromEntry(tmProfileUrl: String, noteIndex: Int) {
        SharedCallables.shortlistDeleteNote(
            platform = platformManager.value,
            tmProfileUrl = tmProfileUrl,
            noteIndex = noteIndex
        )
    }
}
