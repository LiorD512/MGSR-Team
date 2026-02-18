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

/**
 * Searches Transfermarkt for player agencies (berater/agent firms).
 * Uses the same quick-search endpoint as ClubSearch; results include an "agents" section.
 */
class AgencySearch {

    /**
     * Search by person name - Transfermarkt may return their agency in the agents section.
     * E.g. "Jonathan Barnett" can match Stellar Group. Returns first agency result if any.
     */
    suspend fun searchAgencyByPersonName(personName: String): AgencySearchModel? =
        withContext(Dispatchers.IO) {
            when (val results = getAgencySearchResults(personName)) {
                is TransfermarktResult.Success -> results.data.firstOrNull()
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
