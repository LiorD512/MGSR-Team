/**
 * Matches roster players to a request based on position, age, dominate foot, salary range, and transfer fee.
 * Logic matches Android RequestMatcher.kt.
 * Smarter matching: market value vs transfer fee range (exclude players clearly above budget).
 */

import { parseMarketValueToEuros } from './shortlistIntelligence';

const SALARY_RANGES = ['>5', '6-10', '11-15', '16-20', '20-25', '26-30', '30+'];

export interface RosterPlayer {
  id: string;
  fullName?: string;
  age?: string;
  positions?: (string | null)[];
  foot?: string;
  salaryRange?: string;
  transferFee?: string;
  profileImage?: string;
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string };
  tmProfile?: string;
  nationality?: string;
  nationalities?: string[];
}

export interface ClubRequest {
  id: string;
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  dominateFoot?: string;
  salaryRange?: string;
  transferFee?: string;
  clubTmProfile?: string;
  euOnly?: boolean;
}

function matchesPosition(player: RosterPlayer, requestPosition: string): boolean {
  const normalize = (p: string) => {
    const u = p.trim().toUpperCase();
    return u === 'ST' ? 'CF' : u;
  };
  const playerPositions =
    player.positions
      ?.map((p) => p ? normalize(p) : null)
      .filter((p): p is string => !!p) ?? [];
  if (playerPositions.length === 0) return false;
  const reqPos = requestPosition ? normalize(requestPosition) : null;
  if (!reqPos) return false;
  return playerPositions.some((p) => p === reqPos);
}

function matchesAge(player: RosterPlayer, request: ClubRequest): boolean {
  if (request.ageDoesntMatter === true) return true;
  const minAge = request.minAge ?? 0;
  const maxAge = request.maxAge ?? 999;
  if (minAge <= 0 && maxAge >= 999) return true;
  const playerAge = player.age ? parseInt(player.age, 10) : undefined;
  if (playerAge == null || isNaN(playerAge)) return true;
  return playerAge >= minAge && playerAge <= maxAge;
}

function matchesDominateFoot(player: RosterPlayer, request: ClubRequest): boolean {
  const reqFoot = request.dominateFoot?.trim().toLowerCase();
  if (!reqFoot) return true;
  if (reqFoot === 'any') return true;
  const playerFoot = player.foot?.trim().toLowerCase();
  if (!playerFoot) return true;
  return playerFoot === reqFoot;
}

function matchesSalaryRange(player: RosterPlayer, request: ClubRequest): boolean {
  const reqSalary = request.salaryRange?.trim();
  if (!reqSalary) return true;
  const playerSalary = player.salaryRange?.trim();
  if (!playerSalary) return true;

  const reqIndex = SALARY_RANGES.findIndex((r) => r.toLowerCase() === reqSalary.toLowerCase());
  if (reqIndex < 0) return playerSalary.toLowerCase() === reqSalary.toLowerCase();

  const acceptedRanges: string[] = [SALARY_RANGES[reqIndex]];
  if (reqIndex > 0) acceptedRanges.push(SALARY_RANGES[reqIndex - 1]);
  if (reqIndex < SALARY_RANGES.length - 1) acceptedRanges.push(SALARY_RANGES[reqIndex + 1]);

  const playerLower = playerSalary.toLowerCase();
  return acceptedRanges.some((r) => r.toLowerCase() === playerLower);
}

function matchesTransferFee(player: RosterPlayer, request: ClubRequest): boolean {
  const reqFee = request.transferFee?.trim();
  if (!reqFee) return true;
  const playerFee = player.transferFee?.trim();
  if (!playerFee) return true;
  return playerFee.toLowerCase() === reqFee.toLowerCase();
}

/** Transfer fee string to (min, max) value range in euros. Matches Android AiHelperService. */
function transferFeeToValueRange(transferFee: string): { min: number; max: number } {
  const lower = transferFee.trim().toLowerCase();
  switch (lower) {
    case 'free/free loan':
      return { min: 0, max: 150_000 };
    case '<200':
      return { min: 0, max: 200_000 };
    case '300-600':
      return { min: 250_000, max: 650_000 };
    case '700-900':
      return { min: 650_000, max: 950_000 };
    case '1m+':
      return { min: 900_000, max: Number.MAX_SAFE_INTEGER };
    default:
      return { min: 0, max: Number.MAX_SAFE_INTEGER };
  }
}

/** Exclude players whose market value is clearly above the request's budget (e.g. €2M player vs 300-600 request). */
function matchesMarketValueVsTransferFee(player: RosterPlayer, request: ClubRequest): boolean {
  const reqFee = request.transferFee?.trim();
  if (!reqFee) return true;
  const playerValue = player.marketValue ? parseMarketValueToEuros(player.marketValue) : 0;
  if (playerValue <= 0) return matchesTransferFee(player, request); // fallback to string match
  const { max } = transferFeeToValueRange(reqFee);
  if (max >= Number.MAX_SAFE_INTEGER) return true; // 1m+ has no upper bound
  if (playerValue > max * 2) return false; // clearly over budget
  return true;
}

export function matchRequestToPlayers(request: ClubRequest, players: RosterPlayer[], euCountries?: Set<string>): RosterPlayer[] {
  const position = request.position?.trim();
  if (!position) return [];
  return players.filter((player) => {
    if (!matchesPosition(player, position)) return false;
    if (!matchesAge(player, request)) return false;
    if (!matchesDominateFoot(player, request)) return false;
    if (!matchesSalaryRange(player, request)) return false;
    if (!matchesTransferFee(player, request)) return false;
    if (!matchesMarketValueVsTransferFee(player, request)) return false;
    if (!matchesEu(player, request, euCountries)) return false;
    return true;
  });
}

function matchesEu(player: RosterPlayer, request: ClubRequest, euCountries?: Set<string>): boolean {
  if (!request.euOnly) return true;
  if (!euCountries || euCountries.size === 0) return true;
  const nats = player.nationalities?.length ? player.nationalities : player.nationality ? [player.nationality] : [];
  if (nats.length === 0) return true; // don't exclude players with no nationality data
  return nats.some((n) => euCountries.has(n.trim().toLowerCase()));
}

/**
 * Returns requests that match the given player (reverse of matchRequestToPlayers).
 * Used on Player Info screen to show "Matching Requests" for a player.
 */
export function matchingRequestsForPlayer(
  player: RosterPlayer,
  requests: ClubRequest[],
  euCountries?: Set<string>
): ClubRequest[] {
  return requests.filter((req) => matchRequestToPlayers(req, [player], euCountries).length > 0);
}
