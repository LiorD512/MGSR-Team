package com.liordahan.mgsrteam.features.players.playerinfo.documents

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.Content
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Passport OCR using Google Gemini vision API.
 * Handles all passport types (ICAO 9303, various layouts, languages) that MRZ/visual parsers may miss.
 * Uses Firebase AI Logic - same backend as AiHelperService. No extra API key needed.
 *
 * Best practices:
 * - Used as fallback when MRZ + visual parsers fail to extract PassportDetails
 * - Handles non-English passports, unusual layouts, poor OCR quality
 * - Returns null on non-passport images or extraction failure (graceful fallback)
 */
class GeminiPassportOcrProvider {

    companion object {
        private const val TAG = "GeminiPassportOcr"
        private const val MODEL_NAME = "gemini-2.5-flash"
        private const val MAX_IMAGE_DIMENSION = 2048
    }

    /**
     * Extracts passport data from image bytes using Gemini vision.
     * Returns PassportInfo for PassportDetails mapping, or null if not a passport / extraction failed.
     */
    suspend fun extractPassportFromImage(bytes: ByteArray, mimeType: String?): DocumentDetectionService.PassportInfo? =
        withContext(Dispatchers.IO) {
            try {
                val bitmap = decodeImage(bytes) ?: return@withContext null
                val result = extractPassportFromBitmapInternal(bitmap)
                bitmap.recycle()
                result
            } catch (e: Exception) {
                Log.w(TAG, "Gemini passport OCR failed", e)
                null
            }
        }

    /**
     * Extracts passport data from a bitmap (e.g. first page of a PDF).
     * Use when you have a bitmap but not raw image bytes (PDFs, etc.).
     */
    suspend fun extractPassportFromBitmap(bitmap: Bitmap): DocumentDetectionService.PassportInfo? =
        withContext(Dispatchers.IO) {
            try {
                extractPassportFromBitmapInternal(bitmap)
            } catch (e: Exception) {
                Log.w(TAG, "Gemini passport OCR failed", e)
                null
            }
        }

    private suspend fun extractPassportFromBitmapInternal(bitmap: Bitmap): DocumentDetectionService.PassportInfo? {
        val prompt = buildPrompt()
        val content = Content.Builder()
            .image(bitmap)
            .text(prompt)
            .build()

        val jsonSchema = Schema.obj(
            mapOf(
                "firstName" to Schema.string(),
                "lastName" to Schema.string(),
                "dateOfBirth" to Schema.string(),
                "passportNumber" to Schema.string(),
                "nationality" to Schema.string(),
                "isPassport" to Schema.boolean()
            ),
            optionalProperties = listOf("firstName", "lastName", "dateOfBirth", "passportNumber", "nationality")
        )

        val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
            modelName = MODEL_NAME,
            generationConfig = generationConfig {
                responseMimeType = "application/json"
                responseSchema = jsonSchema
            }
        )

        val response = model.generateContent(listOf(content))
        val text = response.text ?: return null

        return parseAndMapToPassportInfo(text)
    }

    private fun buildPrompt(): String = """
        You are an expert at extracting data from passport and travel document images.

        TASK: Determine if this image shows a passport/travel document and extract key fields.

        IF THIS IS A PASSPORT (from ANY country, ANY language, ANY layout):
        - Set "isPassport" to true
        - Extract ALL readable fields:
          * firstName: given names (first/middle names)
          * lastName: surname/family name (required - use "Unknown" only if truly unreadable)
          * dateOfBirth: YYYY-MM-DD format (e.g. 15.03.1990 -> 1990-03-15)
          * passportNumber: document number (alphanumeric, often 9 chars)
          * nationality: country name in English
        - SOURCES: Prefer Machine Readable Zone (MRZ) - the 2 lines of <<< characters at bottom. If MRZ is unclear, use the visual/printed zone (labels like Surname, Given names, Passport no, Date of birth, Nationality)
        - LAYOUTS: Handle ICAO 9303, EU passports, US, UK, African, Asian, Middle Eastern - all use similar fields
        - SCRIPTS: For Arabic, Hebrew, Cyrillic, etc. - transliterate to Latin characters
        - QUALITY: Work with photos (may be blurry, angled, partial). Extract what you can see. If only some fields are readable, fill those.
        - DATES: Normalize DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD all to YYYY-MM-DD

        IF THIS IS NOT A PASSPORT (mandate, contract, ID card, other):
        - Set "isPassport" to false, leave other fields null

        Return ONLY valid JSON. Use null for unreadable fields. Never invent data.
    """.trimIndent()

    private fun parseAndMapToPassportInfo(jsonText: String): DocumentDetectionService.PassportInfo? {
        val text = extractJsonFromResponse(jsonText) ?: return null
        return try {
            val obj = JSONObject(text)
            if (obj.optBoolean("isPassport", false).not()) return null

            var lastName = obj.optString("lastName", "").trim().takeIf { it.isNotBlank() }
            val firstName = obj.optString("firstName", "").trim().ifBlank { "" }
            val dateOfBirth = obj.optString("dateOfBirth", "").trim().takeIf { it.isNotBlank() }
            val passportNumber = obj.optString("passportNumber", "").trim().takeIf { it.isNotBlank() }
            val nationality = obj.optString("nationality", "").trim().takeIf { it.isNotBlank() }

            // Accept partial extraction: if we have passport number or DOB, use firstName as lastName fallback
            if (lastName == null && (passportNumber != null || dateOfBirth != null)) {
                lastName = firstName.takeIf { it.isNotBlank() } ?: "Unknown"
            }
            if (lastName == null) return null

            DocumentDetectionService.PassportInfo(
                firstName = firstName,
                lastName = lastName,
                dateOfBirth = dateOfBirth,
                passportNumber = passportNumber,
                nationality = nationality
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse Gemini passport JSON", e)
            null
        }
    }

    private fun extractJsonFromResponse(text: String): String? {
        var cleaned = text.trim()
        if (cleaned.contains("```json")) {
            val start = cleaned.indexOf("```json") + 7
            val end = cleaned.indexOf("```", start).takeIf { it >= 0 } ?: cleaned.length
            cleaned = cleaned.substring(start, end).trim()
        } else if (cleaned.contains("```")) {
            val start = cleaned.indexOf("```") + 3
            val end = cleaned.indexOf("```", start).takeIf { it >= 0 } ?: cleaned.length
            cleaned = cleaned.substring(start, end).trim()
        }
        return cleaned.takeIf { it.startsWith("{") && it.endsWith("}") }
    }

    private fun decodeImage(bytes: ByteArray): Bitmap? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        options.inSampleSize = when {
            options.outWidth > MAX_IMAGE_DIMENSION || options.outHeight > MAX_IMAGE_DIMENSION -> 2
            else -> 1
        }
        options.inJustDecodeBounds = false
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }
}
