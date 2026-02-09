package com.liordahan.mgsrteam.features.shortlist

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

data class ShortlistEntry(
    val tmProfileUrl: String,
    val addedAt: Long = System.currentTimeMillis()
)

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
                val url = map["tmProfileUrl"] as? String ?: return@mapNotNull null
                val addedAt = (map["addedAt"] as? Number)?.toLong() ?: 0L
                ShortlistEntry(tmProfileUrl = url, addedAt = addedAt)
            }.sortedByDescending { it.addedAt }
            trySend(entries)
        }
        awaitClose { listener.remove() }
    }

    suspend fun addToShortlist(tmProfileUrl: String) {
        val docRef = shortlistDocRef()
        val snapshot = docRef.get().await()
        val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.toMutableList() ?: mutableListOf()
        if (current.any { (it["tmProfileUrl"] as? String) == tmProfileUrl }) return
        current.add(mapOf("tmProfileUrl" to tmProfileUrl, "addedAt" to System.currentTimeMillis()))
        docRef.set(mapOf("entries" to current)).await()
    }

    suspend fun removeFromShortlist(tmProfileUrl: String) {
        val docRef = shortlistDocRef()
        val snapshot = docRef.get().await()
        val current = (snapshot.get("entries") as? List<Map<String, Any>>)?.toMutableList() ?: return
        current.removeAll { (it["tmProfileUrl"] as? String) == tmProfileUrl }
        docRef.set(mapOf("entries" to current)).await()
    }

    suspend fun isInShortlist(tmProfileUrl: String): Boolean {
        val snapshot = shortlistDocRef().get().await()
        val list = snapshot.get("entries") as? List<Map<String, Any>> ?: return false
        return list.any { (it["tmProfileUrl"] as? String) == tmProfileUrl }
    }
}
