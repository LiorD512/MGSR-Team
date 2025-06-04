package com.liordahan.mgsrteam.features.login.models

import android.os.Parcelable
import com.google.firebase.firestore.DocumentId
import kotlinx.parcelize.Parcelize

@Parcelize
data class Account(
    @DocumentId
    val id: String? = null,
    val email: String? = null,
    val name: String? = null
): Parcelable