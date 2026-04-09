/**
 * Football scout server API - recruitment search for requests.
 * Matches Android ScoutApiClient.findPlayersForRequest.
 * Uses /api/scout/recruitment proxy to avoid CORS when deployed on Vercel.
 */

// Use proxy to avoid CORS when deployed (browser → Vercel → Render)
const SCOUT_BASE_URL = '/api/scout';

// Direct Render URL for endpoints with server-side Gemini enrichment (no Vercel proxy needed)
const RENDER_SCOUT_URL = 'https://football-scout-server-l38w.onrender.com';

/** Classify FM Current Ability into a tier label (mirrors Python classify_fm_tier) */
function classifyFmTier(ca: number): string | undefined {
  if (ca <= 0) return undefined;
  if (ca >= 90) return 'world_class';
  if (ca >= 80) return 'elite';
  if (ca >= 70) return 'top_league';
  if (ca >= 60) return 'solid_pro';
  if (ca >= 50) return 'lower_league';
  return 'prospect';
}

export interface ScoutPlayerSuggestion {
  name: string;
  position: string;
  age: string;
  marketValue: string;
  transfermarktUrl: string | null;
  similarityReason?: string;
  playingStyle?: string;
  matchPercent?: number;
  scoutAnalysis?: string;
  /** Score breakdown: why this player matched (for testing/debug) */
  scoreBreakdown?: {
    clubFit?: number;
    realism?: number;
    noteFit?: number;
  };
  league?: string;
  club?: string;
  nationality?: string;
  height?: string;
  contractEnd?: string;
  foot?: string;
  /** Football Manager Current Ability (1-200) */
  fmCa?: number;
  /** Football Manager Potential Ability (1-200) */
  fmPa?: number;
  /** PA minus CA — growth room */
  fmPotentialGap?: number;
  /** FM tier classification */
  fmTier?: string;
}

export interface RecruitmentParams {
  position?: string;
  ageMin?: number;
  ageMax?: number;
  foot?: string;
  notes?: string;
  transferFee?: string;
  salaryRange?: string;
  excludeUrls?: string[];
  lang?: string;
  requestId?: string;
  clubUrl?: string;
  clubName?: string;
  clubCountry?: string;
  limit?: number;
}

function buildUrl(params: RecruitmentParams): string {
  const search = new URLSearchParams();
  if (params.position) search.set('position', params.position);
  if (params.ageMin != null) search.set('age_min', String(params.ageMin));
  if (params.ageMax != null) search.set('age_max', String(params.ageMax));
  if (params.foot) search.set('foot', params.foot);
  if (params.notes?.trim()) search.set('notes', params.notes.trim());
  if (params.transferFee?.trim()) search.set('transfer_fee', params.transferFee.trim());
  if (params.salaryRange?.trim()) search.set('salary_range', params.salaryRange.trim());
  if (params.excludeUrls?.length) search.set('exclude_urls', params.excludeUrls.join(','));
  if (params.requestId) search.set('request_id', params.requestId);
  if (params.clubUrl?.trim()) search.set('club_url', params.clubUrl.trim());
  if (params.clubName?.trim()) search.set('club_name', params.clubName.trim());
  if (params.clubCountry?.trim()) search.set('club_country', params.clubCountry.trim());
  search.set('lang', params.lang || 'en');
  search.set('sort_by', 'score');
  search.set('limit', String(params.limit ?? 15));
  search.set('_t', String(Date.now()));
  return `${SCOUT_BASE_URL}/recruitment?${search.toString()}`;
}

function parseResult(p: Record<string, unknown>): ScoutPlayerSuggestion {
  const scoutingScore = (p.scouting_score as number) ?? 0;
  const smartScore = (p.smart_score as number) ?? 0;
  const simScore = (p.similarity_score as number) ?? 0;
  const effectiveScore =
    smartScore > 0 ? Math.round(smartScore) : simScore > 0 ? Math.round(simScore * 100) : scoutingScore > 0 ? Math.round(scoutingScore) : undefined;

  const playingStyle = (p.playing_style as string)?.trim() || undefined;
  const serverExplanation = (p.explanation as string)?.trim() || undefined;
  // Prefer Gemini-enriched analysis (from Render) over basic Python explanation
  const geminiAnalysis = (p.scoutAnalysis as string)?.trim() || (p.scout_analysis as string)?.trim() || undefined;
  const reason = [playingStyle, effectiveScore != null ? `Match: ${effectiveScore}%` : null].filter(Boolean).join(' · ') || undefined;

  const clubFit = (p.club_fit_score as number) ?? undefined;
  const realism = (p.realism_score as number) ?? undefined;
  const noteFit = (p.note_fit_score as number) ?? undefined;

  return {
    name: (p.name as string) || '',
    position: (p.position as string) || '',
    age: (p.age as string) || '',
    marketValue: (p.market_value as string) || '',
    transfermarktUrl: (p.url as string) || null,
    similarityReason: reason || undefined,
    playingStyle,
    matchPercent: effectiveScore ?? undefined,
    scoutAnalysis: geminiAnalysis || serverExplanation,
    scoreBreakdown:
      clubFit != null || realism != null || noteFit != null
        ? { clubFit, realism, noteFit }
        : undefined,
    league: (p.league as string) || undefined,
    club: (p.club as string) || undefined,
    nationality: (p.citizenship as string) || undefined,
    height: (p.height as string) || undefined,
    contractEnd: (p.contract as string) || undefined,
    foot: (p.foot as string) || undefined,
    ...(function caPa() {
      const rawCa = typeof p.fm_ca === 'number' ? p.fm_ca : typeof p.fmi_ca === 'number' ? (p.fmi_ca as number) : undefined;
      const rawPa = typeof p.fm_pa === 'number' ? p.fm_pa : typeof p.fmi_pa === 'number' ? (p.fmi_pa as number) : undefined;
      // Backend may return CA/PA swapped; swap so CA (current) <= PA (potential) when both present
      const fmCa = rawCa != null && rawPa != null && rawCa > rawPa ? rawPa : rawCa;
      const fmPa = rawCa != null && rawPa != null && rawCa > rawPa ? rawCa : rawPa;
      const fmPotentialGap =
        typeof p.fm_potential_gap === 'number'
          ? p.fm_potential_gap
          : fmCa != null && fmPa != null
            ? fmPa - fmCa
            : undefined;
      return {
        fmCa,
        fmPa,
        fmPotentialGap,
        fmTier: (p.fm_tier as string) || classifyFmTier(fmCa ?? 0),
      };
    })(),
  };
}

export async function findPlayersForRequest(
  params: RecruitmentParams
): Promise<ScoutPlayerSuggestion[]> {
  const url = buildUrl(params);
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(120000), // 2 min: Render cold start + recruitment search
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    const msg = errBody?.error || `Scout API: ${res.status}`;
    throw new Error(msg);
  }
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  const arr = json.results ?? [];
  return arr.map((p) => parseResult(p as Record<string, unknown>));
}

export interface LeagueMarketInfo {
  leagueName: string;
  avgEuro: number;
  minEuro: number;
  maxEuro: number;
}

export interface AiScoutSearchResult {
  players: ScoutPlayerSuggestion[];
  interpretation?: string;
  leagueInfo?: LeagueMarketInfo;
  /** True when first batch (5) shown, more available */
  hasMore?: boolean;
  requestedTotal?: number;
}

/**
 * AI Scout free-text search. Supports Hebrew and English queries.
 * Progressive: pass initial=true for first 5 results (faster), then initial=false for full.
 */
export async function aiScoutSearch(
  query: string,
  lang?: 'en' | 'he',
  initial?: boolean,
  demo?: boolean,
  excludeUrls?: string[]
): Promise<AiScoutSearchResult> {
  const res = await fetch('/api/scout/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: query.trim(),
      lang: lang || 'en',
      initial: initial === true,
      demo: demo === true,
      ...(excludeUrls?.length ? { excludeUrls } : {}),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(180000), // 3 min - scout server cold start
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    const msg = errBody?.error || `AI Scout: ${res.status}`;
    throw new Error(msg);
  }
  const json = (await res.json()) as {
    results?: Record<string, unknown>[];
    interpretation?: string;
    leagueInfo?: LeagueMarketInfo;
    hasMore?: boolean;
    requestedTotal?: number;
  };
  const arr = json.results ?? [];
  return {
    players: arr.map((p) => parseResult(p as Record<string, unknown>)),
    interpretation: json.interpretation,
    leagueInfo: json.leagueInfo,
    hasMore: json.hasMore,
    requestedTotal: json.requestedTotal,
  };
}

// ========================
// FM Intelligence API
// ========================

export interface FmAttribute {
  name: string;
  value: number;
}

export interface FmPositionFit {
  [position: string]: number;
}

export interface FmIntelligenceData {
  player_name: string;
  ca: number;
  pa: number;
  potential_gap: number;
  tier: string;
  dimension_scores: Record<string, number>;
  top_attributes: FmAttribute[];
  weak_attributes: FmAttribute[];
  all_attributes: Record<string, number>;
  position_fit: FmPositionFit;
  best_position: { position: string; fit: number };
  foot: { left: number; right: number };
  height_cm: number;
  error?: string;
}

// ========================
// Similar Players API
// ========================

/** Extra context from the app's own player data (Firebase) for reliable matching. */
export interface SimilarPlayersContext {
  playerName?: string;
  playerClub?: string;
  playerPosition?: string;
  playerAge?: string;
  playerFoot?: string;
  playerHeight?: string;
  playerNationality?: string;
  playerMarketValue?: string;
}

/**
 * Find players similar to the given Transfermarkt profile URL.
 * Mirrors Android ScoutApiClient.findSimilarPlayers.
 * Pass ctx with player metadata from Firebase so the server can find the
 * RIGHT player even when the TM URL points to a wrong namesake.
 */
export async function findSimilarPlayers(
  playerUrl: string,
  lang: string = 'en',
  excludeNames: string[] = [],
  ctx?: SimilarPlayersContext,
): Promise<ScoutPlayerSuggestion[]> {
  const search = new URLSearchParams();
  search.set('player_url', playerUrl);
  search.set('lang', lang);
  if (excludeNames.length > 0) {
    search.set('exclude', excludeNames.join(','));
  }
  // Send all available player context for reliable server-side matching
  if (ctx?.playerName) search.set('player_name', ctx.playerName);
  if (ctx?.playerClub) search.set('player_club', ctx.playerClub);
  if (ctx?.playerPosition) search.set('target_position', ctx.playerPosition);
  if (ctx?.playerAge) search.set('player_age', ctx.playerAge);
  if (ctx?.playerFoot) search.set('player_foot', ctx.playerFoot);
  if (ctx?.playerHeight) search.set('player_height', ctx.playerHeight);
  if (ctx?.playerNationality) search.set('player_nationality', ctx.playerNationality);
  if (ctx?.playerMarketValue) search.set('player_market_value', ctx.playerMarketValue);
  search.set('_t', String(Date.now()));

  const url = `${RENDER_SCOUT_URL}/similar_players?${search.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(120000), // 2 min — cold start + similarity search
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    const msg = errBody?.error || `Similar Players API: ${res.status}`;
    throw new Error(msg);
  }
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  const arr = json.results ?? [];
  return arr.map((p) => parseResult(p as Record<string, unknown>));
}

/**
 * Fetch full FM intelligence report for a player.
 * Tries the scout proxy first, then falls back to FMInside direct scraping.
 */
export async function getFmIntelligence(
  playerName: string,
  club?: string,
  age?: string
): Promise<FmIntelligenceData | null> {
  // 1. Try scout proxy (which tries scout server → men's endpoint → women's endpoint)
  try {
    let url = `${SCOUT_BASE_URL}/fm-intelligence?player_name=${encodeURIComponent(playerName)}`;
    if (club) url += `&club=${encodeURIComponent(club)}`;
    if (age) url += `&age=${encodeURIComponent(age)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = (await res.json()) as FmIntelligenceData;
      if (!data.error && data.ca > 0) return data;
    }
  } catch {
    // Fall through
  }

  // 2. Direct fallback: call FMInside women-player endpoint (proven reliable, returns both genders)
  try {
    const params = new URLSearchParams();
    params.set('name', playerName);
    if (club) params.set('club', club);
    if (age) params.set('age', age);
    const res = await fetch(`/api/fminside/women-player?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const wData = (await res.json()) as Record<string, unknown>;
    if (wData.found && typeof wData.ca === 'number' && wData.ca > 0) {
      return {
        player_name: String(wData.player_name || playerName),
        ca: wData.ca as number,
        pa: (wData.pa as number) || (wData.ca as number),
        potential_gap: (wData.potential_gap as number) || 0,
        tier: String(wData.tier || 'unknown'),
        dimension_scores: (wData.dimension_scores as Record<string, number>) || {},
        top_attributes: (wData.top_attributes as FmAttribute[]) || [],
        weak_attributes: (wData.weak_attributes as FmAttribute[]) || [],
        all_attributes: (wData.all_attributes as Record<string, number>) || {},
        position_fit: (wData.position_fit as FmPositionFit) || {},
        best_position: (wData.best_position as { position: string; fit: number }) || { position: '—', fit: 0 },
        foot: (wData.foot as { left: number; right: number }) || { left: 0, right: 0 },
        height_cm: (wData.height_cm as number) || 0,
      };
    }
  } catch {
    // Fall through
  }

  return null;
}
