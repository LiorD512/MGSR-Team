/**
 * Search youth players via IFA (football.org.il) using SerpAPI.
 * Returns results from IFA site:football.org.il search.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchIFA, type IFASearchResult } from '@/lib/ifa';

export interface YouthPlayerSearchResult {
  fullName: string;
  fullNameHe?: string;
  currentClub?: string;
  age?: string;
  dateOfBirth?: string;
  nationality?: string;
  position?: string;
  profileImage?: string;
  ifaUrl?: string;
  ifaPlayerId?: string;
  source: 'ifa';
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const ifaResults: IFASearchResult[] = await searchIFA(q);

    const results: YouthPlayerSearchResult[] = ifaResults.map((r) => ({
      fullName: r.fullName,
      fullNameHe: r.fullNameHe,
      currentClub: r.currentClub,
      dateOfBirth: r.dateOfBirth,
      ifaUrl: r.ifaUrl,
      ifaPlayerId: r.ifaPlayerId,
      source: 'ifa' as const,
    }));

    // Deduplicate by player id
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
      const key = r.ifaPlayerId || r.fullName.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ results: deduped.slice(0, 20) });
  } catch (err) {
    console.error('Youth players search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    );
  }
}
