package com.liordahan.mgsrteam.features.players.playerinfo.documents

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

@Keep
data class PlayerDocument(
    @DocumentId
    val id: String? = null,
    val playerTmProfile: String? = null,
    val type: String? = null, // mandate, passport, medical, releaseDoc, repDoc
    val name: String? = null,
    val storageUrl: String? = null,
    val uploadedAt: Long? = null,
    val expiresAt: Long? = null,
    val expired: Boolean = false,
    val uploadedBy: String? = null,      // agent name who uploaded (for mandate: who marked it)
    val validLeagues: List<String>? = null
) {
    val documentType: DocumentType
        get() = DocumentType.fromString(type)
}

@Keep
enum class DocumentType(val displayName: String) {
    MANDATE("Mandate"),
    PASSPORT("Passport"),
    MEDICAL("Medical"),
    RELEASE_DOC("Release doc"),
    REP_DOC("Representation doc"),
    OTHER("Other");

    companion object {
        fun fromString(value: String?): DocumentType = entries.find {
            it.name.equals(value, ignoreCase = true) || it.displayName.equals(value, ignoreCase = true)
        } ?: OTHER
    }
}
