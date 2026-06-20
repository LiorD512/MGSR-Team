package com.liordahan.mgsrteam.ui.theme

import androidx.compose.ui.graphics.Color

val Purple80 = Color(0xFFD0BCFF)
val PurpleGrey80 = Color(0xFFCCC2DC)
val Pink80 = Color(0xFFEFB8C8)

val Purple40 = Color(0xFF6650a4)
val PurpleGrey40 = Color(0xFF625b71)
val Pink40 = Color(0xFF7D5260)


val buttonLoadingBg = Color(0xFF515151)
val buttonEnabledBg = Color(0xFF262626)
val buttonDisabledBg = Color(0XFFEFEDEA)

val contentDisabled = Color(0xFF8C999B)
val contentDefault = Color(0XFF242E30)

val searchHeaderButtonBackground = Color(0xFFF5F3F1)
val dividerColor = Color(0x14000000)
val redErrorColor = Color(0XFFD50525)

// ── Men platform base palette (roster-aligned premium black/gold) ──
val HomeDarkBackground = Color(0xFF0A121E)
val HomeDarkCard = Color(0xFF152131)
val HomeDarkCardBorder = Color(0x55C7A35A)
val HomeTealAccent = Color(0xFFC7A35A)     // kept var name for compatibility; now men gold accent
val HomeDarkCharcoal = Color(0xFF0E1724)
val HomeTextPrimary = Color(0xFFF1E6CF)
val HomeTextSecondary = Color(0xFFBDAE8C)
val HomeGreenAccent = Color(0xFF4CAF50)
val HomeOrangeAccent = Color(0xFFFF9800)
val HomeRedAccent = Color(0xFFE53935)
val HomeBlueAccent = Color(0xFF8CA0BD)
val HomePurpleAccent = Color(0xFFAE8A4A)
val HomeYellowAccent = Color(0xFFE0BC74)
val HomeRoseAccent = Color(0xFFD7A766)
val HomeAmberAccent = Color(0xFFAE8A4A)
val HomeLiveRed = Color(0xFFFF1744)
/** War Room command center — indigo for strategic/tactical hub (unused elsewhere) */
val WarRoomAccent = Color(0xFF6366F1)

// ── Platform accent colours (matched to current product direction) ──
val PlatformMenAccent = HomeTealAccent            // men gold accent
val PlatformWomenAccent = Color(0xFFE8A0BF)       // rose (web --women-rose)
val PlatformWomenSecondary = Color(0xFFD4A5A5)    // blush (web --women-blush)
val PlatformYouthAccent = Color(0xFF00D4FF)       // cyan (web --youth-cyan)
val PlatformYouthSecondary = Color(0xFFA855F7)    // violet (web --youth-violet)

// ── ATHENA Women Design System ──
// A bold, empowering palette that celebrates women athletes
object WomenColors {
    // Primary: Deep Orchid — power, creativity, boldness
    val Orchid          = Color(0xFFB24BF3)
    val OrchidLight     = Color(0xFFD68FFF)
    val OrchidDark      = Color(0xFF8A2BE2)

    // Secondary: Warm Gold — excellence, achievement, triumph
    val Gold            = Color(0xFFF5A623)
    val GoldLight       = Color(0xFFFFD166)
    val GoldDark        = Color(0xFFD4910A)

    // Accent: Rose Coral — energy, warmth, passion
    val RoseCoral       = Color(0xFFFF6B8A)
    val RoseCoralLight  = Color(0xFFFF9EB3)
    val RoseCoralDark   = Color(0xFFE04870)

    // Surface: Midnight with purple undertone
    val Background      = Color(0xFF0D1020)
    val CardSurface     = Color(0xFF1A1530)
    val CardSurfaceAlt  = Color(0xFF201A3A)
    val CardBorder      = Color(0xFF2E2555)
    val CardGlow        = Color(0x33B24BF3) // subtle orchid glow

    // Text
    val TextPrimary     = Color(0xFFF0E6FF) // warm white with lavender tint
    val TextSecondary   = Color(0xFF9B8FC2) // muted lavender
    val TextAccent      = Color(0xFFD68FFF) // orchid light for links/emphasis

    // Semantic
    val Success         = Color(0xFF6EE7B7) // mint green
    val Warning         = Gold
    val Error           = RoseCoral
    val Info            = Color(0xFF93C5FD) // soft blue
}