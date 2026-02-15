package com.liordahan.mgsrteam.features.players.playerinfo.documents

import android.util.Log
import java.text.Normalizer

/**
 * Extracts passport/document fields using spatial layout.
 * Uses bounding box positions to map labels (Surname, Passport no, etc.) to their values.
 * Values are typically on the line below or to the right of the label.
 */
object StructuredDocumentExtractor {

    private const val TAG = "DocFieldExtractor"

    data class ExtractedFields(
        val firstName: String?,
        val lastName: String?,
        val dateOfBirth: String?,
        val passportNumber: String?,
        val nationality: String?,
        val documentType: String?,
        val placeOfBirth: String?,
        val sex: String?,
        val expiryDate: String?,
        val issuingAuthority: String?,
        val rawFields: Map<String, String> // field name -> value, for logging
    )

    private val SURNAME_LABELS = listOf(
        "surname", "nom", "family name", "last name", "nom de famille", "apellido", "cognome", "nachname"
    )
    private val GIVEN_NAMES_LABELS = listOf(
        "given names", "prénoms", "first name", "first names", "prenoms", "prénom", "nombres", "nombre", "vorname"
    )
    private val PASSPORT_NO_LABELS = listOf(
        "passport no", "passport no.", "passport number", "n° du document", "document no",
        "no du document", "document number", "numéro", "numero", "passport n", "n° ", "no. "
    )
    // Must NOT match "place of birth" / "lieu de naissance" - use specific date-of-birth phrases only
    private val DOB_LABELS = listOf(
        "date of birth", "date de naissance", "birth date", "dob", "geburtsdatum"
    )
    private val NATIONALITY_LABELS = listOf(
        "nationality", "nationalité", "nationaliteit", "nacionalidad"
    )
    private val PLACE_OF_BIRTH_LABELS = listOf(
        "place of birth", "lieu de naissance", "birth place", "geburtsort"
    )
    private val SEX_LABELS = listOf("sex", "gender", "geschlecht", "sexe")
    private val EXPIRY_LABELS = listOf(
        "date of expiry", "date d'expiration", "expiry", "expires", "gültig bis", "validez"
    )
    private val ISSUING_LABELS = listOf(
        "authority", "authorité", "issuing", "ausstellende behörde"
    )
    private val DOC_TYPE_LABELS = listOf(
        "document type", "type de document", "p", "pm"
    )

    /** Rejects values that are labels or contain label-like text (e.g. "Prenoms", "Code du Pays") */
    private fun isLabelOrInvalidValue(value: String): Boolean {
        val lower = value.lowercase()
        val rejectPhrases = listOf(
            "surname", "nom", "prénoms", "prenoms", "given names", "first name", "family name",
            "passport no", "passport number", "document no", "document number", "numéro", "numero",
            "date of birth", "date de naissance", "place of birth", "lieu de naissance",
            "country code", "code du pays", "code pays", "nationality", "nationalité",
            "personal", "personnel", "personnell", "sex", "gender", "authority",
            "expiry", "expires", "valid", "validez", "gültig"
        )
        return rejectPhrases.any { lower.contains(it) }
    }

    /** Surname must be a line that IS the value (not a label). Exclude "nom" inside "prénoms". */
    private fun isSurnameLabelOnly(lineLower: String): Boolean {
        if (!SURNAME_LABELS.any { lineLower.contains(it) }) return false
        if (GIVEN_NAMES_LABELS.any { lineLower.contains(it) }) return false
        // "nom" alone or "surname" - not "prénoms" (which contains "nom")
        if (lineLower.contains("prénom") || lineLower.contains("prenom")) return false
        return true
    }

    /**
     * Extracts fields from OCR elements using spatial layout.
     * Logs every detected element and which field it was assigned to.
     */
    fun extract(ocrResult: OcrStructuredResult): ExtractedFields {
        val elements = ocrResult.elements
        Log.i(TAG, "[${ocrResult.source}] Document OCR: ${elements.size} text elements detected")

        // Log all raw elements
        elements.forEachIndexed { i, el ->
            Log.d(TAG, "  [$i] \"${el.text}\" @ (${el.minX},${el.minY})-(${el.maxX},${el.maxY})")
        }

        val rawFields = mutableMapOf<String, String>()
        var firstName: String? = null
        var lastName: String? = null
        var dateOfBirth: String? = null
        var passportNumber: String? = null
        var nationality: String? = null
        var documentType: String? = null
        var placeOfBirth: String? = null
        var sex: String? = null
        var expiryDate: String? = null
        var issuingAuthority: String? = null

        for (i in elements.indices) {
            val el = elements[i]
            val text = el.text.trim()
            val lower = text.lowercase()

            // Surname: value is below "Surname"/"Nom" - NEVER assign label lines as values
            if (isSurnameLabelOnly(lower)) {
                val value = elements.getOrNull(i + 1)?.text?.trim()
                    ?.takeIf { looksLikeName(it) && !isLabelOrInvalidValue(it) }
                    ?: extractValueAfterLabel(text, lower, SURNAME_LABELS)
                        ?.takeIf { !isLabelOrInvalidValue(it) }
                if (value != null) {
                    lastName = sanitizeName(value)
                    rawFields["lastName"] = lastName
                    Log.i(TAG, "  -> lastName (from Surname): \"$lastName\"")
                }
            }

            // Given names: value is below "Prénoms"/"Given names" - reject labels/country codes
            if (matchesLabel(lower, GIVEN_NAMES_LABELS)) {
                val value = elements.getOrNull(i + 1)?.text?.trim()
                    ?.takeIf { it.isNotBlank() && looksLikeName(it) && !isLabelOrInvalidValue(it) }
                    ?: extractValueAfterLabel(text, lower, GIVEN_NAMES_LABELS)
                        ?.takeIf { !isLabelOrInvalidValue(it) }
                if (value != null) {
                    firstName = sanitizeName(value)
                    rawFields["firstName"] = firstName
                    Log.i(TAG, "  -> firstName (from Given names): \"$firstName\"")
                }
            }

            // Passport number: value must be alphanumeric (e.g. 18FF02769) - reject "Personal" etc.
            if (matchesLabel(lower, PASSPORT_NO_LABELS)) {
                val value = elements.getOrNull(i + 1)?.text?.trim()
                    ?.takeIf { looksLikePassportNumber(it) }
                    ?: extractValueAfterLabel(text, lower, PASSPORT_NO_LABELS)
                        ?.takeIf { looksLikePassportNumber(it) }
                    ?: text.takeIf { looksLikePassportNumber(it) }?.let { it }
                if (value != null && looksLikePassportNumber(value)) {
                    passportNumber = extractPassportNumber(value)
                    rawFields["passportNumber"] = passportNumber
                    Log.i(TAG, "  -> passportNumber (from Passport no): \"$passportNumber\"")
                }
            }

            // Date of birth: MUST be a date format - reject "Place of Birth CONAKRY"
            if (matchesLabel(lower, DOB_LABELS) && !matchesLabel(lower, PLACE_OF_BIRTH_LABELS)) {
                val value = extractValueAfterLabel(text, lower, DOB_LABELS)
                    ?.takeIf { looksLikeDate(it) }
                    ?: elements.getOrNull(i + 1)?.text?.trim()
                        ?.takeIf { looksLikeDate(it) }
                if (value != null) {
                    dateOfBirth = normalizeDate(value)
                    rawFields["dateOfBirth"] = dateOfBirth
                    Log.i(TAG, "  -> dateOfBirth: \"$dateOfBirth\"")
                }
            }

            // Nationality
            if (matchesLabel(lower, NATIONALITY_LABELS)) {
                val value = elements.getOrNull(i + 1)?.text?.trim()
                    ?.takeIf { looksLikeName(it) && !isLabelOrInvalidValue(it) }
                    ?: extractValueAfterLabel(text, lower, NATIONALITY_LABELS)
                        ?.takeIf { !isLabelOrInvalidValue(it) }
                if (value != null) {
                    nationality = sanitizeName(value)
                    rawFields["nationality"] = nationality
                    Log.i(TAG, "  -> nationality: \"$nationality\"")
                }
            }

            // Place of birth
            if (matchesLabel(lower, PLACE_OF_BIRTH_LABELS)) {
                val value = elements.getOrNull(i + 1)?.text?.trim()
                    ?.takeIf { it.isNotBlank() && !isLabelOrInvalidValue(it) }
                    ?: extractValueAfterLabel(text, lower, PLACE_OF_BIRTH_LABELS)
                        ?.takeIf { !isLabelOrInvalidValue(it) }
                if (value != null) {
                    placeOfBirth = sanitizeName(value)
                    rawFields["placeOfBirth"] = placeOfBirth
                    Log.i(TAG, "  -> placeOfBirth: \"$placeOfBirth\"")
                }
            }

            // Sex
            if (matchesLabel(lower, SEX_LABELS)) {
                val value = elements.getOrNull(i + 1)?.text?.trim()
                    ?: extractValueAfterLabel(text, lower, SEX_LABELS)
                if (value != null && value.length in 1..10) {
                    sex = value
                    rawFields["sex"] = sex
                    Log.i(TAG, "  -> sex: \"$sex\"")
                }
            }

            // Expiry date
            if (matchesLabel(lower, EXPIRY_LABELS)) {
                val value = extractValueAfterLabel(text, lower, EXPIRY_LABELS)
                    ?: elements.getOrNull(i + 1)?.takeIf { looksLikeDate(it.text) }?.text?.trim()
                if (value != null) {
                    expiryDate = normalizeDate(value)
                    rawFields["expiryDate"] = expiryDate
                    Log.i(TAG, "  -> expiryDate: \"$expiryDate\"")
                }
            }

            // Issuing authority
            if (matchesLabel(lower, ISSUING_LABELS)) {
                val value = elements.getOrNull(i + 1)?.takeIf { it.text.isNotBlank() }?.text?.trim()
                    ?: extractValueAfterLabel(text, lower, ISSUING_LABELS)
                if (value != null) {
                    issuingAuthority = sanitizeName(value)
                    rawFields["issuingAuthority"] = issuingAuthority
                    Log.i(TAG, "  -> issuingAuthority: \"$issuingAuthority\"")
                }
            }

            // Document type (P, PM, etc.) - exclude lines that are just "document" label
            if (matchesLabel(lower, DOC_TYPE_LABELS) && text.length <= 5 && !lower.equals("document")) {
                val value = elements.getOrNull(i + 1)?.text?.trim()
                    ?.takeIf { it.length in 1..5 && !isLabelOrInvalidValue(it) }
                    ?: extractValueAfterLabel(text, lower, DOC_TYPE_LABELS)
                        ?.takeIf { it.length in 1..5 }
                if (value != null) {
                    documentType = value
                    rawFields["documentType"] = documentType
                    Log.i(TAG, "  -> documentType: \"$documentType\"")
                }
            }
        }

        // Spatial fallback: find value below label by bounding box
        if (lastName == null || passportNumber == null) {
            for (i in elements.indices) {
                val el = elements[i]
                val lower = el.text.lowercase()
                if (lastName == null && isSurnameLabelOnly(lower)) {
                    val below = elements.filterIndexed { j, e -> j > i && e.minY > el.maxY + 5 }
                        .minByOrNull { it.minY }
                    if (below != null && looksLikeName(below.text) && !isLabelOrInvalidValue(below.text)) {
                        lastName = sanitizeName(below.text)
                        rawFields["lastName"] = lastName
                        Log.i(TAG, "  -> lastName (spatial, below ${el.text}): \"$lastName\"")
                    }
                }
                if (passportNumber == null && matchesLabel(lower, PASSPORT_NO_LABELS)) {
                    val below = elements.filterIndexed { j, e -> j > i && e.minY > el.maxY + 5 }
                        .minByOrNull { it.minY }
                    if (below != null && looksLikePassportNumber(below.text)) {
                        passportNumber = extractPassportNumber(below.text)
                        rawFields["passportNumber"] = passportNumber
                        Log.i(TAG, "  -> passportNumber (spatial, below ${el.text}): \"$passportNumber\"")
                    }
                }
            }
        }

        Log.i(TAG, "[${ocrResult.source}] Extracted fields: $rawFields")
        return ExtractedFields(
            firstName = firstName,
            lastName = lastName,
            dateOfBirth = dateOfBirth,
            passportNumber = passportNumber,
            nationality = nationality,
            documentType = documentType,
            placeOfBirth = placeOfBirth,
            sex = sex,
            expiryDate = expiryDate,
            issuingAuthority = issuingAuthority,
            rawFields = rawFields
        )
    }

    private fun matchesLabel(text: String, labels: List<String>): Boolean =
        labels.any { text.contains(it) }

    private fun extractValueAfterLabel(line: String, lineLower: String, labels: List<String>): String? {
        for (label in labels) {
            val idx = lineLower.indexOf(label)
            if (idx >= 0) {
                var after = line.substring(idx + label.length).trim()
                after = after.replace(Regex("^[\\s:.-/]+"), "").trim()
                if (after.isNotBlank() && after.length > 1) {
                    if (!SURNAME_LABELS.any { after.lowercase().startsWith(it) } &&
                        !GIVEN_NAMES_LABELS.any { after.lowercase().startsWith(it) }) {
                        return after
                    }
                }
            }
        }
        return null
    }

    private fun looksLikeName(s: String): Boolean {
        if (s.length < 2 || s.length > 80) return false
        val cleaned = s.replace(Regex("[^a-zA-Z\\s'-]"), "")
        return cleaned.length >= s.length * 2 / 3
    }

    private fun looksLikePassportNumber(s: String): Boolean {
        val cleaned = s.replace(Regex("\\s"), "")
        return cleaned.length in 6..12 &&
            cleaned.any { it.isLetter() } &&
            cleaned.any { it.isDigit() } &&
            cleaned.all { it.isLetterOrDigit() }
    }

    private fun extractPassportNumber(s: String): String =
        s.replace(Regex("\\s"), "").filter { it.isLetterOrDigit() }.take(15)

    private fun looksLikeDate(s: String): Boolean =
        Regex("\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4}").containsMatchIn(s) ||
            Regex("\\d{2}[./-]\\d{2}[./-]\\d{2,4}").containsMatchIn(s)

    private fun normalizeDate(s: String): String {
        val match = Regex("(\\d{1,4})[./-](\\d{1,2})[./-](\\d{1,4})").find(s) ?: return s
        val (p1, p2, p3) = match.destructured
        return when {
            p1.length == 4 -> "$p1-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}"
            p3.length == 4 -> "$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"
            else -> "20$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"
        }
    }

    private fun sanitizeName(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
}
