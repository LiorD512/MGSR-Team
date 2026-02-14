package com.liordahan.mgsrteam.transfermarket

import android.os.Parcelable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.parcelize.Parcelize
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

internal const val TRANSFERMARKT_BASE_URL: String = "https://www.transfermarkt.com"
internal const val TRANSFERMARKT_USER_AGENT: String =
    "Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko"
internal const val TRANSFERMARKT_TIMEOUT_MS: Int = 30_000
internal const val QUERY_PARAM_TD_ZENTRIERT: String = "td.zentriert"

/** Pool of modern user-agents rotated per request to reduce Transfermarkt blocking. */
internal val TRANSFERMARKT_USER_AGENTS: List<String> = listOf(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0"
)

internal fun getRandomUserAgent(): String = TRANSFERMARKT_USER_AGENTS.random()

@Parcelize
data class LatestTransferModel(
    val playerImage: String? = null,
    val playerName: String? = null,
    val playerUrl: String? = null,
    val playerPosition: String? = null,
    val playerAge: String? = null,
    val playerNationality: String? = null,
    val playerNationalityFlag: String? = null,
    val clubJoinedLogo: String? = null,
    val clubJoinedName: String? = null,
    val transferDate: String? = null,
    val marketValue: String? = null
) : Parcelable {
    fun getRealMarketValue(): Int {
        if (marketValue?.contains("-") == false && marketValue.isNotEmpty()) {
            if (marketValue.contains("k", true)) {
                return (marketValue.substringAfter("€").substringBefore("k")
                    .toInt()) * 1000
            } else if (marketValue.contains("m", true)) {
                return (marketValue.substringAfter("€")
                    .substringBefore("m")
                    .toDouble() * 1000000).toInt()
            }
        }
        return 0
    }
}

class LatestReleases {

    suspend fun getLatestReleases(
        minValue: Int,
        maxValue: Int,
        maxRetries: Int = 3
    ): TransfermarktResult<List<LatestTransferModel?>> = withContext(Dispatchers.IO) {
        var attempt = 0
        var lastError: String? = null

        while (attempt < maxRetries) {
            try {
                val firstPageUrl = buildUrl(minValue, maxValue, page = 1)
                val firstDoc = fetchDocument(firstPageUrl)
                var pageCount = getTotalPages(firstDoc)

                val allTransfers = mutableListOf<LatestTransferModel>()

                // Parse first page synchronously to validate structure early
                allTransfers += parseTransferList(firstDoc)

                // Fallback: if pagination says 1 page but we got a full page (25 items typical), fetch more
                if (pageCount == 1 && allTransfers.size >= 20) {
                    fetchUntilEmpty(minValue, maxValue, allTransfers)
                } else if (pageCount > 1) {
                    // Fetch remaining pages in parallel for better throughput
                    val otherTransfers = coroutineScope {
                        (2..pageCount).map { page ->
                            async {
                                val pageUrl = buildUrl(minValue, maxValue, page)
                                val doc = fetchDocument(pageUrl)
                                parseTransferList(doc)
                            }
                        }.map { it.await() }.flatten()
                    }
                    allTransfers += otherTransfers
                }

                return@withContext TransfermarktResult.Success(allTransfers)
            } catch (ex: Exception) {
                lastError = ex.localizedMessage
                attempt++
                if (attempt < maxRetries) {
                    // Simple linear backoff between retries
                    delay(1_000L * attempt)
                }
            }
        }

        TransfermarktResult.Failed("Failed after $maxRetries attempts. Last error: $lastError")
    }

    private fun buildUrl(min: Int, max: Int, page: Int): String {
        return "$TRANSFERMARKT_BASE_URL/transfers/neuestetransfers/statistik" +
                "?land_id=0&wettbewerb_id=alle&minMarktwert=$min&maxMarktwert=$max&plus=1&page=$page"
    }

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(getRandomUserAgent())
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }

    private fun getTotalPages(doc: Document): Int {
        val paginationSelectors = listOf(
            "div.pager li.tm-pagination__list-item",
            "li.tm-pagination__list-item",
            "ul.tm-pagination li",
            "div.pager li"
        )
        for (selector in paginationSelectors) {
            val fromPager = doc.select(selector)
                .mapNotNull { it.text().trim().toIntOrNull() }
                .maxOrNull()
            if (fromPager != null && fromPager >= 1) return fromPager
        }
        // Fallback: check for page numbers in any links
        val pageLinks = doc.select("a[href*='page=']")
        val maxPage = pageLinks.mapNotNull { link ->
            Regex("""page=(\d+)""").find(link.attr("href"))?.groupValues?.getOrNull(1)?.toIntOrNull()
        }.maxOrNull()
        return (maxPage ?: 1).coerceAtLeast(1)
    }

    /** When pagination is not detected, fetch pages sequentially until we get fewer than 20 items. */
    private fun fetchUntilEmpty(minValue: Int, maxValue: Int, into: MutableList<LatestTransferModel>) {
        var page = 2
        while (true) {
            val doc = fetchDocument(buildUrl(minValue, maxValue, page))
            val items = parseTransferList(doc)
            if (items.isEmpty()) break
            into += items
            if (items.size < 20) break
            page++
        }
    }

    /** "Without Club" in various languages - only include players who are free agents */
    private val WITHOUT_CLUB_VARIANTS = setOf(
        "without club", "ohne verein", "sans club", "sin club", "senza squadra",
        "sem clube", "geen club", "bez klubu", "klubsuz", "free agent"
    )

    private fun isWithoutClub(row: Element): Boolean {
        val tables = row.select("table.inline-table")
        if (tables.size < 3) return false
        val newClubCell = tables[2]
        val imgAlt = newClubCell.select("img").attr("alt").trim().lowercase()
        val cellText = newClubCell.text().trim().lowercase()
        return WITHOUT_CLUB_VARIANTS.any { imgAlt.contains(it) || cellText.contains(it) }
    }

    private fun parseTransferList(doc: Document): List<LatestTransferModel> {
        val transferRows = doc.select("table.items")
            .flatMap { it.select("tr.odd, tr.even") }
            .filter { isWithoutClub(it) }

        return transferRows.mapNotNull { element ->
            try {
                val td = element.select("td")
                val tables = td.select("table.inline-table")
                val playerImage = tables[0].select("img").attr("data-src").replace("medium", "big")
                val playerName = tables[0].select("img").attr("title")
                val playerUrl = "https://www.transfermarkt.com${tables[0].select("a").attr("href")}"
                val playerPosition = tables[0].select("tr")[1].text().replace("-", " ")
                val playerAge = element.select(QUERY_PARAM_TD_ZENTRIERT)[0].text()

                val transferDate = element.select(QUERY_PARAM_TD_ZENTRIERT)[2].text()
                val marketValue = element.select("td.rechts")[0].text()

                val (playerNationality, playerNationalityFlag) = extractNationalityAndFlag(element)

                var model = LatestTransferModel(
                    playerImage,
                    playerName,
                    playerUrl,
                    playerPosition.convertLongPositionNameToShort(),
                    playerAge,
                    playerNationality,
                    playerNationalityFlag,
                    null,
                    null,
                    transferDate,
                    marketValue
                )

                // Enrich missing data from profile; when we fetch profile, verify still without club
                if (model.playerUrl != null &&
                    (model.marketValue.isNullOrBlank() || model.playerNationality.isNullOrBlank())
                ) {
                    val enriched = enrichFromProfile(model)
                    if (enriched == null) return@mapNotNull null // Player has found a club - exclude
                    model = enriched
                }

                model
            } catch (e: Exception) {
                null
            }
        }
    }

    private fun extractNationalityAndFlag(element: Element): Pair<String?, String?> {
        val nationalityImg = element.select("td.zentriert img[title]").firstOrNull()
            ?: element.select("td img[alt]").firstOrNull { it.attr("alt").length in 2..50 }
        val playerNationality = nationalityImg?.attr("title")?.takeIf { it.isNotBlank() }
            ?: nationalityImg?.attr("alt")?.takeIf { it.isNotBlank() }
        val flagSrc = nationalityImg?.attr("data-src")?.takeIf { it.isNotBlank() }
            ?: nationalityImg?.attr("src")?.takeIf { it.isNotBlank() }
        val playerNationalityFlag = flagSrc?.let { makeAbsoluteUrl(it) }
            ?.replace("verysmall", "head")
            ?.replace("tiny", "head")
        return playerNationality to playerNationalityFlag
    }

    private fun enrichFromProfile(model: LatestTransferModel): LatestTransferModel? {
        return try {
            val doc = fetchDocument(model.playerUrl!!)
            // Verify player is still without club (may have joined since list was updated)
            val clubSelectors = listOf(
                "span.data-header__club a",
                "span.data-header__club",
                "div.data-header a[href*='/startseite/verein/']",
                "div.info-table__content--bold a[href*='/startseite/verein/']"
            )
            var clubName = ""
            for (sel in clubSelectors) {
                val elements = doc.select(sel)
                for (el in elements) {
                    val text = (el.attr("title").ifBlank { el.text() }.trim()).lowercase()
                    if (text.isNotBlank() && text.length < 80 && !text.contains("transfermarkt")) {
                        clubName = text
                        break
                    }
                }
                if (clubName.isNotBlank()) break
            }
            // Fallback: find "Current club" / "Verein" row and get linked club
            if (clubName.isBlank()) {
                for (el in doc.select("dt, span.info-table__content--bold, td")) {
                    val label = el.text().trim().lowercase()
                    if (label.contains("current club") || label == "verein" || label.contains("aktueller verein")) {
                        val link = el.nextElementSibling()?.select("a[href*='verein/']")?.firstOrNull()
                            ?: el.parent()?.select("a[href*='verein/']")?.firstOrNull()
                        clubName = (link?.attr("title")?.ifBlank { link.text() }?.trim() ?: "").lowercase()
                        if (clubName.isNotBlank()) break
                    }
                }
            }
            if (clubName.isNotBlank() && !WITHOUT_CLUB_VARIANTS.any { clubName.contains(it) }) {
                return null // Player has found a club - exclude from list
            }
            val marketValue = model.marketValue?.takeIf { it.isNotBlank() }
                ?: doc.select("div.data-header__box--small").text()
                    .substringBefore("Last")
                    .trim()
                    .takeIf { it.isNotBlank() }
            val nationalityElement = doc.select("[itemprop=nationality] img").firstOrNull()
            val nationality = model.playerNationality?.takeIf { it.isNotBlank() }
                ?: nationalityElement?.attr("title")?.takeIf { it.isNotBlank() }
            val flagSrc = model.playerNationalityFlag?.takeIf { it.isNotBlank() }
                ?: nationalityElement?.attr("src")?.takeIf { it.isNotBlank() }
                    ?.replace("tiny", "head")
                    ?.replace("verysmall", "head")
                    ?.let { makeAbsoluteUrl(it) }
            model.copy(
                marketValue = marketValue ?: model.marketValue,
                playerNationality = nationality ?: model.playerNationality,
                playerNationalityFlag = flagSrc ?: model.playerNationalityFlag
            )
        } catch (e: Exception) {
            model
        }
    }

    private fun makeAbsoluteUrl(url: String): String {
        return when {
            url.startsWith("//") -> "https:$url"
            url.startsWith("/") -> "$TRANSFERMARKT_BASE_URL$url"
            url.startsWith("http") -> url
            else -> url
        }
    }
}

fun String?.convertLongPositionNameToShort(): String {
    return when (this) {
        "Goalkeeper" -> "GK"
        "Left Back" -> "LB"
        "Centre Back" -> "CB"
        "Right Back" -> "RB"
        "Defensive Midfield" -> "DM"
        "Central Midfield" -> "CM"
        "Attacking Midfield" -> "AM"
        "Right Winger" -> "RW"
        "Left Winger" -> "LW"
        "Centre Forward" -> "CF"
        "Second Striker" -> "SS"
        "Left Midfield" -> "LM"
        "Right Midfield" -> "RM"
        else -> this ?: ""
    }
}

