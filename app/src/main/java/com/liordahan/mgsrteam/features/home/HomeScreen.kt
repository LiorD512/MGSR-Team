package com.liordahan.mgsrteam.features.home

import android.annotation.SuppressLint
import android.app.Activity
import android.util.Log
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.liordahan.mgsrteam.IMainViewModel
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.deeplink.PendingShareHolder
import com.liordahan.mgsrteam.features.add.AddFromLinkBottomSheet
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
import com.liordahan.mgsrteam.features.add.IAddPlayerViewModel
import com.liordahan.mgsrteam.features.shadowteams.ShadowTeamsScreen
import com.liordahan.mgsrteam.features.shortlist.ShortlistScreen
import com.liordahan.mgsrteam.BuildConfig
import com.liordahan.mgsrteam.navigation.NavigationTransitions
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.utils.extractTransfermarktUrlFromIntent
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
    val addPlayerViewModel: IAddPlayerViewModel = koinViewModel()

    var pendingAddFromLinkUrl by remember { mutableStateOf<String?>(null) }

    // CRITICAL: Process share intent DIRECTLY when HomeScreen appears.
    // Read from: 1) activity intent 2) PendingShareHolder 3) ViewModel — then navigate immediately.
    LaunchedEffect(Unit) {
        val activity = context as? Activity ?: return@LaunchedEffect
        val fromIntent = extractTransfermarktUrlFromIntent(activity.intent)
        val fromHolder = PendingShareHolder.takePendingAddPlayerTmUrl()
        val fromVm = mainViewModel.pendingAddPlayerTmUrl.value.takeIf { !it.isNullOrBlank() }
        val url = fromIntent ?: fromHolder ?: fromVm
        if (BuildConfig.DEBUG) {
            Log.d("MGSR_DeepLink", "HomeScreen LaunchedEffect: fromIntent=${fromIntent?.take(50)}, fromHolder=${fromHolder?.take(50)}, fromVm=${fromVm?.take(50)}, url=${url?.take(50)}")
        }
        if (!url.isNullOrBlank()) {
            mainViewModel.clearPendingAddPlayerTmUrl()
            if (BuildConfig.DEBUG) Log.d("MGSR_DeepLink", "HomeScreen: showing add-from-link sheet")
            pendingAddFromLinkUrl = url
        }
    }

    // React when intent arrives AFTER HomeScreen is already shown (e.g. share while app open)
    val pendingFromHolder by PendingShareHolder.pendingAddPlayerTmUrl.collectAsStateWithLifecycle(initialValue = null)
    val pendingFromViewModel by mainViewModel.pendingAddPlayerTmUrl.collectAsStateWithLifecycle(initialValue = null)
    LaunchedEffect(pendingFromHolder, pendingFromViewModel) {
        val url = pendingFromHolder ?: pendingFromViewModel
        if (!url.isNullOrBlank()) {
            mainViewModel.clearPendingAddPlayerTmUrl()
            PendingShareHolder.takePendingAddPlayerTmUrl()
            if (BuildConfig.DEBUG) Log.d("MGSR_DeepLink", "HomeScreen: showing add-from-link sheet (from holder/vm)")
            pendingAddFromLinkUrl = url
        }
    }

    pendingAddFromLinkUrl?.let { url ->
        AddFromLinkBottomSheet(
            tmProfileUrl = url,
            onDismiss = { pendingAddFromLinkUrl = null },
            onPopToDashboard = { navController.popBackStack(Screens.DashboardScreen.route, false) },
            addPlayerViewModel = addPlayerViewModel
        )
    }

    LaunchedEffect(Unit) {
        mainViewModel.pendingDeepLinkPlayerId.collectLatest { playerId ->
            if (!playerId.isNullOrBlank()) {
                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(playerId)}")
                mainViewModel.clearPendingDeepLink()
            }
        }
    }

    LaunchedEffect(Unit) {
        mainViewModel.pendingOpenTasksScreen.collectLatest { shouldOpen ->
            if (shouldOpen) {
                navController.navigate(Screens.TasksScreen.route)
                mainViewModel.setPendingOpenTasksScreen(false)
            }
        }
    }

    LaunchedEffect(Unit) {
        mainViewModel.pendingOpenPlayersScreen.collectLatest { shouldOpen ->
            if (shouldOpen) {
                navController.navigate(Screens.playersRoute(myPlayersOnly = true))
                mainViewModel.setPendingOpenPlayersScreen(false)
            }
        }
    }

    LaunchedEffect(Unit) {
        mainViewModel.pendingOpenAddPlayerScreen.collectLatest { shouldOpen ->
            if (shouldOpen) {
                navController.navigate("${Screens.AddPlayerScreen.route}/")
                mainViewModel.setPendingOpenAddPlayerScreen(false)
            }
        }
    }

    LaunchedEffect(Unit) {
        mainViewModel.pendingShortlistAddTmUrl.collectLatest { tmUrl ->
            if (!tmUrl.isNullOrBlank()) {
                navController.navigate(Screens.ShortlistScreen.route)
                // URL is consumed by ShortlistScreen when it shows the add sheet
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
                route = "${Screens.PlayerInfoScreen.route}/{playerId}?autoRefresh={autoRefresh}",
                arguments = listOf(
                    navArgument("playerId") { type = NavType.StringType },
                    navArgument("autoRefresh") {
                        type = NavType.BoolType
                        defaultValue = false
                    }
                )
            ) { backStackEntry ->
                val playerId = backStackEntry.arguments?.getString("playerId") ?: return@composable
                val autoRefresh = backStackEntry.arguments?.getBoolean("autoRefresh") ?: false
                PlayerInfoScreen(playerId = playerId, autoRefresh = autoRefresh, navController = navController)
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

            composable(
                route = Screens.ShadowTeamsScreen.route
            ) {
                ShadowTeamsScreen(navController = navController)
            }
        }
    }
}
