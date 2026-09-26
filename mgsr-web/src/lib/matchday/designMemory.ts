/**
 * MATCHDAY design memory (section 13).
 *
 * Persists a lightweight record of every generated MATCHDAY so the composition
 * planner can deliberately vary layout/mood/lighting for the same player and
 * avoid producing near-identical artwork on consecutive runs.
 *
 * Storage: Firestore collection `matchdayGenerations`. Reads are best-effort —
 * if Firestore is unavailable the planner simply falls back to random variety.
 */

import { db } from '@/lib/firebase';
import type {
  MatchdayGenerationRecord,
  MatchdayLayout,
  MatchdayMood,
} from './types';

const COLLECTION = 'matchdayGenerations';

/** Stable key for a fixture so we can look up prior designs for the same match. */
export function buildMatchKey(playerName: string, homeTeam: string, awayTeam: string, date: string): string {
  return [playerName, homeTeam, awayTeam, date]
    .map((s) => s.trim().toLowerCase())
    .join('|');
}

export interface PriorDesignSignal {
  layouts: MatchdayLayout[];
  moods: MatchdayMood[];
}

/**
 * Returns the layouts/moods used in the most recent generations for a player
 * (default 5) so the planner can steer away from them.
 */
export async function getRecentDesignsForPlayer(
  playerId: string | null,
  playerName: string,
  limitCount = 5
): Promise<PriorDesignSignal> {
  const empty: PriorDesignSignal = { layouts: [], moods: [] };
  try {
    const { collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
    const field = playerId ? 'playerId' : 'playerName';
    const value = playerId ?? playerName;
    const q = query(
      collection(db, COLLECTION),
      where(field, '==', value),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    const layouts: MatchdayLayout[] = [];
    const moods: MatchdayMood[] = [];
    snap.forEach((d) => {
      const data = d.data() as Partial<MatchdayGenerationRecord>;
      if (data.compositionStyle) layouts.push(data.compositionStyle);
      if (data.mood) moods.push(data.mood);
    });
    return { layouts, moods };
  } catch {
    // Missing composite index or offline — variety still works without history.
    return empty;
  }
}

/** Persists a generation record. Best-effort; never throws to the caller. */
export async function recordDesign(record: MatchdayGenerationRecord): Promise<void> {
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, COLLECTION, record.generationId), record);
  } catch (err) {
    console.error('[matchday] Failed to record design memory:', err);
  }
}
