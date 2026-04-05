/**
 * Sport Director — The automated quality gate between AI agents and the War Room.
 *
 * Every profile passes through the Sport Director BEFORE it reaches Firestore.
 * No profile gets displayed without the Director's approval.
 *
 * Code-based checks (fast, free, every profile):
 * 1. Completeness — all critical fields present
 * 2. Per-90 quality — actual performance rates, not just raw totals
 * 3. Age-value rationality — sensible combinations
 * 4. League-tier score threshold — higher-visibility leagues need higher scores
 * 5. Freshness — new finds vs recycled names from previous runs
 * 6. Israeli market realism — is the player truly attainable for Ligat Ha'al?
 * 7. Data consistency — cross-reference stats for impossible/stale data
 * 8. TM stats verification — scrapes Transfermarkt season page to cross-check
 *    stats data for stats-dependent profiles (HIGH_VALUE_BENCHED, BREAKOUT_SEASON,
 *    YOUNG_STRIKER_HOT). Overrides incorrect data and re-evaluates profile type.
 *
 * After code checks, Gemini generates Sport Director verdicts for top approved profiles
 * including full request-fit analysis (does the player match EVERY criteria?).
 */

const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cheerio = require("cheerio");

// Lazy-loaded to avoid circular dependency (scoutAgent requires sportDirector)
let _agentFns = null;
function getAgentFns() {
  if (!_agentFns) {
    const sa = require("./scoutAgent");
    _agentFns = {
      matchesProfile: sa.matchesProfile,
      computeMatchScore: sa.computeMatchScore,
      buildMatchReason: sa.buildMatchReason,
    };
  }
  return _agentFns;
}

// ═══════════════════════════════════════════════════════════════
// Player Intelligence — multi-source enrichment for verdicts
// Sources: TheSportsDB (bio, wage, honours), FotMob (ID), ClubElo (strength)
// Note: API-Football blocked by Cloudflare/403 from server-side
// ═══════════════════════════════════════════════════════════════
const INTEL_TIMEOUT = 10000;
const INTEL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function intelFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "User-Agent": INTEL_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(INTEL_TIMEOUT),
  });
}

function normalizeNameForMatch(name) {
  return (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function intelNamesMatch(a, b) {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (na === nb) return true;
  const partsA = na.split(/\s+/);
  const partsB = nb.split(/\s+/);
  const [shorter, longer] = partsA.length <= partsB.length ? [partsA, nb] : [partsB, na];
  return shorter.length >= 2 && shorter.every(p => longer.includes(p));
}

/**
 * Fetch TheSportsDB player intel: bio, physical, wage, honours, career history.
 * Free API — reliable, no Cloudflare blocking.
 */
async function fetchTheSportsDBIntel(playerName) {
  try {
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`;
    const searchRes = await intelFetch(searchUrl, { headers: { Accept: "application/json" } });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const players = searchData?.player;
    if (!Array.isArray(players) || players.length === 0) return null;

    let best = null;
    for (const p of players) {
      if (p.strSport !== "Soccer") continue;
      if (intelNamesMatch(p.strPlayer || "", playerName)) { best = p; break; }
      if (!best) best = p;
    }
    if (!best) return null;

    const playerId = best.idPlayer;

    // Full player lookup (more fields)
    let fullPlayer = best;
    try {
      const lookupRes = await intelFetch(`https://www.thesportsdb.com/api/v1/json/3/lookupplayer.php?id=${playerId}`, { headers: { Accept: "application/json" } });
      if (lookupRes.ok) {
        const d = await lookupRes.json();
        if (d?.players?.[0]) fullPlayer = d.players[0];
      }
    } catch { /* use search data */ }

    const intel = {
      id: playerId,
      name: fullPlayer.strPlayer,
      team: fullPlayer.strTeam,
      nationality: fullPlayer.strNationality,
      position: fullPlayer.strPosition,
      height: fullPlayer.strHeight || undefined,
      weight: fullPlayer.strWeight || undefined,
      dateBorn: fullPlayer.dateBorn || undefined,
      wage: fullPlayer.strWage || undefined,
      signingFee: fullPlayer.strSigning || undefined,
      agent: fullPlayer.strAgent || undefined,
      preferredFoot: fullPlayer.strSide || undefined,
      number: fullPlayer.strNumber || undefined,
      description: (fullPlayer.strDescriptionEN || "").slice(0, 300),
    };

    // Cross-reference IDs
    if (fullPlayer.idTransferMkt) intel.tmId = String(fullPlayer.idTransferMkt);
    if (fullPlayer.idAPIfootball) intel.apiFootballId = String(fullPlayer.idAPIfootball);

    // Honours (parallel)
    try {
      const honRes = await intelFetch(`https://www.thesportsdb.com/api/v1/json/3/lookuphonours.php?id=${playerId}`, { headers: { Accept: "application/json" } });
      if (honRes.ok) {
        const hd = await honRes.json();
        intel.honours = (hd?.honours || []).map(h => `${h.strSeason || ""} ${h.strHonour || ""}`.trim()).slice(0, 15);
      }
    } catch { /* non-fatal */ }

    // Former teams
    try {
      const ftRes = await intelFetch(`https://www.thesportsdb.com/api/v1/json/3/lookupformerteams.php?id=${playerId}`, { headers: { Accept: "application/json" } });
      if (ftRes.ok) {
        const ftd = await ftRes.json();
        intel.formerTeams = (ftd?.formerteams || []).map(t => t.strFormerTeam || "").filter(Boolean);
      }
    } catch { /* non-fatal */ }

    return intel;
  } catch (err) {
    console.warn("[Intel:TheSportsDB]", err.message || err);
    return null;
  }
}

/**
 * Fetch FotMob player ID via search (rating/stats blocked by Turnstile).
 */
async function fetchFotMobIntel(playerName) {
  try {
    const searchUrl = `https://www.fotmob.com/api/search/suggest?term=${encodeURIComponent(playerName)}&lang=en`;
    const res = await intelFetch(searchUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const sd = await res.json();

    let playerId = null;
    for (const group of (Array.isArray(sd) ? sd : [])) {
      for (const s of (Array.isArray(group?.suggestions) ? group.suggestions : [])) {
        if (s.type !== "player") continue;
        const id = parseInt(s.id);
        if (isNaN(id)) continue;
        if (intelNamesMatch(s.name || "", playerName) && id) { playerId = id; break; }
        if (!playerId) playerId = id;
      }
      if (playerId) break;
    }
    if (!playerId) return null;
    return { id: playerId };
  } catch (err) {
    console.warn("[Intel:FotMob]", err.message || err);
    return null;
  }
}

/**
 * Fetch ClubElo rating for a club.
 */
async function fetchClubElo(clubName) {
  try {
    if (!clubName) return null;
    const attempts = [clubName.trim(), clubName.trim().replace(/^FC\s+/i, ""), clubName.trim().replace(/\s+FC$/i, "")];
    for (const name of attempts) {
      const res = await fetch(`http://api.clubelo.com/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.trim().split("\n");
      if (lines.length < 2) continue;
      const parts = lines[lines.length - 1].split(",");
      if (parts.length < 5) continue;
      const elo = parseFloat(parts[4]);
      if (isNaN(elo)) continue;
      let level;
      if (elo >= 1800) level = "elite";
      else if (elo >= 1600) level = "strong";
      else if (elo >= 1400) level = "mid";
      else level = "low";
      return { clubName: parts[1] || name, elo: Math.round(elo), level };
    }
    return null;
  } catch { return null; }
}

/**
 * Gather lightweight intelligence for a player (TheSportsDB + FotMob + ClubElo).
 * Used by Sport Director before Gemini verdicts.
 */
async function gatherQuickIntel(playerName, club) {
  const [tsdb, fotmob, clubElo] = await Promise.allSettled([
    fetchTheSportsDBIntel(playerName),
    fetchFotMobIntel(playerName),
    fetchClubElo(club),
  ]);
  const intel = { sources: [] };
  if (tsdb.status === "fulfilled" && tsdb.value) { intel.tsdb = tsdb.value; intel.sources.push("thesportsdb"); }
  if (fotmob.status === "fulfilled" && fotmob.value) { intel.fotmob = fotmob.value; intel.sources.push("fotmob"); }
  if (clubElo.status === "fulfilled" && clubElo.value) { intel.clubElo = clubElo.value; intel.sources.push("clubelo"); }
  return intel;
}

/**
 * Format intel into compact text for Gemini prompt.
 */
function formatIntelLine(intel) {
  const parts = [];
  if (intel.tsdb) {
    const t = intel.tsdb;
    const profileParts = [];
    if (t.position) profileParts.push(t.position);
    if (t.nationality) profileParts.push(t.nationality);
    if (t.height) profileParts.push(t.height);
    if (t.weight) profileParts.push(t.weight);
    if (t.preferredFoot) profileParts.push(`Foot: ${t.preferredFoot}`);
    if (t.dateBorn) profileParts.push(`Born: ${t.dateBorn}`);
    if (profileParts.length > 0) parts.push(`Profile: ${profileParts.join(" | ")}`);
    if (t.wage) parts.push(`Wage: ${t.wage}`);
    if (t.signingFee) parts.push(`Signed for: ${t.signingFee}`);
    if (t.agent) parts.push(`Agent: ${t.agent}`);
    if (t.honours?.length > 0) parts.push(`Honours: ${t.honours.length} titles`);
    if (t.formerTeams?.length > 0) parts.push(`Career: ${t.formerTeams.join(" > ")} > ${t.team || "?"}`);
    if (t.description) parts.push(`Bio: ${t.description.slice(0, 150)}`);
  }
  if (intel.fotmob?.id) parts.push(`FotMob ID: ${intel.fotmob.id}`);
  if (intel.clubElo) parts.push(`Club Elo: ${intel.clubElo.elo} (${intel.clubElo.level})`);
  return parts.length > 0 ? parts.join(" | ") : "";
}

// ═══════════════════════════════════════════════════════════════
// Per-90 quality minimums by profile type + position group
// ═══════════════════════════════════════════════════════════════
const QUALITY_BARS = {
  BREAKOUT_SEASON: {
    attacker: { minGoalsPer90: 0.28, minContribPer90: 0.40 },
    midfielder: { minGoalsPer90: 0.08, minContribPer90: 0.22 },
  },
  YOUNG_STRIKER_HOT: {
    attacker: { minGoalsPer90: 0.20, minContribPer90: 0.28 },
  },
  LOW_VALUE_STARTER: {
    attacker: { minContribPer90: 0.10 },
    midfielder: { minContribPer90: 0.06 },
  },
};

// Minimum matchScore by league tier
const MIN_SCORE_BY_TIER = {
  1: 64,
  2: 58,
  3: 54,
};

// ═══════════════════════════════════════════════════════════════
// Position classification
// ═══════════════════════════════════════════════════════════════
function isAttacker(position) {
  const p = (position || "").toLowerCase();
  return p.includes("forward") || p.includes("wing") || p.includes("striker") ||
    p === "cf" || p === "ss" || p === "lw" || p === "rw" || p === "am";
}

function isMidfielder(position) {
  const p = (position || "").toLowerCase();
  return p.includes("midfield") || p === "cm" || p === "dm" || p === "am";
}

function getPositionGroup(position) {
  if (isAttacker(position)) return "attacker";
  if (isMidfielder(position)) return "midfielder";
  return "other";
}

// ═══════════════════════════════════════════════════════════════
// Check 1: Completeness — all critical fields present?
// ═══════════════════════════════════════════════════════════════
function checkCompleteness(data) {
  const issues = [];
  if (!data.playerName || data.playerName === "Unknown") issues.push("missing_name");
  if (!data.position) issues.push("missing_position");
  if (data.age <= 0 || data.age == null) issues.push("missing_age");
  if (data.marketValueEuro <= 0) issues.push("missing_value");
  if (!data.club) issues.push("missing_club");
  if (!data.league) issues.push("missing_league");

  // Contract is critical for CONTRACT_EXPIRING
  if (data.profileType === "CONTRACT_EXPIRING" && !data.contractExpires) {
    issues.push("missing_contract_critical");
  }

  // FM data is critical for FM-dependent profiles
  const isTmSource = data.source === "tm_enriched" || data.source === "tm_fallback";
  if (data.profileType === "UNDERVALUED_BY_FM" && data.fmPa == null && !isTmSource) {
    issues.push("missing_fm_critical");
  }
  if (data.profileType === "HIDDEN_GEM" && data.fmPa == null && !isTmSource) {
    issues.push("missing_fm_critical");
  }

  // Insufficient data: no minutes AND no FM = blind profile, can't validate anything
  // Only allow through: CONTRACT_EXPIRING (contract alone is signal) and TM-enriched
  const hasMinutes = (data.apiMinutes90s || 0) > 0;
  const hasFm = data.fmPa != null;
  if (!hasMinutes && !hasFm && !isTmSource && data.profileType !== "CONTRACT_EXPIRING") {
    issues.push("insufficient_data_critical");
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Check 2: Per-90 quality — is the performance rate actually good?
// ═══════════════════════════════════════════════════════════════
function checkPer90Quality(data) {
  const issues = [];
  const posGroup = getPositionGroup(data.position);
  const minutes90s = data.apiMinutes90s || 0;

  if (minutes90s <= 0) {
    // No minutes = can't validate performance (except CONTRACT_EXPIRING, HIGH_VALUE_BENCHED, or TM-enriched)
    const isTmSource = data.source === "tm_enriched" || data.source === "tm_fallback";
    if (data.profileType !== "CONTRACT_EXPIRING" && data.profileType !== "HIGH_VALUE_BENCHED" && !isTmSource) {
      issues.push("no_minutes_data");
    }
    return issues;
  }

  const goalsPer90 = data.goalsPer90 || 0;
  const contribPer90 = data.contribPer90 || 0;

  const bars = QUALITY_BARS[data.profileType];
  if (!bars) return issues;

  const posBar = bars[posGroup];
  if (!posBar) return issues;

  if (posBar.minGoalsPer90 && goalsPer90 < posBar.minGoalsPer90) {
    issues.push(`low_goals_per90:${goalsPer90.toFixed(2)}<${posBar.minGoalsPer90}`);
  }
  if (posBar.minContribPer90 && contribPer90 < posBar.minContribPer90) {
    issues.push(`low_contrib_per90:${contribPer90.toFixed(2)}<${posBar.minContribPer90}`);
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Check 3: Age-value rationality + Value Arc (Monchi Method)
// Real SDs always assess: buy price → develop → resale potential
// ═══════════════════════════════════════════════════════════════
function checkAgeValueRationality(data) {
  const issues = [];

  // Hard age cap — no profiles age 32+, period
  if (data.age >= 32) {
    issues.push("age_above_cap_critical");
    return issues;
  }

  // Player 30+ with significant cost and no contract urgency = limited upside
  if (data.age >= 30 && data.profileType !== "CONTRACT_EXPIRING" && data.marketValueEuro > 800_000) {
    issues.push("old_expensive_no_upside");
  }

  // HIGH_VALUE_BENCHED at tier 3+ = benched at a low level, not good
  if (data.profileType === "HIGH_VALUE_BENCHED" && data.leagueTier >= 3) {
    issues.push("benched_at_low_tier");
  }

  // HIDDEN_GEM with FM PA at the bare minimum (130-134) AND age 25+ = too little ceiling left
  if (data.profileType === "HIDDEN_GEM" && data.fmPa != null && data.fmPa <= 130 && data.age >= 25) {
    issues.push("low_ceiling_hidden_gem");
  }

  // Monchi Method: Declining value arc — player 28+ with no resale potential
  // and low FM potential = end-of-line. Needs exceptional current performance.
  if (data.age >= 28 && data.profileType !== "CONTRACT_EXPIRING") {
    const hasResale = data.fmPa != null && data.fmPa >= 135 && data.age <= 28;
    const isExceptionalPerformer = (data.contribPer90 || 0) >= 0.35;
    if (!hasResale && !isExceptionalPerformer && data.marketValueEuro > 1_200_000) {
      issues.push("no_value_arc_upside");
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Check 4: Minimum score by league tier
// ═══════════════════════════════════════════════════════════════
function checkScoreThreshold(data) {
  const isTmSource = data.source === "tm_enriched" || data.source === "tm_fallback";
  // CONTRACT_EXPIRING has signal from contract alone — use lower threshold like TM-sourced
  const isContractProfile = data.profileType === "CONTRACT_EXPIRING";
  // TM-sourced and contract-based profiles get a lower threshold (missing FM data depresses scores)
  const tierThresholds = (isTmSource || isContractProfile) ? { 1: 55, 2: 48, 3: 44 } : MIN_SCORE_BY_TIER;
  const minScore = tierThresholds[data.leagueTier] || 65;
  if (data.matchScore < minScore) {
    return [`below_tier_threshold:${data.matchScore}<${minScore}`];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════
// Check 5: Israeli market realism — is this player truly attainable?
// ═══════════════════════════════════════════════════════════════
const TIER_1_KEYWORDS = [
  "premier league", "la liga", "serie a", "bundesliga", "ligue 1",
  "english premier", "primera división",
];

function checkIsraeliMarketRealism(data) {
  const issues = [];
  const val = data.marketValueEuro || 0;

  // Hard ceiling — should be caught by scoutAgent, but safety net
  if (val > 2_500_000 && data.profileType !== "CONTRACT_EXPIRING") {
    issues.push(`value_exceeds_israeli_ceiling:€${val}`);
  }

  // Expensive + old = no resale value for Israeli clubs
  if (val >= 1_800_000 && data.age >= 29 && data.profileType !== "CONTRACT_EXPIRING") {
    issues.push("expensive_old_no_resale");
  }

  // Tier 1 league regular starter — won't move to Israel unless contract is expiring
  const leagueLower = (data.league || "").toLowerCase();
  const isTier1 = TIER_1_KEYWORDS.some((kw) => leagueLower.includes(kw));
  if (isTier1 && data.profileType !== "CONTRACT_EXPIRING" && data.profileType !== "HIGH_VALUE_BENCHED") {
    const minutes90s = data.apiMinutes90s || 0;
    if (minutes90s >= 10) {
      // Regular starter in a top-5 league — zero chance of moving to Israel
      issues.push("tier1_starter_unrealistic");
    }
  }

  // Tier 3 goal inflation — scoring in very weak leagues != Ligat Ha'al quality
  if (data.leagueTier >= 3 && isAttacker(data.position)) {
    const goals = data.apiGoals || 0;
    const minutes90s = data.apiMinutes90s || 0;
    if (goals >= 10 && minutes90s > 0) {
      const goalsPer90 = goals / minutes90s;
      // Extreme rate in a weak league — likely inflated
      if (goalsPer90 > 0.9) {
        issues.push(`tier3_inflated_stats:${goalsPer90.toFixed(2)}g90_in_tier${data.leagueTier}`);
      }
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Check 6: Data consistency — cross-reference stats for impossible data
// ═══════════════════════════════════════════════════════════════
function checkDataConsistency(data) {
  const issues = [];
  const minutes90s = data.apiMinutes90s || 0;
  const goals = data.apiGoals || 0;
  const assists = data.apiAssists || 0;

  // Impossible goal rate: more goals than minutes played in 90s
  // (e.g., 10 goals in 3 x 90min = 3.33 g/90 — impossible)
  if (minutes90s > 0 && goals > 0) {
    const goalsPer90 = goals / minutes90s;
    if (goalsPer90 > 1.5) {
      issues.push(`impossible_goal_rate:${goals}G_in_${minutes90s.toFixed(1)}x90min`);
    }
  }

  // Goals without enough minutes: claimed 8+ goals but played <4 full matches
  if (goals >= 8 && minutes90s > 0 && minutes90s < 4) {
    issues.push(`goals_vs_minutes_mismatch:${goals}G_in_${minutes90s.toFixed(1)}x90min`);
  }

  // FM PA sanity: PA >=170 at age 28+ = stale/cached FM data (peak already passed)
  if (data.fmPa != null && data.fmPa >= 170 && data.age >= 28) {
    issues.push(`stale_fm_data:PA${data.fmPa}_at_age${data.age}`);
  }

  // FM CA > PA = swapped data (the scout server sometimes swaps them)
  if (data.fmCa != null && data.fmPa != null && data.fmCa > data.fmPa) {
    issues.push("fm_ca_gt_pa_swapped");
  }

  // Contract already expired but not tagged CONTRACT_EXPIRING
  if (data.contractExpires) {
    // Parse year correctly: contractExpires can be "30/06/2028", "2028", "Jun 30, 2028"
    // parseInt("30/06/2028") wrongly returns 30 — use regex to extract the 4-digit year.
    const yearMatch = data.contractExpires.match(/(\d{4})/);
    const expYear = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    const currentYear = new Date().getFullYear();
    if (expYear > 0 && expYear < currentYear && data.profileType !== "CONTRACT_EXPIRING") {
      issues.push(`contract_already_expired:${data.contractExpires}`);
    }
  }

  // Age claim check: extremely young (15-16) with professional stats = suspicious
  if (data.age > 0 && data.age <= 16 && minutes90s >= 10) {
    issues.push(`suspicious_youth_stats:age${data.age}_with_${minutes90s.toFixed(1)}x90min`);
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Roster & Shortlist check — skip players we already know about
// ═══════════════════════════════════════════════════════════════
async function loadKnownPlayerUrls() {
  const db = getFirestore();
  const knownUrls = new Set();

  try {
    // All-time shortlist (men) — any player ever shortlisted
    const shortlistSnap = await db.collection("Shortlists").get();
    for (const doc of shortlistSnap.docs) {
      const u = doc.data().tmProfileUrl;
      if (u) knownUrls.add(normalizeUrl(u));
    }
    // Roster (men) — players already signed/tracked
    const playersSnap = await db.collection("Players").get();
    for (const doc of playersSnap.docs) {
      const u = doc.data().tmProfileUrl;
      if (u) knownUrls.add(normalizeUrl(u));
    }
  } catch (e) {
    console.warn("[SportDirector] Could not load roster/shortlist URLs:", e.message);
  }

  if (knownUrls.size > 0) {
    console.log(`[SportDirector] Loaded ${knownUrls.size} known roster/shortlist URLs — will skip these`);
  }
  return knownUrls;
}

// ═══════════════════════════════════════════════════════════════
// Freshness audit — detect recycling from previous runs
// ═══════════════════════════════════════════════════════════════
async function loadPreviousRunUrls() {
  const db = getFirestore();
  const previousUrls = new Map(); // agentId -> Set of normalized URLs

  try {
    // Load profiles from 8-21 days ago (beyond the 7-day exclude window)
    // These are profiles that were excluded last week but are now eligible again
    const now = Date.now();
    const cutoff21 = now - 21 * 24 * 60 * 60 * 1000;
    const cutoff8 = now - 8 * 24 * 60 * 60 * 1000;

    const prevProfiles = await db.collection("ScoutProfiles")
      .where("discoveredAt", ">=", cutoff21)
      .where("discoveredAt", "<=", cutoff8)
      .get();

    for (const doc of prevProfiles.docs) {
      const data = doc.data();
      const aid = data.agentId;
      if (!aid) continue;
      if (!previousUrls.has(aid)) previousUrls.set(aid, new Set());
      previousUrls.get(aid).add(normalizeUrl(data.tmProfileUrl));
    }
  } catch (e) {
    console.warn("[SportDirector] Could not load previous profiles for freshness:", e.message);
  }

  return previousUrls;
}

function normalizeUrl(url) {
  return (url || "").trim().toLowerCase().replace(/\/$/, "");
}

// ═══════════════════════════════════════════════════════════════
// Transfermarkt Stats Verification — cross-check agent stats data
// Scrapes TM /leistungsdaten/ to get real season appearances/goals/assists/minutes
// ═══════════════════════════════════════════════════════════════

/** Current football season year (Jul+ = current year, before Jul = previous year). */
function getCurrentSeasonYear() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** Extract numeric player ID from a Transfermarkt URL. */
function extractTmPlayerId(url) {
  if (!url || typeof url !== "string") return null;
  const parts = url.trim().split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].toLowerCase();
    if (p === "spieler" || p === "player" || p === "profil") {
      const id = parts[i + 1];
      return id && /^\d+$/.test(id) ? id : null;
    }
  }
  // Fallback: last numeric segment
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) return parts[i];
  }
  return null;
}

/**
 * Fetch season performance stats from Transfermarkt via cheerio scraping.
 * Returns { appearances, goals, assists, minutes } or null on failure.
 */
async function fetchTmPerformanceStats(tmProfileUrl) {
  const id = extractTmPlayerId(tmProfileUrl);
  if (!id) return null;

  const season = getCurrentSeasonYear();
  const perfUrl = tmProfileUrl
    .replace(/\/profil\//, "/leistungsdaten/")
    .replace(/\/player\//, "/leistungsdaten/")
    .replace(/\/$/, "");
  const urlWithSeason = perfUrl.includes("saison") ? perfUrl : `${perfUrl}/saison/${season}`;

  try {
    const res = await intelFetch(urlWithSeason);
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    let appearances = 0, goals = 0, assists = 0, minutes = 0;

    const rows = $("table.items tbody tr, table.items tr");
    rows.each((_, row) => {
      const $row = $(row);
      const firstCell = $row.find("td").first().text().trim().toLowerCase();
      if (!firstCell.includes("total") && !firstCell.includes("gesamt")) return;

      const tds = $row.find("td");
      if (tds.length < 4) return;

      const nums = [];
      tds.slice(1).each((__, td) => {
        const raw = $(td).text().trim();
        const t = raw.replace(/['\s]/g, "").replace(/\./g, "").replace(/,/g, "");
        const n = parseInt(t, 10);
        if (!isNaN(n)) nums.push(n);
      });

      if (nums.length >= 3) {
        appearances = nums[0] ?? 0;
        goals = nums[1] ?? 0;
        // Compact: Spiele, Tore, Minuten. Extended: Spiele, Tore, Vorlagen, Minuten.
        if (nums.length === 3) {
          assists = 0;
          minutes = nums[2] ?? 0;
        } else {
          assists = nums[2] ?? 0;
          const last = nums[nums.length - 1];
          if (last != null && last > 100) minutes = last;
          else if (nums.length >= 6) minutes = nums[5] ?? 0;
          else if (nums.length >= 4) minutes = nums[3] ?? 0;
        }
      }
      return false;
    });

    if (appearances === 0 && goals === 0 && assists === 0) return null;
    return { appearances, goals, assists, minutes };
  } catch (err) {
    console.warn(`[SportDirector:TM-Verify] Scrape failed for ${tmProfileUrl}:`, err.message);
    return null;
  }
}

/**
 * Compare stats data (from scout server) against TM scraped data.
 * When significant mismatches are found, override profile data with TM values.
 * When stats data is completely missing, populate from TM (initial enrichment).
 * Returns { overridden: boolean, overrides: string[], tmStats: object }.
 */
function verifyAndCorrectStats(d, tmStats) {
  const overrides = [];
  const tmMinutes90s = tmStats.minutes > 0 ? tmStats.minutes / 90 : 0;
  const apiMin90s = d.apiMinutes90s || 0;

  // ── INITIAL ENRICHMENT: stats data completely missing → populate from TM ──
  if (apiMin90s <= 0 && tmStats.minutes > 0) {
    overrides.push(`minutes: EMPTY → TM ${tmMinutes90s.toFixed(1)} 90s (${tmStats.appearances} apps, ${tmStats.minutes} min)`);
    d.apiMinutes90s = Math.round(tmMinutes90s * 10) / 10;
  }
  if ((d.apiGoals || 0) === 0 && tmStats.goals > 0) {
    overrides.push(`goals: EMPTY → TM ${tmStats.goals}`);
    d.apiGoals = tmStats.goals;
  }
  if ((d.apiAssists || 0) === 0 && tmStats.assists > 0) {
    overrides.push(`assists: EMPTY → TM ${tmStats.assists}`);
    d.apiAssists = tmStats.assists;
  }

  // ── MISMATCH CORRECTION: stats has data but TM disagrees significantly ──
  // Minutes mismatch: stats says barely played but TM shows 15+ appearances
  if (apiMin90s > 0 && apiMin90s < 10 && tmStats.appearances >= 15 && tmMinutes90s >= 10) {
    overrides.push(`minutes: stats ${apiMin90s.toFixed(1)} 90s → TM ${tmMinutes90s.toFixed(1)} 90s (${tmStats.appearances} apps, ${tmStats.minutes} min)`);
    d.apiMinutes90s = Math.round(tmMinutes90s * 10) / 10;
  }
  // Also catch: stats has minutes but they're drastically low vs TM
  if (apiMin90s > 0 && tmMinutes90s > 0 && tmMinutes90s > apiMin90s * 2 && tmMinutes90s - apiMin90s >= 5) {
    overrides.push(`minutes: stats ${apiMin90s.toFixed(1)} 90s → TM ${tmMinutes90s.toFixed(1)} 90s (significant under-count)`);
    d.apiMinutes90s = Math.round(tmMinutes90s * 10) / 10;
  }

  // Goals mismatch: differ by >50% with minimum 3 gap
  const apiGoals_tm = d.apiGoals || 0;
  if (tmStats.goals !== undefined && Math.abs(tmStats.goals - apiGoals_tm) >= 3 && (apiGoals_tm === 0 || Math.abs(tmStats.goals - apiGoals_tm) / Math.max(apiGoals_tm, 1) > 0.5)) {
    overrides.push(`goals: stats ${apiGoals_tm} → TM ${tmStats.goals}`);
    d.apiGoals = tmStats.goals;
  }

  // Assists mismatch: same threshold
  const apiAssists_tm = d.apiAssists || 0;
  if (tmStats.assists !== undefined && Math.abs(tmStats.assists - apiAssists_tm) >= 3 && (apiAssists_tm === 0 || Math.abs(tmStats.assists - apiAssists_tm) / Math.max(apiAssists_tm, 1) > 0.5)) {
    overrides.push(`assists: stats ${apiAssists_tm} → TM ${tmStats.assists}`);
    d.apiAssists = tmStats.assists;
  }

  // Recalculate per-90 rates if anything was overridden
  if (overrides.length > 0) {
    const min90 = d.apiMinutes90s || 0;
    d.goalsPer90 = min90 > 0 ? Math.round((d.apiGoals / min90) * 100) / 100 : 0;
    d.contribPer90 = min90 > 0 ? Math.round(((d.apiGoals + d.apiAssists) / min90) * 100) / 100 : 0;
    // Mark as TM-enriched so downstream checks (no_minutes_data etc.) treat it properly
    d.source = d.source || "tm_enriched";
    d.statsSource = "transfermarkt_verified";
    d.tmVerification = {
      appearances: tmStats.appearances,
      goals: tmStats.goals,
      assists: tmStats.assists,
      minutes: tmStats.minutes,
      overrides,
    };
  }

  return { overridden: overrides.length > 0, overrides, tmStats };
}

/**
 * After stats are corrected, re-evaluate whether the profile type still fits.
 * If not, try all 8 types and pick the best match. Uses scoutAgent's matchesProfile.
 * Returns { changed: boolean, oldType: string, newType: string|null }.
 */
function reEvaluateProfileType(d) {
  const { matchesProfile, computeMatchScore, buildMatchReason } = getAgentFns();
  const oldType = d.profileType;

  // Build a fake player object that matchesProfile() expects
  const fakePlayer = {
    position: d.position,
    contract: d.contractExpires || "",
    api_minutes_90s: d.apiMinutes90s,
    api_goals: d.apiGoals,
    api_assists: d.apiAssists,
    fm_pa: d.fmPa,
    fm_ca: d.fmCa,
    market_value: d.marketValue,
    league: d.league,
    name: d.playerName,
  };

  const valEuro = d.marketValueEuro;
  const ageNum = d.age;
  const leagueTier = d.leagueTier || 1;

  // Check if current type still matches
  if (matchesProfile(fakePlayer, oldType, valEuro, ageNum, leagueTier)) {
    // Still valid — just update score and reason with corrected data
    d.matchScore = computeMatchScore(fakePlayer, oldType, valEuro, ageNum);
    d.matchReason = buildMatchReason(fakePlayer, oldType, valEuro, ageNum);
    return { changed: false, oldType, newType: oldType };
  }

  // Profile type no longer fits — find a new one
  const allTypes = [
    "HIGH_VALUE_BENCHED", "LOW_VALUE_STARTER", "YOUNG_STRIKER_HOT",
    "CONTRACT_EXPIRING", "HIDDEN_GEM", "LOWER_LEAGUE_RISER",
    "BREAKOUT_SEASON", "UNDERVALUED_BY_FM",
  ];

  let bestType = null;
  let bestScore = -1;
  for (const pt of allTypes) {
    if (matchesProfile(fakePlayer, pt, valEuro, ageNum, leagueTier)) {
      const score = computeMatchScore(fakePlayer, pt, valEuro, ageNum);
      if (score > bestScore) {
        bestScore = score;
        bestType = pt;
      }
    }
  }

  if (bestType) {
    d.profileType = bestType;
    d.matchScore = bestScore;
    d.matchReason = buildMatchReason(fakePlayer, bestType, valEuro, ageNum);
    return { changed: true, oldType, newType: bestType };
  }

  // No profile type matches with corrected data
  return { changed: true, oldType, newType: null };
}

// Profile types that rely on API stats and are vulnerable to bad data
const STATS_DEPENDENT_PROFILES = new Set([
  "HIGH_VALUE_BENCHED",
  "BREAKOUT_SEASON",
  "YOUNG_STRIKER_HOT",
]);

/**
 * Fetch TM stats via Vercel proxy (if configured) or direct fetch.
 * Vercel proxy bypasses TM's Google Cloud IP blocks.
 */
async function fetchTmStatsWithProxy(tmProfileUrl) {
  const proxyUrl = process.env.SCOUT_TM_PROXY_URL;
  const secret = process.env.SCOUT_ENRICH_SECRET;

  const id = extractTmPlayerId(tmProfileUrl);
  if (!id) return null;

  const season = getCurrentSeasonYear();
  const perfUrl = tmProfileUrl
    .replace(/\/profil\//, "/leistungsdaten/")
    .replace(/\/player\//, "/leistungsdaten/")
    .replace(/\/$/, "");
  const urlWithSeason = perfUrl.includes("saison") ? perfUrl : `${perfUrl}/saison/${season}`;

  let html;
  if (proxyUrl && secret) {
    try {
      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, url: urlWithSeason }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      html = await res.text();
    } catch (proxyErr) {
      // Fall back to direct fetch if proxy fails
      try {
        const directRes = await intelFetch(urlWithSeason);
        if (!directRes.ok) return null;
        html = await directRes.text();
      } catch { return null; }
    }
  } else {
    try {
      const res = await intelFetch(urlWithSeason);
      if (!res.ok) return null;
      html = await res.text();
    } catch { return null; }
  }

  if (!html) return null;

  try {
    const $ = cheerio.load(html);
    let appearances = 0, goals = 0, assists = 0, minutes = 0;

    const rows = $("table.items tbody tr, table.items tr");
    rows.each((_, row) => {
      const $row = $(row);
      const firstCell = $row.find("td").first().text().trim().toLowerCase();
      if (!firstCell.includes("total") && !firstCell.includes("gesamt")) return;

      const tds = $row.find("td");
      if (tds.length < 4) return;

      const nums = [];
      tds.slice(1).each((__, td) => {
        const raw = $(td).text().trim();
        const t = raw.replace(/['\s]/g, "").replace(/\./g, "").replace(/,/g, "");
        const n = parseInt(t, 10);
        if (!isNaN(n)) nums.push(n);
      });

      if (nums.length >= 3) {
        appearances = nums[0] ?? 0;
        goals = nums[1] ?? 0;
        if (nums.length === 3) {
          assists = 0;
          minutes = nums[2] ?? 0;
        } else {
          assists = nums[2] ?? 0;
          const last = nums[nums.length - 1];
          if (last != null && last > 100) minutes = last;
          else if (nums.length >= 6) minutes = nums[5] ?? 0;
          else if (nums.length >= 4) minutes = nums[3] ?? 0;
        }
      }
      return false;
    });

    if (appearances === 0 && goals === 0 && assists === 0) return null;
    return { appearances, goals, assists, minutes };
  } catch {
    return null;
  }
}

/**
 * Enrich ALL profiles that lack stats data with TM season stats.
 * Also re-verifies stats-dependent profiles where data exists but may be stale.
 * Batched: 5 concurrent, 1.5s between batches. Max 200 profiles.
 * Mutates profile data in-place when corrections/additions are needed.
 */
async function enrichAndVerifyViaTm(profiles) {
  // Enrich ALL profiles missing stats data, plus verify stats-dependent profiles
  const toEnrich = profiles.filter((p) => {
    const d = p.data;
    // Already has verified TM data — skip
    if (d.statsSource === "transfermarkt_verified" || d.statsSource === "api_tm_confirmed") return false;
    // No stats data → needs enrichment
    if ((d.apiMinutes90s || 0) <= 0) return true;
    // Has stats data but is stats-dependent → verify
    if (STATS_DEPENDENT_PROFILES.has(d.profileType)) return true;
    return false;
  });

  // Cap at 200 to stay within Cloud Function timeout
  const MAX_ENRICH = 200;
  const cappedList = toEnrich.slice(0, MAX_ENRICH);

  if (cappedList.length === 0) return { verified: 0, enriched: 0, overridden: 0, typeChanged: 0, noTypeMatch: 0, failed: 0 };

  console.log(`[SportDirector:TM-Enrich] Enriching ${cappedList.length} profiles (${toEnrich.length > MAX_ENRICH ? `capped from ${toEnrich.length}` : "all"})...`);

  let verified = 0, enriched = 0, overridden = 0, typeChanged = 0, noTypeMatch = 0, failed = 0;
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 1500;

  for (let i = 0; i < cappedList.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY));
    const batch = cappedList.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (profile) => {
        const d = profile.data;
        const hadNoData = (d.apiMinutes90s || 0) <= 0;
        const tmStats = await fetchTmStatsWithProxy(d.tmProfileUrl);
        if (!tmStats) {
          failed++;
          return;
        }
        verified++;

        const { overridden: wasOverridden, overrides } = verifyAndCorrectStats(d, tmStats);
        if (wasOverridden) {
          if (hadNoData) enriched++;
          else overridden++;
          console.log(`[SportDirector:TM-Enrich] ${d.playerName}: ${overrides.join("; ")}`);

          // Re-evaluate profile type — enriched data may unlock better types
          const { changed, oldType, newType } = reEvaluateProfileType(d);
          if (changed && newType) {
            typeChanged++;
            console.log(`[SportDirector:TM-Enrich] ${d.playerName}: profileType ${oldType} → ${newType}`);
          } else if (changed && !newType) {
            noTypeMatch++;
            console.log(`[SportDirector:TM-Enrich] ${d.playerName}: NO profile type matches after enrichment (was ${oldType}). Will be rejected.`);
            d._tmVerifyReject = true;
            d._tmVerifyRejectReason = `stats_override_no_profile_match:was_${oldType}`;
          }
        } else {
          // TM data confirms existing data (or had no new data to add)
          if (!hadNoData) {
            d.statsSource = "api_tm_confirmed";
            d.tmVerification = {
              appearances: tmStats.appearances,
              goals: tmStats.goals,
              assists: tmStats.assists,
              minutes: tmStats.minutes,
              overrides: [],
            };
          }
        }
      })
    );
  }

  console.log(`[SportDirector:TM-Enrich] Done. Enriched: ${enriched}, Verified: ${verified}, Overridden: ${overridden}, TypeChanged: ${typeChanged}, NoMatch: ${noTypeMatch}, Failed: ${failed}`);
  return { verified, enriched, overridden, typeChanged, noTypeMatch, failed };
}

// ═══════════════════════════════════════════════════════════════
// Gemini Sport Director executive evaluation (top profiles only)
// ═══════════════════════════════════════════════════════════════
async function generateDirectorVerdicts(approvedProfiles, agentReports) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) return { verdictMap: {}, intelMap: {} };

  // Only evaluate top 10 profiles (cost-efficient)
  const topProfiles = approvedProfiles
    .sort((a, b) => b.data.matchScore - a.data.matchScore)
    .slice(0, 10);

  if (topProfiles.length === 0) return { verdictMap: {}, intelMap: {} };

  // ═══ VERDICT CACHE — reuse verdicts from recent ScoutProfiles (last 7 days) ═══
  const db = getFirestore();
  const cachedVerdictMap = {};
  const cachedIntelMap = {};
  try {
    const now = Date.now();
    const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;
    const recentSnap = await db.collection("ScoutProfiles")
      .where("discoveredAt", ">=", cutoff7d)
      .get();
    for (const doc of recentSnap.docs) {
      const d = doc.data();
      if (!d.directorVerdict) continue;
      const url = (d.tmProfileUrl || "").trim().toLowerCase().replace(/\/$/, "");
      if (!url || !d.directorVerdict) continue;
      cachedVerdictMap[url] = {
        verdict: d.directorVerdict,
        action: d.directorAction || "MONITOR",
        valueArc: d.directorValueArc || null,
        dataFlags: Array.isArray(d.directorDataFlags) ? d.directorDataFlags : [],
        fitScore: typeof d.directorFitScore === "number" ? d.directorFitScore : null,
      };
      // Cache intel fields too
      if (d.intelSources?.length > 0) {
        const name = (d.playerName || "").toLowerCase().trim();
        if (name) cachedIntelMap[name] = { sources: d.intelSources };
      }
    }
    if (Object.keys(cachedVerdictMap).length > 0) {
      console.log(`[SportDirector] Loaded ${Object.keys(cachedVerdictMap).length} cached verdicts from last 7 days`);
    }
  } catch (cacheErr) {
    console.warn("[SportDirector] Verdict cache load failed (non-fatal):", cacheErr.message);
  }

  // Split into cached (reuse) vs new (need Gemini)
  const newProfiles = [];
  const reusedVerdictMap = {};
  const reusedIntelMap = { ...cachedIntelMap };
  for (const pw of topProfiles) {
    const url = (pw.data.tmProfileUrl || "").trim().toLowerCase().replace(/\/$/, "");
    if (cachedVerdictMap[url]) {
      const name = pw.data.playerName.toLowerCase().trim();
      reusedVerdictMap[name] = cachedVerdictMap[url];
      console.log(`[SportDirector] Using cached verdict for ${pw.data.playerName}`);
    } else {
      newProfiles.push(pw);
    }
  }

  if (newProfiles.length === 0) {
    console.log("[SportDirector] All top profiles have cached verdicts — skipping Gemini");
    return { verdictMap: reusedVerdictMap, intelMap: reusedIntelMap };
  }

  console.log(`[SportDirector] ${newProfiles.length} new profiles need Gemini evaluation (${topProfiles.length - newProfiles.length} cached)`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: `You are the Sport Director of MGSR — a world-class football executive modeled after the best in the industry: Monchi (Sevilla/Aston Villa), Michael Edwards (Liverpool/FSG), Damien Comolli (Juventus), and Txiki Begiristain (Manchester City). You have 25 years managing AI scouting agents that scan 100+ leagues for Israeli Premier League (Ligat Ha'al) clubs.

YOUR PHILOSOPHY (from real Sport Directors):
- "The sporting director is the safeguard of the culture." (Comolli) — Every profile you approve shapes the system's reputation.
- "You don't need to change 11 players every year. You need to change two or three." (Begiristain) — Quality over quantity. 5 genuine prospects beat 50 noise profiles.
- "All I can do is try and increase the chance of success." (Spors) — You build probability, not certainty.

BUDGET REALITY: Max transfer fee €2.5M. Typical signing is €200K-800K. Only 2-3 clubs in Ligat Ha'al can afford €1M+.
LEAGUE LEVEL: Ligat Ha'al ≈ mid-table Championship, bottom Eredivisie, top Ekstraklasa.
TRANSFER REALISM: A 24yo regular starter at a Serie A club will NOT move to Israel unless his contract is expiring.

MONCHI METHOD — Always evaluate the VALUE ARC:
- What is this player worth today vs in 2 years? Buy at €200K → perform 2 seasons → sell to Turkey/Netherlands/Belgium at €1.5M = successful transfer business.
- Profiles with resale potential (young, rising trajectory, EU passport) deserve a BONUS.
- End-of-line profiles (28+, declining, no resale) need EXCEPTIONAL current performance to justify approval.

EDWARDS METHOD — Trust converging signals over market price:
- If per-90 stats + FM potential + agent matching all say "excellent" but market says €400K → the market is probably wrong.
- Cross-league detections (2+ agents found same player independently) = highest conviction signal.

CHIEF SCOUT'S FOUR-DIMENSION EVALUATION:
1. TECHNICAL — Goals, assists, per-90 rates, FM CA, shooting/passing output
2. PHYSICAL — Minutes played (durability), age (peak window), league physicality demands
3. TACTICAL — Position fit, league adaptation history, goals-from-position context
4. MENTAL — Season-long consistency (not purple patches), age trajectory, relocation willingness

LEAGUE-SPECIFIC INTELLIGENCE:
- Portugal/Belgium/Netherlands: "Stepping stone" leagues — players are used to being scouted and relocating. Best hunting ground.
- Turkey/Greece: High wages → hard to convince players to take pay cut for Israel. Must be exceptional or contract-expiring.
- Eastern Europe (Serbia, Croatia, Poland): Talent factories, low prices, players WANT to leave. Goldmine but inflate stats.
- South America: Immense talent but adaptation risk. Non-EU slot cost must be justified.
- 2nd divisions: Perfect price range. Distinguish "developing" from "peaked at 2nd tier."

Your 7-step evaluation for each player:
1. POSITION FIT — Does the player actually play the claimed position?
2. PERFORMANCE VERIFICATION — Are stats real and recent? (5G in 2 matches = suspicious)
3. VALUE ARC — Buy price + resale potential + wage reality for Israeli clubs
4. NATIONALITY/ELIGIBILITY — Non-EU = foreign slot. Worth it?
5. LEAGUE-LEVEL CALIBRATION — Azerbaijan ≠ Israel. Calibrate to destination.
6. FOUR-DIMENSION CHECK — Technical + Physical + Tactical + Mental profile
7. AGE TRAJECTORY — Upward curve or already peaked?

Be BRUTAL. Like Monchi reviewing 200 videos to shortlist 3 names — your reputation depends on sending ONLY players who are genuinely realistic and useful.

For each player output:
- verdict: 2-3 sentences, specific, referencing actual numbers. Think like a real SD writing a memo.
- action: SHORTLIST_NOW / MONITOR / LOW_PRIORITY / REJECT_OVERRIDE (code checks missed something)
- valueArc: "rising" / "peak" / "declining" — the player's trajectory
- dataFlags: array of concerns about data accuracy (empty if clean)
- fitScore: 1-10 how well this player fits the Israeli market`,
    });

    // ═══ INTELLIGENCE ENRICHMENT (only for new profiles) ═══
    const intelMap = { ...reusedIntelMap };
    const INTEL_BATCH = 5;
    for (let i = 0; i < newProfiles.length; i += INTEL_BATCH) {
      const batch = newProfiles.slice(i, i + INTEL_BATCH);
      const results = await Promise.allSettled(
        batch.map(pw => gatherQuickIntel(pw.data.playerName, pw.data.club))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled" && results[j].value?.sources?.length > 0) {
          const key = batch[j].data.playerName.toLowerCase().trim();
          intelMap[key] = results[j].value;
        }
      }
      // Rate limit between batches
      if (i + INTEL_BATCH < newProfiles.length) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }
    const intelCount = Object.keys(intelMap).length - Object.keys(reusedIntelMap).length;
    if (intelCount > 0) {
      console.log(`[SportDirector] Intelligence gathered for ${intelCount}/${newProfiles.length} new players`);
    }

    const playerLines = newProfiles.map((pw, i) => {
      const d = pw.data;
      const per90 = d.apiMinutes90s > 0
        ? `G/90: ${d.goalsPer90.toFixed(2)}, (G+A)/90: ${d.contribPer90.toFixed(2)}`
        : "no per-90 data";
      const nationality = d.nationality || "unknown";
      const intel = intelMap[d.playerName.toLowerCase().trim()];
      const intelLine = intel ? formatIntelLine(intel) : "";
      return `${i + 1}. ${d.playerName} (${d.age}, ${nationality}, ${d.position}, ${d.club}, ${d.league}, Tier ${d.leagueTier})
   Agent: ${d.agentId} | Profile: ${d.profileType} | Score: ${d.matchScore}/100
   Value: ${d.marketValue} (€${d.marketValueEuro}) | Contract: ${d.contractExpires || "?"}
   FM PA: ${d.fmPa || "?"}, CA: ${d.fmCa || "?"} | ${per90}
   Stats: ${d.apiGoals || 0}G ${d.apiAssists || 0}A in ${d.apiMinutes90s?.toFixed(1) || 0} 90s | Rating: ${d.apiRating || "?"}
   Reason: ${d.matchReason}
   Director code issues: ${(pw.directorReasons || []).join(", ") || "none"}${intelLine ? `\n   INTEL: ${intelLine}` : ""}`;
    }).join("\n");

    // Include agent performance context
    const agentContext = Object.entries(agentReports)
      .map(([id, r]) => `${id}: Grade ${r.overallGrade}, ${r.approvalRate}% approved, ${r.freshnessGrade}`)
      .join(" | ");

    const prompt = `Evaluate these ${newProfiles.length} profiles from my AI agents.
Your job: verify data accuracy, check Israeli market realism, assess the VALUE ARC (Monchi method), and validate that each player truly fits across all four dimensions (technical, physical, tactical, mental).

IMPORTANT: Some players have an INTEL line with real-time data from TheSportsDB (physical profile, wage, signing fee, agent, honours, career history), FotMob (player ID), and ClubElo (club strength). USE THIS DATA in your evaluation — it provides verified biographical context, salary expectations, career trajectory (former teams & trophies), and physical attributes that inform your assessment. Club Elo contextualizes the league level. Multiple honours signal elite experience.

Agent performance this run: ${agentContext}

Players:
${playerLines}

For each player respond with:
1. "verdict": 2-3 sentence Sport Director verdict (reference specific stats, be opinionated, mention value arc)
2. "action": "SHORTLIST_NOW" / "MONITOR" / "LOW_PRIORITY" / "REJECT_OVERRIDE"
3. "valueArc": "rising" / "peak" / "declining"
4. "dataFlags": ["list of data accuracy concerns"] (e.g., "goals vs minutes doesn't add up", "value seems outdated")
5. "fitScore": 1-10 (10=perfect fit for Israeli market)

Return JSON array: [{"name":"...","verdict":"...","action":"...","valueArc":"...","dataFlags":[...],"fitScore":N}]
ONLY valid JSON. No explanations outside the JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response?.text?.() || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { verdictMap: reusedVerdictMap, intelMap };

    const verdicts = JSON.parse(jsonMatch[0]);
    const verdictMap = { ...reusedVerdictMap };
    for (const v of verdicts) {
      if (v.name && v.verdict) {
        verdictMap[v.name.toLowerCase().trim()] = {
          verdict: v.verdict,
          action: v.action || "MONITOR",
          valueArc: v.valueArc || null,
          dataFlags: Array.isArray(v.dataFlags) ? v.dataFlags : [],
          fitScore: typeof v.fitScore === "number" ? v.fitScore : null,
        };
      }
    }
    return { verdictMap, intelMap };
  } catch (err) {
    console.warn("[SportDirector] Gemini verdict generation failed (non-fatal):", err.message);
    return { verdictMap: reusedVerdictMap, intelMap: reusedIntelMap };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN: Sport Director review — the quality gate
// ═══════════════════════════════════════════════════════════════

/**
 * Review all collected profiles before they reach Firestore.
 * @param {Array} profilesToWrite — profiles from scoutAgent profile matching
 * @returns {{ approved: Array, rejected: Array, agentReports: Object }}
 */
async function reviewProfiles(profilesToWrite) {
  const approved = [];
  const rejected = [];
  const agentStats = {};

  // Load roster + shortlist URLs — skip players we already have
  const knownPlayerUrls = await loadKnownPlayerUrls();

  // Load previous run URLs for freshness detection
  const previousUrls = await loadPreviousRunUrls();

  // ═══ TM ENRICHMENT & VERIFICATION ═══
  // Enrich ALL profiles lacking stats data with real TM season stats.
  // Also re-verify stats-dependent profiles (HIGH_VALUE_BENCHED, BREAKOUT_SEASON,
  // YOUNG_STRIKER_HOT) against Transfermarkt. Corrects mismatches, populates
  // empty fields, and re-evaluates profile types before quality gate runs.
  const tmVerifyStats = await enrichAndVerifyViaTm(profilesToWrite);

  for (const profile of profilesToWrite) {
    const d = profile.data;
    const agentId = d.agentId;

    // Init agent stats
    if (!agentStats[agentId]) {
      agentStats[agentId] = {
        total: 0, approved: 0, rejected: 0,
        rejectionReasons: {},
        profileTypes: {},
        recycledCount: 0,
        newCount: 0,
      };
    }
    agentStats[agentId].total++;
    agentStats[agentId].profileTypes[d.profileType] =
      (agentStats[agentId].profileTypes[d.profileType] || 0) + 1;

    // Freshness check
    const url = normalizeUrl(d.tmProfileUrl);
    const agentPrevUrls = previousUrls.get(agentId);
    if (agentPrevUrls && agentPrevUrls.has(url)) {
      agentStats[agentId].recycledCount++;
    } else {
      agentStats[agentId].newCount++;
    }

    // Skip players already in roster or shortlist
    const profileUrl = normalizeUrl(d.tmProfileUrl);
    if (knownPlayerUrls.has(profileUrl)) {
      rejected.push({ ...profile, directorVerdict: "rejected", directorReasons: ["already_in_roster_or_shortlist"] });
      agentStats[agentId].rejected++;
      agentStats[agentId].rejectionReasons["already_in_roster_or_shortlist"] =
        (agentStats[agentId].rejectionReasons["already_in_roster_or_shortlist"] || 0) + 1;
      continue;
    }

    // Check if TM verification rejected this profile (no matching type after correction)
    if (d._tmVerifyReject) {
      const reason = d._tmVerifyRejectReason || "stats_override_no_profile_match";
      rejected.push({ ...profile, directorVerdict: "rejected", directorReasons: [reason] });
      agentStats[agentId].rejected++;
      agentStats[agentId].rejectionReasons[reason] =
        (agentStats[agentId].rejectionReasons[reason] || 0) + 1;
      continue;
    }

    // Run all quality checks
    const allIssues = [];
    allIssues.push(...checkCompleteness(d));
    allIssues.push(...checkPer90Quality(d));
    allIssues.push(...checkAgeValueRationality(d));
    allIssues.push(...checkScoreThreshold(d));
    allIssues.push(...checkIsraeliMarketRealism(d));
    allIssues.push(...checkDataConsistency(d));

    // Critical issues = instant reject
    const criticalIssues = allIssues.filter((i) =>
      i.includes("critical") ||
      i === "missing_name" ||
      i === "old_expensive_no_upside" ||
      i === "benched_at_low_tier" ||
      i.startsWith("value_exceeds_israeli_ceiling") ||
      i === "tier1_starter_unrealistic" ||
      i.startsWith("impossible_goal_rate") ||
      i === "insufficient_data_critical"
    );

    if (criticalIssues.length > 0) {
      rejected.push({ ...profile, directorVerdict: "rejected", directorReasons: allIssues });
      agentStats[agentId].rejected++;
      for (const issue of allIssues) {
        agentStats[agentId].rejectionReasons[issue] =
          (agentStats[agentId].rejectionReasons[issue] || 0) + 1;
      }
    } else if (allIssues.length >= 4) {
      // 4+ non-critical issues = cumulative quality concern → reject
      rejected.push({ ...profile, directorVerdict: "rejected", directorReasons: allIssues });
      agentStats[agentId].rejected++;
      for (const issue of allIssues) {
        agentStats[agentId].rejectionReasons[issue] =
          (agentStats[agentId].rejectionReasons[issue] || 0) + 1;
      }
    } else {
      // 0-3 minor issues → approved
      approved.push({ ...profile, directorVerdict: "approved", directorReasons: allIssues });
      agentStats[agentId].approved++;
    }
  }

  // Build agent report cards
  const agentReports = {};
  for (const [agentId, stats] of Object.entries(agentStats)) {
    const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    const recycleRate = stats.total > 0 ? Math.round((stats.recycledCount / stats.total) * 100) : 0;

    let freshnessGrade;
    if (recycleRate <= 30) freshnessGrade = "FRESH";
    else if (recycleRate <= 70) freshnessGrade = "STALE";
    else freshnessGrade = "RECYCLING";

    let overallGrade;
    if (approvalRate >= 80 && freshnessGrade === "FRESH") overallGrade = "A";
    else if (approvalRate >= 65 && freshnessGrade !== "RECYCLING") overallGrade = "B";
    else if (approvalRate >= 50) overallGrade = "C";
    else if (approvalRate >= 30) overallGrade = "D";
    else overallGrade = "F";

    agentReports[agentId] = {
      total: stats.total,
      approved: stats.approved,
      rejected: stats.rejected,
      approvalRate,
      recycledCount: stats.recycledCount,
      newCount: stats.newCount,
      recycleRate,
      freshnessGrade,
      overallGrade,
      profileTypes: stats.profileTypes,
      topRejectionReasons: Object.entries(stats.rejectionReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => `${reason} (${count}x)`),
    };
  }

  // Generate Gemini Sport Director verdicts for top approved profiles
  const { verdictMap: directorVerdicts = {}, intelMap: directorIntel = {} } = await generateDirectorVerdicts(approved, agentReports);

  // Merge verdicts + intel into approved profiles + handle REJECT_OVERRIDE
  const postGeminiRejected = [];
  for (const profile of approved) {
    const key = profile.data.playerName.toLowerCase().trim();
    const v = directorVerdicts[key];
    if (v) {
      profile.data.directorVerdict = v.verdict;
      profile.data.directorAction = v.action;
      profile.data.directorFitScore = v.fitScore;
      profile.data.directorValueArc = v.valueArc;
      profile.data.directorDataFlags = v.dataFlags;
    }
    // Store intel data in Firestore for display in War Room
    const intel = directorIntel[key];
    if (intel?.sources?.length > 0) {
      profile.data.intelSources = intel.sources;
      if (intel.tsdb) {
        const t = intel.tsdb;
        if (t.position) profile.data.intelPosition = t.position;
        if (t.nationality) profile.data.intelNationality = t.nationality;
        if (t.height) profile.data.intelHeight = t.height;
        if (t.weight) profile.data.intelWeight = t.weight;
        if (t.wage) profile.data.intelWage = t.wage;
        if (t.signingFee) profile.data.intelSigningFee = t.signingFee;
        if (t.agent) profile.data.intelAgent = t.agent;
        if (t.preferredFoot) profile.data.intelFoot = t.preferredFoot;
        if (t.dateBorn) profile.data.intelDOB = t.dateBorn;
        if (t.honours?.length > 0) profile.data.intelHonours = t.honours.length;
        if (t.formerTeams?.length > 0) profile.data.intelCareer = t.formerTeams.join(" > ");
        if (t.description) profile.data.intelBio = t.description.slice(0, 200);
      }
      if (intel.fotmob?.id) profile.data.intelFotMobId = intel.fotmob.id;
      if (intel.clubElo) {
        profile.data.intelClubElo = intel.clubElo.elo;
        profile.data.intelClubLevel = intel.clubElo.level;
      }
    }
  }
  // REJECT_OVERRIDE: Gemini found issues the code checks missed
  for (let i = approved.length - 1; i >= 0; i--) {
    const p = approved[i];
    if (p.data.directorAction === "REJECT_OVERRIDE") {
      approved.splice(i, 1);
      p.directorVerdict = "rejected_by_gemini";
      p.directorReasons = [...(p.directorReasons || []), "gemini_reject_override"];
      rejected.push(p);
      postGeminiRejected.push(p.data.playerName);
      if (agentStats[p.data.agentId]) {
        agentStats[p.data.agentId].approved--;
        agentStats[p.data.agentId].rejected++;
      }
    }
  }
  if (postGeminiRejected.length > 0) {
    console.log(`[SportDirector] Gemini REJECT_OVERRIDE: ${postGeminiRejected.join(", ")}`);
  }

  // Log summary
  console.log(`[SportDirector] ═══ REVIEW COMPLETE ═══`);
  console.log(`[SportDirector] Total: ${profilesToWrite.length} | Approved: ${approved.length} | Rejected: ${rejected.length}`);
  if (tmVerifyStats.verified > 0 || tmVerifyStats.failed > 0 || tmVerifyStats.enriched > 0) {
    console.log(
      `[SportDirector] TM Enrichment: ${tmVerifyStats.enriched} newly enriched, ${tmVerifyStats.verified} verified, ${tmVerifyStats.overridden} overridden, ` +
      `${tmVerifyStats.typeChanged} type changes, ${tmVerifyStats.noTypeMatch} rejected, ${tmVerifyStats.failed} scrape failures`
    );
  }
  for (const [agentId, report] of Object.entries(agentReports)) {
    console.log(
      `[SportDirector] ${agentId}: Grade ${report.overallGrade} | ` +
      `${report.approved}/${report.total} approved (${report.approvalRate}%) | ` +
      `Freshness: ${report.freshnessGrade} (${report.recycleRate}% recycled)` +
      (report.topRejectionReasons.length > 0 ? ` | Top issues: ${report.topRejectionReasons.join(", ")}` : "")
    );
  }

  return { approved, rejected, agentReports };
}

module.exports = { reviewProfiles, fetchTmPerformanceStats, fetchTmStatsWithProxy };
