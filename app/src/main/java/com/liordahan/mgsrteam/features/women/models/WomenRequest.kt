package com.liordahan.mgsrteam.features.women.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

/**
 * Women-dedicated request (club inquiry) data class.
 * Maps to the "ClubRequestsWomen" Firestore collection.
 */
@Keep
data class WomenRequest(
    @DocumentId
    val id: String? = null,
    val clubTmProfile: String? = null,
    val clubName: String? = null,
    val clubLogo: String? = null,
    val clubCountry: String? = null,
    val clubCountryFlag: String? = null,
    val contactId: String? = null,
    val contactName: String? = null,
    val contactPhoneNumber: String? = null,
    val position: String? = null,
    val quantity: Int? = 1,
    val notes: String? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val ageDoesntMatter: Boolean? = true,
    val salaryRange: String? = null,
    val transferFee: String? = null,
    val dominateFoot: String? = null,
    val createdAt: Long? = null,
    val status: String? = "pending"
)

// ── Conversion helpers ──

fun WomenRequest.toSharedRequest(): com.liordahan.mgsrteam.features.requests.models.Request {
    return com.liordahan.mgsrteam.features.requests.models.Request(
        id = id,
        clubTmProfile = clubTmProfile,
        clubName = clubName,
        clubLogo = clubLogo,
        clubCountry = clubCountry,
        clubCountryFlag = clubCountryFlag,
        contactId = contactId,
        contactName = contactName,
        contactPhoneNumber = contactPhoneNumber,
        position = position,
        quantity = quantity,
        notes = notes,
        minAge = minAge,
        maxAge = maxAge,
        ageDoesntMatter = ageDoesntMatter,
        salaryRange = salaryRange,
        transferFee = transferFee,
        dominateFoot = dominateFoot,
        createdAt = createdAt,
        status = status
    )
}

fun com.liordahan.mgsrteam.features.requests.models.Request.toWomenRequest(): WomenRequest {
    return WomenRequest(
        id = id,
        clubTmProfile = clubTmProfile,
        clubName = clubName,
        clubLogo = clubLogo,
        clubCountry = clubCountry,
        clubCountryFlag = clubCountryFlag,
        contactId = contactId,
        contactName = contactName,
        contactPhoneNumber = contactPhoneNumber,
        position = position,
        quantity = quantity,
        notes = notes,
        minAge = minAge,
        maxAge = maxAge,
        ageDoesntMatter = ageDoesntMatter,
        salaryRange = salaryRange,
        transferFee = transferFee,
        dominateFoot = dominateFoot,
        createdAt = createdAt,
        status = status
    )
}
