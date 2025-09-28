package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import com.liordahan.mgsrteam.ui.theme.searchHeaderButtonBackground
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

@Composable
fun PrimaryButtonNewDesign(
    buttonText: String,
    buttonElevation: Dp = 0.dp,
    isEnabled: Boolean,
    showProgress: Boolean,
    onButtonClicked: () -> Unit
) {

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
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (showProgress) buttonLoadingBg else buttonEnabledBg,
                disabledContainerColor = buttonDisabledBg
            ),
            elevation = ButtonDefaults.buttonElevation(buttonElevation),
            shape = RoundedCornerShape(500.dp),
            contentPadding = PaddingValues(horizontal = 16.dp),
            enabled = isEnabled
        ) {

            AnimatedVisibility(
                visible = showProgress,
                content = {
                    CircularProgressIndicator(
                        color = if (isEnabled) Color.White else contentDisabled,
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                }
            )

            AnimatedVisibility(
                visible = !showProgress
            )
            {
                Box(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = buttonText,
                        style = boldTextStyle(
                            if (isEnabled) Color.White else contentDisabled,
                            16.sp
                        ).copy(lineHeight = 24.sp),
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

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
    keyboardOptions: KeyboardOptions,
    onTrailingIconClicked: (() -> Unit)? = null,
    onValueChange: (TextFieldValue) -> Unit
) {
    BasicTextField(
        value = textInput,
        onValueChange = {
            onValueChange(it)
        },
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp),
        textStyle = regularTextStyle(contentDefault, 14.sp),
        enabled = true,
        singleLine = true,
        keyboardOptions = keyboardOptions,
        decorationBox = { innerTextField ->
            TextFieldDefaults.DecorationBox(
                value = textInput.text,
                innerTextField = innerTextField,
                visualTransformation = VisualTransformation.None,
                singleLine = true,
                enabled = false,
                isError = false,
                contentPadding = PaddingValues(horizontal = 16.dp),
                shape = RoundedCornerShape(38.dp),
                colors = setSearchViewTextFieldColors(),
                interactionSource = remember { MutableInteractionSource() },
                placeholder = {
                    Text(
                        hint ?: "",
                        style = regularTextStyle(contentDefault, 14.sp),
                        modifier = Modifier.padding(end = 8.dp),
                        maxLines = 1
                    )
                },
                leadingIcon = {
                    leadingIcon?.let {
                        Icon(
                            imageVector = leadingIcon,
                            contentDescription = null,
                            tint = contentDefault
                        )
                    }
                },

                trailingIcon = {
                    trailingIcon?.let {
                        if (textInput.text.isNotEmpty()) {
                            Icon(
                                imageVector = trailingIcon,
                                contentDescription = null,
                                tint = contentDefault,
                                modifier = Modifier.clickWithNoRipple { onTrailingIconClicked?.invoke() }
                            )
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
        focusedIndicatorColor = Color.Transparent,
        unfocusedIndicatorColor = Color.Transparent,
        disabledIndicatorColor = Color.Transparent
    )