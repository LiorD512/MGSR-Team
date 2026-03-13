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
        You are a world-class ICAO 9303 passport document analyst. Your job is to extract identity fields with 100% accuracy from passport images of ANY country.

        ════════════════════════════════════════
        STEP 1: IS THIS A PASSPORT?
        ════════════════════════════════════════
        Passport indicators (ANY of these):
        • Words on the document: PASSPORT, PASSEPORT, REISEPASS, PASAPORTE, PASSAPORTO, PASSAPORTE, ПАСПОРТ, جواز سفر, 护照, パスポート, 여권
        • MRZ: 2 lines of ~44 characters with <<< filler at the bottom
        • Photo on left, labeled fields on right, national emblem/coat of arms
        • Labeled fields: Surname, Given names, Date of birth, Passport No, Nationality

        If NOT a passport → {"isPassport": false}

        ════════════════════════════════════════
        STEP 2: READ THE MRZ CAREFULLY
        ════════════════════════════════════════
        The MRZ is 2 lines at the BOTTOM of the data page in OCR-B monospace font.
        TD3 format (standard passport, 44 characters per line):

        LINE 1: P<CCCSURNAME<<GIVENNAMES<<<<<<<<<<<<<<
          Pos 0:     "P" (document type = passport)
          Pos 1:     "<" or subtype letter
          Pos 2-4:   Issuing country ISO 3166-1 alpha-3 (e.g. LBR, GIN, GBR, FRA, USA, NGA, GHA, CIV, SEN, CMR, BRA, DEU, ITA, ESP, MAR, TUN, EGY, CHN, IND, RUS)
          Pos 5-43:  SURNAME<<GIVENNAMES (surname and given names separated by "<<", each multi-word name separated by "<", remaining positions filled with "<")

        LINE 2: NNNNNNNNNXCCCYYMMDDXSYYMMDDX...
          Pos 0-8:   Document number (9 chars, CAN contain letters: PP0226862, AB1234567, O00761338)
          Pos 9:     Check digit for document number
          Pos 10-12: Nationality ISO 3166-1 alpha-3 code
          Pos 13-18: Date of birth YYMMDD (YY>=50 → 19YY, YY<50 → 20YY)
          Pos 19:    Check digit for DOB
          Pos 20:    Sex (M/F/<)
          Pos 21-26: Expiry date YYMMDD
          Pos 27:    Check digit for expiry

        ════════════════════════════════════════
        STEP 3: READ THE VISUAL ZONE
        ════════════════════════════════════════
        The printed/visual zone has labeled fields. Labels appear in the issuing country's language(s) plus often English and/or French. Common label variants by language:

        SURNAME labels: Surname, Nom, Nom de famille, Family Name, Last Name, Familienname, Nachname, Cognome, Apellido(s), Apelido, Soyadı, Фамилия, اللقب, 姓
        GIVEN NAME labels: Given Names, Prénoms, Prenoms, First Name(s), Vornamen, Vorname, Nome, Nombre(s), Nombres, Nome(s), Adı, Имя, الاسم, 名
        PASSPORT NO labels: Passport No, Passport No., Passport Number, N° de passeport, N° du document, Passnummer, Reisepassnr, Numero di passaporto, Número de pasaporte, Pasaport No, Номер паспорта, رقم جواز السفر
        NATIONALITY labels: Nationality, Nationalité, Nationaliteit, Nacionalidad, Nazionalità, Nationalität, Staatsangehörigkeit, Uyruk, Гражданство, الجنسية, 国籍
        DOB labels: Date of Birth, Date de naissance, Geburtsdatum, Data di nascita, Fecha de nacimiento, Doğum tarihi, Дата рождения, تاريخ الميلاد
        PLACE OF BIRTH labels: Place of Birth, Lieu de naissance, Geburtsort, Luogo di nascita, Lugar de nacimiento

        IMPORTANT: Many passports use BILINGUAL labels separated by "/" or on two lines:
        • "Surname / Nom" with value "ERNEST" below
        • "Given Names / Prénoms" with value "EMMANUEL" below
        • "Nationality / Nationalité" with value "LIBERIAN" below

        DATE FORMATS found on passports worldwide:
        • DD MMM YY: "30 DEC 00" → 2000-12-30 (UK, Commonwealth, ECOWAS/African passports)
        • DD MMM YYYY: "30 DEC 2000" → 2000-12-30
        • DD/MM/YYYY: "30/12/2000" → 2000-12-30 (French, Italian, Spanish passports)
        • DD.MM.YYYY: "30.12.2000" → 2000-12-30 (German, Swiss, Turkish passports)
        • YYYY-MM-DD: "2000-12-30" (Chinese, Korean passports)
        • MMM DD, YYYY: "DEC 30, 2000" (some US-style)

        ════════════════════════════════════════
        STEP 4: CROSS-VALIDATE AND OUTPUT
        ════════════════════════════════════════
        Compare MRZ with visual zone. They MUST match for the same person.
        • firstName: The GIVEN NAMES (not surname). From visual zone if readable, otherwise from MRZ (after <<). Example: "EMMANUEL" or "JEAN PIERRE"
        • lastName: The SURNAME / FAMILY NAME only. From visual zone if readable, otherwise from MRZ (before <<). Example: "ERNEST" or "BANGOURA"
        • dateOfBirth: ALWAYS output as YYYY-MM-DD. Cross-check MRZ YYMMDD with visual zone date.
        • passportNumber: Full document number with any letter prefixes. From MRZ positions 0-8 (stripped of < padding). Example: "PP0226862"
        • nationality: Convert to ENGLISH demonym/adjective. LBR→"Liberian", GIN→"Guinean", GBR→"British", FRA→"French", USA→"American", NGA→"Nigerian", GHA→"Ghanaian", CIV→"Ivorian", SEN→"Senegalese", CMR→"Cameroonian", BRA→"Brazilian", DEU→"German", ITA→"Italian", ESP→"Spanish", MAR→"Moroccan", EGY→"Egyptian", CHN→"Chinese", IND→"Indian", RUS→"Russian", TUR→"Turkish", JPN→"Japanese", KOR→"Korean", COL→"Colombian", ARG→"Argentine", PER→"Peruvian", CHL→"Chilean", MEX→"Mexican", PRT→"Portuguese", BEL→"Belgian", NLD→"Dutch", POL→"Polish", UKR→"Ukrainian", ROU→"Romanian", SRB→"Serbian", HRV→"Croatian", COD→"Congolese", MLI→"Malian", BFA→"Burkinabe", TGO→"Togolese", BEN→"Beninese", NER→"Nigerien", GAB→"Gabonese", COG→"Congolese", TCD→"Chadian", ZAF→"South African". If the visual zone already shows the nationality as a word (e.g. "LIBERIAN"), use that directly.

        CRITICAL RULES:
        • firstName = GIVEN NAMES ONLY (not surname). lastName = SURNAME ONLY (not given names). Do NOT swap them.
        • NEVER return the country name as a person's name. "REPUBLIC OF LIBERIA" is NOT a name.
        • NEVER return a label as a value. "Surname" is a label, not a name.
        • Passport images may show BOTH pages - focus on the DATA PAGE (the one with photo and MRZ).
        • Handle rotated, skewed, blurry, or partially obscured passport photos.
        • For non-Latin scripts: transliterate to Latin characters.
        • Use null for truly unreadable fields. NEVER invent data.
        • Return ONLY valid JSON. No markdown, no explanation, no code blocks.
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

    /**
     * Extracts valid leagues from a mandate document image using Gemini vision.
     * Fallback when PdfBox text extraction fails (e.g. pdf-lib generated PDFs).
     * Returns list of league/country names, or empty list on failure.
     */
    suspend fun extractLeaguesFromMandate(bitmap: Bitmap): List<String> =
        withContext(Dispatchers.IO) {
            try {
                val result = extractMandateDataFromImage(bitmap)
                result.validLeagues
            } catch (e: Exception) {
                Log.w(TAG, "Gemini mandate league extraction failed", e)
                emptyList()
            }
        }

    /**
     * Result of combined mandate data extraction via Gemini vision.
     */
    data class MandateExtractionResult(
        val mandateExpiresAt: Long? = null,
        val validLeagues: List<String> = emptyList()
    )

    /**
     * Extracts both expiry date and valid leagues from a mandate document image
     * using Gemini vision in a single API call.
     * Fallback when PdfBox/OCR text extraction fails (e.g. pdf-lib generated PDFs).
     */
    suspend fun extractMandateDataFromImage(bitmap: Bitmap): MandateExtractionResult =
        withContext(Dispatchers.IO) {
            try {
                val prompt = """
                    Look at this Football Agent Mandate document image.
                    
                    Extract TWO things:
                    
                    1. EXPIRY DATE: Find the Term section that says "starts on DD/MM/YYYY and ends on DD/MM/YYYY".
                       Extract the END date (the expiry/end date of the mandate).
                       Return it as "mandateExpiresAt" in DD/MM/YYYY format.
                       Also look for patterns like "valid from ... until DD/MM/YYYY" or "ends on DD/MM/YYYY".
                    
                    2. VALID LEAGUES: Find the section titled "Valid Leagues for this mandate:" 
                       and extract ALL league/country names listed there.
                       Return them as "validLeagues" array.
                    
                    Return ONLY a JSON object like:
                    {"mandateExpiresAt": "15/06/2026", "validLeagues": ["Israel", "Portugal"]}
                    
                    If expiry date is not found, use null for mandateExpiresAt.
                    If no leagues section exists, use empty array for validLeagues.
                    Return ONLY valid JSON. No markdown, no explanation.
                """.trimIndent()

                val content = Content.Builder()
                    .image(bitmap)
                    .text(prompt)
                    .build()

                val jsonSchema = Schema.obj(
                    mapOf(
                        "mandateExpiresAt" to Schema.string(),
                        "validLeagues" to Schema.array(Schema.string())
                    ),
                    optionalProperties = listOf("mandateExpiresAt")
                )

                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = MODEL_NAME,
                    generationConfig = generationConfig {
                        responseMimeType = "application/json"
                        responseSchema = jsonSchema
                    }
                )

                val response = model.generateContent(listOf(content))
                val text = response.text ?: return@withContext MandateExtractionResult()
                val json = extractJsonFromResponse(text) ?: return@withContext MandateExtractionResult()
                val obj = JSONObject(json)

                // Parse expiry date
                val expiryRaw = obj.optString("mandateExpiresAt", "").trim()
                val expiresAt = parseMandateExpiryDate(expiryRaw)

                // Parse leagues
                val arr = obj.optJSONArray("validLeagues")
                val leagues = if (arr != null) {
                    (0 until arr.length()).mapNotNull { arr.optString(it)?.trim()?.takeIf { s -> s.isNotBlank() } }
                } else emptyList()

                Log.i(TAG, "Gemini mandate extraction - expiry: $expiresAt, leagues: $leagues")
                MandateExtractionResult(mandateExpiresAt = expiresAt, validLeagues = leagues)
            } catch (e: Exception) {
                Log.w(TAG, "Gemini mandate data extraction failed", e)
                MandateExtractionResult()
            }
        }

    /**
     * Parses a date string (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY) to millis at end of day.
     */
    private fun parseMandateExpiryDate(raw: String): Long? {
        if (raw.isBlank()) return null
        val match = Regex("(\\d{1,2})[/\\-\\.](\\d{1,2})[/\\-\\.](\\d{4})").find(raw) ?: return null
        val (dd, mm, yy) = match.destructured
        return try {
            java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.YEAR, yy.toInt())
                set(java.util.Calendar.MONTH, mm.toInt() - 1)
                set(java.util.Calendar.DAY_OF_MONTH, dd.toInt())
                set(java.util.Calendar.HOUR_OF_DAY, 23)
                set(java.util.Calendar.MINUTE, 59)
                set(java.util.Calendar.SECOND, 59)
                set(java.util.Calendar.MILLISECOND, 999)
            }.timeInMillis
        } catch (_: Exception) {
            null
        }
    }
}
