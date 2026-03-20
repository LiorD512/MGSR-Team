/**
 * Proxy for FM Intelligence — tries scout server first, falls back to direct
 * FMInside scraping via /api/fminside/player when the scout server has no data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // 1. Try scout server first (has cached DB — fast when available)
  try {
    const url = `${getScoutBaseUrl()}/fm_intelligence?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      // Scout server returns { error: ... } when it has no FM data — fall through
      if (data && !data.error && data.ca > 0) {
        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
      }
    }
  } catch {
    // Scout server down or timed out — fall through to direct scraping
  }

  // 2. Fallback: direct FMInside scraping via our men's endpoint, then women's endpoint (which returns both genders)
  const playerName = searchParams.get('player_name') || '';
  const club = searchParams.get('club') || '';
  const age = searchParams.get('age') || '';

  // Try men's dedicated endpoint first
  try {
    const origin = request.nextUrl.origin;
    const fallbackUrl = `${origin}/api/fminside/player?${searchParams.toString()}`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const data = await fallbackRes.json().catch(() => ({}));
    if (fallbackRes.ok && data && !data.error && data.fmi_matched !== false) {
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
    }
  } catch {
    // Fall through to women's endpoint which handles both genders
  }

  // 3. Final fallback: women's endpoint (proven to work on Vercel, returns both genders)
  try {
    const origin = request.nextUrl.origin;
    const womenParams = new URLSearchParams();
    if (playerName) womenParams.set('name', playerName);
    if (club) womenParams.set('club', club);
    if (age) womenParams.set('age', age);
    const womenUrl = `${origin}/api/fminside/women-player?${womenParams.toString()}`;
    const womenRes = await fetch(womenUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    const womenData = await womenRes.json().catch(() => ({}));
    if (womenRes.ok && womenData?.found === true && womenData.ca > 0) {
      // Convert women's response format to match expected FM intelligence format
      return NextResponse.json({
        player_name: womenData.player_name,
        ca: womenData.ca,
        pa: womenData.pa,
        potential_gap: womenData.potential_gap ?? Math.max(0, (womenData.pa || 0) - (womenData.ca || 0)),
        tier: womenData.tier,
        dimension_scores: womenData.dimension_scores,
        top_attributes: womenData.top_attributes,
        weak_attributes: womenData.weak_attributes,
        position_fit: womenData.position_fit,
        best_position: womenData.best_position,
        foot: womenData.foot,
        height_cm: womenData.height_cm,
        fminside_url: womenData.fminside_url,
        fmi_matched: true,
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
    }
    return NextResponse.json(
      { error: 'No FM data available', player_name: playerName, fmi_matched: false },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FM Intelligence API failed';
    console.error('FM Intelligence error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
