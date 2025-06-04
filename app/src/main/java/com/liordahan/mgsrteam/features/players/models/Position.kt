package com.liordahan.mgsrteam.features.players.models

import android.os.Parcelable
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.Exclude
import kotlinx.parcelize.Parcelize

@Parcelize
data class Position(
    @DocumentId
    val id: String? = null,
    val name: String? = null,
    val sort: Int? = null,
    val hebrewName: String? = null,
    @Exclude
    val isChecked: Boolean = false
) : Parcelable