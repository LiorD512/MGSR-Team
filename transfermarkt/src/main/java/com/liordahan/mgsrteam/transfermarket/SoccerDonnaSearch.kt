package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Search result from SoccerDonna quick search.
 */
data class SoccerDonnaSearchResult(
    val fullName: String,
    val currentClub: String? = null,
    val soccerDonnaUrl: String? = null,
    val source: String = "soccerdonna"
)

/**
 * Profile data parsed from a SoccerDonna player profile page.
 */
data class SoccerDonnaProfileData(
    val fullName: String? = null,
    val currentClub: String? = null,
    val age: String? = null,
    val nationality: String? = null,
    val position: String? = null,
    val marketValue: String? = null,
    val profileImage: String? = null,
    val soccerDonnaUrl: String? = null
)

/**
 * SoccerDonna search & profile scraper for women's football players.
 * Mirrors the web platform's `/api/women-players/search` and `/api/women-players/fetch-profile`.
 */
class SoccerDonnaSearch {

    companion object {
        /** Quick search URL — "undefined" in the path is required by SoccerDonna's routing. */
        private const val QUICK_SEARCH_URL =
            "https://www.soccerdonna.de/en/undefined/suche/ergebnis.html"
        /** Regex to validate a SoccerDonna player profile URL. */
        private val PROFILE_URL_RE =
            Regex("""^https?://(www\.)?soccerdonna\.de/en/[^/]+/profil/spieler_\d+\.html$""", RegexOption.IGNORE_CASE)

        /**
         * Normalise SoccerDonna market-value strings to Transfermarkt-style shorthand.
         * "650.000 €uro;" → "€650k", "1.500.000 €uro;" → "€1.5m", "25.000 €uro;" → "€25k"
         * Accessible from UI layer for display-time formatting of legacy data.
         */
        fun normalizeSoccerDonnaMarketValue(raw: String): String {
            // Already normalized (starts with € and ends with k/m)
            if (raw.startsWith("€") && (raw.endsWith("k") || raw.endsWith("m"))) return raw
            // Looks like a Transfermarkt value already (starts with €)
            if (raw.startsWith("€") && !raw.contains("€uro")) return raw

            // Strip everything except digits and dots/commas
            val cleaned = raw.replace(Regex("[^\\d.,]"), "")
            if (cleaned.isBlank()) return raw

            // SoccerDonna uses dots as thousands separators (European convention)
            val numeric = cleaned.replace(".", "").replace(",", "").toLongOrNull()
                ?: return raw
            return when {
                numeric >= 1_000_000 -> {
                    val millions = numeric / 1_000_000.0
                    if (millions == millions.toLong().toDouble()) "€${millions.toLong()}m"
                    else "€${"%.1f".format(millions).trimEnd('0').trimEnd('.')}m"
                }
                numeric >= 1_000 -> "€${numeric / 1_000}k"
                else -> "€$numeric"
            }
        }

        /**
         * Strip leading shirt number from player name.
         * SoccerDonna sometimes includes the number, e.g. "10 Lindsey Heaps".
         */
        fun stripShirtNumber(name: String): String {
            return name.replace(Regex("""^\d+\s+"""), "").trim()
        }
    }

    // ── Quick search ──

    /**
     * Search SoccerDonna by player name. Returns up to 20 results.
     * Parses the HTML search results page for player profile links.
     */
    suspend fun search(query: String): List<SoccerDonnaSearchResult> = withContext(Dispatchers.IO) {
        val trimmed = query.trim()
        if (trimmed.length < 2) return@withContext emptyList()

        try {
            val encoded = URLEncoder.encode(trimmed, StandardCharsets.UTF_8.toString())
            val url = "$QUICK_SEARCH_URL?quicksearch=$encoded&x=0&y=0"
            val html = TransfermarktHttp.fetchString(url)

            parseSearchResults(html)
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    /**
     * Parses SoccerDonna search result HTML.
     * Player links follow the pattern:
     *   <a href="/en/{slug}/profil/spieler_{id}.html">Name</a>
     *   <br/><a href="/en/{club-slug}/kader/verein_{id}.html">Club Name</a>
     */
    private fun parseSearchResults(html: String): List<SoccerDonnaSearchResult> {
        // Regex mirrors the web's: player link with optional club link after <br>
        val playerRe = Regex(
            """href="(/en/([^"]+)/profil/spieler_(\d+)\.html)"[^>]*>([^<]+)</a>(?:\s*<br\s*/?>?\s*<a href="/en/([^"]+)/kader/verein_\d+\.html"[^>]*>([^<]+)</a>)?""",
            RegexOption.IGNORE_CASE
        )

        val seen = mutableSetOf<String>()
        val results = mutableListOf<SoccerDonnaSearchResult>()

        for (match in playerRe.findAll(html)) {
            val path = match.groupValues[1]          // /en/slug/profil/spieler_123.html
            val slug = match.groupValues[2]          // slug (fallback name)
            val playerName = match.groupValues[4]    // display name from <a> text
            val clubName = match.groupValues[6]      // club name (may be empty)

            val profileUrl = "https://www.soccerdonna.de$path"
            val key = profileUrl.lowercase()
            if (key in seen) continue
            seen.add(key)

            val fullName = playerName.ifBlank {
                // Fallback: derive name from slug
                slug.replace("-", " ").split(" ").joinToString(" ") { word ->
                    word.replaceFirstChar { it.uppercaseChar() }
                }
            }.trim().let { stripShirtNumber(it) }

            val club = clubName.takeIf { it.isNotBlank() && it.lowercase() != "vereinslos" }?.trim()

            results.add(
                SoccerDonnaSearchResult(
                    fullName = fullName,
                    currentClub = club,
                    soccerDonnaUrl = profileUrl
                )
            )

            if (results.size >= 20) break
        }
        return results
    }

    // ── Profile fetch ──

    /**
     * Fetches and parses a SoccerDonna player profile page.
     * Returns structured data (name, club, age, nationality, position, market value, image).
     */
    suspend fun fetchProfile(profileUrl: String): SoccerDonnaProfileData? = withContext(Dispatchers.IO) {
        val url = profileUrl.trim().split("?")[0].split("#")[0]
        if (!PROFILE_URL_RE.matches(url)) return@withContext null

        try {
            val html = TransfermarktHttp.fetchString(url)
            parseProfile(html, url)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Parses the SoccerDonna profile HTML page.
     * Same parsing logic as the web's fetch-profile route.
     */
    private fun parseProfile(html: String, url: String): SoccerDonnaProfileData {
        // Name from URL slug (fallback)
        var fullName: String? = null
        val urlSlugMatch = Regex("""/en/([^/]+)/profil/spieler_(\d+)\.html""", RegexOption.IGNORE_CASE).find(url)
        if (urlSlugMatch != null) {
            fullName = urlSlugMatch.groupValues[1]
                .replace("-", " ")
                .split(" ")
                .joinToString(" ") { it.replaceFirstChar { c -> c.uppercaseChar() } }
        }

        // Name from <h1> (preferred)
        val h1Match = Regex("""<h1[^>]*>\s*([^<]+)\s*</h1>""", RegexOption.IGNORE_CASE).find(html)
        if (h1Match != null) {
            fullName = stripShirtNumber(h1Match.groupValues[1].trim())
        }

        // Club
        var currentClub: String? = null
        val clubMatch = Regex(
            """<a href="[^"]*verein[^"]*"[^>]*title="([^"]+)"[^>]*>([^<]+)</a>""",
            RegexOption.IGNORE_CASE
        ).find(html) ?: Regex(
            """<td[^>]*><a href="[^"]*verein[^"]*"[^>]*>([^<]+)</a></td>""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (clubMatch != null) {
            val raw = (clubMatch.groupValues.getOrNull(2) ?: clubMatch.groupValues[1]).trim()
            currentClub = if (raw.lowercase() == "vereinslos") "Without Club" else raw
        }

        // Age
        var age: String? = null
        val ageMatch = Regex(
            """<td[^>]*>Age:</td>\s*<td[^>]*>(\d+)</td>""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (ageMatch != null) age = ageMatch.groupValues[1]

        // Nationality
        var nationality: String? = null
        val natTitle = Regex(
            """Nationality:</td>\s*<td[^>]*>[\s\S]*?title="([^"]+)"[^>]*>""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (natTitle != null) {
            nationality = natTitle.groupValues[1].trim()
        } else {
            val natBlock = Regex(
                """Nationality:</td>\s*<td[^>]*>([\s\S]*?)</td>""",
                RegexOption.IGNORE_CASE
            ).find(html)
            if (natBlock != null) {
                nationality = natBlock.groupValues[1].replace(Regex("<[^>]+>"), "").trim()
            }
        }

        // Position
        var position: String? = null
        val posMatch = Regex(
            """<td[^>]*>Position:</td>\s*<td[^>]*>([^<]+)</td>""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (posMatch != null) position = posMatch.groupValues[1].trim()

        // Market value
        var marketValue: String? = null
        val mvMatch = Regex(
            """<td[^>]*>Market value:</td>\s*<td[^>]*>([^<]+)</td>""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (mvMatch != null) {
            val v = mvMatch.groupValues[1].trim()
            if (v.lowercase() != "unknown") marketValue = normalizeSoccerDonnaMarketValue(v)
        }

        // Profile image
        var profileImage: String? = null
        val imgMatch = Regex(
            """<img[^>]+src="(https?://[^"]*spielerfotos/[^"]+\.(?:jpg|png|webp))"[^>]*alt="[^"]*"[^>]*>""",
            RegexOption.IGNORE_CASE
        ).find(html) ?: Regex(
            """src="(/static/bilder_sd/spielerfotos/[^"]+\.(?:jpg|png|webp))"""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (imgMatch != null) {
            val src = imgMatch.groupValues[1]
            profileImage = if (src.startsWith("http")) src else "https://www.soccerdonna.de$src"
            if (profileImage?.contains("somebody.jpg") == true) profileImage = null
        }

        return SoccerDonnaProfileData(
            fullName = fullName,
            currentClub = currentClub,
            age = age,
            nationality = nationality,
            position = position,
            marketValue = marketValue,
            profileImage = profileImage,
            soccerDonnaUrl = url
        )
    }

}
