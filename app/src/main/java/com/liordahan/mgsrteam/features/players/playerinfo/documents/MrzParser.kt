package com.liordahan.mgsrteam.features.players.playerinfo.documents

/**
 * TD3 (Passport) MRZ parser with check digit validation.
 * Format: Line 1 (44 chars) + Line 2 (44 chars) + Line 3 (44 chars)
 * TD3 uses lines 1 and 2 only.
 */
object MrzParser {

    private const val MRZ_LINE_LENGTH = 44
    private val WEIGHTS = intArrayOf(7, 3, 1)

    data class MrzResult(
        val documentNumber: String,
        val dateOfBirth: String,
        val expiryDate: String,
        val surname: String,
        val givenNames: String,
        val nationality: String
    ) {
        val firstName: String get() = givenNames.replace("<", " ").trim()
        val lastName: String get() = surname.replace("<", "").trim()
        val dateOfBirthFormatted: String
            get() = formatDate(dateOfBirth)
    }

    /**
     * Parses MRZ text. Tries strict parsing first (with check digits), then lenient.
     */
    fun parse(ocrText: String): MrzResult? {
        val lines = extractMrzLines(ocrText)
        for (linePair in lines) {
            parseTd3Lines(linePair.first, linePair.second, strict = true)?.let { return it }
        }
        for (linePair in lines) {
            for ((l1, l2) in tryOcrCorrections(linePair.first, linePair.second)) {
                parseTd3Lines(l1, l2, strict = true)?.let { return it }
            }
        }
        // Lenient: accept even with check digit failures (OCR often misreads)
        for (linePair in lines) {
            parseTd3Lines(linePair.first, linePair.second, strict = false)?.let { return it }
        }
        return null
    }

    private fun extractMrzLines(text: String): List<Pair<String, String>> {
        val result = mutableListOf<Pair<String, String>>()

        // Try 1: Preserve line structure from OCR (Cloud Vision returns structured text)
        val rawLines = text.split(Regex("\\s*\n\\s*")).map { it.uppercase().replace(Regex("\\s+"), "") }
        for (i in 0 until rawLines.size - 1) {
            val l1 = rawLines[i].take(MRZ_LINE_LENGTH).padEnd(MRZ_LINE_LENGTH, '<')
            val l2 = rawLines[i + 1].take(MRZ_LINE_LENGTH).padEnd(MRZ_LINE_LENGTH, '<')
            if (l1.startsWith("P") && l1.length >= 36 && l2.length >= 36) {
                result.add(l1 to l2)
            }
        }

        // Try 2: Normalized (no newlines)
        val normalized = text.uppercase().replace(Regex("\\s+"), "")
        val line1Pattern = Regex("(P[<1l|][A-Z0-9<]{35,})")
        val line2Pattern = Regex("([A-Z0-9<]{9}[A-Z0-9][A-Z]{3}[0-9<]{15,})")

        for (m1 in line1Pattern.findAll(normalized)) {
            val l1 = m1.value.take(MRZ_LINE_LENGTH).padEnd(MRZ_LINE_LENGTH, '<')
            for (m2 in line2Pattern.findAll(normalized)) {
                if (m2.range.first >= m1.range.first && m2.range.first <= m1.range.last + 60) {
                    val l2 = m2.value.take(MRZ_LINE_LENGTH).padEnd(MRZ_LINE_LENGTH, '<')
                    result.add(l1 to l2)
                }
            }
        }

        // Try 3: Sliding window - consecutive 44-char chunks
        for (i in 0..(normalized.length - MRZ_LINE_LENGTH * 2)) {
            val l1 = normalized.substring(i, i + MRZ_LINE_LENGTH)
            val l2 = normalized.substring(i + MRZ_LINE_LENGTH, (i + MRZ_LINE_LENGTH * 2).coerceAtMost(normalized.length))
            if (l1.startsWith("P") && l2.length >= 36) {
                result.add(l1 to l2.padEnd(MRZ_LINE_LENGTH, '<'))
            }
        }
        return result.distinct()
    }

    private fun parseTd3Lines(line1: String, line2: String, strict: Boolean = true): MrzResult? {
        if (line1.length < 36 || line2.length < 36) return null

        val l1 = line1.padEnd(MRZ_LINE_LENGTH, '<').take(MRZ_LINE_LENGTH)
        val l2 = line2.padEnd(MRZ_LINE_LENGTH, '<').take(MRZ_LINE_LENGTH)

        // Line 1: P<Country(3) + Name(39) = SURNAME<<GIVENNAMES (or SURNAME<GIVENNAMES)
        val namePart = l1.substring(5, 44).replace(' ', '<')
        val nameParts = namePart.split(Regex("<{2,}"), limit = 2)
        val surname = (nameParts.getOrNull(0) ?: "").replace("<", "").trim()
        val givenNames = (nameParts.getOrNull(1) ?: "").replace("<", " ").trim()

        // Line 2: Doc#(9) + check(1) + Country(3) + DOB(6) + check(1) + Sex(1) + Expiry(6) + check(1)
        val documentNumber = l2.substring(0, 9).replace("<", "").replace("O", "0").trim()
        val nationality = l2.substring(10, 13)
        val dateOfBirth = l2.substring(13, 19).replace("O", "0")
        val expiryDate = l2.substring(21, 27).replace("O", "0")

        if (strict) {
            if (!validateCheckDigit(documentNumber, l2.getOrNull(9) ?: '<')) return null
            if (!validateCheckDigit(dateOfBirth, l2.getOrNull(19) ?: '<')) return null
            if (!validateCheckDigit(expiryDate, l2.getOrNull(27) ?: '<')) return null
        }
        if (!isValidDate(dateOfBirth)) return null
        if (!isValidDate(expiryDate)) return null
        if (surname.isBlank()) return null
        if (documentNumber.length < 5) return null

        return MrzResult(
            documentNumber = documentNumber,
            dateOfBirth = dateOfBirth,
            expiryDate = expiryDate,
            surname = surname,
            givenNames = givenNames,
            nationality = nationality
        )
    }

    private fun validateCheckDigit(field: String, checkChar: Char): Boolean {
        if (checkChar == '<' || checkChar == ' ') return true // Some docs omit check
        val expected = computeCheckDigit(field)
        val actual = when {
            checkChar.isDigit() -> checkChar - '0'
            checkChar == 'O' -> 0 // OCR may read 0 as O
            else -> -1
        }
        return actual == expected
    }

    private fun computeCheckDigit(field: String): Int {
        var sum = 0
        field.forEachIndexed { i, c ->
            val value = when {
                c.isDigit() -> c - '0'
                c in 'A'..'Z' -> c - 'A' + 10
                c == '<' -> 0
                else -> 0
            }
            sum += value * WEIGHTS[i % 3]
        }
        return sum % 10
    }

    private fun isValidDate(yymmdd: String): Boolean {
        if (yymmdd.length != 6 || !yymmdd.all { it.isDigit() }) return false
        val mm = yymmdd.substring(2, 4).toIntOrNull() ?: return false
        val dd = yymmdd.substring(4, 6).toIntOrNull() ?: return false
        return mm in 1..12 && dd in 1..31
    }

    private fun formatDate(yymmdd: String): String {
        val yy = yymmdd.take(2).toIntOrNull() ?: 0
        val mm = yymmdd.substring(2, 4).toIntOrNull() ?: 0
        val dd = yymmdd.takeLast(2).toIntOrNull() ?: 0
        val year = if (yy >= 50) 1900 + yy else 2000 + yy
        return String.format("%04d-%02d-%02d", year, mm, dd)
    }

    /** Try common OCR substitutions when check digit fails */
    private fun tryOcrCorrections(line1: String, line2: String): List<Pair<String, String>> {
        val results = mutableListOf<Pair<String, String>>()
        val subs = listOf(
            'O' to '0', '0' to 'O', '1' to 'I', 'I' to '1', 'l' to '1', '1' to 'l',
            '5' to 'S', 'S' to '5', '8' to 'B', 'B' to '8', '2' to 'Z', 'Z' to '2'
        )
        for ((from, to) in subs) {
            results.add(
                line1.replace(from, to) to line2.replace(from, to)
            )
        }
        return results
    }
}
