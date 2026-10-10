package com.liordahan.mgsrteam.features.marketradar

/**
 * Market Radar data models — mirror the web contract defined in
 * mgsr-web/src/lib/marketRadar.ts (the "Early Market Radar" 35+ league
 * disruption scanner). The Android client calls GET
 * https://management.mgsrfa.com/api/market-radar with the SAME query params
 * (region / signal / refresh) and parses the SAME JSON array of items.
 *
 * See the FEAT-003/FEAT-006 mapping in RECONCILIATION.md.
 */

/**
 * Disruption signal classification — mirrors `MarketSignalType` in
 * marketRadar.ts. Each value carries the editorial glyph + tone the mock's
 * SCREENS.marketRadar row uses (gold / blue / amber / green / red / muted).
 */
enum class MarketSignalType(val wire: String, val label: String, val tone: RadarTone) {
    OUT_OF_PLANS("OUT_OF_PLANS", "Out of plans", RadarTone.RED),
    DISPUTE_CLAIM("DISPUTE_CLAIM", "Dispute claim", RadarTone.RED),
    COLLAPSED_DEAL("COLLAPSED_DEAL", "Collapsed deal", RadarTone.AMBER),
    FOREIGN_QUOTA("FOREIGN_QUOTA", "Foreign quota", RadarTone.BLUE),
    CONTRACT_STANDOFF("CONTRACT_STANDOFF", "Contract standoff", RadarTone.AMBER),
    TRANSFER_LISTED("TRANSFER_LISTED", "Transfer listed", RadarTone.GOLD);

    companion object {
        fun fromWire(value: String?): MarketSignalType? =
            entries.firstOrNull { it.wire.equals(value, ignoreCase = true) }
    }
}

/** The six editorial tick tones the mock's radar rows use. */
enum class RadarTone { GOLD, BLUE, AMBER, GREEN, RED, MUTED }

/** Region filter — mirrors `MarketRegion` in marketRadar.ts. */
enum class MarketRegion(val wire: String, val label: String) {
    ALL("all", "All regions"),
    ISRAEL_GREECE("israel_greece", "Israel · Greece"),
    EASTERN_EU("eastern_eu", "Eastern EU"),
    TURKEY_BALKANS("turkey_balkans", "Turkey · Balkans"),
    NORDICS("nordics", "Nordics"),
    MID_TIER_WEST("mid_tier_west", "Mid-tier West"),
    SOUTH_AMERICA_GULF("south_america_gulf", "South America · Gulf"),
    SOCIAL("social", "Social");

    companion object {
        fun fromWire(value: String?): MarketRegion =
            entries.firstOrNull { it.wire.equals(value, ignoreCase = true) } ?: ALL
    }
}

/** A detected player extracted from a radar headline (web `detectedPlayer`). */
data class RadarDetectedPlayer(
    val name: String,
    val club: String? = null,
    val position: String? = null,
    val age: String? = null,
    val marketValue: String? = null,
    val contractExpires: String? = null,
    val nationality: String? = null,
    val tmSearchUrl: String? = null,
)

/**
 * A single Market Radar item — mirrors `MarketRadarItem` in marketRadar.ts.
 * Field names map 1:1 to the JSON the web /api/market-radar route returns.
 */
data class MarketRadarItem(
    val id: String,
    val headline: String,
    val summary: String,
    val agentTakeaway: String,
    val url: String,
    val sourceName: String,
    val isSocial: Boolean,
    val publishedAt: Long,
    val dateFormatted: String,
    val timeAgo: String,
    val leagueCode: String,
    val leagueName: String,
    val country: String,
    val countryFlag: String,
    val region: MarketRegion,
    val signalType: MarketSignalType?,
    val signalConfidence: Int,
    val signalReason: String,
    val detectedPlayer: RadarDetectedPlayer?,
)
