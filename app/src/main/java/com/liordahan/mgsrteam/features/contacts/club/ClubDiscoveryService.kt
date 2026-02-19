package com.liordahan.mgsrteam.features.contacts.club

import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Tool
import com.google.firebase.ai.type.generationConfig
import com.liordahan.mgsrteam.features.contacts.models.ContactRole
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Discovers which football club a person works at and their role using web search.
 * Flow: person name → web search (club + role) → Transfermarkt club search.
 */
class ClubDiscoveryService(
    private val clubSearch: ClubSearch
) {

    companion object {
        private const val TAG = "ClubDiscoveryService"
    }

    data class DiscoveredClub(
        val clubName: String,
        val role: ContactRole,
        val clubModel: ClubSearchModel?
    )

    /**
     * Finds the club and role for a person (coach, scout, director, etc.).
     * Uses Gemini with Google Search, then verifies club on Transfermarkt.
     */
    suspend fun discoverClubForPerson(personName: String): Result<DiscoveredClub?> =
        withContext(Dispatchers.IO) {
            try {
                val sanitizedName = personName.trim()
                if (sanitizedName.length < 2) {
                    Log.w(TAG, "discoverClubForPerson: name too short")
                    return@withContext Result.success(null)
                }

                val (clubName, roleName) = findClubAndRoleViaWebSearch(sanitizedName)
                    ?: return@withContext Result.success(null)

                val role = parseRole(roleName) ?: ContactRole.UNKNOWN

                val clubModel = when (val result = clubSearch.getClubSearchResults(clubName)) {
                    is TransfermarktResult.Success -> pickBestClubMatch(clubName, result.data)
                    is TransfermarktResult.Failed -> null
                }

                Log.d(TAG, "discoverClubForPerson: $personName -> $clubName ($role)")
                Result.success(
                    DiscoveredClub(
                        clubName = clubName,
                        role = role,
                        clubModel = clubModel
                    )
                )
            } catch (e: Exception) {
                Log.e(TAG, "discoverClubForPerson failed for $personName", e)
                Result.failure(e)
            }
        }

    private suspend fun findClubAndRoleViaWebSearch(personName: String): Pair<String, String>? =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig { temperature = 0.1f },
                    safetySettings = null,
                    tools = listOf(Tool.googleSearch())
                )
                val prompt = """
                    Search the web for: "$personName" football club
                    Find which football/soccer club this person works at and their role (coach, assistant coach, sport director, scout, CEO, president, board member).
                    Reply with exactly two lines:
                    Line 1: The club name as it appears on Transfermarkt (e.g. "FC Barcelona", "Real Madrid")
                    Line 2: The role - one of: Coach, Assistant Coach, Sport Director, Scout, CEO, President, Board Member, Unknown
                    If the person has left their previous club and is currently without a club (retired, free agent, between jobs): Line 1: Without club
                    If not found: UNKNOWN
                """.trimIndent()
                val response = model.generateContent(prompt)
                val text = response.text?.trim() ?: return@withContext null
                if (text.equals("UNKNOWN", ignoreCase = true) || text.isBlank()) return@withContext null

                val lines = text.lines().map { it.trim() }.filter { it.isNotBlank() }
                val clubName = lines.getOrNull(0)?.takeIf { !it.equals("UNKNOWN", ignoreCase = true) } ?: return@withContext null
                val roleName = lines.getOrNull(1) ?: "Unknown"

                Log.d(TAG, "findClubAndRoleViaWebSearch: $personName -> $clubName, $roleName")
                clubName to roleName
            } catch (e: Exception) {
                Log.e(TAG, "findClubAndRoleViaWebSearch failed", e)
                null
            }
        }

    private fun parseRole(roleName: String): ContactRole? {
        val normalized = roleName.trim().lowercase()
        return ContactRole.entries.find {
            it.name.equals(roleName, ignoreCase = true) ||
            it.displayName.lowercase().contains(normalized) ||
            normalized.contains(it.displayName.lowercase())
        }
    }

    private fun pickBestClubMatch(query: String, candidates: List<ClubSearchModel>): ClubSearchModel? {
        if (candidates.isEmpty()) return null
        val q = query.lowercase()
        return candidates.minByOrNull { candidate ->
            val name = (candidate.clubName ?: "").lowercase()
            when {
                name == q -> 0
                name.contains(q) || q.contains(name) -> 1
                else -> 2
            }
        }
    }
}
