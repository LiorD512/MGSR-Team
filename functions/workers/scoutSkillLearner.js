/**
 * Scout Skill Learner — after each run, each agent updates its SKILL.md.
 * Collects run stats, shortlist adds, feedback; calls Gemini; writes to ScoutAgentSkills.
 */

const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const FEEDBACK_DAYS = 7;

/**
 * Run post-scout learning for each agent that had profiles.
 * @param {Object} runResult - { profilesFound, durationMs, profilesByAgent: { agentId: [{ docId, profileType, league }] } }
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

  // Shortlist adds with sourceAgentId (last 7 days)
  const shortlistSnap = await db.collection("Shortlists").doc("team").get();
  const entries = (shortlistSnap.data()?.entries || []).filter((e) => (e.addedAt || 0) >= cutoff);
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
      }
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  for (const agentId of agentIds) {
    try {
      const profiles = profilesByAgent[agentId] || [];
      const byType = {};
      const byLeague = {};
      for (const p of profiles) {
        byType[p.profileType] = (byType[p.profileType] || 0) + 1;
        byLeague[p.league || "?"] = (byLeague[p.league || "?"] || 0) + 1;
      }
      const shortlistAdds = shortlistByAgent[agentId] || 0;
      const fb = feedbackByAgent[agentId] || { up: 0, down: 0 };

      const skillDoc = await skillsRef.doc(agentId).get();
      const currentSkill = (skillDoc.data()?.skillMarkdown || "").trim();
      const currentParams = (skillDoc.data()?.paramsJson || "{}").trim();

      const prompt = `You are the ${agentId} AI Scout. After each run, you update your SKILL.md to improve.

Current skill:
${currentSkill || "(none yet)"}

This run's stats:
- Profiles found: ${profiles.length} (by type: ${JSON.stringify(byType)}, by league: ${JSON.stringify(byLeague)})
- Run duration: ${runResult.durationMs || 0}ms

Shortlist adds (last ${FEEDBACK_DAYS} days) for your profiles: ${shortlistAdds}
Manual feedback: ${fb.up} up, ${fb.down} down

Produce a JSON object with exactly two keys:
1. "skillMarkdown": string — Updated SKILL.md content with clear instructions, rules, and lessons learned. Be specific. If no changes needed, return the current skill.
2. "paramsJson": string — JSON string of overrides for profile matching. Use "{}" if no changes. Example: {"LOW_VALUE_STARTER":{"minMinutes90s":8},"leagueWeights":{"eredivisie":1.2}}

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
          version: (skillDoc.data()?.version || 0) + 1,
          lastRunId: runId,
        },
        { merge: true }
      );
      console.log(`[ScoutSkillLearner] Updated skill for ${agentId}`);
    } catch (err) {
      console.error(`[ScoutSkillLearner] Error for ${agentId}:`, err.message);
    }
  }
}

module.exports = { runScoutSkillLearning };
