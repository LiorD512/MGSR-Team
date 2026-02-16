package com.liordahan.mgsrteam.features.players.playerinfo.ai

import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.transfermarket.PlayerSearch
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * AI Helper service using Firebase AI (Gemini) to find similar players.
 * Transfermarkt URLs are verified by searching Transfermarkt - AI-generated URLs are not trusted.
 *
 * Prerequisites: Enable Firebase AI Logic in Firebase Console:
 * https://console.firebase.google.com/project/_/ailogic
 */
class AiHelperService(
    private val playerSearch: PlayerSearch
) {

    companion object {
        private const val TAG = "AiHelperService"
    }

    data class SimilarPlayerSuggestion(
        val name: String,
        val position: String?,
        val age: String?,
        val marketValue: String?,
        val transfermarktUrl: String?,
        val similarityReason: String?
    )

    suspend fun findSimilarPlayers(player: Player): Result<List<SimilarPlayerSuggestion>> =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        responseMimeType = "application/json"
                        responseSchema = Schema.obj(
                            mapOf(
                                "similarPlayers" to Schema.array(
                                    Schema.obj(
                                        mapOf(
                                            "name" to Schema.string(),
                                            "position" to Schema.string(),
                                            "age" to Schema.string(),
                                            "marketValue" to Schema.string(),
                                            "similarityReason" to Schema.string()
                                        ),
                                        optionalProperties = listOf(
                                            "position", "age", "marketValue",
                                            "similarityReason"
                                        )
                                    )
                                )
                            )
                        )
                    }
                )

                val playerContext = buildPlayerContext(player)
                val prompt = """
                    You are a football scout assistant. Find 5-8 similar professional football (soccer) players to this player.
                    
                    Player profile:
                    $playerContext
                    
                    Consider: age, positions, playing style (infer from position), market value range, physical profile.
                    For each similar player, provide ONLY the player's full name (as it appears on Transfermarkt).
                    Do NOT provide Transfermarkt URLs - we will look them up separately.
                    Focus on current active players (2024-2025 season) with comparable profiles.
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text ?: return@withContext Result.failure(
                    IllegalStateException("Empty response from AI")
                )

                val rawSuggestions = parseSimilarPlayersResponse(text)
                val suggestions = verifyTransfermarktUrls(rawSuggestions)
                Log.d(TAG, "findSimilarPlayers result: $suggestions")
                Result.success(suggestions)
            } catch (e: Exception) {
                Log.e(TAG, "findSimilarPlayers failed", e)
                Result.failure(e)
            }
        }

    private fun buildPlayerContext(player: Player): String {
        val parts = mutableListOf<String>()
        player.fullName?.let { parts.add("Name: $it") }
        player.age?.let { parts.add("Age: $it") }
        player.positions?.filterNotNull()?.joinToString(", ")?.let { parts.add("Positions: $it") }
        player.height?.let { parts.add("Height: $it") }
        player.marketValue?.let { parts.add("Market value: $it") }
        player.nationality?.let { parts.add("Nationality: $it") }
        player.currentClub?.clubName?.let { parts.add("Current club: $it") }
        player.description?.takeIf { it.isNotBlank() }?.let { parts.add("Description: $it") }
        player.tmProfile?.let { parts.add("Transfermarkt: $it") }
        return parts.joinToString("\n")
    }

    private suspend fun verifyTransfermarktUrls(
        rawSuggestions: List<SimilarPlayerSuggestion>
    ): List<SimilarPlayerSuggestion> {
        return rawSuggestions.map { suggestion ->
            val verifiedUrl = lookupTransfermarktUrl(suggestion.name, suggestion.position)
            suggestion.copy(transfermarktUrl = verifiedUrl)
        }
    }

    /**
     * Search Transfermarkt for the player by name and return the verified profile URL.
     * Uses the first search result that matches - Transfermarkt search returns most relevant first.
     */
    private suspend fun lookupTransfermarktUrl(
        playerName: String,
        expectedPosition: String?
    ): String? = withContext(Dispatchers.IO) {
        if (playerName.isBlank()) return@withContext null
        when (val result = playerSearch.getSearchResults(playerName)) {
            is TransfermarktResult.Success -> {
                val results = result.data
                if (results.isEmpty()) {
                    Log.d(TAG, "No Transfermarkt results for: $playerName")
                    return@withContext null
                }
                // Prefer result matching expected position if we have it
                val match = if (expectedPosition != null) {
                    results.firstOrNull { r ->
                        r.playerPosition?.equals(expectedPosition, ignoreCase = true) == true ||
                        r.playerPosition?.contains(expectedPosition, ignoreCase = true) == true
                    } ?: results.first()
                } else {
                    results.first()
                }
                val url = match.tmProfile?.takeIf { it.contains("/profil/spieler/", ignoreCase = true) }
                if (url != null) {
                    Log.d(TAG, "Verified TM URL for $playerName: $url")
                }
                url
            }
            is TransfermarktResult.Failed -> {
                Log.w(TAG, "Transfermarkt search failed for $playerName: ${result.cause}")
                null
            }
        }
    }

    private fun parseSimilarPlayersResponse(jsonText: String): List<SimilarPlayerSuggestion> {
        return try {
            val json = JSONObject(jsonText)
            val array = json.optJSONArray("similarPlayers") ?: return emptyList()
            val list = mutableListOf<SimilarPlayerSuggestion>()
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                list.add(
                    SimilarPlayerSuggestion(
                        name = obj.optString("name", "").takeIf { it.isNotBlank() } ?: "Unknown",
                        position = obj.optString("position", "").takeIf { it.isNotBlank() },
                        age = obj.optString("age", "").takeIf { it.isNotBlank() },
                        marketValue = obj.optString("marketValue", "").takeIf { it.isNotBlank() },
                        transfermarktUrl = null, // Will be verified via Transfermarkt search
                        similarityReason = obj.optString("similarityReason", "").takeIf { it.isNotBlank() }
                    )
                )
            }
            list
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse AI response: $jsonText", e)
            emptyList()
        }
    }
}
