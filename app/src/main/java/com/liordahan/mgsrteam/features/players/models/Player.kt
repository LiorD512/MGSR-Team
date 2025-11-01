package com.liordahan.mgsrteam.features.players.models

import android.os.Parcelable
import com.google.firebase.firestore.DocumentId
import kotlinx.parcelize.Parcelize

@Parcelize
data class Player(
    val fullName: String? = null,
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
    val instagramProfile: String? = null,
    val createdAt: Long? = 0,
    val currentClub: Club? = null,
    val agentInChargeId: String? = null,
    val agentInChargeName: String? = null,
    val playerPhoneNumber: String? = null,
    val agentPhoneNumber: String? = null,
    val playerAdditionalInfoModel: PlayerAdditionalInfoModel? = null,
    val notes: String? = null,
    val noteList: List<NotesModel>? = null
) : Parcelable

fun Player.getPlayerPhoneNumber(): String? {
    return if(playerAdditionalInfoModel?.playerNumber?.isEmpty() == false) playerAdditionalInfoModel.playerNumber
    else playerPhoneNumber?.takeIf { it.isNotBlank() }
}

fun Player.getAgentPhoneNumber(): String? {
    return if(playerAdditionalInfoModel?.agentNumber?.isEmpty() == false) playerAdditionalInfoModel.agentNumber
    else agentPhoneNumber?.takeIf { it.isNotBlank() }
}

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

@Parcelize
data class PlayerAdditionalInfoModel(
    val playerNumber: String? = null,
    val agentNumber: String? = null,
) : Parcelable

@Parcelize
data class NotesModel(
    val notes: String? = null,
    val createBy: String? = null,
    val createdAt: Long? = 0,
) : Parcelable