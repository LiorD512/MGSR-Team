package com.liordahan.mgsrteam.features.women.models

import android.os.Parcelable
import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.Exclude
import kotlinx.parcelize.Parcelize

/**
 * Women-dedicated position data class.
 * Maps to the shared "Positions" Firestore collection
 * but lives in the women package for full isolation.
 */
@Keep
@Parcelize
data class WomenPosition(
    @DocumentId
    val id: String? = null,
    val name: String? = null,
    val sort: Int? = null,
    val hebrewName: String? = null,
    @Exclude
    val isChecked: Boolean = false
) : Parcelable
