package com.liordahan.mgsrteam.features.players.models

import android.os.Parcelable
import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import kotlinx.parcelize.Parcelize

@Keep
@Parcelize
data class Player(
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
    val currentClub: Club? = null,
    val agentInChargeId: String? = null,
    val agentInChargeName: String? = null,
    val haveMandate: Boolean = false,
    val playerPhoneNumber: String? = null,
    val agentPhoneNumber: String? = null,
    val playerAdditionalInfoModel: PlayerAdditionalInfoModel? = null,
    val notes: String? = null,
    val noteList: List<NotesModel>? = null,
    val marketValueHistory: List<MarketValueEntry>? = null,
    val linkedContactId: String? = null,
    val lastRefreshedAt: Long? = null,
    val salaryRange: String? = null, // Same as Request: ">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+"
    val transferFee: String? = null, // Same as Request: "Free/Free loan", "<200", "300-600", "700-900", "1m+"
    @PropertyName("onLoan") val isOnLoan: Boolean = false,
    @PropertyName("onLoanFromClub") val onLoanFromClub: String? = null,
    val passportDetails: PassportDetails? = null,
    val foot: String? = null,
    val agency: String? = null,
    val agencyUrl: String? = null
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
    return if(playerAdditionalInfoModel?.playerNumber?.isEmpty() == false) playerAdditionalInfoModel.playerNumber
    else playerPhoneNumber?.takeIf { it.isNotBlank() }
}

fun Player.getAgentPhoneNumber(): String? {
    return if(playerAdditionalInfoModel?.agentNumber?.isEmpty() == false) playerAdditionalInfoModel.agentNumber
    else agentPhoneNumber?.takeIf { it.isNotBlank() }
}

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
data class PlayerAdditionalInfoModel(
    val playerNumber: String? = null,
    val agentNumber: String? = null,
) : Parcelable

@Keep
@Parcelize
data class NotesModel(
    val notes: String? = null,
    val createBy: String? = null,
    val createdAt: Long? = 0,
) : Parcelable