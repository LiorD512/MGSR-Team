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

export async function getRequestsData(
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
}

/** Check if text contains Hebrew characters */
function hasHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Translate Hebrew notes to English using Gemini.
 * Mutates requests in-place for simplicity.
 */
async function translateNotes(requests: SharedRequest[]): Promise<void> {
  const toTranslate = requests.filter((r) => r.notes && hasHebrew(r.notes));
  if (toTranslate.length === 0) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[translateNotes] GEMINI_API_KEY not set');
    return;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.1 },
    });

    const numbered = toTranslate.map((r, i) => ({ idx: i + 1, req: r }));
    const prompt = [
      'Translate the following football/soccer recruitment notes from Hebrew to English.',
      'Keep it concise and professional. Football terminology should be accurate.',
      'Return ONLY a valid JSON object where keys are the numbers (as strings) and values are the English translations.',
      'Example: {"1": "Looking for a fast winger", "2": "Must have EU passport"}',
      '',
      ...numbered.map(({ idx, req }) => `${idx}: ${req.notes}`),
    ].join('\n');

    console.log('[translateNotes] Translating', toTranslate.length, 'notes');
    const result = await model.generateContent(prompt);
    let text = result.response.text()?.trim() || '';
    console.log('[translateNotes] Raw response:', text.substring(0, 200));

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!text) {
      console.warn('[translateNotes] Empty response from Gemini');
      return;
    }

    const parsed = JSON.parse(text) as Record<string, string>;
    let translated = 0;
    for (const { idx, req } of numbered) {
      const t = parsed[String(idx)];
      if (t) { req.notes = t; translated++; }
    }
    console.log('[translateNotes] Translated', translated, '/', toTranslate.length, 'notes');
  } catch (e) {
    console.error('[translateNotes] Failed:', e);
  }
}
