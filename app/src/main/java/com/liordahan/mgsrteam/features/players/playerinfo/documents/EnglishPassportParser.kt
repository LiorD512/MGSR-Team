package com.liordahan.mgsrteam.features.players.playerinfo.documents

import java.text.Normalizer

/**
 * Passport visual zone parser supporting bilingual labels from 40+ countries.
 * ICAO 9303 requires all passports to have English labels, but many also have local language.
 * Handles:
 * - Bilingual labels: "Surname / Nom", "Given Names / Prénoms"
 * - Multi-column OCR: "Nationality / Nationalité Date of Birth / Date de naissance" merged on one line
 * - OCR misreads: "Sumame", "Giver Namas", "Surnme"
 * - Value on same line as label: "Surname BANGOURA"
 * - Value on next line: label on line N, value on line N+1
 * - Date formats: DD/MM/YYYY, DD.MM.YYYY, DD MMM YY, DD MMM YYYY, YYYY-MM-DD
 */
object EnglishPassportParser {

    data class PassportData(
        val firstName: String?,
        val lastName: String?,
        val dateOfBirth: String?,
        val passportNumber: String?,
        val nationality: String? = null
    )

    // Comprehensive label lists covering 40+ countries + common OCR misreads
    private val SURNAME_LABELS = listOf(
        "surname", "sumame", "surnme", "surne", "family name", "last name",
        "nom de famille", "apellido", "apellidos", "cognome", "familienname",
        "nachname", "sobrenome", "apelido", "soyadı", "soyadi",
        "фамилия", "familjenamn", "efternavn", "sukunimi", "achternaam"
    )
    private val GIVEN_NAMES_LABELS = listOf(
        "given names", "giver namas", "giver names", "given name",
        "first name", "first names", "other names",
        "prénoms", "prenoms", "prénom", "prenom",
        "nombre", "nombres", "nome", "nomi", "vornamen", "vorname",
        "adı", "adi", "имя", "förnamn", "fornavn", "etunimi", "voornamen"
    )
    private val PASSPORT_NO_LABELS = listOf(
        "passport no", "passport no.", "passport number", "document no", "document no.",
        "document number", "n° de passeport", "n° du document", "no du document",
        "numéro", "numero", "passport n", "passnummer", "reisepassnr",
        "numero di passaporto", "número de pasaporte", "pasaport no",
        "номер паспорта", "n°", "no."
    )
    private val DOB_LABELS = listOf(
        "date of birth", "birth date", "dob", "born",
        "date de naissance", "naissance",
        "geburtsdatum", "data di nascita", "fecha de nacimiento",
        "doğum tarihi", "dogum tarihi", "дата рождения",
        "geboortedatum", "födelsedatum", "fødselsdato", "syntymäaika"
    )
    private val NATIONALITY_LABELS = listOf(
        "nationality", "nationalité", "nationalite", "nationaliteit",
        "nacionalidad", "nazionalità", "nazionalita", "nationalität", "nationalitat",
        "staatsangehörigkeit", "staatsangehorigkeit", "uyruk",
        "гражданство", "nationalitet", "kansalaisuus", "cidadania", "nacionalidade"
    )

    // Reject patterns: lines that are labels or country headers (never actual values)
    private val REJECT_PATTERNS = listOf(
        "surname", "nom", "given name", "prénoms", "prenoms", "prénom",
        "passport no", "passport number", "document no", "n°", "numéro",
        "date of birth", "date de naissance", "naissance",
        "country code", "code du pays", "code pays",
        "place of birth", "lieu de naissance",
        "nationality", "nationalité", "nationalite",
        "personal", "personnel", "personnell",
        "sex", "sexe", "gender", "geschlecht",
        "authority", "autorité", "autorite",
        "expiry", "expires", "valid", "validez",
        "date of issue", "date de délivrance",
        "date of expiry", "date d'expiration",
        "republic", "republique", "república",
        "kingdom", "united", "state of",
        "passport", "passeport", "reisepass", "pasaporte",
        "ecowas", "cedeao", "community",
        "type / type", "type/type"
    )

    private fun isLabelOrNoise(s: String): Boolean {
        val lower = s.lowercase().trim()
        if (lower.length < 2) return true
        return REJECT_PATTERNS.any { lower.contains(it) }
    }

    /**
     * Extract value after a label on the same line.
     * Handles bilingual: "Surname / Nom ERNEST" → finds last label, takes text after it.
     * Handles separator: strips "/", ":", ".", "-" between label and value.
     */
    private fun extractValueAfterLabel(line: String, labels: List<String>): String? {
        val lower = line.lowercase()
        var bestAfter: String? = null
        var bestIdx = -1
        for (label in labels) {
            val idx = lower.indexOf(label)
            if (idx >= 0 && idx + label.length > bestIdx) {
                bestIdx = idx + label.length
                val after = line.substring(bestIdx).trim()
                    .replace(Regex("^[\\s:.!\\-/]+"), "").trim()
                if (after.length >= 2 && !isLabelOrNoise(after)) {
                    bestAfter = sanitize(after)
                }
            }
        }
        return bestAfter
    }

    /**
     * Splits a line that may contain multiple fields from different columns.
     * E.g. "Nationality / Nationalité Date of Birth / Date de naissance"
     * Returns the part relevant to the first matching label set.
     */
    private fun extractFieldSegment(line: String, targetLabels: List<String>, allLabelSets: List<List<String>>): String? {
        val lower = line.lowercase()
        val targetStart = targetLabels.mapNotNull { label ->
            val idx = lower.indexOf(label)
            if (idx >= 0) idx else null
        }.minOrNull() ?: return null

        // Find where the NEXT field starts (any label from other label sets)
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

    fun parse(ocrText: String): PassportData? {
        val lines = ocrText.split(Regex("\\s*\n\\s*")).map { it.trim() }.filter { it.isNotBlank() }
        if (lines.size < 2) return null

        val allLabelSets = listOf(SURNAME_LABELS, GIVEN_NAMES_LABELS, PASSPORT_NO_LABELS, DOB_LABELS, NATIONALITY_LABELS)

        var firstName: String? = null
        var lastName: String? = null
        var dateOfBirth: String? = null
        var passportNumber: String? = null
        var nationality: String? = null

        for (i in lines.indices) {
            val line = lines[i]
            val lower = line.lowercase()

            // ── SURNAME ──
            val hasSurnameLabel = SURNAME_LABELS.any { lower.contains(it) }
            val hasGivenLabel = GIVEN_NAMES_LABELS.any { lower.contains(it) }
            if (hasSurnameLabel && !hasGivenLabel && lastName == null) {
                // Try same line: "Surname / Nom ERNEST"
                lastName = extractValueAfterLabel(line, SURNAME_LABELS)
                // Try next line
                if (lastName == null) {
                    val nextLine = lines.getOrNull(i + 1)
                    if (nextLine != null && looksLikeName(nextLine) && !isLabelOrNoise(nextLine)) {
                        lastName = sanitize(nextLine)
                    }
                }
            }

            // ── GIVEN NAMES ──
            if (hasGivenLabel && firstName == null) {
                // Next line first (most common layout)
                val nextLine = lines.getOrNull(i + 1)
                if (nextLine != null && !isLabelOrNoise(nextLine) && looksLikeName(nextLine)) {
                    firstName = sanitize(nextLine)
                } else {
                    firstName = extractValueAfterLabel(line, GIVEN_NAMES_LABELS)
                }
            }

            // ── PASSPORT NUMBER ──
            if (PASSPORT_NO_LABELS.any { lower.contains(it) } && passportNumber == null) {
                // Try next line
                passportNumber = lines.getOrNull(i + 1)
                    ?.takeIf { looksLikePassportNumber(it) }?.let { extractPassportNo(it) }
                // Try same line
                if (passportNumber == null) {
                    val segment = extractFieldSegment(line, PASSPORT_NO_LABELS, allLabelSets)
                    if (segment != null) {
                        val afterLabel = extractValueAfterLabel(segment, PASSPORT_NO_LABELS)
                        if (afterLabel != null && looksLikePassportNumber(afterLabel)) {
                            passportNumber = extractPassportNo(afterLabel)
                        }
                    }
                }
            }

            // ── DATE OF BIRTH ──
            if (DOB_LABELS.any { lower.contains(it) } && !lower.contains("place of birth")
                && !lower.contains("lieu de naissance") && dateOfBirth == null) {
                // Try next line
                dateOfBirth = lines.getOrNull(i + 1)?.takeIf { looksLikeDate(it) }?.let { normalizeDate(it) }
                // Try same line (handles multi-column merge)
                if (dateOfBirth == null) {
                    val segment = extractFieldSegment(line, DOB_LABELS, allLabelSets)
                    if (segment != null) {
                        val afterLabel = extractValueAfterLabel(segment, DOB_LABELS)
                        if (afterLabel != null && looksLikeDate(afterLabel)) {
                            dateOfBirth = normalizeDate(afterLabel)
                        }
                    }
                }
            }

            // ── NATIONALITY ──
            if (NATIONALITY_LABELS.any { lower.contains(it) } && nationality == null) {
                // Try same line: "Nationality / Nationalité LIBERIAN"
                val segment = extractFieldSegment(line, NATIONALITY_LABELS, allLabelSets)
                if (segment != null) {
                    nationality = extractValueAfterLabel(segment, NATIONALITY_LABELS)
                        ?.takeIf { looksLikeNationality(it) }
                }
                // Try next line
                if (nationality == null) {
                    val nextLine = lines.getOrNull(i + 1)
                    if (nextLine != null && looksLikeNationality(nextLine) && !isLabelOrNoise(nextLine)) {
                        nationality = sanitize(nextLine)
                    }
                }
            }
        }

        if (firstName == null && lastName == null && passportNumber == null) return null
        return PassportData(firstName, lastName, dateOfBirth, passportNumber, nationality)
    }

    private fun looksLikeName(s: String): Boolean {
        if (s.length < 2 || s.length > 60) return false
        val letters = s.count { it.isLetter() }
        return letters >= s.length * 2 / 3 && !s.any { it.isDigit() }
    }

    private fun looksLikeNationality(s: String): Boolean {
        val cleaned = s.trim()
        if (cleaned.length < 3 || cleaned.length > 50) return false
        return cleaned.count { it.isLetter() || it == ' ' || it == '-' } >= cleaned.length * 2 / 3
    }

    private fun looksLikePassportNumber(s: String): Boolean {
        val cleaned = s.replace(Regex("\\s"), "")
        return cleaned.length in 5..15 &&
            cleaned.any { it.isDigit() } &&
            cleaned.all { it.isLetterOrDigit() }
    }

    private fun extractPassportNo(s: String): String =
        s.replace(Regex("\\s"), "").filter { it.isLetterOrDigit() }.take(15)

    private fun looksLikeDate(s: String): Boolean =
        Regex("\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4}").containsMatchIn(s) ||
            MONTH_NAME_DATE_REGEX.containsMatchIn(s)

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

    private fun normalizeDate(s: String): String? {
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
