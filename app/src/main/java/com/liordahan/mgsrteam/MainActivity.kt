package com.liordahan.mgsrteam

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.core.content.PermissionChecker
import com.liordahan.mgsrteam.navigation.NavGraph
import com.liordahan.mgsrteam.ui.theme.MGSRTeamTheme
import org.koin.androidx.viewmodel.ext.android.viewModel

class MainActivity : ComponentActivity() {

    private val viewModel: IMainViewModel by viewModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Switch from the splash theme (black background) to the normal app theme.
        // The black window background prevents the white flash before the video splash loads.
        setTheme(R.style.Theme_MGSRTeam)
        enableEdgeToEdge()
        handleDeepLink(intent)

        setContent {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val launcher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestPermission()
                ) { _ -> }
                LaunchedEffect(Unit) {
                    if (PermissionChecker.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.POST_NOTIFICATIONS
                        ) != PermissionChecker.PERMISSION_GRANTED
                    ) {
                        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            }
            MGSRTeamTheme {
                NavGraph(viewModel = viewModel)
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: android.content.Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "mgsrteam" && uri.host == "player") {
            val path = uri.path?.trimStart('/') ?: uri.lastPathSegment
            path?.takeIf { it.isNotBlank() }?.let { viewModel.setPendingDeepLinkPlayerId(it) }
        }
    }
}