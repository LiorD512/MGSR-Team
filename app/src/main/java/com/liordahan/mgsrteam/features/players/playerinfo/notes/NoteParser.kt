package com.liordahan.mgsrteam.features.players.playerinfo.notes

import com.liordahan.mgsrteam.features.players.models.NotesModel

/**
 * Parses player notes to extract structured data: salary range and free transfer indicator.
 *
 * Salary extraction: Looks for keywords (salary, שכר, משכורת, מבקש) followed by a number,
 * then maps the number to the correct salary range band.
 *
 * Free transfer: Looks for keywords (free transfer, free, חופשי, העברה חופשית, חינם)
 * to mark the player as free.
 */
object NoteParser {

    private val SALARY_KEYWORDS = Regex(
        """(?:salary|שכר|משכורת|מבקש)\s*[:\-=]?\s*""",
        RegexOption.IGNORE_CASE
    )

    private val SALARY_NUMBER = Regex(
        """(\d+(?:[.,]\d+)?)\s*(?:k|K|k€|€k|thousand|אלף|מיליון)?"""
    )

    private val FREE_TRANSFER_KEYWORDS = listOf(
        "free transfer",
        "free agent",
        "free",
        "חופשי",
        "העברה חופשית",
        "חינם"
    )

    /**
     * Extracts salary range from all notes. Returns the matching range string (e.g. "6-10")
     * or null if no salary was found.
     */
    fun extractSalaryRange(notes: List<NotesModel>): String? {
        val text = notes.mapNotNull { it.notes }.joinToString(" ").trim()
        if (text.isBlank()) return null

        val salaryValue = findSalaryNumber(text) ?: return null
        return numberToSalaryRange(salaryValue)
    }

    /**
     * Returns true if any note contains free transfer keywords.
     */
    fun extractFreeTransfer(notes: List<NotesModel>): Boolean {
        val text = notes.mapNotNull { it.notes }.joinToString(" ").trim().lowercase()
        if (text.isBlank()) return false

        return FREE_TRANSFER_KEYWORDS.any { keyword ->
            val kw = keyword.lowercase()
            when {
                kw.contains(" ") -> text.contains(kw)
                else -> {
                    val regex = Regex("""(?:^|[\s,.:;])${Regex.escape(kw)}(?:$|[\s,.:;])""")
                    regex.containsMatchIn(text)
                }
            }
        }
    }

    private fun findSalaryNumber(text: String): Double? {
        val lower = text.lowercase()
        val keywordMatches = SALARY_KEYWORDS.findAll(lower)
        for (match in keywordMatches) {
            val afterKeyword = text.substring(match.range.last + 1).trim()
            val numberMatch = SALARY_NUMBER.find(afterKeyword)
            if (numberMatch != null) {
                val numStr = numberMatch.groupValues[1].replace(",", ".")
                val value = numStr.toDoubleOrNull() ?: continue
                val fullMatch = numberMatch.value
                return when {
                    fullMatch.contains("מיליון") || fullMatch.lowercase().contains("million") -> value * 1000
                    value >= 1000 -> value / 1000
                    else -> value
                }
            }
        }
        return null
    }

    private fun numberToSalaryRange(value: Double): String? {
        val v = value.toInt().coerceIn(0, 100)
        return when {
            v <= 5 -> ">5"
            v in 6..10 -> "6-10"
            v in 11..15 -> "11-15"
            v in 16..20 -> "16-20"
            v in 20..25 -> "20-25"
            v in 26..30 -> "26-30"
            v > 30 -> "30+"
            else -> null
        }
    }
}
