package com.liordahan.mgsrteam.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.features.home.HomeScreen
import com.liordahan.mgsrteam.features.login.LoginScreen
import com.liordahan.mgsrteam.ui.components.ToastHost
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground

@Composable
fun NavGraph(
    viewModel: IMainViewModel
) {
    val currentUser by viewModel.currentUserFlow.collectAsState()

    val startDestination = if (currentUser != null) {
        Screens.HomeScreen.route
    } else {
        Screens.LoginScreen.route
    }

    val navController = rememberNavController()

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground
    ) { paddingValues ->

        Box(modifier = Modifier
            .fillMaxSize()
            .padding(paddingValues)
            .consumeWindowInsets(paddingValues)
        ) {
            NavHost(
                navController = navController,
                startDestination = startDestination,
                enterTransition = NavigationTransitions.fadeEnterTransition,
                exitTransition = NavigationTransitions.fadeExitTransition,
                popEnterTransition = NavigationTransitions.fadeEnterTransition,
                popExitTransition = NavigationTransitions.fadeExitTransition
            ) {
                composable(route = Screens.LoginScreen.route) {
                    LoginScreen(navController = navController)
                }
                composable(route = Screens.HomeScreen.route) {
                    HomeScreen(mainViewModel = viewModel)
                }
            }
            ToastHost()
        }
    }
}