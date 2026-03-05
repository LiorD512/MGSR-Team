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
 *  Instead of branching `if (isWomen)` in every screen file,
 *  all Home* colors resolve through [PlatformPalette].
 *
 *  Men  → original navy / teal / blue-grey
 *  Women→ ATHENA orchid / gold / rose coral on deep purple background
 *  Youth→ keeps the standard (men) palette for now
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
    val isWomen: Boolean = false,
    val isYouth: Boolean = false,
)

// ── Default (Men) palette ──────────────────────────────────────────

private val MenPalette = PlatformPalette(
    background = HomeDarkBackground,
    card = HomeDarkCard,
    cardAlt = HomeDarkCard,
    cardBorder = HomeDarkCardBorder,
    textPrimary = HomeTextPrimary,
    textSecondary = HomeTextSecondary,
    accent = HomeTealAccent,
    accentSecondary = HomeTealAccent,
    green = HomeGreenAccent,
    orange = HomeOrangeAccent,
    red = HomeRedAccent,
    blue = HomeBlueAccent,
    purple = HomePurpleAccent,
    rose = HomeRoseAccent,
    amber = HomeAmberAccent,
    accentGradient = Brush.horizontalGradient(listOf(HomeTealAccent, HomeTealAccent)),
    surfaceGradient = Brush.horizontalGradient(
        listOf(HomeTealAccent.copy(alpha = 0.15f), HomeTealAccent.copy(alpha = 0.08f))
    ),
    cardGradient = Brush.horizontalGradient(listOf(HomeDarkCard, HomeDarkCard)),
    filterSelectedBg = HomeTealAccent,
    filterSelectedText = HomeDarkBackground,
)

// ── ATHENA Women palette ──────────────────────────────────────────

private val WomenPalette = PlatformPalette(
    background = WomenColors.Background,
    card = WomenColors.CardSurface,
    cardAlt = WomenColors.CardSurfaceAlt,
    cardBorder = WomenColors.CardBorder,
    textPrimary = WomenColors.TextPrimary,
    textSecondary = WomenColors.TextSecondary,
    accent = WomenColors.Orchid,
    accentSecondary = WomenColors.Gold,
    green = WomenColors.Success,
    orange = WomenColors.Gold,
    red = WomenColors.RoseCoral,
    blue = WomenColors.Info,
    purple = WomenColors.OrchidLight,
    rose = WomenColors.RoseCoralLight,
    amber = WomenColors.GoldDark,
    accentGradient = WomenDesignSystem.AthenaGradient,
    surfaceGradient = WomenDesignSystem.StatShimmerGradient,
    cardGradient = WomenDesignSystem.CardGradient,
    filterSelectedBg = WomenColors.Orchid,
    filterSelectedText = WomenColors.Background,
    isWomen = true,
)

// ── CompositionLocal ───────────────────────────────────────────────

val LocalPlatformPalette = compositionLocalOf { MenPalette }

// ── NOVA Youth palette ────────────────────────────────────────────

private val YouthPalette = PlatformPalette(
    background = YouthColors.Background,
    card = YouthColors.CardSurface,
    cardAlt = YouthColors.CardSurfaceAlt,
    cardBorder = YouthColors.CardBorder,
    textPrimary = YouthColors.TextPrimary,
    textSecondary = YouthColors.TextSecondary,
    accent = YouthColors.Cyan,
    accentSecondary = YouthColors.Violet,
    green = YouthColors.Success,
    orange = YouthColors.Warning,
    red = YouthColors.Error,
    blue = YouthColors.Info,
    purple = YouthColors.VioletLight,
    rose = YouthColors.Lime,
    amber = YouthColors.LimeDark,
    accentGradient = YouthDesignSystem.NovaHorizontalGradient,
    surfaceGradient = YouthDesignSystem.StatShimmerGradient,
    cardGradient = YouthDesignSystem.CardGradient,
    filterSelectedBg = YouthColors.Cyan,
    filterSelectedText = YouthColors.Background,
    isYouth = true,
)

fun paletteFor(platform: Platform): PlatformPalette = when (platform) {
    Platform.WOMEN -> WomenPalette
    Platform.YOUTH -> YouthPalette
    else -> MenPalette
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
