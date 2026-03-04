package com.liordahan.mgsrteam.features.women.models

import androidx.annotation.Keep

/**
 * Women-dedicated shadow team data models.
 * Maps to the "ShadowTeamsWomen" Firestore collection.
 */
@Keep
data class WomenShadowPlayer(
    val id: String,
    val fullName: String,
    val profileImage: String? = null
)

@Keep
data class WomenPositionSlot(
    val starter: WomenShadowPlayer?
)

@Keep
data class WomenShadowTeamData(
    val formationId: String,
    val slots: List<WomenPositionSlot>
)
