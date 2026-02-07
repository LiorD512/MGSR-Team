package com.liordahan.mgsrteam.features.contacts.models

import com.google.firebase.firestore.DocumentId

data class Contact(
    @DocumentId
    val id: String? = null,
    val name: String? = null,
    val phoneNumber: String? = null,
    val role: String? = null, // ContactRole name stored for Firestore
    val clubName: String? = null,
    val clubCountry: String? = null,
    val clubLogo: String? = null,
    val clubCountryFlag: String? = null
) {
    val roleEnum: ContactRole?
        get() = ContactRole.fromString(role)
}
