package com.liordahan.mgsrteam.transfermarket

import android.net.Network
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class PlayerToUpdateValues(
    val marketValue: String?,
    val profileImage: String?,
    val nationalityFlag: String?,
    val citizenship: String?,
    val citizenships: List<String> = emptyList(),
    val citizenshipFlags: List<String> = emptyList(),
    val age: String?,
    val contract: String?,
    val positions: List<String?>?,
    val currentClub: TransfermarktClub?,
    val isOnLoan: Boolean = false,
    val onLoanFromClub: String? = null,
    val foot: String? = null,
    val agency: String? = null,
    val agencyUrl: String? = null
)

class PlayersUpdate {

    /**
     * @param network optional [Network] to route the request through (for IP rotation).
     *                When non-null the request is opened via [Network.openConnection] so it
     *                travels over that specific interface (WiFi / Cellular).
     */
    suspend fun updatePlayerByTmProfile(
        tmProfile: String?,
        network: Network? = null
    ): TransfermarktResult<PlayerToUpdateValues?> =
        withContext(Dispatchers.IO) {
            val profileUrl = tmProfile?.trim()
                ?: return@withContext TransfermarktResult.Failed("Profile URL is null or blank")

            // Primary: web proxy API (bypasses Cloudflare TLS fingerprinting)
            if (network == null) {
                try {
                    val result = updatePlayerViaProxy(profileUrl)
                    if (result != null) return@withContext TransfermarktResult.Success(result)
                } catch (_: Exception) { /* fall through to direct scraping */ }
            }

            // Fallback: direct scraping (or when specific network is requested for IP rotation)
            return@withContext try {
                val doc = if (network != null) {
                    TransfermarktHttp.fetchDocument(profileUrl, network)
                } else {
                    TransfermarktHttp.fetchDocument(profileUrl)
                }

                val (citizenships, citizenshipFlags) = extractAllNationalitiesFromProfile(doc)
                val citizenship = citizenships.firstOrNull().orEmpty()
                val flag = citizenshipFlags.firstOrNull().orEmpty()

                val contract = doc.select("span.data-header__label")
                    .text()
                    .substringAfterLast(":")
                    .trim()

                val playerImage = doc
                    .select("div.data-header__profile-container img")
                    .firstOrNull()
                    ?.attr("src")
                    .orEmpty()

                val marketValue = doc.select("div.data-header__box--small")
                    .text()
                    .substringBefore("Last")
                    .trim()

                val positionsList = doc.select("div.detail-position__box dd")
                    .mapNotNull {
                        it.text()
                            .replace("-", " ")
                            .takeIf(String::isNotBlank)
                            ?.convertLongPositionNameToShort()
                    }
                    .ifEmpty {
                        val fallback = doc
                            .select("div.data-header__info-box ul.data-header__items")
                            .getOrNull(1)
                            ?.text()
                            ?.substringAfterLast(":")
                            ?.trim()
                        listOfNotNull(fallback)
                    }

                val age = doc.select("span[itemprop=birthDate]")
                    .firstOrNull()
                    ?.text()
                    ?.substringAfter("(")
                    ?.substringBefore(")")
                    .orEmpty()

                val clubName = doc.select("span.data-header__club")
                    .select("a")
                    .attr("title")

                val clubLogo = doc.select("div.data-header__box--big")
                    .select("img")
                    .attr("srcset")
                    .substringBefore("1x")
                    .trim()

                val clubTmProfile = TRANSFERMARKT_BASE_URL +
                        doc.select("span.data-header__club")
                            .select("a")
                            .attr("href")

                val clubCountry = doc
                    .select("div.data-header__club-info")
                    .select("span.data-header__label")
                    .select("img")
                    .attr("title")

                val club = TransfermarktClub(
                    clubName = clubName,
                    clubLogo = clubLogo,
                    clubTmProfile = clubTmProfile,
                    clubCountry = clubCountry
                )

                val loanInfo = detectLoanStatus(doc, clubName)

                val foot = extractFootFromDocument(doc, null)

                val infoLabels = doc.select("span.info-table__content--regular")
                var agency: String? = null
                var agencyUrl: String? = null

                for (label in infoLabels) {
                    val labelText = label.text().trim().lowercase()
                    val valueSpan = label.nextElementSibling() ?: continue

                    when {
                        labelText.contains("player agent") || labelText.contains("agent") -> {
                            val link = valueSpan.selectFirst("a")
                            agency = link?.text()?.trim()?.takeIf { it.isNotBlank() }
                                ?: valueSpan.text().trim().takeIf { it.isNotBlank() }
                            val href = link?.attr("href")
                            if (!href.isNullOrBlank()) {
                                agencyUrl = if (href.startsWith("http")) href
                                else TRANSFERMARKT_BASE_URL + href
                            }
                        }
                    }
                }

                TransfermarktResult.Success(
                    PlayerToUpdateValues(
                        marketValue = marketValue,
                        profileImage = playerImage,
                        nationalityFlag = flag,
                        citizenship = citizenship,
                        citizenships = citizenships,
                        citizenshipFlags = citizenshipFlags,
                        age = age,
                        contract = contract,
                        positions = positionsList,
                        currentClub = club,
                        isOnLoan = loanInfo.isOnLoan,
                        onLoanFromClub = loanInfo.onLoanFromClub,
                        foot = foot,
                        agency = agency,
                        agencyUrl = agencyUrl
                    )
                )
            } catch (ex: Exception) {
                TransfermarktResult.Failed(ex.localizedMessage ?: "Unknown error")
            }
        }

    /** Fetch player update data via the Next.js web proxy API. */
    private fun updatePlayerViaProxy(profileUrl: String): PlayerToUpdateValues? {
        val encoded = URLEncoder.encode(profileUrl, StandardCharsets.UTF_8.toString())
        val url = "$WEB_PROXY_BASE/api/transfermarkt/player?url=$encoded"
        val json = TransfermarktHttp.fetchStringSync(url)
        val p = JSONObject(json)
        if (p.has("error")) throw IOException(p.optString("error", "Proxy error"))
        val fullName = p.optString("fullName", "")
        if (fullName.isBlank()) return null // proxy returned no useful data

        val nationalities = mutableListOf<String>()
        val nationalityFlags = mutableListOf<String>()
        p.optJSONArray("nationalities")?.let { arr ->
            for (i in 0 until arr.length()) nationalities.add(arr.getString(i))
        }
        p.optJSONArray("nationalityFlags")?.let { arr ->
            for (i in 0 until arr.length()) nationalityFlags.add(arr.getString(i))
        }
        val positions = mutableListOf<String>()
        p.optJSONArray("positions")?.let { arr ->
            for (i in 0 until arr.length()) positions.add(arr.getString(i))
        }
        val clubObj = p.optJSONObject("currentClub")

        return PlayerToUpdateValues(
            marketValue = p.optString("marketValue", null)?.takeIf { it.isNotBlank() },
            profileImage = p.optString("profileImage", null)?.takeIf { it.isNotBlank() },
            nationalityFlag = nationalityFlags.firstOrNull(),
            citizenship = nationalities.firstOrNull(),
            citizenships = nationalities,
            citizenshipFlags = nationalityFlags,
            age = p.optString("age", null)?.takeIf { it.isNotBlank() },
            contract = p.optString("contractExpires", null)?.takeIf { it.isNotBlank() },
            positions = positions.ifEmpty { null },
            currentClub = clubObj?.let {
                TransfermarktClub(
                    clubName = it.optString("clubName", null),
                    clubLogo = it.optString("clubLogo", null),
                    clubTmProfile = it.optString("clubTmProfile", null),
                    clubCountry = it.optString("clubCountry", null),
                )
            },
            isOnLoan = p.optBoolean("isOnLoan", false),
            onLoanFromClub = p.optString("onLoanFromClub", null)?.takeIf { it != "null" && it.isNotBlank() },
            foot = p.optString("foot", null)?.takeIf { it.isNotBlank() },
            agency = p.optString("agency", null)?.takeIf { it != "null" && it.isNotBlank() },
            agencyUrl = p.optString("agencyUrl", null)?.takeIf { it != "null" && it.isNotBlank() },
        )
    }
}
