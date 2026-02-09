package com.liordahan.mgsrteam.navigation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.features.home.HomeScreen
import com.liordahan.mgsrteam.features.login.LoginScreen
import com.liordahan.mgsrteam.splash.SplashVideoScreen
import kotlinx.coroutines.launch

@Composable
fun NavGraph(
    viewModel: IMainViewModel
) {
    val showVideoSplash by viewModel.showVideoSplash.collectAsState()

    // Resolve the start destination while the splash is still playing
    val lifeCycle = LocalLifecycleOwner.current.lifecycle
    var startDestination by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        lifeCycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.currentUserFlow.collect {
                    startDestination = if (it == null) {
                        Screens.LoginScreen.route
                    } else {
                        Screens.HomeScreen.route
                    }
                }
            }
        }
    }

    // Keep splash visible until the video is done AND the content destination is ready
    val contentReady = !showVideoSplash && startDestination.isNotEmpty()

    // Animate the crossfade: splash fades out, content fades in
    val contentAlpha by animateFloatAsState(
        targetValue = if (contentReady) 1f else 0f,
        animationSpec = tween(durationMillis = 900),
        label = "contentFadeIn"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Layer 1: Main content (rendered underneath, fades in)
        if (startDestination.isNotEmpty()) {
            Box(modifier = Modifier
                .fillMaxSize()
                .alpha(contentAlpha)
            ) {
                MainContent(
                    viewModel = viewModel,
                    startDestination = startDestination
                )
            }
        }

        // Layer 2: Splash (rendered on top, fades out)
        if (contentAlpha < 1f) {
            Box(modifier = Modifier
                .fillMaxSize()
                .alpha(1f - contentAlpha)
            ) {
                if (showVideoSplash) {
                    SplashVideoScreen(onFinished = viewModel::dismissVideoSplash)
                } else {
                    // Video finished but content is fading in — hold a black screen
                    Box(modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black))
                }
            }
        }
    }
}

@Composable
private fun MainContent(
    viewModel: IMainViewModel,
    startDestination: String
) {
    val navController = rememberNavController()

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White
    ) { paddingValues ->

        NavHost(navController = navController, startDestination = startDestination) {
            composable(route = Screens.LoginScreen.route) {
                LoginScreen(navController = navController)
            }
            composable(route = Screens.HomeScreen.route) {
                HomeScreen(mainViewModel = viewModel)
            }
        }
    }
}