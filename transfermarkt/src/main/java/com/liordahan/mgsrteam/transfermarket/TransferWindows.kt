package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.time.LocalDate

/**
 * Fetches and parses open transfer windows worldwide from Transfermarkt.
 * Source: https://www.transfermarkt.com/statistik/transferfenster?status=open
 *
 * Note: Transfermarkt loads the transfer window table via JavaScript (tm-transfer-window component),
 * so Jsoup cannot parse it. We use a static fallback list of known winter 2025 transfer windows
 * with closing dates, and compute days left from today.
 */
data class TransferWindow(
    val countryName: String,
    val flagUrl: String?,
    val daysLeft: Int? // null if unknown
)

/** Country code for flag URL. Uses flagcdn.com (free, no API key). */
private fun flagUrlForCountry(code: String): String =
    "https://flagcdn.com/w40/$code.png"

/**
 * Transfer window closing dates. Month-day is typical; year is computed at runtime.
 * Source: https://www.transfermarkt.com/statistik/transferfenster?status=open
 * Format: country name, ISO 3166-1 alpha-2 code for flag, month (1-12), day of month
 */
private val WINTER_CLOSING_MD: List<Triple<String, String, Pair<Int, Int>>> = listOf(
    // UEFA – major leagues
    Triple("England", "gb-eng", 2 to 3),
    Triple("Germany", "de", 2 to 3),
    Triple("Spain", "es", 2 to 3),
    Triple("Italy", "it", 2 to 3),
    Triple("France", "fr", 2 to 3),
    Triple("Netherlands", "nl", 2 to 3),
    Triple("Portugal", "pt", 2 to 3),
    Triple("Belgium", "be", 2 to 3),
    Triple("Turkey", "tr", 2 to 7),
    Triple("Russia", "ru", 2 to 21),
    Triple("Israel", "il", 2 to 3),
    Triple("Scotland", "gb-sct", 2 to 3),
    Triple("Greece", "gr", 2 to 3),
    Triple("Austria", "at", 2 to 3),
    Triple("Switzerland", "ch", 2 to 3),
    Triple("Poland", "pl", 2 to 28),
    Triple("Ukraine", "ua", 2 to 28),
    Triple("Czech Republic", "cz", 2 to 28),
    Triple("Denmark", "dk", 2 to 3),
    Triple("Sweden", "se", 3 to 31),
    Triple("Norway", "no", 3 to 31),
    // UEFA – more countries
    Triple("Romania", "ro", 2 to 28),
    Triple("Bulgaria", "bg", 2 to 24),
    Triple("Croatia", "hr", 2 to 17),
    Triple("Serbia", "rs", 2 to 28),
    Triple("Hungary", "hu", 2 to 28),
    Triple("Slovakia", "sk", 2 to 28),
    Triple("Slovenia", "si", 2 to 28),
    Triple("Cyprus", "cy", 2 to 28),
    Triple("Finland", "fi", 4 to 4),
    Triple("Iceland", "is", 4 to 4),
    Triple("Bosnia-Herzegovina", "ba", 2 to 28),
    Triple("North Macedonia", "mk", 2 to 28),
    Triple("Albania", "al", 2 to 28),
    Triple("Montenegro", "me", 2 to 28),
    Triple("Luxembourg", "lu", 2 to 3),
    Triple("Malta", "mt", 2 to 3),
    Triple("Ireland", "ie", 2 to 28),
    Triple("Wales", "gb-wls", 2 to 3),
    Triple("Northern Ireland", "gb-nir", 2 to 3),
    Triple("Belarus", "by", 3 to 15),
    Triple("Georgia", "ge", 2 to 28),
    Triple("Armenia", "am", 2 to 28),
    Triple("Azerbaijan", "az", 2 to 28),
    Triple("Kazakhstan", "kz", 3 to 15),
    Triple("Moldova", "md", 2 to 28),
    Triple("Lithuania", "lt", 3 to 12),
    Triple("Estonia", "ee", 2 to 28),
    Triple("Latvia", "lv", 2 to 28),
    Triple("Kosovo", "xk", 2 to 28),
    Triple("Andorra", "ad", 2 to 28),
    Triple("Faroe Islands", "fo", 2 to 28),
    Triple("Liechtenstein", "li", 2 to 3),
    Triple("San Marino", "sm", 2 to 28),
    Triple("Gibraltar", "gi", 2 to 3),
    // AFC
    Triple("Saudi Arabia", "sa", 2 to 18),
    Triple("United Arab Emirates", "ae", 2 to 18),
    Triple("Qatar", "qa", 1 to 31),
    Triple("China", "cn", 2 to 28),
    Triple("Japan", "jp", 3 to 14),
    Triple("South Korea", "kr", 3 to 14),
    Triple("Iran", "ir", 2 to 28),
    Triple("India", "in", 1 to 31),
    Triple("Australia", "au", 2 to 14),
    Triple("Thailand", "th", 2 to 28),
    Triple("Malaysia", "my", 1 to 4),
    Triple("Vietnam", "vn", 2 to 28),
    Triple("Indonesia", "id", 2 to 28),
    Triple("Uzbekistan", "uz", 2 to 28),
    Triple("Iraq", "iq", 2 to 28),
    Triple("Kuwait", "kw", 2 to 28),
    Triple("Oman", "om", 2 to 28),
    Triple("Bahrain", "bh", 2 to 28),
    Triple("Jordan", "jo", 2 to 28),
    Triple("Syria", "sy", 2 to 28),
    Triple("Lebanon", "lb", 2 to 28),
    Triple("Philippines", "ph", 2 to 28),
    Triple("Singapore", "sg", 2 to 28),
    Triple("Hong Kong", "hk", 2 to 28),
    Triple("Chinese Taipei", "tw", 1 to 18),
    Triple("Bangladesh", "bd", 2 to 28),
    Triple("Nepal", "np", 2 to 28),
    Triple("Sri Lanka", "lk", 2 to 28),
    Triple("Palestine", "ps", 2 to 28),
    Triple("Yemen", "ye", 2 to 28),
    Triple("Tajikistan", "tj", 2 to 28),
    Triple("Turkmenistan", "tm", 2 to 28),
    Triple("Kyrgyzstan", "kg", 2 to 28),
    Triple("Myanmar", "mm", 2 to 28),
    Triple("Maldives", "mv", 2 to 28),
    Triple("Afghanistan", "af", 2 to 28),
    // CONMEBOL
    Triple("Brazil", "br", 4 to 7),
    Triple("Argentina", "ar", 2 to 19),
    Triple("Colombia", "co", 2 to 28),
    Triple("Chile", "cl", 2 to 28),
    Triple("Peru", "pe", 2 to 28),
    Triple("Ecuador", "ec", 2 to 28),
    Triple("Uruguay", "uy", 2 to 28),
    Triple("Paraguay", "py", 2 to 28),
    Triple("Bolivia", "bo", 2 to 28),
    Triple("Venezuela", "ve", 2 to 28),
    // CONCACAF
    Triple("Mexico", "mx", 2 to 7),
    Triple("United States", "us", 3 to 26),
    Triple("Canada", "ca", 3 to 26),
    Triple("Costa Rica", "cr", 2 to 28),
    Triple("Honduras", "hn", 2 to 28),
    Triple("Panama", "pa", 2 to 28),
    Triple("Jamaica", "jm", 2 to 28),
    Triple("Trinidad and Tobago", "tt", 2 to 28),
    Triple("Guatemala", "gt", 2 to 28),
    Triple("El Salvador", "sv", 2 to 28),
    Triple("Nicaragua", "ni", 2 to 28),
    Triple("Cuba", "cu", 2 to 28),
    Triple("Dominican Republic", "do", 2 to 28),
    Triple("Haiti", "ht", 2 to 28),
    Triple("Curaçao", "cw", 2 to 28),
    Triple("Suriname", "sr", 2 to 28),
    // CAF
    Triple("Egypt", "eg", 2 to 28),
    Triple("Morocco", "ma", 2 to 28),
    Triple("Tunisia", "tn", 2 to 28),
    Triple("South Africa", "za", 2 to 28),
    Triple("Nigeria", "ng", 2 to 28),
    Triple("Algeria", "dz", 2 to 28),
    Triple("Ghana", "gh", 2 to 28),
    Triple("Senegal", "sn", 2 to 28),
    Triple("Ivory Coast", "ci", 2 to 28),
    Triple("Cameroon", "cm", 2 to 28),
    Triple("Kenya", "ke", 2 to 28),
    Triple("Zimbabwe", "zw", 2 to 28),
    Triple("Zambia", "zm", 2 to 28),
    Triple("Angola", "ao", 2 to 28),
    Triple("DR Congo", "cd", 2 to 28),
    Triple("Mali", "ml", 2 to 28),
    Triple("Tanzania", "tz", 2 to 28),
    Triple("Ethiopia", "et", 2 to 28),
    Triple("Libya", "ly", 2 to 28),
    Triple("Sudan", "sd", 2 to 28),
    Triple("Uganda", "ug", 1 to 31),
    Triple("Togo", "tg", 2 to 28),
    Triple("Benin", "bj", 2 to 28),
    Triple("Burkina Faso", "bf", 2 to 28),
    Triple("Niger", "ne", 2 to 28),
    Triple("Guinea", "gn", 2 to 28),
    Triple("Madagascar", "mg", 2 to 28),
    Triple("Mauritius", "mu", 2 to 28),
    Triple("Botswana", "bw", 2 to 28),
    Triple("Namibia", "na", 2 to 28),
    Triple("Mozambique", "mz", 2 to 28),
    Triple("Rwanda", "rw", 2 to 28),
    // OFC
    Triple("New Zealand", "nz", 3 to 31),
    Triple("Fiji", "fj", 2 to 28),
    Triple("Papua New Guinea", "pg", 2 to 28),
    Triple("Solomon Islands", "sb", 2 to 28),
)

/** Summer transfer window closing (Jun–Sep). */
private val SUMMER_CLOSING_MD: List<Triple<String, String, Pair<Int, Int>>> = listOf(
    // UEFA
    Triple("England", "gb-eng", 9 to 1),
    Triple("Germany", "de", 9 to 1),
    Triple("Spain", "es", 9 to 1),
    Triple("Italy", "it", 8 to 31),
    Triple("France", "fr", 9 to 1),
    Triple("Netherlands", "nl", 9 to 1),
    Triple("Portugal", "pt", 9 to 22),
    Triple("Belgium", "be", 9 to 1),
    Triple("Turkey", "tr", 9 to 8),
    Triple("Russia", "ru", 9 to 1),
    Triple("Israel", "il", 9 to 1),
    Triple("Scotland", "gb-sct", 9 to 1),
    Triple("Greece", "gr", 9 to 1),
    Triple("Austria", "at", 9 to 1),
    Triple("Switzerland", "ch", 9 to 1),
    Triple("Poland", "pl", 9 to 1),
    Triple("Ukraine", "ua", 9 to 1),
    Triple("Czech Republic", "cz", 9 to 1),
    Triple("Denmark", "dk", 9 to 1),
    Triple("Sweden", "se", 8 to 31),
    Triple("Norway", "no", 8 to 31),
    Triple("Romania", "ro", 9 to 8),
    Triple("Bulgaria", "bg", 9 to 1),
    Triple("Croatia", "hr", 9 to 1),
    Triple("Serbia", "rs", 9 to 1),
    Triple("Hungary", "hu", 9 to 1),
    Triple("Slovakia", "sk", 9 to 1),
    Triple("Slovenia", "si", 9 to 1),
    Triple("Cyprus", "cy", 9 to 1),
    Triple("Finland", "fi", 8 to 31),
    Triple("Iceland", "is", 8 to 31),
    Triple("Bosnia-Herzegovina", "ba", 9 to 1),
    Triple("North Macedonia", "mk", 9 to 1),
    Triple("Albania", "al", 9 to 1),
    Triple("Montenegro", "me", 9 to 1),
    Triple("Luxembourg", "lu", 9 to 1),
    Triple("Malta", "mt", 9 to 1),
    Triple("Ireland", "ie", 9 to 1),
    Triple("Wales", "gb-wls", 9 to 1),
    Triple("Northern Ireland", "gb-nir", 9 to 1),
    Triple("Belarus", "by", 8 to 31),
    Triple("Georgia", "ge", 9 to 1),
    Triple("Armenia", "am", 9 to 1),
    Triple("Azerbaijan", "az", 9 to 1),
    Triple("Kazakhstan", "kz", 8 to 31),
    Triple("Moldova", "md", 9 to 1),
    Triple("Lithuania", "lt", 7 to 19),
    Triple("Estonia", "ee", 8 to 31),
    Triple("Latvia", "lv", 8 to 31),
    Triple("Kosovo", "xk", 8 to 31),
    Triple("Andorra", "ad", 8 to 31),
    Triple("Faroe Islands", "fo", 8 to 31),
    Triple("Liechtenstein", "li", 8 to 31),
    Triple("San Marino", "sm", 8 to 31),
    Triple("Gibraltar", "gi", 8 to 31),
    // AFC
    Triple("Saudi Arabia", "sa", 9 to 15),
    Triple("United Arab Emirates", "ae", 9 to 15),
    Triple("Qatar", "qa", 9 to 15),
    Triple("China", "cn", 7 to 31),
    Triple("Japan", "jp", 8 to 28),
    Triple("South Korea", "kr", 8 to 28),
    Triple("Iran", "ir", 8 to 31),
    Triple("India", "in", 9 to 1),
    Triple("Australia", "au", 10 to 15),
    Triple("Thailand", "th", 8 to 15),
    Triple("Malaysia", "my", 7 to 23),
    Triple("Vietnam", "vn", 8 to 31),
    Triple("Indonesia", "id", 8 to 31),
    Triple("Uzbekistan", "uz", 8 to 31),
    Triple("Iraq", "iq", 8 to 31),
    Triple("Kuwait", "kw", 9 to 8),
    Triple("Oman", "om", 9 to 8),
    Triple("Bahrain", "bh", 9 to 8),
    Triple("Jordan", "jo", 9 to 1),
    Triple("Syria", "sy", 9 to 1),
    Triple("Lebanon", "lb", 9 to 1),
    Triple("Philippines", "ph", 8 to 31),
    Triple("Singapore", "sg", 8 to 31),
    Triple("Hong Kong", "hk", 8 to 31),
    Triple("Chinese Taipei", "tw", 8 to 31),
    Triple("Bangladesh", "bd", 8 to 31),
    Triple("Nepal", "np", 8 to 31),
    Triple("Sri Lanka", "lk", 8 to 31),
    Triple("Palestine", "ps", 8 to 31),
    Triple("Yemen", "ye", 8 to 31),
    Triple("Tajikistan", "tj", 8 to 31),
    Triple("Turkmenistan", "tm", 8 to 31),
    Triple("Kyrgyzstan", "kg", 8 to 31),
    Triple("Myanmar", "mm", 8 to 31),
    Triple("Maldives", "mv", 8 to 31),
    Triple("Afghanistan", "af", 8 to 31),
    // CONMEBOL
    Triple("Brazil", "br", 8 to 4),
    Triple("Argentina", "ar", 8 to 31),
    Triple("Colombia", "co", 8 to 31),
    Triple("Chile", "cl", 8 to 31),
    Triple("Peru", "pe", 8 to 31),
    Triple("Ecuador", "ec", 8 to 31),
    Triple("Uruguay", "uy", 8 to 31),
    Triple("Paraguay", "py", 8 to 31),
    Triple("Bolivia", "bo", 8 to 31),
    Triple("Venezuela", "ve", 8 to 31),
    // CONCACAF
    Triple("Mexico", "mx", 9 to 8),
    Triple("United States", "us", 9 to 2),
    Triple("Canada", "ca", 9 to 2),
    Triple("Costa Rica", "cr", 8 to 31),
    Triple("Honduras", "hn", 8 to 31),
    Triple("Panama", "pa", 8 to 31),
    Triple("Jamaica", "jm", 8 to 31),
    Triple("Trinidad and Tobago", "tt", 8 to 31),
    Triple("Guatemala", "gt", 8 to 31),
    Triple("El Salvador", "sv", 8 to 31),
    Triple("Nicaragua", "ni", 8 to 31),
    Triple("Cuba", "cu", 8 to 31),
    Triple("Dominican Republic", "do", 8 to 31),
    Triple("Haiti", "ht", 8 to 31),
    Triple("Curaçao", "cw", 8 to 31),
    Triple("Suriname", "sr", 8 to 31),
    // CAF
    Triple("Egypt", "eg", 9 to 15),
    Triple("Morocco", "ma", 9 to 15),
    Triple("Tunisia", "tn", 9 to 1),
    Triple("South Africa", "za", 9 to 1),
    Triple("Nigeria", "ng", 9 to 1),
    Triple("Algeria", "dz", 9 to 1),
    Triple("Ghana", "gh", 9 to 1),
    Triple("Senegal", "sn", 9 to 1),
    Triple("Ivory Coast", "ci", 9 to 1),
    Triple("Cameroon", "cm", 9 to 1),
    Triple("Kenya", "ke", 8 to 31),
    Triple("Zimbabwe", "zw", 8 to 31),
    Triple("Zambia", "zm", 8 to 31),
    Triple("Angola", "ao", 8 to 31),
    Triple("DR Congo", "cd", 8 to 31),
    Triple("Mali", "ml", 8 to 31),
    Triple("Tanzania", "tz", 8 to 31),
    Triple("Ethiopia", "et", 8 to 31),
    Triple("Libya", "ly", 8 to 31),
    Triple("Sudan", "sd", 8 to 31),
    Triple("Uganda", "ug", 6 to 30),
    Triple("Togo", "tg", 8 to 31),
    Triple("Benin", "bj", 8 to 31),
    Triple("Burkina Faso", "bf", 8 to 31),
    Triple("Niger", "ne", 8 to 31),
    Triple("Guinea", "gn", 8 to 31),
    Triple("Madagascar", "mg", 8 to 31),
    Triple("Mauritius", "mu", 8 to 31),
    Triple("Botswana", "bw", 8 to 31),
    Triple("Namibia", "na", 8 to 31),
    Triple("Mozambique", "mz", 8 to 31),
    Triple("Rwanda", "rw", 8 to 31),
    // OFC
    Triple("New Zealand", "nz", 8 to 31),
    Triple("Fiji", "fj", 8 to 31),
    Triple("Papua New Guinea", "pg", 8 to 31),
    Triple("Solomon Islands", "sb", 8 to 31),
)


class TransferWindows {

    companion object {
        private const val TRANSFER_WINDOW_URL = "$TRANSFERMARKT_BASE_URL/statistik/transferfenster?status=open"
    }

    suspend fun fetchOpenTransferWindows(): TransfermarktResult<List<TransferWindow>> =
        withContext(Dispatchers.IO) {
            val scraped = try {
                val doc = fetchDocument(TRANSFER_WINDOW_URL)
                parseTransferWindowTable(doc)
            } catch (_: Exception) {
                emptyList()
            }

            val result = if (scraped.isNotEmpty()) {
                scraped
            } else {
                // Fallback: use static list and compute days left from closing dates
                buildStaticOpenWindows()
            }

            TransfermarktResult.Success(result)
        }

    private fun buildStaticOpenWindows(): List<TransferWindow> {
        val today = LocalDate.now()
        val year = today.year
        val month = today.monthValue

        // Winter window: Jan–Apr (use current year)
        // Summer window: Jun–Sep (use current year)
        // May: use summer (some leagues open early)
        // Oct–Dec: use winter *next* year (closing Feb/Mar)
        val list = when (month) {
            in 1..4 -> WINTER_CLOSING_MD.map { (name, code, md) ->
                Triple(name, code, LocalDate.of(year, md.first, md.second))
            }
            in 5..9 -> SUMMER_CLOSING_MD.map { (name, code, md) ->
                Triple(name, code, LocalDate.of(year, md.first, md.second))
            }
            else -> WINTER_CLOSING_MD.map { (name, code, md) ->
                Triple(name, code, LocalDate.of(year + 1, md.first, md.second))
            }
        }

        return list
            .map { (name, code, closing) ->
                val daysLeft = java.time.temporal.ChronoUnit.DAYS.between(today, closing).toInt()
                if (daysLeft < 0) return@map null
                TransferWindow(
                    countryName = name,
                    flagUrl = flagUrlForCountry(code),
                    daysLeft = daysLeft
                )
            }
            .filterNotNull()
            .sortedBy { it.daysLeft }
    }

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(getRandomUserAgent())
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }

    private fun parseTransferWindowTable(doc: Document): List<TransferWindow> {
        val rows = doc.select("table.items tbody tr.odd, table.items tbody tr.even")
        if (rows.isEmpty()) {
            val altRows = doc.select("table.items tr")
            return altRows.mapNotNull { parseRow(it) }.filter { it.countryName.isNotBlank() }
        }
        return rows.mapNotNull { parseRow(it) }.filter { it.countryName.isNotBlank() }
    }

    private fun parseRow(row: Element): TransferWindow? {
        return try {
            val cells = row.select("td")
            if (cells.size < 3) return null

            val countryCell = cells.getOrNull(0) ?: return null
            val countryName = extractCountryName(countryCell)
            val flagUrl = extractFlagUrl(countryCell)
            val daysLeft = extractDaysLeft(row, cells)

            if (countryName.isBlank()) return null

            TransferWindow(
                countryName = countryName.trim(),
                flagUrl = flagUrl?.takeIf { it.isNotBlank() },
                daysLeft = daysLeft
            )
        } catch (e: Exception) {
            null
        }
    }

    private fun extractCountryName(cell: Element): String {
        val img = cell.selectFirst("img[title], img[alt]")
        img?.attr("title")?.takeIf { it.length in 2..80 }?.let { return it }
        img?.attr("alt")?.takeIf { it.length in 2..80 }?.let { return it }

        val link = cell.selectFirst("a")
        link?.text()?.takeIf { it.isNotBlank() }?.let { return it }

        return cell.text().trim()
    }

    private fun extractFlagUrl(cell: Element): String? {
        val img = cell.selectFirst("img")
        val src = img?.attr("data-src")?.takeIf { it.isNotBlank() }
            ?: img?.attr("src")?.takeIf { it.isNotBlank() }
        return src?.let { makeAbsoluteUrl(it) }
    }

    private fun extractDaysLeft(row: Element, cells: List<Element>): Int? {
        val rowText = row.text()
        val daysRegex = Regex("""(\d+)\s*(?:days?|Tage|días|jours|giorni)""", RegexOption.IGNORE_CASE)
        daysRegex.find(rowText)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { return it }

        for (cell in cells) {
            val text = cell.text().trim()
            val match = Regex("""^(\d+)$""").matchEntire(text)
            if (match != null) {
                val num = match.groupValues[1].toIntOrNull()
                if (num != null && num in 1..365) return num
            }
        }
        return null
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
