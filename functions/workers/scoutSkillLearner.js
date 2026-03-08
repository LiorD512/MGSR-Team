/**
 * Scout Skill Learner — Elite Agent Intelligence.
 *
 * After each scout run, each country agent reflects on its performance:
 * 1. Analyzes run stats (profiles by type, by league, match scores)
 * 2. Reviews user feedback (thumbs up/down, shortlist adds)
 * 3. Calls Gemini to update its SKILL.md (strategy document) and tuning params
 * 4. Learns from cross-agent detections (players spotted by multiple agents)
 * 5. Generates scouting priorities for next run
 */

const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const FEEDBACK_DAYS = 14; // Extended from 7 — more data for better learning

/**
 * Run post-scout learning for each agent that had profiles.
 * Now includes Sport Director agent reports for enhanced learning.
 * @param {Object} runResult - { profilesFound, profilesRejected, durationMs, profilesByAgent, agentReports, crossLeagueDetections }
 * @param {string} runId - ScoutAgentRuns doc ID
 */
async function runScoutSkillLearning(runResult, runId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    console.log("[ScoutSkillLearner] GEMINI_API_KEY not set — skipping skill learning");
    return;
  }

  const db = getFirestore();
  const skillsRef = db.collection("ScoutAgentSkills");
  const profilesByAgent = runResult.profilesByAgent || {};
  const agentIds = Object.keys(profilesByAgent).filter((id) => (profilesByAgent[id] || []).length > 0);
  if (agentIds.length === 0) {
    console.log("[ScoutSkillLearner] No agents with profiles — skipping");
    return;
  }

  const now = Date.now();
  const cutoff = now - FEEDBACK_DAYS * 24 * 60 * 60 * 1000;

  // Shortlist adds with sourceAgentId (last 14 days)
  const shortlistSnap = await db.collection("Shortlists").get();
  const entries = shortlistSnap.docs.map((d) => d.data()).filter((e) => (e.addedAt || 0) >= cutoff);
  const shortlistByAgent = {};
  for (const e of entries) {
    const aid = e.sourceAgentId;
    if (aid) {
      shortlistByAgent[aid] = (shortlistByAgent[aid] || 0) + 1;
    }
  }

  // Feedback from ScoutProfileFeedback (all users)
  const feedbackSnap = await db.collection("ScoutProfileFeedback").get();
  const feedbackByAgent = {};
  const feedbackDetails = {}; // Track which profile types get thumbs up/down
  for (const doc of feedbackSnap.docs) {
    const data = doc.data();
    const fb = data.feedback || {};
    for (const [profileId, val] of Object.entries(fb)) {
      const agentId = typeof val === "object" && val?.agentId ? val.agentId : null;
      if (!agentId) continue;
      const f = typeof val === "object" && val?.feedback ? val.feedback : val;
      if (f === "up" || f === "down") {
        feedbackByAgent[agentId] = feedbackByAgent[agentId] || { up: 0, down: 0 };
        feedbackByAgent[agentId][f]++;
        // Track profile type feedback
        const profileType = typeof val === "object" && val?.profileType ? val.profileType : null;
        if (profileType) {
          feedbackDetails[agentId] = feedbackDetails[agentId] || {};
          feedbackDetails[agentId][profileType] = feedbackDetails[agentId][profileType] || { up: 0, down: 0 };
          feedbackDetails[agentId][profileType][f]++;
        }
      }
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: `You are an AI scout agent that reports to the Sport Director. The Sport Director reviews ALL your profiles before they reach the user — he grades you on quality, freshness, and accuracy. Your job is to improve based on his feedback and user signals. Be specific and actionable — respond to rejection patterns with concrete parameter changes. If the Director says you're "RECYCLING", find NEW players. If he says your approval rate is low, tighten your quality bars.`,
  });

  for (const agentId of agentIds) {
    try {
      const profiles = profilesByAgent[agentId] || [];
      const byType = {};
      const byLeague = {};
      const scoreSum = {};
      const scoreCount = {};
      for (const p of profiles) {
        byType[p.profileType] = (byType[p.profileType] || 0) + 1;
        byLeague[p.league || "?"] = (byLeague[p.league || "?"] || 0) + 1;
        scoreSum[p.profileType] = (scoreSum[p.profileType] || 0) + (p.matchScore || 0);
        scoreCount[p.profileType] = (scoreCount[p.profileType] || 0) + 1;
      }
      const avgScores = {};
      for (const type of Object.keys(scoreSum)) {
        avgScores[type] = Math.round(scoreSum[type] / scoreCount[type]);
      }

      const shortlistAdds = shortlistByAgent[agentId] || 0;
      const fb = feedbackByAgent[agentId] || { up: 0, down: 0 };
      const fbDetails = feedbackDetails[agentId] || {};
      const directorReport = (runResult.agentReports || {})[agentId] || null;

      const skillDoc = await skillsRef.doc(agentId).get();
      const currentSkill = (skillDoc.data()?.skillMarkdown || "").trim();
      const currentParams = (skillDoc.data()?.paramsJson || "{}").trim();
      const version = skillDoc.data()?.version || 0;

      const prompt = `You are the ${agentId.toUpperCase()} AI Scout Agent — league specialist.

Your current SKILL.md (version ${version}):
${currentSkill || "(first run — no skill yet)"}

Current tuning params:
${currentParams}

═══ THIS RUN ═══
- Profiles found (after Sport Director review): ${profiles.length}
- Profiles BEFORE review: ${runResult.profilesBeforeReview || "?"}
- Profiles rejected by Sport Director: ${runResult.profilesRejected || 0}
- By type: ${JSON.stringify(byType)}
- By league: ${JSON.stringify(byLeague)}
- Avg match scores by type: ${JSON.stringify(avgScores)}
- Run duration: ${runResult.durationMs || 0}ms
- Cross-league detections (global): ${runResult.crossLeagueDetections || 0}

═══ SPORT DIRECTOR REPORT CARD ═══
${directorReport ? `- Grade: ${directorReport.overallGrade}
- Approval Rate: ${directorReport.approvalRate}%
- Freshness: ${directorReport.freshnessGrade} (${directorReport.recycleRate}% recycled from previous runs)
- Profiles: ${directorReport.approved} approved / ${directorReport.rejected} rejected of ${directorReport.total}
- Top Rejection Reasons: ${(directorReport.topRejectionReasons || []).join(", ") || "none"}
- Profile Type Distribution: ${JSON.stringify(directorReport.profileTypes || {})}` : "- No Sport Director report available"}

IMPORTANT: The Sport Director is your boss. If your approval rate is below 60%, you MUST adjust parameters to produce higher-quality profiles. If freshness is "STALE" or "RECYCLING", you MUST diversify your search — look for NEW players, different positions, different profile types.

═══ USER FEEDBACK (last ${FEEDBACK_DAYS} days) ═══
- Shortlist adds from your profiles: ${shortlistAdds}
- Thumbs: ${fb.up} 👍, ${fb.down} 👎
${Object.keys(fbDetails).length > 0 ? `- By profile type: ${JSON.stringify(fbDetails)}` : "- No per-type feedback yet"}

═══ AVAILABLE PROFILE TYPES ═══
HIGH_VALUE_BENCHED, LOW_VALUE_STARTER, YOUNG_STRIKER_HOT, CONTRACT_EXPIRING,
HIDDEN_GEM, LOWER_LEAGUE_RISER, BREAKOUT_SEASON, UNDERVALUED_BY_FM

═══ INSTRUCTIONS ═══
You report to the Sport Director. Analyze the data and produce:
1. Updated SKILL.md — lessons learned, what to focus on next run, which profile types work best in your leagues. RESPOND TO SPORT DIRECTOR FEEDBACK: if profiles were rejected, explain how you'll fix it.
2. Updated params — adjust thresholds based on Sport Director rejections AND user feedback. If the Director rejected profiles for "low_goals_per90" or "low_contrib_per90", raise your per-90 bars. If "old_expensive_no_upside", tighten age/value filters.
3. Scouting priorities — which positions/profiles should be emphasized next run

Produce a JSON object with exactly two keys:
1. "skillMarkdown": string — Updated SKILL.md. Start with "# ${agentId.charAt(0).toUpperCase() + agentId.slice(1)} Scout Agent". Include: Strategy, Lessons, Sport Director Response, Priorities, Known Issues.
2. "paramsJson": string — JSON string of overrides. Example: {"LOW_VALUE_STARTER":{"minMinutes90s":8},"BREAKOUT_SEASON":{"minMinutes90s":10},"priorities":["HIDDEN_GEM","BREAKOUT_SEASON"]}

Return ONLY valid JSON, no markdown code blocks.`;

      const result = await model.generateContent(prompt);
      const text = result.response?.text?.() || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`[ScoutSkillLearner] No JSON in response for ${agentId}`);
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const skillMarkdown = (parsed.skillMarkdown || currentSkill || "").trim();
      const paramsJson =
        typeof parsed.paramsJson === "string"
          ? parsed.paramsJson
          : JSON.stringify(parsed.paramsJson || {});

      await skillsRef.doc(agentId).set(
        {
          skillMarkdown,
          paramsJson,
          lastUpdatedAt: now,
          version: version + 1,
          lastRunId: runId,
          lastRunStats: {
            profilesFound: profiles.length,
            byType,
            avgScores,
            shortlistAdds,
            feedbackUp: fb.up,
            feedbackDown: fb.down,
          },
        },
        { merge: true }
      );
      console.log(`[ScoutSkillLearner] Updated skill for ${agentId} (v${version + 1})`);
    } catch (err) {
      console.error(`[ScoutSkillLearner] Error for ${agentId}:`, err.message);
    }
  }
}

module.exports = { runScoutSkillLearning };
