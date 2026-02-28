/**
 * Utilities — must match Kotlin/Android logic exactly.
 */

function javaHashCode(str) {
  if (str == null || str === undefined) str = "";
  str = String(str);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash | 0;
  }
  return hash >>> 0;
}

function feedEventDocId(type, playerTmProfile, timestamp) {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayBucket = Math.floor((timestamp || Date.now()) / dayMs);
  const profileHash = javaHashCode(playerTmProfile || "");
  return `${type}_${profileHash}_${dayBucket}`;
}

function isNoMarketValue(value) {
  if (value == null || String(value).trim() === "") return true;
  const trimmed = String(value).trim();
  if (trimmed === "-" || trimmed === "€0") return true;
  const lower = trimmed.toLowerCase().replace(/^€/, "").replace(/,/g, "");
  if (lower.endsWith("k")) return (parseFloat(lower.slice(0, -1)) || 0) === 0;
  if (lower.endsWith("m")) return (parseFloat(lower.slice(0, -1)) || 0) === 0;
  return (parseFloat(lower) || 0) === 0;
}

const TRANSFERMARKT_BASE_URL = "https://www.transfermarkt.com";

module.exports = {
  javaHashCode,
  feedEventDocId,
  isNoMarketValue,
  TRANSFERMARKT_BASE_URL,
};
