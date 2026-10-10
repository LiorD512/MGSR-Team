package com.liordahan.mgsrteam.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.britDisplay

/**
 * Grayscale player-photo treatment used wherever the mock shows player imagery
 * (dashboard "OUR ASSETS" marquee, dossier hero, etc.). Renders the existing
 * remote image via the app's Coil loader with a desaturating [ColorFilter],
 * draws a dark bottom gradient scrim, and overlays the content (name) passed by
 * the caller. When [imageUrl] is null it falls back to an ink panel with the
 * player's initials — matching the mock's silhouette placeholder.
 */
@Composable
fun GrayscalePlayerPhoto(
    imageUrl: String?,
    name: String,
    modifier: Modifier = Modifier,
    scrimAlpha: Float = 0.85f,
    content: BoxScopeContent = {},
) {
    Box(modifier = modifier.background(BritTokens.ink)) {
        if (!imageUrl.isNullOrBlank()) {
            AsyncImage(
                model = imageUrl,
                contentDescription = name,
                contentScale = ContentScale.Crop,
                colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }),
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = initialsOf(name),
                    style = britDisplay(BritTokens.paper.copy(alpha = 0.55f), 40.sp, weight = 600),
                )
            }
        }
        // Dark bottom scrim.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            BritTokens.black.copy(alpha = scrimAlpha * 0.45f),
                            BritTokens.black.copy(alpha = scrimAlpha),
                        )
                    )
                )
        )
        content()
    }
}

typealias BoxScopeContent = @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit

/** Two-letter uppercase initials for a display name. */
fun initialsOf(name: String): String =
    name.trim().split(Regex("\\s+"))
        .filter { it.isNotEmpty() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
