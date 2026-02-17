package com.liordahan.mgsrteam.features.home

import android.annotation.SuppressLint
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
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
import com.liordahan.mgsrteam.features.home.dashboard.DashboardScreen
import com.liordahan.mgsrteam.features.players.PlayersScreen
import com.liordahan.mgsrteam.features.players.playerinfo.PlayerInfoScreen
import com.liordahan.mgsrteam.features.players.playerinfo.mandate.GenerateMandateScreen
import com.liordahan.mgsrteam.features.players.playerinfo.mandate.MandatePreviewScreen
import com.liordahan.mgsrteam.features.releases.ReleasesScreen
import com.liordahan.mgsrteam.features.contacts.ContactsScreen
import com.liordahan.mgsrteam.features.returnee.ReturneeScreen
import com.liordahan.mgsrteam.features.contractfinisher.ContractFinisherScreen
import com.liordahan.mgsrteam.features.shortlist.ShortlistScreen
import com.liordahan.mgsrteam.features.requests.RequestsScreen
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun HomeScreen(
    mainViewModel: IMainViewModel = koinViewModel()
) {

    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val isDarkScreen = currentRoute == Screens.DashboardScreen.route ||
            currentRoute == Screens.PlayersScreen.route ||
            currentRoute == Screens.ReleasesScreen.route ||
            currentRoute == Screens.ReturneeScreen.route ||
            currentRoute == Screens.ContractFinisherScreen.route ||
            currentRoute == Screens.ShortlistScreen.route ||
            currentRoute == Screens.RequestsScreen.route ||
            currentRoute == Screens.AddToShortlistScreen.route ||
            currentRoute?.startsWith("${Screens.AddToShortlistScreen.route}/") == true ||
            currentRoute?.startsWith(Screens.PlayerInfoScreen.route) == true ||
            currentRoute?.startsWith(Screens.GenerateMandateScreen.route) == true ||
            currentRoute?.startsWith(Screens.MandatePreviewScreen.route) == true

    LaunchedEffect(Unit) {
        mainViewModel.pendingDeepLinkPlayerId.collectLatest { playerId ->
            if (!playerId.isNullOrBlank()) {
                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(playerId)}")
                mainViewModel.clearPendingDeepLink()
            }
        }
    }

    LaunchedEffect(Unit) {
        mainViewModel.pendingAddPlayerTmUrl.collectLatest { tmUrl ->
            if (!tmUrl.isNullOrBlank()) {
                navController.navigate(Screens.PlayersScreen.route)
                // URL is consumed by PlayersScreen when it shows the add-player sheet
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = if (isDarkScreen) HomeDarkBackground else Color.White,
        topBar = {

        },
        bottomBar = { }
    ) {

        NavHost(
            navController = navController,
            startDestination = Screens.DashboardScreen.route,
            enterTransition = {
                slideInHorizontally(initialOffsetX = { it }, animationSpec = tween(250))
            },
            exitTransition = {
                slideOutHorizontally(targetOffsetX = { -it }, animationSpec = tween(250))
            },
            popEnterTransition = {
                slideInHorizontally(initialOffsetX = { -it }, animationSpec = tween(250))
            },
            popExitTransition = {
                slideOutHorizontally(targetOffsetX = { it }, animationSpec = tween(250))
            }
        ) {

            composable(
                route = Screens.DashboardScreen.route,
                enterTransition = {
                    slideInHorizontally(initialOffsetX = { -it }, animationSpec = tween(250))
                },
                exitTransition = {
                    slideOutHorizontally(targetOffsetX = { it }, animationSpec = tween(250))
                },
                popEnterTransition = {
                    slideInHorizontally(initialOffsetX = { it }, animationSpec = tween(250))
                },
                popExitTransition = {
                    slideOutHorizontally(targetOffsetX = { -it }, animationSpec = tween(250))
                }
            ) {
                DashboardScreen(navController = navController)
            }

            composable(
                route = Screens.PlayersScreen.route
            ) {
                PlayersScreen(
                    navController = navController,
                    mainViewModel = mainViewModel
                )
            }

            composable(
                route = Screens.ReleasesScreen.route
            ) {
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
                route = Screens.AddToShortlistScreen.route
            ) {
                AddPlayerScreen(
                    navController = navController,
                    initialTmProfileUrl = "",
                    forShortlist = true
                )
            }

            composable(
                route = "${Screens.AddToShortlistScreen.route}/{tmProfileUrl}",
                arguments = listOf(navArgument("tmProfileUrl") { type = NavType.StringType })
            ) { backStackEntry ->
                val tmProfileUrl = backStackEntry.arguments?.getString("tmProfileUrl").orEmpty()
                AddPlayerScreen(
                    navController = navController,
                    initialTmProfileUrl = tmProfileUrl,
                    forShortlist = true
                )
            }

            composable(
                route = "${Screens.PlayerInfoScreen.route}/{playerId}",
                arguments = listOf(navArgument("playerId") { NavType.StringType })
            ) { backStackEntry ->
                val playerId = backStackEntry.arguments?.getString("playerId") ?: return@composable
                PlayerInfoScreen(playerId = playerId, navController = navController)
            }

            composable(
                route = "${Screens.GenerateMandateScreen.route}/{playerId}",
                arguments = listOf(navArgument("playerId") { type = NavType.StringType })
            ) { backStackEntry ->
                val genPlayerId = backStackEntry.arguments?.getString("playerId") ?: return@composable
                GenerateMandateScreen(
                    playerId = genPlayerId,
                    navController = navController
                )
            }

            composable(
                route = "${Screens.MandatePreviewScreen.route}/{playerId}/{pdfFilename}",
                arguments = listOf(
                    navArgument("playerId") { type = NavType.StringType },
                    navArgument("pdfFilename") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val mandatePlayerId = backStackEntry.arguments?.getString("playerId") ?: return@composable
                val pdfFilename = backStackEntry.arguments?.getString("pdfFilename") ?: return@composable
                MandatePreviewScreen(
                    playerId = mandatePlayerId,
                    pdfFilename = pdfFilename,
                    navController = navController
                )
            }

            composable(
                route = Screens.ReturneeScreen.route
            ) {
                ReturneeScreen(navController = navController)
            }

            composable(
                route = Screens.ContractFinisherScreen.route
            ) {
                ContractFinisherScreen(navController = navController)
            }

            composable(
                route = Screens.ContactsScreen.route
            ) {
                ContactsScreen(navController = navController)
            }

            composable(
                route = Screens.ShortlistScreen.route
            ) {
                ShortlistScreen(navController = navController)
            }

            composable(
                route = Screens.RequestsScreen.route
            ) {
                RequestsScreen(navController = navController)
            }
        }
    }
}
