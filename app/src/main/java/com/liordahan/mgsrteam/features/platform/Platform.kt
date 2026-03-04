package com.liordahan.mgsrteam.features.platform

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.liordahan.mgsrteam.R

/**
 * MGSR tri-platform enum.
 * Each platform uses **completely separate** Firestore collections —
 * no data is shared between men, women and youth.
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
) {
    MEN(
        labelRes = R.string.platform_men,
        emoji = "⚽",
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
    ),
    WOMEN(
        labelRes = R.string.platform_women,
        emoji = "🌸",
        accent = Color(0xFFE8A0BF),           // rose / pink (web --women-rose)
        accentSecondary = Color(0xFFD4A5A5),   // blush (web --women-blush)
        playersCollection = "PlayersWomen",
        clubRequestsCollection = "ClubRequestsWomen",
        shortlistsCollection = "ShortlistsWomen",
        contactsCollection = "ContactsWomen",
        feedEventsCollection = "FeedEventsWomen",
        agentTasksCollection = "AgentTasksWomen",
        playerDocumentsCollection = "PlayerDocumentsWomen",
        shadowTeamsCollection = "ShadowTeamsWomen",
    ),
    YOUTH(
        labelRes = R.string.platform_youth,
        emoji = "🌟",
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
    );

    /** Horizontal gradient from [accent] → [accentSecondary]. */
    val gradient: Brush
        get() = Brush.horizontalGradient(listOf(accent, accentSecondary))

    /** Soft background-tinted gradient for card surfaces. */
    val surfaceGradient: Brush
        get() = Brush.horizontalGradient(
            listOf(accent.copy(alpha = 0.15f), accentSecondary.copy(alpha = 0.08f))
        )
}
