package com.liordahan.mgsrteam.navigation

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.navigation.NavBackStackEntry

/**
 * Single source of truth for all navigation transitions in the app.
 *
 * Uses Material Motion best practices:
 * - Partial slide (25% of width) instead of full-width — less overdraw, faster rendering
 * - Fade combined with slide — hides background color changes, prevents flash
 * - FastOutSlowIn easing on enter — starts fast, decelerates naturally
 * - FastOutLinearIn easing on exit — accelerates out, feels snappy
 * - Exit is shorter than enter — old screen disappears quickly, new one settles in
 */
object NavigationTransitions {

    private const val ENTER_DURATION_MS = 250
    private const val EXIT_DURATION_MS = 200

    // ── Forward navigation (push) ────────────────────────────────────────

    val enterTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        fadeIn(
            animationSpec = tween(
                durationMillis = ENTER_DURATION_MS,
                easing = FastOutSlowInEasing
            )
        ) + slideInHorizontally(
            initialOffsetX = { fullWidth -> fullWidth / 4 },
            animationSpec = tween(
                durationMillis = ENTER_DURATION_MS,
                easing = FastOutSlowInEasing
            )
        )
    }

    val exitTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        fadeOut(
            animationSpec = tween(
                durationMillis = EXIT_DURATION_MS,
                easing = FastOutLinearInEasing
            )
        ) + slideOutHorizontally(
            targetOffsetX = { fullWidth -> -fullWidth / 4 },
            animationSpec = tween(
                durationMillis = EXIT_DURATION_MS,
                easing = FastOutLinearInEasing
            )
        )
    }

    // ── Back navigation (pop) ────────────────────────────────────────────

    val popEnterTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        fadeIn(
            animationSpec = tween(
                durationMillis = ENTER_DURATION_MS,
                easing = FastOutSlowInEasing
            )
        ) + slideInHorizontally(
            initialOffsetX = { fullWidth -> -fullWidth / 4 },
            animationSpec = tween(
                durationMillis = ENTER_DURATION_MS,
                easing = FastOutSlowInEasing
            )
        )
    }

    val popExitTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        fadeOut(
            animationSpec = tween(
                durationMillis = EXIT_DURATION_MS,
                easing = FastOutLinearInEasing
            )
        ) + slideOutHorizontally(
            targetOffsetX = { fullWidth -> fullWidth / 4 },
            animationSpec = tween(
                durationMillis = EXIT_DURATION_MS,
                easing = FastOutLinearInEasing
            )
        )
    }

    // ── Auth / root-level transitions (fade only, no slide) ──────────────

    val fadeEnterTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        fadeIn(
            animationSpec = tween(
                durationMillis = 300,
                easing = FastOutSlowInEasing
            )
        )
    }

    val fadeExitTransition: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        fadeOut(
            animationSpec = tween(
                durationMillis = 300,
                easing = FastOutLinearInEasing
            )
        )
    }
}
