package com.liordahan.mgsrteam.features.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.components.PrimaryButtonNewDesign
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

private const val DARK_NAV_BAR_COLOR = 0xFF0F1923.toInt()

@Composable
fun LoginScreen(
    viewModel: ILoginScreenViewModel = koinViewModel(),
    navController: NavController
) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var showButtonProgress by remember { mutableStateOf(false) }

    var email by remember { mutableStateOf(TextFieldValue("")) }
    var password by remember { mutableStateOf(TextFieldValue("")) }
    var passwordVisible by remember { mutableStateOf(false) }
    var loginError by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    val currentLang = remember { mutableStateOf(LocaleManager.getSavedLanguage(context)) }
    val isHebrew = currentLang.value == LocaleManager.LANG_HEBREW

    val view = LocalView.current
    DisposableEffect(Unit) {
        val window = view.context.findWindow()
        if (window != null) {
            window.navigationBarColor = DARK_NAV_BAR_COLOR
            window.statusBarColor = DARK_NAV_BAR_COLOR
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
        onDispose { }
    }

    LaunchedEffect(Unit) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                viewModel.userLoginFlow.collect {
                    when (it) {
                        is UiResult.Failed -> {
                            showButtonProgress = false
                            loginError = it.cause
                        }
                        UiResult.Loading -> {
                            showButtonProgress = true
                        }
                        is UiResult.Success<*> -> {
                            navController.navigate(Screens.HomeScreen.route)
                        }
                        UiResult.UnInitialized -> {}
                    }
                }
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground,
        contentWindowInsets = WindowInsets.systemBars,
    ) { padding ->

        Box(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            // ── Main login form (centred) ───────────────────────────────
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {

                Image(
                    painter = painterResource(R.drawable.for_app_logo),
                    contentDescription = null,
                    modifier = Modifier.size(95.dp)
                )

                Spacer(Modifier.height(20.dp))

                Box(
                    modifier = Modifier
                        .width(40.dp)
                        .height(3.dp)
                        .background(HomeTealAccent, RoundedCornerShape(2.dp))
                )

                Spacer(Modifier.height(28.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(HomeDarkCard, RoundedCornerShape(16.dp))
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp))
                        .padding(20.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppTextField(
                            textInput = email,
                            onValueChange = { email = it; loginError = null },
                            hint = stringResource(R.string.login_button_email_hint),
                            leadingIcon = Icons.Default.Mail,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                imeAction = ImeAction.Next
                            ),
                            darkTheme = true
                        )

                        AppTextField(
                            textInput = password,
                            onValueChange = { password = it; loginError = null },
                            hint = stringResource(R.string.login_button_password_hint),
                            leadingIcon = Icons.Default.Lock,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Done
                            ),
                            onTrailingIconClicked = { passwordVisible = !passwordVisible },
                            darkTheme = true,
                            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation()
                        )
                    }
                }

                if (loginError != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = loginError ?: stringResource(R.string.login_error_invalid_credentials),
                        style = regularTextStyle(HomeRedAccent, 12.sp),
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(Modifier.height(24.dp))

                PrimaryButtonNewDesign(
                    buttonText = stringResource(R.string.login_button_title),
                    buttonElevation = 4.dp,
                    isEnabled = email.text.isNotBlank() && password.text.isNotBlank(),
                    showProgress = showButtonProgress,
                    loadingText = stringResource(R.string.login_signing_in),
                    containerColor = HomeTealAccent,
                    disabledContainerColor = HomeDarkCard,
                    onButtonClicked = {
                        loginError = null
                        viewModel.login(email.text, password.text)
                    }
                )
            }

            // ── Language toggle (top-end) ───────────────────────────────
            LanguageToggle(
                isHebrew = isHebrew,
                onToggle = { newLang ->
                    LocaleManager.saveLanguage(context, newLang)
                    currentLang.value = newLang
                    LocaleManager.applyLocale(context)
                },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 54.dp, end = 20.dp)
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LANGUAGE TOGGLE (EN / עב)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun LanguageToggle(
    isHebrew: Boolean,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(HomeDarkCard)
            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(20.dp))
            .padding(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // English option
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(17.dp))
                .background(if (!isHebrew) HomeTealAccent else HomeDarkCard)
                .clickWithNoRipple { onToggle(LocaleManager.LANG_ENGLISH) }
                .padding(horizontal = 14.dp, vertical = 7.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(R.drawable.ic_flag_usa),
                    contentDescription = null,
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                )
                Spacer(Modifier.width(5.dp))
                Text(
                    text = "EN",
                    style = boldTextStyle(
                        if (!isHebrew) HomeDarkBackground else HomeTextSecondary,
                        12.sp
                    )
                )
            }
        }

        // Hebrew option
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(17.dp))
                .background(if (isHebrew) HomeTealAccent else HomeDarkCard)
                .clickWithNoRipple { onToggle(LocaleManager.LANG_HEBREW) }
                .padding(horizontal = 14.dp, vertical = 7.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(R.drawable.ic_flag_israel),
                    contentDescription = null,
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                )
                Spacer(Modifier.width(5.dp))
                Text(
                    text = "עב",
                    style = boldTextStyle(
                        if (isHebrew) HomeDarkBackground else HomeTextSecondary,
                        12.sp
                    )
                )
            }
        }
    }
}

private fun android.content.Context.findWindow(): android.view.Window? {
    var ctx: android.content.Context? = this
    while (ctx != null) {
        when (ctx) {
            is android.app.Activity -> return ctx.window
            is android.content.ContextWrapper -> ctx = ctx.baseContext
            else -> break
        }
    }
    return null
}
