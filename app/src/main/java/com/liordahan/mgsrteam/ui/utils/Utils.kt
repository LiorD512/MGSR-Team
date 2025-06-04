package com.liordahan.mgsrteam.ui.utils

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.contentDefault

@Composable
fun Modifier.clickWithNoRipple(onClick: () -> Unit) =
    this.clickable(
        interactionSource = remember {
            MutableInteractionSource()
        },
        indication = null,
        enabled = true,
        onClick = { onClick() }
    )

fun boldTextStyle(
    color: Color,
    fontSize: TextUnit,
    textAlign: TextAlign = TextAlign.Start,
    direction: TextDirection = TextDirection.Content
): TextStyle {
    return TextStyle(
        fontSize = fontSize,
        fontFamily = FontFamily(Font(R.font.takeaway_sans_bold)),
        fontWeight = FontWeight(700),
        color = color,
        textAlign = textAlign,
        textDirection = direction
    )
}

fun regularTextStyle(
    color: Color,
    fontSize: TextUnit,
    textAlign: TextAlign = TextAlign.Start,
    direction: TextDirection = TextDirection.Content,
    decoration: TextDecoration = TextDecoration.None
): TextStyle {
    return TextStyle(
        fontSize = fontSize,
        fontFamily = FontFamily(Font(R.font.takeaway_sans_regular)),
        fontWeight = FontWeight(400),
        color = color,
        textAlign = textAlign,
        textDirection = direction,
        textDecoration = decoration
    )
}

@Composable
fun ProgressIndicator(modifier: Modifier){
    CircularProgressIndicator(
        modifier = modifier.size(48.dp),
        color = contentDefault.copy(alpha = 0.65f),
        strokeWidth = 4.dp
    )
}