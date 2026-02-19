package com.liordahan.mgsrteam.features.requests.voice

import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import java.io.File
import java.io.FileInputStream
import java.util.UUID

/**
 * Records raw audio for request voice analysis.
 * Uses MediaRecorder to capture audio (no speech-to-text).
 * Output: MPEG-4 audio (audio/mp4) for Gemini API compatibility.
 */
object RequestVoiceRecorder {

    private const val AUDIO_MIME_TYPE = "audio/mp4"

    fun isAvailable(context: Context): Boolean {
        return context.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)
    }

    fun hasRecordAudioPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Creates a temp file for recording. Caller should delete when done.
     */
    fun createTempRecordingFile(context: Context): File {
        val cacheDir = context.cacheDir
        return File(cacheDir, "request_voice_${UUID.randomUUID()}.mp4")
    }

    /**
     * Starts recording to the given file.
     * @param file Output file (will be overwritten)
     * @return The MediaRecorder on success (caller must call stopRecording), or null on failure
     */
    fun startRecording(file: File): MediaRecorder? {
        return try {
            MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(44100)
                setAudioChannels(1)
                setAudioEncodingBitRate(128000)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Stops the recorder and returns the recorded bytes.
     */
    fun stopRecording(recorder: MediaRecorder?, file: File): Result<ByteArray> {
        return try {
            recorder?.apply {
                try {
                    stop()
                } catch (e: Exception) {
                    // Ignore if already stopped
                }
                release()
            }
            if (file.exists() && file.length() > 0) {
                FileInputStream(file).use { it.readBytes() }.let { bytes ->
                    file.delete()
                    Result.success(bytes)
                }
            } else {
                Result.failure(IllegalStateException("No audio recorded"))
            }
        } catch (e: Exception) {
            file.delete()
            Result.failure(e)
        }
    }

    fun getAudioMimeType(): String = AUDIO_MIME_TYPE
}
