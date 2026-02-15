package com.liordahan.mgsrteam.transfermarket

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.util.Calendar

/**
 * Fetches players with contracts expiring in the next transfer window (Summer or Winter).
 * Uses Transfermarkt's **endendevertraege** (contracts expiring) page. Fetches all pages,
 * filters client-side for market value 150K–3M and age ≤31.
 *
 * @see https://www.transfermarkt.com/transfers/endendevertraege/statistik
 */
class ContractFinisher {

    private companion object {
        private const val TAG = "ContractFinisher"
        private const val TIMEOUT_MS = 30_000
        private const val MIN_VALUE = 150_000
        private const val MAX_VALUE = 3_000_000
        private const val MAX_AGE = 31
        private const val MAX_PAGES = 80
        private const val DELAY_MS = 800
    }

    enum class TransferWindow { SUMMER, WINTER }

    data class WindowConfig(
        val window: TransferWindow,
        val label: String,
        val yearsToQuery: List<Int>,
    )

    fun getCurrentWindowConfig(): WindowConfig {
        val month = Calendar.getInstance().get(Calendar.MONTH) + 1
        val year = Calendar.getInstance().get(Calendar.YEAR)
        val minYear = 2026
        val safeYear = maxOf(year, minYear)
        return if (month in 2..9) {
            WindowConfig(TransferWindow.SUMMER, "Summer", listOf(safeYear))
        } else {
            WindowConfig(TransferWindow.WINTER, "Winter", listOf(safeYear, safeYear + 1))
        }
    }

    /**
     * Fetches contract finishers from endendevertraege. Paginates through all results,
     * filters for market value 150K–3M and age ≤31.
     */
    suspend fun fetchByDetailsuche(
        config: WindowConfig,
        maxRetries: Int = 2
    ): TransfermarktResult<List<LatestTransferModel>> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "ContractFinisher starting yearsToQuery=${config.yearsToQuery}")
            val all = fetchViaEndendevertraege(config, maxRetries)
            val distinct = all.distinctBy { it.playerUrl }.sortedByDescending { it.getRealMarketValue() }
            Log.d(TAG, "ContractFinisher total: ${distinct.size} players (150K–3M, age≤$MAX_AGE)")
            TransfermarktResult.Success(distinct)
        } catch (ex: Exception) {
            Log.w(TAG, "ContractFinisher failed: ${ex.message}")
            TransfermarktResult.Failed(ex.localizedMessage)
        }
    }

    /**
     * Emits accumulated results after each page – UI can show results while loading continues.
     */
    fun fetchContractFinishersAsFlow(
        config: WindowConfig,
        maxRetries: Int = 2
    ): Flow<ContractFinisherProgress> = flow {
        Log.d(TAG, "ContractFinisher flow starting yearsToQuery=${config.yearsToQuery}")
        val all = mutableListOf<LatestTransferModel>()
        val seenUrls = mutableSetOf<String>()
        var totalPagesFetched = 0

        try {
            for (jahr in config.yearsToQuery) {
                var page = 1
                var consecutiveEmpty = 0

                while (page <= MAX_PAGES) {
                    var attempt = 0
                    var doc: Document? = null

                    while (attempt < maxRetries) {
                        try {
                            val url = "$TRANSFERMARKT_BASE_URL/transfers/endendevertraege/statistik" +
                                "?plus=1&jahr=$jahr&land_id=0&ausrichtung=alle&spielerposition_id=alle" +
                                "&altersklasse=alle&page=$page"
                            doc = Jsoup.connect(url)
                                .userAgent(getRandomUserAgent())
                                .timeout(TIMEOUT_MS)
                                .header("Accept-Language", "en-US,en;q=0.9")
                                .get()
                            break
                        } catch (e: Exception) {
                            Log.w(TAG, "Endendevertraege jahr=$jahr page=$page attempt ${attempt + 1}: ${e.message}")
                            attempt++
                            if (attempt < maxRetries) delay(500L * (attempt + 1))
                        }
                    }

                    var shouldBreak = false
                    if (doc != null) {
                        try {
                            val raw = parseEndendevertraegeResults(doc)
                            val contractExpiryDate = formatContractExpiryDate(config, jahr)
                            val filtered = raw
                                .filter { it.playerUrl != null }
                                .filter { (it.playerAge?.toIntOrNull() ?: 99) <= MAX_AGE }
                                .filter { it.getRealMarketValue() in MIN_VALUE..MAX_VALUE }
                                .map { it.copy(transferDate = contractExpiryDate) }

                            val newOnes = filtered.filter { it.playerUrl !in seenUrls }
                            newOnes.forEach { it.playerUrl?.let { u -> seenUrls.add(u) } }
                            all.addAll(newOnes)

                            if (raw.isEmpty()) {
                                consecutiveEmpty++
                                shouldBreak = true
                            } else {
                                consecutiveEmpty = 0
                                val maxValueOnPage = raw.maxOfOrNull { it.getRealMarketValue() } ?: 0
                                if (maxValueOnPage < MIN_VALUE) shouldBreak = true
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Parse failed page $page: ${e.message}")
                        }
                    }

                    totalPagesFetched++
                    val distinct = all.distinctBy { it.playerUrl }.sortedByDescending { it.getRealMarketValue() }
                    emit(ContractFinisherProgress(players = distinct, pagesLoaded = totalPagesFetched, isLoading = true))

                    if (shouldBreak) break
                    page++
                    delay(DELAY_MS.toLong())
                }
            }

            val distinct = all.distinctBy { it.playerUrl }.sortedByDescending { it.getRealMarketValue() }
            emit(ContractFinisherProgress(players = distinct, pagesLoaded = totalPagesFetched, isLoading = false))
            Log.d(TAG, "ContractFinisher flow done: ${distinct.size} players")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "ContractFinisher flow failed: ${e.message}")
            val distinct = all.distinctBy { it.playerUrl }.sortedByDescending { it.getRealMarketValue() }
            emit(ContractFinisherProgress(players = distinct, pagesLoaded = totalPagesFetched, isLoading = false, error = e.localizedMessage))
        }
    }.flowOn(Dispatchers.IO)

    data class ContractFinisherProgress(
        val players: List<LatestTransferModel>,
        val pagesLoaded: Int,
        val isLoading: Boolean,
        val error: String? = null
    )

    private suspend fun fetchViaEndendevertraege(
        config: WindowConfig,
        maxRetries: Int
    ): List<LatestTransferModel> {
        val all = mutableListOf<LatestTransferModel>()
        val seenUrls = mutableSetOf<String>()

        for (jahr in config.yearsToQuery) {
            var page = 1
            var consecutiveEmpty = 0

            while (page <= MAX_PAGES) {
                var attempt = 0
                var doc: Document? = null

                while (attempt < maxRetries) {
                    try {
                        val url = "$TRANSFERMARKT_BASE_URL/transfers/endendevertraege/statistik" +
                            "?plus=1&jahr=$jahr&land_id=0&ausrichtung=alle&spielerposition_id=alle" +
                            "&altersklasse=alle&page=$page"
                        doc = Jsoup.connect(url)
                            .userAgent(getRandomUserAgent())
                            .timeout(TIMEOUT_MS)
                            .header("Accept-Language", "en-US,en;q=0.9")
                            .get()
                        break
                    } catch (e: Exception) {
                        Log.w(TAG, "Endendevertraege jahr=$jahr page=$page attempt ${attempt + 1}: ${e.message}")
                        attempt++
                        if (attempt < maxRetries) delay(500L * (attempt + 1))
                    }
                }

                if (doc == null) {
                    page++
                    delay(DELAY_MS.toLong())
                    continue
                }

                val raw = parseEndendevertraegeResults(doc)
                val contractExpiryDate = formatContractExpiryDate(config, jahr)
                val filtered = raw
                    .filter { it.playerUrl != null }
                    .filter { (it.playerAge?.toIntOrNull() ?: 99) <= MAX_AGE }
                    .filter { it.getRealMarketValue() in MIN_VALUE..MAX_VALUE }
                    .map { it.copy(transferDate = contractExpiryDate) }

                val newOnes = filtered.filter { it.playerUrl !in seenUrls }
                newOnes.forEach { it.playerUrl?.let { u -> seenUrls.add(u) } }
                all.addAll(newOnes)

                if (raw.isEmpty()) {
                    consecutiveEmpty++
                    if (consecutiveEmpty >= 1) break
                } else {
                    consecutiveEmpty = 0
                }

                if (raw.isNotEmpty()) {
                    val maxValueOnPage = raw.maxOfOrNull { it.getRealMarketValue() } ?: 0
                    if (maxValueOnPage < MIN_VALUE) {
                        Log.d(TAG, "Endendevertraege jahr=$jahr: passed value range at page $page")
                        break
                    }
                }

                page++
                delay(DELAY_MS.toLong())
            }
        }

        return all
    }

    private fun parseEndendevertraegeResults(doc: Document): List<LatestTransferModel> {
        val rows = doc.select("table.items tbody tr.odd, table.items tbody tr.even")
            .ifEmpty { doc.select("table.items tr.odd, table.items tr.even") }
        return rows.mapNotNull { parseEndendevertraegeRow(it) }
    }

    private fun parseEndendevertraegeRow(row: Element): LatestTransferModel? {
        return try {
            val playerLink = row.select("a[href*='/profil/spieler/']").firstOrNull() ?: return null
            val href = playerLink.attr("href")
            val playerUrl = if (href.startsWith("http")) href else "$TRANSFERMARKT_BASE_URL$href"

            val tables = row.select("table.inline-table")
            val playerTable = tables.firstOrNull()
            val playerName = playerLink.attr("title").takeIf { it.isNotBlank() }
                ?: playerTable?.select("img")?.firstOrNull()?.attr("title")?.takeIf { it.isNotBlank() }
                ?: playerLink.text().trim().takeIf { it.isNotBlank() }
            val position = playerTable?.select("tr")?.getOrNull(1)?.text()?.replace("-", " ")?.trim()
                ?.convertLongPositionNameToShort()

            val ageText = row.select("td.zentriert").firstOrNull()?.text()?.let { txt ->
                Regex("""\((\d+)\)""").find(txt)?.groupValues?.getOrNull(1)
                    ?: txt.trim().toIntOrNull()?.toString()
            }
            val marketValue = row.select("td").firstOrNull { it.text().contains("€") }?.text()?.trim()

            val (nationality, flag) = extractNationalityAndFlag(row)

            val clubTable = tables.getOrNull(1)
            val clubName = clubTable?.select("a[href*='/startseite/verein/']")?.attr("title")
                ?.takeIf { it.isNotBlank() }
                ?: clubTable?.select("img")?.attr("title")?.takeIf { it.isNotBlank() }
            val clubLogo = clubTable?.select("img")?.attr("data-src")
                ?.takeIf { it.isNotBlank() }
                ?.let { makeAbsoluteUrl(it) }

            val playerImage = playerTable?.select("img")?.attr("data-src")?.takeIf { it.isNotBlank() }
                ?.replace("medium", "big")?.let { makeAbsoluteUrl(it) }

            LatestTransferModel(
                playerImage = playerImage,
                playerName = playerName,
                playerUrl = playerUrl,
                playerPosition = position,
                playerAge = ageText,
                playerNationality = nationality,
                playerNationalityFlag = flag,
                clubJoinedLogo = clubLogo,
                clubJoinedName = clubName,
                transferDate = null,
                marketValue = marketValue
            )
        } catch (e: Exception) {
            null
        }
    }

    private fun extractNationalityAndFlag(row: Element): Pair<String?, String?> {
        val img = row.select("td.zentriert img[title]").firstOrNull()
            ?: row.select("img[alt]").firstOrNull { it.attr("alt").length in 2..50 }
        val nationality = img?.attr("title")?.takeIf { it.isNotBlank() }
            ?: img?.attr("alt")?.takeIf { it.isNotBlank() }
        val flagSrc = img?.attr("data-src")?.takeIf { it.isNotBlank() }
            ?: img?.attr("src")?.takeIf { it.isNotBlank() }
        val flag = flagSrc?.let { makeAbsoluteUrl(it) }
            ?.replace("verysmall", "head")
            ?.replace("tiny", "head")
        return nationality to flag
    }

    private fun formatContractExpiryDate(config: WindowConfig, jahr: Int): String {
        return when (config.window) {
            TransferWindow.SUMMER -> "30.06.$jahr"
            TransferWindow.WINTER -> {
                val isFirstYear = config.yearsToQuery.firstOrNull() == jahr
                if (isFirstYear) "31.12.$jahr" else "31.01.$jahr"
            }
        }
    }

    private fun makeAbsoluteUrl(url: String): String = when {
        url.startsWith("//") -> "https:$url"
        url.startsWith("/") -> "$TRANSFERMARKT_BASE_URL$url"
        url.startsWith("http") -> url
        else -> url
    }
}
