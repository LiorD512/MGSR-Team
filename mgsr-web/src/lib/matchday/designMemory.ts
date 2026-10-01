/**
 * MATCHDAY generation log.
 *
 * Records which photographs a generation used, so a poster can be traced back
 * to its sources. It no longer steers creative variety — the render is
 * deterministic by design, and the same fixture is meant to produce the same
 * image rather than a different one each run.
 *
 * Storage: Firestore collection `matchdayGenerations`. Best-effort throughout.
 */

import { db } from '@/lib/firebase';
import type { MatchdayGenerationRecord } from './types';

const COLLECTION = 'matchdayGenerations';

/** Stable key for a fixture so prior generations for the same match group. */
export function buildMatchKey(playerName: string, homeTeam: string, awayTeam: string, date: string): string {
  return [playerName, homeTeam, awayTeam, date]
    .map((s) => s.trim().toLowerCase())
    .join('|');
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
