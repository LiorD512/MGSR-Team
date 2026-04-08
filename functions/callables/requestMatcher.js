/**
 * Shared callable: Request ↔ Player matching.
 * Single source of truth for position normalization, age, foot, salary, fee, EU matching.
 * Merges the full alias map from Android RequestMatcher.kt + the market-value budget check from Web.
 */
const { getFirestore } = require("firebase-admin/firestore");
const {
  PLAYERS_COLLECTIONS,
  CLUB_REQUESTS_COLLECTIONS,
  PLAYER_DOCUMENTS_COLLECTIONS,
  validatePlatform,
} = require("../lib/platformCollections");

/** Maps common position names to canonical codes. Ported from Android RequestMatcher.kt. */
const POSITION_ALIASES = {
  GOALKEEPER: "GK",
  "LEFT BACK": "LB",
  LEFTBACK: "LB",
  "CENTRE BACK": "CB",
  "CENTER BACK": "CB",
  CENTREBACK: "CB",
  CENTERBACK: "CB",
  "RIGHT BACK": "RB",
  RIGHTBACK: "RB",
  "DEFENSIVE MIDFIELD": "DM",
  "CENTRAL MIDFIELD": "CM",
  "ATTACKING MIDFIELD": "AM",
  "RIGHT WINGER": "RW",
  "LEFT WINGER": "LW",
  "CENTRE FORWARD": "CF",
  "CENTER FORWARD": "CF",
  CENTREFORWARD: "CF",
  CENTERFORWARD: "CF",
  "SECOND STRIKER": "SS",
  "LEFT MIDFIELD": "LM",
  "RIGHT MIDFIELD": "RM",
  STRIKER: "CF",
  ST: "CF",
};

const SALARY_RANGES = [">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+"];

const EU_COUNTRIES = new Set([
  "austria","belgium","bulgaria","croatia","cyprus","czech republic","czechia",
  "denmark","estonia","finland","france","germany","greece","hungary","ireland",
  "italy","latvia","lithuania","luxembourg","malta","netherlands","poland",
  "portugal","romania","slovakia","slovenia","spain","sweden",
]);

function normalizePosition(pos) {
  const upper = pos.trim().toUpperCase().replace(/-/g, " ");
  return POSITION_ALIASES[upper] || POSITION_ALIASES[upper.replace(/ /g, "")] || upper.replace(/ /g, "");
}

function matchesPosition(player, requestPosition) {
  const positions = (player.positions || []).filter((p) => p && p.trim());
  if (positions.length === 0) return false;
  const reqNorm = normalizePosition(requestPosition);
  if (!reqNorm) return false;
  return positions.some((p) => normalizePosition(p) === reqNorm);
}

function matchesAge(player, request) {
  if (request.ageDoesntMatter === true) return true;
  let minAge = request.minAge || 0;
  let maxAge = request.maxAge || 999;
  // Normalize: ensure min ≤ max in case values were swapped
  if (minAge > 0 && maxAge < 999 && minAge > maxAge) {
    [minAge, maxAge] = [maxAge, minAge];
  }
  if (minAge <= 0 && maxAge >= 999) return true;
  const playerAge = player.age ? parseInt(player.age, 10) : undefined;
  if (playerAge == null || isNaN(playerAge)) return true;
  return playerAge >= minAge && playerAge <= maxAge;
}

function matchesDominateFoot(player, request) {
  const reqFoot = (request.dominateFoot || "").trim().toLowerCase();
  if (!reqFoot || reqFoot === "any") return true;
  const playerFoot = (player.foot || "").trim().toLowerCase();
  if (!playerFoot) return true;
  return playerFoot === reqFoot;
}

function matchesSalaryRange(player, request) {
  const reqSalary = (request.salaryRange || "").trim();
  if (!reqSalary) return true;
  const playerSalary = (player.salaryRange || "").trim();
  if (!playerSalary) return true;

  const reqIndex = SALARY_RANGES.findIndex((r) => r.toLowerCase() === reqSalary.toLowerCase());
  if (reqIndex < 0) return playerSalary.toLowerCase() === reqSalary.toLowerCase();

  const playerIndex = SALARY_RANGES.findIndex((r) => r.toLowerCase() === playerSalary.toLowerCase());
  if (playerIndex < 0) return playerSalary.toLowerCase() === reqSalary.toLowerCase();

  // Match if player salary is at or below request tier, or up to 2 tiers above
  return playerIndex <= reqIndex + 2;
}

/**
 * Ordered fee tiers from lowest to highest.
 * A player whose fee tier is at or below the request budget is a match
 * (a club willing to pay 1m+ would consider a 700-900 player).
 */
const FEE_TIERS = ["Free/Free loan", "<200", "300-600", "700-900", "1m+"];

function matchesTransferFee(player, request) {
  const reqFee = (request.transferFee || "").trim();
  if (!reqFee) return true;
  const playerFee = (player.transferFee || "").trim();
  if (!playerFee) return true;

  const reqIndex = FEE_TIERS.findIndex((r) => r.toLowerCase() === reqFee.toLowerCase());
  const playerIndex = FEE_TIERS.findIndex((r) => r.toLowerCase() === playerFee.toLowerCase());

  // If either tier is unknown, fall back to exact string match
  if (reqIndex < 0 || playerIndex < 0) return playerFee.toLowerCase() === reqFee.toLowerCase();

  // Match if player fee is at or below request tier, or up to 1 tier above
  return playerIndex <= reqIndex + 1;
}

/** Transfer fee string to value range in euros. Matches Android AiHelperService. */
function transferFeeToValueRange(transferFee) {
  const lower = transferFee.trim().toLowerCase();
  switch (lower) {
    case "free/free loan": return { min: 0, max: 150_000 };
    case "<200": return { min: 0, max: 200_000 };
    case "300-600": return { min: 250_000, max: 650_000 };
    case "700-900": return { min: 650_000, max: 950_000 };
    case "1m+": return { min: 900_000, max: Number.MAX_SAFE_INTEGER };
    default: return { min: 0, max: Number.MAX_SAFE_INTEGER };
  }
}

function parseMarketValueToEuros(marketValue) {
  if (!marketValue || typeof marketValue !== "string") return 0;
  const cleaned = marketValue.replace(/[€$£,\s]/g, "").toLowerCase();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (cleaned.endsWith("m")) return num * 1_000_000;
  if (cleaned.endsWith("k") || cleaned.endsWith("t")) return num * 1_000;
  return num;
}

/** Exclude players whose market value is clearly above the request's budget. */
function matchesMarketValueVsTransferFee(player, request) {
  const reqFee = (request.transferFee || "").trim();
  if (!reqFee) return true;
  const playerValue = player.marketValue ? parseMarketValueToEuros(player.marketValue) : 0;
  if (playerValue <= 0) return matchesTransferFee(player, request);
  const { max } = transferFeeToValueRange(reqFee);
  if (max >= Number.MAX_SAFE_INTEGER) return true;
  if (playerValue > max * 2) return false;
  return true;
}

function matchesEu(player, request, euCountries) {
  if (!request.euOnly) return true;
  const eu = euCountries && euCountries.size > 0 ? euCountries : EU_COUNTRIES;
  const nats = (player.nationalities && player.nationalities.length > 0)
    ? player.nationalities
    : player.nationality ? [player.nationality] : [];
  if (nats.length === 0) return true;
  return nats.some((n) => eu.has(n.trim().toLowerCase()));
}

/**
 * Check if a mandate's validLeagues covers the given club.
 * Matches: "WorldWide", country-wide (e.g. "Israel"), or specific club ("ClubName - Country").
 */
function mandateMatchesClub(validLeagues, clubName, clubCountry) {
  if (!validLeagues || validLeagues.length === 0) return false;
  if (!clubName && !clubCountry) return false;
  const leaguesNorm = validLeagues.map((l) => l.trim().toLowerCase());
  if (leaguesNorm.some((l) => l === "worldwide")) return true;
  const countryNorm = clubCountry ? clubCountry.trim().toLowerCase() : null;
  const clubNorm = clubName ? clubName.trim().toLowerCase() : null;
  // Country-wide mandate
  if (countryNorm && leaguesNorm.some((l) => l === countryNorm)) return true;
  // Specific club: "ClubName - Country"
  if (clubNorm && countryNorm) {
    const clubEntry = `${clubNorm} - ${countryNorm}`;
    if (leaguesNorm.some((l) => l === clubEntry)) return true;
  }
  // Fuzzy club-name match within league entries
  if (clubNorm) {
    for (const l of leaguesNorm) {
      const clubPart = l.includes(" - ") ? l.split(" - ")[0].trim() : l;
      if (clubPart === clubNorm) return true;
      if (clubPart.length >= 4 && clubNorm.length >= 4 && (clubPart.includes(clubNorm) || clubNorm.includes(clubPart))) return true;
    }
  }
  return false;
}

function matchPlayer(player, request, euCountries) {
  const position = (request.position || "").trim();
  if (!position) return false;
  if (!matchesPosition(player, position)) return false;
  if (!matchesAge(player, request)) return false;
  if (!matchesDominateFoot(player, request)) return false;
  if (!matchesSalaryRange(player, request)) return false;
  if (!matchesTransferFee(player, request)) return false;
  if (!matchesEu(player, request, euCountries)) return false;
  return true;
}

/**
 * Match a club request against a list of players (provided by caller).
 * Runs purely in memory — no Firestore reads.
 * @param {Object} data - { request: ClubRequest, players: Player[], euCountries?: string[] }
 * @returns {{ matchedPlayerIds: string[] }}
 */
function matchRequestToPlayersLocal(data) {
  const { request, players, euCountries: euList } = data;
  if (!request || !players) throw new Error("request and players are required.");

  const eu = euList ? new Set(euList.map((c) => c.toLowerCase())) : EU_COUNTRIES;
  const matched = players.filter((p) => matchPlayer(p, request, eu));
  return { matchedPlayerIds: matched.map((p) => p.id) };
}

/**
 * Match a club request against all players in Firestore.
 * @param {Object} data - { platform, requestId, euCountries?: string[] }
 * @returns {{ matchedPlayerIds: string[] }}
 */
async function matchRequestToPlayers(data) {
  validatePlatform(data.platform);
  const { requestId } = data;
  if (!requestId) throw new Error("requestId is required.");

  const db = getFirestore();
  const requestSnap = await db.collection(CLUB_REQUESTS_COLLECTIONS[data.platform]).doc(requestId).get();
  if (!requestSnap.exists) throw new Error("Request not found.");
  const request = { id: requestSnap.id, ...requestSnap.data() };

  const [playersSnap, mandateDocsSnap] = await Promise.all([
    db.collection(PLAYERS_COLLECTIONS[data.platform]).get(),
    db.collection(PLAYER_DOCUMENTS_COLLECTIONS[data.platform])
      .where("type", "==", "MANDATE")
      .get(),
  ]);
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Build mandate map
  const now = Date.now();
  const linkKey = data.platform === "women" ? "playerWomenId" : data.platform === "youth" ? "playerYouthId" : "playerTmProfile";
  const mandateByPlayerRef = {};
  for (const doc of mandateDocsSnap.docs) {
    const d = doc.data();
    if (d.expired) continue;
    if (d.expiresAt && d.expiresAt < now) continue;
    const ref = d[linkKey];
    if (!ref) continue;
    if (!mandateByPlayerRef[ref]) mandateByPlayerRef[ref] = [];
    mandateByPlayerRef[ref].push(...(d.validLeagues || []));
  }

  const eu = data.euCountries ? new Set(data.euCountries.map((c) => c.toLowerCase())) : EU_COUNTRIES;
  const matched = players.filter((p) => {
    if (matchPlayer(p, request, eu)) return true;
    const playerRef = p.tmProfile || (data.platform !== "men" ? p.id : null);
    if (playerRef && mandateByPlayerRef[playerRef]) {
      return mandateMatchesClub(mandateByPlayerRef[playerRef], request.clubName, request.clubCountry);
    }
    return false;
  });

  return { matchedPlayerIds: matched.map((p) => p.id) };
}

/**
 * Find which requests match a given player.
 * @param {Object} data - { platform, playerId, euCountries?: string[] }
 * @returns {{ matchedRequestIds: string[] }}
 */
async function matchingRequestsForPlayer(data) {
  validatePlatform(data.platform);
  const { playerId } = data;
  if (!playerId) throw new Error("playerId is required.");

  const db = getFirestore();
  const playerSnap = await db.collection(PLAYERS_COLLECTIONS[data.platform]).doc(playerId).get();
  if (!playerSnap.exists) throw new Error("Player not found.");
  const player = { id: playerSnap.id, ...playerSnap.data() };

  const [requestsSnap, mandateDocsSnap] = await Promise.all([
    db.collection(CLUB_REQUESTS_COLLECTIONS[data.platform]).get(),
    db.collection(PLAYER_DOCUMENTS_COLLECTIONS[data.platform])
      .where("type", "==", "MANDATE")
      .get(),
  ]);
  const requests = requestsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Build mandate validLeagues for this player
  const now = Date.now();
  const linkKey = data.platform === "women" ? "playerWomenId" : data.platform === "youth" ? "playerYouthId" : "playerTmProfile";
  const playerRef = player.tmProfile || (data.platform !== "men" ? player.id : null);
  let playerMandateLeagues = [];
  if (playerRef) {
    for (const doc of mandateDocsSnap.docs) {
      const d = doc.data();
      if (d.expired) continue;
      if (d.expiresAt && d.expiresAt < now) continue;
      if (d[linkKey] !== playerRef) continue;
      playerMandateLeagues.push(...(d.validLeagues || []));
    }
  }

  const eu = data.euCountries ? new Set(data.euCountries.map((c) => c.toLowerCase())) : EU_COUNTRIES;
  const matched = requests.filter((r) => {
    if (matchPlayer(player, r, eu)) return true;
    if (playerMandateLeagues.length > 0 && mandateMatchesClub(playerMandateLeagues, r.clubName, r.clubCountry)) return true;
    return false;
  });

  return { matchedRequestIds: matched.map((r) => r.id) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Pre-computed match results — called by Firestore triggers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-compute collections map.
 * Results are written per-platform so each doc ID is just requestId or playerId.
 */
const REQUEST_MATCH_RESULTS = { men: "RequestMatchResults", women: "RequestMatchResultsWomen", youth: "RequestMatchResultsYouth" };
const PLAYER_MATCH_RESULTS  = { men: "PlayerMatchResults",  women: "PlayerMatchResultsWomen",  youth: "PlayerMatchResultsYouth" };

/**
 * Recalculate ALL matches for a given platform and write results to Firestore.
 * Writes two sets of documents:
 *   - RequestMatchResults/{requestId}  → { matchingPlayerIds: string[], updatedAt }
 *   - PlayerMatchResults/{playerId}    → { matchingRequestIds: string[], updatedAt }
 *
 * Cost optimizations:
 *   - Reads existing results first and only writes documents that actually changed
 *   - At current scale (~877 players, ~41 requests) this is fast and cheap
 */
async function recalculateAllMatches(platform) {
  validatePlatform(platform);
  const db = getFirestore();

  const [playersSnap, requestsSnap, mandateDocsSnap] = await Promise.all([
    db.collection(PLAYERS_COLLECTIONS[platform]).get(),
    db.collection(CLUB_REQUESTS_COLLECTIONS[platform]).get(),
    db.collection(PLAYER_DOCUMENTS_COLLECTIONS[platform])
      .where("type", "==", "MANDATE")
      .get(),
  ]);

  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const requests = requestsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const pendingRequests = requests.filter((r) => (r.status || "pending") === "pending");

  // Build mandate map: playerRefId → validLeagues[]
  const now = Date.now();
  const linkKey = platform === "women" ? "playerWomenId" : platform === "youth" ? "playerYouthId" : "playerTmProfile";
  const mandateByPlayerRef = {};  // playerRefId → validLeagues[]
  for (const doc of mandateDocsSnap.docs) {
    const d = doc.data();
    if (d.expired) continue;
    if (d.expiresAt && d.expiresAt < now) continue;
    const ref = d[linkKey];
    if (!ref) continue;
    const leagues = d.validLeagues || [];
    if (leagues.length === 0) continue;
    if (!mandateByPlayerRef[ref]) mandateByPlayerRef[ref] = [];
    mandateByPlayerRef[ref].push(...leagues);
  }
  // Deduplicate
  for (const ref of Object.keys(mandateByPlayerRef)) {
    mandateByPlayerRef[ref] = [...new Set(mandateByPlayerRef[ref])];
  }

  // Build match maps
  const byRequestId = {};   // requestId → playerIds[]
  const byPlayerId = {};    // playerId → requestIds[]

  for (const req of pendingRequests) {
    byRequestId[req.id] = [];
  }
  for (const player of players) {
    byPlayerId[player.id] = [];
  }

  for (const req of pendingRequests) {
    for (const player of players) {
      // Normal criteria match
      const criteriaMatch = matchPlayer(player, req, EU_COUNTRIES);
      // Mandate match: player has mandate covering the request's club → auto-match
      const playerRef = player.tmProfile || (platform !== "men" ? player.id : null);
      const mandateMatch = playerRef && mandateByPlayerRef[playerRef]
        ? mandateMatchesClub(mandateByPlayerRef[playerRef], req.clubName, req.clubCountry)
        : false;
      if (criteriaMatch || mandateMatch) {
        byRequestId[req.id].push(player.id);
        byPlayerId[player.id].push(req.id);
      }
    }
  }

  // Also mark non-pending requests as empty
  const nonPendingIds = requests.filter((r) => r.status && r.status !== "pending").map((r) => r.id);
  for (const id of nonPendingIds) {
    byRequestId[id] = [];
  }

  const writeTimestamp = Date.now();
  const reqResultsCol = REQUEST_MATCH_RESULTS[platform];
  const playerResultsCol = PLAYER_MATCH_RESULTS[platform];

  // Read existing results to diff (saves writes when nothing changed)
  const [existingReqSnap, existingPlayerSnap] = await Promise.all([
    db.collection(reqResultsCol).get(),
    db.collection(playerResultsCol).get(),
  ]);
  const existingReqResults = {};
  for (const d of existingReqSnap.docs) {
    existingReqResults[d.id] = JSON.stringify((d.data().matchingPlayerIds || []).sort());
  }
  const existingPlayerResults = {};
  for (const d of existingPlayerSnap.docs) {
    existingPlayerResults[d.id] = JSON.stringify((d.data().matchingRequestIds || []).sort());
  }

  // Only write documents that actually changed
  const batches = [];
  let batch = db.batch();
  let opCount = 0;
  let writesSkipped = 0;

  for (const [requestId, playerIds] of Object.entries(byRequestId)) {
    const newSorted = JSON.stringify([...playerIds].sort());
    if (existingReqResults[requestId] === newSorted) { writesSkipped++; continue; }
    batch.set(db.collection(reqResultsCol).doc(requestId), {
      requestId,
      matchingPlayerIds: playerIds,
      matchCount: playerIds.length,
      updatedAt: writeTimestamp,
    });
    opCount++;
    if (opCount >= 490) { batches.push(batch); batch = db.batch(); opCount = 0; }
  }

  for (const [playerId, requestIds] of Object.entries(byPlayerId)) {
    const newSorted = JSON.stringify([...requestIds].sort());
    if (existingPlayerResults[playerId] === newSorted) { writesSkipped++; continue; }
    batch.set(db.collection(playerResultsCol).doc(playerId), {
      playerId,
      matchingRequestIds: requestIds,
      matchCount: requestIds.length,
      updatedAt: writeTimestamp,
    });
    opCount++;
    if (opCount >= 490) { batches.push(batch); batch = db.batch(); opCount = 0; }
  }

  if (opCount > 0) batches.push(batch);

  await Promise.all(batches.map((b) => b.commit()));

  return {
    platform,
    requestsProcessed: pendingRequests.length,
    playersProcessed: players.length,
    docsWritten: Object.keys(byRequestId).length + Object.keys(byPlayerId).length - writesSkipped,
    writesSkipped,
  };
}

module.exports = {
  matchRequestToPlayers,
  matchRequestToPlayersLocal,
  matchingRequestsForPlayer,
  recalculateAllMatches,
  // Export for unit testing
  normalizePosition,
  matchPlayer,
  POSITION_ALIASES,
  EU_COUNTRIES,
};
