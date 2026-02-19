package com.liordahan.mgsrteam.features.login

import android.util.Patterns
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel
import kotlin.math.roundToInt

// ═════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

private const val ENTRANCE_DURATION_MS = 800
private const val SHAKE_DURATION_MS = 400

// ═════════════════════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

@Composable
fun LoginScreen(
    viewModel: ILoginScreenViewModel = koinViewModel(),
    navController: NavController
) {
    // ── Reactive state from ViewModel ────────────────────────────────────
    val loginState by viewModel.userLoginFlow.collectAsStateWithLifecycle()

    // ── Local UI state ───────────────────────────────────────────────────
    var email by remember { mutableStateOf(TextFieldValue("")) }
    var password by remember { mutableStateOf(TextFieldValue("")) }
    var passwordVisible by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    val currentLang = remember { mutableStateOf(LocaleManager.getSavedLanguage(context)) }
    val isHebrew = currentLang.value == LocaleManager.LANG_HEBREW

    // ── Derived state (no extra recomposition) ───────────────────────────
    val showButtonProgress by remember { derivedStateOf { loginState is UiResult.Loading } }
    val serverError = (loginState as? UiResult.Failed)?.cause
    val displayError = localError ?: serverError
    val isFormValid by remember {
        derivedStateOf { email.text.isNotBlank() && password.text.isNotBlank() }
    }

    // ── Focus management ─────────────────────────────────────────────────
    val passwordFocusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    // ── Entrance animation ───────────────────────────────────────────────
    val entranceProgress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        entranceProgress.animateTo(
            targetValue = 1f,
            animationSpec = tween(
                durationMillis = ENTRANCE_DURATION_MS,
                easing = FastOutSlowInEasing
            )
        )
    }

    // Staggered thresholds – each element fades in at a different point
    val logoAlpha = (entranceProgress.value / 0.3f).coerceIn(0f, 1f)
    val titleAlpha = ((entranceProgress.value - 0.15f) / 0.25f).coerceIn(0f, 1f)
    val formAlpha = ((entranceProgress.value - 0.3f) / 0.35f).coerceIn(0f, 1f)
    val buttonAlpha = ((entranceProgress.value - 0.55f) / 0.35f).coerceIn(0f, 1f)

    val logoOffsetY = ((1f - logoAlpha) * 24f)
    val titleOffsetY = ((1f - titleAlpha) * 18f)
    val formOffsetY = ((1f - formAlpha) * 16f)
    val buttonOffsetY = ((1f - buttonAlpha) * 12f)

    // ── Shake animation on server error ──────────────────────────────────
    val shakeOffset = remember { Animatable(0f) }
    LaunchedEffect(serverError) {
        if (serverError != null) {
            shakeOffset.animateTo(
                targetValue = 0f,
                animationSpec = keyframes {
                    durationMillis = SHAKE_DURATION_MS
                    0f at 0
                    -12f at 50
                    12f at 100
                    -8f at 150
                    8f at 200
                    -4f at 250
                    4f at 300
                    0f at SHAKE_DURATION_MS
                }
            )
        }
    }

    // ── Navigation (one-time guard prevents double-navigation) ───────────
    var hasNavigated by remember { mutableStateOf(false) }
    LaunchedEffect(loginState) {
        if (loginState is UiResult.Success<*> && !hasNavigated) {
            hasNavigated = true
            navController.navigate(Screens.HomeScreen.route) {
                popUpTo(Screens.LoginScreen.route) { inclusive = true }
            }
        }
    }

    // ── Login action (validates → hides keyboard → calls VM) ─────────────
    val performLogin = {
        localError = null
        val trimmedEmail = email.text.trim()
        when {
            !Patterns.EMAIL_ADDRESS.matcher(trimmedEmail).matches() -> {
                localError = context.getString(R.string.login_error_invalid_email)
            }
            else -> {
                keyboardController?.hide()
                focusManager.clearFocus()
                viewModel.login(trimmedEmail, password.text)
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  UI
    // ═════════════════════════════════════════════════════════════════════

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = HomeDarkBackground,
        contentWindowInsets = WindowInsets.systemBars,
    ) { padding ->

        Box(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .imePadding()
        ) {
            // ── Main login form (scrollable, centred) ────────────────────
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {

                // ── Logo ─────────────────────────────────────────────────
                Image(
                    painter = painterResource(R.drawable.for_app_logo),
                    contentDescription = stringResource(R.string.login_cd_app_logo),
                    modifier = Modifier
                        .size(95.dp)
                        .alpha(logoAlpha)
                        .offset { IntOffset(0, (logoOffsetY * density).roundToInt()) }
                )

                Spacer(Modifier.height(16.dp))

                // ── Gradient accent line ─────────────────────────────────
                Box(
                    modifier = Modifier
                        .width(40.dp)
                        .height(3.dp)
                        .alpha(logoAlpha)
                        .background(
                            brush = Brush.horizontalGradient(
                                colors = listOf(
                                    HomeTealAccent.copy(alpha = 0.4f),
                                    HomeTealAccent,
                                    HomeTealAccent.copy(alpha = 0.4f)
                                )
                            ),
                            shape = RoundedCornerShape(2.dp)
                        )
                )

                Spacer(Modifier.height(20.dp))

                // ── Welcome text ─────────────────────────────────────────
                Text(
                    text = stringResource(R.string.login_welcome_title),
                    style = boldTextStyle(HomeTextPrimary, 22.sp),
                    modifier = Modifier
                        .alpha(titleAlpha)
                        .offset { IntOffset(0, (titleOffsetY * density).roundToInt()) }
                )

                Spacer(Modifier.height(4.dp))

                Text(
                    text = stringResource(R.string.login_welcome_subtitle),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    modifier = Modifier
                        .alpha(titleAlpha)
                        .offset { IntOffset(0, (titleOffsetY * density).roundToInt()) }
                )

                Spacer(Modifier.height(28.dp))

                // ── Form card (shakes on error) ──────────────────────────
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .alpha(formAlpha)
                        .offset {
                            IntOffset(
                                x = (shakeOffset.value * density).roundToInt(),
                                y = (formOffsetY * density).roundToInt()
                            )
                        }
                        .background(HomeDarkCard, RoundedCornerShape(16.dp))
                        .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(16.dp))
                        .padding(20.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {

                        // Email field
                        AppTextField(
                            textInput = email,
                            onValueChange = { email = it; localError = null },
                            hint = stringResource(R.string.login_button_email_hint),
                            leadingIcon = Icons.Default.Mail,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { passwordFocusRequester.requestFocus() }
                            ),
                            darkTheme = true
                        )

                        // Password field
                        AppTextField(
                            modifier = Modifier.focusRequester(passwordFocusRequester),
                            textInput = password,
                            onValueChange = { password = it; localError = null },
                            hint = stringResource(R.string.login_button_password_hint),
                            leadingIcon = Icons.Default.Lock,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = { if (isFormValid) performLogin() }
                            ),
                            darkTheme = true,
                            visualTransformation = if (passwordVisible) VisualTransformation.None
                                                   else PasswordVisualTransformation()
                        )
                    }
                }

                // ── Animated error message ───────────────────────────────
                AnimatedVisibility(
                    visible = displayError != null,
                    enter = fadeIn(tween(200)) + slideInVertically(
                        initialOffsetY = { -it / 2 },
                        animationSpec = tween(200)
                    ),
                    exit = fadeOut(tween(150)) + slideOutVertically(
                        targetOffsetY = { -it / 2 },
                        animationSpec = tween(150)
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Start
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ErrorOutline,
                            contentDescription = null,
                            tint = HomeRedAccent,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = displayError
                                ?: stringResource(R.string.login_error_invalid_credentials),
                            style = regularTextStyle(HomeRedAccent, 13.sp),
                        )
                    }
                }

                Spacer(Modifier.height(24.dp))

                // ── Login button ─────────────────────────────────────────
                Box(
                    modifier = Modifier
                        .alpha(buttonAlpha)
                        .offset { IntOffset(0, (buttonOffsetY * density).roundToInt()) }
                ) {
                    PrimaryButtonNewDesign(
                        buttonText = stringResource(R.string.login_button_title),
                        buttonElevation = 4.dp,
                        isEnabled = isFormValid && !showButtonProgress,
                        showProgress = showButtonProgress,
                        loadingText = stringResource(R.string.login_signing_in),
                        containerColor = HomeTealAccent,
                        disabledContainerColor = HomeDarkCard,
                        onButtonClicked = performLogin
                    )
                }

                // Bottom spacing for keyboard push
                Spacer(Modifier.height(32.dp))
            }

            // ── Language toggle (top-end) ────────────────────────────────
            LanguageToggle(
                isHebrew = isHebrew,
                onToggle = { newLang ->
                    LocaleManager.saveLanguage(context, newLang)
                    currentLang.value = newLang
                    LocaleManager.applyLocale(context)
                },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 16.dp, end = 16.dp)
                    .semantics {
                        contentDescription =
                            context.getString(R.string.login_cd_language_toggle)
                    }
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LANGUAGE TOGGLE  (EN / עב)
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
        LanguageOption(
            isSelected = !isHebrew,
            flagRes = R.drawable.ic_flag_usa,
            label = "EN",
            onClick = { onToggle(LocaleManager.LANG_ENGLISH) }
        )

        LanguageOption(
            isSelected = isHebrew,
            flagRes = R.drawable.ic_flag_israel,
            label = "עב",
            onClick = { onToggle(LocaleManager.LANG_HEBREW) }
        )
    }
}

/**
 * Single language pill inside the toggle.
 * Uses Material ripple for proper Android tactile feedback.
 */
@Composable
private fun LanguageOption(
    isSelected: Boolean,
    flagRes: Int,
    label: String,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(17.dp))
            .background(if (isSelected) HomeTealAccent else HomeDarkCard)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple(bounded = true, color = HomeTealAccent),
                onClick = onClick
            )
            .padding(horizontal = 14.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                painter = painterResource(flagRes),
                contentDescription = null,
                modifier = Modifier
                    .size(16.dp)
                    .clip(CircleShape)
            )
            Spacer(Modifier.width(5.dp))
            Text(
                text = label,
                style = boldTextStyle(
                    if (isSelected) HomeDarkBackground else HomeTextSecondary,
                    12.sp
                )
            )
        }
    }
}
