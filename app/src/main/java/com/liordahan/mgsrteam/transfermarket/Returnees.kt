package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import com.liordahan.mgsrteam.helpers.Result

class Returnees {

    suspend fun fetchReturnees(leagueUrl: String): Result<List<LatestTransferModel>> = withContext(Dispatchers.IO) {
        val players = mutableListOf<LatestTransferModel>()


        try {
                val doc = Jsoup.connect(leagueUrl)
                    .userAgent("Mozilla/5.0")
                    .timeout(15_000)
                    .get()

                val teamRows = doc.select("table.items > tbody > tr")

                for (row in teamRows) {
                    val linkElement = row.selectFirst("td:nth-child(2) a[href]") ?: continue
                    val teamRelativeUrl = linkElement.attr("href")

                    if (!teamRelativeUrl.contains("/startseite/verein/")) continue

                    val transferUrl = "https://www.transfermarkt.com" +
                            teamRelativeUrl.replace("/startseite/", "/transfers/") +
                            "/saison_id"

                    try {
                        val transferDoc = Jsoup.connect(transferUrl)
                            .userAgent("Mozilla/5.0")
                            .timeout(15_000)
                            .get()

                        val playerRows = transferDoc.select("table.items")[0].selectFirst("tbody").children()

                        val departureRows = transferDoc.select("table.items")[1].selectFirst("tbody").children()
                        val departurePlayerUrls = departureRows.mapNotNull { row ->
                            row.selectFirst("td.hauptlink a")?.attr("href")?.let { "https://www.transfermarkt.com$it" }
                        }.toSet()

                        for (playerRow in playerRows) {
                            if (!playerRow.text().contains("End of loan", ignoreCase = true)) continue

                            val imageUrl = playerRow.selectFirst("img")?.attr("data-src")?.replace("tiny", "big")
                            val nameElement = playerRow.selectFirst("td.hauptlink a")
                            val playerName = nameElement?.text()
                            val playerUrl = nameElement?.attr("href")?.let { "https://www.transfermarkt.com$it" }

                            val alsoInDeparture = playerUrl != null && playerUrl in departurePlayerUrls


                            val tds = playerRow.select("td")
                            val age = tds.getOrNull(5)?.text()
                            val position = tds.getOrNull(4)?.text()?.replace("-", " ").convertLongPositionNameToShort()

                            if (!alsoInDeparture){
                                players.add(
                                    LatestTransferModel(
                                        playerImage = imageUrl,
                                        playerName = playerName,
                                        playerUrl = playerUrl,
                                        playerAge = age,
                                        playerPosition = position
                                    )
                                )
                            }
                        }

                    } catch (e: Exception) {
                        println("❌ Failed scraping team: $transferUrl")
                        e.printStackTrace()
                        continue
                    }
                }

            Result.Success(players)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.Failed(e.localizedMessage)
        }
    }

}