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

        // Verify Returnee badge on profile + enrich club/market value/nationality; filter out if no longer returnee
        returnees = returnees.mapNotNull { model ->
            if (model.playerUrl != null) {
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

    private fun enrichFromProfile(model: LatestTransferModel): LatestTransferModel? {
        return try {
            val doc = fetchDocument(model.playerUrl!!)
            // Verify player still has Returnee badge when we can find it (div.data-header_ribbon or data-header__ribbon)
            val ribbon = doc.select("div.data-header_ribbon, div.data-header__ribbon").firstOrNull()
            val ribbonText = ribbon?.text()?.trim()?.lowercase() ?: ""
            val ribbonTitle = ribbon?.select("a")?.attr("title") ?: ""
            val ribbonTitleLower = ribbonTitle.lowercase()
            val hasReturneeBadge = ribbonText.contains("returnee") ||
                ribbonTitleLower.contains("returned after loan") ||
                ribbonTitleLower.contains("loan spell")
            // Only filter out if we found a ribbon and it's NOT a returnee badge (page structure may vary)
            if (ribbon != null && !hasReturneeBadge) {
                Log.d(TAG, "Filtered ${model.playerName}: ribbon found but not Returnee")
                return null
            }
            // Extract return date from title: "Returned after loan spell with X; date: 30/06/2025; fee: End of loan"
            val returnDate = Regex("""date:\s*(\d{1,2}/\d{1,2}/\d{2,4})""", RegexOption.IGNORE_CASE)
                .find(ribbonTitle)
                ?.groupValues?.getOrNull(1)
            // Extract club they returned to (current club from data-header)
            val clubSection = doc.select("span.data-header__club").firstOrNull()
                ?: doc.select("div.data-header").firstOrNull()
            val clubLink = clubSection?.select("a[href*='/startseite/verein/']")?.firstOrNull()
            val clubName = clubLink?.attr("title")?.takeIf { it.isNotBlank() }
                ?: clubLink?.text()?.trim()?.takeIf { it.isNotBlank() }
            val clubImg = clubSection?.select("img")?.firstOrNull()
            val clubLogo = (clubImg?.attr("data-src")?.ifBlank { null } ?: clubImg?.attr("src"))
                ?.takeIf { it.isNotBlank() }
                ?.let { makeAbsoluteUrl(it) }
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
                clubJoinedName = clubName ?: model.clubJoinedName,
                clubJoinedLogo = clubLogo ?: model.clubJoinedLogo,
                transferDate = returnDate ?: model.transferDate,
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

