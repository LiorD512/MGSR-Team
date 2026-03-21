/**
 * GET /api/war-room/scout-profiles
 * Fetches AI Scout Agent Network profiles from Firestore.
 * Query params: agentId (filter by agent), limit (default 50)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { AGENTS_CONFIG, SCOUT_PROFILES, type AgentId } from '@/lib/scoutAgentConfig';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { formatMarketValue } from '@/lib/releases';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';

export const dynamic = 'force-dynamic';

export type { ScoutProfileResponse };

function getProfileImage(profileImage: string | null | undefined, tmProfileUrl: string): string {
  if (profileImage?.trim()) return profileImage.trim();
  // TM now requires timestamp-suffixed image URLs — plain ID.jpg no longer works.
  // Return the official TM default placeholder instead of a broken URL.
  return 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';
}

export async function GET(request: NextRequest) {
  try {
    const app = getFirebaseAdmin();
    if (!app) {
      return NextResponse.json({ error: 'Firebase not configured', profiles: [] }, { status: 500 });
    }

    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);

    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get('agentId') as AgentId | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '1500', 10), 2000);

    // Per-agent: simple where() without orderBy (no composite index needed).
    // All agents: orderBy only, fetch all profiles.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db.collection('ScoutProfiles');

    if (agentId && AGENTS_CONFIG[agentId]) {
      query = query.where('agentId', '==', agentId);
    } else {
      query = query.orderBy('lastRefreshedAt', 'desc');
    }

    const snapshot = await query.limit(limit).get();
    const docs = snapshot.docs;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let profiles: ScoutProfileResponse[] = docs.map((doc: any) => {
      const d = doc.data();
      const agentCfg = AGENTS_CONFIG[(d.agentId as AgentId) || 'portugal'];
      const profileCfg = SCOUT_PROFILES[(d.profileType as keyof typeof SCOUT_PROFILES) || 'HIDDEN_GEM'];
      const marketValueEuro = d.marketValueEuro ?? 0;
      const displayValue =
        marketValueEuro > 0 ? formatMarketValue(marketValueEuro) : (d.marketValue || '');
      return {
        id: doc.id,
        tmProfileUrl: d.tmProfileUrl || '',
        agentId: d.agentId || '',
        profileType: d.profileType || '',
        profileTypeLabel: profileCfg?.label || d.profileType || '',
        profileTypeLabelHe: profileCfg?.labelHe || d.profileType || '',
        playerName: d.playerName || 'Unknown',
        profileImage: getProfileImage(d.profileImage, d.tmProfileUrl),
        age: d.age ?? 0,
        position: d.position || '',
        marketValue: displayValue,
        marketValueEuro,
        club: d.club || '',
        league: d.league || '',
        leagueTier: d.leagueTier ?? 1,
        nationality: d.nationality || null,
        matchReason: d.matchReason || '',
        matchScore: d.matchScore ?? 0,
        fmPa: d.fmPa ?? null,
        fmCa: d.fmCa ?? null,
        contractExpires: d.contractExpires || null,
        discoveredAt: d.discoveredAt ?? 0,
        lastRefreshedAt: d.lastRefreshedAt ?? 0,
        agentName: agentCfg?.name || d.agentId || '',
        agentNameHe: agentCfg?.nameHe || agentCfg?.name || d.agentId || '',
        agentFlag: agentCfg?.flag || '🌍',
        scoutExplanationEn: profileCfg?.explanationEn || '',
        scoutExplanationHe: profileCfg?.explanationHe || '',
      };
    });

    // Deduplicate by player (tmProfileUrl) — keep one profile per player, preferring most specific type
    const PROFILE_PRIORITY: Record<string, number> = {
      CONTRACT_EXPIRING: 1,
      YOUNG_STRIKER_HOT: 2,
      HIDDEN_GEM: 3,
      HIGH_VALUE_BENCHED: 4,
      LOWER_LEAGUE_RISER: 5,
      LOW_VALUE_STARTER: 6,
    };
    const seenUrls = new Map<string, ScoutProfileResponse>();
    for (const p of profiles) {
      const url = p.tmProfileUrl;
      const existing = seenUrls.get(url);
      const priority = PROFILE_PRIORITY[p.profileType] ?? 99;
      const existingPriority = existing ? (PROFILE_PRIORITY[existing.profileType] ?? 99) : 99;
      if (!existing || priority < existingPriority) {
        seenUrls.set(url, p);
      }
    }
    profiles = Array.from(seenUrls.values()).sort(
      (a, b) => (b.lastRefreshedAt ?? 0) - (a.lastRefreshedAt ?? 0)
    );

    // Images use fallback URL from getProfileImage (constructed from TM player ID)
    // Market values are already stored in Firestore from scout agent runs

    const lastRun = await db
      .collection('ScoutAgentRuns')
      .orderBy('runAt', 'desc')
      .limit(1)
      .get();
    const lastRunAt = lastRun.docs[0]?.data()?.runAt ?? null;

    const byAgent = profiles.reduce<Record<string, number>>((acc, p) => {
      acc[p.agentId] = (acc[p.agentId] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      profiles,
      lastRunAt,
      totalCount: profiles.length,
      byAgent,
    });
  } catch (err) {
    console.error('[ScoutProfiles API] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scout profiles', profiles: [] },
      { status: 500 }
    );
  }
}
