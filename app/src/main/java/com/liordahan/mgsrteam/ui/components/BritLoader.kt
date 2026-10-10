package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.PaperGrainOverlay
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono

/**
 * BRIT SPORT GROUP loader / splash — a Compose port of the mock's `.loader`
 * (docs/mobile-prototype/styles.css "BRIT LOADER").
 *
 * Composition (matching the mock exactly):
 *   • cream paper background with a subtle paper-grain overlay
 *   • a horizontal gold shimmer line sweeping across the centre
 *   • a 3-ring concentric spinner — gold (outer, clockwise) / ink (middle,
 *     counter-clockwise) / gold (inner, fast clockwise)
 *   • a pulsing gold core dot
 *   • the "BRIT SPORT GROUP" Oswald masthead + a mono sub-label
 *   • three pulsing gold dots
 *
 * Shown during the initial auth/data load before the first screen renders.
 */
@Composable
fun BritLoader(
    modifier: Modifier = Modifier,
    title: String = "BRIT SPORT GROUP",
    subtitle: String = "MANAGEMENT ROOM",
) {
    val transition = rememberInfiniteTransition(label = "brit_loader")

    // Ring rotations.
    val outerRotation by transition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(2400, easing = LinearEasing)),
        label = "ring_outer",
    )
    val middleRotation by transition.animateFloat(
        initialValue = 360f, targetValue = 0f,
        animationSpec = infiniteRepeatable(tween(1800, easing = LinearEasing)),
        label = "ring_middle",
    )
    val innerRotation by transition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing)),
        label = "ring_inner",
    )

    // Core pulse (scale 1 → 1.2 → 1).
    val corePulse by transition.animateFloat(
        initialValue = 1f, targetValue = 1.2f,
        animationSpec = infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Reverse),
        label = "core_pulse",
    )

    // Shimmer sweep (-0.3 → 0.3 of width).
    val shimmer by transition.animateFloat(
        initialValue = -0.3f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(2600, easing = LinearEasing), RepeatMode.Reverse),
        label = "shimmer",
    )

    val gold = BritTokens.gold
    val ink = BritTokens.ink

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFFF5F1E8), Color(0xFFFAF7F0)),
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        PaperGrainOverlay()

        // ── Shimmer hairline across centre ──
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            Color.Transparent,
                            gold.copy(alpha = 0.4f),
                            gold.copy(alpha = 0.7f),
                            gold.copy(alpha = 0.4f),
                            Color.Transparent,
                        ),
                        startX = shimmer * 1000f,
                        endX = shimmer * 1000f + 1000f,
                    )
                )
        )

        Column(horizontalAlignment = Alignment.CenterHorizontally) {

            // ── 3-ring spinner + pulsing core ──
            Box(
                modifier = Modifier.size(120.dp),
                contentAlignment = Alignment.Center,
            ) {
                Ring(size = 120.dp, rotation = outerRotation, topColor = gold, trailColor = gold.copy(alpha = 0.3f))
                Ring(size = 85.dp, rotation = middleRotation, topColor = ink, trailColor = ink.copy(alpha = 0.2f))
                Ring(size = 55.dp, rotation = innerRotation, topColor = gold, trailColor = Color.Transparent)
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .scale(corePulse)
                        .clip(CircleShape)
                        .background(gold)
                )
            }

            Spacer(Modifier.height(44.dp))

            Text(
                text = title,
                style = britDisplay(ink, 30.sp, weight = 600, letterSpacing = 1.sp),
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = subtitle,
                style = britMono(BritTokens.muted, 10.sp, letterSpacing = 2.6.sp),
            )
            Spacer(Modifier.height(18.dp))

            // ── Three pulsing dots ──
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(3) { index ->
                    val dotPulse by transition.animateFloat(
                        initialValue = 0.5f, targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            tween(1400, delayMillis = index * 200, easing = LinearEasing),
                            RepeatMode.Reverse,
                        ),
                        label = "dot_$index",
                    )
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .scale(dotPulse)
                            .clip(CircleShape)
                            .background(gold.copy(alpha = dotPulse))
                    )
                }
            }
        }
    }
}

/** One spinner ring: a transparent circle with a coloured top arc + faint trail. */
@Composable
private fun Ring(
    size: androidx.compose.ui.unit.Dp,
    rotation: Float,
    topColor: Color,
    trailColor: Color,
) {
    Canvas(
        modifier = Modifier
            .size(size)
            .rotate(rotation)
    ) {
        val stroke = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        val inset = 3.dp.toPx()
        val arcSize = androidx.compose.ui.geometry.Size(
            this.size.width - inset * 2,
            this.size.height - inset * 2,
        )
        val topLeft = Offset(inset, inset)
        // Faint trailing quarter.
        drawArc(
            color = trailColor,
            startAngle = -45f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = stroke,
        )
        // Bright leading quarter (the "border-top-color" of the mock).
        drawArc(
            color = topColor,
            startAngle = -135f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = stroke,
        )
    }
}
