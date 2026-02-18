package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

/**
 * Represents a teammate from the "Games played together" (gemeinsameSpiele) page.
 */
data class TeammateInfo(
    val tmProfileUrl: String,
    val playerName: String?,
    val position: String?,
    val matchesPlayedTogether: Int,
    val minutesTogether: Int?
)

private val TM_SLUG_REGEX = Regex(
    """transfermarkt\.(?:com|co\.uk|de|es|fr|it|nl|pt|tr)/([^/]+)/profil/spieler/\d+""",
    RegexOption.IGNORE_CASE
)
private val GEGNER_ID_REGEX = Regex("""/gegner/(\d+)""")

/**
 * Fetches and parses the Transfermarkt "Games played together" (gemeinsameSpiele) page
 * for a given player. Returns a list of teammates with match counts.
 * Fetches ALL paginated pages, not just the first.
 */
class TeammatesFetcher {

    suspend fun fetchTeammates(playerProfileUrl: String?): TransfermarktResult<List<TeammateInfo>> =
        withContext(Dispatchers.IO) {
            val baseUrl = buildGemeinsameSpieleUrl(playerProfileUrl)
                ?: return@withContext TransfermarktResult.Failed("Invalid player URL")
            try {
                val firstDoc = TransfermarktHttp.fetchDocument(baseUrl)
                val totalPages = getTotalPages(firstDoc)
                val allTeammates = coroutineScope {
                    val firstPageTeammates = parseTeammatesTable(firstDoc)
                    if (totalPages <= 1) {
                        firstPageTeammates
                    } else {
                        val semaphore = Semaphore(10)
                        val otherPages = (2..totalPages).map { page ->
                            async {
                                semaphore.withPermit {
                                    val pageUrl = buildPageUrl(baseUrl, page)
                                    val doc = TransfermarktHttp.fetchDocument(pageUrl)
                                    parseTeammatesTable(doc)
                                }
                            }
                        }.awaitAll().flatten()
                        (firstPageTeammates + otherPages).distinctBy { it.tmProfileUrl }
                    }
                }
                TransfermarktResult.Success(allTeammates)
            } catch (e: Exception) {
                TransfermarktResult.Failed(e.localizedMessage ?: "Failed to fetch teammates")
            }
        }

    private fun getTotalPages(doc: Document): Int {
        return doc.select("div.pager li.tm-pagination__list-item, li.tm-pagination__list-item")
            .mapNotNull { it.text().trim().toIntOrNull() }
            .maxOrNull() ?: 1
    }

    private fun buildPageUrl(baseUrl: String, page: Int): String {
        val separator = if (baseUrl.contains("?")) "&" else "?"
        return "$baseUrl${separator}page=$page"
    }

    private fun buildGemeinsameSpieleUrl(playerProfileUrl: String?): String? {
        val url = playerProfileUrl?.trim()?.substringBefore("?") ?: return null
        if (url.isBlank()) return null
        var base = url
            .replace("/profil/spieler/", "/gemeinsameSpiele/spieler/", ignoreCase = true)
            .replace("/profile/player/", "/gemeinsameSpiele/spieler/", ignoreCase = true)
        if (base != url) {
            return "$base/plus/0/galerie/0?gegner=0&kriterium=0&wettbewerb=&liga=&verein=&pos=&status=1"
        }
        val playerId = extractPlayerIdFromUrl(url) ?: return null
        val slugMatch = TM_SLUG_REGEX.find(url)
        val slug = slugMatch?.groupValues?.getOrNull(1) ?: "spieler"
        return "https://www.transfermarkt.com/$slug/gemeinsameSpiele/spieler/$playerId/plus/0/galerie/0?gegner=0&kriterium=0&wettbewerb=&liga=&verein=&pos=&status=1"
    }

    private fun extractPlayerIdFromUrl(url: String): String? {
        val parts = url.trim().split("/")
        val spielerIndex = parts.indexOfLast { it.equals("spieler", ignoreCase = true) }
        return if (spielerIndex >= 0 && spielerIndex < parts.lastIndex) {
            parts[spielerIndex + 1].takeIf { it.all(Char::isDigit) }
        } else {
            parts.lastOrNull()?.takeIf { it.all(Char::isDigit) }
        }
    }

    private fun parseTeammatesTable(doc: Document): List<TeammateInfo> {
        val gegnerLinks = doc.select("a[href*='/gegner/']")
        if (gegnerLinks.isNotEmpty()) {
            return gegnerLinks.mapNotNull { link ->
                parseGegnerLink(link)
            }.distinctBy { it.tmProfileUrl }
        }
        val rows = doc.select("table.items tbody tr.odd, table.items tbody tr.even")
            .ifEmpty { doc.select("table.items tr.odd, table.items tr.even") }
        return rows.mapNotNull { parseTeammateRow(it) }
    }

    /** Parse a link like .../gegner/284730/... - link text is matches, URL has teammate ID. Skip gegner/0 (filter). */
    private fun parseGegnerLink(link: Element): TeammateInfo? {
        val href = link.attr("href")
        val gegnerMatch = GEGNER_ID_REGEX.find(href) ?: return null
        val teammateId = gegnerMatch.groupValues[1]
        if (teammateId == "0") return null
        val matchesText = link.text().trim().replace(",", "").replace(".", "")
        val matchesPlayedTogether = matchesText.toIntOrNull()?.takeIf { it in 1..2000 } ?: 0
        if (matchesPlayedTogether == 0) return null
        val tmProfileUrl = "$TRANSFERMARKT_BASE_URL/profil/spieler/$teammateId"
        return TeammateInfo(
            tmProfileUrl = tmProfileUrl,
            playerName = null,
            position = null,
            matchesPlayedTogether = matchesPlayedTogether,
            minutesTogether = null
        )
    }

    private fun parseTeammateRow(row: Element): TeammateInfo? {
        return try {
            val playerLink = row.selectFirst("td.hauptlink a[href*='/profil/spieler/'], td.hauptlink a[href*='/profile/player/']")
                ?: row.selectFirst("td a[href*='/profil/spieler/'], td a[href*='/profile/player/']")
                ?: return null

            val href = playerLink.attr("href")
            val tmProfileUrl = makeAbsoluteUrl(href)
            val playerName = playerLink.attr("title").takeIf { it.isNotBlank() }
                ?: playerLink.text().trim().takeIf { it.isNotBlank() }

            val hauptlinkText = row.selectFirst("td.hauptlink")?.text()?.trim().orEmpty()
            val position = playerName?.let { name ->
                hauptlinkText.substringAfter(name).trim().takeIf { it.length in 2..30 }
            }

            val cells = row.select("td")
            val matchesPlayedTogether = (1..minOf(3, cells.size - 1)).mapNotNull { i ->
                cells.getOrNull(i)?.text()?.trim()?.replace(",", "")?.replace(".", "")?.toIntOrNull()
            }.firstOrNull { it in 1..2000 } ?: 0

            val minutesTogether = row.select("td.rechts, td.zentriert")
                .mapNotNull { it.text().trim().replace(".", "").replace(",", "").toIntOrNull() }
                .firstOrNull { it in 100..200000 }

            TeammateInfo(
                tmProfileUrl = tmProfileUrl,
                playerName = playerName,
                position = position?.convertLongPositionNameToShort(),
                matchesPlayedTogether = matchesPlayedTogether,
                minutesTogether = minutesTogether
            )
        } catch (e: Exception) {
            null
        }
    }
}
