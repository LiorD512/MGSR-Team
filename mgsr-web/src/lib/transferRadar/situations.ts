/**
 * Plain-language "situation" of a player, derived from the signal codes of his reports.
 * Shared by the API (server) and the UI (client). Order = priority (the first one present becomes the headline situation).
 */
export type Situation = 'moved' | 'wants_leave' | 'released' | 'club_sell' | 'terminate' | 'loan' | 'conflict' | 'out_squad' | 'unpaid' | 'other';

export const SITUATION_PRIORITY: Situation[] = ['moved', 'wants_leave', 'released', 'club_sell', 'terminate', 'loan', 'conflict', 'out_squad', 'unpaid', 'other'];

export const SIGNAL_TO_SITUATION: Record<string, Situation> = {
  PLAYER_SEEKING_CLUB: 'wants_leave', REQUESTED_TO_LEAVE: 'wants_leave',
  CLUB_WANTS_TO_SELL: 'club_sell', CLUB_NEEDS_TO_SELL: 'club_sell',
  CLUB_WANTS_TO_RELEASE: 'released',
  CLUB_OPEN_TO_TERMINATE: 'terminate', CONTRACT_TALKS_FAILED: 'terminate',
  AVAILABLE_ON_LOAN: 'loan',
  EXCLUDED_FROM_SQUAD: 'out_squad', NOT_PLAYING: 'out_squad', OUT_OF_FAVOR: 'out_squad', NOT_REGISTERED: 'out_squad',
  CONFLICT_WITH_COACH: 'conflict', DISAGREEMENT_WITH_MANAGEMENT: 'conflict', DISCIPLINARY_ISSUE: 'conflict',
  UNPAID_SALARY: 'unpaid',
  TRANSFER_COMPLETED: 'moved',
};

/** Distinct situations present in a list of signal arrays, highest priority first. */
export function situationsOf(signalLists: string[][]): Situation[] {
  const set = new Set<Situation>();
  for (const list of signalLists) for (const s of list) { const k = SIGNAL_TO_SITUATION[s]; if (k) set.add(k); }
  return SITUATION_PRIORITY.filter((k) => set.has(k));
}

export const NOT_RELEVANT_REASONS = ['star', 'coach', 'sport', 'person', 'old', 'other'] as const;
export type NotRelevantReason = (typeof NOT_RELEVANT_REASONS)[number];
