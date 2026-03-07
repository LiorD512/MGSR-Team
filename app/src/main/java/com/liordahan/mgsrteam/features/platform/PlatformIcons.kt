package com.liordahan.mgsrteam.features.platform

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Football-themed platform insignia icons — 3D-style footballer silhouettes
 * with shadow, gradient fill, rim lighting and specular ball highlights.
 * Rendered at 20 dp inside the platform switcher pill.
 */

// ─── helpers ─────────────────────────────────────────────────

/** Draw a football (soccer ball) with 3D shading */
private fun DrawScope.drawFootball(
    cx: Float, cy: Float, r: Float,
    tintColor: Color, isSelected: Boolean
) {
    val w = size.width
    // Shadow beneath ball
    drawCircle(
        color = Color.Black.copy(alpha = 0.25f),
        radius = r,
        center = Offset(cx + w * 0.01f, cy + w * 0.015f)
    )
    // Ball base — gradient gives 3D roundness
    drawCircle(
        brush = Brush.radialGradient(
            listOf(Color.White, Color(0xFFE0E0E0), Color(0xFFBDBDBD)),
            center = Offset(cx - r * 0.25f, cy - r * 0.25f),
            radius = r * 2f
        ),
        radius = r,
        center = Offset(cx, cy)
    )
    // Pentagon pattern
    drawCircle(
        color = tintColor.copy(alpha = if (isSelected) 0.55f else 0.35f),
        radius = r * 0.40f,
        center = Offset(cx, cy),
        style = Stroke(width = w * 0.018f)
    )
    // Specular highlight dot (top-left)
    drawCircle(
        color = Color.White.copy(alpha = if (isSelected) 0.85f else 0.55f),
        radius = r * 0.22f,
        center = Offset(cx - r * 0.30f, cy - r * 0.30f)
    )
}

/** Draw the shadow silhouette offset behind a body path */
private fun DrawScope.drawShadowPath(path: Path, offset: Float = 0.015f) {
    val w = size.width
    val shadowPath = Path().apply { addPath(path, Offset(w * offset, w * offset)) }
    drawPath(shadowPath, Color.Black.copy(alpha = 0.22f), style = Fill)
}

/** Rim-light stroke along a body path */
private fun DrawScope.drawRimLight(path: Path, alpha: Float) {
    val w = size.width
    drawPath(
        path,
        color = Color.White.copy(alpha = alpha),
        style = Stroke(width = w * 0.025f, cap = StrokeCap.Round)
    )
}

// ═══════════════════════════════════════════════════════════════
// MEN — Powerful footballer mid-volley with ball
// ═══════════════════════════════════════════════════════════════

@Composable
fun MenInsignia(modifier: Modifier = Modifier, isSelected: Boolean = false) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val cx = w * 0.42f
        val so = w * 0.015f // shadow offset

        val darkGrad = Brush.verticalGradient(
            listOf(Color(0xFF004D40), Color(0xFF00695C)),
            startY = 0f, endY = h
        )
        val grad = Brush.verticalGradient(
            listOf(Color(0xFFA7FFEB), Color(0xFF4DB6AC), Color(0xFF00897B)),
            startY = 0f, endY = h
        )
        val rimAlpha = if (isSelected) 0.35f else 0.15f

        // ── shadow pass ──
        drawCircle(Color.Black.copy(alpha = 0.20f), w * 0.11f, Offset(cx + so, h * 0.14f + so))

        // ── Head ──
        drawCircle(brush = darkGrad, radius = w * 0.11f, center = Offset(cx, h * 0.14f))
        drawCircle(brush = grad, radius = w * 0.105f, center = Offset(cx, h * 0.14f))

        // ── Torso (curved) ──
        val torso = Path().apply {
            moveTo(cx - w * 0.11f, h * 0.24f)
            quadraticTo(cx, h * 0.22f, cx + w * 0.09f, h * 0.24f)
            lineTo(cx + w * 0.12f, h * 0.52f)
            quadraticTo(cx, h * 0.54f, cx - w * 0.14f, h * 0.52f)
            close()
        }
        drawShadowPath(torso)
        drawPath(torso, darkGrad, style = Fill)
        drawPath(torso, grad, style = Fill)

        // ── Left arm (balance, stretched) ──
        val leftArm = Path().apply {
            moveTo(cx - w * 0.11f, h * 0.27f)
            quadraticTo(cx - w * 0.24f, h * 0.20f, cx - w * 0.36f, h * 0.19f)
            lineTo(cx - w * 0.34f, h * 0.25f)
            quadraticTo(cx - w * 0.22f, h * 0.27f, cx - w * 0.11f, h * 0.33f)
            close()
        }
        drawShadowPath(leftArm)
        drawPath(leftArm, grad, style = Fill)

        // ── Right arm (tucked) ──
        val rightArm = Path().apply {
            moveTo(cx + w * 0.09f, h * 0.27f)
            quadraticTo(cx + w * 0.18f, h * 0.32f, cx + w * 0.22f, h * 0.38f)
            lineTo(cx + w * 0.17f, h * 0.42f)
            quadraticTo(cx + w * 0.14f, h * 0.36f, cx + w * 0.09f, h * 0.33f)
            close()
        }
        drawPath(rightArm, grad, style = Fill)

        // ── Standing leg (curved calf) ──
        val standLeg = Path().apply {
            moveTo(cx - w * 0.06f, h * 0.50f)
            quadraticTo(cx - w * 0.10f, h * 0.66f, cx - w * 0.14f, h * 0.82f)
            lineTo(cx - w * 0.20f, h * 0.87f)  // boot
            lineTo(cx - w * 0.08f, h * 0.87f)
            quadraticTo(cx - w * 0.02f, h * 0.68f, cx + w * 0.02f, h * 0.50f)
            close()
        }
        drawShadowPath(standLeg)
        drawPath(standLeg, grad, style = Fill)

        // ── Kicking leg (dynamic swing) ──
        val kickLeg = Path().apply {
            moveTo(cx + w * 0.04f, h * 0.50f)
            quadraticTo(cx + w * 0.18f, h * 0.54f, cx + w * 0.30f, h * 0.58f)
            lineTo(cx + w * 0.40f, h * 0.53f) // boot toe
            lineTo(cx + w * 0.36f, h * 0.50f)
            quadraticTo(cx + w * 0.24f, h * 0.50f, cx + w * 0.12f, h * 0.48f)
            close()
        }
        drawShadowPath(kickLeg)
        drawPath(kickLeg, grad, style = Fill)

        // ── Motion lines behind kicking leg ──
        val motionAlpha = if (isSelected) 0.30f else 0.12f
        for (i in 0..2) {
            val y = h * (0.50f + i * 0.03f)
            drawLine(
                Color.White.copy(alpha = motionAlpha * (1f - i * 0.3f)),
                start = Offset(cx + w * 0.04f, y),
                end = Offset(cx + w * 0.16f, y - h * 0.01f),
                strokeWidth = w * 0.015f,
                cap = StrokeCap.Round
            )
        }

        // ── Football ──
        drawFootball(cx + w * 0.48f, h * 0.48f, w * 0.10f, Color(0xFF00897B), isSelected)

        // ── Top highlight (head rim) ──
        drawLine(
            Color.White.copy(alpha = rimAlpha),
            start = Offset(cx - w * 0.04f, h * 0.05f),
            end = Offset(cx + w * 0.04f, h * 0.09f),
            strokeWidth = w * 0.03f,
            cap = StrokeCap.Round
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// WOMEN — Footballer with ponytail, dribbling with ball at feet
// ═══════════════════════════════════════════════════════════════

@Composable
fun WomenInsignia(modifier: Modifier = Modifier, isSelected: Boolean = false) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val cx = w * 0.46f
        val so = w * 0.015f

        val darkGrad = Brush.verticalGradient(
            listOf(Color(0xFF4A148C), Color(0xFF6A1B9A)),
            startY = 0f, endY = h
        )
        val grad = Brush.verticalGradient(
            listOf(Color(0xFFE1BEE7), Color(0xFFCE93D8), Color(0xFF8E24AA)),
            startY = 0f, endY = h
        )
        val rimAlpha = if (isSelected) 0.35f else 0.15f

        // ── shadow pass ──
        drawCircle(Color.Black.copy(alpha = 0.20f), w * 0.10f, Offset(cx + so, h * 0.13f + so))

        // ── Head ──
        drawCircle(brush = darkGrad, radius = w * 0.10f, center = Offset(cx, h * 0.13f))
        drawCircle(brush = grad, radius = w * 0.095f, center = Offset(cx, h * 0.13f))

        // ── Ponytail (smooth flowing curve) ──
        val ponytail = Path().apply {
            moveTo(cx + w * 0.06f, h * 0.07f)
            cubicTo(
                cx + w * 0.28f, h * 0.02f,
                cx + w * 0.38f, h * 0.10f,
                cx + w * 0.32f, h * 0.24f
            )
            quadraticTo(cx + w * 0.26f, h * 0.20f, cx + w * 0.08f, h * 0.14f)
            close()
        }
        drawShadowPath(ponytail)
        drawPath(ponytail, grad, style = Fill)

        // ── Torso (slim, leaning forward) ──
        val torso = Path().apply {
            moveTo(cx - w * 0.09f, h * 0.22f)
            quadraticTo(cx, h * 0.20f, cx + w * 0.07f, h * 0.22f)
            lineTo(cx + w * 0.10f, h * 0.47f)
            quadraticTo(cx, h * 0.49f, cx - w * 0.12f, h * 0.47f)
            close()
        }
        drawShadowPath(torso)
        drawPath(torso, darkGrad, style = Fill)
        drawPath(torso, grad, style = Fill)

        // ── Left arm (balance) ──
        val leftArm = Path().apply {
            moveTo(cx - w * 0.09f, h * 0.25f)
            quadraticTo(cx - w * 0.20f, h * 0.28f, cx - w * 0.30f, h * 0.35f)
            lineTo(cx - w * 0.27f, h * 0.40f)
            quadraticTo(cx - w * 0.18f, h * 0.34f, cx - w * 0.09f, h * 0.31f)
            close()
        }
        drawPath(leftArm, grad, style = Fill)

        // ── Right arm (swing) ──
        val rightArm = Path().apply {
            moveTo(cx + w * 0.07f, h * 0.25f)
            quadraticTo(cx + w * 0.14f, h * 0.28f, cx + w * 0.20f, h * 0.34f)
            lineTo(cx + w * 0.17f, h * 0.39f)
            quadraticTo(cx + w * 0.12f, h * 0.33f, cx + w * 0.07f, h * 0.31f)
            close()
        }
        drawPath(rightArm, grad, style = Fill)

        // ── Left leg (stride forward, curved calf) ──
        val leftLeg = Path().apply {
            moveTo(cx - w * 0.04f, h * 0.45f)
            quadraticTo(cx - w * 0.10f, h * 0.60f, cx - w * 0.16f, h * 0.76f)
            lineTo(cx - w * 0.22f, h * 0.81f) // boot
            lineTo(cx - w * 0.10f, h * 0.81f)
            quadraticTo(cx - w * 0.02f, h * 0.64f, cx + w * 0.04f, h * 0.45f)
            close()
        }
        drawShadowPath(leftLeg)
        drawPath(leftLeg, grad, style = Fill)

        // ── Right leg (behind) ──
        val rightLeg = Path().apply {
            moveTo(cx + w * 0.04f, h * 0.45f)
            quadraticTo(cx + w * 0.09f, h * 0.58f, cx + w * 0.14f, h * 0.73f)
            lineTo(cx + w * 0.20f, h * 0.77f) // boot
            lineTo(cx + w * 0.10f, h * 0.77f)
            quadraticTo(cx + w * 0.08f, h * 0.60f, cx + w * 0.10f, h * 0.45f)
            close()
        }
        drawShadowPath(rightLeg)
        drawPath(rightLeg, grad, style = Fill)

        // ── Football at feet ──
        drawFootball(cx - w * 0.26f, h * 0.87f, w * 0.09f, Color(0xFF8E24AA), isSelected)

        // ── Top rim highlight ──
        drawLine(
            Color.White.copy(alpha = rimAlpha),
            start = Offset(cx - w * 0.03f, h * 0.04f),
            end = Offset(cx + w * 0.03f, h * 0.07f),
            strokeWidth = w * 0.025f,
            cap = StrokeCap.Round
        )

        // ── Gold earring accent with glow ──
        val earX = cx - w * 0.10f
        val earY = h * 0.16f
        drawCircle(
            color = Color(0xFFF5A623).copy(alpha = if (isSelected) 0.30f else 0.12f),
            radius = w * 0.06f,
            center = Offset(earX, earY)
        )
        drawCircle(
            color = Color(0xFFF5A623).copy(alpha = if (isSelected) 0.90f else 0.55f),
            radius = w * 0.028f,
            center = Offset(earX, earY)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// YOUTH — Young footballer sprinting with ball at feet
// ═══════════════════════════════════════════════════════════════

@Composable
fun YouthInsignia(modifier: Modifier = Modifier, isSelected: Boolean = false) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val cx = w * 0.42f  // offset left — running rightward
        val so = w * 0.015f

        val darkGrad = Brush.verticalGradient(
            listOf(Color(0xFF1A237E), Color(0xFF283593)),
            startY = 0f, endY = h
        )
        val grad = Brush.verticalGradient(
            listOf(Color(0xFFB2EBF2), Color(0xFF00BCD4), Color(0xFF7C4DFF)),
            startY = 0f, endY = h
        )
        val rimAlpha = if (isSelected) 0.38f else 0.16f

        // ── Shadow pass (head) ──
        drawCircle(Color.Black.copy(alpha = 0.20f), w * 0.11f, Offset(cx + so, h * 0.12f + so))

        // ── Head (proportionally bigger = youthful) ──
        drawCircle(brush = darkGrad, radius = w * 0.11f, center = Offset(cx, h * 0.12f))
        drawCircle(brush = grad, radius = w * 0.105f, center = Offset(cx, h * 0.12f))

        // ── Torso (slim, leaning forward — sprinting) ──
        val torso = Path().apply {
            moveTo(cx - w * 0.09f, h * 0.22f)
            quadraticTo(cx, h * 0.20f, cx + w * 0.07f, h * 0.22f)
            lineTo(cx + w * 0.10f, h * 0.48f)
            quadraticTo(cx, h * 0.50f, cx - w * 0.12f, h * 0.48f)
            close()
        }
        drawShadowPath(torso)
        drawPath(torso, darkGrad, style = Fill)
        drawPath(torso, grad, style = Fill)

        // ── Left arm (pumping forward) ──
        val leftArm = Path().apply {
            moveTo(cx - w * 0.09f, h * 0.25f)
            quadraticTo(cx - w * 0.18f, h * 0.30f, cx - w * 0.24f, h * 0.38f)
            lineTo(cx - w * 0.20f, h * 0.42f)
            quadraticTo(cx - w * 0.14f, h * 0.34f, cx - w * 0.09f, h * 0.31f)
            close()
        }
        drawPath(leftArm, grad, style = Fill)

        // ── Right arm (pumping back) ──
        val rightArm = Path().apply {
            moveTo(cx + w * 0.07f, h * 0.25f)
            quadraticTo(cx + w * 0.18f, h * 0.22f, cx + w * 0.24f, h * 0.18f)
            lineTo(cx + w * 0.20f, h * 0.14f)
            quadraticTo(cx + w * 0.14f, h * 0.20f, cx + w * 0.07f, h * 0.23f)
            close()
        }
        drawPath(rightArm, grad, style = Fill)

        // ── Left leg (forward stride) ──
        val leftLeg = Path().apply {
            moveTo(cx - w * 0.04f, h * 0.46f)
            quadraticTo(cx - w * 0.02f, h * 0.60f, cx + w * 0.06f, h * 0.76f)
            lineTo(cx + w * 0.12f, h * 0.80f) // boot forward
            lineTo(cx + w * 0.04f, h * 0.80f)
            quadraticTo(cx - w * 0.04f, h * 0.64f, cx + w * 0.02f, h * 0.46f)
            close()
        }
        drawShadowPath(leftLeg)
        drawPath(leftLeg, grad, style = Fill)

        // ── Right leg (pushing off behind) ──
        val rightLeg = Path().apply {
            moveTo(cx + w * 0.04f, h * 0.46f)
            quadraticTo(cx - w * 0.02f, h * 0.58f, cx - w * 0.10f, h * 0.72f)
            lineTo(cx - w * 0.16f, h * 0.76f) // boot behind
            lineTo(cx - w * 0.08f, h * 0.76f)
            quadraticTo(cx, h * 0.60f, cx + w * 0.08f, h * 0.46f)
            close()
        }
        drawShadowPath(rightLeg)
        drawPath(rightLeg, grad, style = Fill)

        // ── ⚽ Football at feet (right side, just ahead) ──
        drawFootball(cx + w * 0.28f, h * 0.78f, w * 0.09f, Color(0xFF7C4DFF), isSelected)

        // ── Speed lines (trailing behind the runner) ──
        val speedAlpha = if (isSelected) 0.35f else 0.14f
        for (i in 0..2) {
            val y = h * (0.30f + i * 0.12f)
            drawLine(
                color = Color(0xFF00E5FF).copy(alpha = speedAlpha * (1f - i * 0.25f)),
                start = Offset(cx - w * 0.34f, y),
                end = Offset(cx - w * 0.14f, y),
                strokeWidth = w * 0.018f,
                cap = StrokeCap.Round
            )
        }

        // ── Rim highlight on head ──
        drawLine(
            Color.White.copy(alpha = rimAlpha),
            start = Offset(cx - w * 0.04f, h * 0.03f),
            end = Offset(cx + w * 0.04f, h * 0.06f),
            strokeWidth = w * 0.025f,
            cap = StrokeCap.Round
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// Dispatcher
// ═══════════════════════════════════════════════════════════════

@Composable
fun PlatformInsignia(
    platform: Platform,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false
) {
    when (platform) {
        Platform.MEN -> MenInsignia(modifier = modifier, isSelected = isSelected)
        Platform.WOMEN -> WomenInsignia(modifier = modifier, isSelected = isSelected)
        Platform.YOUTH -> YouthInsignia(modifier = modifier, isSelected = isSelected)
    }
}
