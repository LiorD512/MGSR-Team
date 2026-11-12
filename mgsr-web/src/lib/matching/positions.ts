/**
 * Position normalisation + adjacency for request matching.
 * One alias map for every source (short codes, Transfermarkt long names, legacy codes), so "Centre-Back", "CB" and
 * "Centre Back" all compare equal. Pure module.
 */

export type PositionCode =
  | 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LM' | 'RM' | 'LW' | 'RW' | 'CF' | 'SS';

const ALIASES: Record<string, PositionCode> = {
  GK: 'GK', GOALKEEPER: 'GK', KEEPER: 'GK',
  CB: 'CB', CENTREBACK: 'CB', CENTERBACK: 'CB', CENTRALDEFENDER: 'CB', DEFENDER: 'CB',
  LB: 'LB', LEFTBACK: 'LB', LWB: 'LB', LEFTWINGBACK: 'LB',
  RB: 'RB', RIGHTBACK: 'RB', RWB: 'RB', RIGHTWINGBACK: 'RB',
  DM: 'DM', CDM: 'DM', DEFENSIVEMIDFIELD: 'DM', DEFENSIVEMIDFIELDER: 'DM',
  CM: 'CM', CENTRALMIDFIELD: 'CM', CENTRALMIDFIELDER: 'CM', MIDFIELDER: 'CM',
  AM: 'AM', CAM: 'AM', ATTACKINGMIDFIELD: 'AM', ATTACKINGMIDFIELDER: 'AM',
  LM: 'LM', LEFTMIDFIELD: 'LM', LEFTMIDFIELDER: 'LM',
  RM: 'RM', RIGHTMIDFIELD: 'RM', RIGHTMIDFIELDER: 'RM',
  LW: 'LW', LEFTWINGER: 'LW', LEFTWING: 'LW',
  RW: 'RW', RIGHTWINGER: 'RW', RIGHTWING: 'RW',
  CF: 'CF', ST: 'CF', STRIKER: 'CF', CENTREFORWARD: 'CF', CENTERFORWARD: 'CF', FORWARD: 'CF',
  SS: 'SS', SECONDSTRIKER: 'SS',
};

export function normalizePosition(pos: string | null | undefined): PositionCode | null {
  if (!pos) return null;
  const key = pos.toUpperCase().replace(/[^A-Z]/g, '');
  return ALIASES[key] ?? null;
}

/**
 * Position rule (agency decision):
 *   - Wingers (LW / RW) and central / defensive midfielders (CM / DM): the player's main OR secondary positions count,
 *     and the other side / other midfield role counts as an adjacent fit (LW↔RW, CM↔DM).
 *   - Every other position: the player's MAIN position only (positions[0]). Secondary positions don't count.
 */
const FLEXIBLE_PAIRS: Partial<Record<PositionCode, PositionCode>> = { LW: 'RW', RW: 'LW', CM: 'DM', DM: 'CM' };

export type PositionFit = 'primary' | 'secondary' | 'adjacent' | 'none';

/** How a player's positions (index 0 = main position, as stored from Transfermarkt) fit a requested position. */
export function positionFit(playerPositions: (string | null | undefined)[] | undefined, requested: string | undefined): PositionFit {
  const req = normalizePosition(requested);
  if (!req) return 'none';
  const codes = (playerPositions ?? []).map(normalizePosition).filter((c): c is PositionCode => !!c);
  if (codes.length === 0) return 'none';
  if (codes[0] === req) return 'primary';
  const pair = FLEXIBLE_PAIRS[req];
  if (!pair) return 'none'; // main position only
  if (codes.includes(req)) return 'secondary';
  if (codes.includes(pair)) return 'adjacent';
  return 'none';
}
