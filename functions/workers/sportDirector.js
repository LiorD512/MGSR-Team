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
 *
 * After code checks, Gemini generates Sport Director verdicts for top approved profiles
 * including full request-fit analysis (does the player match EVERY criteria?).
 */

const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ═══════════════════════════════════════════════════════════════
// Per-90 quality minimums by profile type + position group
// ═══════════════════════════════════════════════════════════════
const QUALITY_BARS = {
  BREAKOUT_SEASON: {
    attacker: { minGoalsPer90: 0.35, minContribPer90: 0.50 },
    midfielder: { minGoalsPer90: 0.12, minContribPer90: 0.30 },
  },
  YOUNG_STRIKER_HOT: {
    attacker: { minGoalsPer90: 0.25, minContribPer90: 0.35 },
  },
  LOW_VALUE_STARTER: {
    attacker: { minContribPer90: 0.15 },
    midfielder: { minContribPer90: 0.10 },
  },
};

// Minimum matchScore by league tier
const MIN_SCORE_BY_TIER = {
  1: 72,
  2: 68,
  3: 65,
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
  if ((data.profileType === "HIDDEN_GEM" || data.profileType === "UNDERVALUED_BY_FM") && data.fmPa == null) {
    issues.push("missing_fm_critical");
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Check 2: Per-90 quality — is the performance rate actually good?
// ═══════════════════════════════════════════════════════════════
function checkPer90Quality(data) {
  const issues = [];
  const posGroup = getPositionGroup(data.position);
  const minutes90s = data.fbrefMinutes90s || 0;

  if (minutes90s <= 0) {
    // No minutes = can't validate performance (except CONTRACT_EXPIRING)
    if (data.profileType !== "CONTRACT_EXPIRING" && data.profileType !== "HIGH_VALUE_BENCHED") {
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

  // Player 28+ with significant cost and no contract urgency = limited upside
  if (data.age >= 28 && data.profileType !== "CONTRACT_EXPIRING" && data.marketValueEuro > 500_000) {
    issues.push("old_expensive_no_upside");
  }

  // HIGH_VALUE_BENCHED at tier 3+ = benched at a low level, not good
  if (data.profileType === "HIGH_VALUE_BENCHED" && data.leagueTier >= 3) {
    issues.push("benched_at_low_tier");
  }

  // HIDDEN_GEM with FM PA at the bare minimum (130-134) AND age 23-24 = too little ceiling left
  if (data.profileType === "HIDDEN_GEM" && data.fmPa != null && data.fmPa <= 134 && data.age >= 23) {
    issues.push("low_ceiling_hidden_gem");
  }

  // Monchi Method: Declining value arc — player 26+ with no resale potential
  // and low FM potential = end-of-line. Needs exceptional current performance.
  if (data.age >= 26 && data.profileType !== "CONTRACT_EXPIRING") {
    const hasResale = data.fmPa != null && data.fmPa >= 140 && data.age <= 27;
    const isExceptionalPerformer = (data.contribPer90 || 0) >= 0.5;
    if (!hasResale && !isExceptionalPerformer && data.marketValueEuro > 800_000) {
      issues.push("no_value_arc_upside");
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// Check 4: Minimum score by league tier
// ═══════════════════════════════════════════════════════════════
function checkScoreThreshold(data) {
  const minScore = MIN_SCORE_BY_TIER[data.leagueTier] || 65;
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
  if (val >= 1_500_000 && data.age >= 27 && data.profileType !== "CONTRACT_EXPIRING") {
    issues.push("expensive_old_no_resale");
  }

  // Tier 1 league regular starter — won't move to Israel unless contract is expiring
  const leagueLower = (data.league || "").toLowerCase();
  const isTier1 = TIER_1_KEYWORDS.some((kw) => leagueLower.includes(kw));
  if (isTier1 && data.profileType !== "CONTRACT_EXPIRING" && data.profileType !== "HIGH_VALUE_BENCHED") {
    const minutes90s = data.fbrefMinutes90s || 0;
    if (minutes90s >= 10) {
      // Regular starter in a top-5 league — zero chance of moving to Israel
      issues.push("tier1_starter_unrealistic");
    }
  }

  // Tier 3 goal inflation — scoring 15 goals in Macedonia/Azerbaijan != Ligat Ha'al quality
  if (data.leagueTier >= 3 && isAttacker(data.position)) {
    const goals = data.fbrefGoals || 0;
    const minutes90s = data.fbrefMinutes90s || 0;
    if (goals >= 10 && minutes90s > 0) {
      const goalsPer90 = goals / minutes90s;
      // Insanely high rate in a weak league — looks good on paper, likely inflated
      if (goalsPer90 > 0.7) {
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
  const minutes90s = data.fbrefMinutes90s || 0;
  const goals = data.fbrefGoals || 0;
  const assists = data.fbrefAssists || 0;

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
    const expYear = parseInt(data.contractExpires, 10);
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
// Gemini Sport Director executive evaluation (top profiles only)
// ═══════════════════════════════════════════════════════════════
async function generateDirectorVerdicts(approvedProfiles, agentReports) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) return {};

  // Only evaluate top 20 profiles (cost-efficient)
  const topProfiles = approvedProfiles
    .sort((a, b) => b.data.matchScore - a.data.matchScore)
    .slice(0, 20);

  if (topProfiles.length === 0) return {};

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

    const playerLines = topProfiles.map((pw, i) => {
      const d = pw.data;
      const per90 = d.fbrefMinutes90s > 0
        ? `G/90: ${d.goalsPer90.toFixed(2)}, (G+A)/90: ${d.contribPer90.toFixed(2)}`
        : "no per-90 data";
      const nationality = d.nationality || "unknown";
      return `${i + 1}. ${d.playerName} (${d.age}, ${nationality}, ${d.position}, ${d.club}, ${d.league}, Tier ${d.leagueTier})
   Agent: ${d.agentId} | Profile: ${d.profileType} | Score: ${d.matchScore}/100
   Value: ${d.marketValue} (€${d.marketValueEuro}) | Contract: ${d.contractExpires || "?"}
   FM PA: ${d.fmPa || "?"}, CA: ${d.fmCa || "?"} | ${per90}
   Stats: ${d.fbrefGoals || 0}G ${d.fbrefAssists || 0}A in ${d.fbrefMinutes90s?.toFixed(1) || 0} 90s
   Reason: ${d.matchReason}
   Director code issues: ${(pw.directorReasons || []).join(", ") || "none"}`;
    }).join("\n");

    // Include agent performance context
    const agentContext = Object.entries(agentReports)
      .map(([id, r]) => `${id}: Grade ${r.overallGrade}, ${r.approvalRate}% approved, ${r.freshnessGrade}`)
      .join(" | ");

    const prompt = `Evaluate these ${topProfiles.length} profiles from my AI agents.
Your job: verify data accuracy, check Israeli market realism, assess the VALUE ARC (Monchi method), and validate that each player truly fits across all four dimensions (technical, physical, tactical, mental).

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
    if (!jsonMatch) return {};

    const verdicts = JSON.parse(jsonMatch[0]);
    const verdictMap = {};
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
    return verdictMap;
  } catch (err) {
    console.warn("[SportDirector] Gemini verdict generation failed (non-fatal):", err.message);
    return {};
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

  // Load previous run URLs for freshness detection
  const previousUrls = await loadPreviousRunUrls();

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
      i.startsWith("impossible_goal_rate")
    );

    if (criticalIssues.length > 0) {
      rejected.push({ ...profile, directorVerdict: "rejected", directorReasons: allIssues });
      agentStats[agentId].rejected++;
      for (const issue of allIssues) {
        agentStats[agentId].rejectionReasons[issue] =
          (agentStats[agentId].rejectionReasons[issue] || 0) + 1;
      }
    } else if (allIssues.length >= 3) {
      // 3+ non-critical issues = cumulative quality concern → reject
      rejected.push({ ...profile, directorVerdict: "rejected", directorReasons: allIssues });
      agentStats[agentId].rejected++;
      for (const issue of allIssues) {
        agentStats[agentId].rejectionReasons[issue] =
          (agentStats[agentId].rejectionReasons[issue] || 0) + 1;
      }
    } else {
      // 0-2 minor issues → approved
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
  const directorVerdicts = await generateDirectorVerdicts(approved, agentReports);

  // Merge verdicts into approved profiles + handle REJECT_OVERRIDE
  const postGeminiRejected = [];
  for (const profile of approved) {
    const v = directorVerdicts[profile.data.playerName.toLowerCase().trim()];
    if (v) {
      profile.data.directorVerdict = v.verdict;
      profile.data.directorAction = v.action;
      profile.data.directorFitScore = v.fitScore;
      profile.data.directorValueArc = v.valueArc;
      profile.data.directorDataFlags = v.dataFlags;
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

module.exports = { reviewProfiles };
