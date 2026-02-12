package com.liordahan.mgsrteam.ui.components

import android.app.Activity
import android.app.Dialog
import android.content.ContextWrapper
import android.view.View
import android.view.ViewParent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.ui.theme.buttonDisabledBg
import com.liordahan.mgsrteam.ui.theme.buttonEnabledBg
import com.liordahan.mgsrteam.ui.theme.buttonLoadingBg
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.contentDisabled
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.searchHeaderButtonBackground
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import androidx.core.view.WindowCompat

private const val DARK_NAV_BAR_COLOR = 0xFF0F1923.toInt()

/**
 * Call from inside ModalBottomSheet content to keep the navigation bar and status bar
 * dark (#0F1923) instead of switching to white when the sheet is shown.
 */
@Composable
fun DarkSystemBarsForBottomSheet() {
    val view = LocalView.current
    DisposableEffect(Unit) {
        fun setWindowBars(window: android.view.Window) {
            window.navigationBarColor = DARK_NAV_BAR_COLOR
            window.statusBarColor = DARK_NAV_BAR_COLOR
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = true
                isAppearanceLightNavigationBars = true
            }
        }

        fun findAndSetWindow(): Boolean {
            // Try DialogWindowProvider (Compose Dialog)
            var parent: ViewParent? = view.parent
            while (parent != null) {
                if (parent is DialogWindowProvider) {
                    setWindowBars(parent.window)
                    return true
                }
                parent = parent.parent
            }

            // Fallback: traverse context chain to find Android Dialog (ModalBottomSheet uses BottomSheetDialog)
            var ctx: android.content.Context? = view.context
            while (ctx is ContextWrapper) {
                if (ctx is Dialog) {
                    ctx.window?.let { setWindowBars(it); return true }
                    return false
                }
                ctx = ctx.baseContext
            }

            // Fallback: use Activity's window
            ctx = view.context
            while (ctx != null) {
                if (ctx is Activity) {
                    setWindowBars(ctx.window)
                    return true
                }
                ctx = (ctx as? ContextWrapper)?.baseContext
            }
            return false
        }

        if (!findAndSetWindow()) {
            // View may not be attached yet; try again after layout
            view.post { findAndSetWindow() }
        }
        onDispose { }
    }
}

@Composable
fun PrimaryButtonNewDesign(
    modifier: Modifier = Modifier,
    buttonText: String,
    buttonElevation: Dp = 0.dp,
    isEnabled: Boolean,
    showProgress: Boolean,
    loadingText: String? = null,
    onButtonClicked: () -> Unit,
    containerColor: Color? = null,
    disabledContainerColor: Color? = null
) {
    val enabledBg = containerColor ?: buttonEnabledBg
    val disabledBg = disabledContainerColor ?: buttonDisabledBg
    val contentColor = Color.White

    Box(
        modifier = Modifier
            .fillMaxWidth(),
        contentAlignment = Alignment.Center
    ) {
        Button(
            onClick = {
                if (showProgress) return@Button
                onButtonClicked()
            },
            modifier = modifier
                .fillMaxWidth()
                .height(50.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (showProgress && containerColor == null) buttonLoadingBg else enabledBg,
                disabledContainerColor = disabledBg,
                contentColor = contentColor
            ),
            elevation = ButtonDefaults.buttonElevation(buttonElevation),
            shape = RoundedCornerShape(500.dp),
            contentPadding = PaddingValues(horizontal = 16.dp),
            enabled = isEnabled
        ) {
            val displayText = if (showProgress && loadingText != null) loadingText else buttonText
            val showSpinner = showProgress

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                if (showSpinner) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.size(10.dp))
                }
                Text(
                    text = displayText,
                    style = boldTextStyle(
                        Color.White,
                        18.sp
                    ).copy(lineHeight = 24.sp)
                )
            }
        }
    }

}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTextField(
    modifier: Modifier = Modifier,
    textInput: TextFieldValue,
    hint: String?,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    trailingIconAlwaysVisible: Boolean = false,
    keyboardOptions: KeyboardOptions,
    onTrailingIconClicked: (() -> Unit)? = null,
    onValueChange: (TextFieldValue) -> Unit,
    darkTheme: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None
) {
    val textColor = if (darkTheme) HomeTextPrimary else contentDefault
    val placeholderColor = if (darkTheme) HomeTextSecondary.copy(alpha = 0.5f) else contentDefault
    val iconTint = if (darkTheme) HomeTextSecondary else contentDefault
    val colors = if (darkTheme) setSearchViewTextFieldColorsDarkTheme() else setSearchViewTextFieldColors()

    BasicTextField(
        value = textInput,
        onValueChange = {
            onValueChange(it)
        },
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp)
            .then(
                if (darkTheme) Modifier.border(1.dp, HomeDarkCardBorder, RoundedCornerShape(14.dp))
                else Modifier
            ),
        textStyle = regularTextStyle(textColor, 14.sp),
        cursorBrush = SolidColor(if (darkTheme) HomeTextSecondary else contentDefault),
        enabled = true,
        singleLine = true,
        keyboardOptions = keyboardOptions,
        decorationBox = { innerTextField ->
            TextFieldDefaults.DecorationBox(
                value = textInput.text,
                innerTextField = innerTextField,
                visualTransformation = visualTransformation,
                singleLine = true,
                enabled = false,
                isError = false,
                contentPadding = PaddingValues(horizontal = 16.dp),
                shape = RoundedCornerShape(14.dp),
                colors = colors,
                interactionSource = remember { MutableInteractionSource() },
                placeholder = {
                    Text(
                        hint ?: "",
                        style = regularTextStyle(placeholderColor, 14.sp),
                        modifier = Modifier.padding(end = 8.dp),
                        maxLines = 1
                    )
                },
                leadingIcon = {
                    leadingIcon?.let {
                        Icon(
                            imageVector = leadingIcon,
                            contentDescription = null,
                            tint = iconTint
                        )
                    }
                },

                trailingIcon = {
                    trailingIcon?.let { icon ->
                        if (trailingIconAlwaysVisible || textInput.text.isNotEmpty()) {
                            if (onTrailingIconClicked != null) {
                                IconButton(
                                    onClick = { onTrailingIconClicked.invoke() },
                                    modifier = Modifier.size(40.dp),
                                    colors = IconButtonDefaults.iconButtonColors(
                                        containerColor = Color.Transparent,
                                        contentColor = iconTint
                                    )
                                ) {
                                    Icon(
                                        imageVector = icon,
                                        contentDescription = null,
                                        tint = iconTint
                                    )
                                }
                            } else {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = null,
                                    tint = iconTint
                                )
                            }
                        }
                    }
                }

            )
        }
    )
}

@Composable
fun setSearchViewTextFieldColors(): TextFieldColors =
    TextFieldDefaults.colors(
        focusedContainerColor = searchHeaderButtonBackground,
        unfocusedContainerColor = searchHeaderButtonBackground,
        disabledContainerColor = searchHeaderButtonBackground,
        cursorColor = HomeTextSecondary,
        focusedIndicatorColor = Color.Transparent,
        unfocusedIndicatorColor = Color.Transparent,
        disabledIndicatorColor = Color.Transparent
    )

@Composable
fun setSearchViewTextFieldColorsDarkTheme(): TextFieldColors =
    TextFieldDefaults.colors(
        focusedContainerColor = HomeDarkCard,
        unfocusedContainerColor = HomeDarkCard,
        disabledContainerColor = HomeDarkCard,
        cursorColor = HomeTextSecondary,
        focusedIndicatorColor = Color.Transparent,
        unfocusedIndicatorColor = Color.Transparent,
        disabledIndicatorColor = Color.Transparent
    )