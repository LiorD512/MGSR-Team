package com.liordahan.mgsrteam.features.youth.models

import android.os.Parcelable
import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import com.liordahan.mgsrteam.features.players.models.isFreeAgentClub
import kotlinx.parcelize.Parcelize

/**
 * Youth-dedicated player data class.
 * Maps to the "PlayersYouth" Firestore collection.
 * Contains youth-specific fields (academy, ageGroup, ifaUrl, parentContact, etc.)
 * that don't exist in men/women models.
 */
@Keep
@Parcelize
data class YouthPlayer(
    @DocumentId
    val id: String? = null,
    val fullName: String? = null,
    val fullNameHe: String? = null,
    val height: String? = null,
    val age: String? = null,
    val positions: List<String?>? = null,
    val profileImage: String? = null,
    val description: String? = null,
    val nationality: String? = null,
    val nationalityFlag: String? = null,
    val contractExpired: String? = null,
    val tmProfile: String? = null,
    val marketValue: String? = null,
    val createdAt: Long? = 0,
    val currentClub: YouthClub? = null,
    val agentInChargeId: String? = null,
    val agentInChargeName: String? = null,
    val haveMandate: Boolean = false,
    val playerPhoneNumber: String? = null,
    val agentPhoneNumber: String? = null,
    val playerAdditionalInfoModel: YouthPlayerAdditionalInfo? = null,
    val notes: String? = null,
    val noteList: List<YouthNote>? = null,
    val marketValueHistory: List<YouthMarketValueEntry>? = null,
    val linkedContactId: String? = null,
    val lastRefreshedAt: Long? = null,
    val salaryRange: String? = null,
    val transferFee: String? = null,
    @PropertyName("onLoan") val isOnLoan: Boolean = false,
    @PropertyName("onLoanFromClub") val onLoanFromClub: String? = null,
    val passportDetails: YouthPassportDetails? = null,
    val foot: String? = null,
    val agency: String? = null,
    val agencyUrl: String? = null,
    val pinnedHighlights: List<YouthPinnedHighlight>? = null,
    // ── Youth-specific fields ──
    val academy: String? = null,
    val dateOfBirth: String? = null,
    val ageGroup: String? = null,
    val ifaUrl: String? = null,
    val ifaPlayerId: String? = null,
    val playerEmail: String? = null,
    val parentContact: YouthParentContact? = null
) : Parcelable

@Keep
@Parcelize
data class YouthPinnedHighlight(
    val id: String = "",
    val source: String = "",
    val title: String = "",
    val thumbnailUrl: String = "",
    val embedUrl: String = "",
    val channelName: String? = null,
    val viewCount: Long? = null
) : Parcelable

@Keep
@Parcelize
data class YouthPassportDetails(
    val firstName: String? = null,
    val lastName: String? = null,
    val dateOfBirth: String? = null,
    val passportNumber: String? = null,
    val nationality: String? = null,
    val lastUpdatedAt: Long? = null
) : Parcelable

@Keep
@Parcelize
data class YouthMarketValueEntry(
    val value: String? = null,
    val date: Long? = null
) : Parcelable

@Keep
@Parcelize
data class YouthParentContact(
    val parentName: String? = null,
    val parentRelationship: String? = null,  // "father", "mother", "guardian"
    val parentPhoneNumber: String? = null,
    val parentEmail: String? = null
) : Parcelable

fun YouthPlayer.getPlayerPhoneNumber(): String? {
    return if (playerAdditionalInfoModel?.playerNumber?.isEmpty() == false) playerAdditionalInfoModel.playerNumber
    else playerPhoneNumber?.takeIf { it.isNotBlank() }
}

fun YouthPlayer.getAgentPhoneNumber(): String? {
    return if (playerAdditionalInfoModel?.agentNumber?.isEmpty() == false) playerAdditionalInfoModel.agentNumber
    else agentPhoneNumber?.takeIf { it.isNotBlank() }
}

/** Single source of truth for free-agent detection — delegates to shared helper. */
val YouthPlayer.isFreeAgent: Boolean
    get() = isFreeAgentClub(currentClub?.clubName)

@Keep
@Parcelize
data class YouthClub(
    @DocumentId
    val id: String? = null,
    val clubName: String? = null,
    val clubLogo: String? = null,
    val clubTmProfile: String? = null,
    val clubCountry: String? = null,
    val offeredAt: String? = null
) : Parcelable

@Keep
@Parcelize
data class YouthPlayerAdditionalInfo(
    val playerNumber: String? = null,
    val agentNumber: String? = null,
) : Parcelable

@Keep
@Parcelize
data class YouthNote(
    val notes: String? = null,
    val createBy: String? = null,
    val createdAt: Long? = 0,
) : Parcelable

// ── Conversion helpers (bridge to shared Player type for existing screens) ──

fun YouthPlayer.toSharedPlayer(): com.liordahan.mgsrteam.features.players.models.Player {
    return com.liordahan.mgsrteam.features.players.models.Player(
        id = id,
        fullName = fullName,
        fullNameHe = fullNameHe,
        height = height,
        age = age,
        positions = positions,
        profileImage = profileImage,
        description = description,
        nationality = nationality,
        nationalityFlag = nationalityFlag,
        contractExpired = contractExpired,
        tmProfile = tmProfile,
        marketValue = marketValue,
        createdAt = createdAt,
        currentClub = currentClub?.toSharedClub(),
        agentInChargeId = agentInChargeId,
        agentInChargeName = agentInChargeName,
        haveMandate = haveMandate,
        playerPhoneNumber = playerPhoneNumber,
        agentPhoneNumber = agentPhoneNumber,
        playerAdditionalInfoModel = playerAdditionalInfoModel?.let {
            com.liordahan.mgsrteam.features.players.models.PlayerAdditionalInfoModel(
                playerNumber = it.playerNumber,
                agentNumber = it.agentNumber
            )
        },
        notes = notes,
        noteList = noteList?.map {
            com.liordahan.mgsrteam.features.players.models.NotesModel(
                notes = it.notes,
                createBy = it.createBy,
                createdAt = it.createdAt
            )
        },
        marketValueHistory = marketValueHistory?.map {
            com.liordahan.mgsrteam.features.players.models.MarketValueEntry(
                value = it.value,
                date = it.date
            )
        },
        linkedContactId = linkedContactId,
        lastRefreshedAt = lastRefreshedAt,
        salaryRange = salaryRange,
        transferFee = transferFee,
        isOnLoan = isOnLoan,
        onLoanFromClub = onLoanFromClub,
        passportDetails = passportDetails?.let {
            com.liordahan.mgsrteam.features.players.models.PassportDetails(
                firstName = it.firstName,
                lastName = it.lastName,
                dateOfBirth = it.dateOfBirth,
                passportNumber = it.passportNumber,
                nationality = it.nationality,
                lastUpdatedAt = it.lastUpdatedAt
            )
        },
        foot = foot,
        agency = agency,
        agencyUrl = agencyUrl,
        pinnedHighlights = pinnedHighlights?.map {
            com.liordahan.mgsrteam.features.players.models.PinnedHighlight(
                id = it.id,
                source = it.source,
                title = it.title,
                thumbnailUrl = it.thumbnailUrl,
                embedUrl = it.embedUrl,
                channelName = it.channelName,
                viewCount = it.viewCount
            )
        },
        academy = academy,
        dateOfBirth = dateOfBirth,
        ageGroup = ageGroup,
        ifaUrl = ifaUrl,
        ifaPlayerId = ifaPlayerId,
        playerEmail = playerEmail,
        parentContact = parentContact?.let {
            com.liordahan.mgsrteam.features.players.models.ParentContact(
                parentName = it.parentName,
                parentRelationship = it.parentRelationship,
                parentPhoneNumber = it.parentPhoneNumber,
                parentEmail = it.parentEmail
            )
        }
    )
}

fun YouthClub.toSharedClub(): com.liordahan.mgsrteam.features.players.models.Club {
    return com.liordahan.mgsrteam.features.players.models.Club(
        id = id,
        clubName = clubName,
        clubLogo = clubLogo,
        clubTmProfile = clubTmProfile,
        clubCountry = clubCountry,
        offeredAt = offeredAt
    )
}

fun com.liordahan.mgsrteam.features.players.models.Player.toYouthPlayer(): YouthPlayer {
    return YouthPlayer(
        id = id,
        fullName = fullName,
        fullNameHe = fullNameHe,
        height = height,
        age = age,
        positions = positions,
        profileImage = profileImage,
        description = description,
        nationality = nationality,
        nationalityFlag = nationalityFlag,
        contractExpired = contractExpired,
        tmProfile = tmProfile,
        marketValue = marketValue,
        createdAt = createdAt,
        currentClub = currentClub?.let {
            YouthClub(
                id = it.id,
                clubName = it.clubName,
                clubLogo = it.clubLogo,
                clubTmProfile = it.clubTmProfile,
                clubCountry = it.clubCountry,
                offeredAt = it.offeredAt
            )
        },
        agentInChargeId = agentInChargeId,
        agentInChargeName = agentInChargeName,
        haveMandate = haveMandate,
        playerPhoneNumber = playerPhoneNumber,
        agentPhoneNumber = agentPhoneNumber,
        playerAdditionalInfoModel = playerAdditionalInfoModel?.let {
            YouthPlayerAdditionalInfo(
                playerNumber = it.playerNumber,
                agentNumber = it.agentNumber
            )
        },
        notes = notes,
        noteList = noteList?.map {
            YouthNote(
                notes = it.notes,
                createBy = it.createBy,
                createdAt = it.createdAt
            )
        },
        marketValueHistory = marketValueHistory?.map {
            YouthMarketValueEntry(
                value = it.value,
                date = it.date
            )
        },
        linkedContactId = linkedContactId,
        lastRefreshedAt = lastRefreshedAt,
        salaryRange = salaryRange,
        transferFee = transferFee,
        isOnLoan = isOnLoan,
        onLoanFromClub = onLoanFromClub,
        passportDetails = passportDetails?.let {
            YouthPassportDetails(
                firstName = it.firstName,
                lastName = it.lastName,
                dateOfBirth = it.dateOfBirth,
                passportNumber = it.passportNumber,
                nationality = it.nationality,
                lastUpdatedAt = it.lastUpdatedAt
            )
        },
        foot = foot,
        agency = agency,
        agencyUrl = agencyUrl,
        pinnedHighlights = pinnedHighlights?.map {
            YouthPinnedHighlight(
                id = it.id,
                source = it.source,
                title = it.title,
                thumbnailUrl = it.thumbnailUrl,
                embedUrl = it.embedUrl,
                channelName = it.channelName,
                viewCount = it.viewCount
            )
        },
        academy = academy,
        dateOfBirth = dateOfBirth,
        ageGroup = ageGroup,
        ifaUrl = ifaUrl,
        ifaPlayerId = ifaPlayerId,
        playerEmail = playerEmail,
        parentContact = parentContact?.let {
            YouthParentContact(
                parentName = it.parentName,
                parentRelationship = it.parentRelationship,
                parentPhoneNumber = it.parentPhoneNumber,
                parentEmail = it.parentEmail
            )
        }
    )
}
