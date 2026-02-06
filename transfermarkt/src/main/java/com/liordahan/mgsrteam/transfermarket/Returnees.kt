package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

class Returnees {

    suspend fun fetchReturnees(leagueUrl: String): TransfermarktResult<List<LatestTransferModel>> =
        withContext(Dispatchers.IO) {
            try {
                val leagueDocument = fetchDocument(leagueUrl)
                val teamTransferUrls = extractTeamTransferUrls(leagueDocument)

                val players = coroutineScope {
                    teamTransferUrls.map { teamUrl ->
                        async {
                            runCatching { scrapeTeamReturnees(teamUrl) }
                                .getOrElse { emptyList() }
                        }
                    }.map { it.await() }.flatten()
                }

                TransfermarktResult.Success(players)
            } catch (e: Exception) {
                TransfermarktResult.Failed(e.localizedMessage)
            }
        }

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(TRANSFERMARKT_USER_AGENT)
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }

    private fun extractTeamTransferUrls(doc: Document): List<String> {
        return doc
            .select("table.items > tbody > tr")
            .mapNotNull { row ->
                val linkElement = row.selectFirst("td:nth-child(2) a[href]") ?: return@mapNotNull null
                val teamRelativeUrl = linkElement.attr("href")

                if (!teamRelativeUrl.contains("/startseite/verein/")) return@mapNotNull null

                TRANSFERMARKT_BASE_URL +
                        teamRelativeUrl.replace("/startseite/", "/transfers/") +
                        "/saison_id"
            }
    }

    private fun scrapeTeamReturnees(transferUrl: String): List<LatestTransferModel> {
        val transferDoc = fetchDocument(transferUrl)

        val playerRows = transferDoc
            .select("table.items")
            .getOrNull(0)
            ?.selectFirst("tbody")
            ?.children()
            ?: return emptyList()

        val departureRows = transferDoc
            .select("table.items")
            .getOrNull(1)
            ?.selectFirst("tbody")
            ?.children()

        val departurePlayerUrls: Set<String> = departureRows
            ?.mapNotNull { row ->
                row.selectFirst("td.hauptlink a")
                    ?.attr("href")
                    ?.let { "$TRANSFERMARKT_BASE_URL$it" }
            }
            ?.toSet()
            ?: emptySet()

        return playerRows.mapNotNull { playerRow ->
            parseReturneeRow(playerRow, departurePlayerUrls)
        }
    }

    private fun parseReturneeRow(
        playerRow: Element,
        departurePlayerUrls: Set<String>
    ): LatestTransferModel? {
        if (!playerRow.text().contains("End of loan", ignoreCase = true)) return null

        val imageUrl = playerRow.selectFirst("img")
            ?.attr("data-src")
            ?.replace("tiny", "big")

        val nameElement = playerRow.selectFirst("td.hauptlink a")
        val playerName = nameElement?.text()
        val playerUrl = nameElement
            ?.attr("href")
            ?.let { "$TRANSFERMARKT_BASE_URL$it" }

        val alsoInDeparture = playerUrl != null && departurePlayerUrls.contains(playerUrl)

        val tds = playerRow.select("td")
        val age = tds.getOrNull(5)?.text()
        val position = tds
            .getOrNull(4)
            ?.text()
            ?.replace("-", " ")
            .convertLongPositionNameToShort()

        return if (!alsoInDeparture) {
            LatestTransferModel(
                playerImage = imageUrl,
                playerName = playerName,
                playerUrl = playerUrl,
                playerAge = age,
                playerPosition = position
            )
        } else {
            null
        }
    }
}

