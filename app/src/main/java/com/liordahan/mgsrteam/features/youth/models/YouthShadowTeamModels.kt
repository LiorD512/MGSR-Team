package com.liordahan.mgsrteam.features.youth.models

import androidx.annotation.Keep

/**
 * Youth-dedicated shadow team data models.
 * Maps to the "ShadowTeamsYouth" Firestore collection.
 */
@Keep
data class YouthShadowPlayer(
    val id: String,
    val fullName: String,
    val profileImage: String? = null
)

@Keep
data class YouthPositionSlot(
    val starter: YouthShadowPlayer?
)

@Keep
data class YouthShadowTeamData(
    val formationId: String,
    val slots: List<YouthPositionSlot>
)
