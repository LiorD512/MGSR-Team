package com.liordahan.mgsrteam.features.players.playerinfo.documents

import android.util.Base64
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Google Cloud Vision API OCR provider.
 * Uses DOCUMENT_TEXT_DETECTION for better accuracy on passports.
 * Returns structured data (blocks/paragraphs/words with bounding boxes) for spatial field mapping.
 * Free tier: 1000 units/month.
 * Requires API key from Google Cloud Console.
 */
class CloudVisionOcrProvider(
    private val apiKey: String?
) {

    companion object {
        private const val TAG = "CloudVisionOcr"
        private const val VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate"
    }

    suspend fun extractText(imageBytes: ByteArray): String? = withContext(Dispatchers.IO) {
        extractStructured(imageBytes)?.plainText
    }

    /**
     * Extracts text with full structure (pages, blocks, paragraphs, words) and bounding boxes.
     * Enables spatial mapping of labels to values (e.g. value under "Surname").
     */
    suspend fun extractStructured(imageBytes: ByteArray): OcrStructuredResult? = withContext(Dispatchers.IO) {
        if (apiKey.isNullOrBlank()) return@withContext null
        try {
            val base64 = Base64.encodeToString(imageBytes, Base64.NO_WRAP)
            val requestBody = JSONObject().apply {
                put("requests", org.json.JSONArray().apply {
                    put(JSONObject().apply {
                        put("image", JSONObject().apply {
                            put("content", base64)
                        })
                        put("features", org.json.JSONArray().apply {
                            put(JSONObject().apply {
                                put("type", "DOCUMENT_TEXT_DETECTION")
                                put("maxResults", 1)
                            })
                        })
                    })
                })
            }

            val url = URL("$VISION_API_URL?key=$apiKey")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            connection.connectTimeout = 15000
            connection.readTimeout = 15000

            connection.outputStream.use { os ->
                os.write(requestBody.toString().toByteArray(Charsets.UTF_8))
            }

            val responseCode = connection.responseCode
            if (responseCode != HttpURLConnection.HTTP_OK) {
                connection.disconnect()
                return@withContext null
            }

            val response = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            parseStructuredResponse(response)
        } catch (e: Exception) {
            Log.w(TAG, "Cloud Vision OCR failed", e)
            null
        }
    }

    private fun parseStructuredResponse(json: String): OcrStructuredResult? {
        return try {
            val root = JSONObject(json)
            val responses = root.optJSONArray("responses") ?: return null
            val first = responses.optJSONObject(0) ?: return null
            val fullText = first.optJSONObject("fullTextAnnotation") ?: return null
            val plainText = fullText.optString("text", "").takeIf { it.isNotBlank() } ?: return null

            val elements = mutableListOf<OcrTextElement>()
            val pages = fullText.optJSONArray("pages") ?: return OcrStructuredResult(plainText, emptyList(), "cloud_vision")

            for (p in 0 until pages.length()) {
                val page = pages.getJSONObject(p)
                val blocks = page.optJSONArray("blocks") ?: continue
                for (b in 0 until blocks.length()) {
                    val block = blocks.getJSONObject(b)
                    val paragraphs = block.optJSONArray("paragraphs") ?: continue
                    for (par in 0 until paragraphs.length()) {
                        val paragraph = paragraphs.getJSONObject(par)
                        val words = paragraph.optJSONArray("words") ?: continue
                        var parText = ""
                        var minX = Int.MAX_VALUE
                        var minY = Int.MAX_VALUE
                        var maxX = Int.MIN_VALUE
                        var maxY = Int.MIN_VALUE
                        val pageWidth = page.optInt("width", 1000)
                        val pageHeight = page.optInt("height", 1000)
                        for (w in 0 until words.length()) {
                            val word = words.getJSONObject(w)
                            val wordText = (word.optJSONArray("symbols")?.let { syms ->
                                (0 until syms.length()).joinToString("") { syms.getJSONObject(it).optString("text", "") }
                            } ?: "").trim().ifBlank { null } ?: word.optString("text", "").trim()
                            if (wordText.isNotBlank()) {
                                parText += if (parText.isBlank()) wordText else " $wordText"
                                val box = word.optJSONObject("boundingBox") ?: word.optJSONObject("bounding_box")
                                val vertsArray = box?.optJSONArray("vertices")
                                val normVertsArray = box?.optJSONArray("normalizedVertices")
                                val vertices = vertsArray ?: normVertsArray
                                val isNormalized = normVertsArray != null && vertsArray == null
                                if (vertices != null) {
                                    for (v in 0 until vertices.length()) {
                                        val vert = vertices.getJSONObject(v)
                                        var x = vert.optDouble("x", 0.0)
                                        var y = vert.optDouble("y", 0.0)
                                        if (isNormalized) {
                                            x *= pageWidth
                                            y *= pageHeight
                                        }
                                        val xi = x.toInt()
                                        val yi = y.toInt()
                                        minX = minOf(minX, xi)
                                        minY = minOf(minY, yi)
                                        maxX = maxOf(maxX, xi)
                                        maxY = maxOf(maxY, yi)
                                    }
                                }
                            }
                        }
                        if (parText.isNotBlank() && minX != Int.MAX_VALUE) {
                            elements.add(OcrTextElement(parText.trim(), minX, minY, maxX, maxY))
                        }
                    }
                }
            }

            OcrStructuredResult(plainText, elements, "cloud_vision")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse Cloud Vision response", e)
            null
        }
    }
}
