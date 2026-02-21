package com.liordahan.mgsrteam.localization

import android.content.Context

/**
 * Translates country names from English (Transfermarkt format) to Hebrew when app is in Hebrew.
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
        "Japan" to "יפן",
        "Jordan" to "ירדן",
        "Kazakhstan" to "קזחסטן",
        "Kenya" to "קניה",
        "Kuwait" to "כווית",
        "Latvia" to "לטביה",
        "Lebanon" to "לבנון",
        "Libya" to "לוב",
        "Liechtenstein" to "ליכטנשטיין",
        "Lithuania" to "ליטא",
        "Luxembourg" to "לוקסמבורג",
        "Malaysia" to "מלזיה",
        "Malta" to "מלטה",
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
     * Returns the country name in Hebrew when app is set to Hebrew, otherwise returns the original.
     */
    fun getDisplayName(context: Context, country: String?): String {
        if (country.isNullOrBlank()) return ""
        if (!LocaleManager.isHebrew(context)) return country
        return ENGLISH_TO_HEBREW[country.trim()] ?: ENGLISH_TO_HEBREW.entries
            .firstOrNull { (en, _) -> en.equals(country.trim(), ignoreCase = true) }?.value
            ?: country
    }
}
