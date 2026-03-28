package com.liordahan.mgsrteam.features.players.playerinfo.highlights

import android.util.Log
import com.liordahan.mgsrteam.features.players.models.PinnedHighlight
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class HighlightVideo(
    val id: String,
    val source: String, // "youtube" | "scorebat"
    val title: String,
    val thumbnailUrl: String,
    val embedUrl: String,
    val channelName: String,
    val publishedAt: String,
    val durationSeconds: Int,
    val viewCount: Long?
)

data class HighlightsResponse(
    val playerName: String,
    val videos: List<HighlightVideo>,
    val cachedAt: Long,
    val sources: List<String>,
    val error: String?
)

class HighlightsApiClient(
    private val baseUrl: String = DEFAULT_BASE_URL
) {
    companion object {
        private const val TAG = "HighlightsApi"
        const val DEFAULT_BASE_URL = "https://management.mgsrfa.com"
        const val MAX_PINNED = 2
    }

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(5, 1, TimeUnit.MINUTES))
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(com.liordahan.mgsrteam.utils.ResponseSizeLimitInterceptor())
        .build()

    suspend fun searchHighlights(
        playerName: String,
        teamName: String? = null,
        position: String? = null,
        refresh: Boolean = false,
        parentClub: String? = null,
        nationality: String? = null,
        fullNameHe: String? = null,
        clubCountry: String? = null
    ): HighlightsResponse = withContext(Dispatchers.IO) {
        val params = buildString {
            append("playerName=${java.net.URLEncoder.encode(playerName, "UTF-8")}")
            teamName?.let { append("&teamName=${java.net.URLEncoder.encode(it, "UTF-8")}") }
            position?.let { append("&position=${java.net.URLEncoder.encode(it, "UTF-8")}") }
            parentClub?.let { append("&parentClub=${java.net.URLEncoder.encode(it, "UTF-8")}") }
            nationality?.let { append("&nationality=${java.net.URLEncoder.encode(it, "UTF-8")}") }
            fullNameHe?.let { append("&fullNameHe=${java.net.URLEncoder.encode(it, "UTF-8")}") }
            clubCountry?.let { append("&clubCountry=${java.net.URLEncoder.encode(it, "UTF-8")}") }
            if (refresh) append("&refresh=1")
        }

        val request = Request.Builder()
            .url("$baseUrl/api/highlights/search?$params")
            .get()
            .build()

        Log.d(TAG, "Searching highlights for: $playerName")
        val response = client.newCallAsync(request)
        val body = response.body?.string()

        if (!response.isSuccessful || body == null) {
            return@withContext HighlightsResponse(
                playerName = playerName,
                videos = emptyList(),
                cachedAt = 0,
                sources = emptyList(),
                error = "HTTP ${response.code}"
            )
        }

        parseResponse(playerName, body)
    }

    private fun parseResponse(playerName: String, body: String): HighlightsResponse {
        return try {
            val json = JSONObject(body)
            val videosArray = json.optJSONArray("videos")
            val videos = mutableListOf<HighlightVideo>()
            if (videosArray != null) {
                for (i in 0 until videosArray.length()) {
                    val v = videosArray.getJSONObject(i)
                    videos.add(
                        HighlightVideo(
                            id = v.optString("id", ""),
                            source = v.optString("source", "youtube"),
                            title = v.optString("title", ""),
                            thumbnailUrl = v.optString("thumbnailUrl", ""),
                            embedUrl = v.optString("embedUrl", ""),
                            channelName = v.optString("channelName", ""),
                            publishedAt = v.optString("publishedAt", ""),
                            durationSeconds = v.optInt("durationSeconds", 0),
                            viewCount = if (v.has("viewCount") && !v.isNull("viewCount")) v.optLong("viewCount") else null
                        )
                    )
                }
            }
            val sourcesArray = json.optJSONArray("sources")
            val sources = mutableListOf<String>()
            if (sourcesArray != null) {
                for (i in 0 until sourcesArray.length()) {
                    sources.add(sourcesArray.optString(i, ""))
                }
            }
            HighlightsResponse(
                playerName = json.optString("playerName", playerName),
                videos = videos,
                cachedAt = json.optLong("cachedAt", 0),
                sources = sources,
                error = json.optString("error", "").takeIf { it.isNotBlank() }
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse highlights response", e)
            HighlightsResponse(playerName, emptyList(), 0, emptyList(), e.message)
        }
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
