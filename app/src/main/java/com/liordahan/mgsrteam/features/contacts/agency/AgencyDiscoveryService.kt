package com.liordahan.mgsrteam.features.contacts.agency

import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Tool
import com.google.firebase.ai.type.generationConfig
import com.liordahan.mgsrteam.transfermarket.AgencySearch
import com.liordahan.mgsrteam.transfermarket.AgencySearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Discovers which football agency a person works for.
 *
 * Strategy chain:
 * 1. Analyze contact name — detect embedded agency names (e.g. "Brian Diamond Sport")
 * 2. Gemini + Google Search grounding — single web search call (like ClubDiscoveryService)
 * 3. Transfermarkt direct search — person name → agents section
 *
 * Each strategy verifies the result on Transfermarkt to get the official agency URL.
 */
class AgencyDiscoveryService(
    private val agencySearch: AgencySearch
) {

    companion object {
        private const val TAG = "AgencyDiscoveryService"
    }

    data class DiscoveredAgency(
        val agencyName: String,
        val agencyUrl: String,
        val agencyCountry: String? = null,
        /** Person's name as displayed on Transfermarkt (replaces phone contact name) */
        val personNameOnTransfermarkt: String? = null
    )

    private data class NameAnalysis(
        val personName: String,
        val embeddedAgency: String?
    )

    private data class AgencyWebResult(
        val agencyName: String,
        val personName: String? = null
    )

    /**
     * Attempts to find the agency a person works for.
     * Returns null inside Result if nothing found; Result.failure only on unexpected errors.
     */
    suspend fun discoverAgencyForPerson(personName: String): Result<DiscoveredAgency?> =
        withContext(Dispatchers.IO) {
            try {
                val sanitized = personName.trim()
                if (sanitized.length < 2) {
                    Log.w(TAG, "discoverAgencyForPerson: name too short")
                    return@withContext Result.success(null)
                }

                // ── Step 1: Analyze contact name for embedded agency ──
                // e.g. "Brian Diamond Sport" → person "Brian Diamond", agency "Diamond Sport"
                val analysis = analyzeContactName(sanitized)
                val cleanName = analysis.personName

                if (analysis.embeddedAgency != null) {
                    Log.d(TAG, "Detected embedded agency: '${analysis.embeddedAgency}' from '$sanitized'")
                    val agency = findAgencyOnTransfermarkt(analysis.embeddedAgency)
                    if (agency != null) {
                        Log.d(TAG, "Found embedded agency on TM: ${agency.agencyName}")
                        return@withContext Result.success(
                            agency.copy(
                                personNameOnTransfermarkt = if (cleanName != sanitized) cleanName else null
                            )
                        )
                    }
                }

                // ── Step 2: Gemini + Google Search (like ClubDiscoveryService) ──
                val webResult = findAgencyViaWebSearch(cleanName)
                if (webResult != null) {
                    val tmAgency = findAgencyOnTransfermarkt(webResult.agencyName)
                    Log.d(TAG, "Web search: ${webResult.agencyName} → TM: ${tmAgency?.agencyName}")
                    return@withContext Result.success(
                        DiscoveredAgency(
                            agencyName = tmAgency?.agencyName ?: webResult.agencyName,
                            agencyUrl = tmAgency?.agencyUrl ?: "",
                            personNameOnTransfermarkt = webResult.personName
                        )
                    )
                }

                // ── Step 3: Transfermarkt direct search (person name → agents section) ──
                val tmDirect = agencySearch.searchAgencyByPersonName(cleanName)
                val tmDirectName = tmDirect?.agencyName
                val tmDirectUrl = tmDirect?.agencyUrl
                if (tmDirectName != null && tmDirectUrl != null) {
                    Log.d(TAG, "TM direct search found: $tmDirectName")
                    return@withContext Result.success(
                        DiscoveredAgency(
                            agencyName = tmDirectName,
                            agencyUrl = tmDirectUrl
                        )
                    )
                }

                Log.w(TAG, "discoverAgencyForPerson: nothing found for $personName")
                Result.success(null)
            } catch (e: Exception) {
                Log.e(TAG, "discoverAgencyForPerson failed for $personName", e)
                Result.failure(e)
            }
        }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1 helper: Detect if the contact name contains an agency/company name
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Analyzes a contact name to detect if it contains an embedded agency/company name.
     * Examples:
     *  "Brian Diamond Sport"  → person="Brian Diamond", agency="Diamond Sport"
     *  "John Smith CAA"       → person="John Smith", agency="CAA"
     *  "Stellar Group"        → person="Stellar Group", agency="Stellar Group" (AGENCY_ONLY)
     *  "Jorge Mendes"         → person="Jorge Mendes", agency=null (normal name)
     */
    private suspend fun analyzeContactName(rawName: String): NameAnalysis =
        withContext(Dispatchers.IO) {
            val trimmed = rawName.trim()
            val words = trimmed.split(Regex("\\s+"))

            // Quick heuristic: 1-2 normal words with no business keywords → skip AI call
            val businessKeywords = listOf(
                "sport", "sports", "management", "group", "agency", "consulting",
                "associates", "entertainment", "global", "international", "gmbh",
                "ltd", "inc", "llc", "partners", "media", "football", "soccer",
                "talent", "pro", "world", "elite", "premier", "stellar", "wasserman",
                "caa", "img", "unique", "octagon", "roc"
            )
            val hasBusinessWord = words.any { word ->
                businessKeywords.any { kw -> word.lowercase() == kw }
            }
            if (!hasBusinessWord && words.size <= 2) {
                return@withContext NameAnalysis(trimmed, null)
            }

            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI())
                    .generativeModel(
                        modelName = "gemini-2.5-flash",
                        generationConfig = generationConfig { temperature = 0.0f }
                    )
                val prompt = """
                    Analyze this contact name from a football/soccer industry contact list: "$trimmed"

                    Determine if this is:
                    A) PERSON_ONLY — just a person's name (e.g. "Jorge Mendes", "Mino Raiola", "Pini Zahavi")
                    B) PERSON_AND_AGENCY — a person's name combined with their agency/company (e.g. "Brian Diamond Sport" = person "Brian Diamond" + agency "Diamond Sport Management")
                    C) AGENCY_ONLY — just an agency/company name with no person name (e.g. "Stellar Group", "CAA Sports")

                    Reply in exactly 2 lines:
                    Line 1: PERSON_ONLY or PERSON_AND_AGENCY or AGENCY_ONLY
                    Line 2: If PERSON_AND_AGENCY: person_name | agency_name  (separated by pipe |)
                             If PERSON_ONLY: the person's name
                             If AGENCY_ONLY: the agency name
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text?.trim() ?: return@withContext NameAnalysis(trimmed, null)
                val lines = text.lines().map { it.trim() }.filter { it.isNotBlank() }
                val type = lines.firstOrNull()?.uppercase() ?: return@withContext NameAnalysis(trimmed, null)

                when {
                    "PERSON_AND_AGENCY" in type -> {
                        val parts = lines.getOrNull(1)?.split("|")?.map { it.trim() }
                        if (parts?.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) {
                            Log.d(TAG, "analyzeContactName: '$trimmed' → person='${parts[0]}', agency='${parts[1]}'")
                            NameAnalysis(parts[0], parts[1])
                        } else NameAnalysis(trimmed, null)
                    }
                    "AGENCY_ONLY" in type -> {
                        val agencyName = lines.getOrNull(1)?.trim() ?: trimmed
                        Log.d(TAG, "analyzeContactName: '$trimmed' → agency only '$agencyName'")
                        NameAnalysis(trimmed, agencyName)
                    }
                    else -> NameAnalysis(trimmed, null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "analyzeContactName failed for '$trimmed'", e)
                NameAnalysis(trimmed, null)
            }
        }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2 helper: Gemini + Google Search grounding (like ClubDiscoveryService)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Uses Gemini with Google Search grounding to find which agency a person works for.
     * Single Gemini call — same approach as ClubDiscoveryService.findClubAndRoleViaWebSearch.
     */
    private suspend fun findAgencyViaWebSearch(personName: String): AgencyWebResult? =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI())
                    .generativeModel(
                        modelName = "gemini-2.5-flash",
                        generationConfig = generationConfig { temperature = 0.1f },
                        safetySettings = null,
                        tools = listOf(Tool.googleSearch())
                    )
                val prompt = """
                    Search the web for: "$personName" football agent agency transfermarkt
                    Find which football/soccer agency or management company this person works for.
                    Look on transfermarkt.com, soccerway.com, and general football news sources.
                    They may be listed as agent, intermediary, scout, or director at the agency.

                    Reply with exactly 2 lines:
                    Line 1: The agency name exactly as it appears on Transfermarkt (e.g. "Stellar Group", "ICM Stellar Sports", "Wasserman")
                    Line 2: The person's full name exactly as displayed on Transfermarkt or official sources (e.g. "Jorge Mendes", "Pini Zahavi")

                    IMPORTANT: You must be certain this is the right person — "$personName". Do not guess.
                    If "$personName" is not found as a football agent or you're uncertain: reply with exactly UNKNOWN
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text?.trim() ?: return@withContext null
                if (text.equals("UNKNOWN", ignoreCase = true) || text.isBlank()) return@withContext null

                val lines = text.lines().map { it.trim() }.filter { it.isNotBlank() }
                val agencyName = lines.getOrNull(0)
                    ?.takeIf { !it.equals("UNKNOWN", ignoreCase = true) && it.length >= 2 }
                    ?: return@withContext null
                val personNameResult = lines.getOrNull(1)
                    ?.takeIf { !it.equals("UNKNOWN", ignoreCase = true) }

                Log.d(TAG, "findAgencyViaWebSearch: $personName → $agencyName, name=$personNameResult")
                AgencyWebResult(agencyName, personNameResult)
            } catch (e: Exception) {
                Log.e(TAG, "findAgencyViaWebSearch failed", e)
                null
            }
        }

    // ─────────────────────────────────────────────────────────────────────────
    // Transfermarkt helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Searches Transfermarkt for an agency by name and returns the best match.
     */
    private suspend fun findAgencyOnTransfermarkt(agencyName: String): DiscoveredAgency? {
        val result = agencySearch.getAgencySearchResults(agencyName)
        if (result is TransfermarktResult.Success && result.data.isNotEmpty()) {
            val best = pickBestAgencyMatch(agencyName, result.data)
            val bestName = best?.agencyName
            val bestUrl = best?.agencyUrl
            if (bestName != null && bestUrl != null) {
                return DiscoveredAgency(
                    agencyName = bestName,
                    agencyUrl = bestUrl
                )
            }
        }
        return null
    }

    private fun pickBestAgencyMatch(query: String, candidates: List<AgencySearchModel>): AgencySearchModel? {
        if (candidates.isEmpty()) return null
        val q = query.lowercase().trim()
        val qWords = q.split(Regex("\\s+")).toSet()

        return candidates
            .map { candidate ->
                val name = (candidate.agencyName ?: "").lowercase().trim()
                val nameWords = name.split(Regex("\\s+")).toSet()
                val score = when {
                    name == q -> 0
                    name.contains(q) || q.contains(name) -> 1
                    nameWords.intersect(qWords).isNotEmpty() -> 2
                    else -> 100
                }
                candidate to score
            }
            .filter { it.second < 100 } // reject candidates with zero word overlap
            .minByOrNull { it.second }
            ?.first
    }
}
