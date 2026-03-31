package com.liordahan.mgsrteam.features.requests.voice

import android.util.Log
import com.google.firebase.ai.FirebaseAI
import com.google.firebase.ai.type.Content
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import com.liordahan.mgsrteam.features.requests.models.DominateFootOptions
import com.liordahan.mgsrteam.features.requests.models.SalaryRangeOptions
import com.liordahan.mgsrteam.features.requests.models.TransferFeeOptions
import com.liordahan.mgsrteam.transfermarket.ClubSearch
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Analyzes voice recordings to extract structured request data.
 * Uses Gemini to listen to audio and extract: club, position, salary, transfer fee, foot, age.
 * No speech-to-text — direct audio analysis.
 */
class RequestVoiceAnalyzer(
    private val clubSearch: ClubSearch
) {

    companion object {
        private const val TAG = "RequestVoiceAnalyzer"
    }

    data class ExtractedRequestData(
        val club: ClubSearchModel?,
        val clubNameRaw: String?,
        val position: String?,
        val salaryRange: String?,
        val transferFee: String?,
        val dominateFoot: String?,
        val minAge: Int?,
        val maxAge: Int?,
        val ageDoesntMatter: Boolean,
        val euOnly: Boolean,
        val notes: String?
    )

    suspend fun analyzeAudio(audioBytes: ByteArray, mimeType: String): Result<ExtractedRequestData> =
        withContext(Dispatchers.IO) {
            try {
                val model = FirebaseAI.getInstance(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-2.5-flash",
                    generationConfig = generationConfig {
                        temperature = 0.2f
                        responseMimeType = "application/json"
                        responseSchema = Schema.obj(
                            mapOf(
                                "clubName" to Schema.string(),
                                "position" to Schema.string(),
                                "salaryRange" to Schema.string(),
                                "transferFee" to Schema.string(),
                                "dominateFoot" to Schema.string(),
                                "minAge" to Schema.integer(),
                                "maxAge" to Schema.integer(),
                                "euOnly" to Schema.boolean(),
                                "notes" to Schema.string()
                            ),
                            optionalProperties = listOf(
                                "clubName", "position", "salaryRange", "transferFee",
                                "dominateFoot", "minAge", "maxAge", "euOnly", "notes"
                            )
                        )
                    }
                )

                val content = Content.Builder()
                    .inlineData(audioBytes, mimeType)
                    .text(buildPrompt())
                    .build()

                val response = model.generateContent(listOf(content))
                val text = response.text ?: return@withContext Result.failure(
                    IllegalStateException("Empty response from AI")
                )

                val extracted = parseAndResolve(text)
                Log.d(TAG, "analyzeAudio result: club=${extracted.clubNameRaw}, position=${extracted.position}")
                Result.success(extracted)
            } catch (e: Exception) {
                Log.e(TAG, "analyzeAudio failed", e)
                Result.failure(e)
            }
        }

    private fun buildPrompt(): String {
        val salaryOptions = SalaryRangeOptions.all.joinToString(", ")
        val transferOptions = TransferFeeOptions.all.joinToString(", ")
        return """
            You are analyzing a voice recording of a football/soccer agent or club representative describing a player request.
            The speaker may speak in Hebrew or English.

            TASK: Listen to the audio and extract structured data about the request. The speaker may mention:
            - Club name (the club looking for a player)
            - Position (e.g. CF, LW, DM, CB, GK — use standard codes)
            - Salary range (in thousands of euros per year)
            - Transfer fee / market value budget — Hebrew terms: העברה (transfer), סכום העברה (transfer fee), טרנספר פי (transfer fee)
            - Preferred foot (left, right, or any)
            - Age range (min and max) if specified
            - EU citizenship requirement — Hebrew terms: אירופאי (European), דרכון אירופאי (European passport), אזרחות אירופאית (EU citizenship), EU בלבד (EU only)

            OUTPUT RULES:
            - clubName: MUST be in ENGLISH. If the speaker says the club in Hebrew or any other language, translate to English. Examples: מכבי חיפה → Maccabi Haifa, הפועל תל אביב → Hapoel Tel Aviv, מכבי תל אביב → Maccabi Tel Aviv, בית"ר ירושלים → Beitar Jerusalem, הפועל באר שבע → Hapoel Be'er Sheva, מכבי פתח תקווה → Maccabi Petah Tikva. Transfermarkt search requires English names.
            - position: Use standard codes: GK, CB, RB, LB, DM, CM, AM, LM, RM, LW, RW, CF, ST, SS, LWB, RWB. If unclear, use the closest match.
            - salaryRange: MUST be one of: $salaryOptions (these are in thousands: e.g. "6-10" = €6k–€10k, "30+" = €30k+)
            - transferFee: MUST be one of: $transferOptions. IMPORTANT: Recognize Hebrew terms for transfer fee:
              * "Free/Free loan" = חינם, הלוואה, בחינם, free, loan
              * "<200" = מתחת ל־200, פחות מ־200, under 200, below 200
              * "300-600" = 300-600, שלוש מאות עד שש מאות
              * "700-900" = 700-900, שבע מאות עד תשע מאות
              * "1m+" = מיליון, מיליון פלוס, 1m, million
              When the speaker says העברה, סכום העברה, or טרנספר פי followed by a number/range, extract the corresponding option.
            - dominateFoot: "left", "right", or "any"
            - minAge, maxAge: integers 16-40, or null if not mentioned
            - euOnly: true if the speaker mentions that only EU passport holders, European citizens, or players with EU nationality are wanted. Hebrew cues: אירופאי, דרכון אירופאי, אזרחות, EU. Default: false
            - notes: Keep in the ORIGINAL LANGUAGE. If the speaker speaks Hebrew, write notes in Hebrew. If English, write in English. Do not translate notes.

            If something is not mentioned, use null or empty string. Never invent data.
            Return valid JSON only. No markdown, no explanation.
        """.trimIndent()
    }

    private suspend fun parseAndResolve(jsonText: String): ExtractedRequestData {
        val text = extractJsonFromResponse(jsonText) ?: return ExtractedRequestData(
            club = null,
            clubNameRaw = null,
            position = null,
            salaryRange = null,
            transferFee = null,
            dominateFoot = null,
            minAge = null,
            maxAge = null,
            ageDoesntMatter = true,
            euOnly = false,
            notes = null
        )

        val obj = JSONObject(text)
        val clubNameRaw = obj.optString("clubName", "").trim().takeIf { it.isNotBlank() }
        val position = obj.optString("position", "").trim().takeIf { it.isNotBlank() }
        val salaryRaw = obj.optString("salaryRange", "").trim().takeIf { it.isNotBlank() }
        val transferRaw = obj.optString("transferFee", "").trim().takeIf { it.isNotBlank() }
        val footRaw = obj.optString("dominateFoot", "").trim().takeIf { it.isNotBlank() }
        val minAge = obj.optInt("minAge", -1).takeIf { it in 16..40 }
        val maxAge = obj.optInt("maxAge", -1).takeIf { it in 16..40 }
        val euOnly = obj.optBoolean("euOnly", false)
        val notes = obj.optString("notes", "").trim().takeIf { it.isNotBlank() }

        val salaryRange = salaryRaw?.let { matchSalaryRange(it) }
        val transferFee = transferRaw?.let { matchTransferFee(it) }
        val dominateFoot = footRaw?.let { matchFoot(it) }

        val club = clubNameRaw?.let { resolveClub(it) }

        return ExtractedRequestData(
            club = club,
            clubNameRaw = clubNameRaw,
            position = position,
            salaryRange = salaryRange,
            transferFee = transferFee,
            dominateFoot = dominateFoot,
            minAge = minAge,
            maxAge = maxAge,
            ageDoesntMatter = minAge == null && maxAge == null,
            euOnly = euOnly,
            notes = notes
        )
    }

    private suspend fun resolveClub(name: String): ClubSearchModel? {
        val result = clubSearch.getClubSearchResults(name)
        return when (result) {
            is TransfermarktResult.Success -> result.data.firstOrNull()
            is TransfermarktResult.Failed -> null
        }
    }

    private fun matchSalaryRange(raw: String): String? {
        val lower = raw.lowercase().trim()
        return SalaryRangeOptions.all.firstOrNull { opt ->
            opt.equals(lower, ignoreCase = true) ||
                lower.contains(opt) ||
                opt.contains(lower)
        } ?: SalaryRangeOptions.all.firstOrNull { opt ->
            when {
                raw.contains("6") && raw.contains("10") -> opt == "6-10"
                raw.contains("11") && raw.contains("15") -> opt == "11-15"
                raw.contains("16") && raw.contains("20") -> opt == "16-20"
                raw.contains("20") && raw.contains("25") -> opt == "20-25"
                raw.contains("26") && raw.contains("30") -> opt == "26-30"
                raw.contains("30") || raw.contains("+") -> opt == "30+"
                raw.contains("5") || raw.contains("<") -> opt == ">5"
                else -> false
            }
        }
    }

    private fun matchTransferFee(raw: String): String? {
        val lower = raw.lowercase().trim()
        // English
        if (lower.contains("free") || lower.contains("loan")) return "Free/Free loan"
        if (lower.contains("200") && !lower.contains("300")) return "<200"
        if (lower.contains("300") || lower.contains("600")) return "300-600"
        if (lower.contains("700") || lower.contains("900")) return "700-900"
        if (lower.contains("1m") || lower.contains("million")) return "1m+"
        // Hebrew: חינם, הלוואה, בחינם
        if (lower.contains("חינם") || lower.contains("הלוואה") || lower.contains("בחינם")) return "Free/Free loan"
        // Hebrew: מתחת ל־200, פחות מ־200, העברה מתחת ל־200
        if (lower.contains("מתחת") || lower.contains("פחות מ") || lower.contains("פחות מ־")) {
            if (lower.contains("200") || lower.contains("מאתיים")) return "<200"
        }
        // Hebrew: מיליון, מיליון פלוס, טרנספר פי מיליון
        if (lower.contains("מיליון") || lower.contains("מליון")) return "1m+"
        // Hebrew numbers for ranges: שלוש מאות, שש מאות, שבע מאות, תשע מאות
        if (lower.contains("300") || lower.contains("שלוש מאות") || lower.contains("שש מאות") || lower.contains("600")) return "300-600"
        if (lower.contains("700") || lower.contains("שבע מאות") || lower.contains("תשע מאות") || lower.contains("900")) return "700-900"
        return TransferFeeOptions.all.firstOrNull { it.equals(lower, ignoreCase = true) }
    }

    private fun matchFoot(raw: String): String? {
        val lower = raw.lowercase().trim()
        return when {
            lower.contains("left") || lower.contains("שמאל") -> DominateFootOptions.LEFT
            lower.contains("right") || lower.contains("ימין") -> DominateFootOptions.RIGHT
            else -> DominateFootOptions.ANY
        }
    }

    private fun extractJsonFromResponse(text: String): String? {
        var cleaned = text.trim()
        if (cleaned.contains("```json")) {
            val start = cleaned.indexOf("```json") + 7
            val end = cleaned.indexOf("```", start).takeIf { it >= 0 } ?: cleaned.length
            cleaned = cleaned.substring(start, end).trim()
        } else if (cleaned.contains("```")) {
            val start = cleaned.indexOf("```") + 3
            val end = cleaned.indexOf("```", start).takeIf { it >= 0 } ?: cleaned.length
            cleaned = cleaned.substring(start, end).trim()
        }
        return cleaned.takeIf { it.startsWith("{") && it.endsWith("}") }
    }
}
