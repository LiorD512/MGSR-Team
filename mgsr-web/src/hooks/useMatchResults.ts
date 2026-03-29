import { useEffect, useState } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { usePlatform } from '@/contexts/PlatformContext';
import { REQUEST_MATCH_RESULTS_COLLECTIONS, PLAYER_MATCH_RESULTS_COLLECTIONS } from '@/lib/platformCollections';

/**
 * Subscribe to pre-computed matching request IDs for a specific player.
 * Cloud Functions write to PlayerMatchResults/{playerId} whenever players or requests change.
 */
export function usePlayerMatchResults(playerId: string | undefined): string[] {
  const { platform } = usePlatform();
  const [matchingRequestIds, setMatchingRequestIds] = useState<string[]>([]);
  const col = PLAYER_MATCH_RESULTS_COLLECTIONS[platform];

  useEffect(() => {
    if (!playerId) { setMatchingRequestIds([]); return; }
    const unsub = onSnapshot(
      doc(db, col, playerId),
      (snap) => {
        if (!snap.exists()) { setMatchingRequestIds([]); return; }
        setMatchingRequestIds((snap.data().matchingRequestIds as string[]) ?? []);
      },
      () => setMatchingRequestIds([])
    );
    return () => unsub();
  }, [playerId, col]);

  return matchingRequestIds;
}

/**
 * Subscribe to ALL pre-computed request match results for the current platform.
 * Returns a map of requestId → playerIds[].
 */
export function useAllRequestMatchResults(): Record<string, string[]> {
  const { platform } = usePlatform();
  const [results, setResults] = useState<Record<string, string[]>>({});
  const col = REQUEST_MATCH_RESULTS_COLLECTIONS[platform];

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, col),
      (snap) => {
        const map: Record<string, string[]> = {};
        for (const d of snap.docs) {
          map[d.id] = (d.data().matchingPlayerIds as string[]) ?? [];
        }
        setResults(map);
      },
      () => setResults({})
    );
    return () => unsub();
  }, [col]);

  return results;
}
