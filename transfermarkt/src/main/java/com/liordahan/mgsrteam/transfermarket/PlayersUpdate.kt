package com.liordahan.mgsrteam.transfermarket

import android.net.Network
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class PlayerToUpdateValues(
    val marketValue: String?,
    val profileImage: String?,
    val nationalityFlag: String?,
    val citizenship: String?,
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

            return@withContext try {
                val doc = if (network != null) {
                    TransfermarktHttp.fetchDocument(profileUrl, network)
                } else {
                    TransfermarktHttp.fetchDocument(profileUrl)
                }

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
}
