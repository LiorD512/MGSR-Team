package com.liordahan.mgsrteam.transfermarket

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

private const val TAG = "Returnees"

class Returnees {

    suspend fun fetchReturnees(leagueUrl: String): TransfermarktResult<List<LatestTransferModel>> =
        withContext(Dispatchers.IO) {
            try {
                val leagueDocument = fetchDocument(leagueUrl)
                val teamTransferUrls = extractTeamTransferUrls(leagueDocument)
                Log.d(TAG, "League $leagueUrl -> found ${teamTransferUrls.size} team URLs")

                val players = coroutineScope {
                    teamTransferUrls.map { teamUrl ->
                        async {
                            runCatching { scrapeTeamReturnees(teamUrl) }
                                .onFailure { Log.w(TAG, "Team scrape failed for $teamUrl: ${it.message}") }
                                .getOrElse { emptyList() }
                        }
                    }.map { it.await() }.flatten()
                }

                Log.d(TAG, "League $leagueUrl -> total ${players.size} returnee players")
                TransfermarktResult.Success(players)
            } catch (e: Exception) {
                Log.e(TAG, "League fetch failed: $leagueUrl -> ${e.message}")
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

                // Build the transfer page URL:
                // 1. Replace /startseite/ with /transfers/
                // 2. Strip any existing /saison_id/XXXX suffix to avoid duplication
                val transferPath = teamRelativeUrl
                    .replace("/startseite/", "/transfers/")
                    .replace(Regex("/saison_id/\\d+"), "")

                TRANSFERMARKT_BASE_URL + transferPath
            }
    }

    private fun scrapeTeamReturnees(transferUrl: String): List<LatestTransferModel> {
        val transferDoc = fetchDocument(transferUrl)

        val allTables = transferDoc.select("table.items")
        Log.d(TAG, "Team $transferUrl -> found ${allTables.size} table.items")

        val playerRows = allTables
            .getOrNull(0)
            ?.selectFirst("tbody")
            ?.children()

        if (playerRows == null) {
            Log.d(TAG, "Team $transferUrl -> no arrival rows found")
            return emptyList()
        }

        Log.d(TAG, "Team $transferUrl -> ${playerRows.size} arrival rows")

        val departureRows = allTables
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

        var returnees = playerRows.mapNotNull { playerRow ->
            parseReturneeRow(playerRow, departurePlayerUrls)
        }

        // Enrich missing market value / nationality from player profile when we have URL
        returnees = returnees.map { model ->
            if (model.playerUrl != null &&
                (model.marketValue.isNullOrBlank() || model.playerNationality.isNullOrBlank())
            ) {
                enrichFromProfile(model)
            } else {
                model
            }
        }

        if (returnees.isNotEmpty()) {
            Log.d(TAG, "Team $transferUrl -> ${returnees.size} returnees after filtering")
        }

        return returnees
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
            Log.w(TAG, "Failed to enrich ${model.playerName}: ${e.message}")
            model
        }
    }

    private fun parseReturneeRow(
        playerRow: Element,
        departurePlayerUrls: Set<String>
    ): LatestTransferModel? {
        val rowText = playerRow.text()
        // Match both "End of loan" and "end of loan" / "Loan return" variants
        val isLoanReturn = rowText.contains("End of loan", ignoreCase = true)
                || rowText.contains("Loan return", ignoreCase = true)
                || rowText.contains("end of loan", ignoreCase = true)

        if (!isLoanReturn) return null

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

        // Market value: from td.rechts that contains € (market value pattern)
        val marketValue = playerRow.select("td.rechts")
            .mapNotNull { it.text().trim().takeIf { t -> t.contains("€") && !t.contains("loan", ignoreCase = true) && !t.contains("End of loan", ignoreCase = true) } }
            .firstOrNull()

        // Nationality and flag: from td.zentriert img (flag images have alt/title with country name)
        val nationalityImg = playerRow.select("td.zentriert img[title]").firstOrNull()
            ?: playerRow.select("td img[alt]").firstOrNull { it.attr("alt").length in 2..50 }
        val playerNationality = nationalityImg?.attr("title")?.takeIf { it.isNotBlank() }
            ?: nationalityImg?.attr("alt")?.takeIf { it.isNotBlank() }
        val flagSrc = nationalityImg?.attr("data-src")?.takeIf { it.isNotBlank() }
            ?: nationalityImg?.attr("src")?.takeIf { it.isNotBlank() }
        val playerNationalityFlag = flagSrc?.let { makeAbsoluteUrl(it) }
            ?.replace("verysmall", "head")
            ?.replace("tiny", "head")

        return if (!alsoInDeparture) {
            LatestTransferModel(
                playerImage = imageUrl,
                playerName = playerName,
                playerUrl = playerUrl,
                playerAge = age,
                playerPosition = position,
                playerNationality = playerNationality,
                playerNationalityFlag = playerNationalityFlag,
                marketValue = marketValue
            )
        } else {
            null
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

