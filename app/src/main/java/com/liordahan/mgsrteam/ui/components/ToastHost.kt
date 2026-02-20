package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogWindowProvider

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
        // Use Dialog so toast appears above bottom sheets (which are also dialogs).
        // The most recently shown dialog is on top, so this ensures visibility.
        Dialog(
            onDismissRequest = { },
            properties = androidx.compose.ui.window.DialogProperties(
                usePlatformDefaultWidth = false,
                dismissOnBackPress = false,
                dismissOnClickOutside = false,
                decorFitsSystemWindows = true
            )
        ) {
            val view = LocalView.current
            DisposableEffect(view) {
                val window = (view.parent as? DialogWindowProvider)?.window
                window?.attributes?.apply {
                    dimAmount = 0f
                    window.attributes = this
                }
                onDispose { }
            }
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
}
