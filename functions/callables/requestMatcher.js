/**
 * Shared callable: Request ↔ Player matching.
 * Single source of truth for position normalization, age, foot, salary, fee, EU matching.
 * Merges the full alias map from Android RequestMatcher.kt + the market-value budget check from Web.
 */
const { getFirestore } = require("firebase-admin/firestore");
const {
  PLAYERS_COLLECTIONS,
  CLUB_REQUESTS_COLLECTIONS,
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
  const minAge = request.minAge || 0;
  const maxAge = request.maxAge || 999;
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

  const accepted = [SALARY_RANGES[reqIndex]];
  if (reqIndex > 0) accepted.push(SALARY_RANGES[reqIndex - 1]);
  if (reqIndex < SALARY_RANGES.length - 1) accepted.push(SALARY_RANGES[reqIndex + 1]);

  return accepted.some((r) => r.toLowerCase() === playerSalary.toLowerCase());
}

function matchesTransferFee(player, request) {
  const reqFee = (request.transferFee || "").trim();
  if (!reqFee) return true;
  const playerFee = (player.transferFee || "").trim();
  if (!playerFee) return true;
  return playerFee.toLowerCase() === reqFee.toLowerCase();
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

function matchPlayer(player, request, euCountries) {
  const position = (request.position || "").trim();
  if (!position) return false;
  if (!matchesPosition(player, position)) return false;
  if (!matchesAge(player, request)) return false;
  if (!matchesDominateFoot(player, request)) return false;
  if (!matchesSalaryRange(player, request)) return false;
  if (!matchesMarketValueVsTransferFee(player, request)) return false;
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

  const playersSnap = await db.collection(PLAYERS_COLLECTIONS[data.platform]).get();
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const eu = data.euCountries ? new Set(data.euCountries.map((c) => c.toLowerCase())) : EU_COUNTRIES;
  const matched = players.filter((p) => matchPlayer(p, request, eu));

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

  const requestsSnap = await db.collection(CLUB_REQUESTS_COLLECTIONS[data.platform]).get();
  const requests = requestsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const eu = data.euCountries ? new Set(data.euCountries.map((c) => c.toLowerCase())) : EU_COUNTRIES;
  const matched = requests.filter((r) => matchPlayer(player, r, eu));

  return { matchedRequestIds: matched.map((r) => r.id) };
}

module.exports = {
  matchRequestToPlayers,
  matchRequestToPlayersLocal,
  matchingRequestsForPlayer,
  // Export for unit testing
  normalizePosition,
  matchPlayer,
  POSITION_ALIASES,
  EU_COUNTRIES,
};
