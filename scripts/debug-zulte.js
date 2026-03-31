#!/usr/bin/env node
const admin = require("../functions/node_modules/firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();
const { matchPlayer } = require("../functions/callables/requestMatcher");

const SALARY_RANGES = [">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+"];
const FEE_TIERS = ["Free/Free loan", "<200", "300-600", "700-900", "1m+"];
const POSITION_ALIASES = {
  GOALKEEPER: "GK", "LEFT BACK": "LB", "CENTRE BACK": "CB", "CENTER BACK": "CB",
  "RIGHT BACK": "RB", "DEFENSIVE MIDFIELD": "DM", "CENTRAL MIDFIELD": "CM",
  "ATTACKING MIDFIELD": "AM", "RIGHT WINGER": "RW", "LEFT WINGER": "LW",
  "CENTRE FORWARD": "CF", "CENTER FORWARD": "CF", "SECOND STRIKER": "SS",
  "LEFT MIDFIELD": "LM", "RIGHT MIDFIELD": "RM", STRIKER: "CF", ST: "CF",
};
function normalizePosition(pos) {
  const upper = pos.trim().toUpperCase().replace(/-/g, " ");
  return POSITION_ALIASES[upper] || POSITION_ALIASES[upper.replace(/ /g, "")] || upper.replace(/ /g, "");
}

async function main() {
  // 1. Find all Zulte Waregem requests
  const reqSnap = await db.collection("ClubRequests").get();
  const allReqs = reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const zulteReqs = allReqs.filter((r) => (r.clubName || "").toLowerCase().includes("zulte"));

  if (zulteReqs.length === 0) {
    console.log("No Zulte Waregem requests found");
    process.exit(0);
  }

  for (const req of zulteReqs) {
    console.log("=== REQUEST ===");
    console.log("  ID:", req.id);
    console.log("  Club:", req.clubName);
    console.log("  Position:", req.position);
    console.log("  Status:", req.status);
    console.log("  Age:", req.minAge, "-", req.maxAge, "(doesntMatter:", req.ageDoesntMatter, ")");
    console.log("  Foot:", req.dominateFoot);
    console.log("  Salary:", req.salaryRange);
    console.log("  Fee:", req.transferFee);
    console.log("  EU Only:", req.euOnly);

    // Check match results
    const matchDoc = await db.collection("RequestMatchResults").doc(req.id).get();
    if (matchDoc.exists) {
      const data = matchDoc.data();
      console.log("  Match results:", (data.matchingPlayerIds || []).length, "players →", (data.matchingPlayerIds || []).slice(0, 5));
    } else {
      console.log("  Match results doc: DOES NOT EXIST");
    }
    console.log("");
  }

  // 2. Find AM players
  const playersSnap = await db.collection("Players").get();
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const amPlayers = players.filter((p) => {
    const positions = (p.positions || []).filter((x) => x && x.trim());
    return positions.some((pos) => normalizePosition(pos) === "AM");
  });

  console.log("=== AM PLAYERS IN ROSTER:", amPlayers.length, "===\n");

  // 3. Check each AM player against the Zulte AM request
  const req = zulteReqs.find((r) => (r.position || "").toUpperCase() === "AM") || zulteReqs[0];
  if (!req) { console.log("No AM request found"); process.exit(0); }

  console.log("Checking against request:", req.id, req.clubName, req.position);
  console.log("Request criteria: age", req.minAge, "-", req.maxAge, "| foot:", req.dominateFoot, "| salary:", req.salaryRange, "| fee:", req.transferFee, "| euOnly:", req.euOnly);
  console.log("");

  for (const p of amPlayers) {
    const reasons = [];
    const positions = (p.positions || []).filter((x) => x && x.trim());

    // Age
    if (req.ageDoesntMatter !== true) {
      const minA = req.minAge || 0;
      const maxA = req.maxAge || 999;
      const age = p.age ? parseInt(p.age) : null;
      if (age && (age < minA || age > maxA)) reasons.push("age=" + age + " not in " + minA + "-" + maxA);
    }

    // Foot
    const reqFoot = (req.dominateFoot || "").trim().toLowerCase();
    if (reqFoot && reqFoot !== "any") {
      const pFoot = (p.foot || "").trim().toLowerCase();
      if (pFoot && pFoot !== reqFoot) reasons.push("foot=" + pFoot + " vs " + reqFoot);
    }

    // Salary
    const reqSalary = (req.salaryRange || "").trim();
    const pSalary = (p.salaryRange || "").trim();
    if (reqSalary && pSalary) {
      const ri = SALARY_RANGES.findIndex((r) => r.toLowerCase() === reqSalary.toLowerCase());
      if (ri >= 0) {
        const accepted = [SALARY_RANGES[ri]];
        if (ri > 0) accepted.push(SALARY_RANGES[ri - 1]);
        if (ri < SALARY_RANGES.length - 1) accepted.push(SALARY_RANGES[ri + 1]);
        const match = accepted.some((r) => r.toLowerCase() === pSalary.toLowerCase());
        if (!match) reasons.push("salary=" + pSalary + " not in [" + accepted.join(",") + "]");
      }
    }

    // Fee
    const reqFee = (req.transferFee || "").trim();
    const pFee = (p.transferFee || "").trim();
    if (reqFee && pFee) {
      const ri2 = FEE_TIERS.findIndex((r) => r.toLowerCase() === reqFee.toLowerCase());
      const pi2 = FEE_TIERS.findIndex((r) => r.toLowerCase() === pFee.toLowerCase());
      if (ri2 >= 0 && pi2 >= 0 && pi2 > ri2) reasons.push("fee=" + pFee + " above budget " + reqFee);
    }

    // EU
    if (req.euOnly) {
      const EU = new Set(["austria","belgium","bulgaria","croatia","cyprus","czech republic","czechia","denmark","estonia","finland","france","germany","greece","hungary","ireland","italy","latvia","lithuania","luxembourg","malta","netherlands","poland","portugal","romania","slovakia","slovenia","spain","sweden"]);
      const nats = (p.nationalities && p.nationalities.length > 0) ? p.nationalities : p.nationality ? [p.nationality] : [];
      if (nats.length > 0) {
        const hasEu = nats.some((n) => EU.has(n.trim().toLowerCase()));
        if (!hasEu) reasons.push("not EU: " + nats.join(","));
      }
    }

    const status = reasons.length === 0 ? "✅ MATCH" : "❌ " + reasons.join("; ");
    console.log("  " + (p.fullName || p.id).padEnd(30) + " | pos=" + positions.join(",").padEnd(30) + " | age=" + (p.age || "?").toString().padEnd(3) + " | foot=" + (p.foot || "?").padEnd(6) + " | salary=" + (pSalary || "?").padEnd(6) + " | fee=" + (pFee || "?").padEnd(15) + " | " + status);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
