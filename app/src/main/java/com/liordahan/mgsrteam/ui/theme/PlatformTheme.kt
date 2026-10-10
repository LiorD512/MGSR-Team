package com.liordahan.mgsrteam.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.liordahan.mgsrteam.features.platform.Platform

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Platform-aware color palette via CompositionLocal.
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Instead of branching per platform in every screen file,
 *  all Home* colors resolve through [PlatformPalette].
 *
 *  Men  → roster-aligned premium black / gold / bronze
 *  Youth→ NOVA cyan / violet on deep night background
 *
 *  Usage:  val palette = LocalPlatformPalette.current
 *          Box(Modifier.background(palette.background))
 *
 *  Or use the drop-in aliases:
 *          Box(Modifier.background(platformBackground()))
 */

data class PlatformPalette(
    // ── Backgrounds & Surfaces ──────────────────────────────────
    val background: Color,
    val card: Color,
    val cardAlt: Color,
    val cardBorder: Color,

    // ── Text ────────────────────────────────────────────────────
    val textPrimary: Color,
    val textSecondary: Color,

    // ── Platform accent (primary CTA, chips, highlights) ────────
    val accent: Color,
    val accentSecondary: Color,

    // ── Semantic accents (constant meaning, platform-adapted hue)
    val green: Color,
    val orange: Color,
    val red: Color,
    val blue: Color,
    val purple: Color,
    val rose: Color,
    val amber: Color,

    // ── Gradient helpers ────────────────────────────────────────
    val accentGradient: Brush,
    val surfaceGradient: Brush,
    val cardGradient: Brush,

    // ── Feed filter chip (selected state) ───────────────────────
    val filterSelectedBg: Color,
    val filterSelectedText: Color,

    // ── Platform identity ──────────────────────────────────────
    val isYouth: Boolean = false,
)

// ── Default (Men) palette ──────────────────────────────────────────
//
//  Migrated to the .brit-room cream editorial tokens (BritTokens). The data
//  class shape is unchanged so no call site breaks; only the resolved colours
//  flip from the old dark Home* constants to the paper/gold editorial look.
//  Surfaces are now paper/card/paper-2; primary text = ink; secondary = muted;
//  accent = editorial gold. Semantic hues (green/amber/blue/red) use BritTokens.

private val MenPalette = PlatformPalette(
    background = BritTokens.paper,
    card = BritTokens.card,
    cardAlt = BritTokens.paper2,
    cardBorder = BritTokens.line,
    textPrimary = BritTokens.ink,
    textSecondary = BritTokens.muted,
    accent = BritTokens.gold,
    accentSecondary = BritTokens.goldSoft,
    green = BritTokens.green,
    orange = BritTokens.amber,
    red = BritTokens.red,
    blue = BritTokens.blue,
    purple = BritTokens.gold,
    rose = BritTokens.goldSoft,
    amber = BritTokens.amber,
    accentGradient = Brush.horizontalGradient(listOf(BritTokens.gold, BritTokens.goldSoft)),
    surfaceGradient = Brush.horizontalGradient(
        listOf(BritTokens.gold.copy(alpha = 0.12f), BritTokens.goldSoft.copy(alpha = 0.06f))
    ),
    cardGradient = Brush.horizontalGradient(listOf(BritTokens.card, BritTokens.paper2)),
    filterSelectedBg = BritTokens.gold,
    filterSelectedText = BritTokens.paper,
)

// ── CompositionLocal ───────────────────────────────────────────────

val LocalPlatformPalette = compositionLocalOf { MenPalette }

// ── Youth palette ──────────────────────────────────────────────────
//
//  The mock treats Youth as the SAME paper editorial look as Men, only the
//  accent retints to pitch teal (BritTokens.goldYouth / goldSoftYouth). Cream
//  surfaces + ink/muted text are shared with Men; isYouth stays true so the
//  existing `!palette.isYouth` / `isYouth` branches keep working.

private val YouthPalette = PlatformPalette(
    background = BritTokens.paper,
    card = BritTokens.card,
    cardAlt = BritTokens.paper2,
    cardBorder = BritTokens.line,
    textPrimary = BritTokens.ink,
    textSecondary = BritTokens.muted,
    accent = BritTokens.goldYouth,
    accentSecondary = BritTokens.goldSoftYouth,
    green = BritTokens.green,
    orange = BritTokens.amber,
    red = BritTokens.red,
    blue = BritTokens.blue,
    purple = BritTokens.goldYouth,
    rose = BritTokens.goldSoftYouth,
    amber = BritTokens.amber,
    accentGradient = Brush.horizontalGradient(listOf(BritTokens.goldYouth, BritTokens.goldSoftYouth)),
    surfaceGradient = Brush.horizontalGradient(
        listOf(BritTokens.goldYouth.copy(alpha = 0.12f), BritTokens.goldSoftYouth.copy(alpha = 0.06f))
    ),
    cardGradient = Brush.horizontalGradient(listOf(BritTokens.card, BritTokens.paper2)),
    filterSelectedBg = BritTokens.goldYouth,
    filterSelectedText = BritTokens.paper,
    isYouth = true,
)

fun paletteFor(platform: Platform): PlatformPalette = when (platform) {
    Platform.YOUTH -> YouthPalette
    Platform.MEN -> MenPalette
}

/**
 * Global palette accessor – usable in **any** context (drawBehind,
 * non-composable helpers, top-level vals, etc.).
 *
 * The value is set once by [PlatformThemeProvider] and never changes
 * while a screen is visible, so a plain object property is safe.
 */
object PlatformColors {
    var palette: PlatformPalette = MenPalette
        internal set
}

/**
 * Wrap content in this provider so every child composable can read
 * [LocalPlatformPalette] to get platform-appropriate colors.
 * Also updates [PlatformColors] for non-composable access.
 */
@Composable
fun PlatformThemeProvider(
    platform: Platform,
    content: @Composable () -> Unit
) {
    val palette = remember(platform) { paletteFor(platform) }
    PlatformColors.palette = palette
    CompositionLocalProvider(LocalPlatformPalette provides palette) {
        content()
    }
}
