package com.liordahan.mgsrteam.localization

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/**
 * Locale management using manual context wrapping for immediate effect.
 */
object LocaleManager {

    private const val PREF_NAME = "locale_prefs"
    private const val KEY_LANGUAGE = "app_language"

    const val LANG_ENGLISH = "en"
    const val LANG_HEBREW = "he"

    fun getSavedLanguage(context: Context): String {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val lang = prefs.getString(KEY_LANGUAGE, LANG_ENGLISH) ?: LANG_ENGLISH
        // Migrate old "iw" to "he"
        val normalizedLang = if (lang == "iw") "he" else lang
        android.util.Log.d("LocaleManager", "getSavedLanguage: $normalizedLang (original: $lang)")
        return normalizedLang
    }

    fun saveLanguage(context: Context, languageCode: String) {
        android.util.Log.d("LocaleManager", "saveLanguage: $languageCode")
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LANGUAGE, languageCode)
            .commit()
    }

    fun isHebrew(context: Context): Boolean =
        getSavedLanguage(context) == LANG_HEBREW

    /**
     * Wraps context with saved locale. Call from attachBaseContext().
     */
    fun setLocale(c: Context): Context {
        val lang = getSavedLanguage(c)
        android.util.Log.d("LocaleManager", "setLocale called with language: $lang")
        return updateResources(c, lang)
    }

    /**
     * Saves new language and returns wrapped context.
     * Caller must call activity.recreate() afterwards.
     */
    fun setNewLocale(c: Context, language: String): Context {
        saveLanguage(c, language)
        return updateResources(c, language)
    }

    private fun updateResources(context: Context, language: String): Context {
        android.util.Log.d("LocaleManager", "updateResources: $language, context resources locale: ${context.resources.configuration.locales[0]}")
        val locale = Locale(language)
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        
        // Use updateConfiguration for immediate effect
        @Suppress("DEPRECATION")
        context.resources.updateConfiguration(config, context.resources.displayMetrics)
        
        android.util.Log.d("LocaleManager", "updateResources updated context resources locale: ${context.resources.configuration.locales[0]}")
        return context
    }

    /**
     * Convenience: save language and recreate activity.
     */
    fun applyLocale(context: Context) {
        android.util.Log.d("LocaleManager", "applyLocale: calling recreate()")
        (context as? Activity)?.recreate()
    }
}
