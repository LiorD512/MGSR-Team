/**
 * Board selection shared by the API and the dashboard: rank the roster by worth and show the top N.
 */
import { BOARD_SIZE, MIN_WORTH } from './config';
import type { PlayerTierDoc } from './types';

export function rankBoard(docs: PlayerTierDoc[], size = BOARD_SIZE, minWorth = MIN_WORTH): PlayerTierDoc[] {
  return docs
    .filter((d) => d.analysis && d.analysis.worth >= minWorth)
    .sort((a, b) => (b.analysis!.worth - a.analysis!.worth) || (b.analysis!.urgency - a.analysis!.urgency))
    .slice(0, size);
}

export function daysSinceTouch(d: PlayerTierDoc, now = Date.now()): number | null {
  const t = d.effort?.lastTouchAt;
  return t ? Math.floor((now - t) / (24 * 3600 * 1000)) : null;
}
