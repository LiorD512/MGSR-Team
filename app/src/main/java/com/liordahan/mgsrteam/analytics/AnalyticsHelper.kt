package com.liordahan.mgsrteam.analytics

import android.os.Bundle
import com.google.firebase.Firebase
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.analytics

object AnalyticsHelper {

    private val analytics: FirebaseAnalytics by lazy { Firebase.analytics }

    fun logAddPlayer() {
        analytics.logEvent("add_player", null)
    }

    fun logSharePlayer(playerId: String?) {
        analytics.logEvent("share_player", Bundle().apply { putString("player_id", playerId ?: "") })
    }

    fun logOpenReleases() {
        analytics.logEvent("screen_releases", null)
    }

    fun logOpenReturnee() {
        analytics.logEvent("screen_returnee", null)
    }

    fun logOpenPlayerInfo(playerId: String?) {
        analytics.logEvent("screen_player_info", Bundle().apply { putString("player_id", playerId ?: "") })
    }

    fun logAddToShortlist(source: String) {
        analytics.logEvent("add_to_shortlist", Bundle().apply { putString("source", source) })
    }

    fun logExportRoster(format: String) {
        analytics.logEvent("export_roster", Bundle().apply { putString("format", format) })
    }

    fun logDocumentUpload(type: String) {
        analytics.logEvent("document_upload", Bundle().apply { putString("type", type) })
    }

    fun logRefreshPlayer(playerId: String?) {
        analytics.logEvent("refresh_player", Bundle().apply { putString("player_id", playerId ?: "") })
    }
}
