/**
 * Utilities for cloud workers — must match Kotlin/Android logic exactly.
 */

/**
 * Java's String.hashCode() — used for FeedEvent doc ID deduplication.
 * Must produce the same result as Kotlin's (playerTmProfile ?: "").hashCode().toUInt()
 */
function javaHashCode(str) {
  if (str == null || str === undefined) str = "";
  str = String(str);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash | 0; // Convert to 32-bit integer
  }
  return hash >>> 0; // Unsigned 32-bit
}

/**
 * Generates FeedEvent document ID — must match Kotlin:
 * docId = "${event.type}_${profileHash}_$dayBucket"
 */
function feedEventDocId(type, playerTmProfile, timestamp) {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayBucket = Math.floor((timestamp || Date.now()) / dayMs);
  const profileHash = javaHashCode(playerTmProfile || "");
  return `${type}_${profileHash}_${dayBucket}`;
}

/**
 * Generates FeedEvent document ID for NEW_RELEASE_FROM_CLUB — no dayBucket.
 * Ensures one doc per player so Pub/Sub retries overwrite instead of creating duplicates.
 * Prevents duplicate push notifications when retry crosses UTC midnight.
 */
function feedEventDocIdForRelease(playerTmProfile) {
  const profileHash = javaHashCode(playerTmProfile || "");
  return `NEW_RELEASE_FROM_CLUB_${profileHash}`;
}

/**
 * Checks if market value is "no value" (empty, €0, -, etc.)
 * Matches Kotlin isNoMarketValue.
 */
function isNoMarketValue(value) {
  if (value == null || String(value).trim() === "") return true;
  const trimmed = String(value).trim();
  if (trimmed === "-" || trimmed === "€0") return true;
  const lower = trimmed.toLowerCase().replace(/^€/, "").replace(/,/g, "");
  if (lower.endsWith("k")) {
    return (parseFloat(lower.slice(0, -1)) || 0) === 0;
  }
  if (lower.endsWith("m")) {
    return (parseFloat(lower.slice(0, -1)) || 0) === 0;
  }
  return (parseFloat(lower) || 0) === 0;
}

const TRANSFERMARKT_BASE_URL = "https://www.transfermarkt.com";

function makeAbsoluteUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${TRANSFERMARKT_BASE_URL}${url}`;
  if (url.startsWith("http")) return url;
  return url;
}

module.exports = {
  javaHashCode,
  feedEventDocId,
  feedEventDocIdForRelease,
  isNoMarketValue,
  makeAbsoluteUrl,
  TRANSFERMARKT_BASE_URL,
};
