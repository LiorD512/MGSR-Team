package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.nodes.Element
import java.io.IOException
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Result model for agency/agent search on Transfermarkt.
 * Used when linking agency contacts to their Transfermarkt profile.
 */
data class AgencySearchModel(
    val agencyName: String? = null,
    val agencyUrl: String? = null
)

/** Internal: agency + agent names from the same search result row (when available). */
private data class AgencyRow(
    val agency: AgencySearchModel,
    val agentNamesFromRow: List<String>
)

/**
 * Searches Transfermarkt for player agencies (berater/agent firms).
 * Uses the same quick-search endpoint as ClubSearch; results include an "agents" section.
 */
class AgencySearch {

    /**
     * Search by person name - Transfermarkt may return their agency in the agents section.
     * When multiple agencies match: 1) prefer row where agent names contain person,
     * 2) else fetch each page and pick where person is in Staff.
     */
    suspend fun searchAgencyByPersonName(personName: String): AgencySearchModel? =
        withContext(Dispatchers.IO) {
            when (val rows = getAgencyRowsByPersonName(personName)) {
                null -> null
                else -> {
                    if (rows.isEmpty()) return@withContext null
                    if (rows.size == 1) return@withContext rows.first().agency

                    // 1) Prefer row where agent names from search result contain the person
                    rows.firstOrNull { row ->
                        row.agentNamesFromRow.any { namesMatch(personName, it) }
                    }?.agency
                        ?: rows.firstOrNull { row ->
                            row.agency.agencyUrl?.let { isPersonInAgencyStaff(personName, it) } == true
                        }?.agency
                        ?: rows.first().agency
                }
            }
        }

    /**
     * Fetches an agency page and checks if the person name appears in the Staff section.
     * Falls back to raw HTML contains check if structured parsing finds nothing.
     */
    suspend fun isPersonInAgencyStaff(personName: String, agencyUrl: String): Boolean =
        withContext(Dispatchers.IO) {
            val staffNames = fetchAgencyPageStaffNames(agencyUrl)
            if (staffNames.any { namesMatch(personName, it) }) return@withContext true
            try {
                val (_, html) = TransfermarktHttp.fetchDocumentWithHtml(agencyUrl)
                val words = personName.trim().split(Regex("\\s+")).filter { it.length > 1 }
                if (words.size >= 2) {
                    html.contains(words.last(), ignoreCase = true) && html.contains(words.first(), ignoreCase = true)
                } else {
                    html.contains(personName.trim(), ignoreCase = true)
                }
            } catch (e: Exception) {
                false
            }
        }

    private fun namesMatch(a: String, b: String): Boolean {
        val sa = a.trim().lowercase().replace(Regex("\\s+"), " ")
        val sb = b.trim().lowercase().replace(Regex("\\s+"), " ")
        if (sa == sb) return true
        if (sa.isEmpty() || sb.isEmpty()) return false
        val wordsA = sa.split(" ").filter { it.length > 1 }
        val wordsB = sb.split(" ").filter { it.length > 1 }
        if (wordsA.isEmpty() || wordsB.isEmpty()) {
            return sa in sb || sb in sa || levenshteinSimilarity(sa, sb) >= 0.9f
        }
        val lastA = wordsA.lastOrNull() ?: ""
        val lastB = wordsB.lastOrNull() ?: ""
        if (lastA != lastB && levenshteinSimilarity(lastA, lastB) < 0.9f) return false
        return levenshteinSimilarity(sa, sb) >= 0.9f
    }

    private fun levenshteinSimilarity(s1: String, s2: String): Float {
        val d = levenshteinDistance(s1, s2)
        return 1f - d.toFloat() / maxOf(s1.length, s2.length, 1)
    }

    private fun levenshteinDistance(s1: String, s2: String): Int {
        val len1 = s1.length
        val len2 = s2.length
        val dp = Array(len1 + 1) { IntArray(len2 + 1) }
        for (i in 0..len1) dp[i][0] = i
        for (j in 0..len2) dp[0][j] = j
        for (i in 1..len1) {
            for (j in 1..len2) {
                val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                dp[i][j] = minOf(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
            }
        }
        return dp[len1][len2]
    }

    /**
     * Fetches an agency (beraterfirma) page and extracts staff/agent names from the Staff section.
     */
    suspend fun fetchAgencyPageStaffNames(agencyUrl: String): List<String> =
        withContext(Dispatchers.IO) {
            try {
                val doc = TransfermarktHttp.fetchDocument(agencyUrl)
                val staffNames = mutableListOf<String>()

                // Staff section: table with agent names (e.g. "Boris Laval", "Arnaud Vaillant")
                doc.select("div.box").forEach { box ->
                    val headline = box.select("h2.content-box-headline").text().lowercase()
                    if (headline.contains("staff") || headline.contains("berater") ||
                        headline.contains("agent") || headline.contains("mitarbeiter")
                    ) {
                        box.select("table.items tr.odd, table.items tr.even").forEach { row ->
                            val nameCell = row.select("td.hauptlink a").firstOrNull()
                                ?: row.select("td.hauptlink").firstOrNull()
                                ?: row.select("td a").firstOrNull()
                            val name = nameCell?.text()?.trim()?.takeIf { it.isNotBlank() }
                            if (name != null && name.length > 2) staffNames.add(name)
                        }
                    }
                }

                // Fallback: agent profile links (profil/berater) - excludes agency self-links
                if (staffNames.isEmpty()) {
                    doc.select("a[href*='/profil/berater/']").forEach { link ->
                        val name = link.text().trim().takeIf { it.isNotBlank() && it.length in 4..50 }
                        if (name != null && name.contains(" ")) staffNames.add(name)
                    }
                }

                staffNames.distinct()
            } catch (e: Exception) {
                emptyList()
            }
        }

    /**
     * Returns agency rows (agency + agent names from same row) for person name search.
     * Used to pick the correct agency when multiple match (e.g. Boris Laval -> 2SAgency).
     */
    private suspend fun getAgencyRowsByPersonName(personName: String): List<AgencyRow>? =
        withContext(Dispatchers.IO) {
            when (val results = getAgencySearchResults(personName)) {
                is TransfermarktResult.Success -> {
                    if (results.data.isEmpty()) return@withContext emptyList()
                    try {
                        val encodedQuery = URLEncoder.encode(personName.trim(), StandardCharsets.UTF_8.toString())
                        val searchUrl = "$TRANSFERMARKT_BASE_URL/schnellsuche/ergebnis/schnellsuche?query=$encodedQuery"
                        val doc = TransfermarktHttp.fetchDocument(searchUrl)
                        val agentSection = doc.select("div.box").firstOrNull {
                            val h = it.select("h2.content-box-headline").text()
                            h.contains("agent", ignoreCase = true) || h.contains("berater", ignoreCase = true)
                        } ?: return@withContext results.data.map { AgencyRow(it, emptyList()) }

                        agentSection.select("table.items tr.odd, table.items tr.even")
                            .mapNotNull { row -> parseAgencyRowWithAgents(row) }
                            .takeIf { it.isNotEmpty() }
                            ?: results.data.map { AgencyRow(it, emptyList()) }
                    } catch (e: Exception) {
                        results.data.map { AgencyRow(it, emptyList()) }
                    }
                }
                is TransfermarktResult.Failed -> null
            }
        }

    /**
     * Returns agencies matching the query (name, profile URL).
     * Parses the "Search results for agents" section from schnellsuche.
     */
    suspend fun getAgencySearchResults(query: String?): TransfermarktResult<List<AgencySearchModel>> =
        withContext(Dispatchers.IO) {
            val sanitizedQuery = query?.trim().orEmpty()
            if (sanitizedQuery.length < 2) {
                return@withContext TransfermarktResult.Success(emptyList())
            }

            try {
                val encodedQuery = URLEncoder.encode(sanitizedQuery, StandardCharsets.UTF_8.toString())
                val searchUrl = "$TRANSFERMARKT_BASE_URL/schnellsuche/ergebnis/schnellsuche?query=$encodedQuery"
                val doc = TransfermarktHttp.fetchDocument(searchUrl)

                val agentSection = doc.select("div.box").firstOrNull {
                    val headline = it.select("h2.content-box-headline").text()
                    headline.contains("agent", ignoreCase = true) ||
                        headline.contains("berater", ignoreCase = true) ||
                        headline.contains("agencies", ignoreCase = true)
                } ?: return@withContext TransfermarktResult.Success(emptyList())

                val resultList = agentSection
                    .select("table.items tr.odd, table.items tr.even")
                    .mapNotNull { row -> parseAgencyRow(row) }
                    .filter { it.agencyName?.isNotBlank() == true && it.agencyUrl?.isNotBlank() == true }

                TransfermarktResult.Success(resultList)
            } catch (ex: IOException) {
                TransfermarktResult.Failed(ex.localizedMessage)
            } catch (ex: Exception) {
                TransfermarktResult.Failed(ex.localizedMessage)
            }
        }

    private fun parseAgencyRowWithAgents(element: Element): AgencyRow? {
        val agency = parseAgencyRow(element) ?: return null
        val agentNames = mutableSetOf<String>()
        val agencyNameLower = agency.agencyName?.lowercase() ?: ""

        element.select("td").forEach { td ->
            td.select("a").forEach { link ->
                val text = link.text().trim()
                val href = link.attr("href")
                if (text.length in 4..50 &&
                    !text.equals(agency.agencyName, ignoreCase = true) &&
                    !agencyNameLower.contains(text.lowercase()) &&
                    (href.contains("profil/berater") || (href.contains("berater") && !href.contains("beraterfirma/berater/")))
                ) {
                    agentNames.add(text)
                }
            }
            val plainText = td.text().trim()
            if (plainText.length in 4..40 && plainText.contains(" ") &&
                !plainText.equals(agency.agencyName, ignoreCase = true) &&
                plainText.matches(Regex("^[\\p{L}\\s.-]+$")) &&
                plainText.lowercase() !in listOf("premium service", "company", "licence", "agents")
            ) {
                agentNames.add(plainText)
            }
        }
        return AgencyRow(agency, agentNames.toList())
    }

    private fun parseAgencyRow(element: Element): AgencySearchModel? {
        return try {
            val mainLink = element.select("td.hauptlink a").firstOrNull()
                ?: element.select("a[href*='beraterfirma']").firstOrNull()
            val href = mainLink?.attr("href")?.takeIf { it.isNotBlank() }
            val agencyUrl = if (href != null) {
                if (href.startsWith("http")) href else "$TRANSFERMARKT_BASE_URL$href"
            } else null
            val agencyName = mainLink?.text()?.trim()
                ?: element.select("td.hauptlink").text().trim().takeIf { it.isNotBlank() }

            if (agencyName.isNullOrBlank() || agencyUrl.isNullOrBlank()) return null
            AgencySearchModel(agencyName = agencyName, agencyUrl = agencyUrl)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Fetches an agent or agency page and extracts agent name + agency info.
     * Used when we have a Transfermarkt URL from web search.
     * @return Triple(agentNameOnPage, agencyName, agencyUrl) or null if parsing fails
     */
    suspend fun fetchAgentPageAndExtractAgency(pageUrl: String): Triple<String?, String?, String?>? =
        withContext(Dispatchers.IO) {
            try {
                val doc = TransfermarktHttp.fetchDocument(pageUrl)
                val agentName = doc.select("h1.data-header__headline-wrapper").text().trim()
                    .takeIf { it.isNotBlank() }
                    ?: doc.select("div.data-header__headline-container h1").text().trim().takeIf { it.isNotBlank() }
                    ?: doc.select("h1").firstOrNull()?.text()?.trim()?.takeIf { it.isNotBlank() }

                var agencyName: String? = null
                var agencyUrl: String? = null

                val infoLabels = doc.select("span.info-table__content--bold, dt.info-table__content--bold")
                for (label in infoLabels) {
                    val labelText = label.text().trim().lowercase()
                    val parent = label.parent() ?: continue
                    val valueSpan = parent.select("dd.info-table__content, span.info-table__content").firstOrNull()
                        ?: label.nextElementSibling() ?: continue

                    if (labelText.contains("agent") || labelText.contains("agency") ||
                        labelText.contains("berater") || labelText.contains("beraterfirma")
                    ) {
                        val link = valueSpan.select("a[href*='beraterfirma'], a[href*='berater']").firstOrNull()
                        agencyName = link?.text()?.trim()?.takeIf { it.isNotBlank() }
                            ?: valueSpan.text().trim().takeIf { it.isNotBlank() }
                        val href = link?.attr("href")
                        if (!href.isNullOrBlank() && href.contains("beraterfirma")) {
                            agencyUrl = if (href.startsWith("http")) href else "$TRANSFERMARKT_BASE_URL$href"
                        }
                        break
                    }
                }

                if (agencyName == null && agencyUrl == null) {
                    val beraterfirmaLink = doc.select("a[href*='beraterfirma']").firstOrNull()
                    if (beraterfirmaLink != null) {
                        agencyName = beraterfirmaLink.text().trim().takeIf { it.isNotBlank() }
                        val href = beraterfirmaLink.attr("href")
                        agencyUrl = if (href.startsWith("http")) href else "$TRANSFERMARKT_BASE_URL$href"
                    }
                }

                if (pageUrl.contains("beraterfirma") && agencyName == null) {
                    agencyName = agentName ?: doc.select("h1").firstOrNull()?.text()?.trim()
                    agencyUrl = pageUrl
                }

                Triple(agentName, agencyName, agencyUrl)
            } catch (e: Exception) {
                null
            }
        }
}
