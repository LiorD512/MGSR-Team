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

internal const val TRANSFERMARKT_BASE_URL: String = "https://www.transfermarkt.com"
internal const val TRANSFERMARKT_USER_AGENT: String =
    "Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko"
internal const val TRANSFERMARKT_TIMEOUT_MS: Int = 30_000
internal const val QUERY_PARAM_TD_ZENTRIERT: String = "td.zentriert"

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

                LatestTransferModel(
                    playerImage,
                    playerName,
                    playerUrl,
                    playerPosition.convertLongPositionNameToShort(),
                    playerAge,
                    null,
                    null,
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

