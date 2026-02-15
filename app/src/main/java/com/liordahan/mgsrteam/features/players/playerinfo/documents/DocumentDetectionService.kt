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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.File
import java.text.Normalizer
import java.util.regex.Pattern
import kotlin.coroutines.resume

private const val TAG = "DocumentDetection"

/**
 * Detects document type from image/PDF bytes using OCR.
 * Uses Google Cloud Vision API when configured (best accuracy, structured output with bounding boxes).
 * Falls back to ML Kit with structured block/line extraction.
 * Supports passport detection via MRZ (Machine Readable Zone) or "PASSPORT"/"PASSEPORT" text.
 * Logs all detected OCR elements and which field each was assigned to.
 */
class DocumentDetectionService(
    private val context: Context,
    private val cloudVisionOcr: CloudVisionOcrProvider?
) {

    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    /**
     * Extracted passport info from MRZ (Machine Readable Zone).
     */
    data class PassportInfo(
        val firstName: String,
        val lastName: String,
        val dateOfBirth: String?,
        val passportNumber: String?
    )

    /**
     * Result of document detection.
     * @param documentType Detected type (PASSPORT or OTHER)
     * @param suggestedName Suggested file name (e.g. "Passport_Poulolo")
     * @param passportInfo Extracted passport data when MRZ is parsed (null for non-passport or when parsing fails)
     */
    data class DetectionResult(
        val documentType: DocumentType,
        val suggestedName: String,
        val passportInfo: PassportInfo? = null
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
            // 1. Get OCR text - Cloud Vision (best) or ML Kit
            var text = if (isImageMimeType(mimeType) || mimeType.isNullOrBlank()) {
                cloudVisionOcr?.extractText(bytes) ?: ""
            } else ""

            if (text.length < 30) {
                text = when {
                    uri != null && (isImageMimeType(mimeType) || mimeType.isNullOrBlank()) ->
                        runOcrFromUri(uri) ?: runOcrFromBytes(bytes, mimeType)
                    isPdfMimeType(mimeType) -> {
                        val bitmap = extractFirstPageAsBitmap(bytes)
                        bitmap?.let { b -> runOcr(b, 0).also { b.recycle() } } ?: ""
                    }
                    else -> runOcrFromBytes(bytes, mimeType)
                }
            }

            // 2. Try rotated versions if little text (passport may be sideways)
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

            // 3. Parse: MRZ first (most reliable), then English-only visual parser
            parseForPassport(text, originalFileName, playerName)
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

    private fun extractFirstPageAsBitmap(bytes: ByteArray): Bitmap? {
        val tempFile = File.createTempFile("doc_", ".pdf")
        try {
            tempFile.writeBytes(bytes)
            val pfd = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY)
            val renderer = PdfRenderer(pfd)
            val page = renderer.openPage(0)
            val bitmap = Bitmap.createBitmap(
                page.width * 2, // Scale for better OCR
                page.height * 2,
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

        // 2. English-only visual parser (ICAO: all passports have English labels)
        val englishResult = EnglishPassportParser.parse(ocrText)

        // Merge: prefer MRZ (most reliable), use English visual for missing fields only
        val firstName = mrzResult?.firstName?.takeIf { it.isNotBlank() }
            ?: englishResult?.firstName?.takeIf { it.isNotBlank() }
        val lastName = mrzResult?.lastName?.takeIf { it.isNotBlank() }
            ?: englishResult?.lastName?.takeIf { it.isNotBlank() }
        val passportNumber = mrzResult?.documentNumber?.takeIf { it.isNotBlank() }
            ?: englishResult?.passportNumber?.takeIf { it.isNotBlank() }
        val dateOfBirth = mrzResult?.dateOfBirthFormatted?.takeIf { it.isNotBlank() }
            ?: englishResult?.dateOfBirth?.takeIf { it.isNotBlank() }

        if (lastName != null) {
            return DetectionResult(
                DocumentType.PASSPORT,
                "Passport_${sanitizeFileName(lastName)}",
                PassportInfo(
                    firstName = firstName ?: "",
                    lastName = lastName,
                    dateOfBirth = dateOfBirth,
                    passportNumber = passportNumber
                )
            )
        }

        // 2. Fall back to MRZ-only if visual zone didn't find surname
        MrzParser.parse(ocrText)?.let { mrz ->
            return DetectionResult(
                DocumentType.PASSPORT,
                "Passport_${sanitizeFileName(mrz.lastName)}",
                PassportInfo(
                    firstName = mrz.firstName,
                    lastName = mrz.lastName,
                    dateOfBirth = mrz.dateOfBirthFormatted,
                    passportNumber = mrz.documentNumber
                )
            )
        }

        // 3. Try with line structure - MRZ lines are ~44 chars
        val lines = ocrText.split(Regex("\\s*\n\\s*")).map { normalizeForMrz(it) }.filter { it.length >= 30 }
        val mrzCandidates = listOf(normalizedText) + lines + lines.joinToString("")

        for (textToParse in mrzCandidates.distinct()) {
            MrzParser.parse(textToParse)?.let { mrz ->
                return DetectionResult(
                    DocumentType.PASSPORT,
                    "Passport_${sanitizeFileName(mrz.lastName)}",
                    PassportInfo(
                        firstName = mrz.firstName,
                        lastName = mrz.lastName,
                        dateOfBirth = mrz.dateOfBirthFormatted,
                        passportNumber = mrz.documentNumber
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
        // Allow O for 0 in passport number; OCR may misread characters
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
                val docNum = m.group(1)?.replace("<", "")?.replace("O", "0")?.trim()
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
