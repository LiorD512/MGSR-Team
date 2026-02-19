package com.liordahan.mgsrteam.features.players.playerinfo.documents

/**
 * Represents a single text element from OCR with its bounding box.
 * Used for spatial field mapping (label -> value by position).
 */
data class OcrTextElement(
    val text: String,
    val minX: Int,
    val minY: Int,
    val maxX: Int,
    val maxY: Int
) {
    val centerX: Int get() = (minX + maxX) / 2
    val centerY: Int get() = (minY + maxY) / 2
    val height: Int get() = maxY - minY
    val width: Int get() = maxX - minX

    /** True if this element is below (higher Y) and roughly aligned with the given element */
    fun isBelowOf(other: OcrTextElement, maxHorizontalOverlap: Int = 200): Boolean {
        if (minY <= other.maxY) return false
        val overlap = kotlin.math.min(maxX, other.maxX) - kotlin.math.max(minX, other.minX)
        return overlap > -maxHorizontalOverlap
    }

    /** True if this element is to the right of the given element (same row) */
    fun isRightOf(other: OcrTextElement, maxVerticalOverlap: Int = 50): Boolean {
        if (minX <= other.maxX) return false
        val overlap = kotlin.math.min(maxY, other.maxY) - kotlin.math.max(minY, other.minY)
        return overlap > -maxVerticalOverlap
    }
}

/**
 * Result of structured OCR - plain text plus elements with positions.
 */
data class OcrStructuredResult(
    val plainText: String,
    val elements: List<OcrTextElement>,
    val source: String = "unknown" // "cloud_vision" or "ml_kit"
)
