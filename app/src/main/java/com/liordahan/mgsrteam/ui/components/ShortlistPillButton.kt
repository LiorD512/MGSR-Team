package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.PlatformColors

/**
 * Compact pill-shaped shortlist button (Option B — 28dp) with three visual states:
 *   • idle     – subtle teal-tinted outline  "+ Shortlist"
 *   • loading  – spinner + "Adding…"
 *   • done     – teal→green gradient fill, "✓ Shortlisted"
 */
enum class ShortlistPillState { IDLE, LOADING, DONE }

@Composable
fun ShortlistPillButton(
    state: ShortlistPillState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(14.dp)
    val palette = PlatformColors.palette

    // Teal→green gradient for the filled "done" state
    val doneGradient = Brush.horizontalGradient(
        listOf(HomeTealAccent, HomeGreenAccent)
    )

    val borderColor by animateColorAsState(
        targetValue = when (state) {
            ShortlistPillState.IDLE -> HomeTealAccent.copy(alpha = 0.30f)
            ShortlistPillState.LOADING -> HomeTealAccent.copy(alpha = 0.40f)
            ShortlistPillState.DONE -> Color.Transparent
        },
        animationSpec = tween(350),
        label = "pill-border"
    )
    val contentColor by animateColorAsState(
        targetValue = when (state) {
            ShortlistPillState.IDLE -> HomeTealAccent
            ShortlistPillState.LOADING -> HomeTealAccent
            ShortlistPillState.DONE -> palette.background
        },
        animationSpec = tween(350),
        label = "pill-content"
    )

    Row(
        modifier = modifier
            .height(28.dp)
            .clip(shape)
            .then(
                when (state) {
                    ShortlistPillState.DONE -> Modifier.background(doneGradient)
                    ShortlistPillState.LOADING -> Modifier.background(HomeTealAccent.copy(alpha = 0.10f))
                    ShortlistPillState.IDLE -> Modifier.background(HomeTealAccent.copy(alpha = 0.06f))
                }
            )
            .border(1.dp, borderColor, shape)
            .then(
                if (state == ShortlistPillState.LOADING) Modifier
                else Modifier.clickable { onClick() }
            )
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        AnimatedContent(
            targetState = state,
            transitionSpec = {
                (fadeIn(tween(200)) + scaleIn(
                    spring(stiffness = Spring.StiffnessMedium),
                    initialScale = 0.8f
                )).togetherWith(fadeOut(tween(150)))
            },
            label = "pill-icon"
        ) { s ->
            when (s) {
                ShortlistPillState.IDLE -> Icon(
                    Icons.Default.Add,
                    contentDescription = null,
                    tint = contentColor,
                    modifier = Modifier.size(14.dp)
                )
                ShortlistPillState.LOADING -> CircularProgressIndicator(
                    strokeWidth = 1.5.dp,
                    color = contentColor,
                    modifier = Modifier.size(12.dp)
                )
                ShortlistPillState.DONE -> Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    tint = contentColor,
                    modifier = Modifier.size(14.dp)
                )
            }
        }

        Spacer(Modifier.width(4.dp))

        AnimatedContent(
            targetState = state,
            transitionSpec = {
                fadeIn(tween(250)).togetherWith(fadeOut(tween(150)))
            },
            label = "pill-label"
        ) { s ->
            Text(
                text = when (s) {
                    ShortlistPillState.IDLE -> stringResource(R.string.shortlist_pill_idle)
                    ShortlistPillState.LOADING -> stringResource(R.string.shortlist_pill_adding)
                    ShortlistPillState.DONE -> stringResource(R.string.shortlist_pill_done)
                },
                color = contentColor,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}

/** Convenience: derive [ShortlistPillState] from the two booleans every screen already has. */
fun shortlistPillState(isInShortlist: Boolean, isPending: Boolean): ShortlistPillState = when {
    isPending -> ShortlistPillState.LOADING
    isInShortlist -> ShortlistPillState.DONE
    else -> ShortlistPillState.IDLE
}
