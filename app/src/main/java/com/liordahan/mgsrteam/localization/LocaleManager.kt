package com.liordahan.mgsrteam.localization

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale

object LocaleManager {

    private const val PREF_NAME = "locale_prefs"
    private const val KEY_LANGUAGE = "app_language"

    /**
     * BCP 47 language tag for English.
     */
    const val LANG_ENGLISH = "en"

    /**
     * BCP 47 language tag for Hebrew.
     * We use "he" for BCP 47 / API 33+. Android resources support both
     * values-he/ and values-iw/ for Hebrew.
     */
    const val LANG_HEBREW = "iw"

    // ── Persistence ──────────────────────────────────────────────────────

    /**
     * Returns the user's chosen language, or default on first launch.
     * Uses SharedPreferences directly (not context.configuration) so we always
     * read the user's explicit choice, never the system locale.
     */
    fun getSavedLanguage(context: Context): String {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_LANGUAGE, null)
        if (saved != null) {
            return when (saved) {
                "iw", "he" -> LANG_HEBREW
                else -> saved
            }
        }
        // First launch – default to English (user can switch to Hebrew)
        return LANG_ENGLISH
    }

    fun saveLanguage(context: Context, languageCode: String) {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LANGUAGE, languageCode)
            .commit()
    }

    // ── Querying current language ────────────────────────────────────────

    /**
     * Returns `true` when the app is currently running in Hebrew.
     *
     * Checks AppCompat's applied locale first (source of truth for Activities),
     * then falls back to our SharedPreferences for non-Activity contexts
     * (workers, services).
     */
    fun isHebrew(context: Context): Boolean {
        val appLocales = AppCompatDelegate.getApplicationLocales()
        if (!appLocales.isEmpty) {
            val lang = appLocales[0]?.language
            return lang == "he" || lang == "iw"
        }
        // Fallback for when AppCompat hasn't initialised yet (e.g. Worker)
        return getSavedLanguage(context) == LANG_HEBREW
    }

    // ── Applying locale ──────────────────────────────────────────────────

    /**
     * Applies the given (or saved) locale through AppCompat.
     *
     * - On **API 33+** this delegates to the system per-app locale API.
     * - On **older APIs** AppCompat persists the choice (via
     *   `AppLocalesMetadataHolderService` with `autoStoreLocales`) and
     *   recreates the running activity.
     *
     * Call this **only** when the user explicitly changes language.
     * Do **not** call it in `Activity.onCreate()` — AppCompat handles
     * restoring the saved locale automatically.
     */
    fun applyLocale(context: Context) {
        val tag = getSavedLanguage(context)       // "en" or "he"
        AppCompatDelegate.setApplicationLocales(
            LocaleListCompat.forLanguageTags(tag)
        )
    }

    /**
     * Updates the context's resources with the user's chosen locale.
     * Uses the deprecated updateConfiguration() because createConfigurationContext()
     * does not reliably propagate to stringResource() in Compose on many devices.
     */
    fun wrapContext(base: Context): Context {
        val lang = getSavedLanguage(base)
        // Use "iw" explicitly for Hebrew - Android's values-iw/ folder matches this
        val locale = if (lang == LANG_HEBREW) Locale.forLanguageTag("iw") else Locale.forLanguageTag(lang)
        Locale.setDefault(locale)
        val res = base.resources
        val config = Configuration(res.configuration)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            config.setLocales(LocaleList(locale))
        } else {
            @Suppress("DEPRECATION")
            config.locale = locale
        }
        config.setLayoutDirection(locale)
        @Suppress("DEPRECATION")
        res.updateConfiguration(config, res.displayMetrics)
        return base
    }
}
