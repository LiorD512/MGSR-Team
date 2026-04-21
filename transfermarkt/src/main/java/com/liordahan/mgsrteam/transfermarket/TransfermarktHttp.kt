package com.liordahan.mgsrteam.transfermarket

import android.net.Network
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.CipherSuite
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.TlsVersion
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Shared HTTP client for all Transfermarkt scraping operations.
 * Uses OkHttp with connection pooling and truly async [enqueue] calls so that
 * coroutines suspend without blocking IO threads during network waits.
 */
internal object TransfermarktHttp {

    private const val CONNECT_TIMEOUT_SECONDS = 10L
    private const val READ_TIMEOUT_SECONDS = 15L

    /**
     * OkHttp client with browser-like TLS configuration.
     * Specifies cipher suites and TLS versions that match modern Chrome,
     * reducing the chance of Cloudflare flagging us via JA3/JA4 fingerprint.
     */
    private val client: OkHttpClient by lazy {
        val specBuilder = ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
            .tlsVersions(TlsVersion.TLS_1_3, TlsVersion.TLS_1_2)
            .cipherSuites(
                // Chrome 135 cipher suite order
                CipherSuite.TLS_AES_128_GCM_SHA256,
                CipherSuite.TLS_AES_256_GCM_SHA384,
                CipherSuite.TLS_CHACHA20_POLY1305_SHA256,
                CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
                CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
                CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
                CipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
                CipherSuite.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
                CipherSuite.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
            )
        val spec = specBuilder.build()

        OkHttpClient.Builder()
            .dispatcher(Dispatcher().apply { maxRequestsPerHost = 8 })
            .connectionPool(ConnectionPool(8, 1, TimeUnit.MINUTES))
            .connectionSpecs(listOf(spec, ConnectionSpec.CLEARTEXT))
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .followRedirects(true)
            .retryOnConnectionFailure(true)
            .build()
    }

    /** Fetches and parses an HTML page. Suspends without blocking an IO thread. */
    suspend fun fetchDocument(url: String, userAgent: String = getRandomUserAgent()): Document {
        val html = executeRequest(url, userAgent)
        return Jsoup.parse(html, url)
    }

    /** Fetches raw string (e.g. JSON). Suspends without blocking an IO thread. */
    suspend fun fetchString(url: String, userAgent: String = getRandomUserAgent()): String =
        executeRequest(url, userAgent)

    /**
     * Synchronous fetch for use inside already-dispatched IO blocks (e.g. proxy calls).
     * Uses a simple OkHttp client without TM headers since it targets our own Vercel server.
     */
    fun fetchStringSync(url: String): String {
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .build()
        val response = client.newCall(request).execute()
        response.use { resp ->
            if (!resp.isSuccessful) throw IOException("HTTP ${resp.code} for $url")
            return resp.body?.string() ?: throw IOException("Empty response for $url")
        }
    }

    /**
     * Fetches a page and returns both the parsed [Document] and the raw HTML string.
     * Use when raw HTML is needed for regex-based parsing (avoids expensive `doc.html()` re-serialization).
     */
    suspend fun fetchDocumentWithHtml(url: String, userAgent: String = getRandomUserAgent()): Pair<Document, String> {
        val html = executeRequest(url, userAgent)
        return Jsoup.parse(html, url) to html
    }

    /**
     * Builds a realistic set of browser headers keyed to the active [userAgent].
     * Mirrors the sec-ch-ua / sec-fetch-* headers that header-generator produces
     * on the web side, so Transfermarkt's Cloudflare layer treats Android
     * requests as normal desktop browsers.
     */
    private fun buildRealisticHeaders(userAgent: String): Map<String, String> {
        val headers = mutableMapOf(
            "User-Agent" to userAgent,
            "Accept" to "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language" to "en-US,en;q=0.9",
            "Accept-Encoding" to "gzip, deflate, br, zstd",
            "Referer" to "https://www.transfermarkt.com/",
            "upgrade-insecure-requests" to "1",
            "priority" to "u=0, i",
            "sec-fetch-dest" to "document",
            "sec-fetch-mode" to "navigate",
            "sec-fetch-site" to "same-origin",
            "sec-fetch-user" to "?1",
            "sec-ch-ua-mobile" to "?0",
        )
        // Derive sec-ch-ua and sec-ch-ua-platform from the User-Agent string
        when {
            userAgent.contains("Edg/") -> {
                val ver = Regex("""Edg/(\d+)""").find(userAgent)?.groupValues?.get(1) ?: "135"
                headers["sec-ch-ua"] = "\"Chromium\";v=\"$ver\", \"Not?A_Brand\";v=\"8\", \"Microsoft Edge\";v=\"$ver\""
                headers["sec-ch-ua-platform"] = "\"Windows\""
            }
            userAgent.contains("Chrome/") -> {
                val ver = Regex("""Chrome/(\d+)""").find(userAgent)?.groupValues?.get(1) ?: "135"
                headers["sec-ch-ua"] = "\"Chromium\";v=\"$ver\", \"Not?A_Brand\";v=\"8\", \"Google Chrome\";v=\"$ver\""
                headers["sec-ch-ua-platform"] = if (userAgent.contains("Macintosh")) "\"macOS\""
                    else if (userAgent.contains("Linux")) "\"Linux\""
                    else "\"Windows\""
            }
            userAgent.contains("Firefox/") -> {
                // Firefox doesn't send sec-ch-ua headers
                headers.remove("sec-ch-ua-mobile")
            }
            userAgent.contains("Safari/") && !userAgent.contains("Chrome") -> {
                // Safari doesn't send sec-ch-ua headers
                headers.remove("sec-ch-ua-mobile")
            }
        }
        return headers
    }

    /**
     * Core async HTTP execution. Uses OkHttp [enqueue] so the coroutine suspends
     * without holding an IO thread during network wait. Supports cancellation.
     */
    private suspend fun executeRequest(url: String, userAgent: String): String =
        suspendCancellableCoroutine { continuation ->
            val builder = Request.Builder().url(url)
            for ((key, value) in buildRealisticHeaders(userAgent)) {
                builder.header(key, value)
            }
            val request = builder.build()
            val call = client.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) {
                        continuation.resumeWithException(e)
                    }
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use { resp ->
                        try {
                            if (!resp.isSuccessful) {
                                throw IOException("HTTP ${resp.code} for $url")
                            }
                            val body = resp.body?.string()
                                ?: throw IOException("Empty response body for $url")
                            // Detect Cloudflare challenge pages (200 status but challenge HTML)
                            if (body.length < 10_000 &&
                                (body.contains("Just a moment") || body.contains("cf-browser-verification") ||
                                 body.contains("challenge-platform") || body.contains("Turnstile"))) {
                                throw IOException("Cloudflare challenge detected for $url")
                            }
                            continuation.resume(body)
                        } catch (e: Exception) {
                            if (continuation.isActive) {
                                continuation.resumeWithException(e)
                            }
                        }
                    }
                }
            })
        }

    /**
     * Fetches a document through a specific Android [Network] interface for IP rotation.
     * Uses blocking I/O since [HttpURLConnection] has no async API.
     */
    suspend fun fetchDocument(url: String, network: Network): Document =
        withContext(Dispatchers.IO) { fetchViaNetwork(url, network).first }

    /** Network-aware variant that also returns the raw HTML. */
    suspend fun fetchDocumentWithHtml(url: String, network: Network): Pair<Document, String> =
        withContext(Dispatchers.IO) { fetchViaNetwork(url, network) }

    private fun fetchViaNetwork(url: String, network: Network): Pair<Document, String> {
        val userAgent = getRandomUserAgent()
        val connection = network.openConnection(URL(url)) as HttpURLConnection
        for ((key, value) in buildRealisticHeaders(userAgent)) {
            connection.setRequestProperty(key, value)
        }
        connection.connectTimeout = (CONNECT_TIMEOUT_SECONDS * 1000).toInt()
        connection.readTimeout = (READ_TIMEOUT_SECONDS * 1000).toInt()
        connection.instanceFollowRedirects = true
        val responseCode = connection.responseCode
        if (responseCode != HttpURLConnection.HTTP_OK) {
            connection.disconnect()
            throw IOException("HTTP $responseCode for $url")
        }
        val html = connection.inputStream.bufferedReader().use { it.readText() }
        connection.disconnect()
        return Jsoup.parse(html, url) to html
    }
}

/** Resolves a potentially relative URL to an absolute Transfermarkt URL. */
internal fun makeAbsoluteUrl(url: String): String = when {
    url.startsWith("//") -> "https:$url"
    url.startsWith("/") -> "$TRANSFERMARKT_BASE_URL$url"
    url.startsWith("http") -> url
    else -> url
}

/** Extracts nationality name and flag URL from a table row element. */
internal fun extractNationalityAndFlag(row: Element): Pair<String?, String?> {
    val img = row.select("td.zentriert img[title]").firstOrNull()
        ?: row.select("img[alt]").firstOrNull { it.attr("alt").length in 2..50 }
    val nationality = img?.attr("title")?.takeIf { it.isNotBlank() }
        ?: img?.attr("alt")?.takeIf { it.isNotBlank() }
    val flagSrc = img?.attr("data-src")?.takeIf { it.isNotBlank() }
        ?: img?.attr("src")?.takeIf { it.isNotBlank() }
    val flag = flagSrc?.let { makeAbsoluteUrl(it) }
        ?.replace("verysmall", "head")
        ?.replace("tiny", "head")
    return nationality to flag
}

/** Extracts ALL nationality names and flag URLs from a profile page.
 *  Primary source: info-table Citizenship row (contains all citizenships).
 *  Fallback: header itemprop=nationality (single nationality only). */
internal fun extractAllNationalitiesFromProfile(doc: org.jsoup.nodes.Document): Pair<List<String>, List<String>> {
    // Info-table has ALL citizenships (e.g. France + Cameroon)
    val citizenshipLabel = doc.select("span.info-table__content--regular:contains(Citizenship)")
        .firstOrNull()
    val citizenshipContent = citizenshipLabel?.nextElementSibling()
    val imgs = if (citizenshipContent != null && citizenshipContent.select("img").isNotEmpty()) {
        citizenshipContent.select("img")
    } else {
        // Fallback to header (only primary nationality)
        doc.select("[itemprop=nationality] img")
    }
    val nationalities = imgs.mapNotNull { it.attr("title").takeIf(String::isNotBlank) }
    val flags = imgs.mapNotNull {
        it.attr("src").takeIf(String::isNotBlank)
            ?.replace("tiny", "head")
            ?.replace("verysmall", "head")
            ?.let { src -> makeAbsoluteUrl(src) }
    }
    return nationalities to flags
}
