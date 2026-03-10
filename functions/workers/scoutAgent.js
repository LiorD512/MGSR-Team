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
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { reviewProfiles } = require("./sportDirector");

function getScoutBaseUrl() {
  const url = process.env.SCOUT_SERVER_URL || "https://football-scout-server-l38w.onrender.com";
  return url.trim().replace(/\/$/, "");
}
const LIGAT_HAAL_VALUE_MAX = 2_500_000;
const DELAY_BETWEEN_REQUESTS_MS = 3000;

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
  [["czech", "chance liga", "fortuna liga"], "czech"],
  [["denmark", "danish", "superligaen"], "denmark"],
  [["romania", "romanian", "liga 1", "liga i", "rumanien", "rumänien"], "romania"],
  [["bulgaria", "bulgarian", "efbet", "bulgarien"], "bulgaria"],
  [["hungary", "hungarian", "nemzeti", "ungarn"], "hungary"],
  [["ukraine", "ukrainian", "premier liga"], "ukraine"],
  [["england", "english", "championship"], "england"],
  [["germany", "german"], "germany"],
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
  [["cyprus", "cypriot", "protathlima"], "cyprus"],
  [["slovakia", "slovak", "niké liga", "nike liga"], "slovakia"],
  [["azerbaijan", "azerbaijani", "premyer liqa"], "azerbaijan"],
  [["kazakhstan", "kazakh"], "kazakhstan"],
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
];

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

/** Parse fbref_minutes_90s (e.g. "1.8" = 162 min). Returns 0 if missing/invalid. */
function getMinutes90s(p) {
  const v = p.fbref_minutes_90s;
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

/** Get FBref goals (total, not per90). Returns 0 if missing. */
function getFbrefGoals(p) {
  const v = p.fbref_goals;
  if (v == null) return 0;
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return isNaN(n) ? 0 : n;
}

/** Get FBref assists (total). Returns 0 if missing. */
function getFbrefAssists(p) {
  const v = p.fbref_assists;
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
      return valEuro <= 1_500_000 && ageNum != null && ageNum <= 24 && (fmPa == null || fmPa >= 130);
    }
    case "LOWER_LEAGUE_RISER":
      return valEuro <= 1_000_000 && ageNum != null && ageNum <= 23 && leagueTier >= 2;
    case "BREAKOUT_SEASON": {
      // High goal/assist output relative to age and value = breakout performance
      if (ageNum == null || ageNum > 25) return false;
      if (valEuro > 2_000_000) return false;
      const goals = getFbrefGoals(p);
      const assists = getFbrefAssists(p);
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
  const goals = getFbrefGoals(p);
  const assists = getFbrefAssists(p);
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
  const goals = getFbrefGoals(p);
  const assists = getFbrefAssists(p);

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
  return Math.min(100, Math.max(0, score));
}

const SORT_OPTIONS = ["score", "market_value", "age"];

async function fetchRecruitment(params) {
  const search = new URLSearchParams(params);
  if (!search.has("value_max")) search.set("value_max", String(LIGAT_HAAL_VALUE_MAX));
  search.set("limit", "50");
  search.set("sort_by", params.sort_by || "score");
  search.set("lang", "en");
  search.set("_t", String(Date.now()));

  const url = `${getScoutBaseUrl()}/recruitment?${search.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.results || [];
}

function normalizePlayerUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().toLowerCase().replace(/\/$/, "");
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

  // Exclude profiles thumbs-downed by users
  const rejectedProfileIds = new Set();
  const feedbackSnap = await db.collection("ScoutProfileFeedback").get();
  for (const doc of feedbackSnap.docs) {
    const fb = doc.data().feedback || {};
    for (const [profileId, val] of Object.entries(fb)) {
      const f = typeof val === "object" && val?.feedback ? val.feedback : val;
      if (f === "down") rejectedProfileIds.add(profileId);
    }
  }
  console.log(`[ScoutAgent] Excluding ${rejectedProfileIds.size} thumbs-downed profiles`);

  // Randomize sort_by each run for maximum diversity
  const sortBy = SORT_OPTIONS[Math.floor(Math.random() * SORT_OPTIONS.length)];
  console.log(`[ScoutAgent] Using sort_by=${sortBy}`);

  console.log("[ScoutAgent] Starting AI Scout Agent Network run");

  for (const pos of POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const results = await fetchRecruitment({
        position: pos,
        age_max: String(MAX_AGE),
        sort_by: sortBy,
      });
      leaguesScanned += 1;

      for (const p of results) {
        const url = (p.url || "").trim();
        if (!url) continue;
        if (excludeUrls.has(normalizePlayerUrl(url))) continue;

        const valEuro = parseMarketValue(p.market_value);
        if (valEuro > LIGAT_HAAL_VALUE_MAX) continue;

        const agentId = leagueToAgent(p.league);
        if (!agentId || !AGENT_IDS.includes(agentId)) continue;

        const ageNum = parseAge(p.age);
        if (ageNum != null && ageNum > MAX_AGE) continue; // Hard age cap
        const league = (p.league || "").trim();
        const lc = league.toLowerCase();
        const leagueTier = lc.includes("national") || lc.includes("3. liga") ? 3
          : lc.includes("2") || lc.includes("second") ? 2
          : 1;

        const agentParams = paramsByAgent[agentId] || {};

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

          const urlHash = Buffer.from(url).toString("base64").replace(/[+/=]/g, "_").slice(0, 40);
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          if (rejectedProfileIds.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
          const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
          const now = Date.now();

          // Per-90 stats for Sport Director evaluation
          const fbrefMinutes90s = getMinutes90s(p);
          const fbrefGoals = getFbrefGoals(p);
          const fbrefAssists = getFbrefAssists(p);
          const goalsPer90 = fbrefMinutes90s > 0 ? fbrefGoals / fbrefMinutes90s : 0;
          const contribPer90 = fbrefMinutes90s > 0 ? (fbrefGoals + fbrefAssists) / fbrefMinutes90s : 0;

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
              fbrefMinutes90s,
              fbrefGoals,
              fbrefAssists,
              goalsPer90: Math.round(goalsPer90 * 100) / 100,
              contribPer90: Math.round(contribPer90 * 100) / 100,
              discoveredAt: now,
              lastRefreshedAt: now,
            },
          });
        }
      }
    } catch (err) {
      console.error(`[ScoutAgent] Recruitment error for ${pos}:`, err.message);
    }
  }

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
      const results = await fetchRecruitment({
        position: pos,
        age_max: "26",
        sort_by: "score",
        value_max: String(BALKAN_VALUE_MAX),
      });
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

          const urlHash = Buffer.from(url).toString("base64").replace(/[+/=]/g, "_").slice(0, 40);
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          if (rejectedProfileIds.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
          const matchScore = computeMatchScore(p, profileType, valEuro, ageNum);
          const now = Date.now();

          const fbrefMinutes90s = getMinutes90s(p);
          const fbrefGoals = getFbrefGoals(p);
          const fbrefAssists = getFbrefAssists(p);
          const goalsPer90 = fbrefMinutes90s > 0 ? fbrefGoals / fbrefMinutes90s : 0;
          const contribPer90 = fbrefMinutes90s > 0 ? (fbrefGoals + fbrefAssists) / fbrefMinutes90s : 0;

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
              fbrefMinutes90s,
              fbrefGoals,
              fbrefAssists,
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
  // Sport Director Review — quality gate before Firestore
  // ═══════════════════════════════════════════════════════════════
  console.log(`[ScoutAgent] Sending ${profilesToWrite.length} profiles to Sport Director for review...`);
  const directorReview = await reviewProfiles(profilesToWrite);
  const approvedProfiles = directorReview.approved;
  const rejectedProfiles = directorReview.rejected;
  const agentReports = directorReview.agentReports;
  console.log(`[ScoutAgent] Sport Director: ${approvedProfiles.length} approved, ${rejectedProfiles.length} rejected`);

  // Write ONLY approved profiles to ScoutProfiles
  const batch = db.batch();
  for (const { docId, data } of approvedProfiles) {
    const ref = profilesRef.doc(docId);
    batch.set(ref, data, { merge: true });
  }

  if (approvedProfiles.length > 0) {
    await batch.commit();
    console.log(`[ScoutAgent] Wrote ${approvedProfiles.length} Sport Director-approved profiles`);
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
      .slice(0, 10);

    if (topProfiles.length > 0) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.0-flash",
          systemInstruction: `You are the Sport Director of MGSR — an elite football executive with 25 years of scouting experience. You write concise, opinionated scout narratives for profiles that passed your quality gate. These profiles are pre-approved — your narratives add the human scouting insight that data alone can't provide. Focus on: why this player matters for Israeli Premier League clubs (budget ≤€2.5M), league-level calibration, and a clear action recommendation.`,
        });

        const playerLines = topProfiles.map((pw, i) => {
          const d = pw.data;
          const per90 = d.fbrefMinutes90s > 0
            ? `G/90: ${d.goalsPer90}, (G+A)/90: ${d.contribPer90}`
            : "no per-90";
          return `${i + 1}. ${d.playerName} (${d.age}, ${d.position}, ${d.club}, ${d.league}, Tier ${d.leagueTier})
   Agent: ${d.agentId} | Profile: ${d.profileType} | Score: ${d.matchScore}
   Value: ${d.marketValue} | FM PA: ${d.fmPa || "?"}, CA: ${d.fmCa || "?"} | Contract: ${d.contractExpires || "?"}
   Stats: ${d.fbrefGoals || 0}G ${d.fbrefAssists || 0}A in ${d.fbrefMinutes90s?.toFixed(1) || 0} 90s | ${per90}
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
  const runDoc = await runsRef.add({
    runAt: startTime,
    status: "success",
    profilesFound: approvedProfiles.length,
    profilesBeforeReview: profilesToWrite.length,
    profilesRejected: rejectedProfiles.length,
    leaguesScanned: leaguesScanned * POSITIONS.length,
    durationMs,
    error: null,
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
