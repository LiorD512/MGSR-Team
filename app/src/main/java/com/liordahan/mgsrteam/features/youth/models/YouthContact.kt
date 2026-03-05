package com.liordahan.mgsrteam.features.youth.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

/**
 * Youth-dedicated contact data class.
 * Maps to the "ContactsYouth" Firestore collection.
 */
@Keep
data class YouthContact(
    @DocumentId
    val id: String? = null,
    val name: String? = null,
    val phoneNumber: String? = null,
    val role: String? = null,
    val clubName: String? = null,
    val clubCountry: String? = null,
    val clubLogo: String? = null,
    val clubCountryFlag: String? = null,
    val clubTmProfile: String? = null,
    val contactType: String? = null,
    val agencyName: String? = null,
    val agencyCountry: String? = null,
    val agencyUrl: String? = null
) {
    val roleEnum: YouthContactRole?
        get() = YouthContactRole.fromString(role)

    val contactTypeEnum: YouthContactType
        get() = YouthContactType.fromString(contactType)

    val displayCountry: String?
        get() = when (contactTypeEnum) {
            YouthContactType.AGENCY -> agencyCountry
            YouthContactType.CLUB -> clubCountry
        }

    val displayOrganization: String?
        get() = when (contactTypeEnum) {
            YouthContactType.AGENCY -> agencyName
            YouthContactType.CLUB -> clubName
        }
}

// ── Conversion helpers ──

fun YouthContact.toSharedContact(): com.liordahan.mgsrteam.features.contacts.models.Contact {
    return com.liordahan.mgsrteam.features.contacts.models.Contact(
        id = id,
        name = name,
        phoneNumber = phoneNumber,
        role = role,
        clubName = clubName,
        clubCountry = clubCountry,
        clubLogo = clubLogo,
        clubCountryFlag = clubCountryFlag,
        clubTmProfile = clubTmProfile,
        contactType = contactType,
        agencyName = agencyName,
        agencyCountry = agencyCountry,
        agencyUrl = agencyUrl
    )
}

fun com.liordahan.mgsrteam.features.contacts.models.Contact.toYouthContact(): YouthContact {
    return YouthContact(
        id = id,
        name = name,
        phoneNumber = phoneNumber,
        role = role,
        clubName = clubName,
        clubCountry = clubCountry,
        clubLogo = clubLogo,
        clubCountryFlag = clubCountryFlag,
        clubTmProfile = clubTmProfile,
        contactType = contactType,
        agencyName = agencyName,
        agencyCountry = agencyCountry,
        agencyUrl = agencyUrl
    )
}
