package com.liordahan.mgsrteam.features.players.playerinfo.documents

import java.text.Normalizer

/**
 * Extracts passport fields from the visual zone (labeled fields) rather than MRZ.
 * Handles bilingual labels (English/French, English/German, etc.) and multi-column OCR merges.
 * Passport layout: labels above values, sometimes side-by-side causing OCR to merge fields.
 */
object VisualZoneParser {

    data class VisualZoneResult(
        val firstName: String?,
        val lastName: String?,
        val dateOfBirth: String?,
        val passportNumber: String?
    )

    // Comprehensive multi-language labels covering 40+ countries
    private val SURNAME_LABELS = listOf(
        "surname", "nom", "family name", "last name", "nom de famille",
        "apellido", "apellidos", "cognome", "familienname", "nachname",
        "sobrenome", "apelido", "soyadı", "soyadi", "фамилия",
        "familjenamn", "efternavn", "sukunimi", "achternaam"
    )
    private val GIVEN_NAMES_LABELS = listOf(
        "given names", "prénoms", "first name", "first names", "prenoms",
        "prénom", "prenom", "nombres", "nombre", "nomi", "nome",
        "vornamen", "vorname", "adı", "adi", "имя",
        "förnamn", "fornavn", "etunimi", "voornamen", "other names"
    )
    private val PASSPORT_NO_LABELS = listOf(
        "passport no", "passport no.", "passport number", "n° de passeport",
        "n° du document", "document no", "document no.",
        "no du document", "document number", "numéro", "numero",
        "passport n", "n° ", "no. ", "passnummer", "reisepassnr",
        "numero di passaporto", "número de pasaporte", "pasaport no",
        "номер паспорта"
    )
    private val DOB_LABELS = listOf(
        "date of birth", "date de naissance", "birth date", "dob",
        "naissance", "born", "geburtsdatum", "data di nascita",
        "fecha de nacimiento", "doğum tarihi", "dogum tarihi",
        "дата рождения", "geboortedatum"
    )
    private val NATIONALITY_LABELS = listOf(
        "nationality", "nationalité", "nationalite", "nationaliteit",
        "nacionalidad", "nazionalità", "nazionalita", "nationalität",
        "nationalitat", "staatsangehörigkeit", "staatsangehorigkeit",
        "uyruk", "гражданство", "cidadania", "nacionalidade"
    )

    // Lines that are labels/headers and should NEVER be used as values
    private val REJECT_PATTERNS = listOf(
        "surname", "nom", "given name", "prénoms", "prenoms", "prénom",
        "passport no", "passport number", "document no", "n°", "numéro",
        "date of birth", "date de naissance", "naissance",
        "country code", "code du pays", "code pays",
        "place of birth", "lieu de naissance",
        "nationality", "nationalité", "nationalite",
        "personal", "personnel", "sex", "sexe", "gender",
        "authority", "autorité", "autorite",
        "expiry", "expires", "valid", "date of issue", "date de délivrance",
        "date of expiry", "date d'expiration",
        "republic", "republique", "república", "kingdom", "united", "state of",
        "passport", "passeport", "reisepass", "pasaporte",
        "ecowas", "cedeao", "community", "type / type", "type/type"
    )

    private fun isLabelOrNoise(s: String): Boolean {
        val lower = s.lowercase().trim()
        if (lower.length < 2) return true
        return REJECT_PATTERNS.any { lower.contains(it) }
    }

    fun parse(ocrText: String): VisualZoneResult? {
        val lines = ocrText.split(Regex("\\s*\n\\s*")).map { it.trim() }.filter { it.isNotBlank() }
        if (lines.size < 3) return null

        val allLabelSets = listOf(SURNAME_LABELS, GIVEN_NAMES_LABELS, PASSPORT_NO_LABELS, DOB_LABELS, NATIONALITY_LABELS)

        var firstName: String? = null
        var lastName: String? = null
        var dateOfBirth: String? = null
        var passportNumber: String? = null

        for (i in lines.indices) {
            val line = lines[i]
            val lineLower = line.lowercase()

            // ── SURNAME ──
            val isSurnameLabel = SURNAME_LABELS.any { lineLower.contains(it) } &&
                !GIVEN_NAMES_LABELS.any { lineLower.contains(it) }
            if (isSurnameLabel && lastName == null) {
                // Next line (value below label)
                lastName = lines.getOrNull(i + 1)?.takeIf { looksLikeName(it) && !isLabelOrNoise(it) }
                // Same line after label
                if (lastName == null) {
                    val segment = extractFieldSegment(line, SURNAME_LABELS, allLabelSets)
                    if (segment != null) {
                        lastName = extractValueAfterLabel(segment, segment.lowercase(), SURNAME_LABELS)
                    }
                }
            }

            // ── GIVEN NAMES ──
            if (GIVEN_NAMES_LABELS.any { lineLower.contains(it) } && firstName == null) {
                firstName = lines.getOrNull(i + 1)?.takeIf { it.isNotBlank() && looksLikeName(it) && !isLabelOrNoise(it) }
                if (firstName == null) {
                    val segment = extractFieldSegment(line, GIVEN_NAMES_LABELS, allLabelSets)
                    if (segment != null) {
                        firstName = extractValueAfterLabel(segment, segment.lowercase(), GIVEN_NAMES_LABELS)
                    }
                }
            }

            // ── PASSPORT NUMBER ──
            val isPassportNoLabel = PASSPORT_NO_LABELS.any { lineLower.contains(it) }
            if (isPassportNoLabel && passportNumber == null) {
                passportNumber = lines.getOrNull(i + 1)?.takeIf { looksLikePassportNumber(it) }
                if (passportNumber == null) {
                    val segment = extractFieldSegment(line, PASSPORT_NO_LABELS, allLabelSets)
                    if (segment != null) {
                        val afterLabel = extractValueAfterLabel(segment, segment.lowercase(), PASSPORT_NO_LABELS)
                        if (afterLabel != null && looksLikePassportNumber(afterLabel)) {
                            passportNumber = afterLabel
                        }
                    }
                }
                if (passportNumber == null) {
                    passportNumber = line.takeIf { looksLikePassportNumber(it) }?.let { extractPassportNumber(it) }
                }
            }

            // ── DATE OF BIRTH ──
            if (DOB_LABELS.any { lineLower.contains(it) }
                && !lineLower.contains("place of birth") && !lineLower.contains("lieu de naissance")
                && dateOfBirth == null) {
                // Try same line first (handles "Date of Birth 30 DEC 00")
                val segment = extractFieldSegment(line, DOB_LABELS, allLabelSets)
                if (segment != null) {
                    val afterLabel = extractValueAfterLabel(segment, segment.lowercase(), DOB_LABELS)
                    if (afterLabel != null && looksLikeDate(afterLabel)) {
                        dateOfBirth = normalizeDate(afterLabel)
                    }
                }
                // Try next line
                if (dateOfBirth == null) {
                    dateOfBirth = lines.getOrNull(i + 1)?.takeIf { looksLikeDate(it) }?.let { normalizeDate(it) }
                }
            }
        }

        // Surname fallback: uppercase name line after a surname label line
        if (lastName == null) {
            for (i in 1 until lines.size) {
                val line = lines[i]
                val prevLine = lines[i - 1].lowercase()
                if (looksLikeSurname(line) && SURNAME_LABELS.any { prevLine.contains(it) } &&
                    !GIVEN_NAMES_LABELS.any { prevLine.contains(it) } && !isLabelOrNoise(line)) {
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

    /**
     * Isolates the segment of a line belonging to a specific field when
     * multiple fields from different columns are merged on one line.
     */
    private fun extractFieldSegment(line: String, targetLabels: List<String>, allLabelSets: List<List<String>>): String? {
        val lower = line.lowercase()
        val targetStart = targetLabels.mapNotNull { label ->
            val idx = lower.indexOf(label)
            if (idx >= 0) idx else null
        }.minOrNull() ?: return null

        val nextFieldStart = allLabelSets
            .filter { it !== targetLabels }
            .flatMap { labels -> labels.mapNotNull { label ->
                val idx = lower.indexOf(label, targetStart + 1)
                if (idx > targetStart) idx else null
            }}
            .minOrNull()

        val segment = if (nextFieldStart != null) {
            line.substring(targetStart, nextFieldStart).trim()
        } else {
            line.substring(targetStart).trim()
        }
        return segment.takeIf { it.isNotBlank() }
    }

    private fun extractValueAfterLabel(line: String, lineLower: String, labels: List<String>): String? {
        var bestAfter: String? = null
        var bestIdx = -1
        for (label in labels) {
            val idx = lineLower.indexOf(label)
            if (idx >= 0 && idx + label.length > bestIdx) {
                bestIdx = idx + label.length
                var afterLabel = line.substring(bestIdx).trim()
                afterLabel = afterLabel.replace(Regex("^[\\s:.-/]+"), "").trim()
                if (afterLabel.isNotBlank() && afterLabel.length > 1 && !isLabelOrNoise(afterLabel)) {
                    bestAfter = afterLabel
                }
            }
        }
        return bestAfter
    }

    private fun looksLikeName(s: String): Boolean {
        if (s.length < 2 || s.length > 80) return false
        val cleaned = s.replace(Regex("[^a-zA-Z\\s'-]"), "")
        return cleaned.length >= s.length * 2 / 3
    }

    private fun looksLikeSurname(s: String): Boolean {
        if (s.length !in 2..40) return false
        return s.all { it.isLetter() || it == '-' || it == ' ' } && s.any { it.isUpperCase() }
    }

    private fun looksLikePassportNumber(s: String): Boolean {
        val cleaned = s.replace(Regex("\\s"), "")
        return cleaned.length in 5..15 &&
            cleaned.any { it.isDigit() } &&
            cleaned.all { it.isLetterOrDigit() }
    }

    private fun extractPassportNumber(s: String): String {
        return s.replace(Regex("\\s"), "").filter { it.isLetterOrDigit() }.take(15)
    }

    private val MONTH_NAMES = mapOf(
        "jan" to "01", "feb" to "02", "mar" to "03", "apr" to "04",
        "may" to "05", "jun" to "06", "jul" to "07", "aug" to "08",
        "sep" to "09", "oct" to "10", "nov" to "11", "dec" to "12",
        "janv" to "01", "fevr" to "02", "fev" to "02", "mars" to "03",
        "avr" to "04", "mai" to "05", "juin" to "06", "juil" to "07",
        "aout" to "08", "sept" to "09", "octobre" to "10", "novo" to "11", "dece" to "12"
    )
    private val MONTH_NAME_DATE_REGEX = Regex(
        "(\\d{1,2})\\s+([A-Za-z]{3,9})\\s+(\\d{2,4})", RegexOption.IGNORE_CASE
    )

    private fun looksLikeDate(s: String): Boolean {
        return Regex("\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4}").containsMatchIn(s) ||
            Regex("\\d{2}[./-]\\d{2}[./-]\\d{2,4}").containsMatchIn(s) ||
            MONTH_NAME_DATE_REGEX.containsMatchIn(s)
    }

    private fun normalizeDate(s: String): String {
        MONTH_NAME_DATE_REGEX.find(s)?.let { match ->
            val dd = match.groupValues[1].padStart(2, '0')
            val monthStr = match.groupValues[2].lowercase().take(4)
            val yearStr = match.groupValues[3]
            val mm = MONTH_NAMES.entries.find { monthStr.startsWith(it.key) }?.value
            if (mm != null) {
                val year = when {
                    yearStr.length == 4 -> yearStr
                    yearStr.toIntOrNull()?.let { it >= 50 } == true -> "19$yearStr"
                    else -> "20$yearStr"
                }
                return "$year-$mm-$dd"
            }
        }
        val match = Regex("(\\d{1,4})[./-](\\d{1,2})[./-](\\d{1,4})").find(s) ?: return s
        val (p1, p2, p3) = match.destructured
        return when {
            p1.length == 4 -> "$p1-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}"
            p3.length == 4 -> "$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"
            else -> "20$p3-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}"
        }
    }

    private fun sanitizeName(s: String): String {
        return Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}
