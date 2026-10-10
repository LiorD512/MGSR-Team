package com.liordahan.mgsrteam.features.home.dashboard

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R

/**
 * Typography for the MEN dashboard, matching the website "Light Management Room"
 * (mgsr-web .brit-room):
 *   --display : Oswald   → masthead + big numbers (condensed, uppercase)
 *   --body    : Manrope  → running copy
 *   --mono    : DM Mono  → uppercase micro-labels (kicker, signal labels)
 *
 * These are men-only helpers so the shared boldTextStyle/regularTextStyle
 * (takeaway_sans, used app-wide) stays untouched for Women/Youth and the rest
 * of the app. Oswald/Manrope are variable fonts; weight is selected via
 * FontVariation (supported from minSdk 28).
 */

private fun oswald(weight: Int) = FontFamily(
    Font(R.font.oswald_variable, variationSettings = FontVariation.Settings(FontVariation.weight(weight)))
)

private fun manrope(weight: Int) = FontFamily(
    Font(R.font.manrope_variable, variationSettings = FontVariation.Settings(FontVariation.weight(weight)))
)

private val DmMono = FontFamily(
    Font(R.font.dm_mono_regular, FontWeight.Normal),
    Font(R.font.dm_mono_medium, FontWeight.Medium),
)

/** Oswald display — masthead, section titles, stat numbers. */
fun menDisplay(
    color: Color,
    fontSize: TextUnit,
    weight: Int = 500,
    letterSpacing: TextUnit = (-0.5).sp,
    textAlign: TextAlign = TextAlign.Start,
): TextStyle = TextStyle(
    color = color,
    fontSize = fontSize,
    fontFamily = oswald(weight),
    letterSpacing = letterSpacing,
    textAlign = textAlign,
)

/** Manrope body — running copy. */
fun menBody(
    color: Color,
    fontSize: TextUnit,
    weight: Int = 500,
    textAlign: TextAlign = TextAlign.Start,
): TextStyle = TextStyle(
    color = color,
    fontSize = fontSize,
    fontFamily = manrope(weight),
    textAlign = textAlign,
)

/** DM Mono micro-label — kicker, signal labels, chip captions (usually UPPERCASE). */
fun menMono(
    color: Color,
    fontSize: TextUnit,
    weight: FontWeight = FontWeight.Normal,
    letterSpacing: TextUnit = 1.4.sp,
    textAlign: TextAlign = TextAlign.Start,
): TextStyle = TextStyle(
    color = color,
    fontSize = fontSize,
    fontFamily = DmMono,
    fontWeight = weight,
    letterSpacing = letterSpacing,
    textAlign = textAlign,
)
