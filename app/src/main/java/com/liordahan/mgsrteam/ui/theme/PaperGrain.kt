package com.liordahan.mgsrteam.ui.theme

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import kotlin.random.Random

/**
 * Reusable paper-grain overlay that approximates the mock's SVG fractalNoise
 * texture (docs/mobile-prototype — the .brit-room "paper" feel) at a very low
 * ~0.045 alpha. It layers a sparse, deterministic speckle of dark ink dots over
 * the content so editorial surfaces read as printed paper rather than flat UI.
 *
 * Implementation keeps things cheap: the speckle pattern is generated once per
 * size via [drawWithCache] (not re-computed each frame) using a fixed seed, so
 * the grain is stable and does not shimmer on recomposition.
 */

/** Default grain opacity, matching the mock's ~0.045 fractalNoise overlay. */
const val PAPER_GRAIN_ALPHA: Float = 0.045f

/**
 * Draws a tiled paper-grain speckle on top of the content this modifier is
 * applied to. Apply it to a full-screen or card-level [Box].
 *
 * @param alpha overlay opacity (defaults to [PAPER_GRAIN_ALPHA]).
 * @param tint grain dot colour (defaults to the ink token).
 * @param density approximate number of grain dots per 100x100 px tile.
 */
fun Modifier.paperGrain(
    alpha: Float = PAPER_GRAIN_ALPHA,
    tint: Color = BritTokens.ink,
    density: Int = 48,
): Modifier = this.drawWithCache {
    val dots = buildGrainDots(size, density)
    onDrawWithContent {
        drawContent()
        drawGrain(dots, tint, alpha)
    }
}

/**
 * Full-size paper-grain layer meant to sit at the top of a [Box] stack above
 * the editorial content. Prefer this when you cannot thread the modifier onto
 * the content node directly.
 */
@Composable
fun PaperGrainOverlay(
    modifier: Modifier = Modifier,
    alpha: Float = PAPER_GRAIN_ALPHA,
    tint: Color = BritTokens.ink,
    density: Int = 48,
) {
    val grainModifier = remember(alpha, tint, density) {
        Modifier
            .fillMaxSize()
            .drawWithCache {
                val dots = buildGrainDots(size, density)
                onDrawWithContent {
                    drawContent()
                    drawGrain(dots, tint, alpha)
                }
            }
    }
    Box(modifier = modifier.then(grainModifier))
}

/** Deterministic speckle positions + radii for a given surface [size]. */
private fun buildGrainDots(size: Size, density: Int): List<GrainDot> {
    if (size.width <= 0f || size.height <= 0f) return emptyList()
    // Scale the dot count with area so larger surfaces stay evenly textured.
    val tiles = (size.width * size.height) / (100f * 100f)
    val count = (tiles * density).toInt().coerceIn(0, 4000)
    val random = Random(seed = 0x4252_4954L) // fixed "BRIT" seed → stable grain
    return List(count) {
        GrainDot(
            offset = Offset(random.nextFloat() * size.width, random.nextFloat() * size.height),
            radius = 0.4f + random.nextFloat() * 0.6f,
        )
    }
}

private fun ContentDrawScope.drawGrain(dots: List<GrainDot>, tint: Color, alpha: Float) {
    dots.forEach { dot ->
        drawCircle(color = tint, radius = dot.radius, center = dot.offset, alpha = alpha)
    }
}

private data class GrainDot(val offset: Offset, val radius: Float)
