/**
 * MATCHDAY factual data assembly (sections 5, 6, 10).
 *
 * Turns the tracked player + their next fixture into the exact home/away
 * teams, logos, date, time, competition, round and venue that will be printed
 * on the artwork. NOTHING here is invented — every field comes from the
 * existing scrapers/DB. The AI never touches these values.
 */

import { handleNextMatch, type NextMatch } from '@/lib/transfermarkt';
import { handleFlashscoreNextMatch, type FlashscoreNextMatch } from '@/lib/flashscore';
import { searchImages } from './imageSearch';
import type { MatchdayMatchFacts } from './types';

export interface FactsInput {
  playerName: string;
  club: string;
  clubCountry?: string | null;
  clubLogo?: string | null;
  tmProfile?: string | null;
}

/** Normalised view of a fixture from either source. */
interface FixtureView {
  opponent: string;
  opponentLogo: string | null;
  homeAway: 'home' | 'away' | null;
  competition: string | null;
  round: string | null;
  date: string;
  time: string | null;
  venue: string | null;
}

/**
 * Resolve the next fixture and normalise it into factual MATCHDAY fields.
 *
 * Flashscore is the richer source (round + real venue of the HOME team +
 * opponent logo), so it is preferred; Transfermarkt only fills gaps. Any logo
 * still missing is sourced by a targeted image search so both crests are always
 * present. NOTHING here is invented — every field comes from the scrapers/DB.
 */
export async function gatherMatchFacts(input: FactsInput): Promise<MatchdayMatchFacts | null> {
  const [fs, tm] = await Promise.all([
    tryFlashscore(input.tmProfile ?? undefined, input.club, input.clubCountry ?? undefined),
    input.tmProfile ? tryTransfermarkt(input.tmProfile) : Promise.resolve(null),
  ]);

  // Prefer Flashscore; fall back to Transfermarkt when Flashscore is absent.
  const primary = fs ? toView(fs) : tm ? toView(tm) : null;
  if (!primary) return null;
  const secondary = fs && tm ? toView(tm) : null;

  // Merge: primary wins, secondary backfills nulls (esp. venue/round/time).
  const merged: FixtureView = {
    opponent: primary.opponent || secondary?.opponent || '',
    opponentLogo: primary.opponentLogo ?? secondary?.opponentLogo ?? null,
    homeAway: primary.homeAway ?? secondary?.homeAway ?? null,
    competition: primary.competition ?? secondary?.competition ?? null,
    round: primary.round ?? secondary?.round ?? null,
    date: primary.date || secondary?.date || '',
    time: primary.time ?? secondary?.time ?? null,
    venue: primary.venue ?? secondary?.venue ?? null,
  };

  const playerSide: 'home' | 'away' = merged.homeAway === 'away' ? 'away' : 'home';
  const clubLogo = input.clubLogo ?? null;
  const homeTeam = playerSide === 'home' ? input.club : merged.opponent;
  const awayTeam = playerSide === 'home' ? merged.opponent : input.club;

  // Parse country + clean competition name (fixes eyebrow duplication).
  const { country, competition } = parseCompetition(merged.competition, input.clubCountry ?? null);

  // The tracked player's own club logo comes from our DB; the opponent's from
  // the fixture source (with a search fallback below).
  let homeLogo = playerSide === 'home' ? clubLogo : merged.opponentLogo;
  let awayLogo = playerSide === 'home' ? merged.opponentLogo : clubLogo;

  // Logo fallback (fixes #1): if either crest is missing, search for it by name.
  if (!homeLogo) homeLogo = await findClubLogo(homeTeam, input.clubCountry ?? undefined);
  if (!awayLogo) awayLogo = await findClubLogo(awayTeam, input.clubCountry ?? undefined);

  return {
    playerName: input.playerName,
    homeTeam,
    awayTeam,
    playerSide,
    country,
    competition,
    round: merged.round,
    date: merged.date,
    time: merged.time,
    venue: merged.venue,
    homeLogo,
    awayLogo,
  };
}

/**
 * Split a competition string into { country, competition }.
 *
 * Flashscore formats competitions as "Country: Competition" (e.g.
 * "Uzbekistan: Super League"). We take the country from the prefix; if there is
 * no prefix, we fall back to the club's country. The competition name returned
 * never contains the country, so the eyebrow can't duplicate it.
 */
function parseCompetition(
  raw: string | null,
  clubCountry: string | null
): { country: string | null; competition: string | null } {
  const value = raw?.trim() || '';
  if (!value) {
    return { country: clubCountry?.trim() || null, competition: null };
  }
  const colon = value.indexOf(':');
  if (colon > 0) {
    const prefix = value.slice(0, colon).trim();
    const rest = value.slice(colon + 1).trim();
    // Prefix looks like a country/region label (short, no digits).
    if (prefix && !/\d/.test(prefix)) {
      return { country: prefix, competition: rest || null };
    }
  }
  // No country prefix — competition stands alone; country from club.
  return { country: clubCountry?.trim() || null, competition: value };
}

function toView(m: FlashscoreNextMatch | NextMatch): FixtureView {
  const x = m as Partial<FlashscoreNextMatch> & NextMatch;
  return {
    opponent: x.opponent,
    opponentLogo: x.opponentLogo ?? null,
    homeAway: x.homeAway ?? null,
    competition: x.competition ?? null,
    round: x.round ?? null,
    date: x.date,
    time: x.time ?? null,
    venue: x.venue ?? null,
  };
}

/**
 * Find a real club crest via image search. Restricted to logo-like results by
 * query wording; returns the first usable URL or null. Never AI-generated.
 */
async function findClubLogo(clubName: string, country?: string): Promise<string | null> {
  const name = clubName?.trim();
  if (!name || name === '—') return null;
  const queries = [
    `${name} football club logo crest png`,
    `${name} ${country || ''} fc logo`.trim(),
  ];
  for (const q of queries) {
    const hits = await searchImages(q, 5);
    const preferred = hits.find((h) => /\.(png|svg)(\?|$)/i.test(h.url)) ?? hits[0];
    if (preferred) return preferred.url;
  }
  return null;
}

async function tryTransfermarkt(tmProfile: string): Promise<NextMatch | null> {
  try {
    const { match } = await handleNextMatch(tmProfile);
    return match;
  } catch (err) {
    console.error('[matchday] Transfermarkt next-match failed:', err);
    return null;
  }
}

async function tryFlashscore(
  tmProfile: string | undefined,
  club: string,
  clubCountry: string | undefined
): Promise<FlashscoreNextMatch | null> {
  try {
    const { match } = await handleFlashscoreNextMatch(tmProfile, {
      name: club,
      country: clubCountry,
    });
    return match;
  } catch (err) {
    console.error('[matchday] Flashscore next-match failed:', err);
    return null;
  }
}
