/**
 * Football scout server API - recruitment search for requests.
 * Matches Android ScoutApiClient.findPlayersForRequest.
 * Uses /api/scout/recruitment proxy to avoid CORS when deployed on Vercel.
 */

// Use proxy to avoid CORS when deployed (browser → Vercel → Render)
const SCOUT_BASE_URL = '/api/scout';

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
    scoutAnalysis: serverExplanation,
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
