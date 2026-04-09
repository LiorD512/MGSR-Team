package com.liordahan.mgsrteam.firebase

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Reads pre-scraped TM data from Firestore `ScrapingCache` collection.
 * Data is written by the weekly GitHub Actions workflows in chunks of 2000 items.
 *
 * Chunk layout:
 *   `{key}-chunk-0` → { payload: [...], cachedAt: Long, totalChunks: Int }
 *   `{key}-chunk-1` → { payload: [...], cachedAt: Long }
 *   ...
 */
class ScrapingCacheRepository {

    private val db = FirebaseFirestore.getInstance()
    private val collection = "ScrapingCache"

    companion object {
        private const val TAG = "ScrapingCache"
        private const val TTL_MS = 7L * 24 * 60 * 60 * 1000 // 7 days
    }

    /**
     * Read chunked cached data for [key]. Returns null if cache is missing or expired.
     */
    suspend fun getCachedPlayers(key: String): List<LatestTransferModel>? = withContext(Dispatchers.IO) {
        try {
            val chunk0 = db.collection(collection).document("$key-chunk-0").get().await()
            if (!chunk0.exists()) {
                Log.d(TAG, "$key: no cache found")
                return@withContext null
            }

            val cachedAt = chunk0.getLong("cachedAt") ?: 0L
            if (System.currentTimeMillis() - cachedAt > TTL_MS) {
                Log.d(TAG, "$key: cache expired")
                return@withContext null
            }

            val totalChunks = chunk0.getLong("totalChunks")?.toInt() ?: 1
            @Suppress("UNCHECKED_CAST")
            val payload0 = chunk0.get("payload") as? List<Map<String, Any?>> ?: emptyList()
            val allMaps = payload0.toMutableList()

            // Read remaining chunks
            for (i in 1 until totalChunks) {
                try {
                    val chunkSnap = db.collection(collection).document("$key-chunk-$i").get().await()
                    @Suppress("UNCHECKED_CAST")
                    val chunkPayload = chunkSnap.get("payload") as? List<Map<String, Any?>> ?: emptyList()
                    allMaps.addAll(chunkPayload)
                } catch (e: Exception) {
                    Log.w(TAG, "$key chunk-$i read failed: ${e.message}")
                }
            }

            val players = allMaps.mapNotNull { mapToPlayer(it) }
            Log.d(TAG, "$key: loaded ${players.size} players from $totalChunks chunks (cached ${(System.currentTimeMillis() - cachedAt) / 60000} min ago)")
            players
        } catch (e: Exception) {
            Log.w(TAG, "$key: cache read failed: ${e.message}")
            null
        }
    }

    private fun mapToPlayer(map: Map<String, Any?>): LatestTransferModel? {
        return try {
            LatestTransferModel(
                playerImage = map["playerImage"] as? String,
                playerName = map["playerName"] as? String,
                playerUrl = map["playerUrl"] as? String,
                playerPosition = map["playerPosition"] as? String,
                playerAge = map["playerAge"] as? String,
                playerNationality = map["playerNationality"] as? String,
                playerNationalityFlag = map["playerNationalityFlag"] as? String,
                clubJoinedLogo = map["clubJoinedLogo"] as? String,
                clubJoinedName = map["clubJoinedName"] as? String,
                transferDate = map["transferDate"] as? String,
                marketValue = map["marketValue"] as? String,
                onLoanFromClub = map["onLoanFromClub"] as? String,
                loanEndDate = map["loanEndDate"] as? String
            )
        } catch (e: Exception) {
            null
        }
    }
}
