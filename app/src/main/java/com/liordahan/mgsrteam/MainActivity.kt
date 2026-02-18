package com.liordahan.mgsrteam

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.core.content.PermissionChecker
import androidx.core.graphics.toColorInt
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.NavGraph
import com.liordahan.mgsrteam.ui.theme.MGSRTeamTheme
import com.liordahan.mgsrteam.utils.extractTransfermarktPlayerUrl
import org.koin.androidx.viewmodel.ext.android.viewModel

class MainActivity : AppCompatActivity() {

    private val viewModel: IMainViewModel by viewModel()

    /** Updated from Compose when isReady; avoids accessing viewModel before it's safe. */
    @Volatile
    private var isAppReady = false

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

        // Keep native splash until app is ready — avoids empty screen; matches Compose overlay
        splashScreen.setKeepOnScreenCondition { !isAppReady }

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
                val isReady by viewModel.isReady.collectAsStateWithLifecycle(initialValue = false)
                LaunchedEffect(isReady) {
                    if (isReady) isAppReady = true
                }
                // Single splash: native splash only — no Compose overlay (avoids double splash)
                NavGraph(viewModel = viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        if (intent == null) return

        // Handle notification tap — action or type determines destination
        val notificationAction = intent.getStringExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_NOTIFICATION_ACTION)
        val dataType = intent.getStringExtra("type")
        val playerTmProfile = intent.getStringExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_PLAYER_TM_PROFILE)?.takeIf { it.isNotBlank() }
        playerTmProfile?.let { url ->
            when {
                notificationAction == com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.ACTION_ADD_TO_SHORTLIST ->
                    viewModel.setPendingShortlistAddTmUrl(url)
                dataType == com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.TYPE_NEW_RELEASE_FROM_CLUB -> {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    finish()
                }
                dataType == com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.TYPE_MANDATE_EXPIRED ->
                    viewModel.setPendingDeepLinkPlayerId(url)
                else ->
                    viewModel.setPendingAddPlayerTmUrl(url)
            }
        }

        // Handle Share intent (WhatsApp, Gmail, etc.) — extract Transfermarkt URL from shared text
        if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
            extractTransfermarktPlayerUrl(sharedText)?.let { url ->
                viewModel.setPendingAddPlayerTmUrl(url)
            }
            return
        }

        // Handle VIEW intent with Transfermarkt URL
        val uri = intent.data ?: return
        when {
            uri.scheme == "mgsrteam" && uri.host == "player" -> {
                val path = uri.path?.trimStart('/') ?: uri.lastPathSegment
                path?.takeIf { it.isNotBlank() }?.let { viewModel.setPendingDeepLinkPlayerId(it) }
            }
            (uri.scheme == "https" && uri.host?.contains("transfermarkt") == true) -> {
                extractTransfermarktPlayerUrl(uri.toString())?.let { url ->
                    viewModel.setPendingAddPlayerTmUrl(url)
                }
            }
        }
    }
}
