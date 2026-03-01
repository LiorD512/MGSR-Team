/**
 * Matches roster players to a request based on position, age, dominate foot, salary range, and transfer fee.
 * Logic matches Android RequestMatcher.kt.
 */

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
}

function matchesPosition(player: RosterPlayer, requestPosition: string): boolean {
  const playerPositions =
    player.positions
      ?.map((p) => p?.trim().toUpperCase())
      .filter((p): p is string => !!p) ?? [];
  if (playerPositions.length === 0) return false;
  const reqPos = requestPosition?.trim().toUpperCase();
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

export function matchRequestToPlayers(request: ClubRequest, players: RosterPlayer[]): RosterPlayer[] {
  const position = request.position?.trim();
  if (!position) return [];
  return players.filter((player) => {
    if (!matchesPosition(player, position)) return false;
    if (!matchesAge(player, request)) return false;
    if (!matchesDominateFoot(player, request)) return false;
    if (!matchesSalaryRange(player, request)) return false;
    if (!matchesTransferFee(player, request)) return false;
    return true;
  });
}

/**
 * Returns requests that match the given player (reverse of matchRequestToPlayers).
 * Used on Player Info screen to show "Matching Requests" for a player.
 */
export function matchingRequestsForPlayer(
  player: RosterPlayer,
  requests: ClubRequest[]
): ClubRequest[] {
  return requests.filter((req) => matchRequestToPlayers(req, [player]).length > 0);
}
