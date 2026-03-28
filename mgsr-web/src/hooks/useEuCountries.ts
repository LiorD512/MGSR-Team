import { useEffect, useState } from 'react';
import { appConfig } from '@/lib/appConfig';

/**
 * Hook that returns a Set of EU country names (lowercase) from remote config.
 * Data is fetched from Firestore `Config/euCountries` via the centralized appConfig module.
 */
export function useEuCountries(): Set<string> {
  const [countries, setCountries] = useState<Set<string>>(appConfig.euCountries);

  useEffect(() => {
    appConfig.getEuCountries().then(setCountries);
  }, []);

  return countries;
}

/**
 * Pure helper — check nationality against a Set of EU country names.
 * Handles common Transfermarkt nationality formats (e.g. "Germany", "Türkiye").
 * When a nationalities array is provided, returns true if ANY nationality in
 * the array is an EU country.
 */
export function isEuNational(
  nationality: string | undefined,
  euSet: Set<string>,
  nationalities?: string[],
): boolean {
  if (euSet.size === 0) return false;
  const list = nationalities?.length ? nationalities : nationality ? [nationality] : [];
  return list.some((n) => euSet.has(n.trim().toLowerCase()));
}
