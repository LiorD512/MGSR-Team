/**
 * AI Scout Agent Network — The Scout Brain.
 *
 * Elite scouting system that runs on schedule:
 * 1. Fetches players from scout server recruitment API
 * 2. Assigns to country agents by league
 * 3. Matches 8 scouting profiles (including BREAKOUT_SEASON, UNDERVALUED_BY_FM)
 * 4. Computes real matchScore based on profile criteria strength
 * 5. Sport Director reviews ALL profiles — quality gate before Firestore
 * 6. Only approved profiles get Gemini scout narratives
 * 7. Detects cross-league patterns (same player surfacing in multiple searches)
 * 8. Writes ONLY Sport Director-approved profiles to ScoutProfiles
 * 9. Agent report cards feed into scoutSkillLearner
 */

const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { reviewProfiles, fetchTmPerformanceStats, fetchTmStatsWithProxy } = require("./sportDirector");

function getScoutBaseUrl() {
  const url = process.env.SCOUT_SERVER_URL || "https://football-scout-server-l38w.onrender.com";
  return url.trim().replace(/\/$/, "");
}
const LIGAT_HAAL_VALUE_MAX = 2_500_000;
const DELAY_BETWEEN_REQUESTS_MS = 2500; // Reduced from 5s — scout server is our own

/** League name (from scout) -> agentId. Use lowercase for matching. */
const LEAGUE_TO_AGENT = {
  "liga portugal": "portugal",
  "liga portugal 2": "portugal",
  "liga portugal bwin": "portugal",
  "super liga srbije": "serbia",
  "prva liga": "serbia",
  "serbian superliga": "serbia",
  "ekstraklasa": "poland",
  "pko bp ekstraklasa": "poland",
  "i liga": "poland",
  "1 liga": "poland",
  "super league 1": "greece",
  "super league": "greece",
  "jupiler pro league": "belgium",
  "eredivisie": "netherlands",
  "eerste divisie": "netherlands",
  "süper lig": "turkey",
  "super lig": "turkey",
  "1. lig": "turkey",
  "1 lig": "turkey",
  "austrian bundesliga": "austria",
  "admiral bundesliga": "austria",
  "2. liga austria": "austria",
  "bundesliga osterreich": "austria",
  "bundesliga österreich": "austria",
  "allsvenskan": "sweden",
  "swiss super league": "switzerland",
  "raiffeisen super league": "switzerland",
  "super league schweiz": "switzerland",
  "chance liga": "czech",
  "fortuna liga": "czech",
  "danish superliga": "denmark",
  "superligaen": "denmark",
  "3f superliga": "denmark",
  "superliga": "romania",
  "liga 1 romania": "romania",
  "liga 1 rumanien": "romania",
  "liga 1 rumänien": "romania",
  "romanian superliga": "romania",
  "efbet liga": "bulgaria",
  "parva liga": "bulgaria",
  "parva liga bulgarien": "bulgaria",
  "first professional league": "bulgaria",
  "nemzeti bajnoksag": "hungary",
  "nb i": "hungary",
  "nb i ungarn": "hungary",
  "otp bank liga": "hungary",
  "premier liga": "ukraine",
  "championship": "england",
  "bundesliga": "germany",
  "1. bundesliga": "germany",
  "1 bundesliga": "germany",
  "2. bundesliga": "germany",
  "2 bundesliga": "germany",
  "serie a": "italy",
  "serie b": "italy",
  "campeonato brasileiro série a": "brazil",
  "campeonato brasileiro serie a": "brazil",
  "campeonato brasileiro série b": "brazil",
  "campeonato brasileiro serie b": "brazil",
  "brasileirão": "brazil",
  "brasileirao": "brazil",
  "serie a brasilien": "brazil",
  "serie b brasilien": "brazil",
  "torneo apertura": "argentina",
  "liga profesional": "argentina",
  "primera nacional": "argentina",
  "primera division argentina": "argentina",
  "primera división argentina": "argentina",
  "liga dimayor": "colombia",
  "liga dimayor apertura": "colombia",
  "categoría primera a": "colombia",
  "categoria primera a": "colombia",
  "primera division colombia": "colombia",
  "primera división colombia": "colombia",
  "liga primera": "chile",
  "liga de primera": "chile",
  "primera división chile": "chile",
  "liga auf": "uruguay",
  "liga auf apertura": "uruguay",
  "primera división uruguay": "uruguay",
  "ligapro serie a": "ecuador",
  "serie a ecuador": "ecuador",
  "liga 1 apertura": "peru",
  "liga 1 peru": "peru",
  "primera división peru": "peru",
  "laliga2": "spain",
  "laliga 2": "spain",
  "ligue 2": "france",
  "championnat national": "france",
  "national": "france",
  "scottish premiership": "scotland",
  "hnl": "croatia",
  "prva hnl": "croatia",
  "1. hnl": "croatia",
  "hnl kroatien": "croatia",
  "croatian first football league": "croatia",
  "prvaliga": "slovenia",
  "slovenian prvaliga": "slovenia",
  "prva liga slovenije": "slovenia",
  "premier league bih": "bosnia",
  "bh telecom": "bosnia",
  "premier liga bih": "bosnia",
  "prva liga bosne i hercegovine": "bosnia",
  "premier liga bosne i hercegovine": "bosnia",
  "first league": "macedonia",
  "macedonian first league": "macedonia",
  "prva makedonska liga": "macedonia",
  "primera makedonska liga": "macedonia",
  "primera liga makedonien": "macedonia",
  "first league montenegro": "montenegro",
  "prva crnogorska liga": "montenegro",
  "1. cfl": "montenegro",
  "superliga kosovo": "kosovo",
  "kosovo superleague": "kosovo",
  "superliga e kosoves": "kosovo",
  "superliga kosoves": "kosovo",
  "superliga e kosovës": "kosovo",
  "cyprus league": "cyprus",
  "1. division cyprus": "cyprus",
  "protathlima cyta": "cyprus",
  "nike liga": "slovakia",
  "niké liga": "slovakia",
  "fortuna liga slovakia": "slovakia",
  "niké liga slowakei": "slovakia",
  "nike liga slowakei": "slovakia",
  "2. liga slowakei": "slovakia",
  "fortuna liga slowakei": "slovakia",
  "premyer liqa": "azerbaijan",
  "premyer liqasi": "azerbaijan",
  "premyer liqası": "azerbaijan",
  "premier liga kazakhstan": "kazakhstan",
  "premier liga kazachstan": "kazakhstan",
  "kazakhstan premier league": "kazakhstan",
  "premjer liga kasachstan": "kazakhstan",
  "challenger pro league": "belgium",
  "ligue 1": "france",
  "superliga serbia": "serbia",
  "superliga serbien": "serbia",
  "botola pro": "morocco",
  "eliteserien": "norway",
  "major league soccer": "usa",
  "laliga": "spain",
  "premier league": "england",
  // German-language league names from Transfermarkt
  "a division cyprus": "cyprus",
  "a division zypern": "cyprus",
  "prva liga slowenien": "slovakia",  // ⚠ Recruitment API mislabels Slovak Niké Liga as "Prva Liga Slowenien"
  "nike liga slowenien": "slovakia",
  "1. hnl": "croatia",
  "parva liga bulgarien": "bulgaria",
  "serie a brasilien": "brazil",
  "serie b brasilien": "brazil",
  "campeonato brasileiro serie a": "brazil",
  "veikkausliiga": "finland",
  "liga mx": "mexico",
  "1 lig": "turkey",
};

/** Fallback: league contains country keyword -> agentId. Denmark before Romania to avoid "superliga" clash. */
const LEAGUE_CONTAINS_AGENT = [
  [["portugal", "portuguese", "liga portugal"], "portugal"],
  [["serbia", "serbian", "srbije", "serbien"], "serbia"],
  [["poland", "polish", "ekstraklasa", "polska"], "poland"],
  [["greece", "greek"], "greece"],
  [["belgium", "belgian", "jupiler", "challenger"], "belgium"],
  [["netherlands", "dutch", "eredivisie", "eerste divisie"], "netherlands"],
  [["turkey", "turkish"], "turkey"],
  [["austria", "austrian", "admiral", "osterreich", "österreich"], "austria"],
  [["sweden", "swedish", "allsvenskan"], "sweden"],
  [["switzerland", "swiss", "schweiz"], "switzerland"],
  [["czech", "chance liga", "fortuna liga", "tschechien"], "czech"],
  [["denmark", "danish", "superligaen", "dänemark"], "denmark"],
  [["romania", "romanian", "liga 1", "liga i", "rumanien", "rumänien"], "romania"],
  [["bulgaria", "bulgarian", "efbet", "bulgarien", "parva liga"], "bulgaria"],
  [["hungary", "hungarian", "nemzeti", "ungarn"], "hungary"],
  [["ukraine", "ukrainian", "premier liga"], "ukraine"],
  [["england", "english", "championship"], "england"],
  [["germany", "german", "bundesliga"], "germany"],
  [["brazil", "brazilian", "brasileirão", "brasileirao", "campeonato brasileiro", "brasilien"], "brazil"],
  [["argentina", "argentine", "argentinian", "liga profesional", "torneo apertura"], "argentina"],
  [["colombia", "colombian", "dimayor", "categoría primera", "categoria primera"], "colombia"],
  [["chile", "chilean", "liga primera chile", "primera división chile"], "chile"],
  [["uruguay", "uruguayan", "liga auf", "primera división uruguay"], "uruguay"],
  [["ecuador", "ecuadorian", "ligapro", "serie a ecuador"], "ecuador"],
  [["peru", "peruvian", "liga 1 peru", "primera división peru"], "peru"],
  [["italy", "italian"], "italy"],
  [["spain", "spanish", "laliga"], "spain"],
  [["france", "french", "ligue", "championnat national"], "france"],
  [["scotland", "scottish", "premiership"], "scotland"],
  [["croatia", "croatian", "hnl", "prva hnl", "kroatien"], "croatia"],
  [["slovenia", "slovenian", "prvaliga"], "slovenia"],
  [["bosnia", "bosnian", "bih", "premier liga bih", "hercegovine"], "bosnia"],
  [["macedonia", "macedonian", "prva makedonska", "makedonien", "primera makedonska"], "macedonia"],
  [["montenegro", "crnogorska"], "montenegro"],
  [["kosovo", "kosovar", "kosoves"], "kosovo"],
  [["cyprus", "cypriot", "protathlima", "zypern"], "cyprus"],
  [["slovakia", "slovak", "slowakei", "slowenien", "niké liga", "nike liga"], "slovakia"],
  [["azerbaijan", "azerbaijani", "premyer liqa"], "azerbaijan"],
  [["kazakhstan", "kazakh", "kasachstan"], "kazakhstan"],
  [["morocco", "moroccan", "botola"], "morocco"],
  [["norway", "norwegian", "eliteserien"], "norway"],
  [["usa", "american", "mls", "major league soccer"], "usa"],
  [["mexico", "mexican", "liga mx"], "mexico"],
  [["finland", "finnish", "veikkausliiga"], "finland"],

];

const POSITIONS = ["CF", "AM", "CM", "CB", "DM", "LW", "RW", "LB", "RB", "SS"];
const MAX_AGE = 31; // Hard cap — no profiles age 32+
const AGENT_IDS = [
  "portugal", "serbia", "poland", "greece", "belgium", "netherlands", "turkey", "austria",
  "sweden", "switzerland", "czech", "denmark", "romania", "bulgaria", "hungary", "ukraine",
  "england", "germany", "italy", "spain", "france", "scotland",
  "croatia", "slovenia", "bosnia", "macedonia", "montenegro", "kosovo",
  "cyprus", "slovakia", "azerbaijan", "kazakhstan",
  "brazil", "argentina", "colombia", "chile", "uruguay", "ecuador", "peru",
  "morocco", "norway", "usa",
  "finland", "mexico",
];

/** Nationality-based skip filter — applied in ALL sweeps */
function shouldSkipByNationality(agentId, citizenship) {
  const cit = (citizenship || "").toLowerCase();
  // Turkey agent: only non-Turkish players (foreign talent in Turkish leagues)
  if (agentId === "turkey") {
    if (cit.includes("turkey") || cit.includes("türkiye") || cit.includes("turkish")) return true;
  }
  // Morocco agent: only non-Moroccan African players
  if (agentId === "morocco") {
    if (cit.includes("morocco") || cit.includes("moroccan") || cit.includes("maroc")) return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseMarketValue(val) {
  if (!val || typeof val !== "string") return 0;
  const s = val.trim().replace(/,/g, "").toLowerCase();
  const num = parseFloat(s.replace(/[^\d.]/g, ""));
  if (isNaN(num)) return 0;
  if (s.includes("m") || s.includes("million")) return num * 1_000_000;
  if (s.includes("k") || s.includes("thousand")) return num * 1_000;
  return num;
}

function parseAge(ageStr) {
  if (!ageStr) return null;
  const num = parseInt(String(ageStr).replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? null : num;
}

function leagueToAgent(league) {
  if (!league || typeof league !== "string") return null;
  const key = league.trim().toLowerCase();
  let agent = LEAGUE_TO_AGENT[key];
  if (agent) return agent;
  for (const [keywords, aid] of LEAGUE_CONTAINS_AGENT) {
    if (keywords.some((kw) => key.includes(kw))) return aid;
  }
  return null;
}

function getFmPa(p) {
  if (typeof p.fm_pa === "number") return p.fm_pa;
  if (typeof p.fmi_pa === "number") return p.fmi_pa;
  return null;
}

/** Parse api_minutes_90s (e.g. "1.8" = 162 min). Returns 0 if missing/invalid. */
function getMinutes90s(p) {
  const v = p.api_minutes_90s;
  if (v == null) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) || n < 0 ? 0 : n;
}

/** Parse contract string like "Jun 30, 2025" or "2026" into a year number. */
function parseContractYear(contract) {
  if (!contract || typeof contract !== "string") return null;
  const match = contract.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

/** Get API goals (total, not per90). Returns 0 if missing. */
function getApiGoals(p) {
  const v = p.api_goals;
  if (v == null) return 0;
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return isNaN(n) ? 0 : n;
}

/** Get API assists (total). Returns 0 if missing. */
function getApiAssists(p) {
  const v = p.api_assists;
  if (v == null) return 0;
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return isNaN(n) ? 0 : n;
}

function getFmCa(p) {
  if (typeof p.fm_ca === "number") return p.fm_ca;
  if (typeof p.fmi_ca === "number") return p.fmi_ca;
  return null;
}

/**
 * @param {Object} p - Player object
 * @param {string} profileType
 * @param {number} valEuro
 * @param {number|null} ageNum
 * @param {number} leagueTier
 * @param {Object} [paramsOverrides] - Optional overrides from ScoutAgentSkills (e.g. { minMinutes90s: 8 })
 */
function matchesProfile(p, profileType, valEuro, ageNum, leagueTier, paramsOverrides = {}) {
  const minutes90s = getMinutes90s(p);
  const minMinutes90s = paramsOverrides.minMinutes90s;
  const currentYear = new Date().getFullYear();

  switch (profileType) {
    case "HIGH_VALUE_BENCHED":
      // Benched = few minutes (< ~10 full games). If minutes missing/0, skip (don't assume benched).
      if (minutes90s <= 0) return false;
      return valEuro >= 800_000 && valEuro <= 3_000_000 && ageNum != null && ageNum <= 30 && minutes90s < 10;
    case "LOW_VALUE_STARTER": {
      const min = minMinutes90s ?? 5;
      return valEuro <= 500_000 && valEuro > 0 && ageNum != null && ageNum <= 28 && minutes90s >= min;
    }
    case "YOUNG_STRIKER_HOT": {
      const pos = (p.position || "").toLowerCase();
      const isStriker = pos.includes("forward") || pos.includes("striker") || pos === "cf" || pos === "ss";
      const min = minMinutes90s ?? 3;
      return valEuro <= 1_000_000 && ageNum != null && ageNum <= 21 && isStriker && minutes90s >= min;
    }
    case "CONTRACT_EXPIRING": {
      // Dynamic: contract expires this year or next year (not hardcoded to 2025!)
      const contractYear = parseContractYear(p.contract);
      if (contractYear == null) return false;
      return valEuro <= 2_500_000 && (contractYear === currentYear || contractYear === currentYear + 1);
    }
    case "HIDDEN_GEM": {
      const fmPa = getFmPa(p);
      // Require real FM data — null FM is NOT a gem, it's unknown
      if (fmPa == null) return false;
      return valEuro <= 1_500_000 && ageNum != null && ageNum <= 24 && fmPa >= 130;
    }
    case "LOWER_LEAGUE_RISER": {
      if (valEuro > 1_000_000 || ageNum == null || ageNum > 23 || leagueTier < 2) return false;
      // Require minimum performance evidence — don't tag randoms as risers
      const min90s = getMinutes90s(p);
      const ga = getApiGoals(p) + getApiAssists(p);
      return min90s >= 3 || ga >= 2;
    }
    case "BREAKOUT_SEASON": {
      // High goal/assist output relative to age and value = breakout performance
      if (ageNum == null || ageNum > 25) return false;
      if (valEuro > 2_000_000) return false;
      const goals = getApiGoals(p);
      const assists = getApiAssists(p);
      const contributions = goals + assists;
      const min = minMinutes90s ?? 8;
      if (minutes90s < min) return false;
      // Attackers: 8+ G+A; Midfielders/others: 5+ G+A
      const pos = (p.position || "").toLowerCase();
      const isAttacker = pos.includes("forward") || pos.includes("wing") || pos.includes("striker") || pos === "cf" || pos === "ss" || pos === "lw" || pos === "rw";
      return isAttacker ? contributions >= 8 : contributions >= 5;
    }
    case "UNDERVALUED_BY_FM": {
      // FM thinks they're great (PA >= 140) but market value is very low
      const fmPa = getFmPa(p);
      const fmCa = getFmCa(p);
      if (fmPa == null || fmPa < 140) return false;
      if (valEuro > 1_000_000) return false;
      if (ageNum == null || ageNum > 26) return false;
      // Bonus: CA is already decent (player is performing, not just potential)
      if (fmCa != null && fmCa >= 120) return true;
      // Even without CA, high PA + low value is interesting
      return true;
    }
    default:
      return false;
  }
}

function formatValue(valEuro) {
  if (!valEuro || valEuro <= 0) return "€0";
  if (valEuro >= 1_000_000) return `€${(valEuro / 1_000_000).toFixed(valEuro % 1_000_000 === 0 ? 0 : 1)}M`;
  return `€${Math.round(valEuro / 1_000)}k`;
}

function buildMatchReason(p, profileType, valEuro, ageNum) {
  const parts = [];
  if (valEuro > 0) parts.push(`${formatValue(valEuro)} value`);
  if (ageNum != null) parts.push(`age ${ageNum}`);
  const fmPa = getFmPa(p);
  const fmCa = getFmCa(p);
  if (fmPa != null) parts.push(`FM PA ${fmPa}`);
  if (fmCa != null && fmCa > 0) parts.push(`CA ${fmCa}`);
  const league = p.league || "";
  if (league) parts.push(league);
  const goals = getApiGoals(p);
  const assists = getApiAssists(p);
  if (goals > 0 || assists > 0) parts.push(`${goals}G ${assists}A`);
  const minutes90s = getMinutes90s(p);
  if (minutes90s > 0) parts.push(`${minutes90s.toFixed(1)} 90s`);
  const contractYear = parseContractYear(p.contract);
  if (contractYear != null && profileType === "CONTRACT_EXPIRING") {
    parts.push(`contract → ${contractYear}`);
  }
  return parts.join(" · ") || "Matches profile criteria";
}

/**
 * Compute a real match score (0-100) based on how strongly the player
 * matches the profile criteria. Higher = stronger match / more interesting.
 */
function computeMatchScore(p, profileType, valEuro, ageNum) {
  let score = 50; // Base
  const fmPa = getFmPa(p);
  const fmCa = getFmCa(p);
  const minutes90s = getMinutes90s(p);
  const goals = getApiGoals(p);
  const assists = getApiAssists(p);

  switch (profileType) {
    case "HIGH_VALUE_BENCHED":
      // Higher value + fewer minutes = stronger signal
      if (valEuro >= 2_000_000) score += 15;
      else if (valEuro >= 1_500_000) score += 10;
      if (minutes90s < 3) score += 10; // Very few minutes
      if (fmPa != null && fmPa >= 130) score += 10;
      break;
    case "LOW_VALUE_STARTER":
      if (minutes90s >= 15) score += 15;
      else if (minutes90s >= 10) score += 10;
      if (goals + assists >= 5) score += 10;
      if (fmPa != null && fmPa >= 120) score += 10;
      if (ageNum != null && ageNum <= 23) score += 5;
      break;
    case "YOUNG_STRIKER_HOT":
      if (goals >= 8) score += 20;
      else if (goals >= 5) score += 10;
      if (ageNum != null && ageNum <= 19) score += 10;
      if (fmPa != null && fmPa >= 140) score += 10;
      break;
    case "CONTRACT_EXPIRING": {
      const yr = parseContractYear(p.contract);
      const currentYear = new Date().getFullYear();
      if (yr === currentYear) score += 20; // Expires THIS year = free agent soon
      else if (yr === currentYear + 1) score += 10; // Next year = negotiation window open
      if (fmPa != null && fmPa >= 130) score += 10;
      if (minutes90s >= 10) score += 5; // Proven starter
      break;
    }
    case "HIDDEN_GEM":
      if (fmPa != null && fmPa >= 150) score += 20;
      else if (fmPa != null && fmPa >= 140) score += 15;
      else if (fmPa != null && fmPa >= 130) score += 10;
      if (valEuro <= 500_000) score += 10; // Very cheap
      if (ageNum != null && ageNum <= 20) score += 5;
      break;
    case "LOWER_LEAGUE_RISER":
      if (goals + assists >= 5) score += 10;
      if (fmPa != null && fmPa >= 130) score += 15;
      if (ageNum != null && ageNum <= 20) score += 5;
      if (minutes90s >= 10) score += 5;
      break;
    case "BREAKOUT_SEASON":
      if (goals + assists >= 12) score += 20;
      else if (goals + assists >= 8) score += 10;
      if (ageNum != null && ageNum <= 21) score += 10;
      if (fmPa != null && fmPa >= 130) score += 5;
      break;
    case "UNDERVALUED_BY_FM":
      if (fmPa != null && fmPa >= 160) score += 20;
      else if (fmPa != null && fmPa >= 150) score += 15;
      if (fmCa != null && fmCa >= 130) score += 10; // Already performing
      if (valEuro <= 300_000) score += 10; // Extremely cheap
      break;
  }

  // Universal bonuses
  if (fmPa != null && fmCa != null && fmPa - fmCa >= 20) score += 5; // High growth room
  // Performance-based bonuses (especially valuable after TM enrichment fills empty stats data)
  if (minutes90s >= 15) score += 5; // Regular starter = proven durability
  if (minutes90s >= 8 && (goals + assists) >= 8) score += 5; // Productive output
  if (ageNum != null && ageNum <= 22 && valEuro <= 500_000) score += 5; // Young + cheap = high value arc

  // Data quality penalties — profiles without real data should score lower
  // CONTRACT_EXPIRING has signal from contract alone — lighter penalty
  if (fmPa == null && minutes90s <= 0) {
    score -= (profileType === "CONTRACT_EXPIRING") ? 5 : 15;
  } else if (fmPa == null) score -= 8; // No FM data = can't assess ceiling
  else if (minutes90s <= 0) score -= 8; // No performance data = unverified

  return Math.min(100, Math.max(0, score));
}

const SORT_OPTIONS = ["score", "market_value", "age"];

/**
 * Fetch from recruitment API. Returns { results, mode, enrichedWithStats }.
 * mode="legacy" means stats data is broken — only TM profile data available.
 */
async function fetchRecruitment(params) {
  const search = new URLSearchParams(params);
  if (!search.has("value_max")) search.set("value_max", String(LIGAT_HAAL_VALUE_MAX));
  search.set("limit", "100");
  search.set("sort_by", params.sort_by || "score");
  search.set("lang", "en");

  const url = `${getScoutBaseUrl()}/recruitment?${search.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) return { results: [], mode: "error", enrichedWithStats: 0 };
  const data = await res.json().catch(() => ({}));
  return {
    results: data.results || [],
    mode: data.mode || "unknown",
    enrichedWithStats: data.enriched_with_stats ?? -1,
  };
}

function normalizePlayerUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().toLowerCase().replace(/\/$/, "");
}

/** SHA-256 based URL hash — avoids base64 prefix collisions for same-domain URLs. */
function hashPlayerUrl(url) {
  return crypto.createHash("sha256").update(url).digest("base64url").slice(0, 40);
}

/**
 * Run the AI Scout Agent Network.
 * Fetches players from recruitment API, assigns to agents, matches profiles, writes to Firestore.
 */
async function runScoutAgent() {
  const db = getFirestore();
  const profilesRef = db.collection("ScoutProfiles");
  const runsRef = db.collection("ScoutAgentRuns");
  const skillsRef = db.collection("ScoutAgentSkills");

  const startTime = Date.now();
  const seen = new Map();
  const profilesToWrite = [];
  let leaguesScanned = 0;

  // Track unmatched promising candidates for post-sweep TM enrichment
  const unmatchedCandidates = new Map(); // normalizedUrl -> { p, agentId, valEuro, ageNum, league, leagueTier, agentParams }

  // Load skill params for each agent (used to override profile matching)
  const paramsByAgent = {};
  const skillSnaps = await Promise.all(AGENT_IDS.map((id) => skillsRef.doc(id).get()));
  for (let i = 0; i < AGENT_IDS.length; i++) {
    const data = skillSnaps[i]?.data();
    const paramsJson = (data?.paramsJson || "{}").trim();
    try {
      paramsByAgent[AGENT_IDS[i]] = JSON.parse(paramsJson) || {};
    } catch {
      paramsByAgent[AGENT_IDS[i]] = {};
    }
  }

  // Exclude players already shown in last 4 days (ScoutProfiles + Shortlist)
  const EXCLUDE_DAYS = 4;
  const cutoff = startTime - EXCLUDE_DAYS * 24 * 60 * 60 * 1000;
  const excludeUrls = new Set();
  const recentProfiles = await profilesRef.where("lastRefreshedAt", ">=", cutoff).get();
  for (const doc of recentProfiles.docs) {
    const u = doc.data().tmProfileUrl;
    if (u) excludeUrls.add(normalizePlayerUrl(u));
  }
  const shortlistSnap = await db.collection("Shortlists").get();
  for (const d of shortlistSnap.docs) {
    const e = d.data();
    const u = e.tmProfileUrl;
    if (u && (e.addedAt || 0) >= cutoff) excludeUrls.add(normalizePlayerUrl(u));
  }
  console.log(`[ScoutAgent] Excluding ${excludeUrls.size} already-shown URLs`);

  // Exclude profiles thumbs-downed by users — block the ENTIRE player (all profile types)
  // DocId format: agentId_<40-char-urlHash>_profileType — agentIds have no underscores
  const rejectedProfileIds = new Set();
  const rejectedUrlHashes = new Set();
  const feedbackSnap = await db.collection("ScoutProfileFeedback").get();
  for (const doc of feedbackSnap.docs) {
    const fb = doc.data().feedback || {};
    for (const [profileId, val] of Object.entries(fb)) {
      const f = typeof val === "object" && val?.feedback ? val.feedback : val;
      if (f === "down") {
        rejectedProfileIds.add(profileId);
        // Extract URL hash from docId (format: agentId_urlHash_profileType)
        // to block ALL profile types for the same player URL.
        const firstUnderscore = profileId.indexOf("_");
        const lastUnderscore = profileId.lastIndexOf("_");
        if (firstUnderscore >= 0 && lastUnderscore > firstUnderscore) {
          const hash = profileId.substring(firstUnderscore + 1, lastUnderscore);
          if (hash.length >= 20) rejectedUrlHashes.add(hash);
        }
      }
    }
  }
  console.log(`[ScoutAgent] Excluding ${rejectedProfileIds.size} thumbs-downed profiles (${rejectedUrlHashes.size} unique player URL hashes)`);

  // Randomize sort_by each run for maximum diversity
  const sortBy = SORT_OPTIONS[Math.floor(Math.random() * SORT_OPTIONS.length)];
  console.log(`[ScoutAgent] Using sort_by=${sortBy}`);

  // ═══════════════════════════════════════════════════════════════
  // Warm up scout server (Render free tier sleeps after 15 min idle)
  // ═══════════════════════════════════════════════════════════════
  let isLegacyMode = false;
  try {
    console.log("[ScoutAgent] Warming up scout server...");
    const warmRes = await fetch(`${getScoutBaseUrl()}/recruitment?position=CF&age_max=25&limit=1&lang=en`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(120000), // 2 min for cold start
    });
    if (warmRes.ok) {
      const warmData = await warmRes.json().catch(() => ({}));
      isLegacyMode = warmData.mode === "legacy" || warmData.enriched_with_stats === 0;
      console.log(`[ScoutAgent] Scout server warm: mode=${warmData.mode}, stats_enriched=${warmData.enriched_with_stats}, legacy=${isLegacyMode}`);
      if (isLegacyMode) {
        console.warn("[ScoutAgent] ⚠ LEGACY MODE — Scout server has NO stats data. Two-phase TM enrichment will be primary data source.");
      }
    } else {
      console.warn(`[ScoutAgent] Scout server warmup HTTP ${warmRes.status} — proceeding anyway`);
    }
  } catch (warmErr) {
    console.warn(`[ScoutAgent] Scout server warmup failed: ${warmErr.message} — proceeding anyway`);
  }

  console.log("[ScoutAgent] Starting AI Scout Agent Network run");

  for (const pos of POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const recruitResult = await fetchRecruitment({
        position: pos,
        age_max: String(MAX_AGE),
        sort_by: sortBy,
      });
      const results = recruitResult.results;
      // Update legacy mode from actual data responses
      if (recruitResult.mode === "legacy" || recruitResult.enrichedWithStats === 0) isLegacyMode = true;
      leaguesScanned += 1;

      for (const p of results) {
        const url = (p.url || "").trim();
        if (!url) continue;
        if (excludeUrls.has(normalizePlayerUrl(url))) continue;

        const valEuro = parseMarketValue(p.market_value);
        if (valEuro > LIGAT_HAAL_VALUE_MAX) continue;

        const agentId = leagueToAgent(p.league);
        if (!agentId || !AGENT_IDS.includes(agentId)) continue;
        if (shouldSkipByNationality(agentId, p.citizenship)) continue;

        const ageNum = parseAge(p.age);
        if (ageNum != null && ageNum > MAX_AGE) continue; // Hard age cap
        const league = (p.league || "").trim();
        const lc = league.toLowerCase();
        const leagueTier = lc.includes("national") || lc.includes("3. liga") ? 3
          : lc.includes("2") || lc.includes("second") ? 2
          : 1;

        const agentParams = paramsByAgent[agentId] || {};

        let matchedAnyProfile = false;
        for (const profileType of [
          "HIGH_VALUE_BENCHED",
          "LOW_VALUE_STARTER",
          "YOUNG_STRIKER_HOT",
          "CONTRACT_EXPIRING",
          "HIDDEN_GEM",
          "LOWER_LEAGUE_RISER",
          "BREAKOUT_SEASON",
          "UNDERVALUED_BY_FM",
        ]) {
          const profileOverrides = agentParams[profileType] || {};
          if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier, profileOverrides)) continue;
          matchedAnyProfile = true;

          const urlHash = hashPlayerUrl(url);
          if (rejectedUrlHashes.has(urlHash)) continue;
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          if (rejectedProfileIds.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
          const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
          const now = Date.now();

          // Per-90 stats for Sport Director evaluation
          const apiMinutes90s = getMinutes90s(p);
          const apiGoals = getApiGoals(p);
          const apiAssists = getApiAssists(p);
          const goalsPer90 = apiMinutes90s > 0 ? apiGoals / apiMinutes90s : 0;
          const contribPer90 = apiMinutes90s > 0 ? (apiGoals + apiAssists) / apiMinutes90s : 0;

          profilesToWrite.push({
            docId,
            data: {
              tmProfileUrl: url,
              agentId,
              profileType,
              playerName: (p.name || "").trim() || "Unknown",
              profileImage: (p.profile_image || "").trim() || null,
              age: ageNum ?? 0,
              position: (p.position || "").trim() || "",
              marketValue: (p.market_value || "").trim() || "",
              marketValueEuro: valEuro,
              club: (p.club || "").trim() || "",
              league: league || "",
              leagueTier,
              nationality: (p.citizenship || "").trim() || null,
              matchReason,
              matchScore,
              fmPa: getFmPa(p) ?? null,
              fmCa: p.fm_ca ?? p.fmi_ca ?? null,
              contractExpires: (p.contract || "").trim() || null,
              apiMinutes90s,
              apiRating: typeof p.api_rating === "number" ? Math.round(p.api_rating * 100) / 100 : null,
              apiGoals,
              apiAssists,
              goalsPer90: Math.round(goalsPer90 * 100) / 100,
              contribPer90: Math.round(contribPer90 * 100) / 100,
              discoveredAt: now,
              lastRefreshedAt: now,
            },
          });
        }

        // Track unmatched promising candidates for post-sweep TM enrichment.
        // In legacy mode (no stats from scout server), track ALL unmatched players
        // regardless of whether they have minutes — they ALL need TM enrichment.
        const shouldTrackUnmatched = !matchedAnyProfile && ageNum != null && valEuro > 0 &&
          (isLegacyMode ? ageNum <= MAX_AGE : (getMinutes90s(p) <= 0 && ageNum <= 28));
        if (shouldTrackUnmatched) {
          const normUrl = normalizePlayerUrl(url);
          if (!unmatchedCandidates.has(normUrl) && !rejectedUrlHashes.has(hashPlayerUrl(url))) {
            unmatchedCandidates.set(normUrl, { p, agentId, valEuro, ageNum, league, leagueTier, agentParams });
          }
        }
      }
    } catch (err) {
      console.error(`[ScoutAgent] Recruitment error for ${pos}:`, err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Diversity pass — second main sweep with a DIFFERENT sort to discover
  // players that didn't appear in the first pass.
  // ═══════════════════════════════════════════════════════════════
  const DIVERSITY_POSITIONS = ["CF", "AM", "CM", "CB", "DM", "LW", "RW", "LB", "RB"];
  const altSort = sortBy === "age" ? "score" : "age";
  let diversityFound = 0;
  for (const pos of DIVERSITY_POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const recruitResult = await fetchRecruitment({
        position: pos,
        age_max: String(MAX_AGE),
        sort_by: altSort,
      });
      const results = recruitResult.results;
      for (const p of results) {
        const url = (p.url || "").trim();
        if (!url) continue;
        if (excludeUrls.has(normalizePlayerUrl(url))) continue;

        const valEuro = parseMarketValue(p.market_value);
        if (valEuro > LIGAT_HAAL_VALUE_MAX) continue;

        const agentId = leagueToAgent(p.league);
        if (!agentId || !AGENT_IDS.includes(agentId)) continue;
        if (shouldSkipByNationality(agentId, p.citizenship)) continue;

        const ageNum = parseAge(p.age);
        if (ageNum != null && ageNum > MAX_AGE) continue;
        const league = (p.league || "").trim();
        const lc = league.toLowerCase();
        const leagueTier = lc.includes("national") || lc.includes("3. liga") ? 3
          : lc.includes("2") || lc.includes("second") ? 2
          : 1;

        const agentParams = paramsByAgent[agentId] || {};

        for (const profileType of [
          "HIGH_VALUE_BENCHED", "LOW_VALUE_STARTER", "YOUNG_STRIKER_HOT",
          "CONTRACT_EXPIRING", "HIDDEN_GEM", "LOWER_LEAGUE_RISER",
          "BREAKOUT_SEASON", "UNDERVALUED_BY_FM",
        ]) {
          const profileOverrides = agentParams[profileType] || {};
          if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier, profileOverrides)) continue;

          const urlHash = hashPlayerUrl(url);
          if (rejectedUrlHashes.has(urlHash)) continue;
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          if (rejectedProfileIds.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
          const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
          const now = Date.now();

          const apiMinutes90s = getMinutes90s(p);
          const apiGoals = getApiGoals(p);
          const apiAssists = getApiAssists(p);
          const goalsPer90 = apiMinutes90s > 0 ? apiGoals / apiMinutes90s : 0;
          const contribPer90 = apiMinutes90s > 0 ? (apiGoals + apiAssists) / apiMinutes90s : 0;

          diversityFound++;
          profilesToWrite.push({
            docId,
            data: {
              tmProfileUrl: url,
              agentId,
              profileType,
              playerName: (p.name || "").trim() || "Unknown",
              profileImage: (p.profile_image || "").trim() || null,
              age: ageNum ?? 0,
              position: (p.position || "").trim() || "",
              marketValue: (p.market_value || "").trim() || "",
              marketValueEuro: valEuro,
              club: (p.club || "").trim() || "",
              league: league || "",
              leagueTier,
              nationality: (p.citizenship || "").trim() || null,
              matchReason,
              matchScore,
              fmPa: getFmPa(p) ?? null,
              fmCa: p.fm_ca ?? p.fmi_ca ?? null,
              contractExpires: (p.contract || "").trim() || null,
              apiMinutes90s,
              apiRating: typeof p.api_rating === "number" ? Math.round(p.api_rating * 100) / 100 : null,
              apiGoals,
              apiAssists,
              goalsPer90: Math.round(goalsPer90 * 100) / 100,
              contribPer90: Math.round(contribPer90 * 100) / 100,
              discoveredAt: now,
              lastRefreshedAt: now,
            },
          });
        }

        // Track unmatched for two-phase enrichment (diversity sweep)
        if (diversityFound === 0 || true) {
          let matchedAny = false;
          for (const pt of ["HIGH_VALUE_BENCHED","LOW_VALUE_STARTER","YOUNG_STRIKER_HOT","CONTRACT_EXPIRING","HIDDEN_GEM","LOWER_LEAGUE_RISER","BREAKOUT_SEASON","UNDERVALUED_BY_FM"]) {
            if (matchesProfile(p, pt, valEuro, ageNum, leagueTier, (agentParams[pt] || {}))) { matchedAny = true; break; }
          }
          if (!matchedAny && ageNum != null && valEuro > 0 && (isLegacyMode ? ageNum <= MAX_AGE : (getMinutes90s(p) <= 0 && ageNum <= 28))) {
            const normUrl = normalizePlayerUrl(url);
            if (!unmatchedCandidates.has(normUrl) && !rejectedUrlHashes.has(hashPlayerUrl(url))) {
              unmatchedCandidates.set(normUrl, { p, agentId, valEuro, ageNum, league, leagueTier, agentParams });
            }
          }
        }
      }
    } catch (err) {
      console.error(`[ScoutAgent] Diversity sweep error for ${pos}:`, err.message);
    }
  }
  console.log(`[ScoutAgent] Diversity sweep (sort_by=${altSort}) found ${diversityFound} additional profiles`);

  // ═══════════════════════════════════════════════════════════════
  // Balkan sweep — dedicated low-value pass for underrepresented markets
  // These leagues rarely surface in the global top-30, so we run extra
  // queries with lower value caps to give Balkan agents proper coverage.
  // ═══════════════════════════════════════════════════════════════
  const BALKAN_POSITIONS = ["CF", "AM", "CM", "CB", "LW", "RW"];
  const BALKAN_VALUE_MAX = 800_000;
  let balkanFound = 0;
  for (const pos of BALKAN_POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const recruitResult = await fetchRecruitment({
        position: pos,
        age_max: "26",
        sort_by: "score",
        value_max: String(BALKAN_VALUE_MAX),
      });
      const results = recruitResult.results;
      for (const p of results) {
        const url = (p.url || "").trim();
        if (!url) continue;
        if (excludeUrls.has(normalizePlayerUrl(url))) continue;

        const valEuro = parseMarketValue(p.market_value);
        if (valEuro > BALKAN_VALUE_MAX) continue;

        const agentId = leagueToAgent(p.league);
        if (!agentId) continue;
        // Only keep profiles for Balkan agents in this sweep
        const BALKAN_AGENTS = new Set(["serbia", "croatia", "slovenia", "bosnia", "macedonia", "montenegro", "kosovo", "bulgaria", "romania", "hungary"]);
        if (!BALKAN_AGENTS.has(agentId)) continue;

        const ageNum = parseAge(p.age);
        if (ageNum != null && ageNum > MAX_AGE) continue; // Hard age cap
        const league = (p.league || "").trim();
        const lc = league.toLowerCase();
        const leagueTier = lc.includes("national") || lc.includes("3. liga") ? 3
          : lc.includes("2") || lc.includes("second") ? 2
          : 1;

        const agentParams = paramsByAgent[agentId] || {};

        for (const profileType of [
          "LOW_VALUE_STARTER", "YOUNG_STRIKER_HOT", "CONTRACT_EXPIRING",
          "HIDDEN_GEM", "LOWER_LEAGUE_RISER", "BREAKOUT_SEASON", "UNDERVALUED_BY_FM",
        ]) {
          const profileOverrides = agentParams[profileType] || {};
          if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier, profileOverrides)) continue;

          const urlHash = hashPlayerUrl(url);
          if (rejectedUrlHashes.has(urlHash)) continue;
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          if (rejectedProfileIds.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
          const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
          const now = Date.now();

          const apiMinutes90s = getMinutes90s(p);
          const apiGoals = getApiGoals(p);
          const apiAssists = getApiAssists(p);
          const goalsPer90 = apiMinutes90s > 0 ? apiGoals / apiMinutes90s : 0;
          const contribPer90 = apiMinutes90s > 0 ? (apiGoals + apiAssists) / apiMinutes90s : 0;

          profilesToWrite.push({
            docId,
            data: {
              tmProfileUrl: url,
              agentId,
              profileType,
              playerName: (p.name || "").trim() || "Unknown",
              profileImage: (p.profile_image || "").trim() || null,
              age: ageNum ?? 0,
              position: (p.position || "").trim() || "",
              marketValue: (p.market_value || "").trim() || "",
              marketValueEuro: valEuro,
              club: (p.club || "").trim() || "",
              league: league || "",
              leagueTier,
              nationality: (p.citizenship || "").trim() || null,
              matchReason,
              matchScore,
              fmPa: getFmPa(p) ?? null,
              fmCa: p.fm_ca ?? p.fmi_ca ?? null,
              contractExpires: (p.contract || "").trim() || null,
              apiMinutes90s,
              apiRating: typeof p.api_rating === "number" ? Math.round(p.api_rating * 100) / 100 : null,
              apiGoals,
              apiAssists,
              goalsPer90: Math.round(goalsPer90 * 100) / 100,
              contribPer90: Math.round(contribPer90 * 100) / 100,
              discoveredAt: now,
              lastRefreshedAt: now,
            },
          });
          balkanFound++;
        }
      }
    } catch (err) {
      console.error(`[ScoutAgent] Balkan sweep error for ${pos}:`, err.message);
    }
  }
  if (balkanFound > 0) {
    console.log(`[ScoutAgent] Balkan sweep found ${balkanFound} additional profiles`);
  }

  // ═══════════════════════════════════════════════════════════════
  // South American sweep — dedicated pass for underrepresented SA markets
  // Brazil, Chile, Uruguay, Ecuador, Peru barely surface in global top results.
  // ═══════════════════════════════════════════════════════════════
  const SA_POSITIONS = ["CF", "AM", "CM", "CB", "LW", "RW", "DM"];
  const SA_VALUE_MAX = 1_500_000;
  const SA_AGENTS = new Set(["brazil", "argentina", "colombia", "chile", "uruguay", "ecuador", "peru", "mexico"]);
  let saFound = 0;
  for (const pos of SA_POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const recruitResult = await fetchRecruitment({
        position: pos,
        age_max: "26",
        sort_by: "score",
        value_max: String(SA_VALUE_MAX),
      });
      const results = recruitResult.results;
      for (const p of results) {
        const url = (p.url || "").trim();
        if (!url) continue;
        if (excludeUrls.has(normalizePlayerUrl(url))) continue;

        const valEuro = parseMarketValue(p.market_value);
        if (valEuro > SA_VALUE_MAX) continue;

        const agentId = leagueToAgent(p.league);
        if (!agentId) continue;
        if (!SA_AGENTS.has(agentId)) continue;

        const ageNum = parseAge(p.age);
        if (ageNum != null && ageNum > MAX_AGE) continue;
        const league = (p.league || "").trim();
        const lc = league.toLowerCase();
        const leagueTier = lc.includes("national") || lc.includes("3. liga") ? 3
          : lc.includes("2") || lc.includes("second") ? 2
          : 1;

        const agentParams = paramsByAgent[agentId] || {};

        for (const profileType of [
          "LOW_VALUE_STARTER", "YOUNG_STRIKER_HOT", "CONTRACT_EXPIRING",
          "HIDDEN_GEM", "LOWER_LEAGUE_RISER", "BREAKOUT_SEASON", "UNDERVALUED_BY_FM",
        ]) {
          const profileOverrides = agentParams[profileType] || {};
          if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier, profileOverrides)) continue;

          const urlHash = hashPlayerUrl(url);
          if (rejectedUrlHashes.has(urlHash)) continue;
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          if (rejectedProfileIds.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
          const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
          const now = Date.now();

          const apiMinutes90s = getMinutes90s(p);
          const apiGoals = getApiGoals(p);
          const apiAssists = getApiAssists(p);
          const goalsPer90 = apiMinutes90s > 0 ? apiGoals / apiMinutes90s : 0;
          const contribPer90 = apiMinutes90s > 0 ? (apiGoals + apiAssists) / apiMinutes90s : 0;

          profilesToWrite.push({
            docId,
            data: {
              tmProfileUrl: url,
              agentId,
              profileType,
              playerName: (p.name || "").trim() || "Unknown",
              profileImage: (p.profile_image || "").trim() || null,
              age: ageNum ?? 0,
              position: (p.position || "").trim() || "",
              marketValue: (p.market_value || "").trim() || "",
              marketValueEuro: valEuro,
              club: (p.club || "").trim() || "",
              league: league || "",
              leagueTier,
              nationality: (p.citizenship || "").trim() || null,
              matchReason,
              matchScore,
              fmPa: getFmPa(p) ?? null,
              fmCa: p.fm_ca ?? p.fmi_ca ?? null,
              contractExpires: (p.contract || "").trim() || null,
              apiMinutes90s,
              apiRating: typeof p.api_rating === "number" ? Math.round(p.api_rating * 100) / 100 : null,
              apiGoals,
              apiAssists,
              goalsPer90: Math.round(goalsPer90 * 100) / 100,
              contribPer90: Math.round(contribPer90 * 100) / 100,
              discoveredAt: now,
              lastRefreshedAt: now,
            },
          });
          saFound++;
        }
      }
    } catch (err) {
      console.error(`[ScoutAgent] SA sweep error for ${pos}:`, err.message);
    }
  }
  if (saFound > 0) {
    console.log(`[ScoutAgent] South American sweep found ${saFound} additional profiles`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Small European sweep — low-value pass for Cyprus, Bulgaria, Slovakia, etc.
  // ═══════════════════════════════════════════════════════════════
  const SMALL_EU_POSITIONS = ["CF", "AM", "CM", "CB", "LW", "RW"];
  const SMALL_EU_VALUE_MAX = 500_000;
  const SMALL_EU_AGENTS = new Set(["cyprus", "bulgaria", "slovenia", "slovakia", "czech", "bosnia", "macedonia", "montenegro", "kosovo", "azerbaijan", "kazakhstan", "morocco", "norway", "finland", "mexico"]);
  let smallEuFound = 0;
  for (const pos of SMALL_EU_POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const recruitResult = await fetchRecruitment({
        position: pos,
        age_max: "26",
        sort_by: "score",
        value_max: String(SMALL_EU_VALUE_MAX),
      });
      const results = recruitResult.results;
      for (const p of results) {
        const url = (p.url || "").trim();
        if (!url) continue;
        if (excludeUrls.has(normalizePlayerUrl(url))) continue;

        const valEuro = parseMarketValue(p.market_value);
        if (valEuro > SMALL_EU_VALUE_MAX) continue;

        const agentId = leagueToAgent(p.league);
        if (!agentId) continue;
        if (!SMALL_EU_AGENTS.has(agentId)) continue;

        const ageNum = parseAge(p.age);
        if (ageNum != null && ageNum > MAX_AGE) continue;
        const league = (p.league || "").trim();
        const lc = league.toLowerCase();
        const leagueTier = lc.includes("national") || lc.includes("3. liga") ? 3
          : lc.includes("2") || lc.includes("second") ? 2
          : 1;

        const agentParams = paramsByAgent[agentId] || {};

        for (const profileType of [
          "LOW_VALUE_STARTER", "YOUNG_STRIKER_HOT", "CONTRACT_EXPIRING",
          "HIDDEN_GEM", "LOWER_LEAGUE_RISER", "BREAKOUT_SEASON", "UNDERVALUED_BY_FM",
        ]) {
          const profileOverrides = agentParams[profileType] || {};
          if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier, profileOverrides)) continue;

          const urlHash = hashPlayerUrl(url);
          if (rejectedUrlHashes.has(urlHash)) continue;
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          if (rejectedProfileIds.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
          const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
          const now = Date.now();

          const apiMinutes90s = getMinutes90s(p);
          const apiGoals = getApiGoals(p);
          const apiAssists = getApiAssists(p);
          const goalsPer90 = apiMinutes90s > 0 ? apiGoals / apiMinutes90s : 0;
          const contribPer90 = apiMinutes90s > 0 ? (apiGoals + apiAssists) / apiMinutes90s : 0;

          profilesToWrite.push({
            docId,
            data: {
              tmProfileUrl: url,
              agentId,
              profileType,
              playerName: (p.name || "").trim() || "Unknown",
              profileImage: (p.profile_image || "").trim() || null,
              age: ageNum ?? 0,
              position: (p.position || "").trim() || "",
              marketValue: (p.market_value || "").trim() || "",
              marketValueEuro: valEuro,
              club: (p.club || "").trim() || "",
              league: league || "",
              leagueTier,
              nationality: (p.citizenship || "").trim() || null,
              matchReason,
              matchScore,
              fmPa: getFmPa(p) ?? null,
              fmCa: p.fm_ca ?? p.fmi_ca ?? null,
              contractExpires: (p.contract || "").trim() || null,
              apiMinutes90s,
              apiRating: typeof p.api_rating === "number" ? Math.round(p.api_rating * 100) / 100 : null,
              apiGoals,
              apiAssists,
              goalsPer90: Math.round(goalsPer90 * 100) / 100,
              contribPer90: Math.round(contribPer90 * 100) / 100,
              discoveredAt: now,
              lastRefreshedAt: now,
            },
          });
          smallEuFound++;
        }
      }
    } catch (err) {
      console.error(`[ScoutAgent] Small EU sweep error for ${pos}:`, err.message);
    }
  }
  if (smallEuFound > 0) {
    console.log(`[ScoutAgent] Small European sweep found ${smallEuFound} additional profiles`);
  }

  // ═══════════════════════════════════════════════════════════════
  // LIVE TM FALLBACK — for agents with 0 profiles after all sweeps,
  // scrape Transfermarkt league kader (squad) pages directly.
  // ═══════════════════════════════════════════════════════════════
  const agentsWithProfiles = new Map();
  for (const { data } of profilesToWrite) {
    agentsWithProfiles.set(data.agentId, (agentsWithProfiles.get(data.agentId) || 0) + 1);
  }

  // League URLs for live TM scraping — ALL agents covered
  const TM_LEAGUE_URLS = {
    // Europe — big leagues (2nd divisions for realistic targets)
    portugal: ["https://www.transfermarkt.com/liga-portugal/startseite/wettbewerb/PO1", "https://www.transfermarkt.com/liga-portugal-2/startseite/wettbewerb/PO2"],
    serbia: ["https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1"],
    poland: ["https://www.transfermarkt.com/pko-bp-ekstraklasa/startseite/wettbewerb/PL1"],
    greece: ["https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1"],
    belgium: ["https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1"],
    netherlands: ["https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1", "https://www.transfermarkt.com/eerste-divisie/startseite/wettbewerb/NL2"],
    turkey: ["https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1", "https://www.transfermarkt.com/1-lig/startseite/wettbewerb/TR2"],
    austria: ["https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1"],
    sweden: ["https://www.transfermarkt.com/allsvenskan/startseite/wettbewerb/SE1"],
    switzerland: ["https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1"],
    denmark: ["https://www.transfermarkt.com/superliga/startseite/wettbewerb/DK1"],
    romania: ["https://www.transfermarkt.com/superliga/startseite/wettbewerb/RO1"],
    ukraine: ["https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/UKR1"],
    england: ["https://www.transfermarkt.com/championship/startseite/wettbewerb/GB2"],
    germany: ["https://www.transfermarkt.com/2-bundesliga/startseite/wettbewerb/L2"],
    italy: ["https://www.transfermarkt.com/serie-b/startseite/wettbewerb/IT2"],
    spain: ["https://www.transfermarkt.com/laliga2/startseite/wettbewerb/ES2"],
    france: ["https://www.transfermarkt.com/ligue-2/startseite/wettbewerb/FR2"],
    scotland: ["https://www.transfermarkt.com/scottish-premiership/startseite/wettbewerb/SC1"],
    // Balkans & Eastern Europe
    croatia: ["https://www.transfermarkt.com/hnl/startseite/wettbewerb/KR1"],
    slovenia: ["https://www.transfermarkt.com/prvaliga/startseite/wettbewerb/SL1"],
    bosnia: ["https://www.transfermarkt.com/premier-liga-bosne-i-hercegovine/startseite/wettbewerb/BOS1"],
    macedonia: ["https://www.transfermarkt.com/prva-makedonska-fudbalska-liga/startseite/wettbewerb/MAZ1"],
    montenegro: ["https://www.transfermarkt.com/meridianbet-1-cfl/startseite/wettbewerb/MNE1"],
    kosovo: ["https://www.transfermarkt.com/superliga-e-kosoves/startseite/wettbewerb/KO1"],
    cyprus: ["https://www.transfermarkt.com/protathlima-cyta/startseite/wettbewerb/ZYP1"],
    slovakia: ["https://www.transfermarkt.com/nike-liga/startseite/wettbewerb/SLO1"],
    czech: ["https://www.transfermarkt.com/chance-liga/startseite/wettbewerb/TS1"],
    bulgaria: ["https://www.transfermarkt.com/parva-liga/startseite/wettbewerb/BU1"],
    hungary: ["https://www.transfermarkt.com/nemzeti-bajnoksag/startseite/wettbewerb/UNG1"],
    azerbaijan: ["https://www.transfermarkt.com/premyer-liqa/startseite/wettbewerb/AZ1"],
    kazakhstan: ["https://www.transfermarkt.com/premier-liga-kazakhstan/startseite/wettbewerb/KAS1"],
    // South America
    brazil: ["https://www.transfermarkt.com/campeonato-brasileiro-serie-a/startseite/wettbewerb/BRA1", "https://www.transfermarkt.com/campeonato-brasileiro-serie-b/startseite/wettbewerb/BRA2"],
    argentina: ["https://www.transfermarkt.com/superliga/startseite/wettbewerb/AR1N"],
    colombia: ["https://www.transfermarkt.com/liga-betplay-dimayor/startseite/wettbewerb/COLP"],
    chile: ["https://www.transfermarkt.com/campeonato-nacional/startseite/wettbewerb/CLPD"],
    uruguay: ["https://www.transfermarkt.com/primera-division/startseite/wettbewerb/URU1"],
    ecuador: ["https://www.transfermarkt.com/liga-pro-serie-a/startseite/wettbewerb/EC1N"],
    peru: ["https://www.transfermarkt.com/liga-1/startseite/wettbewerb/TDeA"],
    // Africa, Nordics, North America
    morocco: ["https://www.transfermarkt.com/botola-pro-inwi/startseite/wettbewerb/MAR1"],
    norway: ["https://www.transfermarkt.com/eliteserien/startseite/wettbewerb/NO1"],
    usa: ["https://www.transfermarkt.com/major-league-soccer/startseite/wettbewerb/MLS1"],
    finland: ["https://www.transfermarkt.com/veikkausliiga/startseite/wettbewerb/FI1"],
    mexico: ["https://www.transfermarkt.com/liga-mx/startseite/wettbewerb/MEX1"],
  };

  const TM_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  ];

  async function fetchTmHtml(url) {
    // Try Vercel proxy first (bypasses TM's Google Cloud IP block)
    const proxyUrl = process.env.SCOUT_TM_PROXY_URL;
    const proxySecret = process.env.SCOUT_ENRICH_SECRET;
    if (proxyUrl && proxySecret) {
      try {
        const proxyRes = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: proxySecret, url }),
          signal: AbortSignal.timeout(25000),
        });
        if (proxyRes.ok) return proxyRes.text();
        // Proxy returned error — fall through to direct fetch
      } catch { /* proxy failed — fall through */ }
    }
    // Direct fetch fallback (works locally, may fail on Cloud Functions)
    const ua = TM_USER_AGENTS[Math.floor(Math.random() * TM_USER_AGENTS.length)];
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  // Scrape a league's kader pages → array of player objects matching recruitment API shape
  async function scrapeLeaguePlayers(leagueUrl, agentId) {
    const cheerio = require("cheerio");
    const players = [];

    // Step 1: get club kader URLs from startseite
    const startHtml = await fetchTmHtml(leagueUrl);
    const $start = cheerio.load(startHtml);
    const kaderUrls = [];
    // TM uses multiple link patterns for clubs — try all of them
    const seenVereinIds = new Set();
    $start('a[href*="/verein/"]').each((_, el) => {
      let href = $start(el).attr("href") || "";
      if (!href) return;
      // Only club links (startseite or kader)
      if (!href.includes("/startseite/") && !href.includes("/kader/")) return;
      // Extract verein ID for deduplication
      const vereinMatch = href.match(/\/verein\/(\d+)/);
      if (!vereinMatch) return;
      const vereinId = vereinMatch[1];
      if (seenVereinIds.has(vereinId)) return;
      seenVereinIds.add(vereinId);
      // Strip saison_id and normalize to kader URL
      if (!href.startsWith("http")) href = "https://www.transfermarkt.com" + href;
      href = href.replace(/\/saison_id\/\d+/, "");
      href = href.replace("/startseite/", "/kader/");
      if (!href.includes("/plus/")) href += "/plus/1";
      kaderUrls.push(href);
    });

    if (kaderUrls.length === 0) return players;

    // Step 2: scrape up to 10 clubs (sufficient for candidate pool)
    const MAX_CLUBS = 10;
    for (const kaderUrl of kaderUrls.slice(0, MAX_CLUBS)) {
      await sleep(2000); // Respectful delay for TM
      try {
        const html = await fetchTmHtml(kaderUrl);
        const $ = cheerio.load(html);

        // Extract league name from page
        const leagueName = $('span.hauptlink a[href*="/wettbewerb/"]').first().text().trim()
          || $('div.dataName span').first().text().trim()
          || "";
        const clubName = $('header h1').text().trim()
          || $('div.dataName h1').text().trim()
          || "";

        $("table.items tbody tr.odd, table.items tbody tr.even").each((_, row) => {
          try {
            // ── Name & URL ──
            // /plus/1 layout: td.hauptlink contains the player name link directly
            // Regular layout: table.inline-table > td.hauptlink > a
            let nameEl = $(row).find("table.inline-table td.hauptlink a").first();
            if (!nameEl.length) nameEl = $(row).find("td.hauptlink a[href*='/profil/']").first();
            const name = nameEl.text().trim();
            const playerHref = nameEl.attr("href") || "";
            const playerUrl = playerHref.startsWith("http")
              ? playerHref
              : "https://www.transfermarkt.com" + playerHref;

            // ── Profile image ──
            const imgEl = $(row).find("table.inline-table img").first();
            let profileImage = "";
            if (imgEl.length) {
              profileImage = (imgEl.attr("data-src") || imgEl.attr("src") || "")
                .replace("small", "big").replace("medium", "big");
            }

            // ── Position ──
            // /plus/1: separate td after hauptlink; regular: inline-table second row
            let posText = $(row).find("table.inline-table tr").eq(1).text().trim().replace(/-/g, " ");
            if (!posText) {
              // In /plus/1 layout, position is the td right after the hauptlink name td
              const allTds = $(row).find("td");
              allTds.each((idx, td) => {
                const cls = $(td).attr("class") || "";
                if (cls.includes("hauptlink") && !posText) {
                  const nextTd = allTds.eq(idx + 1);
                  if (nextTd.length) posText = nextTd.text().trim().replace(/-/g, " ");
                }
              });
            }

            // ── Age ──
            // Regular: standalone "24" in td.zentriert
            // /plus/1: "08/02/2000 (26)" in td.zentriert — extract from parentheses
            let age = "";
            $(row).find("td.zentriert").each((_, td) => {
              const txt = $(td).text().trim();
              // Direct number match (regular kader)
              if (/^\d{1,2}$/.test(txt) && parseInt(txt) >= 15 && parseInt(txt) <= 45) {
                age = txt;
              }
              // Date + age format: "DD/MM/YYYY (age)" — /plus/1 pages
              const ageInParens = txt.match(/\((\d{1,2})\)/);
              if (ageInParens && parseInt(ageInParens[1]) >= 15 && parseInt(ageInParens[1]) <= 45) {
                age = ageInParens[1];
              }
            });

            // ── Market value ──
            // /plus/1: td with class "rechts hauptlink" contains "€3.00m"
            let marketValue = "";
            const rechtsHaupt = $(row).find("td.rechts.hauptlink").first();
            if (rechtsHaupt.length) {
              marketValue = rechtsHaupt.text().trim();
            } else {
              const rechts = $(row).find("td.rechts a").first();
              marketValue = rechts.length ? rechts.text().trim() : $(row).find("td.rechts").last().text().trim();
            }

            // ── Contract end ──
            // /plus/1: second-to-last td.zentriert typically has the contract end date
            let contract = "";
            const zentriertTds = $(row).find("td.zentriert");
            if (zentriertTds.length >= 2) {
              const lastZentriert = zentriertTds.eq(zentriertTds.length - 1).text().trim();
              // Contract dates look like "30/06/2027"
              if (/\d{2}\/\d{2}\/\d{4}/.test(lastZentriert)) {
                const parts = lastZentriert.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (parts) contract = `${parts[3]}`; // Just the year for contract parsing
              }
            }

            // ── Nationality ──
            const natImg = $(row).find("img.flaggenrahmen").first();
            const nationality = natImg.attr("title") || "";

            if (!name || !playerUrl.includes("/profil/")) return;

            players.push({
              name,
              url: playerUrl,
              profile_image: profileImage,
              position: convertTmPosition(posText),
              age,
              market_value: marketValue,
              club: clubName,
              league: leagueName || agentId,
              citizenship: nationality,
              contract,
              fm_pa: null,
              fm_ca: null,
              fmi_pa: null,
              fmi_ca: null,
              api_minutes_90s: null,
              api_goals: null,
              api_assists: null,
            });
          } catch {
            // skip row
          }
        });
      } catch (err) {
        console.error(`[ScoutAgent] TM kader scrape error: ${err.message}`);
      }
    }
    return players;
  }

  // Convert TM position text (e.g. "Centre Forward", "Left Winger") to short code
  function convertTmPosition(posText) {
    const p = (posText || "").toLowerCase();
    if (p.includes("goalkeeper") || p.includes("torwart")) return "GK";
    if (p.includes("centre-back") || p.includes("central defender") || p.includes("innenverteidiger")) return "CB";
    if (p.includes("left-back") || p.includes("left back") || p.includes("linker verteidiger")) return "LB";
    if (p.includes("right-back") || p.includes("right back") || p.includes("rechter verteidiger")) return "RB";
    if (p.includes("defensive midfield") || p.includes("defensives mittelfeld")) return "DM";
    if (p.includes("central midfield") || p.includes("zentrales mittelfeld")) return "CM";
    if (p.includes("attacking midfield") || p.includes("offensives mittelfeld")) return "AM";
    if (p.includes("left winger") || p.includes("linksaußen")) return "LW";
    if (p.includes("right winger") || p.includes("rechtsaußen")) return "RW";
    if (p.includes("second striker") || p.includes("hängende spitze")) return "SS";
    if (p.includes("centre-forward") || p.includes("centre forward") || p.includes("mittelstürmer")) return "CF";
    return posText || "";
  }

  // Run the fallback for agents with few profiles (< 5) that have TM league URLs
  const MIN_PROFILES_FOR_TM_FALLBACK = 5;
  const deadAgents = AGENT_IDS.filter((id) => (agentsWithProfiles.get(id) || 0) < MIN_PROFILES_FOR_TM_FALLBACK && TM_LEAGUE_URLS[id]);
  // Sort by proximity to target (agents needing fewest extra profiles first)
  deadAgents.sort((a, b) => (agentsWithProfiles.get(b) || 0) - (agentsWithProfiles.get(a) || 0));
  let tmFallbackFound = 0;
  if (deadAgents.length > 0) {
    console.log(`[ScoutAgent] Live TM fallback for ${deadAgents.length} agents below target: ${deadAgents.join(", ")}`);

    // Enrich TM-scraped players with real season stats from their leistungsdaten page.
    // Uses Vercel proxy when available (bypasses TM IP blocks on Cloud Functions).
    // Batched: 5 concurrent fetches, 1.5s between batches (same as Sport Director).
    async function enrichWithTmStats(players) {
      const ENRICH_BATCH = 5;
      const ENRICH_DELAY = 1500;
      let enriched = 0;
      for (let i = 0; i < players.length; i += ENRICH_BATCH) {
        if (i > 0) await sleep(ENRICH_DELAY);
        const batch = players.slice(i, i + ENRICH_BATCH);
        const results = await Promise.allSettled(
          batch.map(async (p) => {
            try {
              const stats = await fetchTmStatsWithProxy(p.url);
              if (stats && stats.minutes > 0) {
                p.api_minutes_90s = stats.minutes / 90;
                p.api_goals = stats.goals;
                p.api_assists = stats.assists;
                p._tmEnriched = true;
                enriched++;
              }
            } catch { /* skip — stats unavailable */ }
          })
        );
      }
      return enriched;
    }

    // Process a single agent's TM fallback
    async function processAgentTmFallback(agentId) {
      const currentCount = agentsWithProfiles.get(agentId) || 0;
      const needed = MIN_PROFILES_FOR_TM_FALLBACK - currentCount;

      for (const leagueUrl of TM_LEAGUE_URLS[agentId]) {
        try {
          const tmPlayers = await scrapeLeaguePlayers(leagueUrl, agentId);
          console.log(`[ScoutAgent] TM scraped ${tmPlayers.length} players for ${agentId}`);

          // Pre-filter candidates before enrichment (saves time)
          const candidates = [];
          for (const p of tmPlayers) {
            const url = (p.url || "").trim();
            if (!url) continue;
            if (excludeUrls.has(normalizePlayerUrl(url))) continue;
            const posCode = (p.position || "").trim().toUpperCase();
            if (posCode === "GK") continue;
            if (shouldSkipByNationality(agentId, p.citizenship)) continue;
            const valEuro = parseMarketValue(p.market_value);
            if (valEuro > LIGAT_HAAL_VALUE_MAX) continue;
            const ageNum = parseAge(p.age);
            if (ageNum != null && ageNum > MAX_AGE) continue;
            // Attach parsed values for reuse
            p._valEuro = valEuro;
            p._ageNum = ageNum;
            candidates.push(p);
          }
          if (candidates.length === 0) continue;

          // Enrich top candidates with real season stats from TM performance pages
          // Limit to 25 per league to keep runtime reasonable
          const toEnrich = candidates.slice(0, 25);
          const enrichCount = await enrichWithTmStats(toEnrich);
          console.log(`[ScoutAgent] TM enriched ${enrichCount}/${toEnrich.length} players with season stats for ${agentId}`);

          let agentFound = 0;
          for (const p of candidates) {
            const url = (p.url || "").trim();
            const valEuro = p._valEuro;
            const ageNum = p._ageNum;
            const league = (p.league || "").trim();
            const leagueTier = 2;
            const agentParams = paramsByAgent[agentId] || {};

            for (const profileType of ["HIDDEN_GEM", "LOWER_LEAGUE_RISER", "CONTRACT_EXPIRING", "LOW_VALUE_STARTER", "BREAKOUT_SEASON"]) {
              const profileOverrides = agentParams[profileType] || {};
              if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier, profileOverrides)) continue;

              const urlHash = hashPlayerUrl(url);
              if (rejectedUrlHashes.has(urlHash)) continue;
              const docId = `${agentId}_${urlHash}_${profileType}`;
              if (seen.has(docId)) continue;
              if (rejectedProfileIds.has(docId)) continue;
              seen.set(docId, true);

              const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
              const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
              const now = Date.now();

              const apiMinutes90s = getMinutes90s(p);
              const apiGoals = getApiGoals(p);
              const apiAssists = getApiAssists(p);
              const goalsPer90 = apiMinutes90s > 0 ? apiGoals / apiMinutes90s : 0;
              const contribPer90 = apiMinutes90s > 0 ? (apiGoals + apiAssists) / apiMinutes90s : 0;

              tmFallbackFound++;
              agentFound++;
              profilesToWrite.push({
                docId,
                data: {
                  tmProfileUrl: url,
                  agentId,
                  profileType,
                  playerName: (p.name || "").trim() || "Unknown",
                  profileImage: (p.profile_image || "").trim() || null,
                  age: ageNum ?? 0,
                  position: (p.position || "").trim() || "",
                  marketValue: (p.market_value || "").trim() || "",
                  marketValueEuro: valEuro,
                  club: (p.club || "").trim() || "",
                  league: league || "",
                  leagueTier,
                  nationality: (p.citizenship || "").trim() || null,
                  matchReason,
                  matchScore,
                  fmPa: getFmPa(p) ?? null,
                  fmCa: p.fm_ca ?? p.fmi_ca ?? null,
                  contractExpires: (p.contract || "").trim() || null,
                  apiMinutes90s,
              apiRating: typeof p.api_rating === "number" ? Math.round(p.api_rating * 100) / 100 : null,
                  apiGoals,
                  apiAssists,
                  goalsPer90: Math.round(goalsPer90 * 100) / 100,
                  contribPer90: Math.round(contribPer90 * 100) / 100,
                  source: p._tmEnriched ? "tm_enriched" : "tm_fallback",
                  discoveredAt: now,
                  lastRefreshedAt: now,
                },
              });
            }
          }
          if (agentFound === 0 && candidates.length > 0) {
            const s = candidates[0];
            console.log(`[ScoutAgent] TM ${agentId}: ${candidates.length} candidates but 0 matched — sample: age=${s._ageNum} val=${s._valEuro} pos=${s.position} minutes90s=${getMinutes90s(s)} contract=${s.contract}`);
          }
        } catch (err) {
          console.error(`[ScoutAgent] TM fallback error for ${agentId}: ${err.message}`);
        }
      }
    }

    // Process agents in parallel batches of 3 for speed
    const TM_PARALLEL = 3;
    for (let i = 0; i < deadAgents.length; i += TM_PARALLEL) {
      const batch = deadAgents.slice(i, i + TM_PARALLEL);
      await Promise.allSettled(batch.map((id) => processAgentTmFallback(id)));
    }
    console.log(`[ScoutAgent] Live TM fallback found ${tmFallbackFound} additional profiles`);
  }

  // Log agents that are still below target of 5 after all sweeps + fallback
  const MIN_TARGET = 5;
  const finalAgentCounts = new Map();
  for (const { data } of profilesToWrite) {
    finalAgentCounts.set(data.agentId, (finalAgentCounts.get(data.agentId) || 0) + 1);
  }
  const belowTarget = AGENT_IDS.filter((id) => (finalAgentCounts.get(id) || 0) < MIN_TARGET);
  if (belowTarget.length > 0) {
    console.log(`[ScoutAgent] BELOW_TARGET (< ${MIN_TARGET} profiles): ${belowTarget.map((id) => `${id}=${finalAgentCounts.get(id) || 0}`).join(", ")}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TWO-PHASE ENRICHMENT — unlock stats-dependent profiles
  // Players from the recruitment API that didn't match any profile type
  // because they lacked stats data. Enrich with TM stats via Vercel
  // proxy, then re-try all 8 profile types.
  // ═══════════════════════════════════════════════════════════════
  // In legacy mode, this is the PRIMARY data pipeline — increase cap significantly
  const MAX_UNMATCHED_ENRICH = isLegacyMode ? 500 : 200;
  // Sort by value descending — prioritize higher-value players for enrichment
  const unmatchedSorted = [...unmatchedCandidates.values()].sort((a, b) => b.valEuro - a.valEuro);
  const unmatchedList = unmatchedSorted.slice(0, MAX_UNMATCHED_ENRICH);
  let twoPhaseFound = 0;
  if (unmatchedList.length > 0) {
    console.log(`[ScoutAgent] Two-phase enrichment: ${unmatchedList.length} unmatched candidates (of ${unmatchedCandidates.size} total)`);

    const ENRICH_BATCH = 5;
    const ENRICH_DELAY = 1500;
    for (let i = 0; i < unmatchedList.length; i += ENRICH_BATCH) {
      if (i > 0) await sleep(ENRICH_DELAY);
      const batch = unmatchedList.slice(i, i + ENRICH_BATCH);
      await Promise.allSettled(
        batch.map(async (candidate) => {
          const { p, agentId, valEuro, ageNum, league, leagueTier, agentParams } = candidate;
          const url = (p.url || "").trim();
          try {
            const stats = await fetchTmStatsWithProxy(url);
            if (!stats || stats.minutes <= 0) return;

            // Inject TM stats into the player object
            p.api_minutes_90s = stats.minutes / 90;
            p.api_goals = stats.goals;
            p.api_assists = stats.assists;

            // Re-try all profile types with real stats
            for (const profileType of [
              "LOW_VALUE_STARTER", "YOUNG_STRIKER_HOT", "BREAKOUT_SEASON",
              "HIGH_VALUE_BENCHED", "HIDDEN_GEM", "LOWER_LEAGUE_RISER",
              "CONTRACT_EXPIRING", "UNDERVALUED_BY_FM",
            ]) {
              const profileOverrides = (agentParams || {})[profileType] || {};
              if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier, profileOverrides)) continue;

              const urlHash = hashPlayerUrl(url);
              if (rejectedUrlHashes.has(urlHash)) continue;
              const docId = `${agentId}_${urlHash}_${profileType}`;
              if (seen.has(docId)) continue;
              if (rejectedProfileIds.has(docId)) continue;
              seen.set(docId, true);

              const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
              const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
              const now = Date.now();

              const apiMinutes90s = getMinutes90s(p);
              const apiGoals = getApiGoals(p);
              const apiAssists = getApiAssists(p);
              const goalsPer90 = apiMinutes90s > 0 ? apiGoals / apiMinutes90s : 0;
              const contribPer90 = apiMinutes90s > 0 ? (apiGoals + apiAssists) / apiMinutes90s : 0;

              twoPhaseFound++;
              profilesToWrite.push({
                docId,
                data: {
                  tmProfileUrl: url,
                  agentId,
                  profileType,
                  playerName: (p.name || "").trim() || "Unknown",
                  profileImage: (p.profile_image || "").trim() || null,
                  age: ageNum ?? 0,
                  position: (p.position || "").trim() || "",
                  marketValue: (p.market_value || "").trim() || "",
                  marketValueEuro: valEuro,
                  club: (p.club || "").trim() || "",
                  league: league || "",
                  leagueTier,
                  nationality: (p.citizenship || "").trim() || null,
                  matchReason,
                  matchScore,
                  fmPa: getFmPa(p) ?? null,
                  fmCa: p.fm_ca ?? p.fmi_ca ?? null,
                  contractExpires: (p.contract || "").trim() || null,
                  apiMinutes90s,
              apiRating: typeof p.api_rating === "number" ? Math.round(p.api_rating * 100) / 100 : null,
                  apiGoals,
                  apiAssists,
                  goalsPer90: Math.round(goalsPer90 * 100) / 100,
                  contribPer90: Math.round(contribPer90 * 100) / 100,
                  source: "tm_enriched",
                  discoveredAt: now,
                  lastRefreshedAt: now,
                },
              });
            }
          } catch { /* skip — TM unavailable */ }
        })
      );
    }
    if (twoPhaseFound > 0) {
      console.log(`[ScoutAgent] Two-phase enrichment found ${twoPhaseFound} additional profiles`);
    } else {
      console.log(`[ScoutAgent] Two-phase enrichment: 0 new profiles (TM stats unavailable or no matches)`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Club Diversity — max 2 players per club per agent, shuffle first
  // ═══════════════════════════════════════════════════════════════
  // Shuffle to randomize which players survive the cap
  for (let i = profilesToWrite.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [profilesToWrite[i], profilesToWrite[j]] = [profilesToWrite[j], profilesToWrite[i]];
  }
  const MAX_PER_CLUB_PER_AGENT = 3;
  const clubCountByAgent = new Map();
  const diverseProfiles = [];
  for (const profile of profilesToWrite) {
    const key = `${profile.data.agentId}::${(profile.data.club || "").toLowerCase()}`;
    const count = clubCountByAgent.get(key) || 0;
    if (count >= MAX_PER_CLUB_PER_AGENT) continue;
    clubCountByAgent.set(key, count + 1);
    diverseProfiles.push(profile);
  }
  const clubCulled = profilesToWrite.length - diverseProfiles.length;
  if (clubCulled > 0) console.log(`[ScoutAgent] Club diversity: removed ${clubCulled} same-club duplicates`);
  profilesToWrite.length = 0;
  profilesToWrite.push(...diverseProfiles);

  // ═══════════════════════════════════════════════════════════════
  // Sport Director Review — quality gate before Firestore
  // ═══════════════════════════════════════════════════════════════
  console.log(`[ScoutAgent] Sending ${profilesToWrite.length} profiles to Sport Director for review...`);
  const directorReview = await reviewProfiles(profilesToWrite);
  const approvedProfiles = directorReview.approved;
  const rejectedProfiles = directorReview.rejected;
  const agentReports = directorReview.agentReports;
  console.log(`[ScoutAgent] Sport Director: ${approvedProfiles.length} approved, ${rejectedProfiles.length} rejected`);

  // ═══════════════════════════════════════════════════════════════
  // Enrich approved profiles with TM images (before Firestore write)
  // TM image URLs now require a timestamp suffix, so we scrape the actual URL
  // ═══════════════════════════════════════════════════════════════
  const ENRICH_CONCURRENCY = 5;
  const TM_DEFAULT_IMG = "https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1";
  // Re-enrich profiles that have no image OR have the old broken format (no timestamp suffix)
  const needsEnrich = (img) => !img || (!img.includes("default.jpg") && !/\d+-\d+\.\w+/.test(img));
  const profilesToEnrich = approvedProfiles.filter((p) => needsEnrich(p.data.profileImage));
  console.log(`[ScoutAgent] Enriching ${profilesToEnrich.length} profiles with TM images...`);
  for (let i = 0; i < profilesToEnrich.length; i += ENRICH_CONCURRENCY) {
    const chunk = profilesToEnrich.slice(i, i + ENRICH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (profile) => {
        try {
          const url = profile.data.tmProfileUrl;
          if (!url) return;
          const html = await fetchTmHtml(url);
          // Look for portrait image URL with the player ID (.jpg or .png)
          const idMatch = url.match(/\/profil\/spieler\/(\d+)/);
          if (!idMatch) return;
          const pid = idMatch[1];
          const imgMatch = html.match(new RegExp(`https://img[^"']*?/portrait/(?:big|medium|header)/${pid}-[^"'?]+\\.(?:jpg|png)[^"']*`));
          if (imgMatch) {
            let imgUrl = imgMatch[0];
            imgUrl = imgUrl.replace("/medium/", "/big/").replace("/header/", "/big/");
            profile.data.profileImage = imgUrl;
          } else {
            // Player has no personal photo — use TM default placeholder
            profile.data.profileImage = TM_DEFAULT_IMG;
          }
        } catch (err) {
          // Log first failure to help diagnose TM blocking
          if (i === 0 && profile === chunk[0]) {
            console.warn(`[ScoutAgent] TM image fetch failed: ${err.message || err}`);
          }
          // Set default placeholder so frontend doesn't try broken timestamp-less URLs
          if (!profile.data.profileImage) {
            profile.data.profileImage = TM_DEFAULT_IMG;
          }
        }
      })
    );
    if (i + ENRICH_CONCURRENCY < profilesToEnrich.length) await sleep(2000);
  }
  const enrichedReal = profilesToEnrich.filter((p) => p.data.profileImage && !p.data.profileImage.includes("default.jpg")).length;
  const enrichedDefault = profilesToEnrich.filter((p) => p.data.profileImage && p.data.profileImage.includes("default.jpg")).length;
  console.log(`[ScoutAgent] Image enrichment: ${enrichedReal} real TM images, ${enrichedDefault} default placeholders, ${profilesToEnrich.length - enrichedReal - enrichedDefault} failed`);

  // ═══════════════════════════════════════════════════════════════
  // DELETE all old profiles before writing fresh batch
  // SAFETY: Only clear when we have new profiles to write — prevents
  // empty Firestore when external APIs are down
  // ═══════════════════════════════════════════════════════════════
  if (approvedProfiles.length === 0) {
    console.log(`[ScoutAgent] ⚠ No approved profiles — keeping existing Firestore data intact`);
  } else {
    const oldSnap = await profilesRef.get();
    if (oldSnap.size > 0) {
      const deleteBatches = [];
      let delBatch = db.batch();
      let delCount = 0;
      for (const doc of oldSnap.docs) {
        delBatch.delete(doc.ref);
        delCount++;
        if (delCount % 450 === 0) {
          deleteBatches.push(delBatch);
          delBatch = db.batch();
        }
      }
      deleteBatches.push(delBatch);
      for (const b of deleteBatches) {
        await b.commit();
      }
      console.log(`[ScoutAgent] Cleared ${oldSnap.size} old profiles from Firestore`);
    }

    // Write approved profiles to ScoutProfiles (fresh batch)
    const writeBatches = [];
    let wBatch = db.batch();
    let wCount = 0;
    for (const { docId, data } of approvedProfiles) {
      wBatch.set(profilesRef.doc(docId), data);
      wCount++;
      if (wCount % 450 === 0) {
        writeBatches.push(wBatch);
        wBatch = db.batch();
      }
    }
    writeBatches.push(wBatch);
    for (const b of writeBatches) {
      await b.commit();
    }
    console.log(`[ScoutAgent] Wrote ${approvedProfiles.length} Sport Director-approved profiles (replaced all old data)`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Cross-agent intelligence: detect players surfacing in multiple agents
  // (Run on ALL profiles including rejected — cross-agent signal is still valuable)
  // ═══════════════════════════════════════════════════════════════
  const urlToAgents = {};
  for (const { data } of profilesToWrite) {
    const url = normalizePlayerUrl(data.tmProfileUrl);
    if (!urlToAgents[url]) urlToAgents[url] = new Set();
    urlToAgents[url].add(data.agentId);
  }
  const crossLeague = [];
  for (const [url, agents] of Object.entries(urlToAgents)) {
    if (agents.size >= 2) {
      const profile = profilesToWrite.find((pw) => normalizePlayerUrl(pw.data.tmProfileUrl) === url);
      if (profile) {
        crossLeague.push({
          playerName: profile.data.playerName,
          url,
          agents: [...agents],
          matchScore: profile.data.matchScore,
        });
      }
    }
  }
  if (crossLeague.length > 0) {
    console.log(`[ScoutAgent] Cross-agent detections: ${crossLeague.length} players appeared in 2+ agents`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Gemini narrative generation for TOP Sport Director-approved discoveries
  // ═══════════════════════════════════════════════════════════════
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey?.trim() && approvedProfiles.length > 0) {
    const topProfiles = approvedProfiles
      .filter((pw) => pw.data.matchScore >= 70)
      .sort((a, b) => b.data.matchScore - a.data.matchScore)
      .slice(0, 5);

    if (topProfiles.length > 0) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.0-flash",
          systemInstruction: `You are the Sport Director of MGSR — an elite football executive with 25 years of scouting experience. You write concise, opinionated scout narratives for profiles that passed your quality gate. These profiles are pre-approved — your narratives add the human scouting insight that data alone can't provide. Focus on: why this player matters for Israeli Premier League clubs (budget ≤€2.5M), league-level calibration, and a clear action recommendation.`,
        });

        const playerLines = topProfiles.map((pw, i) => {
          const d = pw.data;
          const per90 = d.apiMinutes90s > 0
            ? `G/90: ${d.goalsPer90}, (G+A)/90: ${d.contribPer90}`
            : "no per-90";
          return `${i + 1}. ${d.playerName} (${d.age}, ${d.position}, ${d.club}, ${d.league}, Tier ${d.leagueTier})
   Agent: ${d.agentId} | Profile: ${d.profileType} | Score: ${d.matchScore}
   Value: ${d.marketValue} | FM PA: ${d.fmPa || "?"}, CA: ${d.fmCa || "?"} | Contract: ${d.contractExpires || "?"}
   Stats: ${d.apiGoals || 0}G ${d.apiAssists || 0}A in ${d.apiMinutes90s?.toFixed(1) || 0} 90s | Rating: ${d.apiRating || "?"} | ${per90}
   ${d.directorVerdict ? `Director: ${d.directorVerdict}` : ""}
   Reason: ${d.matchReason}`;
        }).join("\n");

        const prompt = `For each of these ${topProfiles.length} scouted players, write a 1-2 sentence scout narrative.
Each narrative should explain:
- WHY this player is worth watching (be specific — reference their profile type, stats, or context)
- ONE actionable insight (e.g. "send someone to watch the next 3 matches" or "contract ending — move fast")

Players:
${playerLines}

Return a JSON array: [{"name":"...","narrative":"..."}]
ONLY valid JSON.`;

        const result = await model.generateContent(prompt);
        const text = result.response?.text?.() || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const narratives = JSON.parse(jsonMatch[0]);
          const narrativeMap = {};
          for (const n of narratives) {
            if (n.name && n.narrative) {
              narrativeMap[n.name.toLowerCase().trim()] = n.narrative;
            }
          }

          // Write narratives to Firestore (merge into existing profile docs)
          const narrativeBatch = db.batch();
          let narrativeCount = 0;
          for (const pw of topProfiles) {
            const narrative = narrativeMap[pw.data.playerName.toLowerCase().trim()];
            if (narrative) {
              const ref = profilesRef.doc(pw.docId);
              narrativeBatch.update(ref, { scoutNarrative: narrative });
              narrativeCount++;
            }
          }
          if (narrativeCount > 0) {
            await narrativeBatch.commit();
            console.log(`[ScoutAgent] Wrote ${narrativeCount} scout narratives`);
          }
        }
      } catch (err) {
        console.warn("[ScoutAgent] Gemini narrative generation failed (non-fatal):", err.message);
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // ═══════════════════════════════════════════════════════════════
  // Trigger Vercel-side image enrichment (Vercel can reach TM, Cloud Functions cannot)
  // ═══════════════════════════════════════════════════════════════
  const enrichSecret = process.env.SCOUT_ENRICH_SECRET;
  const enrichUrl = process.env.SCOUT_ENRICH_URL; // e.g. https://management.mgsrfa.com/api/war-room/enrich-images
  if (enrichSecret && enrichUrl && approvedProfiles.length > 0) {
    try {
      const enrichRes = await fetch(enrichUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: enrichSecret }),
        signal: AbortSignal.timeout(65000),
      });
      const enrichData = await enrichRes.json().catch(() => ({}));
      if (!enrichRes.ok) {
        console.warn(`[ScoutAgent] Vercel image enrichment HTTP ${enrichRes.status}: ${enrichData.error || JSON.stringify(enrichData)}`);
      }
      console.log(`[ScoutAgent] Vercel image enrichment: ${enrichData.enriched || 0} enriched, ${enrichData.failed || 0} failed`);
    } catch (err) {
      console.warn(`[ScoutAgent] Vercel image enrichment failed (non-fatal): ${err.message || err}`);
    }
  }

  const runDoc = await runsRef.add({
    runAt: startTime,
    status: "success",
    profilesFound: approvedProfiles.length,
    profilesBeforeReview: profilesToWrite.length,
    profilesRejected: rejectedProfiles.length,
    leaguesScanned: leaguesScanned * POSITIONS.length,
    durationMs,
    error: null,
    isLegacyMode,
    twoPhaseEnriched: twoPhaseFound,
    unmatchedCandidatesTotal: unmatchedCandidates.size,
    crossLeagueDetections: crossLeague.length,
    topScoreProfiles: approvedProfiles.filter((pw) => pw.data.matchScore >= 70).length,
    sportDirector: {
      agentReports,
      rejectedCount: rejectedProfiles.length,
      approvedCount: approvedProfiles.length,
      topRejectionReasons: rejectedProfiles
        .flatMap((p) => p.directorReasons || [])
        .reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {}),
    },
  });

  const profilesByAgent = {};
  for (const { docId, data } of approvedProfiles) {
    const aid = data.agentId;
    if (!profilesByAgent[aid]) profilesByAgent[aid] = [];
    profilesByAgent[aid].push({
      docId,
      profileType: data.profileType,
      league: data.league,
      matchScore: data.matchScore,
    });
  }

  console.log(`[ScoutAgent] Completed in ${durationMs}ms — ${approvedProfiles.length} approved of ${profilesToWrite.length} total (${rejectedProfiles.length} rejected by Sport Director, ${crossLeague.length} cross-agent)`);
  return {
    profilesFound: approvedProfiles.length,
    profilesBeforeReview: profilesToWrite.length,
    profilesRejected: rejectedProfiles.length,
    durationMs,
    profilesByAgent,
    agentReports,
    runId: runDoc.id,
    crossLeagueDetections: crossLeague.length,
  };
}

module.exports = { runScoutAgent, matchesProfile, computeMatchScore, buildMatchReason };
