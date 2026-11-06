/**
 * Board selection shared by the API and the dashboard: show flagged players, strongest signal first.
 */
import { BOARD_SIZE } from './config';
import type { PlayerIntelDoc } from './types';

export function rankBoard(docs: PlayerIntelDoc[], size = BOARD_SIZE): PlayerIntelDoc[] {
  return docs
    .filter((d) => d.intel && d.intel.signals.length > 0)
    .sort((a, b) => (b.intel!.score - a.intel!.score) || (b.intel!.computedAt - a.intel!.computedAt))
    .slice(0, size);
}
