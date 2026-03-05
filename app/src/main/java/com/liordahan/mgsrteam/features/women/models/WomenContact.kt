package com.liordahan.mgsrteam.features.women.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

/**
 * Women-dedicated contact data class.
 * Maps to the "ContactsWomen" Firestore collection.
 */
@Keep
data class WomenContact(
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
    val roleEnum: WomenContactRole?
        get() = WomenContactRole.fromString(role)

    val contactTypeEnum: WomenContactType
        get() = WomenContactType.fromString(contactType)

    val displayCountry: String?
        get() = when (contactTypeEnum) {
            WomenContactType.AGENCY -> agencyCountry
            WomenContactType.CLUB -> clubCountry
        }

    val displayOrganization: String?
        get() = when (contactTypeEnum) {
            WomenContactType.AGENCY -> agencyName
            WomenContactType.CLUB -> clubName
        }
}

// ── Conversion helpers ──

fun WomenContact.toSharedContact(): com.liordahan.mgsrteam.features.contacts.models.Contact {
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

fun com.liordahan.mgsrteam.features.contacts.models.Contact.toWomenContact(): WomenContact {
    return WomenContact(
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
