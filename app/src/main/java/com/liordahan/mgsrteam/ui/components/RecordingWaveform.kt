package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent

/**
 * Animated waveform bars for voice recording feedback.
 * Uses GPU-accelerated scaleY animation.
 */
@Composable
fun RecordingWaveform(
    barCount: Int = 7,
    color: Color = HomeTealAccent,
    barWidth: Dp = 4.dp,
    barHeight: Dp = 8.dp,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "waveform")
    val barScales = (0 until barCount).map { index ->
        infiniteTransition.animateFloat(
            initialValue = 0.3f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable<Float>(
                animation = tween(400, delayMillis = index * 60),
                repeatMode = RepeatMode.Reverse
            ),
            label = "bar_$index"
        )
    }
    Row(
        modifier = modifier.height(40.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        barScales.forEach { scaleState ->
            Box(
                modifier = Modifier
                    .padding(horizontal = 2.dp)
                    .width(barWidth)
                    .height(barHeight)
                    .graphicsLayer {
                        scaleY = scaleState.value
                        transformOrigin = TransformOrigin.Center
                    }
                    .clip(RoundedCornerShape(2.dp))
                    .background(color)
            )
        }
    }
}
