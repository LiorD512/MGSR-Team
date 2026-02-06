package com.liordahan.mgsrteam.transfermarket

import android.os.Parcelable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.parcelize.Parcelize
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.io.IOException

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
    val currentClub: TransfermarktClub? = null
)

class PlayerSearch {

    suspend fun getSearchResults(query: String?): TransfermarktResult<List<PlayerSearchModel>> =
        withContext(Dispatchers.IO) {
            val sanitizedQuery = query?.trim().orEmpty()
            if (sanitizedQuery.isEmpty()) {
                return@withContext TransfermarktResult.Success(emptyList())
            }

            try {
                val searchUrl =
                    "$TRANSFERMARKT_BASE_URL/schnellsuche/ergebnis/schnellsuche?query=$sanitizedQuery"
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

                val nationality =
                    doc.select("[itemprop=nationality] img").attr("title").ifEmpty { "Unknown" }
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


                return@withContext TransfermarktPlayerDetails(
                    tmProfile = playerSearchModel.tmProfile,
                    fullName = playerSearchModel.playerName,
                    marketValue = marketValue,
                    profileImage = playerSearchModel.playerImage,
                    nationalityFlag = playerSearchModel.nationalityFlag,
                    nationality = nationality,
                    age = playerSearchModel.playerAge,
                    height = height,
                    contractExpires = contract,
                    positions = positions,
                    currentClub = TransfermarktClub(
                        clubName = clubName,
                        clubLogo = clubLogo,
                        clubTmProfile = clubTmProfile,
                        clubCountry = clubCountry
                    )
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

