package com.liordahan.mgsrteam.transfermarket

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Document

data class PlayerToUpdateValues(
    val marketValue: String?,
    val profileImage: String?,
    val nationalityFlag: String?,
    val citizenship: String?,
    val age: String?,
    val contract: String?,
    val positions: List<String?>?,
    val currentClub: TransfermarktClub?,
)

class PlayersUpdate {

    suspend fun updatePlayerByTmProfile(tmProfile: String?): TransfermarktResult<PlayerToUpdateValues?> =
        withContext(Dispatchers.IO) {
            val profileUrl = tmProfile?.trim()
                ?: return@withContext TransfermarktResult.Failed("Profile URL is null or blank")

            return@withContext try {
                val doc = fetchDocument(profileUrl)

                val nationalityElement = doc.select("[itemprop=nationality] img").firstOrNull()
                val citizenship = nationalityElement?.attr("title").orEmpty()
                val flag = nationalityElement
                    ?.attr("src")
                    ?.replace("tiny", "head")
                    .orEmpty()

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

                TransfermarktResult.Success(
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
                TransfermarktResult.Failed(ex.localizedMessage ?: "Unknown error")
            }
        }

    private fun fetchDocument(url: String): Document {
        return Jsoup.connect(url)
            .userAgent(TRANSFERMARKT_USER_AGENT)
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }
}

