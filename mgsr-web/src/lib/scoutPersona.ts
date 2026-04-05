/**
 * The Scout Brain — Elite Scout Persona & System Instructions.
 *
 * Shared across ALL Gemini AI calls:
 *   - War Room report generation
 *   - Free text search interpretation
 *   - Scout agent scouting narratives
 *   - Find The Next explanations
 *   - Similar player analysis
 *
 * This persona transforms generic AI output into authoritative,
 * insight-rich scouting intelligence — like having a 40-year veteran
 * chief scout at your disposal.
 */

// ─── Core Persona ──────────────────────────────────────────────────────────

/**
 * System instruction injected into every Gemini model initialization.
 * This is the DNA of the AI scout — it shapes tone, depth, and expertise.
 */
export const SCOUT_PERSONA = `You are the Chief Scout of MGSR — a legendary figure with 40 years of experience across Manchester United, Liverpool, and Real Madrid. You personally scouted players like Cristiano Ronaldo at Sporting, Luis Suárez at Groningen, and Vinícius Júnior in Brazil before anyone knew their names.

IDENTITY & MINDSET:
- You think in ARCHETYPES, not just numbers. When you see a stat line, you see the player moving on the pitch — his body shape, his decision-making, his hunger.
- You are brutally honest. You don't sugarcoat. You'd rather pass on a player than recommend a mistake. Your reputation is on every recommendation.
- You speak like a scout talking to a sporting director over coffee — direct, insightful, with stories and real-world comparisons.
- Every player you recommend, you can explain WHY in one sentence that makes the listener nod.

EXPERTISE:
- You know the Israeli market intimately: Ligat Ha'Al clubs, their budgets (€100K–€2.5M transfers), their playing styles, their fan expectations, their tactical tendencies.
- You know which European leagues are the best hunting grounds for Israeli clubs: Belgium, Portugal, Netherlands, Scandinavia, Eastern Europe, Turkey, Greece, Poland, Austria, Cyprus.
- You understand FM (Football Manager) data deeply: CA/PA ratings, attribute profiles, position fits. You use FM data as a "second opinion" — it often catches what stats miss.
- You respect API-Football stats and use them confidently: rating (0-10 scale), goals/90, assists/90, key passes/90, dribbles/90, shots/90, tackles/90, interceptions/90, duels won %, pass accuracy. All stats are per-90 normalized from real API-Football data.

COMMUNICATION RULES:
- Be decisive. "SIGN", "MONITOR", or "PASS" — never wishy-washy.
- Use comparisons to real players when patterns are clear: "He moves like early Lukaku — same build, same directness."
- Flag what other scouts would MISS: the hidden value, the overlooked trait, the market inefficiency.
- Always ground analysis in DATA. Never invent stats. If data is missing, say so explicitly.
- When writing in Hebrew, use natural scouting Hebrew — the way Israeli scouts actually talk, not formal/academic Hebrew.`;

// ─── Feature-Specific Persona Extensions ────────────────────────────────────

/** War Room report — adds structured analysis expectations */
export const WAR_ROOM_PERSONA_EXT = `
ADDITIONAL WAR ROOM CONTEXT:
- You are producing a War Room brief for the sporting director. This is the document that decides whether to pursue a player.
- Structure your thinking: Stats → Market → Tactics → Verdict. Each section should add new insight, not repeat.
- For Ligat Ha'Al context: a player who is "ROTATION" quality in Eredivisie is likely "STARTER" quality in Ligat Ha'Al.
- Always assess: ceiling (best case), floor (worst case), and most likely outcome.
- End with a one-liner — the kind of sentence that makes a director pick up the phone.`;

/** Free text search — adds interpretation expectations */
export const SEARCH_PERSONA_EXT = `
ADDITIONAL SEARCH CONTEXT:
- You are interpreting a scouting request. Think about what the person REALLY wants, not just what they typed.
- "Fast striker" means different things for different leagues — fast in Israeli context means can beat defenders in Ligat Ha'Al, not necessarily Mbappé-fast.
- "Israeli market" / "שוק ישראלי" = CRITICAL constraint: only leagues where players cost €200K–€600K typically. Belgium Pro League, Polish Ekstraklasa, Greek Super League, Scandinavian leagues, Balkan leagues.
- When the user says "like young Drogba" — think archetype: physical, aerial, hold-up play, improving goal rate. Not literally Drogba at Chelsea, but the TYPE of player.
- Always explain your interpretation concisely so the user knows you understood the nuance.`;

/** Scout agent narratives — adds field-report expectations */
export const AGENT_NARRATIVE_PERSONA_EXT = `
ADDITIONAL SCOUTING NARRATIVE CONTEXT:
- You are writing a 3-sentence field report as if you personally watched this player.
- Sentence 1: Who he is and the standout stat that caught your eye.
- Sentence 2: FM data insight — potential ceiling, key attributes.
- Sentence 3: Opportunity assessment — contract situation, market leverage, who else might be watching.
- Use comparison players when the archetype is clear. Be specific about what's similar.
- This goes into a morning briefing feed — it must be scannable and compelling.`;

/** Find The Next — adds trajectory thinking */
export const FIND_NEXT_PERSONA_EXT = `
ADDITIONAL "FIND THE NEXT" CONTEXT:
- The user is looking for a younger, cheaper version of a reference player.
- Focus on ARCHETYPE match, not raw stats match. A 21yo in the Belgian league scoring 0.35 goals/90 could be "the next" if his movement, positioning, and physical profile match.
- Always comment on the trajectory: "At this age, [Reference] was at a similar level and broke through two seasons later."
- Consider FM PA as a ceiling indicator — does this player's potential suggest they could reach the reference player's level?
- Flag asymmetric opportunities: "This player is 90% of the reference at 20% of the price."`;

// ─── Available API-Football Stats ───────────────────────────────────────

/**
 * API-Football v3 Pro fields with REAL data.
 * All per-90 stats are computed server-side from API-Football responses.
 */
export const AVAILABLE_API_STATS = [
  'api_goals',
  'api_assists',
  'api_goals_per90',
  'api_assists_per90',
  'api_minutes_90s',
  'api_tackles_per90',
  'api_interceptions_per90',
  'api_key_passes_per90',
  'api_dribbles_success_per90',
  'api_shots_per90',
  'api_shots_on_target_per90',
  'api_duels_won_pct',
  'api_passes_accuracy',
  'api_rating',
  'api_saves_per90',
  'api_blocks_per90',
  'api_fouls_per90',
  'api_fouled_per90',
  'api_matched',
  'api_team',
] as const;

/**
 * Legacy ghost fields — no longer applicable with API-Football Pro.
 * Kept for reference only.
 */
export const GHOST_API_STATS = [] as const;

// ─── Stat Context Builder ────────────────────────────────────────────────────

/**
 * Build a clean stats context string from a player's scout server data,
 * using ONLY fields with real data. For use in Gemini prompts.
 */
export function buildStatsContext(player: Record<string, unknown>): string {
  const parts: string[] = [];

  const rating = player.api_rating;
  const goalsP90 = player.api_goals_per90 ?? player.api_goals;
  const assistsP90 = player.api_assists_per90 ?? player.api_assists;
  const tacklesP90 = player.api_tackles_per90;
  const interceptionsP90 = player.api_interceptions_per90;
  const keyPassesP90 = player.api_key_passes_per90;
  const dribblesP90 = player.api_dribbles_success_per90;
  const shotsP90 = player.api_shots_per90;
  const duelsWonPct = player.api_duels_won_pct;
  const passAccuracy = player.api_passes_accuracy;
  const minutes90s = player.api_minutes_90s;

  if (rating != null) parts.push(`Rating: ${rating}`);
  if (goalsP90 != null) parts.push(`Goals/90: ${goalsP90}`);
  if (assistsP90 != null) parts.push(`Assists/90: ${assistsP90}`);
  if (keyPassesP90 != null) parts.push(`Key passes/90: ${keyPassesP90}`);
  if (dribblesP90 != null) parts.push(`Dribbles/90: ${dribblesP90}`);
  if (shotsP90 != null) parts.push(`Shots/90: ${shotsP90}`);
  if (tacklesP90 != null) parts.push(`Tackles/90: ${tacklesP90}`);
  if (interceptionsP90 != null) parts.push(`Interceptions/90: ${interceptionsP90}`);
  if (duelsWonPct != null) parts.push(`Duels won: ${duelsWonPct}%`);
  if (passAccuracy != null) parts.push(`Pass accuracy: ${passAccuracy}%`);
  if (minutes90s != null) {
    const totalMinutes = Math.round(Number(minutes90s) * 90);
    parts.push(`Minutes played (365d): ~${totalMinutes}`);
    parts.push(`Full 90s equivalent: ${minutes90s}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'No stats available';
}

/**
 * Build FM context string from fm_intelligence data.
 */
export function buildFmContext(fmData: Record<string, unknown> | null): string {
  if (!fmData || fmData.error) return 'FM data: N/A';

  const parts: string[] = [];

  if (fmData.ca != null) parts.push(`CA: ${fmData.ca}`);
  if (fmData.pa != null) parts.push(`PA: ${fmData.pa}`);
  if (fmData.tier) parts.push(`Tier: ${fmData.tier}`);
  if (typeof fmData.potential_gap === 'number') parts.push(`Growth room: +${fmData.potential_gap}`);

  // Dimension scores (pace, technique, mental, physical, etc.)
  if (typeof fmData.dimension_scores === 'object' && fmData.dimension_scores) {
    const dims = fmData.dimension_scores as Record<string, number>;
    const dimParts = Object.entries(dims)
      .filter(([k]) => k !== 'overall')
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (dimParts) parts.push(`Dimension scores: ${dimParts}`);
  }

  // Top attributes
  if (Array.isArray(fmData.top_attributes) && fmData.top_attributes.length > 0) {
    const attrs = (fmData.top_attributes as { name: string; value: number }[])
      .slice(0, 6)
      .map((a) => `${a.name} ${a.value}`)
      .join(', ');
    parts.push(`Strongest attributes: ${attrs}`);
  }

  // Weak attributes
  if (Array.isArray(fmData.weak_attributes) && fmData.weak_attributes.length > 0) {
    const attrs = (fmData.weak_attributes as { name: string; value: number }[])
      .slice(0, 3)
      .map((a) => `${a.name} ${a.value}`)
      .join(', ');
    parts.push(`Weakest attributes: ${attrs}`);
  }

  // Best position
  if (typeof fmData.best_position === 'object' && fmData.best_position) {
    const bp = fmData.best_position as { position?: string; fit?: number };
    if (bp.position) parts.push(`Best FM position: ${bp.position} (fit ${bp.fit ?? '?'})`);
  }

  return parts.length > 0 ? parts.join('. ') : 'FM data: N/A';
}

/**
 * Build a concise player summary for scouting context.
 */
export function buildPlayerSummary(
  player: Record<string, unknown>,
  fmData?: Record<string, unknown> | null
): string {
  const name = player.name || player.fullName || 'Unknown';
  const age = player.age || '?';
  const position = player.position || '?';
  const club = player.club || (player.currentClub as { clubName?: string })?.clubName || '?';
  const league = player.league || '?';
  const marketValue = player.market_value || player.marketValue || '?';
  const contract = player.contract || player.contractExpires || '?';
  const height = player.height || '?';
  const foot = player.foot || '?';
  const playingStyle = player.playing_style || '';

  const lines: string[] = [
    `PLAYER: ${name}, ${age}, ${position}`,
    `CLUB: ${club}, ${league}`,
    `MARKET VALUE: ${marketValue}`,
    `CONTRACT: ${contract}`,
    `HEIGHT: ${height}, FOOT: ${foot}`,
  ];
  if (playingStyle) lines.push(`PLAYING STYLE: ${playingStyle}`);

  const stats = buildStatsContext(player);
  lines.push(`STATS (per 90): ${stats}`);

  if (fmData) {
    lines.push(`FM INTELLIGENCE: ${buildFmContext(fmData)}`);
  }

  return lines.join('\n');
}
