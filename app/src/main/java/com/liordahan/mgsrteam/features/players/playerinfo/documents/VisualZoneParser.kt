package com.liordahan.mgsrteam.features.players.playerinfo.documents

import java.text.Normalizer

/**
 * Extracts passport fields from the visual zone (labeled fields) rather than MRZ.
 * Passport layout: Surname under "Surname"/"Nom", Passport no under "Passport no"/"N°" in top right.
 */
object VisualZoneParser {

    data class VisualZoneResult(
        val firstName: String?,
        val lastName: String?,
        val dateOfBirth: String?,
        val passportNumber: String?
    )

    // Labels in multiple languages (French, English, etc.)
    private val SURNAME_LABELS = listOf(
        "surname", "nom", "family name", "last name", "nom de famille", "apellido", "cognome"
    )
    private val GIVEN_NAMES_LABELS = listOf(
        "given names", "prénoms", "first name", "first names", "prenoms", "prénom", "nombres", "nombre"
    )
    private val PASSPORT_NO_LABELS = listOf(
        "passport no", "passport no.", "passport number", "n° du document", "document no",
        "no du document", "document number", "numéro", "numero", "passport n", "n° ",
        "no. "
    )
    private val DOB_LABELS = listOf(
        "date of birth", "date de naissance", "birth date", "dob", "naissance", "born"
    )

    fun parse(ocrText: String): VisualZoneResult? {
        val lines = ocrText.split(Regex("\\s*\n\\s*")).map { it.trim() }.filter { it.isNotBlank() }
        if (lines.size < 3) return null

        var firstName: String? = null
        var lastName: String? = null
        var dateOfBirth: String? = null
        var passportNumber: String? = null

        for (i in lines.indices) {
            val line = lines[i]
            val lineLower = line.lowercase()

            // Surname: value is UNDER "Surname"/"Nom" (next line). Exclude "nom" inside "prénoms"/"nombre"
            val isSurnameLabel = SURNAME_LABELS.any { lineLower.contains(it) } &&
                !GIVEN_NAMES_LABELS.any { lineLower.contains(it) }
            if (isSurnameLabel) {
                // Prefer next line (value under label); fallback to value on same line after label
                lastName = lines.getOrNull(i + 1)?.takeIf { looksLikeName(it) }
                    ?: extractValueAfterLabel(line, lineLower, SURNAME_LABELS)
            }

            // Given names: "Prénoms" or "Given names" - value under label
            if (GIVEN_NAMES_LABELS.any { lineLower.contains(it) }) {
                firstName = lines.getOrNull(i + 1)?.takeIf { it.isNotBlank() }
                    ?: extractValueAfterLabel(line, lineLower, GIVEN_NAMES_LABELS)
            }

            // Passport number: value is UNDER "Passport no" in top right. Only use when we find the label.
            val isPassportNoLabel = PASSPORT_NO_LABELS.any { lineLower.contains(it) }
            if (isPassportNoLabel) {
                passportNumber = lines.getOrNull(i + 1)?.takeIf { looksLikePassportNumber(it) }
                    ?: extractValueAfterLabel(line, lineLower, PASSPORT_NO_LABELS)
                    ?: line.takeIf { looksLikePassportNumber(it) }?.let { extractPassportNumber(it) }
            }

            // Date of birth
            if (DOB_LABELS.any { lineLower.contains(it) }) {
                dateOfBirth = extractValueAfterLabel(line, lineLower, DOB_LABELS)
                    ?: lines.getOrNull(i + 1)?.takeIf { looksLikeDate(it) }
                dateOfBirth = dateOfBirth?.let { normalizeDate(it) }
            }
        }

        // Surname fallback: line with just uppercase name when previous line is "Surname"/"Nom"
        if (lastName == null) {
            for (i in 1 until lines.size) {
                val line = lines[i]
                val prevLine = lines[i - 1].lowercase()
                if (looksLikeSurname(line) && SURNAME_LABELS.any { prevLine.contains(it) } &&
                    !GIVEN_NAMES_LABELS.any { prevLine.contains(it) }) {
                    lastName = sanitizeName(line)
                    break
                }
            }
        }

        if (firstName == null && lastName == null && passportNumber == null) return null

        return VisualZoneResult(
            firstName = firstName?.let { sanitizeName(it) },
            lastName = lastName?.let { sanitizeName(it) },
            dateOfBirth = dateOfBirth,
            passportNumber = passportNumber
        )
    }

    private fun extractValueAfterLabel(line: String, lineLower: String, labels: List<String>): String? {
        for (label in labels) {
            val idx = lineLower.indexOf(label)
            if (idx >= 0) {
                var afterLabel = line.substring(idx + label.length).trim()
                // Remove common separators : - . / 
                afterLabel = afterLabel.replace(Regex("^[\\s:.-/]+"), "").trim()
                // If value contains multiple words (e.g. "Florent Grégoire"), take it
                if (afterLabel.isNotBlank() && afterLabel.length > 1) {
                    // Don't take if it's another label
                    if (!SURNAME_LABELS.any { afterLabel.lowercase().startsWith(it) } &&
                        !GIVEN_NAMES_LABELS.any { afterLabel.lowercase().startsWith(it) }) {
                        return afterLabel
                    }
                }
            }
        }
        return null
    }

    private fun looksLikeName(s: String): Boolean {
        if (s.length < 2 || s.length > 80) return false
        // Names are mostly letters, may have spaces, hyphens, accents
        val cleaned = s.replace(Regex("[^a-zA-Z\\s'-]"), "")
        return cleaned.length >= s.length * 2 / 3
    }

    private fun looksLikeSurname(s: String): Boolean {
        if (s.length !in 2..40) return false
        // Surname is typically all caps in passport
        return s.all { it.isLetter() || it == '-' || it == ' ' } && s.any { it.isUpperCase() }
    }

    private fun looksLikePassportNumber(s: String): Boolean {
        val cleaned = s.replace(Regex("\\s"), "")
        // Format: often 2 digits + 2 letters + 5 digits (e.g. 18FF02769) or similar
        return cleaned.length in 6..12 &&
            cleaned.any { it.isLetter() } &&
            cleaned.any { it.isDigit() } &&
            cleaned.all { it.isLetterOrDigit() }
    }

    private fun extractPassportNumber(s: String): String {
        return s.replace(Regex("\\s"), "").filter { it.isLetterOrDigit() }.take(15)
    }

    private fun looksLikeDate(s: String): Boolean {
        // DD/MM/YYYY or DD.MM.YYYY or YYYY-MM-DD
        return Regex("\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4}").containsMatchIn(s) ||
            Regex("\\d{2}[./-]\\d{2}[./-]\\d{2,4}").containsMatchIn(s)
    }

    private fun normalizeDate(s: String): String {
        val match = Regex("(\\d{1,4})[./-](\\d{1,2})[./-](\\d{1,4})").find(s) ?: return s
        val (p1, p2, p3) = match.destructured
        return when {
            p1.length == 4 -> "$p1-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}"  // YYYY-MM-DD
            p3.length == 4 -> "$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"  // DD/MM/YYYY
            else -> "20$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"  // DD/MM/YY
        }
    }

    private fun sanitizeName(s: String): String {
        return Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}
