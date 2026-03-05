package com.liordahan.mgsrteam.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
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
 *  NOVA — Youth Platform Design System
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Design philosophy: Electric. Fresh. Rising.
 *  Celebrates young talent with a palette inspired by
 *  potential (cyan), ambition (violet), and energy (electric lime).
 *
 *  Key differentiators from Men's / Women's platform:
 *  • Vertical-sweep gradients (bottom-to-top = "rising")
 *  • Neon-glow border effects (electric, youthful)
 *  • 16dp rounded shapes (sharp but modern)
 *  • Vibrant cyan ↔ violet spectrum
 *  • Future-forward language ("Prospects", "Rising Stars", "Academy")
 * ═══════════════════════════════════════════════════════════════════
 */

// ── NOVA Youth Color Palette ──
object YouthColors {
    // Primary: Electric Cyan — potential, speed, clarity
    val Cyan            = Color(0xFF00D4FF)
    val CyanLight       = Color(0xFF66E5FF)
    val CyanDark        = Color(0xFF009EC2)

    // Secondary: Vivid Violet — ambition, creativity, the future
    val Violet          = Color(0xFFA855F7)
    val VioletLight     = Color(0xFFC084FC)
    val VioletDark      = Color(0xFF7C3AED)

    // Accent: Electric Lime — energy, growth, breakthrough
    val Lime            = Color(0xFF84CC16)
    val LimeLight       = Color(0xFFA3E635)
    val LimeDark        = Color(0xFF65A30D)

    // Surface: Deep space with cyan undertone
    val Background      = Color(0xFF0A1628)
    val CardSurface     = Color(0xFF121E34)
    val CardSurfaceAlt  = Color(0xFF162440)
    val CardBorder      = Color(0xFF1E3355)
    val CardGlow        = Color(0x3300D4FF) // subtle cyan glow

    // Text
    val TextPrimary     = Color(0xFFE8F4FD) // cool white with cyan tint
    val TextSecondary   = Color(0xFF7BA3C2) // muted steel blue
    val TextAccent      = Color(0xFF66E5FF) // cyan light for links/emphasis

    // Semantic
    val Success         = Lime
    val Warning         = Color(0xFFFBBF24) // amber
    val Error           = Color(0xFFEF4444) // red-500
    val Info            = CyanLight
}

object YouthDesignSystem {

    // ─── SHAPES ──────────────────────────────────────────────────────
    val CardShape = RoundedCornerShape(16.dp)
    val ChipShape = RoundedCornerShape(20.dp)
    val ButtonShape = RoundedCornerShape(14.dp)
    val SmallCardShape = RoundedCornerShape(12.dp)
    val FullRound = RoundedCornerShape(50)

    // ─── Animation Timing ────────────────────────────────────────────
    const val GLOW_PULSE_DURATION_MS = 2200
    const val NEON_FLICKER_DURATION_MS = 1800

    // ─── GRADIENTS ───────────────────────────────────────────────────

    /** Vertical sweep: cyan → violet. The signature "Nova" gradient (rising). */
    val NovaGradient: Brush
        get() = Brush.verticalGradient(
            colors = listOf(YouthColors.Violet, YouthColors.Cyan)
        )

    /** Horizontal variant for chips and buttons. */
    val NovaHorizontalGradient: Brush
        get() = Brush.horizontalGradient(
            colors = listOf(YouthColors.Cyan, YouthColors.Violet)
        )

    /** Subtle card background gradient. */
    val CardGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(
                YouthColors.CardSurface,
                YouthColors.CardSurfaceAlt
            ),
            start = Offset(0f, Float.POSITIVE_INFINITY),
            end = Offset(Float.POSITIVE_INFINITY, 0f)
        )

    /** Neon glow border gradient (cyan → violet → lime). */
    val GlowBorderGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(
                YouthColors.Cyan.copy(alpha = 0.7f),
                YouthColors.Violet.copy(alpha = 0.5f),
                YouthColors.Lime.copy(alpha = 0.4f)
            ),
            start = Offset(0f, 0f),
            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        )

    /** Hero header background — deep immersive gradient. */
    val HeroGradient: Brush
        get() = Brush.verticalGradient(
            colors = listOf(
                YouthColors.VioletDark.copy(alpha = 0.35f),
                YouthColors.CyanDark.copy(alpha = 0.15f),
                YouthColors.Background
            )
        )

    /** Stat card shimmer — cyan → violet → lime cycle. */
    val StatShimmerGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(
                YouthColors.Cyan.copy(alpha = 0.12f),
                YouthColors.Violet.copy(alpha = 0.08f),
                YouthColors.Lime.copy(alpha = 0.10f),
            ),
            start = Offset(0f, Float.POSITIVE_INFINITY),
            end = Offset(Float.POSITIVE_INFINITY, 0f)
        )

    /** Chip selected background — semi-transparent cyan/violet. */
    val ChipSelectedGradient: Brush
        get() = Brush.horizontalGradient(
            colors = listOf(
                YouthColors.Cyan.copy(alpha = 0.25f),
                YouthColors.Violet.copy(alpha = 0.15f),
            )
        )

    /** Surface glow for the scrollable content area. */
    val SurfaceGlow: Brush
        get() = Brush.radialGradient(
            colors = listOf(
                YouthColors.Cyan.copy(alpha = 0.05f),
                Color.Transparent,
            ),
            radius = 800f
        )

    /** Achievement badge gradient — lime-dominant (growth). */
    val AchievementGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(YouthColors.Lime, YouthColors.LimeLight),
            start = Offset(0f, 0f),
            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        )

    // ─── TYPOGRAPHY HELPERS ──────────────────────────────────────────

    /** Hero title — large, bold, with cyan neon glow. */
    val heroTitle: TextStyle
        get() = TextStyle(
            color = YouthColors.TextPrimary,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            shadow = Shadow(
                color = YouthColors.Cyan.copy(alpha = 0.35f),
                offset = Offset(0f, 2f),
                blurRadius = 10f
            )
        )

    /** Section header — medium bold with cyan tint. */
    val sectionHeader: TextStyle
        get() = TextStyle(
            color = YouthColors.TextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold
        )

    /** Empowering tagline — italic gradient-tinted text. */
    val risingStarQuote: TextStyle
        get() = TextStyle(
            color = YouthColors.TextSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.5.sp
        )

    /** Stat value — bold monospaced feel. */
    val statValue: TextStyle
        get() = TextStyle(
            color = YouthColors.TextPrimary,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold
        )

    /** Stat label — small secondary text. */
    val statLabel: TextStyle
        get() = TextStyle(
            color = YouthColors.TextSecondary,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.3.sp
        )

    /** Card title — bold, cool white. */
    val cardTitle: TextStyle
        get() = TextStyle(
            color = YouthColors.TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )

    /** Body secondary — dimmer, supporting text. */
    val bodySecondary: TextStyle
        get() = TextStyle(
            color = YouthColors.TextSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Normal,
            lineHeight = 18.sp
        )
}
