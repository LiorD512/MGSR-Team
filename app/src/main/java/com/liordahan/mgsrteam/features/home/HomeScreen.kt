package com.liordahan.mgsrteam.features.home

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.add.AddPlayerScreen
import com.liordahan.mgsrteam.features.contacts.ContactsScreen
import com.liordahan.mgsrteam.features.contractfinisher.ContractFinisherScreen
import com.liordahan.mgsrteam.features.home.IHomeScreenViewModel
import com.liordahan.mgsrteam.features.home.dashboard.DashboardScreen
import com.liordahan.mgsrteam.features.home.tasks.TaskDetailScreen
import com.liordahan.mgsrteam.features.home.tasks.TasksScreen
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
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import com.liordahan.mgsrteam.utils.extractTransfermarktPlayerUrl
import kotlinx.coroutines.flow.collectLatest
import org.koin.androidx.compose.koinViewModel

@SuppressLint("UnusedMaterial3ScaffoldPaddingParameter")
@Composable
fun HomeScreen(
    mainViewModel: IMainViewModel = koinViewModel(),
    homeViewModel: IHomeScreenViewModel = koinViewModel()
) {

    val navController = rememberNavController()
    val context = LocalContext.current

    // Process share/VIEW intent when HomeScreen is visible — handles cold start when
    // handleDeepLink in onCreate may run before ViewModel/UI is ready (e.g. Hebrew locale)
    LaunchedEffect(Unit) {
        val activity = context as? Activity ?: return@LaunchedEffect
        val intent = activity.intent ?: return@LaunchedEffect
        when {
            intent.action == Intent.ACTION_SEND -> {
                val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                    ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
                    ?: intent.data?.toString()
                extractTransfermarktPlayerUrl(sharedText)?.let { url ->
                    mainViewModel.setPendingAddPlayerTmUrl(url)
                }
            }
            intent.data != null && intent.data?.scheme == "https" &&
                intent.data?.host?.contains("transfermarkt") == true -> {
                extractTransfermarktPlayerUrl(intent.data.toString())?.let { url ->
                    mainViewModel.setPendingAddPlayerTmUrl(url)
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        mainViewModel.pendingDeepLinkPlayerId.collectLatest { playerId ->
            if (!playerId.isNullOrBlank()) {
                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(playerId)}")
                mainViewModel.clearPendingDeepLink()
            }
        }
    }

    val pendingAddPlayerTmUrl by mainViewModel.pendingAddPlayerTmUrl.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        mainViewModel.pendingShortlistAddTmUrl.collectLatest { tmUrl ->
            if (!tmUrl.isNullOrBlank()) {
                navController.navigate(Screens.ShortlistScreen.route)
                // URL is consumed by ShortlistScreen when it shows the add sheet
            }
        }
    }

    if (!pendingAddPlayerTmUrl.isNullOrBlank()) {
        val url = pendingAddPlayerTmUrl!!
        val encodedUrl = Uri.encode(url)
        Dialog(
            onDismissRequest = { mainViewModel.clearPendingAddPlayerTmUrl() }
        ) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
                border = BorderStroke(1.dp, HomeDarkCardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp)
                ) {
                    Text(
                        text = stringResource(R.string.add_player_from_link_title),
                        style = boldTextStyle(HomeTextPrimary, 18.sp)
                    )
                    Spacer(Modifier.height(20.dp))
                    TextButton(
                        onClick = {
                            mainViewModel.clearPendingAddPlayerTmUrl()
                            navController.navigate("${Screens.AddPlayerScreen.route}/$encodedUrl")
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Filled.PersonAdd, contentDescription = null, tint = HomeTealAccent, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.add_player_from_link_roster),
                            style = regularTextStyle(HomeTextPrimary, 16.sp)
                        )
                    }
                    TextButton(
                        onClick = {
                            mainViewModel.clearPendingAddPlayerTmUrl()
                            navController.navigate(Screens.addToShortlistRoute(encodedUrl))
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Filled.Person, contentDescription = null, tint = HomeTealAccent, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.add_player_from_link_shortlist),
                            style = regularTextStyle(HomeTextPrimary, 16.sp)
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(
                            onClick = { mainViewModel.clearPendingAddPlayerTmUrl() }
                        ) {
                            Text(stringResource(android.R.string.cancel), style = regularTextStyle(HomeTextSecondary, 14.sp))
                        }
                    }
                }
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
                DashboardScreen(navController = navController, viewModel = homeViewModel)
            }

            composable(route = Screens.TasksScreen.route) {
                TasksScreen(navController = navController, viewModel = homeViewModel)
            }

            composable(
                route = "${Screens.TaskDetailScreen.route}/{taskId}",
                arguments = listOf(navArgument("taskId") { type = NavType.StringType })
            ) { backStackEntry ->
                val taskId = backStackEntry.arguments?.getString("taskId") ?: return@composable
                TaskDetailScreen(taskId = taskId, navController = navController, viewModel = homeViewModel)
            }

            composable(
                route = "${Screens.PlayersScreen.route}?myPlayersOnly={myPlayersOnly}",
                arguments = listOf(
                    navArgument("myPlayersOnly") {
                        type = NavType.BoolType
                        defaultValue = false
                    }
                )
            ) { backStackEntry ->
                val myPlayersOnly = backStackEntry.arguments?.getBoolean("myPlayersOnly") ?: false
                PlayersScreen(
                    navController = navController,
                    mainViewModel = mainViewModel,
                    initialMyPlayersOnly = myPlayersOnly
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
                ShortlistScreen(navController = navController, mainViewModel = mainViewModel)
            }

            composable(
                route = Screens.RequestsScreen.route
            ) {
                RequestsScreen(navController = navController)
            }
        }
    }
}
