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

                // Strategy 2: Google "{name} agent", get Transfermarkt URL, fetch page, verify 90% name match
                val fromTmUrl = findAgencyViaGoogleAndTransfermarkt(sanitizedName)
                if (fromTmUrl != null) {
                    Log.d(TAG, "discoverAgencyForPerson: found via TM URL: ${fromTmUrl.agencyName}")
                    return@withContext Result.success(fromTmUrl)
                }

                // Strategy 3: Fallback - Gemini web search for agency name, then verify on Transfermarkt
                val agencyNameFromWeb = findAgencyNameViaWebSearch(sanitizedName)
                if (agencyNameFromWeb.isNullOrBlank()) {
                    Log.w(TAG, "discoverAgencyForPerson: web search returned nothing")
                    return@withContext Result.success(null)
                }

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
     * Strategy: Search "{personName} agent transfermarkt", get multiple URLs, iterate through
     * each result, fetch page, extract agent name, validate 90-95% match. Return first valid match.
     */
    private suspend fun findAgencyViaGoogleAndTransfermarkt(personName: String): DiscoveredAgency? =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig { temperature = 0.1f },
                    safetySettings = null,
                    tools = listOf(Tool.googleSearch())
                )
                val prompt = """
                    Search the web for Transfermarkt pages about the football agent "$personName".
                    Try these searches: "$personName" transfermarkt, "$personName" agent transfermarkt, "$personName" football agent.
                    Find Transfermarkt URLs (agent profiles or agency pages beraterfirma) that contain "$personName".
                    The person may be listed as staff at an agency - include agency pages (beraterfirma) where staff are shown.
                    Return a list of up to 5 Transfermarkt URLs, one per line. Only full URLs containing transfermarkt.com.
                    One URL per line. No other text. If none found: UNKNOWN
                """.trimIndent()
                val response = model.generateContent(prompt)
                val text = response.text?.trim() ?: return@withContext null
                if (text.equals("UNKNOWN", ignoreCase = true) || text.isBlank()) return@withContext null

                val urls = text.lines()
                    .map { it.trim() }
                    .filter { it.isNotBlank() && it.contains("transfermarkt", ignoreCase = true) }
                    .distinct()
                    .take(5)

                if (urls.isEmpty()) return@withContext null

                for (url in urls) {
                    try {
                        val extracted = agencySearch.fetchAgentPageAndExtractAgency(url) ?: continue
                        val (agentNameOnPage, agencyName, agencyUrl) = extracted

                        if (agencyName.isNullOrBlank() || agencyUrl.isNullOrBlank()) continue

                        val isAgentProfile = !url.contains("beraterfirma", ignoreCase = true)
                        if (isAgentProfile) {
                            if (agentNameOnPage.isNullOrBlank() || !nameSimilarityAtLeast(personName, agentNameOnPage, 0.90f)) {
                                Log.d(TAG, "findAgencyViaGoogleAndTransfermarkt: skip agent profile '$url' - name mismatch")
                                continue
                            }
                        } else {
                            // Agency (beraterfirma) page: verify person is in staff
                            if (!agencySearch.isPersonInAgencyStaff(personName, url)) {
                                Log.d(TAG, "findAgencyViaGoogleAndTransfermarkt: skip agency '$url' - $personName not in staff")
                                continue
                            }
                        }

                        Log.d(TAG, "findAgencyViaGoogleAndTransfermarkt: $personName -> $agencyName (${agencyUrl})")
                        return@withContext DiscoveredAgency(
                            agencyName = agencyName,
                            agencyUrl = agencyUrl,
                            personNameOnTransfermarkt = agentNameOnPage
                        )
                    } catch (e: Exception) {
                        Log.w(TAG, "findAgencyViaGoogleAndTransfermarkt: failed to fetch $url", e)
                    }
                }
                null
            } catch (e: Exception) {
                Log.e(TAG, "findAgencyViaGoogleAndTransfermarkt failed", e)
                null
            }
        }

    private fun nameSimilarityAtLeast(a: String, b: String, minSimilarity: Float): Boolean {
        val sa = normalizeName(a)
        val sb = normalizeName(b)
        if (sa == sb) return true
        if (sa.isEmpty() || sb.isEmpty()) return false

        val wordsA = sa.split(" ").filter { it.length > 1 }
        val wordsB = sb.split(" ").filter { it.length > 1 }
        if (wordsA.isEmpty() || wordsB.isEmpty()) {
            val distance = levenshteinDistance(sa, sb)
            val maxLen = maxOf(sa.length, sb.length)
            return (1f - distance.toFloat() / maxLen) >= minSimilarity
        }

        val lastA = wordsA.lastOrNull() ?: ""
        val lastB = wordsB.lastOrNull() ?: ""
        if (lastA != lastB) {
            val lastSimilarity = 1f - levenshteinDistance(lastA, lastB).toFloat() / maxOf(lastA.length, lastB.length, 1)
            if (lastSimilarity < 0.9f) return false
        }

        val fullSimilarity = 1f - levenshteinDistance(sa, sb).toFloat() / maxOf(sa.length, sb.length)
        return fullSimilarity >= minSimilarity
    }

    private fun normalizeName(s: String): String =
        s.trim().lowercase().replace(Regex("\\s+"), " ")

    private fun levenshteinDistance(s1: String, s2: String): Int {
        val len1 = s1.length
        val len2 = s2.length
        val dp = Array(len1 + 1) { IntArray(len2 + 1) }
        for (i in 0..len1) dp[i][0] = i
        for (j in 0..len2) dp[0][j] = j
        for (i in 1..len1) {
            for (j in 1..len2) {
                val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                dp[i][j] = minOf(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                )
            }
        }
        return dp[len1][len2]
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
                    Search site:transfermarkt.com for the football agent "$personName".
                    Try: "$personName", "$personName" agent, "$personName" football agent.
                    Find which agency "$personName" works for (they may be listed in Staff section).
                    Return ONLY the exact agency name as shown on Transfermarkt. No other text.
                    The person must be "$personName" - not someone with a similar name.
                    If not found or uncertain: UNKNOWN
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
                    Search: site:transfermarkt.com "$personName" football agent
                    Find the Transfermarkt profile of the agent "$personName".
                    Return ONLY the exact name as displayed on their Transfermarkt profile.
                    Must be the same person "$personName", not a different agent with similar name.
                    One line. If not found: UNKNOWN
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
