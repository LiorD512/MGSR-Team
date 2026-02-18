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
 * Discovers which football agency a person works for using a multi-strategy approach:
 * 1. Transfermarkt direct search (person name) - fast, no API cost
 * 2. Gemini with Google Search grounding - web search for agency info
 * 3. Transfermarkt agency search - verify and get official URL
 *
 * Note: responseSchema/JSON mode is NOT compatible with Google Search grounding per Gemini API.
 * We use plain text prompt and parse the response.
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

    /**
     * Attempts to find the agency a person works for.
     * Tries Transfermarkt first (person name → agency), then Gemini web search.
     */
    suspend fun discoverAgencyForPerson(personName: String): Result<DiscoveredAgency?> =
        withContext(Dispatchers.IO) {
            try {
                val sanitizedName = personName.trim()
                if (sanitizedName.length < 2) {
                    Log.w(TAG, "discoverAgencyForPerson: name too short")
                    return@withContext Result.success(null)
                }

                // Strategy 1: Search Transfermarkt with person name - agents section may return their agency
                val tmDirect = agencySearch.searchAgencyByPersonName(sanitizedName)
                val name = tmDirect?.agencyName
                val url = tmDirect?.agencyUrl
                if (name != null && url != null) {
                    Log.d(TAG, "discoverAgencyForPerson: found via TM direct: $name")
                    val tmPersonName = findPersonNameOnTransfermarkt(sanitizedName)
                    return@withContext Result.success(
                        DiscoveredAgency(
                            agencyName = name,
                            agencyUrl = url,
                            personNameOnTransfermarkt = tmPersonName
                        )
                    )
                }

                // Strategy 2: Gemini with Google Search (plain text - NO responseSchema, incompatible with grounding)
                val agencyNameFromWeb = findAgencyNameViaWebSearch(sanitizedName)
                if (agencyNameFromWeb.isNullOrBlank()) {
                    Log.w(TAG, "discoverAgencyForPerson: web search returned nothing")
                    return@withContext Result.success(null)
                }

                // Strategy 3: Verify on Transfermarkt and get URL
                val tmResult = agencySearch.getAgencySearchResults(agencyNameFromWeb)
                when (tmResult) {
                    is TransfermarktResult.Success -> {
                        val best = pickBestAgencyMatch(agencyNameFromWeb, tmResult.data)
                        if (best != null) {
                            Log.d(TAG, "discoverAgencyForPerson: found ${best.agencyName} for $personName")
                            val tmPersonName = findPersonNameOnTransfermarkt(sanitizedName)
                            Result.success(
                                DiscoveredAgency(
                                    agencyName = best.agencyName!!,
                                    agencyUrl = best.agencyUrl!!,
                                    personNameOnTransfermarkt = tmPersonName
                                )
                            )
                        } else {
                            val tmPersonName = findPersonNameOnTransfermarkt(sanitizedName)
                            Result.success(
                                DiscoveredAgency(
                                    agencyName = agencyNameFromWeb,
                                    agencyUrl = "",
                                    personNameOnTransfermarkt = tmPersonName
                                )
                            )
                        }
                    }
                    is TransfermarktResult.Failed -> {
                        Log.w(TAG, "Transfermarkt agency search failed: ${tmResult.cause}")
                        val tmPersonName = findPersonNameOnTransfermarkt(sanitizedName)
                        Result.success(
                            DiscoveredAgency(
                                agencyName = agencyNameFromWeb,
                                agencyUrl = "",
                                personNameOnTransfermarkt = tmPersonName
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "discoverAgencyForPerson failed for $personName", e)
                Result.failure(e)
            }
        }

    /**
     * Uses Gemini with Google Search grounding. Plain text only - responseSchema conflicts with grounding.
     */
    private suspend fun findAgencyNameViaWebSearch(personName: String): String? =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.2f
                    },
                    safetySettings = null,
                    tools = listOf(Tool.googleSearch())
                )

                val prompt = """
                    Search the web to find which football/soccer player agency or sports agency the person "$personName" works for.
                    Focus on: football agent, player agent, sports agency, Transfermarkt.
                    Reply with ONLY the agency/company name as it appears on Transfermarkt (e.g. "Wasserman", "CAA Sports", "Stellar Group", "CAA Stellar").
                    One line only. No explanation. If you cannot find reliable information, reply: UNKNOWN
                """.trimIndent()

                val response = model.generateContent(prompt)
                val text = response.text?.trim() ?: return@withContext null
                if (text.equals("UNKNOWN", ignoreCase = true) || text.isBlank()) return@withContext null

                val name = text.lines().firstOrNull()?.trim()?.takeIf { it.isNotBlank() }
                Log.d(TAG, "findAgencyNameViaWebSearch: $personName -> $name")
                name
            } catch (e: Exception) {
                Log.e(TAG, "findAgencyNameViaWebSearch failed", e)
                null
            }
        }

    /**
     * Uses Gemini with Google Search to find the person's name as displayed on Transfermarkt.
     * E.g. "Mino Raiola" -> "Vincenzo Raiola", "Jorge Mendes" -> "Jorge Mendes"
     */
    private suspend fun findPersonNameOnTransfermarkt(personName: String): String? =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig { temperature = 0.1f },
                    safetySettings = null,
                    tools = listOf(Tool.googleSearch())
                )
                val prompt = """
                    Search transfermarkt.com for the football/soccer agent or intermediary "$personName".
                    Find their profile or agency page. What is the EXACT name as displayed on Transfermarkt (e.g. "Jorge Mendes", "Vincenzo Raiola")?
                    Reply with ONLY the name as shown on Transfermarkt. One line. No explanation. If not found, reply: UNKNOWN
                """.trimIndent()
                val response = model.generateContent(prompt)
                val text = response.text?.trim() ?: return@withContext null
                if (text.equals("UNKNOWN", ignoreCase = true) || text.isBlank()) return@withContext null
                val name = text.lines().firstOrNull()?.trim()?.takeIf { it.isNotBlank() }
                Log.d(TAG, "findPersonNameOnTransfermarkt: $personName -> $name")
                name
            } catch (e: Exception) {
                Log.e(TAG, "findPersonNameOnTransfermarkt failed", e)
                null
            }
        }

    private fun pickBestAgencyMatch(query: String, candidates: List<AgencySearchModel>): AgencySearchModel? {
        if (candidates.isEmpty()) return null
        val q = query.lowercase()
        return candidates.minByOrNull { candidate ->
            val name = (candidate.agencyName ?: "").lowercase()
            when {
                name == q -> 0
                name.contains(q) || q.contains(name) -> 1
                else -> 2
            }
        }
    }
}
