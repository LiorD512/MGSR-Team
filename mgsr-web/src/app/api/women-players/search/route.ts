/**
 * Search women players across SoccerDonna (primary), Wosostat, FMInside.
 * SoccerDonna: quick search (GET) — same as site search box. Detail search (POST) was unreliable.
 * Wosostat: uses WOSOAPI_TOKEN or WOSOAPI_EMAIL+WOSOAPI_PASSWORD (env).
 */

import { NextRequest, NextResponse } from 'next/server';

const WOSO_BASE = 'https://wosoapi.onrender.com/api';
// Quick search — matches SoccerDonna site search box. Path "undefined" is required by their routing.
const SOCCERDONNA_QUICK_SEARCH = 'https://www.soccerdonna.de/en/undefined/suche/ergebnis.html';

export interface WomanPlayerSearchResult {
  fullName: string;
  currentClub?: string;
  age?: string;
  nationality?: string;
  position?: string;
  profileImage?: string;
  soccerDonnaUrl?: string;
  wosostatId?: string;
  source: 'wosostat' | 'soccerdonna' | 'fminside';
}

/** SoccerDonna: GET quick search (same as site search box), parse player links. */
async function searchSoccerDonna(q: string): Promise<WomanPlayerSearchResult[]> {
  const query = q.trim();
  if (!query) return [];

  try {
    const params = new URLSearchParams({ quicksearch: query, x: '0', y: '0' });
    const res = await fetch(`${SOCCERDONNA_QUICK_SEARCH}?${params}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      cache: 'no-store',
    });
    if (!res.ok) return [];

    const html = await res.text();
    // Player links: <a href="/en/aimee-danieli/profil/spieler_78951.html" ...>Aimee Danieli</a>
    // Optional club: <a href="/en/wellington-phoenix-fc/kader/verein_9549.html">Wellington Phoenix FC</a>
    const playerRe = /href="(\/en\/([^"]+)\/profil\/spieler_(\d+)\.html)"[^>]*>([^<]+)<\/a>(?:\s*<br\s*\/?>\s*<a href="\/en\/([^"]+)\/kader\/verein_\d+\.html"[^>]*>([^<]+)<\/a>)?/gi;
    const results: WomanPlayerSearchResult[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = playerRe.exec(html)) !== null) {
      const path = m[1];
      const slug = m[2];
      const clubName = m[6]; // from optional club capture
      const fullName = (m[4] || slug)
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const url = `https://www.soccerdonna.de${path}`;
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        fullName: fullName.trim(),
        currentClub: clubName?.trim() && clubName.toLowerCase() !== 'vereinslos' ? clubName.trim() : undefined,
        soccerDonnaUrl: url,
        source: 'soccerdonna',
      });
    }
    return results.slice(0, 20);
  } catch {
    return [];
  }
}

async function getWosostatToken(): Promise<string | null> {
  const token = process.env.WOSOAPI_TOKEN;
  if (token?.trim()) return token.trim();

  const email = process.env.WOSOAPI_EMAIL;
  const password = process.env.WOSOAPI_PASSWORD;
  if (!email?.trim() || !password?.trim()) return null;

  try {
    const res = await fetch(`${WOSO_BASE}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password: password.trim() }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access?: string };
    return data.access ?? null;
  } catch {
    return null;
  }
}

async function searchWosostat(q: string): Promise<WomanPlayerSearchResult[]> {
  const token = await getWosostatToken();
  if (!token) return [];

  try {
    const params = new URLSearchParams({ full_name__icontains: q, limit: '15' });
    const res = await fetch(`${WOSO_BASE}/players/?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const list = data.results ?? (Array.isArray(data) ? data : []);
    const normClub = (s: string) =>
      s.toLowerCase().trim() === 'vereinslos' ? 'Without Club' : s;
    return list.map((p: Record<string, unknown>) => {
      const rawClub = p.club ? String((p.club as Record<string, unknown>).name ?? p.club) : undefined;
      return {
      fullName: String(p.full_name ?? p.name ?? ''),
      currentClub: rawClub ? normClub(rawClub) : undefined,
      age: p.age != null ? String(p.age) : undefined,
      nationality: p.nationality ? String((p.nationality as Record<string, unknown>).name ?? p.nationality) : undefined,
      position: p.position ? String((p.position as Record<string, unknown>).name ?? p.position) : undefined,
      profileImage: typeof p.profile_image === 'string' ? p.profile_image : undefined,
      wosostatId: p.id != null ? String(p.id) : undefined,
      source: 'wosostat' as const,
    };
    }).filter((r) => r.fullName);
  } catch {
    return [];
  }
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const [soccerDonna, wosostat] = await Promise.all([
      searchSoccerDonna(q),
      searchWosostat(q),
    ]);

    // SoccerDonna first (primary), then Wosostat
    const results: WomanPlayerSearchResult[] = [...soccerDonna, ...wosostat];
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
      const key = r.fullName.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ results: deduped.slice(0, 20) });
  } catch (err) {
    console.error('Women players search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    );
  }
}
