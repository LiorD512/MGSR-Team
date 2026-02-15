package com.liordahan.mgsrteam.features.players.playerinfo.documents

import java.text.Normalizer

/**
 * English-only passport parser. ICAO 9303: all passports have English labels.
 * Handles OCR variations (Sumame, Giver Namas) and extracts values from same line (Surname BANGOURA -> BANGOURA).
 */
object EnglishPassportParser {

    data class PassportData(
        val firstName: String?,
        val lastName: String?,
        val dateOfBirth: String?,
        val passportNumber: String?
    )

    // English labels only - with common OCR misreads (Sumame, Giver Namas, etc.)
    private val SURNAME_LABELS = listOf("surname", "sumame", "surnme", "surne", "family name", "last name")
    private val GIVEN_NAMES_LABELS = listOf("given names", "giver namas", "giver names", "given name", "first name", "first names")
    private val PASSPORT_NO_LABELS = listOf("passport no", "passport no.", "passport number", "document no")
    private val DOB_LABELS = listOf("date of birth", "birth date", "dob")

    /** Reject: lines that ARE labels (never use as value) */
    private fun isLabelLine(s: String): Boolean {
        val lower = s.lowercase()
        return SURNAME_LABELS.any { lower.contains(it) } ||
            GIVEN_NAMES_LABELS.any { lower.contains(it) } ||
            lower.contains("passport no") || lower.contains("date of birth") ||
            lower.contains("country code") || lower.contains("code du pays") ||
            lower.contains("place of birth") || lower.contains("nationality") ||
            lower.contains("personal") || lower.contains("personnel")
    }

    /**
     * Extract value from line like "! Sumame BANGOURA" or "Surname BANGOURA".
     * Returns "BANGOURA" - the part that looks like a name (not the label).
     */
    private fun extractValueAfterLabel(line: String, labels: List<String>): String? {
        val lower = line.lowercase()
        for (label in labels) {
            val idx = lower.indexOf(label)
            if (idx >= 0) {
                val after = line.substring(idx + label.length).trim()
                    .replace(Regex("^[\\s:.!\\-/]+"), "").trim()
                if (after.length >= 2 && looksLikeName(after) && !isLabelLine(after)) {
                    return sanitize(after)
                }
            }
        }
        return null
    }

    fun parse(ocrText: String): PassportData? {
        val lines = ocrText.split(Regex("\\s*\n\\s*")).map { it.trim() }.filter { it.isNotBlank() }
        if (lines.size < 2) return null

        var firstName: String? = null
        var lastName: String? = null
        var dateOfBirth: String? = null
        var passportNumber: String? = null

        for (i in lines.indices) {
            val line = lines[i]
            val lower = line.lowercase()

            // Surname: "Surname BANGOURA" -> BANGOURA, or next line
            if (SURNAME_LABELS.any { lower.contains(it) } && !GIVEN_NAMES_LABELS.any { lower.contains(it) }) {
                lastName = extractValueAfterLabel(line, SURNAME_LABELS)
                    ?: lines.getOrNull(i + 1)?.takeIf { looksLikeName(it) && !isLabelLine(it) }?.let { sanitize(it) }
            }

            // Given names: value on NEXT line only (label is never the value)
            if (GIVEN_NAMES_LABELS.any { lower.contains(it) }) {
                val nextLine = lines.getOrNull(i + 1)
                if (nextLine != null && !isLabelLine(nextLine) && looksLikeName(nextLine)) {
                    firstName = sanitize(nextLine)
                } else {
                    firstName = extractValueAfterLabel(line, GIVEN_NAMES_LABELS)
                }
            }

            // Passport no: next line must be alphanumeric (e.g. 18FF02769)
            if (PASSPORT_NO_LABELS.any { lower.contains(it) }) {
                passportNumber = lines.getOrNull(i + 1)?.takeIf { looksLikePassportNumber(it) }?.let { extractPassportNo(it) }
                    ?: extractValueAfterLabel(line, PASSPORT_NO_LABELS)?.takeIf { looksLikePassportNumber(it) }?.let { extractPassportNo(it) }
            }

            // Date of birth: next line must be a date
            if (DOB_LABELS.any { lower.contains(it) } && !lower.contains("place of birth")) {
                dateOfBirth = lines.getOrNull(i + 1)?.takeIf { looksLikeDate(it) }?.let { normalizeDate(it) }
                    ?: extractValueAfterLabel(line, DOB_LABELS)?.takeIf { looksLikeDate(it) }?.let { normalizeDate(it) }
            }
        }

        if (firstName == null && lastName == null && passportNumber == null) return null
        return PassportData(firstName, lastName, dateOfBirth, passportNumber)
    }

    private fun looksLikeName(s: String): Boolean {
        if (s.length < 2 || s.length > 60) return false
        val letters = s.count { it.isLetter() }
        return letters >= s.length * 2 / 3 && !s.any { it.isDigit() }
    }

    private fun looksLikePassportNumber(s: String): Boolean {
        val cleaned = s.replace(Regex("\\s"), "")
        return cleaned.length in 6..12 &&
            cleaned.any { it.isDigit() } &&
            cleaned.any { it.isLetter() } &&
            cleaned.all { it.isLetterOrDigit() }
    }

    private fun extractPassportNo(s: String): String =
        s.replace(Regex("\\s"), "").filter { it.isLetterOrDigit() }.take(15)

    private fun looksLikeDate(s: String): Boolean =
        Regex("\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4}").containsMatchIn(s)

    private fun normalizeDate(s: String): String? {
        val match = Regex("(\\d{1,4})[./-](\\d{1,2})[./-](\\d{1,4})").find(s) ?: return null
        val (p1, p2, p3) = match.destructured
        return when {
            p1.length == 4 -> "$p1-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}"
            p3.length == 4 -> "$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"
            else -> "20$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"
        }
    }

    private fun sanitize(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
}
