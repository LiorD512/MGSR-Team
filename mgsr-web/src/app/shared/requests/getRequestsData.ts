import { cache } from 'react';
import { CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
import type { Platform } from '@/contexts/PlatformContext';

export interface SharedRequest {
  id: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  salaryRange?: string;
  transferFee?: string;
  dominateFoot?: string;
  notes?: string;
  euOnly?: boolean;
  createdAt?: number;
  status?: string;
}

export interface RequestsPageData {
  requests: SharedRequest[];
  platform: string;
  totalCount: number;
  positionCounts: Record<string, number>;
  countryCounts: Record<string, number>;
  groupedByPosition: Record<string, Record<string, SharedRequest[]>>;
}

const POSITION_ORDER = [
  'GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'CF', 'SS',
];

export const getRequestsData = cache(async function getRequestsData(
  platform: Platform = 'men'
): Promise<RequestsPageData | null> {
  try {
    const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    const app = getFirebaseAdmin();
    if (!app) return null;

    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);

    const collection = CLUB_REQUESTS_COLLECTIONS[platform] || 'ClubRequests';
    const snapshot = await db
      .collection(collection)
      .get();

    const requests: SharedRequest[] = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          clubName: d.clubName,
          clubLogo: d.clubLogo,
          clubCountry: d.clubCountry,
          clubCountryFlag: d.clubCountryFlag,
          position: d.position,
          minAge: d.minAge,
          maxAge: d.maxAge,
          ageDoesntMatter: d.ageDoesntMatter,
          salaryRange: d.salaryRange,
        transferFee: d.transferFee,
        dominateFoot: d.dominateFoot,
        notes: d.notes,
        euOnly: d.euOnly,
        createdAt: d.createdAt,
        status: d.status,
      };
    })
    .filter((r) => !r.status || r.status === 'pending')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Translate Hebrew notes to English via Gemini
    await translateNotes(requests);

    const grouped: Record<string, Record<string, SharedRequest[]>> = {};
    const positionCounts: Record<string, number> = {};
    const countryCounts: Record<string, number> = {};

    for (const req of requests) {
      let pos = req.position || 'Other';
      if (pos.toUpperCase() === 'ST') pos = 'CF';

      const country = req.clubCountry || 'Other';

      if (!grouped[pos]) grouped[pos] = {};
      if (!grouped[pos][country]) grouped[pos][country] = [];
      grouped[pos][country].push(req);

      positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    // Sort within each position by country alphabetically
    for (const pos of Object.keys(grouped)) {
      const sorted = Object.entries(grouped[pos]).sort(([a], [b]) =>
        a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)
      );
      grouped[pos] = Object.fromEntries(sorted);
    }

    // Sort positions by the canonical order
    const sortedGrouped: Record<string, Record<string, SharedRequest[]>> = {};
    const sortedKeys = Object.keys(grouped).sort(
      (a, b) =>
        (POSITION_ORDER.indexOf(a) >= 0 ? POSITION_ORDER.indexOf(a) : 99) -
        (POSITION_ORDER.indexOf(b) >= 0 ? POSITION_ORDER.indexOf(b) : 99)
    );
    for (const k of sortedKeys) sortedGrouped[k] = grouped[k];

    return {
      requests,
      platform,
      totalCount: requests.length,
      positionCounts,
      countryCounts,
      groupedByPosition: sortedGrouped,
    };
  } catch (e) {
    console.error('[getRequestsData]', e);
    return null;
  }
});

/** Check if text contains Hebrew characters */
function hasHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Translate Hebrew notes to English using MyMemory API (free, no API key).
 * Uses the same football glossary approach as translateQuery.ts.
 * Mutates requests in-place for simplicity.
 */
async function translateNotes(requests: SharedRequest[]): Promise<void> {
  const toTranslate = requests.filter((r) => r.notes && hasHebrew(r.notes));
  if (toTranslate.length === 0) return;

  console.log('[translateNotes] Translating', toTranslate.length, 'notes via MyMemory');

  const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
  const email = process.env.MYMEMORY_EMAIL || '';

  let translated = 0;
  // Translate each note individually (MyMemory works best with single texts)
  await Promise.all(
    toTranslate.map(async (req) => {
      try {
        const params = new URLSearchParams({
          q: req.notes!,
          langpair: 'he|en',
        });
        if (email) params.set('de', email);

        const res = await fetch(`${MYMEMORY_URL}?${params.toString()}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;

        const data = (await res.json()) as {
          responseStatus?: number;
          responseData?: { translatedText?: string; match?: number };
        };

        const text = data?.responseData?.translatedText;
        if (text && data.responseStatus === 200 && (data.responseData?.match ?? 0) > 0) {
          req.notes = text;
          translated++;
        }
      } catch {
        // Non-fatal — keep original Hebrew note
      }
    })
  );
  console.log('[translateNotes] Translated', translated, '/', toTranslate.length, 'notes');
}
