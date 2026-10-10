package com.liordahan.mgsrteam.features.platform

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.liordahan.mgsrteam.R

/**
 * MGSR platform enum (Men + Youth).
 * Each platform uses **completely separate** Firestore collections —
 * no data is shared between men and youth. (The Women platform was
 * removed from Android; the web app keeps it.)
 */
enum class Platform(
    @StringRes val labelRes: Int,
    val emoji: String,
    /** Primary accent colour for headers, chips, etc. */
    val accent: Color,
    /** Secondary colour for gradients & badges. */
    val accentSecondary: Color,
    // ── Firestore collection names ──
    val playersCollection: String,
    val clubRequestsCollection: String,
    val shortlistsCollection: String,
    val contactsCollection: String,
    val feedEventsCollection: String,
    val agentTasksCollection: String,
    val playerDocumentsCollection: String,
    val shadowTeamsCollection: String,
    val requestMatchResultsCollection: String,
    val playerMatchResultsCollection: String,
) {
    MEN(
        labelRes = R.string.platform_men,
        emoji = "⚔️",
        accent = Color(0xFF4DB6AC),          // teal – the classic MGSR colour
        accentSecondary = Color(0xFF26A69A),
        playersCollection = "Players",
        clubRequestsCollection = "ClubRequests",
        shortlistsCollection = "Shortlists",
        contactsCollection = "Contacts",
        feedEventsCollection = "FeedEvents",
        agentTasksCollection = "AgentTasks",
        playerDocumentsCollection = "PlayerDocuments",
        shadowTeamsCollection = "ShadowTeams",
        requestMatchResultsCollection = "RequestMatchResults",
        playerMatchResultsCollection = "PlayerMatchResults",
    ),
    YOUTH(
        labelRes = R.string.platform_youth,
        emoji = "⚡",
        accent = Color(0xFF00D4FF),           // cyan (web --youth-cyan)
        accentSecondary = Color(0xFFA855F7),  // violet (web --youth-violet)
        playersCollection = "PlayersYouth",
        clubRequestsCollection = "ClubRequestsYouth",
        shortlistsCollection = "ShortlistsYouth",
        contactsCollection = "ContactsYouth",
        feedEventsCollection = "FeedEventsYouth",
        agentTasksCollection = "AgentTasksYouth",
        playerDocumentsCollection = "PlayerDocumentsYouth",
        shadowTeamsCollection = "ShadowTeamsYouth",
        requestMatchResultsCollection = "RequestMatchResultsYouth",
        playerMatchResultsCollection = "PlayerMatchResultsYouth",
    );

    /** Horizontal gradient from [accent] → [accentSecondary].
     *  Youth uses a vertical gradient; Men uses a horizontal sweep. */
    val gradient: Brush
        get() = when (this) {
            YOUTH -> Brush.verticalGradient(
                colors = listOf(accentSecondary, accent)
            )
            MEN -> Brush.horizontalGradient(listOf(accent, accentSecondary))
        }

    /** Soft background-tinted gradient for card surfaces.
     *  Youth uses a vertical sweep; Men uses a horizontal sweep. */
    val surfaceGradient: Brush
        get() = when (this) {
            YOUTH -> Brush.verticalGradient(
                listOf(accentSecondary.copy(alpha = 0.12f), accent.copy(alpha = 0.08f))
            )
            MEN -> Brush.horizontalGradient(
                listOf(accent.copy(alpha = 0.15f), accentSecondary.copy(alpha = 0.08f))
            )
        }
}
