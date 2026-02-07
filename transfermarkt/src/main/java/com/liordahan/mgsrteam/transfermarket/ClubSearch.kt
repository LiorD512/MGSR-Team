package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.io.IOException
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Result model for club search: logo, name, profile URL, country and country flag for use in contacts.
 */
data class ClubSearchModel(
    val clubName: String? = null,
    val clubLogo: String? = null,
    val clubTmProfile: String? = null,
    val clubCountry: String? = null,
    val clubCountryFlag: String? = null
)

class ClubSearch {

    /**
     * Returns a list of clubs matching the query (logo, name, country).
     * Use the same quick-search endpoint as player search; results include a "clubs" section.
     */
    suspend fun getClubSearchResults(query: String?): TransfermarktResult<List<ClubSearchModel>> =
        withContext(Dispatchers.IO) {
            val sanitizedQuery = query?.trim().orEmpty()
            if (sanitizedQuery.length < 2) {
                return@withContext TransfermarktResult.Success(emptyList())
            }

            try {
                val encodedQuery = URLEncoder.encode(sanitizedQuery, StandardCharsets.UTF_8.toString())
                val searchUrl = "$TRANSFERMARKT_BASE_URL/schnellsuche/ergebnis/schnellsuche?query=$encodedQuery"
                val doc = fetchDocument(searchUrl)

                val clubSection = doc.select("div.box").firstOrNull {
                    val headline = it.select("h2.content-box-headline").text()
                    headline.contains("verein", ignoreCase = true) ||
                        headline.contains("club", ignoreCase = true) ||
                        headline.contains("clubs", ignoreCase = true)
                } ?: return@withContext TransfermarktResult.Success(emptyList())

                val resultList = clubSection
                    .select("table.items tr.odd, table.items tr.even")
                    .mapNotNull { row -> parseClubRow(row) }
                    .filter { it.clubName?.isNotBlank() == true }

                TransfermarktResult.Success(resultList)
            } catch (ex: IOException) {
                TransfermarktResult.Failed(ex.localizedMessage)
            } catch (ex: Exception) {
                TransfermarktResult.Failed(ex.localizedMessage)
            }
        }

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(TRANSFERMARKT_USER_AGENT)
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }

    private fun parseClubRow(element: Element): ClubSearchModel? {
        return try {
            val tds = element.select("td")

            // Club: first img in row = club logo (same pattern as PlayerSearch: first img = entity image)
            val clubImg = element.select("img").firstOrNull()
            val clubLogo = clubImg?.attr("src")?.replace("tiny", "head")?.replace("small", "head")

            // Club name and profile URL: from hauptlink cell (link text or img alt)
            val mainLink = element.select("td.hauptlink a").firstOrNull()
            val href = mainLink?.attr("href")?.takeIf { it.isNotBlank() }
            val clubTmProfile = if (href != null) {
                if (href.startsWith("http")) href else "$TRANSFERMARKT_BASE_URL$href"
            } else null
            val clubName = mainLink?.text()?.trim()
                ?: element.select("td.hauptlink img").firstOrNull()?.attr("alt")?.trim()
                ?: clubImg?.attr("alt")?.trim()
                ?: element.select("td.hauptlink").text().trim()

            // Country and flag: from last column (country column). Use img only from last td
            // so we never take the club logo; if row has 2+ imgs, last img is country flag
            val lastTdImg = tds.lastOrNull()?.select("img")?.firstOrNull()
            val zentriertLastImg = element.select("td.zentriert").lastOrNull()?.select("img")?.firstOrNull()
            val allImgs = element.select("img")
            val countryImg = when {
                lastTdImg != null -> lastTdImg
                zentriertLastImg != null -> zentriertLastImg
                allImgs.size >= 2 -> allImgs.last() // second img = country flag
                else -> null
            }
            val clubCountry = countryImg?.attr("title")?.takeIf { it.isNotBlank() }
                ?: tds.lastOrNull()?.text()?.trim()?.takeIf { it.isNotBlank() }
            val clubCountryFlag = countryImg?.attr("src")?.replace("tiny", "head")?.replace("verysmall", "head")

            ClubSearchModel(
                clubName = clubName,
                clubLogo = clubLogo,
                clubTmProfile = clubTmProfile,
                clubCountry = clubCountry,
                clubCountryFlag = clubCountryFlag
            )
        } catch (e: Exception) {
            null
        }
    }
}
