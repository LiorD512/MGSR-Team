package com.liordahan.mgsrteam.features.home

import android.annotation.SuppressLint
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import android.net.Uri
import com.liordahan.mgsrteam.IMainViewModel
import kotlinx.coroutines.flow.collectLatest
import org.koin.androidx.compose.koinViewModel
import androidx.compose.ui.graphics.Color
import androidx.navigation.NavController
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
import com.liordahan.mgsrteam.features.contacts.ContactsScreen
import com.liordahan.mgsrteam.features.returnee.ReturneeScreen
import com.liordahan.mgsrteam.features.shortlist.ShortlistScreen
import com.liordahan.mgsrteam.navigation.BottomNavigationUi
import com.liordahan.mgsrteam.navigation.Screens

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun HomeScreen(
    mainViewModel: IMainViewModel = koinViewModel()
) {

    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    LaunchedEffect(Unit) {
        mainViewModel.pendingDeepLinkPlayerId.collectLatest { playerId ->
            if (!playerId.isNullOrBlank()) {
                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(playerId)}")
                mainViewModel.clearPendingDeepLink()
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {

        },
        bottomBar = {
            if (currentRoute in listOf(Screens.PlayersScreen.route, Screens.ReleasesScreen.route, Screens.ReturneeScreen.route, Screens.ContactsScreen.route, Screens.ShortlistScreen.route)) {
                BottomNavigationUi(navController = navController, currentRoute = currentRoute)
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

            composable(
                route = "${Screens.AddPlayerScreen.route}/{tmProfileUrl}",
                arguments = listOf(
                    navArgument("tmProfileUrl") {
                        type = NavType.StringType
                        defaultValue = ""
                    }
                )
            ) { backStackEntry ->
                val tmProfileUrl = backStackEntry.arguments?.getString("tmProfileUrl").orEmpty()
                AddPlayerScreen(
                    navController = navController,
                    initialTmProfileUrl = tmProfileUrl
                )
            }

            composable(
                route = "${Screens.PlayerInfoScreen.route}/{playerId}",
                arguments = listOf(navArgument("playerId") { NavType.StringType })
            ) { backStackEntry ->
                val playerId = backStackEntry.arguments?.getString("playerId") ?: return@composable
                PlayerInfoScreen(playerId = playerId, navController = navController)
            }

            composable(route = Screens.ReturneeScreen.route) {
                ReturneeScreen(navController = navController)
            }

            composable(route = Screens.ContactsScreen.route) {
                ContactsScreen()
            }

            composable(route = Screens.ShortlistScreen.route) {
                ShortlistScreen(navController = navController)
            }
        }
    }
}