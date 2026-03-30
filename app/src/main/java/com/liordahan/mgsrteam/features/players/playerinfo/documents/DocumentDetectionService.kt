package com.liordahan.mgsrteam.features.players.playerinfo.documents

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.File
import java.text.Normalizer
import java.util.Calendar
import java.util.regex.Pattern
import kotlin.coroutines.resume

private const val TAG = "DocumentDetection"

/**
 * Detects document type from image/PDF bytes using OCR.
 * Uses Google Cloud Vision API when configured (best accuracy, structured output with bounding boxes).
 * Falls back to ML Kit with structured block/line extraction.
 * Supports passport detection via MRZ (Machine Readable Zone) or "PASSPORT"/"PASSEPORT" text.
 * When MRZ/visual parsers fail, uses Gemini vision OCR for all passport types (any country, any language).
 * Logs all detected OCR elements and which field each was assigned to.
 */
class DocumentDetectionService(
    private val context: Context,
    private val cloudVisionOcr: CloudVisionOcrProvider?,
    private val geminiPassportOcr: GeminiPassportOcrProvider?
) {

    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    /**
     * Extracted passport info from MRZ (Machine Readable Zone) or visual zone.
     */
    data class PassportInfo(
        val firstName: String,
        val lastName: String,
        val dateOfBirth: String?,
        val passportNumber: String?,
        val nationality: String? = null
    )

    /**
     * Result of document detection.
     * @param documentType Detected type (PASSPORT, MANDATE or OTHER)
     * @param suggestedName Suggested file name (e.g. "Passport_Poulolo", "Mandate_PlayerName")
     * @param passportInfo Extracted passport data when MRZ is parsed (null for non-passport or when parsing fails)
     * @param mandateExpiresAt Expiry date in millis when mandate is detected (parsed from PDF content)
     */
    data class DetectionResult(
        val documentType: DocumentType,
        val suggestedName: String,
        val passportInfo: PassportInfo? = null,
        val mandateExpiresAt: Long? = null,
        val validLeagues: List<String> = emptyList()
    )

    /**
     * Analyzes document bytes and detects if it's a passport.
     * For passports: returns PASSPORT with name "passport_Surname_GivenNames".
     * Otherwise: returns OTHER with original name.
     * @param uri When available for images, used for OCR - handles orientation automatically
     * @param playerName Optional player name for fallback when MRZ name can't be extracted
     */
    suspend fun detectDocumentType(
        uri: Uri?,
        bytes: ByteArray,
        mimeType: String?,
        originalFileName: String,
        playerName: String? = null
    ): DetectionResult = withContext(Dispatchers.IO) {
        try {
            val likelyMandate = originalFileName.lowercase().contains("mandate")

            // ──────────────────────────────────────────────────────
            // PHASE 1: Quick OCR for document type classification
            // ──────────────────────────────────────────────────────
            var text = if (isImageMimeType(mimeType) || mimeType.isNullOrBlank()) {
                cloudVisionOcr?.extractText(bytes) ?: ""
            } else ""

            if (text.length < 30) {
                text = when {
                    uri != null && (isImageMimeType(mimeType) || mimeType.isNullOrBlank()) ->
                        runOcrFromUri(uri) ?: runOcrFromBytes(bytes, mimeType)
                    isPdfMimeType(mimeType) -> {
                        val bitmap = extractFirstPageAsBitmap(bytes)
                        bitmap.let { b -> runOcr(b, 0).also { b.recycle() } }
                    }
                    else -> runOcrFromBytes(bytes, mimeType)
                }
            }

            if (text.length < 20 && (isImageMimeType(mimeType) || mimeType.isNullOrBlank())) {
                val bitmap = decodeImage(bytes)
                if (bitmap != null) {
                    listOf(90, 180, 270).forEach { rotation ->
                        if (text.length < 20) {
                            val rotatedText = runOcr(bitmap, rotation)
                            if (rotatedText.length > text.length) text = rotatedText
                        }
                    }
                    bitmap.recycle()
                }
            }

            // ──────────────────────────────────────────────────────
            // PHASE 2: Mandate detection (quick, no Gemini needed)
            // ──────────────────────────────────────────────────────
            var mandateResult = parseForMandate(text, originalFileName, playerName)
            if (mandateResult != null) {
                // PHASE 2a: Gemini PRIMARY for mandate data (matches web approach).
                // The web sends the raw file to Gemini and gets expiry + leagues in one call.
                // Do the same here: always try Gemini with raw bytes first.
                if (geminiPassportOcr != null) {
                    Log.i(TAG, "Mandate detected, using Gemini as primary extractor (matching web logic)")
                    try {
                        val geminiResult = geminiPassportOcr.extractMandateDataFromBytes(bytes, mimeType)
                        if (geminiResult.mandateExpiresAt != null) {
                            Log.i(TAG, "Gemini primary extracted mandate expiry: ${geminiResult.mandateExpiresAt}")
                            mandateResult = mandateResult.copy(mandateExpiresAt = geminiResult.mandateExpiresAt)
                        }
                        if (geminiResult.validLeagues.isNotEmpty()) {
                            Log.i(TAG, "Gemini primary extracted mandate leagues: ${geminiResult.validLeagues}")
                            mandateResult = mandateResult.copy(validLeagues = geminiResult.validLeagues)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Gemini primary mandate extraction failed, falling back to text", e)
                    }
                }

                // PHASE 2b: Text-based fallback for any fields Gemini missed
                if ((mandateResult.mandateExpiresAt == null || mandateResult.validLeagues.isEmpty()) && isPdfMimeType(mimeType)) {
                    val pdfBoxText = extractTextFromPdfWithPdfBox(bytes)
                    if (pdfBoxText != null) {
                        if (mandateResult.mandateExpiresAt == null) {
                            val expiryFromPdf = extractMandateExpiryFromText(pdfBoxText)
                                ?: extractMandateExpiryFromText(String(bytes, Charsets.UTF_8))
                                ?: extractMandateExpiryFromText(String(bytes, Charsets.ISO_8859_1))
                            if (expiryFromPdf != null) {
                                mandateResult = mandateResult.copy(mandateExpiresAt = expiryFromPdf)
                            }
                        }
                        if (mandateResult.validLeagues.isEmpty()) {
                            val leaguesFromPdf = extractValidLeaguesFromText(pdfBoxText)
                            if (leaguesFromPdf.isNotEmpty()) {
                                mandateResult = mandateResult.copy(validLeagues = leaguesFromPdf)
                            }
                        }
                    }
                }
                // PHASE 2c: Bitmap fallback if both Gemini-bytes and text extraction failed
                if ((mandateResult.mandateExpiresAt == null || mandateResult.validLeagues.isEmpty()) && geminiPassportOcr != null) {
                    Log.i(TAG, "Mandate data still incomplete after primary + text (expiry=${mandateResult.mandateExpiresAt != null}, leagues=${mandateResult.validLeagues.size}), trying Gemini bitmap fallback")
                    val bitmap = if (isPdfMimeType(mimeType)) extractFirstPageAsBitmap(bytes) else decodeImage(bytes)
                    if (bitmap != null) {
                        try {
                            val geminiResult = geminiPassportOcr.extractMandateDataFromImage(bitmap)
                            if (mandateResult.mandateExpiresAt == null && geminiResult.mandateExpiresAt != null) {
                                Log.i(TAG, "Gemini bitmap extracted mandate expiry: ${geminiResult.mandateExpiresAt}")
                                mandateResult = mandateResult.copy(mandateExpiresAt = geminiResult.mandateExpiresAt)
                            }
                            if (mandateResult.validLeagues.isEmpty() && geminiResult.validLeagues.isNotEmpty()) {
                                Log.i(TAG, "Gemini bitmap extracted mandate leagues: ${geminiResult.validLeagues}")
                                mandateResult = mandateResult.copy(validLeagues = geminiResult.validLeagues)
                            }
                        } finally {
                            bitmap.recycle()
                        }
                    }
                }
                return@withContext mandateResult
            }

            // ──────────────────────────────────────────────────────
            // PHASE 2.5: Gemini fallback for mandate CLASSIFICATION
            // Heuristics missed it? Ask Gemini directly.
            // Catches authorization docs, foreign-language mandates,
            // and any other mandate format the heuristics don't cover.
            // ──────────────────────────────────────────────────────
            if (geminiPassportOcr != null && !likelyMandate) {
                try {
                    val classifyResult = geminiPassportOcr.classifyAndExtractMandateFromBytes(bytes, mimeType)
                    if (classifyResult.isMandate) {
                        Log.i(TAG, "Gemini classified as mandate (heuristics missed). Expiry=${classifyResult.mandateExpiresAt}, leagues=${classifyResult.validLeagues}")
                        val suggestedName = "Mandate_${sanitizeFileName(playerName ?: extractNameFromMandateFilename(originalFileName) ?: "player")}"
                        return@withContext DetectionResult(
                            documentType = DocumentType.MANDATE,
                            suggestedName = suggestedName,
                            passportInfo = null,
                            mandateExpiresAt = classifyResult.mandateExpiresAt,
                            validLeagues = classifyResult.validLeagues
                        )
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Gemini mandate classification fallback failed", e)
                }
            }

            // ──────────────────────────────────────────────────────
            // PHASE 3: GEMINI-FIRST passport extraction
            // Gemini Vision sees the actual image layout, not fragile OCR text.
            // It is the PRIMARY extractor for ALL passport images.
            // ──────────────────────────────────────────────────────
            var geminiResult: PassportInfo? = null
            if (bytes.isNotEmpty() && !likelyMandate) {
                geminiResult = runGeminiPassportOcr(bytes, mimeType)
                if (geminiResult != null) {
                    Log.i(TAG, "Gemini PRIMARY: ${geminiResult.lastName}, ${geminiResult.firstName}, " +
                        "DOB=${geminiResult.dateOfBirth}, PP#=${geminiResult.passportNumber}, " +
                        "Nationality=${geminiResult.nationality}")
                }
            }

            // ──────────────────────────────────────────────────────
            // PHASE 4: Text-based parsers for cross-validation
            // MRZ parser is highly reliable for standardized fields.
            // Visual parsers supplement with labels and values.
            // ──────────────────────────────────────────────────────
            val parserResult = parseForPassport(text, originalFileName, playerName)
            val parserInfo = parserResult.passportInfo
            if (parserInfo != null) {
                Log.i(TAG, "Text parsers: ${parserInfo.lastName}, ${parserInfo.firstName}, " +
                    "DOB=${parserInfo.dateOfBirth}, PP#=${parserInfo.passportNumber}, " +
                    "Nationality=${parserInfo.nationality}")
            }

            // ──────────────────────────────────────────────────────
            // PHASE 5: Merge results - Gemini PRIMARY, parsers VALIDATE
            // ──────────────────────────────────────────────────────
            val finalResult = when {
                // Gemini found a passport → use as primary, merge parser data for validation
                geminiResult != null && parserInfo != null -> {
                    val merged = mergeGeminiWithParser(geminiResult, parserInfo)
                    Log.i(TAG, "Merged (Gemini+Parser): ${merged.lastName}, ${merged.firstName}, " +
                        "DOB=${merged.dateOfBirth}, PP#=${merged.passportNumber}, Nationality=${merged.nationality}")
                    DetectionResult(
                        documentType = DocumentType.PASSPORT,
                        suggestedName = "Passport_${sanitizeFileName(merged.lastName)}",
                        passportInfo = merged
                    )
                }
                // Gemini found a passport, no parser data
                geminiResult != null -> {
                    DetectionResult(
                        documentType = DocumentType.PASSPORT,
                        suggestedName = "Passport_${sanitizeFileName(geminiResult.lastName)}",
                        passportInfo = geminiResult
                    )
                }
                // Gemini didn't find passport, but text parsers did
                parserResult.documentType == DocumentType.PASSPORT -> parserResult
                // Neither found a passport
                else -> parserResult
            }

            // ──────────────────────────────────────────────────────
            // PHASE 6: GPS data detection via Gemini vision
            // Only when neither passport nor mandate was detected.
            // Catches image-based GPS PDFs where keyword scan fails.
            // Matches web detect route's Gemini GPS fallback.
            // ──────────────────────────────────────────────────────
            if (finalResult.documentType == DocumentType.OTHER && geminiPassportOcr != null) {
                try {
                    val gpsResult = geminiPassportOcr.classifyAsGpsFromBytes(bytes, mimeType)
                    if (gpsResult.isGpsData) {
                        val safeDate = gpsResult.matchDate?.replace("/", "-") ?: ""
                        val safeName = sanitizeFileName(playerName ?: "")
                        val nameParts = listOf("GPS", safeName, safeDate).filter { it.isNotEmpty() }
                        return@withContext DetectionResult(
                            documentType = DocumentType.GPS_DATA,
                            suggestedName = "${nameParts.joinToString("_")}.pdf"
                        )
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Gemini GPS classification fallback failed", e)
                }
            }

            finalResult
        } catch (e: Exception) {
            Log.e(TAG, "Document detection failed", e)
            DetectionResult(DocumentType.OTHER, originalFileName, null)
        }
    }

    private suspend fun runOcrFromUri(uri: Uri): String? = try {
        val inputImage = InputImage.fromFilePath(context, uri)
        runOcrTask { textRecognizer.process(inputImage) }
    } catch (_: Exception) {
        null
    }

    private suspend fun runOcrTask(process: () -> com.google.android.gms.tasks.Task<Text>) =
        suspendCancellableCoroutine { cont ->
            process()
                .addOnSuccessListener { result -> cont.resume(result.text) }
                .addOnFailureListener { cont.resume("") }
        }

    private suspend fun runOcrTaskFull(process: () -> com.google.android.gms.tasks.Task<Text>): Text? =
        suspendCancellableCoroutine { cont ->
            process()
                .addOnSuccessListener { cont.resume(it) }
                .addOnFailureListener { cont.resume(null) }
        }

    private suspend fun runMlKitStructuredFromUri(uri: Uri): OcrStructuredResult? = try {
        val inputImage = InputImage.fromFilePath(context, uri)
        runOcrTaskFull { textRecognizer.process(inputImage) }?.let { mlKitTextToStructured(it) }
    } catch (_: Exception) {
        null
    }

    private suspend fun runMlKitStructured(bitmap: Bitmap, rotationDegrees: Int = 0): OcrStructuredResult? {
        val inputImage = InputImage.fromBitmap(bitmap, rotationDegrees)
        return runOcrTaskFull { textRecognizer.process(inputImage) }?.let { mlKitTextToStructured(it) }
    }

    private suspend fun runMlKitStructuredFromBytes(bytes: ByteArray, mimeType: String?): OcrStructuredResult? {
        val bitmap = decodeImage(bytes) ?: return null
        val rotation = getExifRotation(bytes, mimeType)
        return runMlKitStructured(bitmap, rotation).also { bitmap.recycle() }
    }

    private fun mlKitTextToStructured(text: Text): OcrStructuredResult {
        val elements = mutableListOf<OcrTextElement>()
        for (block in text.textBlocks) {
            for (line in block.lines) {
                val lineText = line.text.trim()
                if (lineText.isNotBlank()) {
                    val rect = line.boundingBox
                    if (rect != null) {
                        elements.add(OcrTextElement(
                            text = lineText,
                            minX = rect.left,
                            minY = rect.top,
                            maxX = rect.right,
                            maxY = rect.bottom
                        ))
                    } else {
                        elements.add(OcrTextElement(lineText, 0, elements.size * 30, 100, elements.size * 30 + 20))
                    }
                }
            }
        }
        return OcrStructuredResult(text.text, elements, "ml_kit")
    }

    private suspend fun runOcrFromBytes(bytes: ByteArray, mimeType: String?): String {
        val bitmap = decodeImage(bytes) ?: return ""
        val rotation = getExifRotation(bytes, mimeType)
        return runOcr(bitmap, rotation).also { bitmap.recycle() }
    }

    private fun isImageMimeType(mimeType: String?): Boolean {
        if (mimeType.isNullOrBlank()) return false
        return mimeType.lowercase().startsWith("image/")
    }

    private fun isPdfMimeType(mimeType: String?): Boolean {
        return mimeType?.lowercase() == "application/pdf"
    }

    /**
     * Runs Gemini passport OCR on document bytes.
     * Handles both images (JPEG, PNG, etc.) and PDFs (extracts first page as bitmap).
     */
    private suspend fun runGeminiPassportOcr(bytes: ByteArray, mimeType: String?): PassportInfo? {
        return when {
            isImageMimeType(mimeType) || mimeType.isNullOrBlank() ->
                geminiPassportOcr?.extractPassportFromImage(bytes, mimeType)
            isPdfMimeType(mimeType) -> {
                val bitmap = extractFirstPageAsBitmap(bytes)
                try {
                    bitmap.let { geminiPassportOcr?.extractPassportFromBitmap(it) }
                } finally {
                    bitmap.recycle()
                }
            }
            else -> null
        }
    }

    private fun getExifRotation(bytes: ByteArray, mimeType: String?): Int {
        if (!isImageMimeType(mimeType) && mimeType != null) return 0
        return try {
            ExifInterface(ByteArrayInputStream(bytes)).let { exif ->
                when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            }
        } catch (_: Exception) {
            0
        }
    }

    private fun decodeImage(bytes: ByteArray): Bitmap? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        // Use full resolution for OCR - MRZ text is small and needs detail
        val maxDimension = 2560
        options.inSampleSize = when {
            options.outWidth > maxDimension || options.outHeight > maxDimension -> 2
            else -> 1
        }
        options.inJustDecodeBounds = false
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }

    private fun extractFirstPageAsBitmap(bytes: ByteArray): Bitmap {
        val tempFile = File.createTempFile("doc_", ".pdf")
        try {
            tempFile.writeBytes(bytes)
            val pfd = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY)
            val renderer = PdfRenderer(pfd)
            val page = renderer.openPage(0)
            // 4x scale for better quality - PdfRenderer often produces blurry output at 2x
            val scale = 4
            val bitmap = Bitmap.createBitmap(
                page.width * scale,
                page.height * scale,
                Bitmap.Config.ARGB_8888
            )
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            page.close()
            renderer.close()
            pfd.close()
            return bitmap
        } finally {
            tempFile.delete()
        }
    }

    private suspend fun runOcr(bitmap: Bitmap, rotationDegrees: Int = 0): String = suspendCancellableCoroutine { cont ->
        val inputImage = InputImage.fromBitmap(bitmap, rotationDegrees)
        textRecognizer.process(inputImage)
            .addOnSuccessListener { result ->
                val text = result.text
                cont.resume(text)
            }
            .addOnFailureListener {
                cont.resume("")
            }
    }

    /**
     * Normalizes OCR text for MRZ parsing - handles common misreads (O/0, 1/I/l, etc.)
     */
    private fun normalizeForMrz(text: String): String {
        var s = text.uppercase().replace(Regex("\\s+"), "")
        // Common OCR confusions: in MRZ, < is filler. OCR may read < as 1, l, |, /
        s = s.replace('|', '<').replace('/', '<')
        // In numeric contexts (passport #, DOB) O is often 0
        return s
    }

    /**
     * Detects mandate documents by filename (Mandate_*) or content (FOOTBALL AGENT MANDATE).
     * Extracts expiry date from "ends on DD/MM/YYYY" in content.
     */
    private fun parseForMandate(text: String, originalFileName: String, playerName: String?): DetectionResult? {
        val fileNameLower = originalFileName.lowercase().substringBeforeLast(".")
        val isMandateFilename = fileNameLower.startsWith("mandate_") || fileNameLower.startsWith("mandate ") ||
            fileNameLower.contains("mandate")
        val hasMandateContent = text.contains("FOOTBALL AGENT MANDATE", ignoreCase = true) ||
            (text.contains("Mandate", ignoreCase = true) && text.contains("ends on", ignoreCase = true)) ||
            (text.contains("authorize", ignoreCase = true) && text.contains("agent", ignoreCase = true) && text.contains("valid", ignoreCase = true)) ||
            (text.contains("valid from", ignoreCase = true) && text.contains("until", ignoreCase = true))
        if (!isMandateFilename && !hasMandateContent) return null

        val suggestedName = "Mandate_${sanitizeFileName(playerName ?: extractNameFromMandateFilename(originalFileName) ?: "player")}"
        val expiresAt = extractMandateExpiryFromText(text)
        val leagues = extractValidLeaguesFromText(text)
        return DetectionResult(
            documentType = DocumentType.MANDATE,
            suggestedName = suggestedName,
            passportInfo = null,
            mandateExpiresAt = expiresAt,
            validLeagues = leagues
        )
    }

    private fun extractNameFromMandateFilename(fileName: String): String? {
        val withoutExt = fileName.substringBeforeLast(".")
        val prefix = "mandate"
        val idx = withoutExt.lowercase().indexOf(prefix)
        if (idx < 0) return null
        val after = withoutExt.substring(idx + prefix.length).trim().trimStart('_', ' ', '-')
        return after.takeIf { it.isNotBlank() }
    }

    private fun extractMandateExpiryFromText(text: String): Long? {
        // Try multiple patterns - OCR may produce variations
        val patterns = listOf(
            Regex("ends on\\s+(\\d{1,2})/(\\d{1,2})/(\\d{4})", RegexOption.IGNORE_CASE),
            Regex("end on\\s+(\\d{1,2})/(\\d{1,2})/(\\d{4})", RegexOption.IGNORE_CASE),
            Regex("ends on\\s+(\\d{1,2})-(\\d{1,2})-(\\d{4})", RegexOption.IGNORE_CASE),
            Regex("ends on\\s+(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})", RegexOption.IGNORE_CASE),
            Regex("and ends on\\s+(\\d{1,2})/(\\d{1,2})/(\\d{4})", RegexOption.IGNORE_CASE),
            Regex("(\\d{1,2})/(\\d{1,2})/(\\d{4})\\s*\\([^)]*Term[^)]*\\)", RegexOption.IGNORE_CASE),
            // "valid from DATE until DATE" pattern (external mandates)
            Regex("until\\s+(\\d{1,2})/(\\d{1,2})/(\\d{4})", RegexOption.IGNORE_CASE),
            Regex("until\\s+(\\d{1,2})-(\\d{1,2})-(\\d{4})", RegexOption.IGNORE_CASE),
            Regex("until\\s+(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})", RegexOption.IGNORE_CASE)
        )
        for (regex in patterns) {
            val match = regex.find(text) ?: continue
            val (dd, mm, yy) = match.destructured
            return try {
                Calendar.getInstance().apply {
                    set(Calendar.YEAR, yy.toInt())
                    set(Calendar.MONTH, mm.toInt() - 1)
                    set(Calendar.DAY_OF_MONTH, dd.toInt())
                    set(Calendar.HOUR_OF_DAY, 23)
                    set(Calendar.MINUTE, 59)
                    set(Calendar.SECOND, 59)
                    set(Calendar.MILLISECOND, 999)
                }.timeInMillis
            } catch (_: Exception) {
                null
            }
        }
        // Fallback: Term section has "starts on DATE1 and ends on DATE2 (the Term)" - second date is expiry
        val dateRegex = Regex("(\\d{1,2})/(\\d{1,2})/(\\d{4})")
        val termLine = text.lines().find { it.contains("Term", ignoreCase = true) && it.contains("Mandate", ignoreCase = true) }
            ?: text.lines().find { it.contains("Term", ignoreCase = true) && (it.contains("starts", ignoreCase = true) || it.contains("ends", ignoreCase = true)) }
            ?: text.lines().find { it.contains("starts", ignoreCase = true) && it.contains("ends", ignoreCase = true) }
            ?: text.lines().find { it.contains("valid from", ignoreCase = true) && it.contains("until", ignoreCase = true) }
        val searchText = termLine
        if (searchText != null) {
            val datesInLine = dateRegex.findAll(searchText).map { it.destructured }.toList()
            val targetDate = when {
                datesInLine.size >= 2 -> datesInLine.last() // second date = end/expiry
                datesInLine.size == 1 && (searchText.contains("ends", ignoreCase = true) || searchText.contains("until", ignoreCase = true)) -> datesInLine.first()
                else -> null
            }
            if (targetDate != null) {
                val (dd, mm, yy) = targetDate
                return try {
                    Calendar.getInstance().apply {
                        set(Calendar.YEAR, yy.toInt())
                        set(Calendar.MONTH, mm.toInt() - 1)
                        set(Calendar.DAY_OF_MONTH, dd.toInt())
                        set(Calendar.HOUR_OF_DAY, 23)
                        set(Calendar.MINUTE, 59)
                        set(Calendar.SECOND, 59)
                        set(Calendar.MILLISECOND, 999)
                    }.timeInMillis
                } catch (_: Exception) {
                    null
                }
            }
        }

        // Universal fallback: scan entire text for all dates, pick the furthest future date.
        // Mandate expiry is always the latest date in the document.
        val allDatesRegex = Regex("(\\d{1,2})[/\\-\\.](\\d{1,2})[/\\-\\.](\\d{4})")
        val now = System.currentTimeMillis()
        var furthestMillis: Long? = null
        for (match in allDatesRegex.findAll(text)) {
            val (dd, mm, yy) = match.destructured
            try {
                val millis = Calendar.getInstance().apply {
                    set(Calendar.YEAR, yy.toInt())
                    set(Calendar.MONTH, mm.toInt() - 1)
                    set(Calendar.DAY_OF_MONTH, dd.toInt())
                    set(Calendar.HOUR_OF_DAY, 23)
                    set(Calendar.MINUTE, 59)
                    set(Calendar.SECOND, 59)
                    set(Calendar.MILLISECOND, 999)
                }.timeInMillis
                if (furthestMillis == null || millis > furthestMillis!!) {
                    furthestMillis = millis
                }
            } catch (_: Exception) { /* skip unparseable */ }
        }
        if (furthestMillis != null) {
            Log.i(TAG, "Mandate expiry via furthest-date fallback: $furthestMillis")
            return furthestMillis
        }

        return null
    }

    /**
     * Parses the "Valid Leagues for this mandate:" section from text.
     * Returns a list of league/country names, e.g. ["Israel", "Portugal"].
     */
    private fun extractValidLeaguesFromText(text: String): List<String> {
        val marker = "Valid Leagues for this mandate:"
        val idx = text.indexOf(marker, ignoreCase = true)
        if (idx == -1) return emptyList()

        val afterMarker = text.substring(idx + marker.length)
        val lines = afterMarker.split("\n")
        val leagues = mutableListOf<String>()

        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
                leagues.add(trimmed.substring(2).trim())
            } else if (trimmed.startsWith("•")) {
                leagues.add(trimmed.substring(1).trim())
            } else if (trimmed.isEmpty()) {
                continue
            } else if (leagues.isNotEmpty()) {
                break
            } else if (trimmed.length > 2 && trimmed.length < 100 && !trimmed.contains(".")) {
                leagues.add(trimmed)
            }
        }
        return leagues.filter { it.isNotBlank() }
    }

    /**
     * Scans the PDF during upload to find the Term section and extract the expiry date.
     * Uses PdfBox to extract embedded text (reliable for our generated PDFs), then finds
     * the second date in "starts on DATE1 and ends on DATE2 (the Term)".
     */
    private fun extractMandateExpiryFromPdf(bytes: ByteArray): Long? {
        // 1. PdfBox extracts actual embedded text from PDF streams (most reliable)
        val pdfBoxText = extractTextFromPdfWithPdfBox(bytes) ?: return null
        var result = extractMandateExpiryFromText(pdfBoxText)
        if (result != null) return result
        // 2. Fallback: raw byte decode (sometimes works for simple PDFs)
        val rawStr = String(bytes, Charsets.UTF_8)
        result = extractMandateExpiryFromText(rawStr)
        if (result != null) return result
        val rawLatin = String(bytes, Charsets.ISO_8859_1)
        return extractMandateExpiryFromText(rawLatin)
    }

    private fun extractTextFromPdfWithPdfBox(bytes: ByteArray): String? = try {
        ByteArrayInputStream(bytes).use { input ->
            val document = PDDocument.load(input)
            try {
                val stripper = PDFTextStripper()
                stripper.startPage = 0
                stripper.endPage = minOf(2, document.numberOfPages) // first 2 pages
                stripper.getText(document)
            } finally {
                document.close()
            }
        }
    } catch (e: Exception) {
        Log.w(TAG, "PdfBox text extraction failed", e)
        null
    }

    /**
     * Parses OCR text for passport indicators:
     * 1. Prefer Visual Zone (labeled fields: Surname, Passport no) - correct layout positions
     * 2. Use MRZ as fallback/supplement for any missing fields
     * 3. Explicit labels: PASSPORT, PASSEPORT, etc.
     */
    private fun parseForPassport(ocrText: String, fallbackName: String, playerName: String? = null): DetectionResult {
        val normalizedText = normalizeForMrz(ocrText)

        // 1. MRZ first (most reliable - standardized format)
        val mrzResult = MrzParser.parse(ocrText)
        if (mrzResult != null) {
            Log.i(TAG, "MRZ parsed: ${mrzResult.lastName}, ${mrzResult.firstName}, ${mrzResult.documentNumber}")
        }

        // 2. English visual parser (ICAO: all passports have English labels)
        val englishResult = EnglishPassportParser.parse(ocrText)

        // 3. Multi-language visual parser (French, German, Spanish, Italian, etc.)
        val visualResult = VisualZoneParser.parse(ocrText)

        // Merge: prefer MRZ (most reliable), then English, then multi-language visual for missing fields
        val firstName = mrzResult?.firstName?.takeIf { it.isNotBlank() }
            ?: englishResult?.firstName?.takeIf { it.isNotBlank() }
            ?: visualResult?.firstName?.takeIf { it.isNotBlank() }
        val lastName = mrzResult?.lastName?.takeIf { it.isNotBlank() }
            ?: englishResult?.lastName?.takeIf { it.isNotBlank() }
            ?: visualResult?.lastName?.takeIf { it.isNotBlank() }
        val passportNumber = mrzResult?.documentNumber?.takeIf { it.isNotBlank() }
            ?: englishResult?.passportNumber?.takeIf { it.isNotBlank() }
            ?: visualResult?.passportNumber?.takeIf { it.isNotBlank() }
        val dateOfBirth = mrzResult?.dateOfBirthFormatted?.takeIf { it.isNotBlank() }
            ?: englishResult?.dateOfBirth?.takeIf { it.isNotBlank() }
            ?: visualResult?.dateOfBirth?.takeIf { it.isNotBlank() }
        val nationality = englishResult?.nationality?.takeIf { it.isNotBlank() }
            ?: mrzResult?.nationality?.let { CountryCodeUtils.alpha3ToCountryName(it) }?.takeIf { it.isNotBlank() }

        if (lastName != null) {
            return DetectionResult(
                DocumentType.PASSPORT,
                "Passport_${sanitizeFileName(lastName)}",
                PassportInfo(
                    firstName = firstName ?: "",
                    lastName = lastName,
                    dateOfBirth = dateOfBirth,
                    passportNumber = passportNumber,
                    nationality = nationality
                )
            )
        }

        // 2. Fall back to MRZ-only if visual zone didn't find surname
        MrzParser.parse(ocrText)?.let { mrz ->
            val mrzNationality = CountryCodeUtils.alpha3ToCountryName(mrz.nationality)
            return DetectionResult(
                DocumentType.PASSPORT,
                "Passport_${sanitizeFileName(mrz.lastName)}",
                PassportInfo(
                    firstName = mrz.firstName,
                    lastName = mrz.lastName,
                    dateOfBirth = mrz.dateOfBirthFormatted,
                    passportNumber = mrz.documentNumber,
                    nationality = mrzNationality
                )
            )
        }

        // 3. Try with line structure - MRZ lines are ~44 chars
        val lines = ocrText.split(Regex("\\s*\n\\s*")).map { normalizeForMrz(it) }.filter { it.length >= 30 }
        val mrzCandidates = listOf(normalizedText) + lines + lines.joinToString("")

        for (textToParse in mrzCandidates.distinct()) {
            MrzParser.parse(textToParse)?.let { mrz ->
                val mrzNationality = CountryCodeUtils.alpha3ToCountryName(mrz.nationality)
                return DetectionResult(
                    DocumentType.PASSPORT,
                    "Passport_${sanitizeFileName(mrz.lastName)}",
                    PassportInfo(
                        firstName = mrz.firstName,
                        lastName = mrz.lastName,
                        dateOfBirth = mrz.dateOfBirthFormatted,
                        passportNumber = mrz.documentNumber,
                        nationality = mrzNationality
                    )
                )
            }
            val parsed = tryParseMrz(textToParse)
            if (parsed != null) return parsed
        }

        // MRZ-like pattern found but parsing failed - still treat as passport
        if (Pattern.compile("P[<1l|][A-Z0-9<]{10,}").matcher(normalizedText).find()) {
            val familyName = extractFamilyName(playerName) ?: sanitizeFileName(fallbackName)
            return DetectionResult(DocumentType.PASSPORT, "Passport_$familyName", null)
        }

        // Check for explicit passport labels (PASSEPORT = French)
        val passportKeywords = listOf("PASSPORT", "PASSEPORT", "REISEPASS", "PASAPORTE")
        if (passportKeywords.any { normalizedText.contains(it) }) {
            val familyName = extractFamilyName(playerName) ?: sanitizeFileName(fallbackName)
            return DetectionResult(DocumentType.PASSPORT, "Passport_$familyName", null)
        }

        return DetectionResult(DocumentType.OTHER, fallbackName, null)
    }

    /**
     * Tries to parse MRZ from text. Returns DetectionResult with PassportInfo if successful.
     */
    private fun tryParseMrz(text: String): DetectionResult? {
        // Parse line 2: passport number (9 chars) + check + country (3) + DOB (6 digits)
        // Document number can contain letter O (e.g. O00761338) - do NOT replace O with 0
        val line2Patterns = listOf(
            Pattern.compile("([A-Z0-9O<]{8,9})[A-Z0-9O]?[A-Z]{2,3}([0-9O]{6})"),
            Pattern.compile("([A-Z0-9<]{9})[A-Z0-9][A-Z]{3}([0-9]{6})"),
            Pattern.compile("([0-9A-Z]{2}[0-9A-Z<]{6,7})[0-9A-Z][A-Z]{3}([0-9]{6})"),
            Pattern.compile("([0-9]{2}[A-Z]{2}[0-9]{5})[0-9][A-Z]{3}([0-9]{6})")  // e.g. 18FF02769
        )
        var passportNumber: String? = null
        var dateOfBirth: String? = null
        for (pattern in line2Patterns) {
            val m = pattern.matcher(text)
            if (m.find()) {
                val docNum = m.group(1)?.replace("<", "")?.trim()
                if (docNum != null && docNum.length in 5..9 && docNum.any { it.isLetter() }) {
                    passportNumber = docNum
                }
                val dobRaw = m.group(2)?.replace("O", "0")
                if (dobRaw != null && dobRaw.length == 6 && dobRaw.all { it.isDigit() }) {
                    val yy = dobRaw.take(2).toIntOrNull() ?: 0
                    val mm = dobRaw.substring(2, 4).toIntOrNull() ?: 0
                    val dd = dobRaw.takeLast(2).toIntOrNull() ?: 0
                    if (mm in 1..12 && dd in 1..31) {
                        val year = if (yy >= 50) 1900 + yy else 2000 + yy
                        dateOfBirth = String.format("%04d-%02d-%02d", year, mm, dd)
                    }
                }
                if (passportNumber != null || dateOfBirth != null) break
            }
        }
        // Fallback: search for DOB (YYMMDD) and passport number separately
        if (dateOfBirth == null) {
            val dobPattern = Pattern.compile("([0-9O]{2})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])")
            val dobMatch = dobPattern.matcher(text.replace("O", "0"))
            if (dobMatch.find()) {
                val yy = dobMatch.group(1)?.toIntOrNull() ?: 0
                val mm = dobMatch.group(2)?.toIntOrNull() ?: 0
                val dd = dobMatch.group(3)?.toIntOrNull() ?: 0
                val year = if (yy >= 50) 1900 + yy else 2000 + yy
                dateOfBirth = String.format("%04d-%02d-%02d", year, mm, dd)
            }
        }
        if (passportNumber == null) {
            // Passport numbers often: 2 digits + 2 letters + 5 digits (e.g. 18FF02769)
            val docPattern = Pattern.compile("([0-9]{2}[A-Z]{2}[0-9]{5})")
            val docMatch = docPattern.matcher(text)
            if (docMatch.find()) {
                passportNumber = docMatch.group(1)
            }
        }

        // Parse line 1: P<Country SURNAME<<GIVENNAMES (<< may be read as 1<, <1, 11, 1l, or double space)
        val nameSeparators = listOf("<<", "1<", "<1", "11", "1l", "l1", "<l", "l<", "  ")
        for (sep in nameSeparators) {
                val sepEscaped = when (sep) {
                "  " -> "\\s{2,}"
                else -> Pattern.quote(sep)
            }
            val mrzPatterns = listOf(
                Pattern.compile("P[<1l|]([A-Z0-9]{3})([A-Z0-9]+)$sepEscaped([A-Z0-9<\\s]+)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("P[<1l|][A-Z0-9]{3}([A-Z]+)$sepEscaped([A-Z<]+)", Pattern.CASE_INSENSITIVE),
                Pattern.compile("([A-Z]{2,})$sepEscaped([A-Z<\\s]+)", Pattern.CASE_INSENSITIVE)
            )
            for (p in mrzPatterns) {
                val matcher = p.matcher(text)
                if (matcher.find()) {
                    val surname = matcher.group(1)?.replace("<", "")?.replace(Regex("[0-9]"), "")?.trim() ?: ""
                    val givenNames = matcher.group(2)?.replace("<", " ")?.replace(Regex("\\s+"), " ")?.trim() ?: ""
                    val firstName = givenNames.split(" ").filter { it.isNotBlank() }.joinToString(" ")
                    if (surname.length >= 2 && surname.all { it.isLetter() }) {
                        val passportInfo = PassportInfo(
                            firstName = firstName.ifBlank { "" },
                            lastName = surname,
                            dateOfBirth = dateOfBirth,
                            passportNumber = passportNumber
                        )
                        return DetectionResult(
                            DocumentType.PASSPORT,
                            "Passport_${sanitizeFileName(surname)}",
                            passportInfo
                        )
                    }
                }
            }
        }

        // Simpler: look for SURNAME<<GIVEN pattern anywhere (flexible sep)
        val simpleNamePattern = Pattern.compile("([A-Z]{3,})[<1l|]{1,2}([A-Z]{2,}[A-Z<\\s]*)", Pattern.CASE_INSENSITIVE)
        val simpleMatch = simpleNamePattern.matcher(text)
        val hasPassportPrefix = text.contains("P<") || text.contains("P1") || text.contains("Pl")
        if (simpleMatch.find() && hasPassportPrefix) {
            val surname = simpleMatch.group(1)?.replace("<", "")?.trim() ?: ""
            val givenNames = simpleMatch.group(2)?.replace("<", " ")?.replace(Regex("\\s+"), " ")?.trim() ?: ""
            if (surname.length >= 2 && !surname.any { it.isDigit() }) {
                val passportInfo = PassportInfo(
                    firstName = givenNames.split(" ").filter { it.isNotBlank() }.joinToString(" "),
                    lastName = surname,
                    dateOfBirth = dateOfBirth,
                    passportNumber = passportNumber
                )
                return DetectionResult(DocumentType.PASSPORT, "Passport_${sanitizeFileName(surname)}", passportInfo)
            }
        }

        // Last resort: look for NAME NAME pattern (SURNAME GIVENNAMES) near passport context
        if (hasPassportPrefix && (passportNumber != null || dateOfBirth != null)) {
            val namePattern = Pattern.compile("([A-Z]{4,})\\s+([A-Z]{2,}[A-Z\\s]*)", Pattern.CASE_INSENSITIVE)
            val nameMatch = namePattern.matcher(text)
            if (nameMatch.find()) {
                val surname = nameMatch.group(1)?.trim() ?: ""
                val givenNames = nameMatch.group(2)?.replace(Regex("\\s+"), " ")?.trim() ?: ""
                if (surname.length >= 2 && !surname.any { it.isDigit() }) {
                    val passportInfo = PassportInfo(
                        firstName = givenNames,
                        lastName = surname,
                        dateOfBirth = dateOfBirth,
                        passportNumber = passportNumber
                    )
                    return DetectionResult(DocumentType.PASSPORT, "Passport_${sanitizeFileName(surname)}", passportInfo)
                }
            }
        }

        return null
    }

    /**
     * Merges Gemini (primary) with text parser (validation) results.
     * Strategy:
     * - Gemini is PRIMARY for all fields (it sees the actual image, not fragile OCR text)
     * - Text parser data fills gaps where Gemini returned null
     * - For names: prefer Gemini (direct visual reading avoids OCR column-merging bugs)
     * - For DOB/passport number: use Gemini, but if parser has MRZ data, cross-validate
     * - For nationality: prefer Gemini (returns proper English demonym like "Liberian")
     */
    private fun mergeGeminiWithParser(gemini: PassportInfo, parser: PassportInfo): PassportInfo {
        val firstName = gemini.firstName.takeIf { it.isNotBlank() && !looksLikeCountryOrLabel(it) }
            ?: parser.firstName.takeIf { it.isNotBlank() && !looksLikeCountryOrLabel(it) }
            ?: gemini.firstName

        val lastName = gemini.lastName.takeIf { it.isNotBlank() && !looksLikeCountryOrLabel(it) }
            ?: parser.lastName.takeIf { it.isNotBlank() && !looksLikeCountryOrLabel(it) }
            ?: gemini.lastName

        val dateOfBirth = gemini.dateOfBirth?.takeIf { it.isNotBlank() && looksLikeValidDate(it) }
            ?: parser.dateOfBirth?.takeIf { it.isNotBlank() && looksLikeValidDate(it) }

        val passportNumber = gemini.passportNumber?.takeIf { it.isNotBlank() }
            ?: parser.passportNumber?.takeIf { it.isNotBlank() }

        val nationality = gemini.nationality?.takeIf { it.isNotBlank() }
            ?: parser.nationality?.takeIf { it.isNotBlank() }

        return PassportInfo(
            firstName = firstName,
            lastName = lastName,
            dateOfBirth = dateOfBirth,
            passportNumber = passportNumber,
            nationality = nationality
        )
    }

    /**
     * Detects values that are NOT actual names but country names, labels, or noise.
     */
    private fun looksLikeCountryOrLabel(value: String): Boolean {
        val lower = value.lowercase().trim()
        val rejectPatterns = listOf(
            "republic", "republique", "kingdom", "state of", "united",
            "passport", "passeport", "reisepass", "pasaporte",
            "surname", "given name", "prénoms", "prenoms", "nom",
            "nationality", "nationalité", "date of", "place of",
            "authority", "sex", "gender", "type", "code"
        )
        return rejectPatterns.any { lower.contains(it) }
    }

    /**
     * Validates that a date string looks like a properly formatted YYYY-MM-DD date.
     */
    private fun looksLikeValidDate(date: String): Boolean {
        val match = Regex("(\\d{4})-(\\d{2})-(\\d{2})").matchEntire(date) ?: return false
        val year = match.groupValues[1].toIntOrNull() ?: return false
        val month = match.groupValues[2].toIntOrNull() ?: return false
        val day = match.groupValues[3].toIntOrNull() ?: return false
        return year in 1900..2100 && month in 1..12 && day in 1..31
    }

    /** Extracts family name (last word) from full name e.g. "Florent Grégoire Poulolo" -> "Poulolo" */
    private fun extractFamilyName(fullName: String?): String? {
        val name = fullName?.trim() ?: return null
        val parts = name.split(Regex("\\s+")).filter { it.isNotBlank() }
        return parts.lastOrNull()?.let { sanitizeFileName(it) }
    }

    private fun sanitizeFileName(name: String): String {
        val withoutExt = name.substringBeforeLast(".")
        // Normalize accents (é->e, ü->u, etc.) for clean filenames
        val normalized = Normalizer.normalize(withoutExt, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}"), "")
        return normalized
            .replace(Regex("[^a-zA-Z0-9_\\-\\s]"), "")
            .replace(Regex("\\s+"), "_")
            .take(50)
            .ifBlank { "document" }
    }
}
