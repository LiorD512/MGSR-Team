package com.liordahan.mgsrteam.transfermarket

import android.net.Network
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
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

    private const val CONNECT_TIMEOUT_SECONDS = 5L
    private const val READ_TIMEOUT_SECONDS = 10L

    private val client = OkHttpClient.Builder()
        .dispatcher(Dispatcher().apply { maxRequestsPerHost = 20 })
        .connectionPool(ConnectionPool(15, 2, TimeUnit.MINUTES))
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .followRedirects(true)
        .retryOnConnectionFailure(true)
        .build()

    /** Fetches and parses an HTML page. Suspends without blocking an IO thread. */
    suspend fun fetchDocument(url: String, userAgent: String = getRandomUserAgent()): Document {
        val html = executeRequest(url, userAgent)
        return Jsoup.parse(html, url)
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
     * Core async HTTP execution. Uses OkHttp [enqueue] so the coroutine suspends
     * without holding an IO thread during network wait. Supports cancellation.
     */
    private suspend fun executeRequest(url: String, userAgent: String): String =
        suspendCancellableCoroutine { continuation ->
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", userAgent)
                .header("Accept-Language", "en-US,en;q=0.9")
                .build()
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
        connection.setRequestProperty("User-Agent", userAgent)
        connection.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
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
