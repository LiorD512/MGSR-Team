package com.liordahan.mgsrteam.transfermarket

import android.os.Parcelable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.parcelize.Parcelize
import org.jsoup.Jsoup
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
    val nationalityFlag: String? = null,
    val contractExpires: String? = null,
    val marketValue: String? = null,
    val currentClub: TransfermarktClub? = null,
    val isOnLoan: Boolean = false,
    val onLoanFromClub: String? = null
)

class PlayerSearch {

    suspend fun getSearchResults(query: String?): TransfermarktResult<List<PlayerSearchModel>> =
        withContext(Dispatchers.IO) {
            val sanitizedQuery = query?.trim().orEmpty()
            if (sanitizedQuery.isEmpty()) {
                return@withContext TransfermarktResult.Success(emptyList())
            }

            try {
                val encodedQuery = URLEncoder.encode(sanitizedQuery, StandardCharsets.UTF_8.toString())
                val searchUrl =
                    "$TRANSFERMARKT_BASE_URL/schnellsuche/ergebnis/schnellsuche?query=$encodedQuery"
                val doc = fetchDocument(searchUrl)

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

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(TRANSFERMARKT_USER_AGENT)
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
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
            try {
                val profileUrl = playerSearchModel.tmProfile.orEmpty()
                val doc = fetchDocument(profileUrl)

                val nationalityElement = doc.select("[itemprop=nationality] img").firstOrNull()
                val nationality =
                    nationalityElement?.attr("title")?.takeIf { it.isNotEmpty() } ?: "Unknown"
                val nationalityFlagFromDoc = nationalityElement
                    ?.attr("src")
                    ?.replace("verysmall", "head")
                    ?.replace("tiny", "head")
                    ?.orEmpty()

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

                // When loading by URL only (e.g. from Releases), search model has no name/image/age — parse from profile page
                val fullName = playerSearchModel.playerName?.takeIf { it.isNotBlank() }
                    ?: doc.select("h1.data-header__headline").text().trim().takeIf { it.isNotBlank() }
                    ?: doc.select("div.data-header__headline-wrapper h1").text().trim().takeIf { it.isNotBlank() }
                    ?: doc.select("meta[property=og:title]").attr("content").substringBefore(" - ").trim().takeIf { it.isNotBlank() }
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

                // Same ribbon location as returnee badge - ribbon has <a title="On loan from X until Y">
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
                    listOf(
                        Regex("""(?:on loan from|leihe von|ausgeliehen von)\s*:?\s*(.+?)\s+(?:contract|until|bis)""", RegexOption.IGNORE_CASE),
                        Regex("""(?:on loan from|leihe von|ausgeliehen von)\s*:?\s*(.+?)(?:\s*$|\s*;)""", RegexOption.IGNORE_CASE)
                    ).firstNotNullOfOrNull { regex ->
                        regex.find(searchText)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
                    }
                        ?: doc.select("div.data-header a[href*='/verein/']")
                            .mapNotNull { it.attr("title").takeIf { t -> t.isNotBlank() } ?: it.text().trim().takeIf { t -> t.isNotBlank() } }
                            .firstOrNull { it != clubName }
                } else null

                return@withContext TransfermarktPlayerDetails(
                    tmProfile = playerSearchModel.tmProfile,
                    fullName = fullName?.ifEmpty { null },
                    marketValue = marketValue,
                    profileImage = profileImage.ifEmpty { playerSearchModel.playerImage },
                    nationalityFlag = nationalityFlag?.ifEmpty { null },
                    nationality = nationality,
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
                    isOnLoan = isOnLoan,
                    onLoanFromClub = onLoanFromClub
                )

            } catch (ex: IOException) {
                ex.printStackTrace()
                throw ex
            } catch (ex: Exception) {
                ex.printStackTrace()
                throw ex
            }
        }

}

