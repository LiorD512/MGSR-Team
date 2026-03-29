import { NextResponse } from 'next/server';
import { generateEnrichment } from '@/lib/generateEnrichment';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { player, scoutReport, platform, lang } = body;

    if (!player) {
      return NextResponse.json({ error: 'player required' }, { status: 400 });
    }

    const enrichment = await generateEnrichment(player, scoutReport, platform, lang);
    return NextResponse.json({ enrichment });
  } catch (err) {
    console.error('Enrich portfolio error:', err);
    return NextResponse.json({ error: 'Failed to generate enrichment' }, { status: 500 });
  }
}
