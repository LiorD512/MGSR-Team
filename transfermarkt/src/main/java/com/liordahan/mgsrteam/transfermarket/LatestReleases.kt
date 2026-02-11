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
                val pageCount = getTotalPages(firstDoc)

                val allTransfers = mutableListOf<LatestTransferModel>()

                // Parse first page synchronously to validate structure early
                allTransfers += parseTransferList(firstDoc)

                if (pageCount > 1) {
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
            .userAgent(TRANSFERMARKT_USER_AGENT)
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }

    private fun getTotalPages(doc: Document): Int {
        return doc.select("div.pager li.tm-pagination__list-item")
            .mapNotNull { it.text().toIntOrNull() }
            .maxOrNull() ?: 1
    }

    private fun parseTransferList(doc: Document): List<LatestTransferModel> {
        val transferRows = doc.select("table.items")
            .flatMap { it.select("tr.odd, tr.even") }
            .filter { it.select("table.inline-table")[2].select("img").attr("alt") == "Without Club" }

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

                // Enrich missing market value / nationality from player profile (same as Returnees)
                if (model.playerUrl != null &&
                    (model.marketValue.isNullOrBlank() || model.playerNationality.isNullOrBlank())
                ) {
                    model = enrichFromProfile(model)
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

    private fun enrichFromProfile(model: LatestTransferModel): LatestTransferModel {
        return try {
            val doc = fetchDocument(model.playerUrl!!)
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

