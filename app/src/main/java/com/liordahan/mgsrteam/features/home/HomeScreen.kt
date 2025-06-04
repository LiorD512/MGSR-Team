package com.liordahan.mgsrteam.features.home

import android.annotation.SuppressLint
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.liordahan.mgsrteam.features.add.AddPlayerScreen
import com.liordahan.mgsrteam.features.players.PlayersScreen
import com.liordahan.mgsrteam.features.players.playerinfo.PlayerInfoScreen
import com.liordahan.mgsrteam.features.releases.ReleasesScreen
import com.liordahan.mgsrteam.navigation.BottomNavigationUi
import com.liordahan.mgsrteam.navigation.Screens

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun HomeScreen() {

    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {

        },
        bottomBar = {
            if (currentRoute == Screens.PlayersScreen.route || currentRoute == Screens.ReleasesScreen.route) {
                BottomNavigationUi(navController)
            }
        }
    ) {

        NavHost(navController = navController, startDestination = Screens.PlayersScreen.route) {
            composable(route = Screens.PlayersScreen.route) {
                PlayersScreen(navController = navController)
            }

            composable(route = Screens.ReleasesScreen.route) {
                ReleasesScreen(navController = navController)
            }

            composable(route = Screens.AddPlayerScreen.route) {
                AddPlayerScreen(navController = navController)
            }

            composable(
                route = "${Screens.PlayerInfoScreen.route}/{playerId}",
                arguments = listOf(navArgument("playerId") { NavType.StringType })
            ) { backStackEntry ->
                val playerId = backStackEntry.arguments?.getString("playerId") ?: return@composable
                PlayerInfoScreen(playerId = playerId, navController = navController)
            }
        }
    }
}