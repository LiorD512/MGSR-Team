package com.liordahan.mgsrteam.utils

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * OkHttp interceptor that rejects responses larger than [maxBytes].
 * Prevents OOM from unexpectedly large or malicious payloads.
 */
class ResponseSizeLimitInterceptor(
    private val maxBytes: Long = 10L * 1024 * 1024 // 10 MB default
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        val contentLength = response.body?.contentLength() ?: -1L
        if (contentLength > maxBytes) {
            response.close()
            throw IOException("Response too large: $contentLength bytes (limit: $maxBytes)")
        }
        return response
    }
}
