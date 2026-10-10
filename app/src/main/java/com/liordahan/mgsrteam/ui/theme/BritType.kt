@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package com.liordahan.mgsrteam.ui.theme

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
 * App-wide editorial typography for the "Light Management Room"
 * (mgsr-web .brit-room design system):
 *   --display : Oswald   → masthead + big numbers (condensed, uppercase)
 *   --body    : Manrope  → running copy
 *   --mono    : DM Mono  → uppercase micro-labels (kicker, signal labels)
 *
 * Oswald/Manrope are variable fonts; weight is selected via FontVariation
 * (supported from minSdk 28). These helpers were promoted from the former
 * men-only features/home/dashboard/MenDashboardType.kt (now deleted) so every
 * restyled screen reuses one app-wide source of truth.
 */

internal fun oswald(weight: Int) = FontFamily(
    Font(R.font.oswald_variable, variationSettings = FontVariation.Settings(FontVariation.weight(weight)))
)

internal fun manrope(weight: Int) = FontFamily(
    Font(R.font.manrope_variable, variationSettings = FontVariation.Settings(FontVariation.weight(weight)))
)

internal val DmMono = FontFamily(
    Font(R.font.dm_mono_regular, FontWeight.Normal),
    Font(R.font.dm_mono_medium, FontWeight.Medium),
)

/** Oswald display — masthead, section titles, stat numbers. */
fun britDisplay(
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
fun britBody(
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
fun britMono(
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
