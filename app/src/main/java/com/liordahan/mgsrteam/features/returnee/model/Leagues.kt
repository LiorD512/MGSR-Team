package com.liordahan.mgsrteam.features.returnee.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class Leagues(
    val leagueName: String,
    val leagueUrl: String,
    val flagUrl: String
): Parcelable