package com.liordahan.mgsrteam.utils

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Resolves redirect URLs (e.g. Google share links like https://share.google/nfXwWF) to their
 * final destination. Used when sharing from Transfermarkt via Google Share produces a short
 * URL instead of the direct Transfermarkt player URL.
 */
object RedirectUrlResolver {
    private val client = OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    /**
     * Extracts any http(s) URL from text. Used when text mentions Transfermarkt but contains
     * a short/redirect URL instead of a direct Transfermarkt URL.
     */
    fun extractUrlFromText(text: String?): String? {
        val input = text?.trim() ?: return null
        if (input.isBlank()) return null
        val urlPattern = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE)
        return urlPattern.find(input)?.value
    }

    /**
     * Follows redirects and returns the final URL. Runs on IO dispatcher.
     * Returns null if the request fails or the final URL is not a Transfermarkt player URL.
     */
    suspend fun resolveToTransfermarktUrl(shortUrl: String): String? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(shortUrl)
                .get()
                .build()
            client.newCall(request).execute().use { response ->
                val finalUrl = response.request.url.toString()
                if (isTransfermarktPlayerUrl(finalUrl)) {
                    normalizeTransfermarktUrl(finalUrl)
                } else {
                    null
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun isTransfermarktPlayerUrl(url: String): Boolean {
        val lower = url.lowercase()
        if (!lower.contains("transfermarkt")) return false
        if (lower.contains("/profil/spieler/") || lower.contains("/profile/player/")) return true
        if (lower.contains("/spieler/")) return true
        return false
    }

    private fun normalizeTransfermarktUrl(url: String): String {
        var normalized = url.trim()
            .trimEnd('.', ',', ')', ']', '!', '?', ';', ':')
        if (!normalized.startsWith("http")) {
            normalized = "https://$normalized"
        }
        if (normalized.contains("transfermarkt") && !normalized.startsWith("https://www.transfermarkt.com")) {
            val pathStart = normalized.indexOf("/", 8)
            val path = if (pathStart >= 0) normalized.substring(pathStart) else ""
            normalized = "https://www.transfermarkt.com$path"
        }
        return normalized
    }
}
