package com.liordahan.mgsrteam.splash

import android.app.Activity
import android.net.Uri
import android.view.ViewGroup
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.liordahan.mgsrteam.R

@Composable
fun SplashVideoScreen(
    onFinished: () -> Unit
) {
    val context = LocalContext.current
    val videoUri = remember {
        Uri.parse("android.resource://${context.packageName}/${R.raw.splash_video}")
    }

    // Force system bars to black during the splash video
    DisposableEffect(Unit) {
        val window = (context as? Activity)?.window
        val previousNavBarColor = window?.navigationBarColor
        val previousStatusBarColor = window?.statusBarColor
        window?.navigationBarColor = Color.Black.toArgb()
        window?.statusBarColor = Color.Black.toArgb()

        onDispose {
            // Restore to transparent for edge-to-edge after splash ends
            if (previousNavBarColor != null) {
                window.navigationBarColor = android.graphics.Color.TRANSPARENT
            }
            if (previousStatusBarColor != null) {
                window.statusBarColor = android.graphics.Color.TRANSPARENT
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        AndroidView(
            factory = { ctx ->
                VideoView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    setVideoURI(videoUri)
                    setOnCompletionListener { onFinished() }
                    setOnErrorListener { _, _, _ ->
                        onFinished()
                        true
                    }
                    start()
                }
            },
            modifier = Modifier.fillMaxSize()
        )
    }
}
