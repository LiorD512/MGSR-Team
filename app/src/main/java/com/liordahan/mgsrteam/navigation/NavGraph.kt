package com.liordahan.mgsrteam.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import kotlinx.coroutines.launch

@Composable
fun NavGraph(
    viewModel: IMainViewModel
) {

    val lifeCycle = LocalLifecycleOwner.current.lifecycle
    var startDestination by remember {
        mutableStateOf("")
    }

    LaunchedEffect(Unit) {
        lifeCycle.repeatOnLifecycle(Lifecycle.State.STARTED){
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

    if (startDestination.isEmpty()) return

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
                 HomeScreen()
            }
        }
    }
}