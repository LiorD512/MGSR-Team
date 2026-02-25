package com.liordahan.mgsrteam.features.shadowteams

import androidx.annotation.Keep

@Keep
data class ShadowPlayer(
    val id: String,
    val fullName: String,
    val profileImage: String? = null
)

@Keep
data class PositionSlot(
    val starter: ShadowPlayer?
)

@Keep
data class ShadowTeamData(
    val formationId: String,
    val slots: List<PositionSlot>
)

@Keep
data class FormationPosition(
    val code: String,
    val x: Float,
    val y: Float,
    /** Display label matching web (RCB, LCB, LCM, etc.) */
    val displayCode: String = code
)

object FormationDefinitions {
    val formations = mapOf(
        "4-3-3" to listOf(
            FormationPosition("GK", 50f, 6f, "GK"),
            FormationPosition("LB", 85f, 24f, "LB"),
            FormationPosition("CB", 35f, 24f, "LCB"),
            FormationPosition("CB", 65f, 24f, "RCB"),
            FormationPosition("RB", 15f, 24f, "RB"),
            FormationPosition("CM", 30f, 48f, "LCM"),
            FormationPosition("CM", 50f, 48f, "CM"),
            FormationPosition("CM", 70f, 48f, "RCM"),
            FormationPosition("LW", 75f, 78f, "LW"),
            FormationPosition("ST", 50f, 78f, "ST"),
            FormationPosition("RW", 25f, 78f, "RW")
        ),
        "4-4-2" to listOf(
            FormationPosition("GK", 50f, 6f, "GK"),
            FormationPosition("LB", 85f, 24f, "LB"),
            FormationPosition("CB", 35f, 24f, "LCB"),
            FormationPosition("CB", 65f, 24f, "RCB"),
            FormationPosition("RB", 15f, 24f, "RB"),
            FormationPosition("LM", 80f, 50f, "LM"),
            FormationPosition("CM", 40f, 50f, "LCM"),
            FormationPosition("CM", 60f, 50f, "RCM"),
            FormationPosition("RM", 20f, 50f, "RM"),
            FormationPosition("ST", 38f, 82f, "LST"),
            FormationPosition("ST", 62f, 82f, "RST")
        ),
        "4-2-3-1" to listOf(
            FormationPosition("GK", 50f, 6f, "GK"),
            FormationPosition("LB", 85f, 24f, "LB"),
            FormationPosition("CB", 35f, 24f, "LCB"),
            FormationPosition("CB", 65f, 24f, "RCB"),
            FormationPosition("RB", 15f, 24f, "RB"),
            FormationPosition("DM", 38f, 42f, "LDM"),
            FormationPosition("DM", 62f, 42f, "RDM"),
            FormationPosition("LW", 75f, 62f, "LW"),
            FormationPosition("AM", 50f, 62f, "AM"),
            FormationPosition("RW", 25f, 62f, "RW"),
            FormationPosition("ST", 50f, 74f, "ST")
        ),
        "3-5-2" to listOf(
            FormationPosition("GK", 50f, 6f, "GK"),
            FormationPosition("CB", 20f, 22f, "LCB"),
            FormationPosition("CB", 50f, 22f, "CB"),   // Central CB on same vertical line as GK (x=50)
            FormationPosition("CB", 80f, 22f, "RCB"),
            FormationPosition("LWB", 88f, 35f, "LWB"),  // Between defence (y=22) and midfield (y=48)
            FormationPosition("CM", 25f, 48f, "LCM"),  // Exact same distance from CM: 25 units each side
            FormationPosition("CM", 50f, 48f, "CM"),
            FormationPosition("CM", 75f, 48f, "RCM"),
            FormationPosition("RWB", 12f, 35f, "RWB"),  // Between defence (y=22) and midfield (y=48)
            FormationPosition("ST", 38f, 80f, "LST"),
            FormationPosition("ST", 62f, 80f, "RST")
        )
    )

    fun getPositions(formationId: String): List<FormationPosition> =
        formations[formationId] ?: formations["4-3-3"]!!
}
