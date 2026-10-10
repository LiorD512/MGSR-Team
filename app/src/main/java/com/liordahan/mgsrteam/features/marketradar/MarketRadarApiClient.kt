package com.liordahan.mgsrteam.features.marketradar

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * API client for the web's Early Market Radar.
 *
 * Mirrors the Next.js route mgsr-web/src/app/api/market-radar/route.ts, which
 * is backed by mgsr-web/src/lib/marketRadar.ts. The route is:
 *
 *   GET /api/market-radar?region=<region>&signal=<signal>&refresh=<true|false>
 *
 * and returns a JSON **array** of `MarketRadarItem` objects (or, on failure, a
 * `{ "error": "..." }` object). This client calls the same production host used
 * by the other Android web clients (MgsrWebApiClient uses the same base) and
 * parses the SAME field names the web lib emits.
 */
class MarketRadarApiClient(
    private val baseUrl: String = DEFAULT_BASE_URL
) {

    companion object {
        private const val TAG = "MarketRadarApiClient"

        // Same production host as the other Android web clients (MgsrWebApiClient).
        const val DEFAULT_BASE_URL = "https://management.mgsrfa.com"
    }

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(5, 1, TimeUnit.MINUTES))
        .connectTimeout(15, TimeUnit.SECONDS)
        // The web route sets maxDuration = 60 (parallel RSS + AI enrichment on
        // cold start); allow a generous read timeout to match.
        .readTimeout(90, TimeUnit.SECONDS)
        .addInterceptor(com.liordahan.mgsrteam.utils.ResponseSizeLimitInterceptor())
        .build()

    /** Retry a network call up to [maxRetries] times on DNS / socket errors. */
    private suspend fun <T> retryOnNetworkError(maxRetries: Int = 2, block: suspend () -> T): T {
        var lastException: Exception? = null
        for (attempt in 0..maxRetries) {
            try {
                return block()
            } catch (e: UnknownHostException) {
                lastException = e
                Log.w(TAG, "DNS error (attempt ${attempt + 1}/${maxRetries + 1}): ${e.message}")
                if (attempt < maxRetries) kotlinx.coroutines.delay(1000L * (attempt + 1))
            } catch (e: SocketTimeoutException) {
                lastException = e
                Log.w(TAG, "Timeout (attempt ${attempt + 1}/${maxRetries + 1}): ${e.message}")
                if (attempt < maxRetries) kotlinx.coroutines.delay(1000L * (attempt + 1))
            }
        }
        throw lastException!!
    }

    /**
     * Fetches the market radar feed for the given [region] / [signal] filters.
     * Params map 1:1 to the web route query string.
     */
    suspend fun getMarketRadar(
        region: MarketRegion = MarketRegion.ALL,
        signal: MarketSignalType? = null,
        refresh: Boolean = false,
    ): Result<List<MarketRadarItem>> = withContext(Dispatchers.IO) {
        runCatching {
            retryOnNetworkError {
                val params = buildString {
                    append("region=").append(URLEncoder.encode(region.wire, "UTF-8"))
                    append("&signal=").append(URLEncoder.encode(signal?.wire ?: "all", "UTF-8"))
                    append("&refresh=").append(if (refresh) "true" else "false")
                }

                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/market-radar?$params")
                    .get()
                    .build()

                Log.d(TAG, "Fetching market radar: region=${region.wire} signal=${signal?.wire ?: "all"} refresh=$refresh")
                val response = client.newCallAsync(httpRequest)
                val responseBody = response.body?.string()
                    ?: throw IOException("Empty response from market-radar")

                if (!response.isSuccessful) {
                    throw IOException("Market radar failed: ${response.code} — $responseBody")
                }

                parseMarketRadarResponse(responseBody)
            }
        }
    }

    private fun parseMarketRadarResponse(json: String): List<MarketRadarItem> {
        val trimmed = json.trim()
        // The web route returns a JSON array on success, or a { error } object on
        // failure (which comes back with a non-2xx code, handled above). Guard
        // against an unexpected error object arriving with a 200.
        if (trimmed.startsWith("{")) {
            val obj = JSONObject(trimmed)
            val error = obj.optString("error", "").takeIf { it.isNotBlank() }
            if (error != null) throw IOException("Market radar error: $error")
            return emptyList()
        }

        val arr = JSONArray(trimmed)
        val items = mutableListOf<MarketRadarItem>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val detected = o.optJSONObject("detectedPlayer")?.let { d ->
                RadarDetectedPlayer(
                    name = d.optString("name", "").trim(),
                    club = d.optString("club", "").takeIf { it.isNotBlank() },
                    position = d.optString("position", "").takeIf { it.isNotBlank() },
                    age = d.optStringOrNull("age"),
                    marketValue = d.optString("marketValue", "").takeIf { it.isNotBlank() },
                    contractExpires = d.optString("contractExpires", "").takeIf { it.isNotBlank() },
                    nationality = d.optString("nationality", "").takeIf { it.isNotBlank() },
                    tmSearchUrl = d.optString("tmSearchUrl", "").takeIf { it.isNotBlank() },
                )
            }
            items.add(
                MarketRadarItem(
                    id = o.optString("id", "radar-$i"),
                    headline = o.optString("headline", ""),
                    summary = o.optString("summary", ""),
                    agentTakeaway = o.optString("agentTakeaway", ""),
                    url = o.optString("url", ""),
                    sourceName = o.optString("sourceName", ""),
                    isSocial = o.optBoolean("isSocial", false),
                    publishedAt = o.optLong("publishedAt", 0L),
                    dateFormatted = o.optString("dateFormatted", ""),
                    timeAgo = o.optString("timeAgo", ""),
                    leagueCode = o.optString("leagueCode", ""),
                    leagueName = o.optString("leagueName", ""),
                    country = o.optString("country", ""),
                    countryFlag = o.optString("countryFlag", ""),
                    region = MarketRegion.fromWire(o.optString("region", "all")),
                    signalType = MarketSignalType.fromWire(o.optString("signalType", "")),
                    signalConfidence = o.optInt("signalConfidence", 0),
                    signalReason = o.optString("signalReason", ""),
                    detectedPlayer = detected,
                )
            )
        }
        return items
    }

    /** `age` can arrive as a number or a string in the web payload. */
    private fun JSONObject.optStringOrNull(key: String): String? {
        if (!has(key) || isNull(key)) return null
        val v = opt(key) ?: return null
        return v.toString().takeIf { it.isNotBlank() && it != "null" }
    }

    private suspend fun OkHttpClient.newCallAsync(request: Request): Response =
        suspendCancellableCoroutine { cont ->
            val call = newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onResponse(call: Call, response: Response) {
                    cont.resume(response)
                }

                override fun onFailure(call: Call, e: IOException) {
                    cont.resumeWithException(e)
                }
            })
        }
}
