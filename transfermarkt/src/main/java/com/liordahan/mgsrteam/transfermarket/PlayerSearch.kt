package com.liordahan.mgsrteam.transfermarket

import android.os.Parcelable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.parcelize.Parcelize
import org.json.JSONObject
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.io.IOException
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Parcelize
data class PlayerSearchModel(
    val tmProfile: String? = null,
    val playerImage: String? = null,
    val playerName: String? = null,
    val playerPosition: String? = null,
    val playerAge: String? = null,
    val playerValue: String? = null,
    val nationality: String? = null,
    val nationalityFlag: String? = null,
    val currentClub: String? = null,
    val currentClubLogo: String? = null,
    val agentNumber: String? = null,
    val contractExpires: String? = null
) : Parcelable

data class TransfermarktClub(
    val clubName: String? = null,
    val clubLogo: String? = null,
    val clubTmProfile: String? = null,
    val clubCountry: String? = null
)

data class TransfermarktPlayerDetails(
    val tmProfile: String? = null,
    val fullName: String? = null,
    val height: String? = null,
    val age: String? = null,
    val positions: List<String?>? = null,
    val profileImage: String? = null,
    val nationality: String? = null,
    val nationalities: List<String> = emptyList(),
    val nationalityFlag: String? = null,
    val nationalityFlags: List<String> = emptyList(),
    val contractExpires: String? = null,
    val marketValue: String? = null,
    val currentClub: TransfermarktClub? = null,
    val isOnLoan: Boolean = false,
    val onLoanFromClub: String? = null,
    val foot: String? = null,
    val agency: String? = null,
    val agencyUrl: String? = null
)

class PlayerSearch {

    suspend fun getSearchResults(query: String?): TransfermarktResult<List<PlayerSearchModel>> =
        withContext(Dispatchers.IO) {
            val sanitizedQuery = query?.trim().orEmpty()
            if (sanitizedQuery.isEmpty()) {
                return@withContext TransfermarktResult.Success(emptyList())
            }

            // Primary: use web proxy API (bypasses Cloudflare TLS fingerprinting)
            try {
                val result = getSearchResultsViaProxy(sanitizedQuery)
                if (result is TransfermarktResult.Success && result.data.isNotEmpty()) {
                    return@withContext result
                }
            } catch (_: Exception) { /* fall through to direct scraping */ }

            // Fallback: direct scraping
            try {
                val encodedQuery = URLEncoder.encode(sanitizedQuery, StandardCharsets.UTF_8.toString())
                val searchUrl =
                    "$TRANSFERMARKT_BASE_URL/schnellsuche/ergebnis/schnellsuche?query=$encodedQuery"
                val doc = TransfermarktHttp.fetchDocument(searchUrl)

                val playerSection = doc.select("div.box").firstOrNull {
                    it.select("h2.content-box-headline")
                        .text()
                        .contains("players", ignoreCase = true)
                } ?: return@withContext TransfermarktResult.Success(emptyList())

                val resultList = playerSection
                    .select("table.items tr.odd, tr.even")
                    .mapNotNull { row -> parsePlayerRow(row) }

                val filtered = resultList.filter { model ->
                    model.tmProfile?.contains("profil", ignoreCase = true) == true
                }
                TransfermarktResult.Success(filtered)
            } catch (ex: IOException) {
                TransfermarktResult.Failed(ex.localizedMessage)
            } catch (ex: Exception) {
                TransfermarktResult.Failed(ex.localizedMessage)
            }
        }

    /** Search via the Next.js web proxy API — returns JSON, no HTML scraping needed. */
    private fun getSearchResultsViaProxy(query: String): TransfermarktResult<List<PlayerSearchModel>> {
        val encoded = URLEncoder.encode(query, StandardCharsets.UTF_8.toString())
        val url = "$WEB_PROXY_BASE/api/transfermarkt/search?q=$encoded"
        val json = TransfermarktHttp.fetchStringSync(url)
        val root = JSONObject(json)
        val players = root.optJSONArray("players") ?: return TransfermarktResult.Success(emptyList())
        val results = mutableListOf<PlayerSearchModel>()
        for (i in 0 until players.length()) {
            val p = players.getJSONObject(i)
            results.add(
                PlayerSearchModel(
                    tmProfile = p.optString("tmProfile", null),
                    playerImage = p.optString("playerImage", null),
                    playerName = p.optString("playerName", null),
                    playerPosition = p.optString("playerPosition", null),
                    playerAge = p.optString("playerAge", null),
                    playerValue = p.optString("playerValue", null),
                    nationality = p.optString("nationality", null),
                    nationalityFlag = p.optString("nationalityFlag", null),
                    currentClub = p.optString("currentClub", null),
                    currentClubLogo = p.optString("currentClubLogo", null),
                )
            )
        }
        return TransfermarktResult.Success(results)
    }

    private fun parsePlayerRow(element: Element): PlayerSearchModel? {
        val tdZentriert = element.select("td.zentriert")

        return try {
            val playerImage = element.select("img").attr("src").replace("small", "big")
            val playerName = element.select("img").attr("alt")
            val playerTmProfile = TRANSFERMARKT_BASE_URL +
                    element.select("td.hauptlink a").attr("href")

            val playerPosition = tdZentriert.getOrNull(0)?.text().orEmpty()
            val currentClubName = tdZentriert.select("a img").attr("title")
            val currentClubLogo = tdZentriert.select("a img").attr("src").replace("tiny", "head")
            val playerAge = tdZentriert.getOrNull(2)?.text().orEmpty()
            val nationality = tdZentriert.getOrNull(3)?.select("img")?.attr("title").orEmpty()
            val nationalityFlag = tdZentriert.getOrNull(3)?.select("img")
                ?.attr("src")?.replace("verysmall", "head")?.replace("tiny", "head").orEmpty()
            val playerValue = element.select("td.rechts.hauptlink").text()

            PlayerSearchModel(
                tmProfile = playerTmProfile,
                playerImage = playerImage,
                playerName = playerName,
                playerPosition = playerPosition,
                playerAge = playerAge,
                playerValue = playerValue,
                nationalityFlag = nationalityFlag,
                currentClub = currentClubName,
                currentClubLogo = currentClubLogo,
                nationality = nationality
            )
        } catch (e: Exception) {
            null
        }
    }

    suspend fun getPlayerBasicInfo(playerSearchModel: PlayerSearchModel): TransfermarktPlayerDetails =
        withContext(Dispatchers.IO) {
            val profileUrl = playerSearchModel.tmProfile.orEmpty()

            // Primary: use web proxy API (bypasses Cloudflare TLS fingerprinting)
            try {
                val result = getPlayerBasicInfoViaProxy(profileUrl, playerSearchModel)
                if (result.fullName?.isNotBlank() == true) {
                    return@withContext result
                }
            } catch (_: Exception) { /* fall through to direct scraping */ }

            // Fallback: direct scraping
            try {
                val doc = TransfermarktHttp.fetchDocument(profileUrl)

                val (allNationalities, allNationalityFlags) = extractAllNationalitiesFromProfile(doc)
                val nationality =
                    allNationalities.firstOrNull() ?: "Unknown"
                val nationalityFlagFromDoc = allNationalityFlags.firstOrNull().orEmpty()

                val height = doc.select("[itemprop=height]").text().ifEmpty { "Unknown" }
                val marketValue = doc.select("div[class=data-header__box--small]").text()
                    .substringBefore("Last").trim()
                val contract =
                    doc.select("span.data-header__label").text().substringAfterLast(":")
                        .trim()

                val positions = doc.select("div.detail-position__box dd")
                    .map { it.text().replace("-", " ").convertLongPositionNameToShort() }
                    .ifEmpty {
                        val fallback = doc.select("ul.data-header__items")
                            .getOrNull(1)
                            ?.text()
                            ?.substringAfter(":")
                            ?.trim()
                        listOfNotNull(fallback?.convertLongPositionNameToShort())
                    }

                val clubName = doc.select("span.data-header__club").select("a").attr("title")
                val clubLogo =
                    doc.select("div.data-header__box--big").select("img").attr("srcset")
                        .substringBefore("1x").trim()
                val clubTmProfile =
                    "https://www.transfermarkt.com" + doc.select("span.data-header__club")
                        .select("a").attr("href")
                val clubCountry =
                    doc.select("div.data-header__club-info").select("span.data-header__label")
                        .select("img").attr("title")

                val fullName = playerSearchModel.playerName?.takeIf { it.isNotBlank() }
                    ?: doc.select("h1.data-header__headline").text().trim().takeIf { it.isNotBlank() }
                    ?: doc.select("div.data-header__headline-wrapper h1").text().trim().takeIf { it.isNotBlank() }
                    ?: doc.select("h1.data-header__headline-wrapper strong").text().trim().takeIf { it.isNotBlank() }
                    ?: doc.select("meta[property=og:title]").attr("content").substringBefore(" - ").trim().takeIf { it.isNotBlank() }
                    ?: doc.title().substringBefore(" - ").trim().takeIf { it.isNotBlank() }
                val profileImage = playerSearchModel.playerImage?.takeIf { it.isNotBlank() }
                    ?: doc.select("div.data-header__profile-container img").firstOrNull()?.attr("src").orEmpty()
                val age = playerSearchModel.playerAge?.takeIf { it.isNotBlank() }
                    ?: doc.select("span[itemprop=birthDate]").firstOrNull()
                        ?.text()
                        ?.substringAfter("(")
                        ?.substringBefore(")")
                        ?.trim()
                        .orEmpty()
                val nationalityFlag = playerSearchModel.nationalityFlag?.takeIf { it.isNotBlank() }
                    ?: nationalityFlagFromDoc

                val loanInfo = detectLoanStatus(doc, clubName)

                val foot = extractFootFromProfile(doc)

                // Scrape agency from info table
                var agency: String? = null
                var agencyUrl: String? = null
                val infoLabels = doc.select("span.info-table__content--regular")
                for (label in infoLabels) {
                    val labelText = label.text().trim().lowercase()
                    val valueSpan = label.nextElementSibling() ?: continue
                    if (labelText.contains("player agent") || labelText.contains("agent")) {
                        val link = valueSpan.selectFirst("a")
                        agency = link?.text()?.trim()?.takeIf { it.isNotBlank() }
                            ?: valueSpan.text().trim().takeIf { it.isNotBlank() }
                        val href = link?.attr("href")
                        if (!href.isNullOrBlank()) {
                            agencyUrl = if (href.startsWith("http")) href
                            else TRANSFERMARKT_BASE_URL + href
                        }
                        break
                    }
                }

                return@withContext TransfermarktPlayerDetails(
                    tmProfile = playerSearchModel.tmProfile,
                    fullName = fullName?.ifEmpty { null },
                    marketValue = marketValue,
                    profileImage = profileImage.ifEmpty { playerSearchModel.playerImage },
                    nationalityFlag = nationalityFlag?.ifEmpty { null },
                    nationality = nationality,
                    nationalities = allNationalities,
                    nationalityFlags = allNationalityFlags,
                    age = age.ifEmpty { playerSearchModel.playerAge },
                    height = height,
                    contractExpires = contract,
                    positions = positions,
                    currentClub = TransfermarktClub(
                        clubName = clubName,
                        clubLogo = clubLogo,
                        clubTmProfile = clubTmProfile,
                        clubCountry = clubCountry
                    ),
                    isOnLoan = loanInfo.isOnLoan,
                    onLoanFromClub = loanInfo.onLoanFromClub,
                    foot = foot,
                    agency = agency,
                    agencyUrl = agencyUrl
                )

            } catch (ex: IOException) {
                ex.printStackTrace()
                throw ex
            } catch (ex: Exception) {
                ex.printStackTrace()
                throw ex
            }
        }

    private fun extractFootFromProfile(doc: Document): String? = extractFootFromDocument(doc, null)

    /** Fetch player details via the Next.js web proxy API. */
    private fun getPlayerBasicInfoViaProxy(
        profileUrl: String,
        fallback: PlayerSearchModel
    ): TransfermarktPlayerDetails {
        val encoded = URLEncoder.encode(profileUrl, StandardCharsets.UTF_8.toString())
        val url = "$WEB_PROXY_BASE/api/transfermarkt/player?url=$encoded"
        val json = TransfermarktHttp.fetchStringSync(url)
        val p = JSONObject(json)

        // Check for error response
        if (p.has("error")) throw IOException(p.optString("error", "Proxy error"))

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

        return TransfermarktPlayerDetails(
            tmProfile = p.optString("tmProfile", profileUrl),
            fullName = p.optString("fullName", null)?.takeIf { it.isNotBlank() }
                ?: fallback.playerName,
            height = p.optString("height", "Unknown"),
            age = p.optString("age", null)?.takeIf { it.isNotBlank() }
                ?: fallback.playerAge,
            positions = positions.ifEmpty { null },
            profileImage = p.optString("profileImage", null)?.takeIf { it.isNotBlank() }
                ?: fallback.playerImage,
            nationality = nationalities.firstOrNull() ?: p.optString("nationality", "Unknown"),
            nationalities = nationalities,
            nationalityFlag = nationalityFlags.firstOrNull()
                ?: p.optString("nationalityFlag", null)?.takeIf { it.isNotBlank() }
                ?: fallback.nationalityFlag,
            nationalityFlags = nationalityFlags,
            contractExpires = p.optString("contractExpires", null),
            marketValue = p.optString("marketValue", null),
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
