package com.liordahan.mgsrteam.features.contacts.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

@Keep
data class Contact(
    @DocumentId
    val id: String? = null,
    val name: String? = null,
    val phoneNumber: String? = null,
    val role: String? = null, // ContactRole name stored for Firestore
    val clubName: String? = null,
    val clubCountry: String? = null,
    val clubLogo: String? = null,
    val clubCountryFlag: String? = null,
    val clubTmProfile: String? = null,
    val contactType: String? = null, // ContactType name stored for Firestore
    val agencyName: String? = null,
    val agencyCountry: String? = null,
    val agencyUrl: String? = null // Transfermarkt agency profile URL
) {
    val roleEnum: ContactRole?
        get() = ContactRole.fromString(role)

    val contactTypeEnum: ContactType
        get() = ContactType.fromString(contactType)

    /** Country for grouping: clubCountry for club, agencyCountry for agency */
    val displayCountry: String?
        get() = when (contactTypeEnum) {
            ContactType.AGENCY -> agencyCountry
            ContactType.CLUB -> clubCountry
        }

    /** Organization name for display: clubName or agencyName */
    val displayOrganization: String?
        get() = when (contactTypeEnum) {
            ContactType.AGENCY -> agencyName
            ContactType.CLUB -> clubName
        }
}
