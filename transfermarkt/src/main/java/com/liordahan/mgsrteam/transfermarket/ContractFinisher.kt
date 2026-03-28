package com.liordahan.mgsrteam.transfermarket

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
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
        private const val MIN_VALUE = 150_000
        private const val MAX_VALUE = 3_000_000
        private const val MAX_AGE = 31
        private const val MAX_PAGES = 400
        private const val BATCH_SIZE = 3
        private const val DELAY_BETWEEN_BATCHES_MS = 150L
    }

    enum class TransferWindow { SUMMER, WINTER }

    data class WindowConfig(
        val window: TransferWindow,
        val label: String,
        val yearsToQuery: List<Int>,
    )

    fun getCurrentWindowConfig(): WindowConfig {
        val cal = Calendar.getInstance()
        val month = cal.get(Calendar.MONTH) + 1
        val year = cal.get(Calendar.YEAR)
        val minYear = 2026
        val safeYear = maxOf(year, minYear)
        return if (month in 2..9) {
            WindowConfig(TransferWindow.SUMMER, "Summer", listOf(safeYear))
        } else {
            WindowConfig(TransferWindow.WINTER, "Winter", listOf(safeYear, safeYear + 1))
        }
    }

    /**
     * Emits accumulated results after each batch – UI can show results while loading continues.
     * Pages are fetched in parallel batches of [BATCH_SIZE] for significantly faster throughput.
     */
    fun fetchContractFinishersAsFlow(
        config: WindowConfig,
        maxRetries: Int = 3
    ): Flow<ContractFinisherProgress> = flow {
        Log.d(TAG, "ContractFinisher flow starting yearsToQuery=${config.yearsToQuery}")
        val all = mutableListOf<LatestTransferModel>()
        val seenUrls = mutableSetOf<String>()
        var totalPagesFetched = 0
        var first10Logged = false

        try {
            for (jahr in config.yearsToQuery) {
                var page = 1
                var consecutiveEmptyPages = 0

                while (page <= MAX_PAGES) {
                    val batchEnd = minOf(page + BATCH_SIZE - 1, MAX_PAGES)
                    val batchPages = (page..batchEnd).toList()

                    val docs: List<Document?> = coroutineScope {
                        batchPages.map { p ->
                            async { fetchPageWithRetry(jahr, p, maxRetries) }
                        }.awaitAll()
                    }

                    var batchShouldBreak = false
                    for (doc in docs) {
                        if (doc == null) {
                            consecutiveEmptyPages++
                            if (consecutiveEmptyPages >= 2) {
                                Log.d(TAG, "$consecutiveEmptyPages consecutive null pages – stopping")
                                batchShouldBreak = true
                                break
                            }
                            continue
                        }
                        try {
                            val raw = parseEndendevertraegeResults(doc)
                            val contractExpiryDate = formatContractExpiryDate(config, jahr)
                            val filtered = raw
                                .filter { it.playerUrl != null }
                                .filter { (it.playerAge?.toIntOrNull() ?: 99) <= MAX_AGE }
                                .filter { it.getRealMarketValue() in MIN_VALUE..MAX_VALUE }
                                .map { it.copy(transferDate = contractExpiryDate) }

                            val newOnes = filtered.filter { it.playerUrl !in seenUrls }
                            seenUrls.addAll(newOnes.mapNotNull { it.playerUrl })
                            all.addAll(newOnes)

                            if (raw.isEmpty()) {
                                consecutiveEmptyPages++
                                if (consecutiveEmptyPages >= 2) {
                                    Log.d(TAG, "$consecutiveEmptyPages consecutive empty pages – stopping")
                                    batchShouldBreak = true
                                    break
                                }
                            } else {
                                consecutiveEmptyPages = 0
                            }
                            val maxValueOnPage = raw.maxOfOrNull { it.getRealMarketValue() } ?: 0
                            if (maxValueOnPage < MIN_VALUE) {
                                batchShouldBreak = true
                                break
                            }
                            totalPagesFetched++
                        } catch (e: Exception) {
                            Log.w(TAG, "Parse failed: ${e.message}")
                        }
                    }

                    val sorted = all.sortedByDescending { it.getRealMarketValue() }
                    emit(ContractFinisherProgress(players = sorted, pagesLoaded = totalPagesFetched, isLoading = true))

                    // Log first 10 players as they arrive (order received, not final sorted) - once only
                    if (!first10Logged && all.size >= 10) {
                        first10Logged = true
                        all.take(10).forEachIndexed { i, p ->
                            Log.d(TAG, "First10 #${i + 1}: name=${p.playerName} age=${p.playerAge} nationality=${p.playerNationality} position=${p.playerPosition} value=${p.marketValue}")
                        }
                    }

                    if (batchShouldBreak) break
                    page += batchPages.size
                    delay(DELAY_BETWEEN_BATCHES_MS)
                }
            }

            val sorted = all.sortedByDescending { it.getRealMarketValue() }
            Log.d(TAG, "ContractFinisher flow done: ${sorted.size} players, $totalPagesFetched pages fetched")
            emit(ContractFinisherProgress(players = sorted, pagesLoaded = totalPagesFetched, isLoading = false))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "ContractFinisher flow failed: ${e.message}")
            val sorted = all.sortedByDescending { it.getRealMarketValue() }
            emit(ContractFinisherProgress(players = sorted, pagesLoaded = totalPagesFetched, isLoading = false, error = e.localizedMessage))
        }
    }.flowOn(Dispatchers.IO)

    private suspend fun fetchPageWithRetry(jahr: Int, page: Int, maxRetries: Int): Document? {
        var attempt = 0
        while (attempt < maxRetries) {
            try {
                return TransfermarktHttp.fetchDocument(buildEndendevertraegeUrl(jahr, page))
            } catch (e: Exception) {
                Log.w(TAG, "Endendevertraege jahr=$jahr page=$page attempt ${attempt + 1}: ${e.message}")
                attempt++
                if (attempt < maxRetries) delay(400L * attempt)
            }
        }
        return null
    }

    data class ContractFinisherProgress(
        val players: List<LatestTransferModel>,
        val pagesLoaded: Int,
        val isLoading: Boolean,
        val error: String? = null
    )

    private fun buildEndendevertraegeUrl(jahr: Int, page: Int): String =
        "$TRANSFERMARKT_BASE_URL/transfers/endendevertraege/statistik" +
            "?plus=1&jahr=$jahr&land_id=0&ausrichtung=alle&spielerposition_id=alle" +
            "&altersklasse=alle&page=$page"

    private fun parseEndendevertraegeResults(doc: Document): List<LatestTransferModel> {
        val rows = doc.select("table.items tbody tr.odd, table.items tbody tr.even")
            .ifEmpty { doc.select("table.items tr.odd, table.items tr.even") }
        return rows.mapNotNull { parseEndendevertraegeRow(it) }
    }

    private val AGE_REGEX = Regex("""\((\d+)\)""")

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
                AGE_REGEX.find(txt)?.groupValues?.getOrNull(1)
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

    private fun formatContractExpiryDate(config: WindowConfig, jahr: Int): String {
        return when (config.window) {
            TransferWindow.SUMMER -> "30.06.$jahr"
            TransferWindow.WINTER -> {
                val isFirstYear = config.yearsToQuery.firstOrNull() == jahr
                if (isFirstYear) "31.12.$jahr" else "31.01.$jahr"
            }
        }
    }
}
