import type { FeedItem } from './client';
import { matchesMarketValueVsTransferFee, type ClubRequest, type RosterPlayer } from '../requestMatcher';

/** Press Room positions come from Transfermarkt as long names ("Centre-Forward"); map them to the app's short codes. */
const LONG_TO_CODE: Record<string, string> = {
  goalkeeper: 'GK',
  'centre-back': 'CB', 'center-back': 'CB',
  'right-back': 'RB', 'left-back': 'LB',
  'defensive midfield': 'DM', 'central midfield': 'CM', 'attacking midfield': 'AM',
  'right midfield': 'RM', 'left midfield': 'LM',
  'left winger': 'LW', 'right winger': 'RW',
  'second striker': 'SS', 'centre-forward': 'CF', 'center-forward': 'CF', striker: 'CF',
};

export function positionCode(pos: string | null | undefined): string | null {
  const s = pos?.trim();
  if (!s) return null;
  const long = LONG_TO_CODE[s.toLowerCase()];
  if (long) return long;
  const u = s.toUpperCase();
  return u === 'ST' ? 'CF' : u;
}

/** Position filter chips shown in the Press Room (same order as other screens). */
export const RADAR_POSITIONS = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];

/** Adapt a Press Room item to the roster-player shape the shared request matcher expects. */
export function feedItemToMatcherPlayer(p: FeedItem): RosterPlayer {
  const code = positionCode(p.position);
  return {
    id: p.id,
    age: p.age != null ? String(p.age) : undefined,
    positions: code ? [code] : [],
    marketValue: p.value || undefined,
    nationalities: p.nationalities,
    tmProfile: p.tmUrl ?? undefined,
  };
}

/** Same rules as the Requests screen (position, age, EU) plus "not clearly above the fee budget" from market value. */
export function feedItemMatchesRequest(p: FeedItem, req: ClubRequest, euCountries: Set<string>, matcher: (r: ClubRequest, players: RosterPlayer[], eu?: Set<string>) => RosterPlayer[]): boolean {
  const player = feedItemToMatcherPlayer(p);
  return matcher(req, [player], euCountries).length > 0 && matchesMarketValueVsTransferFee(player, req);
}
