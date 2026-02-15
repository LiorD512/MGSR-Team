package com.liordahan.mgsrteam.features.players.playerinfo.documents

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID

class PlayerDocumentsRepository(
    private val firebaseHandler: FirebaseHandler
) {

    private val store = FirebaseFirestore.getInstance()
    private val storage = FirebaseStorage.getInstance().reference

    fun getDocumentsFlow(playerTmProfile: String?): Flow<List<PlayerDocument>> = callbackFlow {
        if (playerTmProfile.isNullOrBlank()) {
            trySend(emptyList())
            close()
            return@callbackFlow
        }
        val listener = store.collection(firebaseHandler.playerDocumentsTable)
            .whereEqualTo("playerTmProfile", playerTmProfile)
            .addSnapshotListener { snapshot, _ ->
                val list = snapshot?.documents?.mapNotNull { doc ->
                    doc.toObject(PlayerDocument::class.java)?.copy(id = doc.id)
                }?.sortedByDescending { it.uploadedAt } ?: emptyList()
                trySend(list)
            }
        awaitClose { listener.remove() }
    }

    suspend fun getDocuments(playerTmProfile: String?): List<PlayerDocument> {
        if (playerTmProfile.isNullOrBlank()) return emptyList()
        val snapshot = store.collection(firebaseHandler.playerDocumentsTable)
            .whereEqualTo("playerTmProfile", playerTmProfile)
            .get()
            .await()
        return snapshot.toObjects(PlayerDocument::class.java).sortedByDescending { it.uploadedAt }
    }

    suspend fun uploadDocument(
        playerTmProfile: String,
        type: DocumentType,
        name: String,
        bytes: ByteArray,
        expiresAt: Long?
    ): Result<PlayerDocument> {
        return try {
            val safeProfile = playerTmProfile.hashCode().toString().replace("-", "x")
            val fileName = "${UUID.randomUUID()}_$name"
            val ref = storage.child("player_docs").child(safeProfile).child(fileName)
            ref.putBytes(bytes).await()
            val url = ref.downloadUrl.await().toString()
            val data = hashMapOf<String, Any>(
                "playerTmProfile" to playerTmProfile,
                "type" to type.name,
                "name" to name,
                "storageUrl" to url,
                "uploadedAt" to System.currentTimeMillis()
            )
            if (expiresAt != null) {
                data["expiresAt"] = expiresAt
            }
            store.collection(firebaseHandler.playerDocumentsTable).add(data).await()
            val doc = PlayerDocument(
                playerTmProfile = playerTmProfile,
                type = type.name,
                name = name,
                storageUrl = url,
                uploadedAt = System.currentTimeMillis(),
                expiresAt = expiresAt
            )
            Result.success(doc.copy(id = null))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteDocument(documentId: String): Result<Unit> {
        return try {
            store.collection(firebaseHandler.playerDocumentsTable).document(documentId).delete().await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
