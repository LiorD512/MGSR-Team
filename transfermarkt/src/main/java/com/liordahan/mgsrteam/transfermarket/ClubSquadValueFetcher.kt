package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.nodes.Document

/**
 * Fetches a club's squad total/average market value from Transfermarkt.
 * Used for "Free/Free loan" requests: find players with value similar to the club's squad (±200k).
 */
class ClubSquadValueFetcher {

    /**
     * Returns the average market value per player in the squad (in euros), or null if unavailable.
     */
    suspend fun getAverageSquadValue(clubTmProfile: String?): Int? = withContext(Dispatchers.IO) {
        val url = buildKaderUrl(clubTmProfile) ?: return@withContext null
        try {
            val doc = TransfermarktHttp.fetchDocument(url)
            parseAverageValue(doc)
        } catch (e: Exception) {
            null
        }
    }

    private fun buildKaderUrl(clubTmProfile: String?): String? {
        val base = clubTmProfile?.trim()?.substringBefore("?") ?: return null
        if (base.isBlank() || !base.contains("transfermarkt", ignoreCase = true)) return null
        return base
            .replace("/startseite/verein/", "/kader/verein/", ignoreCase = true)
            .replace("/startseite/", "/kader/", ignoreCase = true)
            .let { if (it != base) "$it/saison_id/2025" else null }
    }

    private fun parseAverageValue(doc: Document): Int? {
        // Try "Squad details by position" table: row "Total:" has Market value (total) and ø-Market value (average)
        val rows = doc.select("table.items tr, table.odd tr, table.even tr")
        for (row in rows) {
            val cells = row.select("td")
            if (cells.size >= 2) {
                val firstText = row.select("td").firstOrNull()?.text()?.trim()?.lowercase() ?: ""
                if (firstText == "total:" || firstText == "gesamt:" || firstText.contains("total")) {
                    val values = cells.drop(1).mapNotNull { cell ->
                        val valueStr = cell.text().trim()
                        if (valueStr.contains("€") && (valueStr.contains("m", true) || valueStr.contains("k", true))) {
                            parseMarketValueToInt(valueStr).takeIf { it in 50_000..100_000_000 }
                        } else null
                    }
                    if (values.isNotEmpty()) return sanitizeAsAverage(values.minOrNull()!!, values.maxOrNull()!!)
                }
            }
        }
        // Try data-header or info box for "Total market value" — we get TOTAL, so divide by squad size
        val bodyText = doc.body().text()
        val totalMatch = Regex("""(?:total\s+market\s+value|gesamtmarktwert|markt\s*wert)\s*[:\s]*€?([\d.,]+)\s*([mk])""", RegexOption.IGNORE_CASE)
            .find(bodyText)
        totalMatch?.let { m ->
            val num = m.groupValues.getOrNull(1)?.replace(",", "")?.toDoubleOrNull() ?: return@let null
            val suffix = m.groupValues.getOrNull(2)?.lowercase()
            val total = when (suffix) {
                "m" -> (num * 1_000_000).toInt()
                "k" -> (num * 1_000).toInt()
                else -> num.toInt()
            }
            if (total > 0) {
                val squadSize = doc.select("table.items tr.odd, table.items tr.even").size.coerceIn(1, 35)
                return total / squadSize
            }
        }
        // Do NOT use a generic "first € value" fallback — it often returns total squad value,
        // which would make us search for €5m players (impossible for free agents in lower leagues).
        return null
    }

    /**
     * If we got total instead of average (value > €2m), treat as total and divide by squad size.
     * Average per player is rarely > €2m except for top clubs.
     */
    private fun sanitizeAsAverage(minVal: Int, maxVal: Int): Int {
        val likelyAverage = minVal
        return if (likelyAverage > 2_000_000) {
            (maxVal / 25).coerceIn(50_000, 2_000_000)
        } else {
            likelyAverage
        }
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
