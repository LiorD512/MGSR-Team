package com.liordahan.mgsrteam.transfermarket

import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

/**
 * Extracts the club name a player is loaned from.
 * Uses multiple strategies: ribbon title, full-document HTML scan, text regex, DOM.
 */
internal fun extractOnLoanFromClub(doc: Document, ribbonLinkTitleRaw: String, ribbonText: String, clubName: String): String? {
    return fromRibbonTitle(ribbonLinkTitleRaw)
        ?: fromRibbonTitle(ribbonText)
        ?: fromFullHtmlReverseSearch(doc, clubName)
        ?: fromPageText(doc)
        ?: fromRawHtmlForwardSearch(doc, clubName)
        ?: fromDomFallbacks(doc, clubName)
}

private fun fromRibbonTitle(title: String): String? {
    if (title.isBlank()) return null
    val t = title.trim()
    return Regex("on loan from (.+?) until", RegexOption.IGNORE_CASE).find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        ?: Regex("on loan from (.+)$", RegexOption.IGNORE_CASE).find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        ?: Regex("(?:leihe|ausgeliehen) von (.+?) bis", RegexOption.IGNORE_CASE).find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        ?: Regex("(?:leihe|ausgeliehen) von (.+)$", RegexOption.IGNORE_CASE).find(t)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
}

/**
 * REVERSE SEARCH: Find verein links in raw HTML by regex, check if "on loan from" appears
 * in the 400 chars before each link. Most robust - works regardless of DOM structure.
 */
private fun fromFullHtmlReverseSearch(doc: Document, clubName: String): String? {
    val html = doc.html()
    val lower = html.lowercase()
    val loanMarkers = listOf("on loan from", "leihe von", "ausgeliehen von")
    val linkRegex = Regex(
        "<a[^>]*href=\"([^\"]*verein[^\"]*)\"[^>]*(?:title=\"([^\"]+)\")?[^>]*>([^<]*)</a>",
        RegexOption.IGNORE_CASE
    )
    for (match in linkRegex.findAll(html)) {
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
    val slug = Regex("/([a-z0-9-]+)/(?:startseite/)?verein/", RegexOption.IGNORE_CASE).find(href)?.groupValues?.getOrNull(1)
    return slug?.replace("-", " ")?.split(" ")?.joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }?.takeIf { it.length in 2..80 }
}

/** Forward search: find "on loan from" in HTML, then next verein link. */
private fun fromRawHtmlForwardSearch(doc: Document, clubName: String): String? {
    val html = doc.body().html()
    val lower = html.lowercase()
    val markers = listOf("on loan from", "leihe von", "ausgeliehen von", "on loan:", "leihe:", "ausgeliehen:")
    val linkRegex = Regex(
        "<a[^>]*href=\"([^\"]*verein[^\"]*)\"[^>]*>([^<]+)</a>" +
            "|<a[^>]*title=\"([^\"]+)\"[^>]*href=\"[^\"]*verein[^\"]*\"[^>]*>",
        RegexOption.IGNORE_CASE
    )
    for (marker in markers) {
        val idx = lower.indexOf(marker)
        if (idx < 0) continue
        val fragment = html.substring(idx, minOf(idx + 1000, html.length))
        val match = linkRegex.find(fragment) ?: continue
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
    val en = Regex("on loan from[:\\s]+([^\\n]+?)(?=\\s+Contract|\\s+until|\\s+Joined|\\s*$|\\s+\\d{2})", RegexOption.IGNORE_CASE).find(text)?.groupValues?.getOrNull(1)?.trim()
    val de = Regex("(?:leihe|ausgeliehen) von[:\\s]+([^\\n]+?)(?=\\s+bis|\\s+Vertrag|\\s+Joined|\\s*$|\\s+\\d{2})", RegexOption.IGNORE_CASE).find(text)?.groupValues?.getOrNull(1)?.trim()
    return (en ?: de)?.takeIf { it.length in 2..80 }
}

private fun fromDomFallbacks(doc: Document, clubName: String): String? {
    fun extractClubFromLink(link: Element): String? =
        link.attr("title").takeIf { it.isNotBlank() } ?: link.text().trim().takeIf { it.isNotBlank() } ?: extractClubFromHref(link.attr("href"))
    fun isOnLoanFromLabel(el: Element?): Boolean {
        val text = (el?.text() ?: el?.ownText() ?: "").trim().lowercase()
        return text.contains("on loan from") || text.contains("leihe von") || text.contains("ausgeliehen von")
    }
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
