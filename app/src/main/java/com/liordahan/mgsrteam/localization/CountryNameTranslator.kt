package com.liordahan.mgsrteam.localization

import android.content.Context
import com.liordahan.mgsrteam.config.AppConfigManager
import java.text.Normalizer
import java.util.Locale

/**
 * Translates country names from English (Transfermarkt format) to Hebrew when app is in Hebrew.
 * Also supports Hebrew-to-English translation for club search (Transfermarkt API expects English).
 * Country translations are fetched from Firestore remote config (with hardcoded fallbacks).
 */
object CountryNameTranslator {

    private val ENGLISH_TO_HEBREW: Map<String, String>
        get() = AppConfigManager.countryEnToHe

    private val HEBREW_TO_ENGLISH: Map<String, String> by lazy {
        ENGLISH_TO_HEBREW.entries.associate { (en, he) -> he to en }
    }

    /** Common Hebrew club/city names to English for Transfermarkt search. Longest phrases first. */
    private val HEBREW_CLUB_TO_ENGLISH = listOf(
        "מכבי פתח תקווה" to "Maccabi Petah Tikva",
        "מכבי חיפה" to "Maccabi Haifa",
        "מכבי תל אביב" to "Maccabi Tel Aviv",
        "הפועל תל אביב" to "Hapoel Tel Aviv",
        "הפועל באר שבע" to "Hapoel Be'er Sheva",
        "בתיאר ירושלים" to "Beitar Jerusalem",
        "בית\"ר ירושלים" to "Beitar Jerusalem",
        "מכביחיפה" to "Maccabi Haifa",
        "מכביתלאביב" to "Maccabi Tel Aviv",
        "הפועלתלאביב" to "Hapoel Tel Aviv",
        "בתיארירושלים" to "Beitar Jerusalem",
        "הכח עמידר" to "Hapoel Kfar Saba",
        "בתיאר" to "Beitar",
        "בית\"ר" to "Beitar",
        "ביתר" to "Beitar",
        "מכבי" to "Maccabi",
        "הפועל" to "Hapoel",
        "חיפה" to "Haifa",
        "תל אביב" to "Tel Aviv",
        "ת\"א" to "Tel Aviv",
        "ירושלים" to "Jerusalem",
        "באר שבע" to "Be'er Sheva",
        "פתח תקווה" to "Petah Tikva",
        "נטניה" to "Netanya",
        "אשדוד" to "Ashdod",
        "קריית שמונה" to "Kiryat Shmona",
    )

    /**
     * Returns the English name for a Hebrew country, or null if not in the map.
     */
    fun getEnglishName(hebrewCountry: String?): String? {
        if (hebrewCountry.isNullOrBlank()) return null
        val trimmed = hebrewCountry.trim()
        return HEBREW_TO_ENGLISH[trimmed]
            ?: HEBREW_TO_ENGLISH.entries.firstOrNull { (he, _) -> he.equals(trimmed, ignoreCase = true) }?.value
    }

    /** Hebrew Unicode range; used to detect and strip untranslated Hebrew from API query. */
    private fun Char.isHebrew() = this in '\u0590'..'\u05FF'

    private fun String.normalizeForSearch(): String =
        Normalizer.normalize(this, Normalizer.Form.NFC)
            .replace(Regex("\\s+"), " ")
            .trim()
            .filter { it != '\u200E' && it != '\u200F' && it != '\u202A' && it != '\u202B' }

    /**
     * Translates a search query for Transfermarkt API (expects English).
     * Handles Hebrew country names and common Hebrew club names.
     * Strips any untranslated Hebrew from the result so the API receives only English.
     */
    fun translateForTransfermarktSearch(query: String?): String {
        if (query.isNullOrBlank()) return ""
        val normalized = query.normalizeForSearch()
        if (normalized.isBlank()) return ""

        val result = translateInternal(normalized)
        val apiQuery = result.split(" ").filter { word -> !word.any { it.isHebrew() } }.joinToString(" ").trim()
        return apiQuery.ifBlank { result }
    }

    private fun translateInternal(normalized: String): String {
        getEnglishName(normalized)?.let { return it }
        HEBREW_CLUB_TO_ENGLISH.firstOrNull { (he, _) ->
            normalized == he || normalized.startsWith(he + " ")
        }?.let { (he, en) ->
            val remainder = normalized.removePrefix(he).trim()
            return if (remainder.isBlank()) en else "$en ${translateInternal(remainder)}"
        }
        val words = normalized.split(" ").filter { it.isNotBlank() }
        if (words.size > 1) {
            val translated = words.map { word ->
                getEnglishName(word) ?: HEBREW_CLUB_TO_ENGLISH.firstOrNull { (h, _) -> h == word }?.second ?: word
            }
            return translated.joinToString(" ")
        }
        return normalized
    }

    /**
     * Returns the Hebrew name for a country, or null if not in the map.
     * Use for bilingual search (match query against both English and Hebrew).
     */
    fun getHebrewName(country: String?): String? {
        if (country.isNullOrBlank()) return null
        return ENGLISH_TO_HEBREW[country.trim()]
            ?: ENGLISH_TO_HEBREW.entries.firstOrNull { (en, _) -> en.equals(country.trim(), ignoreCase = true) }?.value
    }

    /**
     * Returns the country name in Hebrew when isHebrew is true, otherwise returns the original.
     * Use this overload when you have an explicit isHebrew flag (e.g. from stringResource).
     */
    fun getDisplayName(country: String?, isHebrew: Boolean): String {
        if (country.isNullOrBlank()) return ""
        if (!isHebrew) return country
        return ENGLISH_TO_HEBREW[country.trim()] ?: ENGLISH_TO_HEBREW.entries
            .firstOrNull { (en, _) -> en.equals(country.trim(), ignoreCase = true) }?.value
            ?: country
    }

    /**
     * Returns the country name in Hebrew when app is Hebrew, otherwise returns the original.
     */
    fun getDisplayName(context: Context, country: String?): String {
        val isHebrew = LocaleManager.isHebrew(context) ||
            Locale.getDefault().language in listOf("he", "iw") ||
            context.resources.configuration.locales[0].language in listOf("he", "iw")
        return getDisplayName(country, isHebrew)
    }
}
