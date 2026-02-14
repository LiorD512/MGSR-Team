package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
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

/**
 * Fetches and parses the Transfermarkt "Games played together" (gemeinsameSpiele) page
 * for a given player. Returns a list of teammates with match counts.
 * Fetches ALL paginated pages, not just the first.
 *
 * URL format: https://www.transfermarkt.com/player-name/gemeinsameSpiele/spieler/ID/...
 */
class TeammatesFetcher {

    suspend fun fetchTeammates(playerProfileUrl: String?): TransfermarktResult<List<TeammateInfo>> =
        withContext(Dispatchers.IO) {
            val baseUrl = buildGemeinsameSpieleUrl(playerProfileUrl)
                ?: return@withContext TransfermarktResult.Failed("Invalid player URL")
            try {
                val firstDoc = fetchDocument(baseUrl)
                val totalPages = getTotalPages(firstDoc)
                val allTeammates = coroutineScope {
                    val firstPageTeammates = parseTeammatesTable(firstDoc)
                    if (totalPages <= 1) {
                        firstPageTeammates
                    } else {
                        val otherPages = (2..totalPages).map { page ->
                            async {
                                val pageUrl = buildPageUrl(baseUrl, page)
                                val doc = fetchDocument(pageUrl)
                                parseTeammatesTable(doc)
                            }
                        }.map { it.await() }.flatten()
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

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(getRandomUserAgent())
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }

    private fun buildGemeinsameSpieleUrl(playerProfileUrl: String?): String? {
        val url = playerProfileUrl?.trim()?.substringBefore("?") ?: return null
        if (url.isBlank()) return null
        // Try direct replace first (standard format: /player-slug/profil/spieler/ID)
        var base = url
            .replace("/profil/spieler/", "/gemeinsameSpiele/spieler/", ignoreCase = true)
            .replace("/profile/player/", "/gemeinsameSpiele/spieler/", ignoreCase = true)
        if (base != url) {
            return "$base/plus/0/galerie/0?gegner=0&kriterium=0&wettbewerb=&liga=&verein=&pos=&status=1"
        }
        // Fallback: extract player ID and slug from URL
        val playerId = extractPlayerIdFromUrl(url) ?: return null
        val slugMatch = Regex("""transfermarkt\.(?:com|co\.uk|de|es|fr|it|nl|pt|tr)/([^/]+)/profil/spieler/\d+""", RegexOption.IGNORE_CASE).find(url)
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
        // Strategy 1: Parse links with "gegner/" - the stats table has match counts as links containing teammate ID
        val gegnerLinks = doc.select("a[href*='/gegner/']")
        if (gegnerLinks.isNotEmpty()) {
            return gegnerLinks.mapNotNull { link ->
                parseGegnerLink(link)
            }.distinctBy { it.tmProfileUrl }
        }
        // Strategy 2: Parse table rows with player profile links (older/different page structure)
        val rows = doc.select("table.items tbody tr.odd, table.items tbody tr.even")
            .ifEmpty { doc.select("table.items tr.odd, table.items tr.even") }
        return rows.mapNotNull { parseTeammateRow(it) }
    }

    /** Parse a link like .../gegner/284730/... - link text is matches, URL has teammate ID. Skip gegner/0 (filter). */
    private fun parseGegnerLink(link: Element): TeammateInfo? {
        val href = link.attr("href") ?: return null
        val gegnerMatch = Regex("""/gegner/(\d+)""").find(href) ?: return null
        val teammateId = gegnerMatch.groupValues[1]
        if (teammateId == "0") return null // Filter link, not a teammate
        val matchesText = link.text().trim().replace(",", "").replace(".", "")
        val matchesPlayedTogether = matchesText.toIntOrNull()?.takeIf { it in 1..2000 } ?: 0
        if (matchesPlayedTogether == 0) return null // Need valid match count
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

            val href = playerLink.attr("href") ?: return null
            val tmProfileUrl = makeAbsoluteUrl(href)
            val playerName = playerLink.attr("title").takeIf { it.isNotBlank() }
                ?: playerLink.text().trim().takeIf { it.isNotBlank() }

            val hauptlinkText = row.selectFirst("td.hauptlink")?.text()?.trim().orEmpty()
            val position = playerName?.let { name ->
                hauptlinkText.substringAfter(name).trim().takeIf { it.length in 2..30 }
            } ?: null

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

    private fun makeAbsoluteUrl(href: String): String {
        return when {
            href.startsWith("//") -> "https:$href"
            href.startsWith("/") -> "$TRANSFERMARKT_BASE_URL$href"
            href.startsWith("http") -> href
            else -> "$TRANSFERMARKT_BASE_URL/$href"
        }
    }
}
