export type DiversityMode = 'strict' | 'balanced' | 'discovery';

type UnknownRecord = Record<string, unknown>;

export interface DiversifyOptions<T> {
  candidates: T[];
  limit: number;
  mode?: DiversityMode;
  seed?: string;
  seenKeys?: string[];
  getKey: (candidate: T) => string;
  getBaseScore?: (candidate: T) => number;
  getTokens?: (candidate: T) => string[];
}

interface DiversityParams {
  overlapPenalty: number;
  seenPenalty: number;
  noise: number;
  rarityBonus: number;
  poolFactor: number;
  maxPerClub: number;
  maxPerLeague: number;
  maxPerNation: number;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seedText: string): () => number {
  let seed = hashString(seedText) || 1;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function normalizeDiversityMode(value: unknown): DiversityMode {
  if (value === 'strict' || value === 'discovery' || value === 'balanced') return value;
  return 'balanced';
}

export function parseMarketValueEuro(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return 0;
  const s = value.trim().replace(/,/g, '').toLowerCase();
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (Number.isNaN(num)) return 0;
  if (s.includes('m') || s.includes('million') || s.includes('mio')) return num * 1_000_000;
  if (s.includes('k') || s.includes('thousand')) return num * 1_000;
  return num;
}

function toBucketAge(ageRaw: unknown): string {
  const age = typeof ageRaw === 'number' ? ageRaw : parseInt(String(ageRaw ?? '').replace(/[^\d]/g, ''), 10);
  if (Number.isNaN(age)) return 'age:unknown';
  if (age <= 20) return 'age:<=20';
  if (age <= 23) return 'age:21-23';
  if (age <= 26) return 'age:24-26';
  if (age <= 30) return 'age:27-30';
  return 'age:31+';
}

function toBucketValue(valueEuro: number): string {
  if (valueEuro <= 0) return 'value:unknown';
  if (valueEuro <= 250_000) return 'value:<=250k';
  if (valueEuro <= 500_000) return 'value:251-500k';
  if (valueEuro <= 1_000_000) return 'value:501k-1m';
  if (valueEuro <= 2_000_000) return 'value:1-2m';
  if (valueEuro <= 4_000_000) return 'value:2-4m';
  return 'value:4m+';
}

function normalizeText(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}

function fallbackTokens(candidate: UnknownRecord): string[] {
  const tokens: string[] = [];
  const league = normalizeText(candidate.league);
  const club = normalizeText(candidate.club ?? candidate.api_team);
  const nationality = normalizeText(candidate.citizenship ?? candidate.nationality);
  const position = normalizeText(candidate.position);
  const style = normalizeText(candidate.playing_style ?? candidate.playingStyle);
  const valueEuro = parseMarketValueEuro(candidate.market_value ?? candidate.marketValue);

  if (league) tokens.push(`league:${league}`);
  if (club) tokens.push(`club:${club}`);
  if (nationality) tokens.push(`nation:${nationality}`);
  if (position) tokens.push(`pos:${position}`);
  if (style) tokens.push(`style:${style}`);
  tokens.push(toBucketAge(candidate.age));
  tokens.push(toBucketValue(valueEuro));
  return tokens;
}

function fallbackScore(candidate: UnknownRecord): number {
  const smart = Number(candidate.smart_score ?? 0);
  const sim = Number(candidate.similarity_score ?? 0);
  const scout = Number(candidate.scouting_score ?? 0);
  const findNext = Number(candidate.find_next_score ?? 0);
  const matchPercent = Number(candidate.matchPercent ?? 0);
  if (smart > 0) return smart;
  if (sim > 0) return sim * 100;
  if (scout > 0) return scout;
  if (findNext > 0) return findNext;
  if (matchPercent > 0) return matchPercent;
  return 1;
}

export function buildQueryFingerprint(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildPlayerKey(urlOrName: string | null | undefined, fallbackName?: string): string {
  const raw = (urlOrName || '').trim();
  if (raw) {
    const m = raw.match(/\/(?:spieler|player)\/(\d+)/i);
    if (m?.[1]) return `tm:${m[1]}`;
    return `url:${raw.toLowerCase()}`;
  }
  return `name:${(fallbackName || '').trim().toLowerCase()}`;
}

export function diversifyCandidates<T>(options: DiversifyOptions<T>): T[] {
  const {
    candidates,
    limit,
    mode = 'balanced',
    seed = 'seed',
    seenKeys = [],
    getKey,
    getBaseScore,
    getTokens,
  } = options;

  if (limit <= 0 || candidates.length === 0) return [];
  const rng = createSeededRng(seed);
  const seenCount = new Map<string, number>();
  for (const k of seenKeys.filter(Boolean)) {
    seenCount.set(k, (seenCount.get(k) ?? 0) + 1);
  }

  const dedup = new Map<string, { candidate: T; base: number; tokens: string[] }>();
  for (const candidate of candidates) {
    const key = getKey(candidate);
    if (!key) continue;
    const base = Math.max(0.0001, getBaseScore ? getBaseScore(candidate) : fallbackScore(candidate as UnknownRecord));
    const tokens = (getTokens ? getTokens(candidate) : fallbackTokens(candidate as UnknownRecord)).filter(Boolean);
    const prev = dedup.get(key);
    if (!prev || base > prev.base) {
      dedup.set(key, { candidate, base, tokens });
    }
  }

  const pool = Array.from(dedup.entries()).map(([key, value]) => ({ key, ...value }));
  if (pool.length <= limit) return pool.map((p) => p.candidate);

  pool.sort((a, b) => b.base - a.base);

  if (mode === 'strict') {
    return pool
      .sort((a, b) => {
        const seenDelta = (seenCount.get(a.key) ?? 0) - (seenCount.get(b.key) ?? 0);
        if (seenDelta !== 0) return seenDelta;
        return b.base - a.base;
      })
      .slice(0, limit)
      .map((p) => p.candidate);
  }

  const params: DiversityParams =
    mode === 'discovery'
      ? {
          overlapPenalty: 0.56,
          seenPenalty: 0.8,
          noise: 0.12,
          rarityBonus: 0.38,
          poolFactor: 16,
          maxPerClub: 1,
          maxPerLeague: 3,
          maxPerNation: 3,
        }
      : {
          overlapPenalty: 0.36,
          seenPenalty: 0.48,
          noise: 0.08,
          rarityBonus: 0.24,
          poolFactor: 10,
          maxPerClub: 1,
          maxPerLeague: 4,
          maxPerNation: 4,
        };

  const maxPool = Math.min(pool.length, Math.max(limit * params.poolFactor, 60));
  const candidatePool = pool.slice(0, maxPool);

  const tokenFreq = new Map<string, number>();
  for (const p of candidatePool) {
    for (const t of p.tokens) {
      tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
    }
  }

  const maxBase = candidatePool[0]?.base || 1;
  const selected: typeof candidatePool = [];
  const selectedClubCount = new Map<string, number>();
  const selectedLeagueCount = new Map<string, number>();
  const selectedNationCount = new Map<string, number>();

  const getTokenValue = (tokens: string[], prefix: string): string | null => {
    const token = tokens.find((t) => t.startsWith(prefix));
    if (!token) return null;
    return token.slice(prefix.length);
  };

  const addCounter = (m: Map<string, number>, key: string | null): void => {
    if (!key) return;
    m.set(key, (m.get(key) ?? 0) + 1);
  };

  const isHardCapped = (tokens: string[]): boolean => {
    const club = getTokenValue(tokens, 'club:');
    const league = getTokenValue(tokens, 'league:');
    const nation = getTokenValue(tokens, 'nation:');
    if (club && (selectedClubCount.get(club) ?? 0) >= params.maxPerClub) return true;
    if (league && (selectedLeagueCount.get(league) ?? 0) >= params.maxPerLeague) return true;
    if (nation && (selectedNationCount.get(nation) ?? 0) >= params.maxPerNation) return true;
    return false;
  };

  while (selected.length < limit && candidatePool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    let foundUncapped = false;

    for (const c of candidatePool) {
      if (!isHardCapped(c.tokens)) {
        foundUncapped = true;
        break;
      }
    }

    for (let i = 0; i < candidatePool.length; i += 1) {
      const c = candidatePool[i];
      if (foundUncapped && isHardCapped(c.tokens)) continue;

      const relevance = c.base / maxBase;
      const seenTimes = seenCount.get(c.key) ?? 0;
      const noveltyPenalty = seenTimes > 0 ? params.seenPenalty * Math.min(1.9, 0.5 + seenTimes * 0.3) : 0;

      let overlap = 0;
      if (selected.length > 0) {
        const selTokenSets = selected.map((s) => new Set(s.tokens));
        for (const t of c.tokens) {
          let freq = 0;
          for (const set of selTokenSets) {
            if (set.has(t)) freq += 1;
          }
          overlap += freq / selected.length;
        }
        overlap = overlap / Math.max(1, c.tokens.length);
      }

      let rarity = 0;
      for (const t of c.tokens) {
        const freq = tokenFreq.get(t) ?? 1;
        rarity += 1 / freq;
      }
      rarity = rarity / Math.max(1, c.tokens.length);

      const score =
        relevance +
        rarity * params.rarityBonus -
        overlap * params.overlapPenalty -
        noveltyPenalty +
        rng() * params.noise;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const picked = candidatePool[bestIdx];
    selected.push(picked);
    addCounter(selectedClubCount, getTokenValue(picked.tokens, 'club:'));
    addCounter(selectedLeagueCount, getTokenValue(picked.tokens, 'league:'));
    addCounter(selectedNationCount, getTokenValue(picked.tokens, 'nation:'));
    candidatePool.splice(bestIdx, 1);
  }

  return selected.map((p) => p.candidate);
}
