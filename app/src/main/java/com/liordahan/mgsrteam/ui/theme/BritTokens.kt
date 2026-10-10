package com.liordahan.mgsrteam.ui.theme

import androidx.compose.ui.graphics.Color
import com.liordahan.mgsrteam.features.platform.Platform

/**
 * .brit-room editorial design tokens, ported 1:1 from the authoritative mock
 * (docs/mobile-prototype/styles.css). These are the app-wide colour constants
 * every restyled "Light Management Room" screen reuses.
 *
 * Token source (styles.css custom properties):
 *   --ink #161613  --black #11110f  --paper #f3f0e8  --paper-2 #e4ded1
 *   --card #fbf9f3  --gold #a47d43  --gold-soft #c9a66b  --red #b64235
 *   --green #5c6f4a  --amber #b07a2b  --blue #4a5f6f  --muted #77736a
 *   lines rgba(22,22,19,.18) / rgba(22,22,19,.07)
 *
 * YOUTH retint overrides the gold accent with a pitch teal
 * (--gold -> #2f7d6e, --gold-soft -> #5fa391) per context.json.
 */
object BritTokens {

    // ── Core palette ──
    val ink = Color(0xFF161613)
    val black = Color(0xFF11110F)
    val paper = Color(0xFFF3F0E8)
    val paper2 = Color(0xFFE4DED1)
    val card = Color(0xFFFBF9F3)

    // ── Accents ──
    val gold = Color(0xFFA47D43)
    val goldSoft = Color(0xFFC9A66B)
    val red = Color(0xFFB64235)
    val green = Color(0xFF5C6F4A)
    val amber = Color(0xFFB07A2B)
    val blue = Color(0xFF4A5F6F)

    // ── Muted text ──
    val muted = Color(0xFF77736A)
    val muted2 = Color(0xFFABA69B)

    // ── Hairline rules (rgba(22,22,19,.18) / .07) ──
    val line = Color(0xFF161613).copy(alpha = .18f)
    val line2 = Color(0xFF161613).copy(alpha = .07f)

    // ── YOUTH accent override (pitch teal) ──
    val goldYouth = Color(0xFF2F7D6E)
    val goldSoftYouth = Color(0xFF5FA391)

    /**
     * Returns the (gold, goldSoft) accent pair for the given [platform].
     * YOUTH retints to the pitch-teal override; MEN keeps the default
     * editorial gold. Exhaustive over the Men + Youth platform set.
     */
    fun accentFor(platform: Platform): Pair<Color, Color> = when (platform) {
        Platform.YOUTH -> goldYouth to goldSoftYouth
        Platform.MEN -> gold to goldSoft
    }
}
