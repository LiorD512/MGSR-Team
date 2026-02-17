package com.liordahan.mgsrteam.features.home

import android.annotation.SuppressLint
import android.net.Uri
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.features.add.AddPlayerScreen
import com.liordahan.mgsrteam.features.contacts.ContactsScreen
import com.liordahan.mgsrteam.features.contractfinisher.ContractFinisherScreen
import com.liordahan.mgsrteam.features.home.dashboard.DashboardScreen
import com.liordahan.mgsrteam.features.players.PlayersScreen
import com.liordahan.mgsrteam.features.players.playerinfo.PlayerInfoScreen
import com.liordahan.mgsrteam.features.players.playerinfo.mandate.GenerateMandateScreen
import com.liordahan.mgsrteam.features.players.playerinfo.mandate.MandatePreviewScreen
import com.liordahan.mgsrteam.features.releases.ReleasesScreen
import com.liordahan.mgsrteam.features.requests.RequestsScreen
import com.liordahan.mgsrteam.features.returnee.ReturneeScreen
import com.liordahan.mgsrteam.features.shortlist.ShortlistScreen
import com.liordahan.mgsrteam.navigation.NavigationTransitions
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import kotlinx.coroutines.flow.collectLatest
import org.koin.androidx.compose.koinViewModel

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun HomeScreen(
    mainViewModel: IMainViewModel = koinViewModel()
) {

    val navController = rememberNavController()

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
        containerColor = HomeDarkBackground
    ) {

        NavHost(
            navController = navController,
            startDestination = Screens.DashboardScreen.route,
            enterTransition = NavigationTransitions.enterTransition,
            exitTransition = NavigationTransitions.exitTransition,
            popEnterTransition = NavigationTransitions.popEnterTransition,
            popExitTransition = NavigationTransitions.popExitTransition
        ) {

            composable(route = Screens.DashboardScreen.route) {
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
