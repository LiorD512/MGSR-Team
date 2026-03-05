import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Single fetch cache — shared across all hook instances so Firestore is
 * queried at most once per page-load.
 */
let _cache: Set<string> | null = null;
let _promise: Promise<Set<string>> | null = null;

/**
 * Hardcoded fallback — used immediately while Firestore loads, and as
 * a safety net if the remote doc doesn't exist yet.
 */
const EU_COUNTRIES_FALLBACK: string[] = [
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary',
  'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta',
  'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia',
  'spain', 'sweden',
];
const FALLBACK_SET = new Set(EU_COUNTRIES_FALLBACK);

async function fetchEuCountries(): Promise<Set<string>> {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'Config', 'euCountries'));
      const data = snap.data();
      const list: string[] = Array.isArray(data?.countries) ? data.countries : [];
      _cache = list.length > 0
        ? new Set(list.map((c) => c.trim().toLowerCase()))
        : FALLBACK_SET;
    } catch (err) {
      console.warn('[useEuCountries] Failed to fetch EU countries list, using fallback:', err);
      _cache = FALLBACK_SET;
    }
    return _cache;
  })();
  return _promise;
}

/**
 * Hook that returns a Set of EU country names (lowercase) fetched from
 * Firestore `Config/euCountries`. The list is fetched once and cached
 * for the lifetime of the page.
 *
 * Usage:
 *   const euCountries = useEuCountries();
 *   const isEu = euCountries.has(player.nationality?.toLowerCase() ?? '');
 */
export function useEuCountries(): Set<string> {
  const [countries, setCountries] = useState<Set<string>>(_cache ?? FALLBACK_SET);

  useEffect(() => {
    fetchEuCountries().then(setCountries);
  }, []);

  return countries;
}

/**
 * Pure helper — check nationality against a Set of EU country names.
 * Handles common Transfermarkt nationality formats (e.g. "Germany", "Türkiye").
 */
export function isEuNational(nationality: string | undefined, euSet: Set<string>): boolean {
  if (!nationality?.trim() || euSet.size === 0) return false;
  return euSet.has(nationality.trim().toLowerCase());
}
