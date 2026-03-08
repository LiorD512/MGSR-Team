package com.liordahan.mgsrteam.localization

import android.content.Context
import java.text.Normalizer
import java.util.Locale

/**
 * Translates country names from English (Transfermarkt format) to Hebrew when app is in Hebrew.
 * Also supports Hebrew-to-English translation for club search (Transfermarkt API expects English).
 */
object CountryNameTranslator {

    private val ENGLISH_TO_HEBREW = mapOf(
        "Afghanistan" to "אפגניסטן",
        "Albania" to "אלבניה",
        "Algeria" to "אלג'יריה",
        "Andorra" to "אנדורה",
        "Angola" to "אנגולה",
        "Argentina" to "ארגנטינה",
        "Armenia" to "ארמניה",
        "Australia" to "אוסטרליה",
        "Austria" to "אוסטריה",
        "Azerbaijan" to "אזרבייג'ן",
        "Bahrain" to "בחריין",
        "Bangladesh" to "בנגלדש",
        "Belarus" to "בלארוס",
        "Belgium" to "בלגיה",
        "Belize" to "בליז",
        "Bosnia" to "בוסניה",
        "Bosnia and Herzegovina" to "בוסניה והרצגובינה",
        "Bosnia-Herzegovina" to "בוסניה והרצגובינה",
        "Botswana" to "בוטסואנה",
        "Brazil" to "ברזיל",
        "Bulgaria" to "בולגריה",
        "Cameroon" to "קמרון",
        "Canada" to "קנדה",
        "Chile" to "צ'ילה",
        "China" to "סין",
        "Colombia" to "קולומביה",
        "Congo" to "קונגו",
        "Congo DR" to "קונגו הדמוקרטית",
        "DR Congo" to "קונגו הדמוקרטית",
        "Democratic Republic of the Congo" to "קונגו הדמוקרטית",
        "Republic of the Congo" to "קונגו",
        "Curaçao" to "קוראסאו",
        "Curacao" to "קוראסאו",
        "Costa Rica" to "קוסטה ריקה",
        "Croatia" to "קרואטיה",
        "Cuba" to "קובה",
        "Cyprus" to "קפריסין",
        "Czech Republic" to "צ'כיה",
        "Czechia" to "צ'כיה",
        "Denmark" to "דנמרק",
        "Egypt" to "מצרים",
        "England" to "אנגליה",
        "Estonia" to "אסטוניה",
        "Ethiopia" to "אתיופיה",
        "Finland" to "פינלנד",
        "France" to "צרפת",
        "Georgia" to "גאורגיה",
        "Germany" to "גרמניה",
        "Guadeloupe" to "גוואדלופ",
        "French Guiana" to "גיאנה הצרפתית",
        "Ghana" to "גאנה",
        "Greece" to "יוון",
        "Hungary" to "הונגריה",
        "Iceland" to "איסלנד",
        "India" to "הודו",
        "Indonesia" to "אינדונזיה",
        "Iran" to "איראן",
        "Iraq" to "עיראק",
        "Ireland" to "אירלנד",
        "Israel" to "ישראל",
        "Italy" to "איטליה",
        "Ivory Coast" to "חוף השנהב",
        "Côte d'Ivoire" to "חוף השנהב",
        "Cote d'Ivoire" to "חוף השנהב",
        "Cote D'Ivoire" to "חוף השנהב",
        "Japan" to "יפן",
        "Jordan" to "ירדן",
        "Kazakhstan" to "קזחסטן",
        "Kenya" to "קניה",
        "Kosovo" to "קוסובו",
        "Kuwait" to "כווית",
        "Latvia" to "לטביה",
        "Lebanon" to "לבנון",
        "Libya" to "לוב",
        "Liechtenstein" to "ליכטנשטיין",
        "Lithuania" to "ליטא",
        "Luxembourg" to "לוקסמבורג",
        "Malaysia" to "מלזיה",
        "Malta" to "מלטה",
        "Martinique" to "מרטיניק",
        "Mexico" to "מקסיקו",
        "Moldova" to "מולדובה",
        "Monaco" to "מונאקו",
        "Montenegro" to "מונטנגרו",
        "Morocco" to "מרוקו",
        "Netherlands" to "הולנד",
        "New Zealand" to "ניו זילנד",
        "Nigeria" to "ניגריה",
        "North Korea" to "קוריאה הצפונית",
        "North Macedonia" to "מקדוניה הצפונית",
        "Northern Ireland" to "צפון אירלנד",
        "Norway" to "נורווגיה",
        "Oman" to "עומאן",
        "Réunion" to "ראוניון",
        "Reunion" to "ראוניון",
        "Other" to "אחר",
        "Pakistan" to "פקיסטן",
        "Panama" to "פנמה",
        "Paraguay" to "פרגוואי",
        "Peru" to "פרו",
        "Philippines" to "הפיליפינים",
        "Poland" to "פולין",
        "Portugal" to "פורטוגל",
        "Qatar" to "קטאר",
        "Romania" to "רומניה",
        "Russia" to "רוסיה",
        "Saudi Arabia" to "ערב הסעודית",
        "Scotland" to "סקוטלנד",
        "Senegal" to "סנגל",
        "Serbia" to "סרביה",
        "Singapore" to "סינגפור",
        "Slovakia" to "סלובקיה",
        "Slovenia" to "סלובניה",
        "South Africa" to "דרום אפריקה",
        "South Korea" to "דרום קוריאה",
        "Korea Republic" to "דרום קוריאה",
        "Spain" to "ספרד",
        "Sri Lanka" to "סרי לנקה",
        "Sweden" to "שוודיה",
        "Switzerland" to "שווייץ",
        "Syria" to "סוריה",
        "Tunisia" to "תוניסיה",
        "Turkey" to "טורקיה",
        "Türkiye" to "טורקיה",
        "Ukraine" to "אוקראינה",
        "United Arab Emirates" to "איחוד האמירויות",
        "UAE" to "איחוד האמירויות",
        "United Kingdom" to "הממלכה המאוחדת",
        "UK" to "הממלכה המאוחדת",
        "United States" to "ארצות הברית",
        "United States of America" to "ארצות הברית",
        "USA" to "ארצות הברית",
        "Uruguay" to "אורוגוואי",
        "Uzbekistan" to "אוזבקיסטן",
        "Venezuela" to "ונצואלה",
        "Vietnam" to "וייטנאם",
        "Wales" to "ויילס",
        "Yemen" to "תימן",
        "Zambia" to "זמביה",
        "Zimbabwe" to "זימבבואה",
    )

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
