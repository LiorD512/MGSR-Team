package com.liordahan.mgsrteam.transfermarket

import android.net.Network
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

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
                val doc = fetchDocument(profileUrl, network)

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

    /**
     * Fetches and parses an HTML document. When [network] is provided the request is sent
     * through that specific Android [Network] interface, effectively changing the outgoing IP.
     * A random user-agent is picked for every call.
     */
    private fun fetchDocument(url: String, network: Network? = null): Document {
        val userAgent = getRandomUserAgent()

        if (network != null) {
            val connection = network.openConnection(URL(url)) as HttpURLConnection
            connection.setRequestProperty("User-Agent", userAgent)
            connection.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
            connection.connectTimeout = TRANSFERMARKT_TIMEOUT_MS
            connection.readTimeout = TRANSFERMARKT_TIMEOUT_MS
            connection.instanceFollowRedirects = true
            val responseCode = connection.responseCode
            if (responseCode != HttpURLConnection.HTTP_OK) {
                connection.disconnect()
                throw IOException("HTTP $responseCode for $url")
            }
            val html = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()
            return Jsoup.parse(html, url)
        }

        return Jsoup.connect(url)
            .userAgent(userAgent)
            .timeout(TRANSFERMARKT_TIMEOUT_MS)
            .get()
    }
}

