package com.liordahan.mgsrteam.transfermarket

import android.os.Parcelable
import com.liordahan.mgsrteam.helpers.Result
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.parcelize.Parcelize
import org.jsoup.Jsoup
import org.jsoup.nodes.Document

const val userAgent = "Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko"
const val TIME_OUT = 30000
const val queryParamTdZentriert = "td.zentriert"

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
    ): Result<List<LatestTransferModel?>> =
        withContext(Dispatchers.IO) {
            var attempt = 0
            var lastError: String? = null

            while (attempt < maxRetries) {
                try {
                    val allTransfers = mutableListOf<LatestTransferModel>()
                    val firstPageUrl = buildUrl(minValue, maxValue, 1)
                    val firstDoc = fetchDocument(firstPageUrl)
                    val pageCount = getTotalPages(firstDoc)

                    for (page in 1..pageCount) {
                        val pageUrl = buildUrl(minValue, maxValue, page)
                        val doc = fetchDocument(pageUrl)
                        val transfers = parseTransferList(doc)
                        allTransfers.addAll(transfers)
                    }

                    return@withContext Result.Success(allTransfers)
                } catch (ex: Exception) {
                    lastError = ex.localizedMessage
                    attempt++
                    if (attempt < maxRetries) {
                        // Delay before retrying (optional)
                        kotlinx.coroutines.delay(1000L * attempt)
                    }
                }
            }

            Result.Failed("Failed after $maxRetries attempts. Last error: $lastError")
        }

    private fun buildUrl(min: Int, max: Int, page: Int): String {
        return "https://www.transfermarkt.com/transfers/neuestetransfers/statistik" +
                "?land_id=0&wettbewerb_id=alle&minMarktwert=$min&maxMarktwert=$max&plus=1&page=$page"
    }

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(userAgent)
            .timeout(TIME_OUT)
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
                val playerAge = element.select(queryParamTdZentriert)[0].text()
                val playerNationality = element.select(queryParamTdZentriert)[1].select("img").attr("title")
                val playerNationalityFlag = element.select(queryParamTdZentriert)[1].select("img").attr("src")
                    .replace("verysmall", "head")

                val clubJoinedTable = tables[2]
                val clubJoinedLogo = clubJoinedTable.select("img").attr("src").replace("tiny", "head")
                val clubJoinedName = clubJoinedTable.select("img").attr("alt")

                val transferDate = element.select(queryParamTdZentriert)[2].text()
                val marketValue = element.select("td.rechts")[0].text()

                LatestTransferModel(
                    playerImage,
                    playerName,
                    playerUrl,
                    playerPosition.convertLongPositionNameToShort(),
                    playerAge,
                    playerNationality,
                    playerNationalityFlag,
                    clubJoinedLogo,
                    clubJoinedName,
                    transferDate,
                    marketValue
                )
            } catch (e: Exception) {
                null // Skip malformed rows
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

        else -> {
            this ?: ""
        }
    }
}