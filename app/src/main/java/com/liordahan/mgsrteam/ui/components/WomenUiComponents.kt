package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.WomenColors
import com.liordahan.mgsrteam.ui.theme.WomenDesignSystem
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

// ═══════════════════════════════════════════════════════════════════
//  Shared Women Platform UI Components — ATHENA Design System
//  Use across all screens when Platform.WOMEN is active.
// ═══════════════════════════════════════════════════════════════════

/**
 * Gradient accent bar for section headers on women platform.
 * Replaces the solid teal bar with an orchid → gold diagonal gradient.
 */
@Composable
fun WomenSectionAccentBar(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .width(48.dp)
            .height(3.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(WomenDesignSystem.AthenaGradient)
    )
}

/**
 * Section header with ATHENA gradient accent bar.
 */
@Composable
fun WomenSectionHeader(title: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = title,
            style = boldTextStyle(WomenColors.TextPrimary, 18.sp)
        )
        WomenSectionAccentBar()
    }
}

/**
 * Glow ring around player photo for women platform.
 * Uses pulsing orchid → gold gradient border.
 */
@Composable
fun WomenGlowPhotoRing(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "glow_ring")
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 0.9f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = WomenDesignSystem.GLOW_PULSE_DURATION_MS,
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow_alpha"
    )

    Box(
        modifier = modifier
            .border(
                width = 2.dp,
                brush = Brush.linearGradient(
                    colors = listOf(
                        WomenColors.Orchid.copy(alpha = glowAlpha),
                        WomenColors.Gold.copy(alpha = glowAlpha),
                        WomenColors.RoseCoral.copy(alpha = glowAlpha)
                    ),
                    start = Offset.Zero,
                    end = Offset(100f, 100f)
                ),
                shape = CircleShape
            )
            .padding(3.dp),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}

/**
 * Gradient FAB for women platform — orchid → gold diagonal.
 */
@Composable
fun WomenGradientFab(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val orchid = WomenColors.Orchid
    val gold = WomenColors.Gold
    val bg = WomenColors.Background

    Box(
        modifier = modifier
            .size(56.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(orchid, gold),
                    start = Offset.Zero,
                    end = Offset(56f, 56f)
                )
            )
            .clickWithNoRipple { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Filled.PersonAdd,
            contentDescription = stringResource(R.string.players_add_player),
            modifier = Modifier.size(24.dp),
            tint = Color.White
        )
    }
}

/**
 * Women-specific empty state for roster / player list.
 * Trophy icon with empowering messaging.
 */
@Composable
fun WomenRosterEmptyState(
    onAddPlayerClick: () -> Unit,
    onResetFiltersClicked: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(WomenColors.Background)
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Trophy icon with glow ring
            WomenGlowPhotoRing(
                modifier = Modifier.size(96.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(86.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    WomenColors.Orchid.copy(alpha = 0.25f),
                                    WomenColors.Background
                                )
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.EmojiEvents,
                        contentDescription = null,
                        modifier = Modifier.size(44.dp),
                        tint = WomenColors.Gold
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = stringResource(R.string.women_empty_state_title),
                style = boldTextStyle(WomenColors.TextPrimary, 20.sp),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = stringResource(R.string.women_empty_state_subtitle),
                style = regularTextStyle(WomenColors.TextSecondary, 14.sp),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(28.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Add Athlete — gradient orchid → gold
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(WomenDesignSystem.AthenaGradient)
                        .clickWithNoRipple { onAddPlayerClick() }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.women_quick_athletes),
                        style = boldTextStyle(Color.White, 14.sp)
                    )
                }

                // Reset Filters — gradient outlined
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .border(
                            1.dp,
                            Brush.linearGradient(
                                listOf(WomenColors.Orchid, WomenColors.Gold)
                            ),
                            RoundedCornerShape(12.dp)
                        )
                        .clickWithNoRipple { onResetFiltersClicked() }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.players_reset_filters),
                        style = boldTextStyle(WomenColors.Orchid, 14.sp)
                    )
                }
            }
        }
    }
}

/**
 * Gradient card border for women platform cards.
 * Use as a border modifier on Card components.
 */
@Composable
fun Modifier.womenCardGlow(): Modifier {
    return this.border(
        width = 1.dp,
        brush = Brush.linearGradient(
            colors = listOf(
                WomenColors.Orchid.copy(alpha = 0.3f),
                WomenColors.Gold.copy(alpha = 0.15f),
                WomenColors.RoseCoral.copy(alpha = 0.2f)
            ),
            start = Offset.Zero,
            end = Offset(300f, 300f)
        ),
        shape = RoundedCornerShape(16.dp)
    )
}

/**
 * Gradient divider for women platform.
 */
@Composable
fun WomenGradientDivider(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(
                Brush.horizontalGradient(
                    listOf(
                        WomenColors.Orchid.copy(alpha = 0.3f),
                        WomenColors.Gold.copy(alpha = 0.15f),
                        Color.Transparent
                    )
                )
            )
    )
}
