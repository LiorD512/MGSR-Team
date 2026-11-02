import { NextRequest, NextResponse } from 'next/server';
import { guardMatchday } from '@/lib/matchday/v2/guard';
import { addLibraryImage, libraryConfigured, listLibrary } from '@/lib/matchday/v2/library';
import { aiLibraryEnabled, generateLibraryPose, LIBRARY_POSES } from '@/lib/matchday/v2/gemini';
import { keyOutMagenta } from '@/lib/matchday/v2/prepare';

export const dynamic = 'force-dynamic';
// Up to 4 image generations in parallel (each ~20–40 s, with retries).
export const maxDuration = 300;

const MAX_REFS = 4;

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * POST { playerId, count? (1–4) } → generates new AI poses of the player from
 * his REAL library photos. Results are stored as source 'ai', status 'pending'
 * (they must be approved before use). Off unless MATCHDAY_AI_LIBRARY=on.
 */
export async function POST(request: NextRequest) {
  const caller = await guardMatchday(request, 'library-ai');
  if (caller instanceof NextResponse) return caller;
  if (!aiLibraryEnabled()) {
    return NextResponse.json(
      { error: 'AI poses are switched off. Set MATCHDAY_AI_LIBRARY=on (and GEMINI_API_KEY) to enable them — each image costs about $0.13.' },
      { status: 403 }
    );
  }
  if (!libraryConfigured()) return NextResponse.json({ error: 'Storage is not configured on this environment' }, { status: 503 });

  let body: { playerId?: string; count?: number };
  try {
    body = (await request.json()) as { playerId?: string; count?: number };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const playerId = body.playerId?.trim();
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  const count = Math.max(1, Math.min(4, Math.round(body.count ?? 4)));

  try {
    const lib = await listLibrary(playerId);
    // References: REAL photos only (never AI output). Main photo first so the kit follows it.
    const real = lib.items.filter((it) => it.source === 'upload' && it.status === 'approved');
    real.sort((a, b) => Number(b.url === lib.mainUrl) - Number(a.url === lib.mainUrl));
    const picked = real.slice(0, MAX_REFS);
    const refBytes = (await Promise.all(picked.map((r) => fetchBytes(r.url)))).filter((b): b is Buffer => Boolean(b));
    if (refBytes.length === 0) {
      return NextResponse.json({ error: 'Upload at least one real photo of the player first — AI poses are made from real photos.' }, { status: 400 });
    }

    // Prefer poses the library doesn't have yet, then cycle.
    const have = new Set(lib.items.filter((it) => it.source === 'ai').map((it) => it.pose));
    const fresh = LIBRARY_POSES.filter((p) => !have.has(p.text));
    const queue = [...fresh, ...LIBRARY_POSES].slice(0, count);

    const results = await Promise.all(
      queue.map(async (pose) => {
        const raw = await generateLibraryPose(refBytes, pose.text, pose.framing);
        if (!raw) return null;
        const cut = await keyOutMagenta(raw.bytes);
        if (!cut) return null;
        return addLibraryImage({
          playerId,
          bytes: cut,
          source: 'ai',
          status: 'pending',
          pose: pose.text,
          createdBy: caller.uid,
          refs: picked.map((r) => r.id),
        });
      })
    );
    const items = results.filter(Boolean);
    return NextResponse.json({ items, requested: queue.length, failed: queue.length - items.length });
  } catch (err) {
    console.error('[matchday library] generate error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 });
  }
}
