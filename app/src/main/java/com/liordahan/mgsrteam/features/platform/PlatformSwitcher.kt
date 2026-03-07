package com.liordahan.mgsrteam.features.platform

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary

/**
 * Tri-segment platform switcher (Men / Women / Youth).
 *
 * Visually: A dark rounded pill with a sliding gradient-highlighted segment.
 * Each platform gets its own accent colour so the user always knows which
 * universe they're browsing. The indicator slides smoothly with a spring.
 */
@Composable
fun PlatformSwitcher(
    platformManager: PlatformManager,
    onSwitch: (Platform) -> Unit,
    modifier: Modifier = Modifier
) {
    val current by platformManager.current.collectAsState()
    val platforms = Platform.entries
    val density = LocalDensity.current
    val segmentWidth = 100.dp
    val totalWidth = segmentWidth * platforms.size

    val selectedIndex = platforms.indexOf(current)

    // Animated offset for the sliding indicator
    val indicatorOffset: Dp by animateDpAsState(
        targetValue = segmentWidth * selectedIndex,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "indicator_offset"
    )

    Box(
        modifier = modifier
            .width(totalWidth)
            .height(40.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(HomeDarkCard)
    ) {
        // ── Sliding indicator (gradient pill) ────────────────────────
        Box(
            modifier = Modifier
                .offset { IntOffset(with(density) { indicatorOffset.roundToPx() }, 0) }
                .width(segmentWidth)
                .height(40.dp)
                .padding(3.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(
                    brush = current.gradient
                )
        )

        // ── Labels ────────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .width(totalWidth)
                .height(40.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            platforms.forEach { platform ->
                val isSelected = platform == current
                val textColor by animateColorAsState(
                    targetValue = if (isSelected) Color.White else HomeTextSecondary,
                    label = "text_color_${platform.name}"
                )

                Box(
                    modifier = Modifier
                        .width(segmentWidth)
                        .height(40.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) {
                            if (!isSelected) onSwitch(platform)
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        // Tinted emoji badge
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .then(
                                    if (isSelected) Modifier.shadow(4.dp, CircleShape, ambientColor = platform.accent, spotColor = platform.accent)
                                    else Modifier
                                )
                                .background(
                                    color = platform.accent.copy(alpha = if (isSelected) 0.30f else 0.12f),
                                    shape = CircleShape
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = platform.emoji,
                                fontSize = 12.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = stringResource(platform.labelRes),
                            color = textColor,
                            fontSize = 13.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            fontFamily = FontFamily(
                                Font(
                                    if (isSelected) R.font.takeaway_sans_bold
                                    else R.font.takeaway_sans_regular
                                )
                            ),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}
