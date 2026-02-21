package com.liordahan.mgsrteam.transfermarket

import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import kotlin.text.RegexOption

// Pre-compiled regexes for ribbon-based loan extraction
private val RIBBON_LOAN_EN = Regex("on loan from (.+?) until", RegexOption.IGNORE_CASE)
private val RIBBON_LOAN_EN_EOL = Regex("on loan from (.+)$", RegexOption.IGNORE_CASE)
private val RIBBON_LOAN_DE = Regex("(?:leihe|ausgeliehen) von (.+?) bis", RegexOption.IGNORE_CASE)
private val RIBBON_LOAN_DE_EOL = Regex("(?:leihe|ausgeliehen) von (.+)$", RegexOption.IGNORE_CASE)

// Pre-compiled regexes for HTML-based loan extraction
private val HTML_VEREIN_LINK = Regex(
    "<a[^>]*href=\"([^\"]*verein[^\"]*)\"[^>]*(?:title=\"([^\"]+)\")?[^>]*>([^<]*)</a>",
    RegexOption.IGNORE_CASE
)
private val CLUB_SLUG_REGEX = Regex("/([a-z0-9-]+)/(?:startseite/)?verein/", RegexOption.IGNORE_CASE)
private val FORWARD_LINK_REGEX = Regex(
    "<a[^>]*href=\"([^\"]*verein[^\"]*)\"[^>]*>([^<]+)</a>" +
        "|<a[^>]*title=\"([^\"]+)\"[^>]*href=\"[^\"]*verein[^\"]*\"[^>]*>",
    RegexOption.IGNORE_CASE
)
private val PAGE_TEXT_EN = Regex(
    "on loan from[:\\s]+([^\\n]+?)(?=\\s+Contract|\\s+until|\\s+Joined|\\s*$|\\s+\\d{2})",
    RegexOption.IGNORE_CASE
)
private val PAGE_TEXT_DE = Regex(
    "(?:leihe|ausgeliehen) von[:\\s]+([^\\n]+?)(?=\\s+bis|\\s+Vertrag|\\s+Joined|\\s*$|\\s+\\d{2})",
    RegexOption.IGNORE_CASE
)

// Pre-compiled regexes for shared loan detection (detectLoanStatus)
private val LOAN_FROM_UNTIL = Regex(
    """(?:on loan from|leihe von|ausgeliehen von)\s*:?\s*(.+?)\s+(?:contract|until|bis)""",
    RegexOption.IGNORE_CASE
)
private val LOAN_FROM_EOL = Regex(
    """(?:on loan from|leihe von|ausgeliehen von)\s*:?\s*(.+?)(?:\s*${'$'}|\s*;)""",
    RegexOption.IGNORE_CASE
)

/**
 * Result of loan status detection for a player profile page.
 */
internal data class LoanInfo(val isOnLoan: Boolean, val onLoanFromClub: String?)

/**
 * Shared loan-status detection used by [PlayerSearch] and [PlayersUpdate].
 * Analyses the ribbon, header, info-box, and club sections of a player profile page.
 */
internal fun detectLoanStatus(doc: Document, clubName: String): LoanInfo {
    val ribbon = doc.select("div.data-header_ribbon, div.data-header__ribbon").firstOrNull()
        ?: doc.select("div[class*='ribbon']").firstOrNull()
    val ribbonLinkTitleRaw = ribbon?.select("a")?.firstOrNull()?.attr("title")
        ?: doc.select("a[title*='on loan from']").firstOrNull()?.attr("title")
        ?: ""
    val ribbonLinkTitle = ribbonLinkTitleRaw.lowercase()
    val ribbonText = ribbon?.text()?.trim()?.lowercase() ?: ""
    val clubSectionText = doc.select("span.data-header__club, div.data-header__club-info").text().lowercase()
    val infoBoxText = doc.select("div.data-header__info-box").text().lowercase()
    val headerText = doc.select("div.data-header").text().lowercase()
    val combined = "$ribbonLinkTitle $ribbonText $clubSectionText $infoBoxText $headerText"

    val hasLoanIndicator = ribbonLinkTitle.contains("on loan from") ||
        combined.contains("on loan") || combined.contains("leihe") ||
        combined.contains("ausgeliehen") || combined.contains("on loan from") ||
        combined.contains("leihe von") || combined.contains("ausgeliehen von") ||
        combined.contains("prêt") || combined.contains("en préstamo") || combined.contains("in prestito") ||
        (combined.contains("loan") && !combined.contains("end of loan") && !combined.contains("loan return") && !combined.contains("loan spell"))
    val isReturnee = combined.contains("returnee") || combined.contains("returned after loan")
    val isOnLoan = hasLoanIndicator && !isReturnee

    val onLoanFromClub = if (isOnLoan) {
        val headerTextRaw = doc.select("div.data-header").text()
        val infoBoxTextRaw = doc.select("div.data-header__info-box").text()
        val searchText = ribbonLinkTitleRaw.ifEmpty { headerTextRaw.ifEmpty { infoBoxTextRaw } }
        listOf(LOAN_FROM_UNTIL, LOAN_FROM_EOL).firstNotNullOfOrNull { regex ->
            regex.find(searchText)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        }
            ?: doc.select("div.data-header a[href*='/verein/']")
                .mapNotNull { it.attr("title").takeIf { t -> t.isNotBlank() } ?: it.text().trim().takeIf { t -> t.isNotBlank() } }
                .firstOrNull { it != clubName }
    } else null

    return LoanInfo(isOnLoan, onLoanFromClub)
}

/**
 * Extracts the club name a player is loaned from.
 * Uses multiple strategies: ribbon title, full-document HTML scan, text regex, DOM.
 *
 * @param rawHtml pre-fetched raw HTML to avoid expensive `doc.html()` re-serialization
 */
internal fun extractOnLoanFromClub(
    doc: Document,
    rawHtml: String,
    ribbonLinkTitleRaw: String,
    ribbonText: String,
    clubName: String
): String? {
    return fromRibbonTitle(ribbonLinkTitleRaw)
        ?: fromRibbonTitle(ribbonText)
        ?: fromFullHtmlReverseSearch(rawHtml, clubName)
        ?: fromPageText(doc)
        ?: fromRawHtmlForwardSearch(rawHtml, clubName)
        ?: fromDomFallbacks(doc, clubName)
}

private fun fromRibbonTitle(title: String): String? {
    if (title.isBlank()) return null
    val t = title.trim()
    return RIBBON_LOAN_EN.find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        ?: RIBBON_LOAN_EN_EOL.find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        ?: RIBBON_LOAN_DE.find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        ?: RIBBON_LOAN_DE_EOL.find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
}

/**
 * REVERSE SEARCH: Find verein links in raw HTML by regex, check if "on loan from" appears
 * in the 400 chars before each link. Most robust - works regardless of DOM structure.
 * Uses pre-fetched [rawHtml] instead of serializing from DOM.
 */
private fun fromFullHtmlReverseSearch(rawHtml: String, clubName: String): String? {
    val lower = rawHtml.lowercase()
    val loanMarkers = listOf("on loan from", "leihe von", "ausgeliehen von")
    for (match in HTML_VEREIN_LINK.findAll(rawHtml)) {
        val href = match.groupValues.getOrNull(1) ?: continue
        val title = match.groupValues.getOrNull(2)?.trim()?.takeIf { it.isNotBlank() }
        val linkText = match.groupValues.getOrNull(3)?.trim()?.takeIf { it.isNotBlank() }
        val club = title ?: linkText ?: extractClubFromHref(href)
        if (club == null || club == clubName || club.length !in 2..80) continue
        val linkStart = match.range.first
        val before = lower.substring(maxOf(0, linkStart - 400), linkStart)
        if (loanMarkers.any { before.contains(it) }) return club
    }
    return null
}

private fun extractClubFromHref(href: String): String? {
    val slug = CLUB_SLUG_REGEX.find(href)?.groupValues?.getOrNull(1)
    return slug?.replace("-", " ")?.split(" ")?.joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }?.takeIf { it.length in 2..80 }
}

/** Forward search: find "on loan from" in raw HTML, then next verein link. */
private fun fromRawHtmlForwardSearch(rawHtml: String, clubName: String): String? {
    val lower = rawHtml.lowercase()
    val markers = listOf("on loan from", "leihe von", "ausgeliehen von", "on loan:", "leihe:", "ausgeliehen:")
    for (marker in markers) {
        val idx = lower.indexOf(marker)
        if (idx < 0) continue
        val fragment = rawHtml.substring(idx, minOf(idx + 1000, rawHtml.length))
        val match = FORWARD_LINK_REGEX.find(fragment) ?: continue
        var club = match.groupValues.getOrNull(2)?.trim()?.takeIf { it.isNotBlank() }
            ?: match.groupValues.getOrNull(3)?.trim()?.takeIf { it.isNotBlank() }
        if (club == null) club = extractClubFromHref(match.groupValues.getOrNull(1) ?: "")
        if (club != null && club != clubName && club.length in 2..80) return club
    }
    return null
}

/** Parse club from page text via regex. */
private fun fromPageText(doc: Document): String? {
    val text = doc.body().text()
    if (text.isBlank()) return null
    val en = PAGE_TEXT_EN.find(text)?.groupValues?.getOrNull(1)?.trim()
    val de = PAGE_TEXT_DE.find(text)?.groupValues?.getOrNull(1)?.trim()
    return (en ?: de)?.takeIf { it.length in 2..80 }
}

private fun fromDomFallbacks(doc: Document, clubName: String): String? {
    fun extractClubFromLink(link: Element): String? =
        link.attr("title").takeIf { it.isNotBlank() } ?: link.text().trim().takeIf { it.isNotBlank() } ?: extractClubFromHref(link.attr("href"))

    for (el in doc.select("dt, span[class*='info'], div[class*='info'], td")) {
        val label = el.ownText().ifEmpty { el.text() }.trim().lowercase()
        if (label.contains("on loan from") || label.contains("leihe von") || label.contains("ausgeliehen von")) {
            val link = el.select("a[href*='verein']").firstOrNull()
                ?: el.nextElementSibling()?.select("a[href*='verein']")?.firstOrNull()
                ?: el.parent()?.select("a[href*='verein']")?.firstOrNull()
            val club = link?.let { extractClubFromLink(it) }
            if (club != null && club != clubName) return club
        }
    }
    return doc.select("a[href*='verein']").mapNotNull { extractClubFromLink(it) }.firstOrNull { it != clubName }
}

// Foot extraction - "Foot: left/right/both" in Facts and data. Position varies per profile.
private val FOOT_REGEX = Regex(
    """(?:Foot|Fuss|Preferred\s+foot)\s*:?\s*(\w+)""",
    RegexOption.IGNORE_CASE
)

/** Valid foot values - used to reject false positives from regex. */
private val VALID_FOOT_VALUES = setOf("left", "right", "both", "links", "rechts", "beide", "l", "r", "b")

/**
 * Extracts preferred foot from a Transfermarkt player profile.
 * Structure: div.info-table contains label (span.info-table__content--regular "Foot:")
 * and value (span.info-table__content--bold "left"). Order of attributes varies per profile.
 *
 * @param doc parsed document
 * @param rawHtml optional raw HTML for regex fallback (avoids doc.html() serialization)
 */
internal fun extractFootFromDocument(doc: Document, rawHtml: String? = null): String? {
    // Method 1: info-table structure - label (--regular) + value (--bold) as siblings
    // Scan all content spans; when we find "Foot" label, next sibling is value
    val infoTable = doc.select("div.info-table").firstOrNull()
        ?: doc.select("div[class*='info-table']").firstOrNull()
    if (infoTable != null) {
        val contentSpans = infoTable.select("span.info-table__content--regular, span.info-table__content--bold")
        for (i in contentSpans.indices) {
            val span = contentSpans[i]
            val text = span.text().trim().lowercase()
            if (text.contains("foot") || text.contains("fuss")) {
                // This is the label - value is next span (--bold) or nextElementSibling
                val valueSpan = contentSpans.getOrNull(i + 1) ?: span.nextElementSibling()
                val value = valueSpan?.text()?.trim()?.takeIf { it.isNotBlank() }
                if (value != null && isValidFootValue(value)) {
                    return normalizeFoot(value)
                }
            }
        }
        // Fallback: iterate label spans, get nextElementSibling for value
        for (label in infoTable.select("span.info-table__content--regular")) {
            val labelText = label.text().trim().lowercase()
            if (labelText.contains("foot") || labelText.contains("fuss")) {
                val valueSpan = label.nextElementSibling()
                val value = valueSpan?.text()?.trim()?.takeIf { it.isNotBlank() }
                if (value != null && isValidFootValue(value)) {
                    return normalizeFoot(value)
                }
            }
        }
    }

    // Method 2: Any span.info-table__content--regular containing "Foot" + next sibling
    for (label in doc.select("span.info-table__content--regular")) {
        val labelText = label.text().trim().lowercase()
        if (labelText.contains("foot") || labelText.contains("fuss")) {
            val valueSpan = label.nextElementSibling()
            val value = valueSpan?.text()?.trim()?.takeIf { it.isNotBlank() }
            if (value != null && isValidFootValue(value)) {
                return normalizeFoot(value)
            }
        }
    }

    // Method 3: Regex on document text (works regardless of DOM structure)
    val bodyText = doc.body().text().ifBlank { null } ?: rawHtml ?: doc.html()
    FOOT_REGEX.find(bodyText)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        ?.let { if (isValidFootValue(it)) return normalizeFoot(it) }

    // Method 4: Regex on raw HTML
    if (rawHtml != null) {
        FOOT_REGEX.find(rawHtml)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
            ?.let { if (isValidFootValue(it)) return normalizeFoot(it) }
    }

    return null
}

private fun isValidFootValue(raw: String): Boolean {
    val lower = raw.trim().lowercase()
    return lower in VALID_FOOT_VALUES ||
        lower.startsWith("left") || lower.startsWith("right") || lower.startsWith("links") ||
        lower.startsWith("rechts") || lower.contains("both") || lower.contains("beide")
}

internal fun normalizeFoot(raw: String): String {
    val lower = raw.trim().lowercase()
    return when {
        lower.startsWith("left") || lower == "l" || lower.startsWith("links") -> "Left"
        lower.startsWith("right") || lower == "r" || lower.startsWith("rechts") -> "Right"
        lower.contains("both") || lower.contains("two") || lower == "b" || lower.contains("beide") -> "Both"
        else -> raw.trim()
    }
}
