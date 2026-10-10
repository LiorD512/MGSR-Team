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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono
import org.koin.androidx.compose.koinViewModel
import kotlin.math.roundToInt

// ═════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

private const val ENTRANCE_DURATION_MS = 800
private const val SHAKE_DURATION_MS = 400

// ── Login palette — matched to the web .brit-login (globals.css) ──
// Dark brand panel on top (black + gold radial glow), paper sign-in pane below.
private val LoginBrandBlack = BritTokens.black        // --black #11110f
private val LoginBrandGradTop = Color(0xFF2A2419)     // brand bg gradient top
private val LoginBrandGradBottom = Color(0xFF121009)  // brand bg gradient bottom
private val LoginGhost = Color(0x12C9A66B)            // translucent gold ghost "B"
private val LoginGoldBright = Color(0xFFE4C98B)       // --gold-bright
private val LoginGoldSoft = BritTokens.goldSoft       // --gold-soft #c9a66b
private val LoginGold = BritTokens.gold               // --gold #a47d43
private val LoginPaper = BritTokens.paper             // --paper #f3f0e8
private val LoginCard = BritTokens.card               // --card #fbf9f3
private val LoginInk = BritTokens.ink                 // --ink #161613
private val LoginMuted = BritTokens.muted             // --muted #77736a
private val LoginLine = BritTokens.line               // --line hairline
private val LoginBrandBodyMuted = Color(0xFFC9C3B6)   // tagline on dark
private val LoginBrandFootMuted = Color(0xFF8C877C)   // secure footer on dark
private val LoginRed = BritTokens.red                 // --red

// ═════════════════════════════════════════════════════════════════════════════
//  LOGIN SCREEN  (matched to the web Management Room login)
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
    val density = LocalDensity.current.density
    val currentLang = remember { mutableStateOf(LocaleManager.getSavedLanguage(context)) }
    val isHebrew = currentLang.value == LocaleManager.LANG_HEBREW

    // ── Derived state ────────────────────────────────────────────────────
    val showButtonProgress by remember { derivedStateOf { loginState is UiResult.Loading } }
    val serverError = (loginState as? UiResult.Failed)?.cause
    val displayError = localError ?: serverError
    val isFormValid by remember {
        derivedStateOf { email.text.isNotBlank() && password.text.isNotBlank() }
    }

    // ── Focus / keyboard ─────────────────────────────────────────────────
    val passwordFocusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    // ── Entrance animation (staggered) ───────────────────────────────────
    val entranceProgress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        entranceProgress.animateTo(
            targetValue = 1f,
            animationSpec = tween(ENTRANCE_DURATION_MS, easing = FastOutSlowInEasing)
        )
    }
    val brandAlpha = (entranceProgress.value / 0.4f).coerceIn(0f, 1f)
    val formAlpha = ((entranceProgress.value - 0.3f) / 0.5f).coerceIn(0f, 1f)
    val brandOffsetY = (1f - brandAlpha) * 18f
    val formOffsetY = (1f - formAlpha) * 16f

    // ── Shake on server error ────────────────────────────────────────────
    val shakeOffset = remember { Animatable(0f) }
    LaunchedEffect(serverError) {
        if (serverError != null) {
            shakeOffset.animateTo(
                targetValue = 0f,
                animationSpec = keyframes {
                    durationMillis = SHAKE_DURATION_MS
                    0f at 0; -12f at 50; 12f at 100; -8f at 150; 8f at 200; -4f at 250; 4f at 300; 0f at SHAKE_DURATION_MS
                }
            )
        }
    }

    // ── Navigation (one-time guard) ──────────────────────────────────────
    var hasNavigated by remember { mutableStateOf(false) }
    LaunchedEffect(loginState) {
        if (loginState is UiResult.Success<*> && !hasNavigated) {
            hasNavigated = true
            navController.navigate(Screens.HomeScreen.route) {
                popUpTo(Screens.LoginScreen.route) { inclusive = true }
            }
        }
    }

    // ── Login action ─────────────────────────────────────────────────────
    val performLogin = {
        localError = null
        val trimmedEmail = email.text.trim()
        if (!Patterns.EMAIL_ADDRESS.matcher(trimmedEmail).matches()) {
            localError = context.getString(R.string.login_error_invalid_email)
        } else {
            keyboardController?.hide()
            focusManager.clearFocus()
            viewModel.login(trimmedEmail, password.text)
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  UI — single scrollable column: dark brand panel → paper sign-in pane
    // ═════════════════════════════════════════════════════════════════════
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = LoginPaper,
        contentWindowInsets = WindowInsets.systemBars,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .background(LoginPaper)
        ) {
            // ─────────────────────────────────────────────────────────────
            //  BRAND PANEL (dark)
            // ─────────────────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(LoginBrandGradTop, LoginBrandGradBottom)
                        )
                    )
                    .alpha(brandAlpha)
                    .offset { IntOffset(0, (brandOffsetY * density).roundToInt()) }
            ) {
                // Gold radial glow accents (web .bl-bg)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(380.dp)
                        .background(
                            brush = Brush.radialGradient(
                                colors = listOf(Color(0x29E4C98B), Color.Transparent),
                                radius = 650f
                            )
                        )
                )
                // Translucent ghost "B" (web .bl-ghost)
                Text(
                    text = "B",
                    style = britDisplay(LoginGhost, 300.sp, weight = 500, letterSpacing = (-6).sp),
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset { IntOffset((20 * density).roundToInt(), (-70 * density).roundToInt()) }
                )

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 28.dp, end = 28.dp, top = 56.dp, bottom = 40.dp)
                ) {
                    // Crest: real BRIT circle logo + wordmark
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            painter = painterResource(R.drawable.brit_circle_black_gold),
                            contentDescription = stringResource(R.string.login_cd_app_logo),
                            tint = Color.Unspecified,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(
                                text = stringResource(R.string.login_wordmark),
                                style = britDisplay(LoginPaper, 14.sp, weight = 500, letterSpacing = 2.sp)
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = stringResource(R.string.login_wordmark_sub),
                                style = britMono(LoginGoldSoft, 8.sp, letterSpacing = 1.8.sp)
                            )
                        }
                    }

                    Spacer(Modifier.height(34.dp))

                    Text(
                        text = stringResource(R.string.login_brand_eyebrow),
                        style = britMono(LoginGoldBright, 9.sp, letterSpacing = 2.2.sp)
                    )
                    Spacer(Modifier.height(18.dp))
                    Text(
                        text = stringResource(R.string.login_brand_line1) + "\n" +
                            stringResource(R.string.login_brand_line2) + "\n" +
                            stringResource(R.string.login_brand_line3),
                        style = britDisplay(LoginPaper, 52.sp, weight = 500, letterSpacing = (-1).sp)
                    )
                    Spacer(Modifier.height(18.dp))
                    Text(
                        text = stringResource(R.string.login_brand_tagline),
                        style = britBody(LoginBrandBodyMuted, 12.sp),
                        modifier = Modifier.fillMaxWidth(0.82f)
                    )
                }
            }

            // ─────────────────────────────────────────────────────────────
            //  SIGN-IN PANE (paper)
            // ─────────────────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(LoginPaper)
            ) {
                // Language toggle (top-end of the pane)
                LanguageToggle(
                    isHebrew = isHebrew,
                    onToggle = { newLang ->
                        LocaleManager.saveLanguage(context, newLang)
                        currentLang.value = newLang
                        LocaleManager.applyLocale(context)
                    },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 22.dp, end = 24.dp)
                        .semantics {
                            contentDescription = context.getString(R.string.login_cd_language_toggle)
                        }
                )

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .alpha(formAlpha)
                        .offset {
                            IntOffset(
                                x = (shakeOffset.value * density).roundToInt(),
                                y = (formOffsetY * density).roundToInt()
                            )
                        }
                        .padding(start = 28.dp, end = 28.dp, top = 32.dp, bottom = 40.dp)
                ) {
                    Text(
                        text = stringResource(R.string.login_kicker),
                        style = britMono(LoginGold, 9.sp, letterSpacing = 2.sp)
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.login_heading),
                        style = britDisplay(LoginInk, 42.sp, weight = 500, letterSpacing = (-0.5).sp)
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = stringResource(R.string.login_subtitle),
                        style = britBody(LoginMuted, 12.sp)
                    )

                    // Gold hairline rule
                    Spacer(Modifier.height(30.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(
                                brush = Brush.horizontalGradient(
                                    colors = listOf(Color.Transparent, LoginGoldSoft, Color.Transparent)
                                )
                            )
                    )
                    Spacer(Modifier.height(30.dp))

                    // Email field
                    LoginField(
                        label = stringResource(R.string.login_email_label),
                        value = email,
                        onValueChange = { email = it; localError = null },
                        placeholder = stringResource(R.string.login_email_placeholder),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { passwordFocusRequester.requestFocus() }
                        )
                    )

                    Spacer(Modifier.height(20.dp))

                    // Password field (with Show/Hide peek)
                    LoginField(
                        label = stringResource(R.string.login_password_label),
                        value = password,
                        onValueChange = { password = it; localError = null },
                        placeholder = "••••••••",
                        modifier = Modifier.focusRequester(passwordFocusRequester),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { if (isFormValid) performLogin() }
                        ),
                        visualTransformation = if (passwordVisible) VisualTransformation.None
                        else PasswordVisualTransformation(),
                        peekLabel = stringResource(
                            if (passwordVisible) R.string.login_hide else R.string.login_show
                        ),
                        onPeek = { passwordVisible = !passwordVisible }
                    )

                    // Error
                    AnimatedVisibility(
                        visible = displayError != null,
                        enter = fadeIn(tween(200)) + slideInVertically(animationSpec = tween(200)) { -it / 2 },
                        exit = fadeOut(tween(150)) + slideOutVertically(animationSpec = tween(150)) { -it / 2 }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 16.dp)
                                .border(1.dp, LoginRed, RoundedCornerShape(0.dp))
                                .background(Color(0x12B64235))
                                .padding(11.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.ErrorOutline,
                                contentDescription = null,
                                tint = LoginRed,
                                modifier = Modifier.size(15.dp)
                            )
                            Spacer(Modifier.width(9.dp))
                            Text(
                                text = displayError
                                    ?: stringResource(R.string.login_error_invalid_credentials),
                                style = britMono(LoginRed, 10.sp, letterSpacing = 0.4.sp)
                            )
                        }
                    }

                    Spacer(Modifier.height(26.dp))

                    // Submit — rectangular gold bar with ink text + arrow (web .bl-submit)
                    SubmitButton(
                        enabled = isFormValid && !showButtonProgress,
                        loading = showButtonProgress,
                        label = stringResource(
                            if (showButtonProgress) R.string.login_signing_in else R.string.login_heading
                        ),
                        onClick = performLogin
                    )

                    Spacer(Modifier.height(26.dp))

                    Text(
                        text = stringResource(R.string.login_hint),
                        style = britMono(LoginMuted, 9.sp, letterSpacing = 0.6.sp, textAlign = TextAlign.Center),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(22.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(5.dp)
                                .clip(CircleShape)
                                .background(LoginGoldSoft)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.login_secure) + " · © " +
                                stringResource(R.string.login_wordmark),
                            style = britMono(LoginBrandFootMuted.copy(alpha = 0.9f), 8.sp, letterSpacing = 1.2.sp)
                        )
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LOGIN FIELD  (web .bl-field — label above, hairline-bordered card input)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun LoginField(
    label: String,
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardOptions: KeyboardOptions,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    peekLabel: String? = null,
    onPeek: (() -> Unit)? = null
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = britMono(LoginMuted, 9.sp, letterSpacing = 1.2.sp)
        )
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(LoginCard)
                .border(1.dp, LoginLine, RoundedCornerShape(0.dp))
                .padding(horizontal = 15.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(modifier = Modifier.weight(1f).padding(vertical = 14.dp)) {
                if (value.text.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = britMono(LoginInk.copy(alpha = 0.34f), 12.sp)
                    )
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = modifier.fillMaxWidth(),
                    singleLine = true,
                    textStyle = britBody(LoginInk, 14.sp),
                    cursorBrush = Brush.verticalGradient(listOf(LoginGold, LoginGold)),
                    keyboardOptions = keyboardOptions,
                    keyboardActions = keyboardActions,
                    visualTransformation = visualTransformation
                )
            }
            if (peekLabel != null && onPeek != null) {
                Text(
                    text = peekLabel,
                    style = britMono(LoginMuted, 8.sp, letterSpacing = 0.6.sp),
                    modifier = Modifier
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onPeek
                        )
                        .padding(start = 10.dp, top = 6.dp, bottom = 6.dp)
                )
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SUBMIT BUTTON  (web .bl-submit — gold bar, ink label, arrow)
// ═════════════════════════════════════════════════════════════════════════════

@Composable
private fun SubmitButton(
    enabled: Boolean,
    loading: Boolean,
    label: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .background(if (enabled || loading) LoginGoldSoft else LoginGoldSoft.copy(alpha = 0.5f))
            .border(1.dp, LoginGold, RoundedCornerShape(0.dp))
            .clickable(
                enabled = enabled && !loading,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        if (loading) {
            CircularProgressIndicator(
                color = LoginInk,
                modifier = Modifier.size(15.dp),
                strokeWidth = 2.dp
            )
            Spacer(Modifier.width(10.dp))
        }
        Text(
            text = label,
            style = britMono(LoginInk, 10.sp, letterSpacing = 2.2.sp)
        )
        if (!loading) {
            Spacer(Modifier.width(10.dp))
            Text(text = "→", style = britBody(LoginInk, 14.sp))
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
    Box(
        modifier = modifier
            .border(1.dp, LoginLine, RoundedCornerShape(0.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {
                    onToggle(if (isHebrew) LocaleManager.LANG_ENGLISH else LocaleManager.LANG_HEBREW)
                }
            )
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(
            text = if (isHebrew) "English" else "עברית",
            style = britMono(LoginMuted, 8.sp, letterSpacing = 0.8.sp)
        )
    }
}
