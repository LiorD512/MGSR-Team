package com.liordahan.mgsrteam.features.players.playerinfo.gps

/**
 * GPS report detection by keyword scan of the PDF text. No AI.
 * GPS files are only tagged as GPS_DATA and stored — their content is not read
 * or analysed (the Gemini GPS parser was removed).
 */
object GpsPdfParser {

    /**
     * Detect if a document is a GPS report by checking for physical-performance keywords.
     * Supports Catapult, K-Sport, STATSports and generic GPS/physical data formats.
     */
    fun isGpsReport(text: String): Boolean {
        val lower = text.lowercase()
        val catapultMarkers = listOf(
            "catapult", "tot dur", "tot dist", "meterage per minute",
            "high intensity runs", "sprints (over", "max vel",
            "high mp effs", "acc #", "decel #"
        )
        if (catapultMarkers.count { lower.contains(it) } >= 4) return true
        // K-Sport reports use abbreviated column headers: DIST, HSRD, SPRD, SPR, SPM, N ACC, ACCD, N DEC, DECD, SMAX
        val kSportMarkers = listOf(
            "k-sport", "smax", "hsrd", "sprd", "n acc", "n dec",
            "accd", "decd", "full match"
        )
        if (kSportMarkers.count { lower.contains(it) } >= 3) return true
        val genericMarkers = listOf(
            "total dist", "sprint dist", "high intensity dist",
            "max speed", "accelerations", "decelerations",
            "time (min)", "total distance", "sprint distance",
            "high speed run", "high intensity", "top speed",
            "distance per min", "distance zone", "dynamic stress load",
            "match day", "smax", "drel", "d > 25", "d > 20", "km/h",
            "k-sport", "full match",
            "dist\u00e2ncia total", "dist\u00e2ncia sprint", "top speed (km/h)",
            "carga externa", "metabolic load", "dist\u00e2ncia/min"
        )
        return genericMarkers.count { lower.contains(it) } >= 3
    }
}
