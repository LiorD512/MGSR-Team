package com.liordahan.mgsrteam.features.players.models

import android.os.Parcelable
import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import kotlinx.parcelize.Parcelize

@Keep
@Parcelize
data class Player(
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
    val nationalities: List<String>? = null,
    val nationalityFlags: List<String>? = null,
    val contractExpired: String? = null,
    val tmProfile: String? = null,
    val marketValue: String? = null,
    val createdAt: Long? = 0,
    val currentClub: Club? = null,
    val agentInChargeId: String? = null,
    val agentInChargeName: String? = null,
    val originalAgentId: String? = null,
    val originalAgentName: String? = null,
    val haveMandate: Boolean = false,
    val playerPhoneNumber: String? = null,
    val agentPhoneNumber: String? = null,
    val notes: String? = null,
    val noteList: List<NotesModel>? = null,
    val marketValueHistory: List<MarketValueEntry>? = null,
    val linkedContactId: String? = null,
    val lastRefreshedAt: Long? = null,
    val salaryRange: String? = null,
    val transferFee: String? = null,
    @PropertyName("onLoan") val isOnLoan: Boolean = false,
    @PropertyName("onLoanFromClub") val onLoanFromClub: String? = null,
    val passportDetails: PassportDetails? = null,
    val foot: String? = null,
    val agency: String? = null,
    val agencyUrl: String? = null,
    val pinnedHighlights: List<PinnedHighlight>? = null,
    // ── Women-specific fields ──
    val soccerDonnaUrl: String? = null,
    val wosostatId: String? = null,
    val fmInsideId: String? = null,
    val fmInsideUrl: String? = null,
    // ── Youth-specific fields ──
    val academy: String? = null,
    val dateOfBirth: String? = null,
    val ageGroup: String? = null,
    val ifaUrl: String? = null,
    val ifaPlayerId: String? = null,
    val playerEmail: String? = null,
    val parentContact: ParentContact? = null
) : Parcelable

@Keep
@Parcelize
data class PinnedHighlight(
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
data class PassportDetails(
    val firstName: String? = null,
    val lastName: String? = null,
    val dateOfBirth: String? = null,
    val passportNumber: String? = null,
    val nationality: String? = null,
    val lastUpdatedAt: Long? = null
) : Parcelable

@Keep
@Parcelize
data class MarketValueEntry(
    val value: String? = null,
    val date: Long? = null
) : Parcelable

fun Player.getPlayerPhoneNumber(): String? {
    return playerPhoneNumber?.takeIf { it.isNotBlank() }
}

fun Player.getAgentPhoneNumber(): String? {
    return agentPhoneNumber?.takeIf { it.isNotBlank() }
}

/** Single source of truth for free-agent detection. */
val Player.isFreeAgent: Boolean
    get() = currentClub?.clubName.equals("Without Club", ignoreCase = true)

/** Check whether a raw club-name string represents a free agent. */
fun isFreeAgentClub(clubName: String?): Boolean =
    clubName.equals("Without Club", ignoreCase = true)

@Keep
@Parcelize
data class Club(
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
data class NotesModel(
    val notes: String? = null,
    val createBy: String? = null,
    val createByHe: String? = null,
    val createdAt: Long? = 0,
) : Parcelable

@Keep
@Parcelize
data class ParentContact(
    val parentName: String? = null,
    val parentRelationship: String? = null,  // "father", "mother", "guardian"
    val parentPhoneNumber: String? = null,
    val parentEmail: String? = null
) : Parcelable