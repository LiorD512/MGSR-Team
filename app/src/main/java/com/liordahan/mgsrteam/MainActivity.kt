package com.liordahan.mgsrteam

import android.Manifest
import android.util.Log
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
import com.liordahan.mgsrteam.appupdate.InAppUpdateHelper
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.core.content.PermissionChecker
import androidx.core.graphics.toColorInt
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.liordahan.mgsrteam.deeplink.PendingShareHolder
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.NavGraph
import com.liordahan.mgsrteam.ui.theme.MGSRTeamTheme
import com.liordahan.mgsrteam.utils.RedirectUrlResolver
import com.liordahan.mgsrteam.utils.extractTransfermarktUrlFromIntent
import kotlinx.coroutines.launch
import org.koin.androidx.viewmodel.ext.android.viewModel

class MainActivity : AppCompatActivity() {

    private val viewModel: IMainViewModel by viewModel()

    private lateinit var inAppUpdateHelper: InAppUpdateHelper

    private val updateLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        inAppUpdateHelper.onUpdateFlowResult(result.resultCode)
    }

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

        inAppUpdateHelper = InAppUpdateHelper(this, updateLauncher)

        // Keep native splash until app is ready — avoids empty screen; matches Compose overlay
        splashScreen.setKeepOnScreenCondition { !isAppReady }

        val darkBg = "#0F1923".toColorInt()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(darkBg, darkBg),
            navigationBarStyle = SystemBarStyle.light(darkBg, darkBg)
        )
        // Process intent immediately — critical for share deep link on cold start
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
                    if (isReady) {
                        // Check for mandatory app update first — if update needed, splash stays
                        // until user updates. If no update, proceed to show app.
                        inAppUpdateHelper.checkForUpdate(onNoUpdateNeeded = {
                            isAppReady = true
                            // Re-process intent when UI is ready — handles cold start race where
                            // onCreate handleDeepLink may run before ViewModel/Compose is fully ready
                            handleDeepLink(intent)
                        })
                    }
                }
                // Listen for new intents while app is running (share/deep link when already open)
                DisposableEffect(Unit) {
                    val listener = androidx.core.util.Consumer<Intent> { newIntent ->
                        setIntent(newIntent)
                        handleDeepLink(newIntent)
                    }
                    addOnNewIntentListener(listener)
                    onDispose { removeOnNewIntentListener(listener) }
                }
                // Single splash: native splash only — no Compose overlay (avoids double splash)
                NavGraph(viewModel = viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        if (intent == null) return

        // Handle notification tap or widget action — open specific screen
        val screen = intent.getStringExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
        when (screen) {
            "tasks" -> {
                viewModel.setPendingOpenTasksScreen(true)
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
                return
            }
            "players" -> {
                viewModel.setPendingOpenPlayersScreen(true)
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
                return
            }
            "add_player" -> {
                viewModel.setPendingOpenAddPlayerScreen(true)
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
                return
            }
            "requests" -> {
                viewModel.setPendingOpenRequestsScreen(true)
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
                return
            }
            "chat_room" -> {
                val messageId = intent.getStringExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_MESSAGE_ID)
                viewModel.setPendingChatRoomMessageId(messageId)
                viewModel.setPendingOpenChatRoomScreen(true)
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_MESSAGE_ID)
                return
            }
            "mandate_signing" -> {
                val token = intent.getStringExtra("token").orEmpty()
                if (token.isNotBlank()) {
                    val url = "https://management.mgsrfa.com/sign-mandate/$token"
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
                return
            }
            "player" -> {
                val playerId = intent.getStringExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_PLAYER_ID)
                    ?: intent.getStringExtra("playerId")
                if (!playerId.isNullOrBlank()) {
                    viewModel.setPendingDeepLinkPlayerId(playerId)
                }
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_SCREEN)
                intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_PLAYER_ID)
                intent.removeExtra("playerId")
                intent.removeExtra("type")
                return
            }
        }

        // Handle notification tap — action or type determines destination
        val notificationAction = intent.getStringExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_NOTIFICATION_ACTION)
        val dataType = intent.getStringExtra("type")

        // REQUEST_ADDED must always route to Requests — even when playerTmProfile is present.
        // Background notifications deliver raw FCM data (no "screen" extra), so the screen
        // check above may miss it. Handle it here before playerTmProfile processing.
        if (dataType == com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.TYPE_REQUEST_ADDED) {
            viewModel.setPendingOpenRequestsScreen(true)
            return
        }

        val notificationPlayerId = intent.getStringExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_PLAYER_ID)
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
                dataType == com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.TYPE_CLUB_CHANGE ||
                dataType == com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.TYPE_BECAME_FREE_AGENT ||
                dataType == com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.TYPE_MARKET_VALUE_CHANGE ->
                    viewModel.setPendingDeepLinkPlayerId(url)
                else -> {
                    viewModel.setPendingAddPlayerTmUrl(url)
                    PendingShareHolder.setPendingAddPlayerTmUrl(url)
                }
            }
            return
        }

        // Handle notification with playerId but no TM profile (e.g. agent transfer notifications)
        if (!notificationPlayerId.isNullOrBlank() && dataType != null) {
            intent.removeExtra(com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService.EXTRA_PLAYER_ID)
            viewModel.setPendingDeepLinkPlayerId(notificationPlayerId)
            return
        }

        // Handle Share (ACTION_SEND) or VIEW intent — extract Transfermarkt URL from all sources.
        // Store in BOTH ViewModel and PendingShareHolder: ViewModel for same-instance flow,
        // PendingShareHolder for cross-instance (share sheet can create new task).
        val shareUrl = extractTransfermarktUrlFromIntent(intent)
        when {
            BuildConfig.DEBUG && intent.action == Intent.ACTION_SEND ->
                Log.d("MGSR_DeepLink", "handleDeepLink: action=SEND, EXTRA_TEXT=${intent.getStringExtra(Intent.EXTRA_TEXT)?.take(80)}, extractedUrl=${shareUrl?.take(60)}")
            intent.action == Intent.ACTION_SEND && shareUrl == null -> {
                // Log extraction failure in release too — helps debug when share doesn't open add screen
                val raw = intent.getStringExtra(Intent.EXTRA_TEXT) ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: "(empty)"
                Log.w("MGSR_DeepLink", "handleDeepLink: SEND received but no Transfermarkt URL extracted. raw=${raw.take(120)}")
            }
        }
        shareUrl?.let { url ->
            viewModel.setPendingAddPlayerTmUrl(url)
            PendingShareHolder.setPendingAddPlayerTmUrl(url)
            if (BuildConfig.DEBUG) Log.d("MGSR_DeepLink", "handleDeepLink: set pending url (len=${url.length})")
            return
        }

        // Handle Google share short links (e.g. https://share.google/nfXwWF) — resolve redirect to get Transfermarkt URL
        if (intent.action == Intent.ACTION_SEND) {
            val rawText = intent.getStringExtra(Intent.EXTRA_TEXT)
                ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
                ?: return
            if (rawText.contains("Transfermarkt", ignoreCase = true) || rawText.contains("Transfer market", ignoreCase = true)) {
                val shortUrl = RedirectUrlResolver.extractUrlFromText(rawText)
                if (shortUrl != null && !shortUrl.contains("transfermarkt", ignoreCase = true)) {
                    lifecycleScope.launch {
                        val resolved = RedirectUrlResolver.resolveToTransfermarktUrl(shortUrl)
                        if (BuildConfig.DEBUG) Log.d("MGSR_DeepLink", "handleDeepLink: resolved shortUrl=$shortUrl -> $resolved")
                        resolved?.let { url ->
                            viewModel.setPendingAddPlayerTmUrl(url)
                            PendingShareHolder.setPendingAddPlayerTmUrl(url)
                        }
                    }
                    return
                }
            }
        }

        // Handle mgsrteam://player deep link
        val uri = intent.data ?: return
        when {
            uri.scheme == "mgsrteam" && uri.host == "player" -> {
                val path = uri.path?.trimStart('/') ?: uri.lastPathSegment
                path?.takeIf { it.isNotBlank() }?.let { viewModel.setPendingDeepLinkPlayerId(it) }
            }
        }
    }
}
