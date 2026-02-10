package com.liordahan.mgsrteam.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.features.home.HomeScreen
import com.liordahan.mgsrteam.features.login.LoginScreen

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