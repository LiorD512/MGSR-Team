package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ToastHost(
    modifier: Modifier = Modifier
) {
    val toast by ToastManager.toastFlow.collectAsState()
    var lastMessage by remember { mutableStateOf<ToastMessage?>(null) }
    LaunchedEffect(toast) {
        if (toast != null) lastMessage = toast
    }
    val messageToShow = toast ?: lastMessage

    if (toast != null || lastMessage != null) {
        Box(modifier = modifier.fillMaxSize()) {
            AnimatedVisibility(
                visible = toast != null,
                enter = slideInVertically(initialOffsetY = { it }),
                exit = slideOutVertically(targetOffsetY = { it })
            ) {
                messageToShow?.let { msg ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                            .windowInsetsPadding(WindowInsets.navigationBars)
                            .padding(bottom = 16.dp),
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        AppToast(
                            message = msg.message,
                            type = msg.type
                        )
                    }
                }
            }
        }
    }
}
