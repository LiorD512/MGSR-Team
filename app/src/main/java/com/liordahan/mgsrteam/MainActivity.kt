package com.liordahan.mgsrteam

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.LaunchedEffect
import androidx.core.content.PermissionChecker
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.NavGraph
import com.liordahan.mgsrteam.ui.theme.MGSRTeamTheme
import org.koin.androidx.viewmodel.ext.android.viewModel
import androidx.core.graphics.toColorInt

class MainActivity : AppCompatActivity() {

    private val viewModel: IMainViewModel by viewModel()

    /**
     * Re-wrap with user locale on every creation (including after language-change recreation).
     * The Application context keeps the locale from first launch; when the user changes
     * language and the Activity is recreated, we must apply the new locale here.
     */
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LocaleManager.setLocale(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)

        // Keep the splash screen visible until the auth state is resolved
        splashScreen.setKeepOnScreenCondition { !viewModel.isReady.value }

        val darkBg = "#0F1923".toColorInt()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(darkBg, darkBg),
            navigationBarStyle = SystemBarStyle.light(darkBg, darkBg)
        )
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
