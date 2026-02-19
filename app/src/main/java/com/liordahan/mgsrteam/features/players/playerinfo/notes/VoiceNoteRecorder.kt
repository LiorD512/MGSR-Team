package com.liordahan.mgsrteam.features.players.playerinfo.notes

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.liordahan.mgsrteam.localization.LocaleManager

/**
 * Helper for voice-to-text recording in the notes section.
 * Uses Android's built-in SpeechRecognizer for speech-to-text transcription.
 * Uses the app's chosen language (LocaleManager) for recognition, not the system locale.
 */
object VoiceNoteRecorder {

    fun isAvailable(context: Context): Boolean {
        return SpeechRecognizer.isRecognitionAvailable(context) &&
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)
    }

    fun hasRecordAudioPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
    }

    /**
     * Creates the RecognizerIntent using the app's chosen language (Hebrew/English from LocaleManager).
     * On API 34+, enables automatic language detection between Hebrew and English so the recognizer
     * can detect which language you're speaking.
     */
    fun createRecognizerIntent(context: Context): Intent {
        val appLang = LocaleManager.getSavedLanguage(context)
        val languageTag = when (appLang) {
            LocaleManager.LANG_HEBREW -> "he-IL"
            else -> "en-US"
        }

        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)

            // API 34+: enable automatic language detection between Hebrew and English
            if (Build.VERSION.SDK_INT >= 34) {
                putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_DETECTION, true)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES, arrayOf("he-IL", "en-US"))
            }
        }
    }

    fun createSpeechRecognizer(context: Context): SpeechRecognizer? {
        return if (SpeechRecognizer.isRecognitionAvailable(context)) {
            SpeechRecognizer.createSpeechRecognizer(context)
        } else {
            null
        }
    }
}
