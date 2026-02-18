package com.liordahan.mgsrteam.transfermarket

import android.os.Parcelable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.parcelize.Parcelize
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

internal const val TRANSFERMARKT_BASE_URL: String = "https://www.transfermarkt.com"
internal const val TRANSFERMARKT_USER_AGENT: String =
    "Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko"
internal const val TRANSFERMARKT_TIMEOUT_MS: Int = 12_000
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

private val PAGE_NUMBER_REGEX = Regex("""page=(\d+)""")

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
                    .trim().toIntOrNull() ?: 0) * 1000
            } else if (marketValue.contains("m", true)) {
                return ((marketValue.substringAfter("€")
                    .substringBefore("m")
                    .trim().toDoubleOrNull() ?: 0.0) * 1000000).toInt()
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
                val firstDoc = TransfermarktHttp.fetchDocument(firstPageUrl)
                val pageCount = getTotalPages(firstDoc)

                val enriched = coroutineScope {
                    val sem = Semaphore(10)
                    val enrichJobs = mutableListOf<Deferred<LatestTransferModel?>>()

                    // Parse first page and launch enrichments immediately
                    for (model in parseTransferList(firstDoc)) {
                        enrichJobs += launchEnrich(model, sem)
                    }

                    if (pageCount == 1 && enrichJobs.size >= 20) {
                        // Unknown page count – fetch ahead in batches and pipeline enrichments
                        fetchUntilEmptyPipelined(minValue, maxValue, sem, enrichJobs)
                    } else if (pageCount > 1) {
                        // Known page count – fetch all remaining in parallel, pipeline enrichments
                        val pageFetches = (2..pageCount).map { page ->
                            async {
                                sem.withPermit {
                                    TransfermarktHttp.fetchDocument(buildUrl(minValue, maxValue, page))
                                }.let { parseTransferList(it) }
                            }
                        }
                        for (pf in pageFetches) {
                            for (model in pf.await()) {
                                enrichJobs += launchEnrich(model, sem)
                            }
                        }
                    }

                    enrichJobs.awaitAll().filterNotNull()
                }

                return@withContext TransfermarktResult.Success(enriched)
            } catch (ex: Exception) {
                lastError = ex.localizedMessage
                attempt++
                if (attempt < maxRetries) {
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
        val pageLinks = doc.select("a[href*='page=']")
        val maxPage = pageLinks.mapNotNull { link ->
            PAGE_NUMBER_REGEX.find(link.attr("href"))?.groupValues?.getOrNull(1)?.toIntOrNull()
        }.maxOrNull()
        return (maxPage ?: 1).coerceAtLeast(1)
    }

    /**
     * Fetches pages in batches of 3 until a page returns fewer than 20 items.
     * Immediately launches enrichment for each parsed model so enrichments
     * overlap with subsequent page fetches.
     */
    private suspend fun CoroutineScope.fetchUntilEmptyPipelined(
        minValue: Int,
        maxValue: Int,
        sem: Semaphore,
        enrichJobs: MutableList<Deferred<LatestTransferModel?>>
    ) {
        var page = 2
        val lookahead = 3
        while (true) {
            val batchPages = (page until page + lookahead)
            val docs = batchPages.map { p ->
                async {
                    runCatching {
                        sem.withPermit { TransfermarktHttp.fetchDocument(buildUrl(minValue, maxValue, p)) }
                    }.getOrNull()
                }
            }.awaitAll()

            var shouldStop = false
            for (doc in docs) {
                if (doc == null) { shouldStop = true; break }
                val items = parseTransferList(doc)
                if (items.isEmpty()) { shouldStop = true; break }
                for (model in items) {
                    enrichJobs += launchEnrich(model, sem)
                }
                if (items.size < 20) { shouldStop = true; break }
            }
            if (shouldStop) break
            page += lookahead
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

                LatestTransferModel(
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
            } catch (e: Exception) {
                null
            }
        }
    }

    private fun CoroutineScope.launchEnrich(
        model: LatestTransferModel,
        sem: Semaphore
    ): Deferred<LatestTransferModel?> = async {
        if (model.playerUrl != null &&
            (model.marketValue.isNullOrBlank() || model.playerNationality.isNullOrBlank())
        ) {
            sem.withPermit { enrichFromProfile(model) }
        } else {
            model
        }
    }

    private suspend fun enrichFromProfile(model: LatestTransferModel): LatestTransferModel? {
        return try {
            val doc = TransfermarktHttp.fetchDocument(model.playerUrl!!)
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
                return null
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
