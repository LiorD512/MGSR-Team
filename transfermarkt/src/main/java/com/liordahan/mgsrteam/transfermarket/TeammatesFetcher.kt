package com.liordahan.mgsrteam.transfermarket

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

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
 *
 * Primary path: calls the MGSR web API (/api/transfermarkt/teammates) which
 * scrapes server-side with realistic headers. Falls back to direct scraping
 * only if the API is unreachable.
 */
class TeammatesFetcher {

    private companion object {
        const val TAG = "TeammatesFetcher"
        const val MAX_RETRIES = 2
        const val RETRY_DELAY_MS = 3_000L
        const val WEB_API_BASE = "https://management.mgsrfa.com"
    }

    private val apiClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    suspend fun fetchTeammates(playerProfileUrl: String?): TransfermarktResult<List<TeammateInfo>> =
        withContext(Dispatchers.IO) {
            if (playerProfileUrl.isNullOrBlank()) {
                return@withContext TransfermarktResult.Failed("Invalid player URL")
            }
            // Primary: use web API proxy (same server-side scraping the web uses)
            try {
                val result = fetchFromWebApi(playerProfileUrl)
                if (result.isNotEmpty()) {
                    Log.d(TAG, "Web API returned ${result.size} teammates for $playerProfileUrl")
                    return@withContext TransfermarktResult.Success(result)
                }
                Log.d(TAG, "Web API returned 0 teammates, trying direct scrape for $playerProfileUrl")
            } catch (e: Exception) {
                Log.w(TAG, "Web API failed (${e.message}), falling back to direct scrape")
            }

            // Fallback: direct scraping from device
            val baseUrl = buildGemeinsameSpieleUrl(playerProfileUrl)
                ?: return@withContext TransfermarktResult.Failed("Invalid player URL")
            try {
                val firstDoc = fetchDocumentWithRetry(baseUrl)
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
                                    val doc = fetchDocumentWithRetry(pageUrl)
                                    parseTeammatesTable(doc)
                                }
                            }
                        }.awaitAll().flatten()
                        (firstPageTeammates + otherPages).distinctBy { it.tmProfileUrl }
                    }
                }
                Log.d(TAG, "Direct scrape returned ${allTeammates.size} teammates")
                TransfermarktResult.Success(allTeammates)
            } catch (e: Exception) {
                TransfermarktResult.Failed(e.localizedMessage ?: "Failed to fetch teammates")
            }
        }

    /** Calls the MGSR web API which scrapes Transfermarkt server-side. */
    private fun fetchFromWebApi(playerProfileUrl: String): List<TeammateInfo> {
        val encoded = URLEncoder.encode(playerProfileUrl, "UTF-8")
        val request = Request.Builder()
            .url("$WEB_API_BASE/api/transfermarkt/teammates?url=$encoded")
            .header("Accept", "application/json")
            .build()
        val response = apiClient.newCall(request).execute()
        response.use { resp ->
            if (!resp.isSuccessful) throw Exception("HTTP ${resp.code}")
            val body = resp.body?.string() ?: throw Exception("Empty body")
            val json = JSONObject(body)
            val arr = json.optJSONArray("teammates") ?: return emptyList()
            val result = mutableListOf<TeammateInfo>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val tmProfileUrl = obj.optString("tmProfileUrl", "")
                val matchesPlayed = obj.optInt("matchesPlayedTogether", 0)
                if (tmProfileUrl.isNotBlank() && matchesPlayed > 0) {
                    result.add(
                        TeammateInfo(
                            tmProfileUrl = tmProfileUrl,
                            playerName = obj.optString("playerName", null),
                            position = obj.optString("position", null),
                            matchesPlayedTogether = matchesPlayed,
                            minutesTogether = if (obj.has("minutesTogether") && !obj.isNull("minutesTogether"))
                                obj.optInt("minutesTogether") else null
                        )
                    )
                }
            }
            return result
        }
    }

    /** Fetches a document with retry logic, matching the web's fetchHtmlWithRetry. */
    private suspend fun fetchDocumentWithRetry(
        url: String,
        maxRetries: Int = MAX_RETRIES
    ): Document {
        var lastError: Exception? = null
        repeat(maxRetries) { attempt ->
            try {
                return TransfermarktHttp.fetchDocument(url)
            } catch (e: Exception) {
                lastError = e
                if (attempt < maxRetries - 1) {
                    delay(RETRY_DELAY_MS)
                }
            }
        }
        throw lastError ?: Exception("Failed after $maxRetries attempts")
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
