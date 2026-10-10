package com.liordahan.mgsrteam.ui.components

import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color

/**
 * BRIT icon set — Compose [ImageVector]s ported 1:1 from the authoritative mock
 * (docs/mobile-prototype/app.js `ICONS`). Every path string there is copied
 * verbatim into a Compose [path] here so the chrome (tab bar, More sheet, quick
 * actions) renders the same line-art the mock uses.
 *
 * All icons use a 24x24 viewport, stroke rendering, no fill (matching
 * `svg(name)` in the mock: fill="none" stroke="currentColor" stroke-width≈1.8),
 * with round caps/joins. Tint is applied at the call site via `tint = ...` on
 * [androidx.compose.material3.Icon].
 */
object BritIcons {

    private const val STROKE_WIDTH = 1.8f

    private fun strokeIcon(
        name: String,
        pathData: androidx.compose.ui.graphics.vector.PathBuilder.() -> Unit,
    ): ImageVector = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(
            stroke = SolidColor(Color.Black), // overridden by Icon tint
            strokeLineWidth = STROKE_WIDTH,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
            pathBuilder = pathData,
        )
    }.build()

    /** M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z */
    val Dashboard: ImageVector = strokeIcon("brit_dashboard") {
        moveTo(3f, 13f); horizontalLineTo(11f); verticalLineTo(3f); horizontalLineTo(3f); verticalLineTo(13f); close()
        moveTo(3f, 21f); horizontalLineTo(11f); verticalLineTo(15f); horizontalLineTo(3f); verticalLineTo(21f); close()
        moveTo(13f, 21f); horizontalLineTo(21f); verticalLineTo(11f); horizontalLineTo(13f); verticalLineTo(21f); close()
        moveTo(13f, 3f); verticalLineToRelative(6f); horizontalLineTo(21f); verticalLineTo(3f); horizontalLineTo(13f); close()
    }

    /** Two people (roster/players). */
    val Players: ImageVector = strokeIcon("brit_players") {
        moveTo(17f, 21f); verticalLineToRelative(-2f)
        arcToRelative(4f, 4f, 0f, false, false, -4f, -4f)
        horizontalLineTo(5f)
        arcToRelative(4f, 4f, 0f, false, false, -4f, 4f)
        verticalLineToRelative(2f)
        moveTo(13f, 7f)
        arcToRelative(4f, 4f, 0f, true, true, -8f, 0f)
        arcToRelative(4f, 4f, 0f, false, true, 8f, 0f)
        close()
        moveTo(23f, 21f); verticalLineToRelative(-2f)
        arcToRelative(4f, 4f, 0f, false, false, -3f, -3.87f)
        moveTo(16f, 3.13f)
        arcToRelative(4f, 4f, 0f, false, true, 0f, 7.75f)
    }

    /** Flag / war room. */
    val WarRoom: ImageVector = strokeIcon("brit_war_room") {
        moveTo(9.75f, 3.104f)
        verticalLineToRelative(5.714f)
        arcToRelative(2.25f, 2.25f, 0f, false, true, -0.659f, 1.591f)
        lineTo(5f, 14.5f)
        moveTo(9.75f, 3.104f)
        curveToRelative(-0.251f, 0.023f, -0.501f, 0.05f, -0.75f, 0.082f)
        moveToRelative(0.75f, -0.082f)
        arcToRelative(24.301f, 24.301f, 0f, false, true, 4.5f, 0f)
        verticalLineToRelative(5.714f)
        arcToRelative(2.25f, 2.25f, 0f, false, false, 0.659f, 1.591f)
        lineTo(19f, 14.5f)
        moveToRelative(-4.75f, -11.396f)
        curveToRelative(0.251f, 0.023f, 0.501f, 0.05f, 0.75f, 0.082f)
        moveTo(12f, 21f)
        arcToRelative(8.966f, 8.966f, 0f, false, false, 5.982f, -2.275f)
        moveTo(12f, 21f)
        arcToRelative(8.966f, 8.966f, 0f, false, true, -5.982f, -2.275f)
        moveTo(12f, 21f)
        verticalLineTo(14.5f)
    }

    /** Clipboard check / tasks. */
    val Tasks: ImageVector = strokeIcon("brit_tasks") {
        moveTo(9f, 5f); horizontalLineTo(7f)
        arcToRelative(2f, 2f, 0f, false, false, -2f, 2f)
        verticalLineToRelative(12f)
        arcToRelative(2f, 2f, 0f, false, false, 2f, 2f)
        horizontalLineToRelative(10f)
        arcToRelative(2f, 2f, 0f, false, false, 2f, -2f)
        verticalLineTo(7f)
        arcToRelative(2f, 2f, 0f, false, false, -2f, -2f)
        horizontalLineToRelative(-2f)
        moveTo(9f, 5f)
        arcToRelative(2f, 2f, 0f, false, false, 2f, 2f)
        horizontalLineToRelative(2f)
        arcToRelative(2f, 2f, 0f, false, false, 2f, -2f)
        moveTo(9f, 5f)
        arcToRelative(2f, 2f, 0f, false, true, 2f, -2f)
        horizontalLineToRelative(2f)
        arcToRelative(2f, 2f, 0f, false, true, 2f, 2f)
        moveToRelative(-6f, 9f)
        lineToRelative(2f, 2f)
        lineToRelative(4f, -4f)
    }

    /** Three dots (More). */
    val More: ImageVector = strokeIcon("brit_more") {
        moveTo(5f, 10.5f)
        arcToRelative(1.5f, 1.5f, 0f, true, true, 0f, 3f)
        arcToRelative(1.5f, 1.5f, 0f, false, true, 0f, -3f)
        close()
        moveTo(12f, 10.5f)
        arcToRelative(1.5f, 1.5f, 0f, true, true, 0f, 3f)
        arcToRelative(1.5f, 1.5f, 0f, false, true, 0f, -3f)
        close()
        moveTo(19f, 10.5f)
        arcToRelative(1.5f, 1.5f, 0f, true, true, 0f, 3f)
        arcToRelative(1.5f, 1.5f, 0f, false, true, 0f, -3f)
        close()
    }

    /** Star (shortlist). */
    val Shortlist: ImageVector = strokeIcon("brit_shortlist") {
        moveTo(11.049f, 2.927f)
        curveToRelative(0.3f, -0.921f, 1.603f, -0.921f, 1.902f, 0f)
        lineToRelative(1.519f, 4.674f)
        arcToRelative(1f, 1f, 0f, false, false, 0.95f, 0.69f)
        horizontalLineToRelative(4.915f)
        curveToRelative(0.969f, 0f, 1.371f, 1.24f, 0.588f, 1.81f)
        lineToRelative(-3.976f, 2.888f)
        arcToRelative(1f, 1f, 0f, false, false, -0.363f, 1.118f)
        lineToRelative(1.518f, 4.674f)
        curveToRelative(0.3f, 0.922f, -0.755f, 1.688f, -1.538f, 1.118f)
        lineToRelative(-3.976f, -2.888f)
        arcToRelative(1f, 1f, 0f, false, false, -1.176f, 0f)
        lineToRelative(-3.976f, 2.888f)
        curveToRelative(-0.783f, 0.57f, -1.838f, -0.197f, -1.538f, -1.118f)
        lineToRelative(1.518f, -4.674f)
        arcToRelative(1f, 1f, 0f, false, false, -0.363f, -1.118f)
        lineTo(2.08f, 10.1f)
        curveToRelative(-0.784f, -0.57f, -0.38f, -1.81f, 0.588f, -1.81f)
        horizontalLineToRelative(4.914f)
        arcToRelative(1f, 1f, 0f, false, false, 0.951f, -0.69f)
        lineToRelative(1.519f, -4.674f)
        close()
    }

    /** Radar / signal rings (market radar). */
    val MarketRadar: ImageVector = strokeIcon("brit_market_radar") {
        moveTo(9.348f, 14.651f)
        arcToRelative(3.75f, 3.75f, 0f, false, true, 0f, -5.303f)
        moveToRelative(5.304f, 0f)
        arcToRelative(3.75f, 3.75f, 0f, false, true, 0f, 5.303f)
        moveToRelative(-7.425f, 2.122f)
        arcToRelative(6.75f, 6.75f, 0f, false, true, 0f, -9.546f)
        moveToRelative(9.546f, 0f)
        arcToRelative(6.75f, 6.75f, 0f, false, true, 0f, 9.546f)
        moveTo(5.106f, 18.894f)
        arcToRelative(9.75f, 9.75f, 0f, false, true, 0f, -13.788f)
        moveToRelative(13.788f, 0f)
        arcToRelative(9.75f, 9.75f, 0f, false, true, 0f, 13.788f)
        moveTo(12f, 12f)
        horizontalLineToRelative(0.008f)
        verticalLineToRelative(0.008f)
        horizontalLineTo(12f)
        verticalLineTo(12f)
        close()
    }

    /** Logout-ish arrow (releases). */
    val Releases: ImageVector = strokeIcon("brit_releases") {
        moveTo(15.75f, 9f)
        verticalLineTo(5.25f)
        arcTo(2.25f, 2.25f, 0f, false, false, 13.5f, 3f)
        horizontalLineToRelative(-6f)
        arcToRelative(2.25f, 2.25f, 0f, false, false, -2.25f, 2.25f)
        verticalLineToRelative(13.5f)
        arcTo(2.25f, 2.25f, 0f, false, false, 7.5f, 21f)
        horizontalLineToRelative(6f)
        arcToRelative(2.25f, 2.25f, 0f, false, false, 2.25f, -2.25f)
        verticalLineTo(15f)
        moveToRelative(3f, 0f)
        lineToRelative(3f, -3f)
        moveToRelative(0f, 0f)
        lineToRelative(-3f, -3f)
        moveToRelative(3f, 3f)
        horizontalLineTo(9f)
    }

    /** Transfer arrows (club changes). */
    val ClubChanges: ImageVector = strokeIcon("brit_club_changes") {
        moveTo(4.5f, 7.5f); horizontalLineToRelative(10.5f)
        moveToRelative(-10.5f, 9f); horizontalLineToRelative(10.5f)
        moveToRelative(0f, 0f); lineToRelative(-3f, -3f)
        moveToRelative(3f, 3f); lineToRelative(-3f, 3f)
        moveToRelative(3f, -12f); lineToRelative(3f, -3f)
        moveToRelative(-3f, 3f); lineToRelative(3f, 3f)
    }

    /** Document with fold (contract finisher). */
    val ContractFinisher: ImageVector = strokeIcon("brit_contract_finisher") {
        moveTo(19.5f, 14.25f)
        verticalLineToRelative(-2.625f)
        arcToRelative(3.375f, 3.375f, 0f, false, false, -3.375f, -3.375f)
        horizontalLineToRelative(-1.5f)
        arcTo(1.125f, 1.125f, 0f, false, true, 13.5f, 7.125f)
        verticalLineToRelative(-1.5f)
        arcToRelative(3.375f, 3.375f, 0f, false, false, -3.375f, -3.375f)
        horizontalLineTo(8.25f)
        moveToRelative(0f, 12.75f)
        horizontalLineToRelative(7.5f)
        moveToRelative(-7.5f, 3f)
        horizontalLineTo(12f)
        moveTo(10.5f, 2.25f)
        horizontalLineTo(5.625f)
        curveToRelative(-0.621f, 0f, -1.125f, 0.504f, -1.125f, 1.125f)
        verticalLineToRelative(17.25f)
        curveToRelative(0f, 0.621f, 0.504f, 1.125f, 1.125f, 1.125f)
        horizontalLineToRelative(12.75f)
        curveToRelative(0.621f, 0f, 1.125f, -0.504f, 1.125f, -1.125f)
        verticalLineTo(11.25f)
        arcToRelative(9f, 9f, 0f, false, false, -9f, -9f)
        close()
    }

    /** Return arrow (returnees). */
    val Returnees: ImageVector = strokeIcon("brit_returnees") {
        moveTo(9f, 15f); lineTo(3f, 9f)
        moveToRelative(0f, 0f); lineToRelative(6f, -6f)
        moveTo(3f, 9f); horizontalLineToRelative(12f)
        arcToRelative(6f, 6f, 0f, false, true, 0f, 12f)
        horizontalLineToRelative(-3f)
    }

    /** Phone (contacts). */
    val Contacts: ImageVector = strokeIcon("brit_contacts") {
        moveTo(2.25f, 6.75f)
        curveToRelative(0f, 8.284f, 6.716f, 15f, 15f, 15f)
        horizontalLineToRelative(2.25f)
        arcToRelative(2.25f, 2.25f, 0f, false, false, 2.25f, -2.25f)
        verticalLineToRelative(-1.372f)
        curveToRelative(0f, -0.516f, -0.351f, -0.966f, -0.852f, -1.091f)
        lineToRelative(-4.423f, -1.106f)
        curveToRelative(-0.44f, -0.11f, -0.902f, 0.055f, -1.173f, 0.417f)
        lineToRelative(-0.97f, 1.293f)
        curveToRelative(-0.282f, 0.376f, -0.769f, 0.542f, -1.21f, 0.38f)
        arcToRelative(12.035f, 12.035f, 0f, false, true, -7.143f, -7.143f)
        curveToRelative(-0.162f, -0.441f, 0.004f, -0.928f, 0.38f, -1.21f)
        lineToRelative(1.293f, -0.97f)
        curveToRelative(0.363f, -0.271f, 0.527f, -0.734f, 0.417f, -1.173f)
        lineTo(6.963f, 3.102f)
        arcToRelative(1.125f, 1.125f, 0f, false, false, -1.091f, -0.852f)
        horizontalLineTo(4.5f)
        arcTo(2.25f, 2.25f, 0f, false, false, 2.25f, 4.5f)
        verticalLineToRelative(2.25f)
        close()
    }

    /** Envelope (requests). */
    val Requests: ImageVector = strokeIcon("brit_requests") {
        moveTo(21.75f, 6.75f)
        verticalLineToRelative(10.5f)
        arcToRelative(2.25f, 2.25f, 0f, false, true, -2.25f, 2.25f)
        horizontalLineToRelative(-15f)
        arcToRelative(2.25f, 2.25f, 0f, false, true, -2.25f, -2.25f)
        verticalLineTo(6.75f)
        moveToRelative(19.5f, 0f)
        arcTo(2.25f, 2.25f, 0f, false, false, 19.5f, 4.5f)
        horizontalLineToRelative(-15f)
        arcToRelative(2.25f, 2.25f, 0f, false, false, -2.25f, 2.25f)
        moveToRelative(19.5f, 0f)
        verticalLineToRelative(0.243f)
        arcToRelative(2.25f, 2.25f, 0f, false, true, -1.07f, 1.916f)
        lineToRelative(-7.5f, 4.615f)
        arcToRelative(2.25f, 2.25f, 0f, false, true, -2.36f, 0f)
        lineTo(3.32f, 8.91f)
        arcToRelative(2.25f, 2.25f, 0f, false, true, -1.07f, -1.916f)
        verticalLineTo(6.75f)
    }

    /** Sparkle (AI scout). */
    val AiScout: ImageVector = strokeIcon("brit_ai_scout") {
        moveTo(9.813f, 15.904f)
        lineTo(9f, 18.75f)
        lineToRelative(-0.813f, -2.846f)
        arcToRelative(4.5f, 4.5f, 0f, false, false, -3.09f, -3.09f)
        lineTo(2.25f, 12f)
        lineToRelative(2.846f, -0.813f)
        arcToRelative(4.5f, 4.5f, 0f, false, false, 3.09f, -3.09f)
        lineTo(9f, 5.25f)
        lineToRelative(0.813f, 2.846f)
        arcToRelative(4.5f, 4.5f, 0f, false, false, 3.09f, 3.09f)
        lineTo(15.75f, 12f)
        lineToRelative(-2.846f, 0.813f)
        arcToRelative(4.5f, 4.5f, 0f, false, false, -3.09f, 3.09f)
        close()
        moveTo(18.259f, 8.715f)
        lineTo(18f, 9.75f)
        lineToRelative(-0.259f, -1.035f)
        arcToRelative(3.375f, 3.375f, 0f, false, false, -2.455f, -2.456f)
        lineTo(14.25f, 6f)
        lineToRelative(1.036f, -0.259f)
        arcToRelative(3.375f, 3.375f, 0f, false, false, 2.455f, -2.456f)
        lineTo(18f, 2.25f)
        lineToRelative(0.259f, 1.035f)
        arcToRelative(3.375f, 3.375f, 0f, false, false, 2.456f, 2.456f)
        lineTo(21.75f, 6f)
        lineToRelative(-1.035f, 0.259f)
        arcToRelative(3.375f, 3.375f, 0f, false, false, -2.456f, 2.456f)
        close()
    }

    /** Chat bubbles (The Tunnel). */
    val Tunnel: ImageVector = strokeIcon("brit_tunnel") {
        moveTo(20.25f, 8.511f)
        curveToRelative(0.884f, 0.284f, 1.5f, 1.128f, 1.5f, 2.097f)
        verticalLineToRelative(4.286f)
        curveToRelative(0f, 1.136f, -0.847f, 2.1f, -1.98f, 2.193f)
        curveToRelative(-0.34f, 0.027f, -0.68f, 0.052f, -1.02f, 0.072f)
        verticalLineToRelative(3.091f)
        lineToRelative(-3f, -3f)
        curveToRelative(-1.354f, 0f, -2.694f, -0.055f, -4.02f, -0.163f)
        arcToRelative(2.115f, 2.115f, 0f, false, true, -0.825f, -0.242f)
        moveToRelative(9.345f, -8.334f)
        arcToRelative(2.126f, 2.126f, 0f, false, false, -0.476f, -0.095f)
        arcToRelative(48.64f, 48.64f, 0f, false, false, -8.048f, 0f)
        curveToRelative(-1.131f, 0.094f, -1.976f, 1.057f, -1.976f, 2.192f)
        verticalLineToRelative(4.286f)
        curveToRelative(0f, 0.837f, 0.46f, 1.58f, 1.155f, 1.951f)
        moveToRelative(9.345f, -8.334f)
        verticalLineTo(6.637f)
        curveToRelative(0f, -1.621f, -1.152f, -3.026f, -2.76f, -3.235f)
        arcTo(48.455f, 48.455f, 0f, false, false, 11.25f, 3f)
        curveToRelative(-2.115f, 0f, -4.198f, 0.137f, -6.24f, 0.402f)
        curveToRelative(-1.608f, 0.209f, -2.76f, 1.614f, -2.76f, 3.235f)
        verticalLineToRelative(6.226f)
        curveToRelative(0f, 1.621f, 1.152f, 3.026f, 2.76f, 3.235f)
        curveToRelative(0.577f, 0.075f, 1.157f, 0.14f, 1.74f, 0.194f)
        verticalLineTo(21f)
        lineToRelative(4.155f, -4.155f)
    }

    /** Hamburger rows (roster list). */
    val Roster: ImageVector = strokeIcon("brit_roster") {
        moveTo(3.75f, 6.75f); horizontalLineToRelative(16.5f)
        moveTo(3.75f, 12f); horizontalLineToRelative(16.5f)
        moveToRelative(-16.5f, 5.25f); horizontalLineToRelative(16.5f)
    }

    /** Bell (notifications). */
    val Bell: ImageVector = strokeIcon("brit_bell") {
        moveTo(14.857f, 17.082f)
        arcToRelative(23.848f, 23.848f, 0f, false, false, 5.454f, -1.31f)
        arcTo(8.967f, 8.967f, 0f, false, true, 18f, 9.75f)
        verticalLineTo(9f)
        arcTo(6f, 6f, 0f, false, false, 6f, 9f)
        verticalLineToRelative(0.75f)
        arcToRelative(8.967f, 8.967f, 0f, false, true, -2.312f, 6.022f)
        curveToRelative(1.733f, 0.64f, 3.56f, 1.085f, 5.455f, 1.31f)
        moveToRelative(5.714f, 0f)
        arcToRelative(24.255f, 24.255f, 0f, false, true, -5.714f, 0f)
        moveToRelative(5.714f, 0f)
        arcToRelative(3f, 3f, 0f, true, true, -5.714f, 0f)
    }

    /** Back chevron. */
    val Back: ImageVector = strokeIcon("brit_back") {
        moveTo(15.75f, 19.5f); lineTo(8.25f, 12f); lineToRelative(7.5f, -7.5f)
    }

    /** Right arrow. */
    val Arrow: ImageVector = strokeIcon("brit_arrow") {
        moveTo(13.5f, 4.5f); lineTo(21f, 12f)
        moveToRelative(0f, 0f); lineToRelative(-7.5f, 7.5f)
        moveTo(21f, 12f); horizontalLineTo(3f)
    }

    /** Close X. */
    val Close: ImageVector = strokeIcon("brit_close") {
        moveTo(6f, 18f); lineTo(18f, 6f)
        moveTo(6f, 6f); lineToRelative(12f, 12f)
    }
}
