/**
 * AI Scout Agent Network — runs on schedule.
 * Fetches players from scout server recruitment API, assigns to agents by league,
 * matches scouting profiles, writes to ScoutProfiles.
 */

const { getFirestore } = require("firebase-admin/firestore");

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || "https://football-scout-server-l38w.onrender.com";
const LIGAT_HAAL_VALUE_MAX = 2_500_000;
const DELAY_BETWEEN_REQUESTS_MS = 5000;

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
};

/** Fallback: league contains country keyword -> agentId */
const LEAGUE_CONTAINS_AGENT = [
  [["portugal", "portuguese", "liga portugal"], "portugal"],
  [["serbia", "serbian", "srbije"], "serbia"],
  [["poland", "polish", "ekstraklasa", "polska"], "poland"],
  [["greece", "greek"], "greece"],
  [["belgium", "belgian", "jupiler"], "belgium"],
  [["netherlands", "dutch", "eredivisie", "eerste divisie"], "netherlands"],
  [["turkey", "turkish"], "turkey"],
  [["austria", "austrian", "admiral"], "austria"],
];

const POSITIONS = ["CF", "AM", "CM", "CB", "DM", "LW", "RW", "LB", "RB", "SS"];
const AGENT_IDS = ["portugal", "serbia", "poland", "greece", "belgium", "netherlands", "turkey", "austria"];

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

function matchesProfile(p, profileType, valEuro, ageNum, leagueTier) {
  switch (profileType) {
    case "HIGH_VALUE_BENCHED":
      return valEuro >= 800_000 && valEuro <= 3_000_000 && ageNum != null && ageNum <= 30;
    case "LOW_VALUE_STARTER":
      return valEuro <= 500_000 && valEuro > 0 && ageNum != null && ageNum <= 28;
    case "YOUNG_STRIKER_HOT": {
      const pos = (p.position || "").toLowerCase();
      const isStriker = pos.includes("forward") || pos.includes("striker") || pos === "cf" || pos === "ss";
      return valEuro <= 1_000_000 && ageNum != null && ageNum <= 21 && isStriker;
    }
    case "CONTRACT_EXPIRING":
      return valEuro <= 2_500_000 && (p.contract || "").toLowerCase().includes("2025");
    case "HIDDEN_GEM": {
      const fmPa = getFmPa(p);
      return valEuro <= 1_500_000 && ageNum != null && ageNum <= 24 && (fmPa == null || fmPa >= 130);
    }
    case "LOWER_LEAGUE_RISER":
      return valEuro <= 1_000_000 && ageNum != null && ageNum <= 23 && leagueTier >= 2;
    default:
      return false;
  }
}

function buildMatchReason(p, profileType, valEuro, ageNum) {
  const parts = [];
  if (valEuro > 0) parts.push(`€${(valEuro / 1_000_000).toFixed(2)}M value`);
  if (ageNum != null) parts.push(`age ${ageNum}`);
  const fmPa = getFmPa(p);
  if (fmPa != null) parts.push(`FM PA ${fmPa}`);
  const league = p.league || "";
  if (league) parts.push(league);
  return parts.join(" · ") || "Matches profile criteria";
}

async function fetchRecruitment(params) {
  const search = new URLSearchParams(params);
  search.set("value_max", String(LIGAT_HAAL_VALUE_MAX));
  search.set("limit", "20");
  search.set("sort_by", "score");
  search.set("lang", "en");
  search.set("_t", String(Date.now()));

  const url = `${SCOUT_BASE}/recruitment?${search.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.results || [];
}

/**
 * Run the AI Scout Agent Network.
 * Fetches players from recruitment API, assigns to agents, matches profiles, writes to Firestore.
 */
async function runScoutAgent() {
  const db = getFirestore();
  const profilesRef = db.collection("ScoutProfiles");
  const runsRef = db.collection("ScoutAgentRuns");

  const startTime = Date.now();
  const seen = new Map();
  const profilesToWrite = [];
  let leaguesScanned = 0;

  console.log("[ScoutAgent] Starting AI Scout Agent Network run");

  for (const pos of POSITIONS) {
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    try {
      const results = await fetchRecruitment({
        position: pos,
        age_max: "28",
      });
      leaguesScanned += 1;

      for (const p of results) {
        const url = (p.url || "").trim();
        if (!url) continue;

        const valEuro = parseMarketValue(p.market_value);
        if (valEuro > LIGAT_HAAL_VALUE_MAX) continue;

        const agentId = leagueToAgent(p.league);
        if (!agentId || !AGENT_IDS.includes(agentId)) continue;

        const ageNum = parseAge(p.age);
        const league = (p.league || "").trim();
        const leagueTier = league.toLowerCase().includes("2") || league.toLowerCase().includes("second") ? 2 : 1;

        for (const profileType of [
          "HIGH_VALUE_BENCHED",
          "LOW_VALUE_STARTER",
          "YOUNG_STRIKER_HOT",
          "CONTRACT_EXPIRING",
          "HIDDEN_GEM",
          "LOWER_LEAGUE_RISER",
        ]) {
          if (!matchesProfile(p, profileType, valEuro, ageNum, leagueTier)) continue;

          const urlHash = Buffer.from(url).toString("base64").replace(/[+/=]/g, "_").slice(0, 40);
          const docId = `${agentId}_${urlHash}_${profileType}`;
          if (seen.has(docId)) continue;
          seen.set(docId, true);

          const matchReason = buildMatchReason(p, profileType, valEuro, ageNum);
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
              matchScore: 75,
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

  const durationMs = Date.now() - startTime;
  await runsRef.add({
    runAt: startTime,
    status: "success",
    profilesFound: profilesToWrite.length,
    leaguesScanned: leaguesScanned * POSITIONS.length,
    durationMs,
    error: null,
  });

  console.log(`[ScoutAgent] Completed in ${durationMs}ms — ${profilesToWrite.length} profiles`);
  return { profilesFound: profilesToWrite.length, durationMs };
}

module.exports = { runScoutAgent };
