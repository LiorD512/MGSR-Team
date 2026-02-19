package com.liordahan.mgsrteam.features.login.models

import android.content.Context
import android.os.Parcelable
import com.google.firebase.firestore.DocumentId
import com.liordahan.mgsrteam.localization.LocaleManager
import kotlinx.parcelize.Parcelize

@Parcelize
data class Account(
    @DocumentId
    val id: String? = null,
    val email: String? = null,
    val name: String? = null,
    val hebrewName: String? = null,
    val fifaLicenseId: String? = null
): Parcelable {

    /** Returns name or hebrewName based on app language. Use for display only. */
    fun getDisplayName(context: Context): String =
        if (LocaleManager.isHebrew(context)) (hebrewName ?: name).orEmpty()
        else (name ?: "").orEmpty()  // English: use name only, never hebrewName
}