package com.liordahan.mgsrteam.features.players.playerinfo.notes

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat

/**
 * Helper for voice-to-text recording in the notes section.
 * Uses Android's built-in SpeechRecognizer for speech-to-text transcription.
 * Defaults to Hebrew; on API 34+ tries automatic detection between Hebrew and English.
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
     * Creates the RecognizerIntent for voice notes.
     *
     * Strategy: Try automatic language detection (API 34+). When detection fails or is uncertain,
     * default to Hebrew. This fits users who often speak Hebrew regardless of app language.
     */
    fun createRecognizerIntent(context: Context): Intent {
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)

            // Default to Hebrew when detection fails or is uncertain
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "he-IL")

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
