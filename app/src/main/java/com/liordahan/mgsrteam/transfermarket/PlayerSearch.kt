package com.liordahan.mgsrteam.transfermarket

import android.os.Parcelable
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.helpers.Result
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.parcelize.Parcelize
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import java.io.IOException
import java.util.Date

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

class PlayerSearch {

    suspend fun getSearchResults(query: String?): Result<List<PlayerSearchModel>> =
        withContext(Dispatchers.IO) {
            try {
                val resultList = mutableListOf<PlayerSearchModel>()

                val searchUrl =
                    "https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=$query"
                val doc = Jsoup.connect(searchUrl).userAgent(userAgent).get()

                val playerSection = doc.select("div.box").firstOrNull {
                    it.select("h2.content-box-headline").text()
                        .contains("players", ignoreCase = true)
                } ?: return@withContext Result.Success(emptyList())

                val rows = playerSection.select("table.items tr.odd, tr.even")

                rows.forEach { row ->
                    parsePlayerRow(row)?.let { resultList.add(it) }
                }

                val filtered = resultList.filter {
                    it.tmProfile?.contains(
                        "profil",
                        ignoreCase = true
                    ) == true
                }
                Result.Success(filtered)
            } catch (ex: IOException) {
                Result.Failed(ex.localizedMessage)
            } catch (ex: Exception) {
                Result.Failed(ex.localizedMessage)
            }
        }

    private fun parsePlayerRow(element: Element): PlayerSearchModel? {
        val tdZentriert = element.select("td.zentriert")

        return try {
            val playerImage = element.select("img").attr("src").replace("small", "big")
            val playerName = element.select("img").attr("alt")
            val playerTmProfile = "https://www.transfermarkt.com" +
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
            null // skip malformed row
        }
    }

    suspend fun getPlayerBasicInfo(playerSearchModel: PlayerSearchModel): Player =
        withContext(Dispatchers.IO) {
            try {
                val doc = Jsoup.connect(playerSearchModel.tmProfile)
                    .userAgent(userAgent)
                    .get()

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
                        .substringBefore("1x").trim()//club profile photo
                val clubTmProfile =
                    "https://www.transfermarkt.com" + doc.select("span.data-header__club")
                        .select("a").attr("href")
                val clubCountry =
                    doc.select("div.data-header__club-info").select("span.data-header__label")
                        .select("img").attr("title")


                return@withContext Player(
                    tmProfile = playerSearchModel.tmProfile,
                    fullName = playerSearchModel.playerName,
                    marketValue = marketValue,
                    profileImage = playerSearchModel.playerImage,
                    nationalityFlag = playerSearchModel.nationalityFlag,
                    nationality = nationality,
                    age = playerSearchModel.playerAge,
                    height = height,
                    contractExpired = contract,
                    positions = positions,
                    createdAt = Date().time,
                    currentClub = Club(
                        clubName = clubName,
                        clubLogo = clubLogo,
                        clubTmProfile = clubTmProfile,
                        clubCountry = clubCountry
                    )
                )

            } catch (ex: IOException) {
                ex.printStackTrace()
                throw ex // Let the caller handle the error
            } catch (ex: Exception) {
                ex.printStackTrace()
                throw ex
            }
        }


}