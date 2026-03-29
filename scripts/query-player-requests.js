#!/usr/bin/env node
/**
 * Query a player from the roster and find matching requests.
 * Usage: node scripts/query-player-requests.js "Ibrahim Buhari"
 */
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const SALARY_RANGES = [">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+"];

const POSITION_ALIASES = {
  "GOALKEEPER": "GK", "LEFT BACK": "LB", "CENTRE BACK": "CB", "CENTER BACK": "CB",
  "RIGHT BACK": "RB", "DEFENSIVE MIDFIELD": "DM", "CENTRAL MIDFIELD": "CM",
  "ATTACKING MIDFIELD": "AM", "RIGHT WINGER": "RW", "LEFT WINGER": "LW",
  "CENTRE FORWARD": "CF", "CENTER FORWARD": "CF", "SECOND STRIKER": "SS",
  "LEFT MIDFIELD": "LM", "RIGHT MIDFIELD": "RM", "STRIKER": "CF", "ST": "CF"
};

function normalizePosition(pos) {
  const upper = pos.trim().toUpperCase().replace(/-/g, " ");
  return POSITION_ALIASES[upper] || POSITION_ALIASES[upper.replace(/ /g, "")] || upper.replace(/ /g, "");
}

function matchesPosition(playerPositions, requestPosition) {
  if (!playerPositions || playerPositions.length === 0) return false;
  const reqNorm = normalizePosition(requestPosition);
  return playerPositions.some(p => p && normalizePosition(p) === reqNorm);
}

function matchesAge(playerAge, request) {
  if (request.ageDoesntMatter) return true;
  const min = request.minAge || 0;
  const max = request.maxAge || 999;
  if (min <= 0 && max >= 999) return true;
  const age = parseInt(playerAge);
  if (isNaN(age)) return true;
  return age >= min && age <= max;
}

function matchesFoot(playerFoot, request) {
  const reqFoot = (request.dominateFoot || "").trim().toLowerCase();
  if (!reqFoot || reqFoot === "any") return true;
  const pFoot = (playerFoot || "").trim().toLowerCase();
  if (!pFoot) return true;
  return pFoot === reqFoot;
}

function matchesSalary(playerSalary, request) {
  const reqSalary = (request.salaryRange || "").trim();
  if (!reqSalary) return true;
  if (!playerSalary) return true;
  const reqIdx = SALARY_RANGES.findIndex(r => r.toLowerCase() === reqSalary.toLowerCase());
  if (reqIdx < 0) return playerSalary.toLowerCase() === reqSalary.toLowerCase();
  const accepted = new Set();
  accepted.add(SALARY_RANGES[reqIdx]);
  if (reqIdx > 0) accepted.add(SALARY_RANGES[reqIdx - 1]);
  if (reqIdx < SALARY_RANGES.length - 1) accepted.add(SALARY_RANGES[reqIdx + 1]);
  return [...accepted].some(a => a.toLowerCase() === playerSalary.trim().toLowerCase());
}

const FEE_TIERS = ["Free/Free loan", "<200", "300-600", "700-900", "1m+"];

function matchesFee(playerFee, request) {
  const reqFee = (request.transferFee || "").trim();
  if (!reqFee) return true;
  if (!playerFee) return true;

  const reqIdx = FEE_TIERS.findIndex(r => r.toLowerCase() === reqFee.toLowerCase());
  const playerIdx = FEE_TIERS.findIndex(r => r.toLowerCase() === playerFee.trim().toLowerCase());

  // If either tier is unknown, fall back to exact string match
  if (reqIdx < 0 || playerIdx < 0) return playerFee.trim().toLowerCase() === reqFee.toLowerCase();

  // Player is within budget if their fee tier is at or below the request tier
  return playerIdx <= reqIdx;
}

// EU countries list (simplified)
const EU_COUNTRIES = new Set([
  "Albania","Andorra","Armenia","Austria","Azerbaijan","Belarus","Belgium","Bosnia-Herzegovina",
  "Bulgaria","Croatia","Cyprus","Czech Republic","Denmark","England","Estonia","Faroe Islands",
  "Finland","France","Georgia","Germany","Gibraltar","Greece","Hungary","Iceland","Ireland",
  "Israel","Italy","Kazakhstan","Kosovo","Latvia","Liechtenstein","Lithuania","Luxembourg",
  "Malta","Moldova","Monaco","Montenegro","Netherlands","North Macedonia","Northern Ireland",
  "Norway","Poland","Portugal","Romania","Russia","San Marino","Scotland","Serbia","Slovakia",
  "Slovenia","Spain","Sweden","Switzerland","Turkey","Ukraine","Wales"
]);

function matchesEu(player, request) {
  if (!request.euOnly) return true;
  const nats = player.nationalities && player.nationalities.length > 0
    ? player.nationalities
    : (player.nationality ? [player.nationality] : []);
  if (nats.length === 0) return true;
  return nats.some(n => EU_COUNTRIES.has(n));
}

function matchesRequest(player, request) {
  if (!request.position) return false;
  if (!matchesPosition(player.positions, request.position)) return false;
  if (!matchesAge(player.age, request)) return false;
  if (!matchesFoot(player.foot, request)) return false;
  if (!matchesSalary(player.salaryRange, request)) return false;
  if (!matchesFee(player.transferFee, request)) return false;
  if (!matchesEu(player, request)) return false;
  return true;
}

async function main() {
  const searchName = process.argv[2] || "Ibrahim Buhari";
  const searchLower = searchName.toLowerCase();

  console.log(`\n🔍 Searching for player: "${searchName}"\n`);

  // Search across all player collections
  let foundPlayer = null;
  let foundCollection = null;
  for (const col of ["Players", "PlayersWomen", "PlayersYouth"]) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const name = (d.fullName || "").toLowerCase();
      if (name.includes(searchLower) || searchLower.includes(name)) {
        foundPlayer = { id: doc.id, ...d };
        foundCollection = col;
        break;
      }
    }
    if (foundPlayer) break;
  }

  if (!foundPlayer) {
    console.log("❌ Player not found in any collection.");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════");
  console.log(`📋 PLAYER PROFILE: ${foundPlayer.fullName}`);
  console.log("═══════════════════════════════════════════════");
  console.log(`  Collection:    ${foundCollection}`);
  console.log(`  Age:           ${foundPlayer.age || "N/A"}`);
  console.log(`  Positions:     ${(foundPlayer.positions || []).join(", ") || "N/A"}`);
  console.log(`  Foot:          ${foundPlayer.foot || "N/A"}`);
  console.log(`  Nationality:   ${foundPlayer.nationality || "N/A"}`);
  console.log(`  Nationalities: ${(foundPlayer.nationalities || []).join(", ") || "N/A"}`);
  console.log(`  Market Value:  ${foundPlayer.marketValue || "N/A"}`);
  console.log(`  Salary Range:  ${foundPlayer.salaryRange || "N/A"}`);
  console.log(`  Transfer Fee:  ${foundPlayer.transferFee || "N/A"}`);
  const club = foundPlayer.currentClub;
  if (club && typeof club === "object") {
    console.log(`  Current Club:  ${club.clubName || "N/A"}`);
  } else {
    console.log(`  Current Club:  ${club || "N/A"}`);
  }
  console.log(`  Contract End:  ${foundPlayer.contractExpired || "N/A"}`);
  console.log(`  TM Profile:    ${foundPlayer.tmProfile || "N/A"}`);
  console.log(`  Has Mandate:   ${foundPlayer.haveMandate || false}`);
  console.log(`  Interested IL: ${foundPlayer.interestedInIsrael || false}`);

  // Determine which request collection to check
  const reqCollections = foundCollection === "PlayersWomen"
    ? ["ClubRequestsWomen"]
    : foundCollection === "PlayersYouth"
      ? ["ClubRequestsYouth"]
      : ["ClubRequests"];

  console.log(`\n🔎 Checking requests in: ${reqCollections.join(", ")}\n`);

  let totalRequests = 0;
  let matchingRequests = [];

  for (const reqCol of reqCollections) {
    const snap = await db.collection(reqCol).get();
    for (const doc of snap.docs) {
      const req = { id: doc.id, ...doc.data() };
      totalRequests++;
      if (req.status === "completed" || req.status === "cancelled") continue;
      if (matchesRequest(foundPlayer, req)) {
        matchingRequests.push(req);
      }
    }
  }

  console.log(`📊 Total requests scanned: ${totalRequests}`);
  console.log(`✅ Matching requests: ${matchingRequests.length}\n`);

  if (matchingRequests.length === 0) {
    console.log("No matching requests found for this player.");
  } else {
    console.log("═══════════════════════════════════════════════");
    console.log("MATCHING REQUESTS");
    console.log("═══════════════════════════════════════════════\n");

    for (const req of matchingRequests) {
      console.log(`  ▸ ${req.clubName || "Unknown Club"} (${req.clubCountry || "?"})${req.clubCountryFlag ? " " + req.clubCountryFlag : ""}`);
      console.log(`    Position:     ${req.position}`);
      console.log(`    Age Range:    ${req.ageDoesntMatter ? "Any" : `${req.minAge || "?"}-${req.maxAge || "?"}`}`);
      console.log(`    Salary Range: ${req.salaryRange || "Any"}`);
      console.log(`    Transfer Fee: ${req.transferFee || "Any"}`);
      console.log(`    Foot:         ${req.dominateFoot || "Any"}`);
      console.log(`    EU Only:      ${req.euOnly ? "Yes" : "No"}`);
      console.log(`    Notes:        ${req.notes || "-"}`);
      console.log(`    Contact:      ${req.contactName || "-"}`);
      console.log(`    Status:       ${req.status || "pending"}`);
      console.log(`    Request ID:   ${req.id}`);
      console.log("");

      // Explain why this matches
      const reasons = [];
      if (matchesPosition(foundPlayer.positions, req.position)) {
        reasons.push(`✓ Position: Player plays ${(foundPlayer.positions || []).join("/")} — request needs ${req.position}`);
      }
      if (req.ageDoesntMatter) {
        reasons.push(`✓ Age: No age requirement (age doesn't matter)`);
      } else {
        const min = req.minAge || 0;
        const max = req.maxAge || 999;
        reasons.push(`✓ Age: Player is ${foundPlayer.age} — request wants ${min}-${max}`);
      }
      const reqFoot = (req.dominateFoot || "").trim().toLowerCase();
      if (!reqFoot || reqFoot === "any") {
        reasons.push(`✓ Foot: No foot preference`);
      } else {
        reasons.push(`✓ Foot: Player is ${foundPlayer.foot || "unknown"} — request wants ${req.dominateFoot}`);
      }
      if (!req.salaryRange) {
        reasons.push(`✓ Salary: No salary requirement`);
      } else if (!foundPlayer.salaryRange) {
        reasons.push(`✓ Salary: Player has no salary data (included by default)`);
      } else {
        reasons.push(`✓ Salary: Player range "${foundPlayer.salaryRange}" matches request "${req.salaryRange}" (±1 tier)`);
      }
      if (!req.transferFee) {
        reasons.push(`✓ Fee: No transfer fee requirement`);
      } else if (!foundPlayer.transferFee) {
        reasons.push(`✓ Fee: Player has no fee data (included by default)`);
      } else {
        reasons.push(`✓ Fee: Player fee "${foundPlayer.transferFee}" matches request "${req.transferFee}"`);
      }
      if (req.euOnly) {
        const nats = foundPlayer.nationalities && foundPlayer.nationalities.length > 0
          ? foundPlayer.nationalities : (foundPlayer.nationality ? [foundPlayer.nationality] : []);
        reasons.push(`✓ EU: Player nationalities [${nats.join(", ")}] — has EU passport`);
      }

      console.log("    WHY IT MATCHES:");
      for (const r of reasons) {
        console.log(`      ${r}`);
      }
      console.log("");
      console.log("  ─────────────────────────────────────────────\n");
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
