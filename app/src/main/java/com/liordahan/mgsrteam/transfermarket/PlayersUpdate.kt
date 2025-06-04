package com.liordahan.mgsrteam.transfermarket

import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.helpers.Result
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup


data class PlayerToUpdateValues(
    val marketValue: String?,
    val profileImage: String?,
    val nationalityFlag: String?,
    val citizenship: String?,
    val age: String?,
    val contract: String?,
    val positions: List<String?>?,
    val currentClub: Club?,
)

class PlayersUpdate {
    suspend fun updatePlayerByTmProfile(tmProfile: String?): Result<PlayerToUpdateValues?> =
        withContext(Dispatchers.IO) {
            if (tmProfile.isNullOrBlank()) return@withContext Result.Failed("Profile URL is null or blank")

            return@withContext try {
                val doc = Jsoup.connect(tmProfile)
                    .userAgent(userAgent)
                    .get()

                val nationalityElement = doc.select("[itemprop=nationality] img").firstOrNull()
                val citizenship = nationalityElement?.attr("title") ?: ""
                val flag = nationalityElement?.attr("src")?.replace("tiny", "head") ?: ""

                val contract =
                    doc.select("span.data-header__label").text().substringAfterLast(":")
                        .trim()

                val playerImage = doc.select("div.data-header__profile-container img")
                    .firstOrNull()?.attr("src") ?: ""

                val marketValue = doc.select("div.data-header__box--small").text()
                    .substringBefore("Last").trim()

                val positionsList = doc.select("div.detail-position__box dd")
                    .mapNotNull {
                        it.text().replace("-", " ").takeIf { it.isNotBlank() }
                            .convertLongPositionNameToShort()
                    }
                    .ifEmpty {
                        val fallback = doc.select("div.data-header__info-box ul.data-header__items")
                            .getOrNull(1)?.text()?.substringAfterLast(":")?.trim()
                        listOfNotNull(fallback)
                    }

                val age = doc.select("span[itemprop=birthDate]")
                    .firstOrNull()?.text()?.substringAfter("(")?.substringBefore(")") ?: ""


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

                val club = Club(
                    clubName = clubName,
                    clubLogo = clubLogo,
                    clubTmProfile = clubTmProfile,
                    clubCountry = clubCountry
                )

                Result.Success(
                    PlayerToUpdateValues(
                        marketValue = marketValue,
                        profileImage = playerImage,
                        nationalityFlag = flag,
                        citizenship = citizenship,
                        age = age,
                        contract = contract,
                        positions = positionsList,
                        currentClub = club
                    )
                )

            } catch (ex: Exception) {
                Result.Failed(ex.localizedMessage ?: "Unknown error")
            }
        }
}