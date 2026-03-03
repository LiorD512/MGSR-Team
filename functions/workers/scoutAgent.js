/**
 * AI Scout Agent Network — The Scout Brain.
 *
 * Elite scouting system that runs on schedule:
 * 1. Fetches players from scout server recruitment API
 * 2. Assigns to country agents by league
 * 3. Matches 8 scouting profiles (including BREAKOUT_SEASON, UNDERVALUED_BY_FM)
 * 4. Computes real matchScore based on profile criteria strength
 * 5. Generates Gemini scout narratives for the best discoveries
 * 6. Detects cross-league patterns (same player surfacing in multiple searches)
 * 7. Writes to ScoutProfiles in Firestore
 */

const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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
  "allsvenskan": "sweden",
  "swiss super league": "switzerland",
  "raiffeisen super league": "switzerland",
  "chance liga": "czech",
  "fortuna liga": "czech",
  "danish superliga": "denmark",
  "superligaen": "denmark",
  "3f superliga": "denmark",
  "superliga": "romania",
  "liga 1 romania": "romania",
  "romanian superliga": "romania",
  "efbet liga": "bulgaria",
  "nemzeti bajnoksag": "hungary",
  "premier liga": "ukraine",
  "championship": "england",
  "bundesliga": "austria",
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
  "laliga2": "spain",
  "laliga 2": "spain",
  "ligue 2": "france",
  "championnat national": "france",
  "national": "france",
  "scottish premiership": "scotland",
  "hnl": "croatia",
  "prva hnl": "croatia",
  "1. hnl": "croatia",
  "croatian first football league": "croatia",
  "prvaliga": "slovenia",
  "slovenian prvaliga": "slovenia",
  "prva liga slovenije": "slovenia",
  "premier league bih": "bosnia",
  "bh telecom": "bosnia",
  "premier liga bih": "bosnia",
  "first league": "macedonia",
  "macedonian first league": "macedonia",
  "prva makedonska liga": "macedonia",
  "first league montenegro": "montenegro",
  "prva crnogorska liga": "montenegro",
  "superliga kosovo": "kosovo",
  "kosovo superleague": "kosovo",
};

/** Fallback: league contains country keyword -> agentId. Denmark before Romania to avoid "superliga" clash. */
const LEAGUE_CONTAINS_AGENT = [
  [["portugal", "portuguese", "liga portugal"], "portugal"],
  [["serbia", "serbian", "srbije"], "serbia"],
  [["poland", "polish", "ekstraklasa", "polska"], "poland"],
  [["greece", "greek"], "greece"],
  [["belgium", "belgian", "jupiler"], "belgium"],
  [["netherlands", "dutch", "eredivisie", "eerste divisie"], "netherlands"],
  [["turkey", "turkish"], "turkey"],
  [["austria", "austrian", "admiral"], "austria"],
  [["sweden", "swedish", "allsvenskan"], "sweden"],
  [["switzerland", "swiss", "super league"], "switzerland"],
  [["czech", "chance liga", "fortuna liga"], "czech"],
  [["denmark", "danish", "superligaen"], "denmark"],
  [["romania", "romanian", "liga 1", "liga i"], "romania"],
  [["bulgaria", "bulgarian", "efbet"], "bulgaria"],
  [["hungary", "hungarian", "nemzeti"], "hungary"],
  [["ukraine", "ukrainian", "premier liga"], "ukraine"],
  [["england", "english", "championship"], "england"],
  [["germany", "german"], "germany"],
  [["brazil", "brazilian", "brasileirão", "brasileirao", "campeonato brasileiro"], "brazil"],
  [["italy", "italian"], "italy"],
  [["spain", "spanish", "laliga"], "spain"],
  [["france", "french", "ligue", "championnat national"], "france"],
  [["scotland", "scottish", "premiership"], "scotland"],
  [["croatia", "croatian", "hnl", "prva hnl"], "croatia"],
  [["slovenia", "slovenian", "prvaliga"], "slovenia"],
  [["bosnia", "bosnian", "bih", "premier liga bih"], "bosnia"],
  [["macedonia", "macedonian", "prva makedonska"], "macedonia"],
  [["montenegro", "crnogorska"], "montenegro"],
  [["kosovo", "kosovar"], "kosovo"],
];

const POSITIONS = ["CF", "AM", "CM", "CB", "DM", "LW", "RW", "LB", "RB", "SS"];
const AGENT_IDS = [
  "portugal", "serbia", "poland", "greece", "belgium", "netherlands", "turkey", "austria",
  "sweden", "switzerland", "czech", "denmark", "romania", "bulgaria", "hungary", "ukraine",
  "england", "germany", "italy", "spain", "france", "scotland",
  "croatia", "slovenia", "bosnia", "macedonia", "montenegro", "kosovo",
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
  search.set("value_max", String(LIGAT_HAAL_VALUE_MAX));
  search.set("limit", "30");
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

  // Exclude players already shown in last 7 days (ScoutProfiles + Shortlist)
  const EXCLUDE_DAYS = 7;
  const cutoff = startTime - EXCLUDE_DAYS * 24 * 60 * 60 * 1000;
  const excludeUrls = new Set();
  const recentProfiles = await profilesRef.where("lastRefreshedAt", ">=", cutoff).get();
  for (const doc of recentProfiles.docs) {
    const u = doc.data().tmProfileUrl;
    if (u) excludeUrls.add(normalizePlayerUrl(u));
  }
  const shortlistSnap = await db.collection("Shortlists").doc("team").get();
  const entries = shortlistSnap.data()?.entries || [];
  for (const e of entries) {
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

  // Rotate sort_by across runs for variety
  const sortBy = SORT_OPTIONS[Math.floor(startTime / (6 * 60 * 60 * 1000)) % SORT_OPTIONS.length];
  console.log(`[ScoutAgent] Using sort_by=${sortBy}`);

  console.log("[ScoutAgent] Starting AI Scout Agent Network run");

  for (const pos of POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const results = await fetchRecruitment({
        position: pos,
        age_max: "28",
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

  const batch = db.batch();
  for (const { docId, data } of profilesToWrite) {
    const ref = profilesRef.doc(docId);
    batch.set(ref, data, { merge: true });
  }

  if (profilesToWrite.length > 0) {
    await batch.commit();
    console.log(`[ScoutAgent] Wrote ${profilesToWrite.length} profiles`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Cross-agent intelligence: detect players surfacing in multiple agents
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
  // Gemini narrative generation for TOP discoveries (matchScore >= 70)
  // ═══════════════════════════════════════════════════════════════
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey?.trim() && profilesToWrite.length > 0) {
    const topProfiles = profilesToWrite
      .filter((pw) => pw.data.matchScore >= 70)
      .sort((a, b) => b.data.matchScore - a.data.matchScore)
      .slice(0, 10);

    if (topProfiles.length > 0) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.0-flash",
          systemInstruction: `You are an elite football scout with 40 years of experience at top European clubs. You write concise, insightful scouting narratives that cut through the noise. Your tone is professional but opinionated — you've seen thousands of players and you know what separates the good from the great.`,
        });

        const playerLines = topProfiles.map((pw, i) => {
          const d = pw.data;
          return `${i + 1}. ${d.playerName} (${d.age}, ${d.position}, ${d.club}, ${d.league})
   Profile: ${d.profileType} | Value: ${d.marketValue} | Score: ${d.matchScore}
   FM PA: ${d.fmPa || "?"}, CA: ${d.fmCa || "?"} | Contract: ${d.contractExpires || "?"}
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
    profilesFound: profilesToWrite.length,
    leaguesScanned: leaguesScanned * POSITIONS.length,
    durationMs,
    error: null,
    crossLeagueDetections: crossLeague.length,
    topScoreProfiles: profilesToWrite.filter((pw) => pw.data.matchScore >= 70).length,
  });

  const profilesByAgent = {};
  for (const { docId, data } of profilesToWrite) {
    const aid = data.agentId;
    if (!profilesByAgent[aid]) profilesByAgent[aid] = [];
    profilesByAgent[aid].push({
      docId,
      profileType: data.profileType,
      league: data.league,
      matchScore: data.matchScore,
    });
  }

  console.log(`[ScoutAgent] Completed in ${durationMs}ms — ${profilesToWrite.length} profiles (${crossLeague.length} cross-agent)`);
  return {
    profilesFound: profilesToWrite.length,
    durationMs,
    profilesByAgent,
    runId: runDoc.id,
    crossLeagueDetections: crossLeague.length,
  };
}

module.exports = { runScoutAgent };
