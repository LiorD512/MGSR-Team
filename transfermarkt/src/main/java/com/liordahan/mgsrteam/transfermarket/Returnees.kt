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

private const val TAG = "OnLoan"
private const val MAX_VALUE = 6_000_000

private val SAISON_ID_REGEX = Regex("/saison_id/\\d+")
private val LOAN_END_DATE_REGEX = Regex("""(?:until|bis)\s+(\d{1,2}[./]\d{1,2}[./]\d{2,4})""", RegexOption.IGNORE_CASE)

class Returnees {

    suspend fun fetchReturnees(leagueUrl: String): TransfermarktResult<List<LatestTransferModel>> =
        withContext(Dispatchers.IO) {
            try {
                val leagueDocument = TransfermarktHttp.fetchDocument(leagueUrl)
                val teamTransferUrls = extractTeamTransferUrls(leagueDocument)
                Log.d(TAG, "League $leagueUrl -> found ${teamTransferUrls.size} team URLs")

                // ── Phase 1: Fetch all team pages and parse on-loan players (fast, no enrichment) ──
                val fetchSemaphore = Semaphore(10)
                val rawPlayers = coroutineScope {
                    teamTransferUrls.map { teamUrl ->
                        async {
                            fetchSemaphore.withPermit {
                                runCatching { scrapeTeamOnLoanRaw(teamUrl) }
                                    .onFailure { Log.w(TAG, "Team scrape failed for $teamUrl: ${it.message}") }
                                    .getOrElse { emptyList() }
                            }
                        }
                    }.awaitAll().flatten()
                }

                Log.d(TAG, "League $leagueUrl -> ${rawPlayers.size} raw on-loan players, starting enrichment")

                // ── Phase 2: Enrich ALL players in a single flat pool (no nested semaphores) ──
                val enrichSemaphore = Semaphore(10)
                val enriched = coroutineScope {
                    rawPlayers.map { model ->
                        async {
                            enrichSemaphore.withPermit {
                                if (model.playerUrl != null) enrichFromProfile(model) else model
                            }
                        }
                    }.awaitAll().filterNotNull()
                }

                val capped = enriched.filter { parseMarketValueToInt(it.marketValue ?: "") <= MAX_VALUE }
                Log.d(TAG, "League $leagueUrl -> ${enriched.size} on-loan players after enrichment, ${capped.size} after ≤3M filter")
                TransfermarktResult.Success(capped)
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
     * Fetches a team's transfer page and parses the DEPARTURES table for players
     * currently loaned out. "loan transfer" or "Loan fee:" = active loan out.
     * "End of loan" = finished loan, skip.
     * Does NOT enrich from profiles -- that happens in Phase 2.
     */
    private suspend fun scrapeTeamOnLoanRaw(transferUrl: String): List<LatestTransferModel> {
        val transferDoc = TransfermarktHttp.fetchDocument(transferUrl)

        val allTables = transferDoc.select("table.items")

        // Departures table is the SECOND table.items
        val departureRows = allTables
            .getOrNull(1)
            ?.selectFirst("tbody")
            ?.children()
            ?: return emptyList()

        // Extract team name/logo from the page header — this is the PARENT club the player is loaned FROM
        val teamName = transferDoc.select(".data-header h1, h1.data-header__headline").firstOrNull()
            ?.text()?.trim()?.takeIf { it.isNotBlank() }
            ?: transferDoc.select("h1").firstOrNull()?.text()?.trim()
        val headerImg = transferDoc.select(".data-header img.data-header__profile-image, .data-header img").firstOrNull()
        val teamLogo = (headerImg?.attr("data-src")?.ifBlank { null } ?: headerImg?.attr("src"))
            ?.takeIf { it.isNotBlank() && !it.contains("flagge") }
            ?.let { makeAbsoluteUrl(it) }

        return departureRows.mapNotNull { playerRow ->
            parseOnLoanRow(playerRow, teamName, teamLogo)
        }
    }

    private suspend fun enrichFromProfile(model: LatestTransferModel): LatestTransferModel? {
        return try {
            val (doc, rawHtml) = TransfermarktHttp.fetchDocumentWithHtml(model.playerUrl!!)

            // Use shared loan detection to confirm on-loan status
            val currentClubName = model.clubJoinedName ?: ""
            val loanInfo = detectLoanStatus(doc, currentClubName)
            if (!loanInfo.isOnLoan) {
                Log.d(TAG, "Filtered ${model.playerName}: profile doesn't confirm on-loan status")
                return null
            }

            // Extract on-loan-from club with full multi-strategy extraction
            val ribbon = doc.select("div.data-header_ribbon, div.data-header__ribbon").firstOrNull()
            val ribbonLinkTitle = ribbon?.select("a")?.firstOrNull()?.attr("title") ?: ""
            val ribbonText = ribbon?.text()?.trim() ?: ""
            val onLoanFromClub = loanInfo.onLoanFromClub
                ?: extractOnLoanFromClub(doc, rawHtml, ribbonLinkTitle, ribbonText, currentClubName)

            // Extract loan end date from ribbon (e.g. "on loan from X until 30/06/2025")
            val loanEndDate = LOAN_END_DATE_REGEX
                .find(ribbonLinkTitle)
                ?.groupValues?.getOrNull(1)
                ?: LOAN_END_DATE_REGEX.find(ribbonText)?.groupValues?.getOrNull(1)

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
            val nationalityElements = doc.select("[itemprop=nationality] img")
            val allNationalities = nationalityElements.mapNotNull {
                it.attr("title").takeIf(String::isNotBlank)
            }
            val allFlags = nationalityElements.mapNotNull {
                it.attr("src").takeIf(String::isNotBlank)
                    ?.replace("tiny", "head")
                    ?.replace("verysmall", "head")
                    ?.let { src -> makeAbsoluteUrl(src) }
            }
            val nationality = model.playerNationality?.takeIf { it.isNotBlank() }
                ?: allNationalities.firstOrNull()
            val flagSrc = model.playerNationalityFlag?.takeIf { it.isNotBlank() }
                ?: allFlags.firstOrNull()
            model.copy(
                clubJoinedName = clubName ?: model.clubJoinedName,
                clubJoinedLogo = clubLogo ?: model.clubJoinedLogo,
                marketValue = marketValue ?: model.marketValue,
                playerNationality = nationality ?: model.playerNationality,
                playerNationalityFlag = flagSrc ?: model.playerNationalityFlag,
                playerNationalities = allNationalities.ifEmpty { model.playerNationalities },
                onLoanFromClub = onLoanFromClub,
                loanEndDate = loanEndDate
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to enrich ${model.playerName}: ${e.message}")
            model
        }
    }

    /**
     * Parses a row from the DEPARTURES table.
     * A player is "currently on loan" if the last TD contains "loan transfer" or "Loan fee:"
     * but NOT "End of loan". The team from the page header is the parent club (onLoanFromClub).
     * clubJoinedName/Logo will be the destination club (where they are loaned TO).
     */
    private fun parseOnLoanRow(
        playerRow: Element,
        parentTeamName: String?,
        parentTeamLogo: String?
    ): LatestTransferModel? {
        val rowText = playerRow.text()
        val lower = rowText.lowercase()
        // Last td contains the transfer type: "loan transfer", "Loan fee:€2.00m", "End of loan30/06/2025", "€9.50m", etc.
        val lastTd = playerRow.select("td").lastOrNull()?.text()?.trim()?.lowercase() ?: ""
        val isLoanOut = (lastTd.contains("loan transfer") || lastTd.contains("loan fee"))
                && !lastTd.contains("end of loan")

        if (!isLoanOut) return null

        val imageUrl = playerRow.selectFirst("img")
            ?.attr("data-src")
            ?.replace("tiny", "big")

        val nameElement = playerRow.selectFirst("td.hauptlink a")
        val playerName = nameElement?.text()
        val playerUrl = nameElement
            ?.attr("href")
            ?.let { "$TRANSFERMARKT_BASE_URL$it" }

        val tds = playerRow.select("td")
        val age = tds.getOrNull(5)?.text()
        val position = tds
            .getOrNull(4)
            ?.text()
            ?.replace("-", " ")
            .convertLongPositionNameToShort()

        // Market value from td.rechts (exclude loan fee cells)
        val marketValue = playerRow.select("td.rechts")
            .mapNotNull { it.text().trim().takeIf { t -> t.contains("€") && !t.contains("loan", ignoreCase = true) } }
            .firstOrNull()

        // Extract destination club (where loaned TO) from the row links
        val destClubLink = playerRow.select("a[href*='/startseite/verein/'], a[href*='/wettbewerb/']")
            .firstOrNull { it.text().trim() != playerName && it.text().trim().isNotBlank() }
        val destClubName = destClubLink?.text()?.trim()
        // Try to get the club logo from the row
        val destClubImg = playerRow.select("td img[class*='tiny'], td img[class*='verein']").firstOrNull()
            ?: playerRow.select("td img").filter { it.attr("src").contains("verein") || it.attr("data-src").contains("verein") }.firstOrNull()
        val destClubLogo = (destClubImg?.attr("data-src")?.ifBlank { null } ?: destClubImg?.attr("src"))
            ?.takeIf { it.isNotBlank() }
            ?.let { makeAbsoluteUrl(it) }

        val nationalityImg = playerRow.select("td.zentriert img[title]").firstOrNull()
            ?: playerRow.select("td img[alt]").firstOrNull { it.attr("alt").length in 2..50 }
        val playerNationality = nationalityImg?.attr("title")?.takeIf { it.isNotBlank() }
            ?: nationalityImg?.attr("alt")?.takeIf { it.isNotBlank() }
        val flagSrc = nationalityImg?.attr("data-src")?.takeIf { it.isNotBlank() }
            ?: nationalityImg?.attr("src")?.takeIf { it.isNotBlank() }
        val playerNationalityFlag = flagSrc?.let { makeAbsoluteUrl(it) }
            ?.replace("verysmall", "head")
            ?.replace("tiny", "head")

        return LatestTransferModel(
            playerImage = imageUrl,
            playerName = playerName,
            playerUrl = playerUrl,
            playerAge = age,
            playerPosition = position,
            playerNationality = playerNationality,
            playerNationalityFlag = playerNationalityFlag,
            marketValue = marketValue,
            clubJoinedName = destClubName,  // where loaned TO (current team)
            clubJoinedLogo = destClubLogo,
            onLoanFromClub = parentTeamName  // parent club (loaned FROM)
        )
    }

    private fun parseMarketValueToInt(s: String): Int {
        if (s.isBlank() || s.contains("-") && !s.contains("€")) return 0
        val cleaned = s.replace("€", "").replace(",", "").trim()
        return when {
            cleaned.contains("m", true) -> ((cleaned.substringBefore("m").trim().toDoubleOrNull() ?: 0.0) * 1_000_000).toInt()
            cleaned.contains("k", true) -> (cleaned.substringBefore("k").trim().toDoubleOrNull() ?: 0.0).toInt() * 1_000
            else -> cleaned.toIntOrNull() ?: 0
        }
    }
}
