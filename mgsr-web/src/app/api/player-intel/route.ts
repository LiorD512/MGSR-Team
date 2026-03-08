/**
 * Player Intelligence API — on-demand multi-source dossier.
 *
 * GET /api/player-intel?name=Player+Name&club=Club&tmUrl=/path&sources=thesportsdb,wikipedia
 *
 * Returns a PlayerIntelDossier with data from all available free sources:
 * TheSportsDB, Wikipedia, ClubElo, FotMob, TM Injuries, FBref, Sofascore, Capology
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  gatherPlayerIntel,
  type IntelSource,
} from '@/lib/playerIntel';

export const dynamic = 'force-dynamic';

const VALID_SOURCES: IntelSource[] = [
  'thesportsdb',
  'fbref',
  'fotmob',
  'sofascore',
  'capology',
  'wikipedia',
  'injuries',
  'clubelo',
];

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const name = sp.get('name');
  const club = sp.get('club') || undefined;
  const tmUrl = sp.get('tmUrl') || undefined;
  const sourcesParam = sp.get('sources');

  if (!name?.trim()) {
    return NextResponse.json(
      { error: 'name parameter required' },
      { status: 400 }
    );
  }

  const sources = sourcesParam
    ? (sourcesParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) =>
          VALID_SOURCES.includes(s as IntelSource)
        ) as IntelSource[])
    : undefined;

  const dossier = await gatherPlayerIntel(name, {
    club,
    tmUrl,
    sources,
  });

  return NextResponse.json(dossier, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=7200',
    },
  });
}
