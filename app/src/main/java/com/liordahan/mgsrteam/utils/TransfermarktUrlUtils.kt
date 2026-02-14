package com.liordahan.mgsrteam.utils

/**
 * Extracts and normalizes a Transfermarkt player profile URL from shared text.
 * Supports URLs like:
 * - https://www.transfermarkt.com/player-name/profil/spieler/12345
 * - https://transfermarkt.com/.../profil/spieler/12345
 * - Plain text containing such URLs
 */
fun extractTransfermarktPlayerUrl(text: String?): String? {
    val input = text?.trim() ?: return null
    if (input.isBlank()) return null

    // Check if the whole input is a URL
    val asUrl = input.takeIf { it.startsWith("http://") || it.startsWith("https://") }
    if (asUrl != null && isTransfermarktPlayerUrl(asUrl)) {
        return normalizeTransfermarktUrl(asUrl)
    }

    // Look for transfermarkt URLs in the text (e.g. from WhatsApp message body)
    val urlPattern = Regex(
        """https?://(?:www\.)?transfermarkt\.(?:com|co\.uk|de|es|fr|it|nl|pt|tr)/[^\s<>"']+""",
        RegexOption.IGNORE_CASE
    )
    val match = urlPattern.find(input) ?: return null
    val url = match.value
    return if (isTransfermarktPlayerUrl(url)) normalizeTransfermarktUrl(url) else null
}

private fun isTransfermarktPlayerUrl(url: String): Boolean {
    val lower = url.lowercase()
    return lower.contains("transfermarkt") &&
            (lower.contains("/profil/spieler/") || lower.contains("/profile/player/"))
}

private fun normalizeTransfermarktUrl(url: String): String {
    var normalized = url.trim()
    if (!normalized.startsWith("http")) {
        normalized = "https://$normalized"
    }
    // Use www.transfermarkt.com for consistency with the transfermarkt module
    if (normalized.contains("transfermarkt") && !normalized.startsWith("https://www.transfermarkt.com")) {
        val pathStart = normalized.indexOf("/", 8) // Skip "https://"
        val path = if (pathStart >= 0) normalized.substring(pathStart) else ""
        normalized = "https://www.transfermarkt.com$path"
    }
    return normalized
}
