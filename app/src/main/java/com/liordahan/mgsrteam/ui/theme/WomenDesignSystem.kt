package com.liordahan.mgsrteam.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * ═══════════════════════════════════════════════════════════════════
 *  ATHENA — Women's Platform Design System
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Design philosophy: Bold. Empowering. Elegant.
 *  Celebrates women athletes with a palette inspired by
 *  strength (orchid), excellence (gold), and passion (rose coral).
 *
 *  Key differentiators from Men's platform:
 *  • Diagonal gradients (vs. horizontal)
 *  • Glow-effect cards (vs. flat)
 *  • Warmer text tones (lavender-tinted white)
 *  • Rounded-18dp shapes (vs. 14dp)
 *  • Empowering language ("Athletes", "Stars", "Champions")
 * ═══════════════════════════════════════════════════════════════════
 */
object WomenDesignSystem {

    // ─── SHAPES ──────────────────────────────────────────────────────
    val CardShape = RoundedCornerShape(18.dp)
    val ChipShape = RoundedCornerShape(24.dp)
    val ButtonShape = RoundedCornerShape(16.dp)
    val SmallCardShape = RoundedCornerShape(14.dp)
    val FullRound = RoundedCornerShape(50)

    // ─── GRADIENTS ───────────────────────────────────────────────────

    /** Diagonal gradient: orchid → gold. The signature "Athena" gradient. */
    val AthenaGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(WomenColors.Orchid, WomenColors.Gold),
            start = Offset(0f, 0f),
            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        )

    /** Subtle diagonal gradient for card backgrounds. */
    val CardGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(
                WomenColors.CardSurface,
                WomenColors.CardSurfaceAlt
            ),
            start = Offset(0f, 0f),
            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        )

    /** Glowing card border gradient (orchid glow). */
    val GlowBorderGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(
                WomenColors.Orchid.copy(alpha = 0.6f),
                WomenColors.Gold.copy(alpha = 0.3f),
                WomenColors.RoseCoral.copy(alpha = 0.4f)
            ),
            start = Offset(0f, 0f),
            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        )

    /** Hero header background — deep immersive gradient. */
    val HeroGradient: Brush
        get() = Brush.verticalGradient(
            colors = listOf(
                WomenColors.OrchidDark.copy(alpha = 0.4f),
                WomenColors.Background,
            )
        )

    /** Stat card shimmer — orchid → rose coral → gold cycle. */
    val StatShimmerGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(
                WomenColors.Orchid.copy(alpha = 0.15f),
                WomenColors.RoseCoral.copy(alpha = 0.08f),
                WomenColors.Gold.copy(alpha = 0.12f),
            ),
            start = Offset(0f, 0f),
            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        )

    /** Chip selected background — semi-transparent orchid. */
    val ChipSelectedGradient: Brush
        get() = Brush.horizontalGradient(
            colors = listOf(
                WomenColors.Orchid.copy(alpha = 0.25f),
                WomenColors.Gold.copy(alpha = 0.15f),
            )
        )

    /** Surface glow for the scrollable content area. */
    val SurfaceGlow: Brush
        get() = Brush.radialGradient(
            colors = listOf(
                WomenColors.Orchid.copy(alpha = 0.06f),
                Color.Transparent,
            ),
            radius = 800f
        )

    /** Achievement badge gradient — gold-dominant. */
    val AchievementGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(WomenColors.Gold, WomenColors.GoldLight),
            start = Offset(0f, 0f),
            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        )

    // ─── TYPOGRAPHY HELPERS ──────────────────────────────────────────

    /** Hero title — large, bold, with subtle glow shadow. */
    val heroTitle: TextStyle
        get() = TextStyle(
            color = WomenColors.TextPrimary,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            shadow = Shadow(
                color = WomenColors.Orchid.copy(alpha = 0.3f),
                offset = Offset(0f, 2f),
                blurRadius = 8f
            )
        )

    /** Section header — medium bold with orchid tint. */
    val sectionHeader: TextStyle
        get() = TextStyle(
            color = WomenColors.TextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp
        )

    /** Stat value — large number display. */
    val statValue: TextStyle
        get() = TextStyle(
            color = WomenColors.TextPrimary,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold
        )

    /** Stat label — small descriptor. */
    val statLabel: TextStyle
        get() = TextStyle(
            color = WomenColors.TextSecondary,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.8.sp
        )

    /** Chip text — compact label. */
    val chipText: TextStyle
        get() = TextStyle(
            color = WomenColors.TextPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium
        )

    /** Body — primary reading content. */
    val bodyPrimary: TextStyle
        get() = TextStyle(
            color = WomenColors.TextPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 20.sp
        )

    /** Body secondary — dimmer, supporting text. */
    val bodySecondary: TextStyle
        get() = TextStyle(
            color = WomenColors.TextSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 18.sp
        )

    /** Card title — bold, warm. */
    val cardTitle: TextStyle
        get() = TextStyle(
            color = WomenColors.TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )

    /** Empowerment quote — italic accent text for motivational headers. */
    val empowermentQuote: TextStyle
        get() = TextStyle(
            color = WomenColors.OrchidLight,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 1.sp
        )

    // ─── ELEVATION & SHADOWS ─────────────────────────────────────────

    /** Glow shadow for elevated women-platform cards. */
    val cardGlowShadow: Shadow
        get() = Shadow(
            color = WomenColors.CardGlow,
            offset = Offset(0f, 4f),
            blurRadius = 16f
        )

    // ─── ANIMATION CONSTANTS ─────────────────────────────────────────

    const val CARD_PRESS_SCALE = 0.97f
    const val SHIMMER_DURATION_MS = 1500
    const val GLOW_PULSE_DURATION_MS = 2000
}
