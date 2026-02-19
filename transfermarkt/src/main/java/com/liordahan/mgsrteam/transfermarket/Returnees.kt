package com.liordahan.mgsrteam.transfermarket

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.jsoup.nodes.Element

private const val TAG = "Returnees"

private val SAISON_ID_REGEX = Regex("/saison_id/\\d+")
private val RETURN_DATE_REGEX = Regex("""date:\s*(\d{1,2}/\d{1,2}/\d{2,4})""", RegexOption.IGNORE_CASE)

class Returnees {

    suspend fun fetchReturnees(leagueUrl: String): TransfermarktResult<List<LatestTransferModel>> =
        withContext(Dispatchers.IO) {
            try {
                val leagueDocument = TransfermarktHttp.fetchDocument(leagueUrl)
                val teamTransferUrls = extractTeamTransferUrls(leagueDocument)
                Log.d(TAG, "League $leagueUrl -> found ${teamTransferUrls.size} team URLs")

                // ── Phase 1: Fetch all team pages and parse raw returnees (fast, no enrichment) ──
                val fetchSemaphore = Semaphore(10)
                val rawReturnees = coroutineScope {
                    teamTransferUrls.map { teamUrl ->
                        async {
                            fetchSemaphore.withPermit {
                                runCatching { scrapeTeamReturneesRaw(teamUrl) }
                                    .onFailure { Log.w(TAG, "Team scrape failed for $teamUrl: ${it.message}") }
                                    .getOrElse { emptyList() }
                            }
                        }
                    }.awaitAll().flatten()
                }

                Log.d(TAG, "League $leagueUrl -> ${rawReturnees.size} raw returnees, starting enrichment")

                // ── Phase 2: Enrich ALL returnees in a single flat pool (no nested semaphores) ──
                val enrichSemaphore = Semaphore(10)
                val enriched = coroutineScope {
                    rawReturnees.map { model ->
                        async {
                            enrichSemaphore.withPermit {
                                if (model.playerUrl != null) enrichFromProfile(model) else model
                            }
                        }
                    }.awaitAll().filterNotNull()
                }

                Log.d(TAG, "League $leagueUrl -> ${enriched.size} returnees after enrichment")
                TransfermarktResult.Success(enriched)
            } catch (e: Exception) {
                Log.e(TAG, "League fetch failed: $leagueUrl -> ${e.message}")
                TransfermarktResult.Failed(e.localizedMessage)
            }
        }

    private fun extractTeamTransferUrls(doc: org.jsoup.nodes.Document): List<String> {
        return doc
            .select("table.items > tbody > tr")
            .mapNotNull { row ->
                val linkElement = row.selectFirst("td:nth-child(2) a[href]") ?: return@mapNotNull null
                val teamRelativeUrl = linkElement.attr("href")

                if (!teamRelativeUrl.contains("/startseite/verein/")) return@mapNotNull null

                val transferPath = teamRelativeUrl
                    .replace("/startseite/", "/transfers/")
                    .replace(SAISON_ID_REGEX, "")

                TRANSFERMARKT_BASE_URL + transferPath
            }
    }

    /**
     * Fetches a team's transfer page and parses returnee rows.
     * Does NOT enrich from profiles -- that happens in Phase 2.
     */
    private suspend fun scrapeTeamReturneesRaw(transferUrl: String): List<LatestTransferModel> {
        val transferDoc = TransfermarktHttp.fetchDocument(transferUrl)

        val allTables = transferDoc.select("table.items")

        val playerRows = allTables
            .getOrNull(0)
            ?.selectFirst("tbody")
            ?.children()
            ?: return emptyList()

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

        return playerRows.mapNotNull { playerRow ->
            parseReturneeRow(playerRow, departurePlayerUrls)
        }
    }

    private suspend fun enrichFromProfile(model: LatestTransferModel): LatestTransferModel? {
        return try {
            val doc = TransfermarktHttp.fetchDocument(model.playerUrl!!)
            val ribbon = doc.select("div.data-header_ribbon, div.data-header__ribbon").firstOrNull()
            val ribbonText = ribbon?.text()?.trim()?.lowercase() ?: ""
            val ribbonTitle = ribbon?.select("a")?.attr("title") ?: ""
            val ribbonTitleLower = ribbonTitle.lowercase()
            val hasReturneeBadge = ribbonText.contains("returnee") ||
                ribbonTitleLower.contains("returned after loan") ||
                ribbonTitleLower.contains("loan spell")
            if (ribbon != null && !hasReturneeBadge) {
                Log.d(TAG, "Filtered ${model.playerName}: ribbon found but not Returnee")
                return null
            }
            val returnDate = RETURN_DATE_REGEX
                .find(ribbonTitle)
                ?.groupValues?.getOrNull(1)
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

        val marketValue = playerRow.select("td.rechts")
            .mapNotNull { it.text().trim().takeIf { t -> t.contains("€") && !t.contains("loan", ignoreCase = true) && !t.contains("End of loan", ignoreCase = true) } }
            .firstOrNull()

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
}
