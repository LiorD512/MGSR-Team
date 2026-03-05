package com.liordahan.mgsrteam.features.women.models

import com.liordahan.mgsrteam.transfermarket.LatestTransferModel

/**
 * Women-dedicated shortlist entry and note data classes.
 * Maps to the "ShortlistsWomen" Firestore collection.
 */
data class WomenShortlistNote(
    val text: String,
    val createdBy: String? = null,
    val createdByHebrewName: String? = null,
    val createdById: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

data class WomenShortlistEntry(
    val tmProfileUrl: String,
    val addedAt: Long = System.currentTimeMillis(),
    val playerImage: String? = null,
    val playerName: String? = null,
    val playerPosition: String? = null,
    val playerAge: String? = null,
    val playerNationality: String? = null,
    val playerNationalityFlag: String? = null,
    val clubJoinedLogo: String? = null,
    val clubJoinedName: String? = null,
    val transferDate: String? = null,
    val marketValue: String? = null,
    val addedByAgentId: String? = null,
    val addedByAgentName: String? = null,
    val addedByAgentHebrewName: String? = null,
    val notes: List<WomenShortlistNote> = emptyList()
) {
    fun toLatestTransferModel(): LatestTransferModel = LatestTransferModel(
        playerImage = playerImage,
        playerName = playerName,
        playerUrl = tmProfileUrl,
        playerPosition = playerPosition,
        playerAge = playerAge,
        playerNationality = playerNationality,
        playerNationalityFlag = playerNationalityFlag,
        clubJoinedLogo = clubJoinedLogo,
        clubJoinedName = clubJoinedName,
        transferDate = transferDate,
        marketValue = marketValue
    )

    val hasEnrichedData: Boolean
        get() = !playerName.isNullOrBlank()
}

// ── Conversion helpers ──

fun WomenShortlistEntry.toSharedEntry(): com.liordahan.mgsrteam.features.shortlist.ShortlistEntry {
    return com.liordahan.mgsrteam.features.shortlist.ShortlistEntry(
        tmProfileUrl = tmProfileUrl,
        addedAt = addedAt,
        playerImage = playerImage,
        playerName = playerName,
        playerPosition = playerPosition,
        playerAge = playerAge,
        playerNationality = playerNationality,
        playerNationalityFlag = playerNationalityFlag,
        clubJoinedLogo = clubJoinedLogo,
        clubJoinedName = clubJoinedName,
        transferDate = transferDate,
        marketValue = marketValue,
        addedByAgentId = addedByAgentId,
        addedByAgentName = addedByAgentName,
        addedByAgentHebrewName = addedByAgentHebrewName,
        notes = notes.map {
            com.liordahan.mgsrteam.features.shortlist.ShortlistNote(
                text = it.text,
                createdBy = it.createdBy,
                createdByHebrewName = it.createdByHebrewName,
                createdById = it.createdById,
                createdAt = it.createdAt
            )
        }
    )
}
