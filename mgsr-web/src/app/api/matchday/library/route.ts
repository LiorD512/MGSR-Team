import { NextRequest, NextResponse } from 'next/server';
import { guardMatchday } from '@/lib/matchday/v2/guard';
import {
  deleteLibraryImage,
  libraryConfigured,
  listLibrary,
  selectLibraryPhoto,
} from '@/lib/matchday/v2/library';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET ?playerId= → the player's photos + kits, and the current main / second photo and kit. */
export async function GET(request: NextRequest) {
  const caller = await guardMatchday(request, 'library');
  if (caller instanceof NextResponse) return caller;
  const playerId = request.nextUrl.searchParams.get('playerId')?.trim();
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  if (!libraryConfigured()) return NextResponse.json({ items: [], kits: [], mainUrl: null, secondUrl: null, kitUrl: null, configured: false });
  try {
    const lib = await listLibrary(playerId);
    return NextResponse.json({ ...lib, configured: true });
  } catch (err) {
    console.error('[matchday library] list error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Library failed' }, { status: 500 });
  }
}

interface LibraryAction {
  playerId: string;
  action: 'select' | 'delete';
  id?: string;
  slot?: 1 | 2 | 'kit';
  /** For select: the photo / kit URL (null clears the slot). */
  url?: string | null;
}

/** POST { playerId, action: select | delete, ... } */
export async function POST(request: NextRequest) {
  const caller = await guardMatchday(request, 'library');
  if (caller instanceof NextResponse) return caller;
  let body: LibraryAction;
  try {
    body = (await request.json()) as LibraryAction;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body?.playerId || !body?.action) return NextResponse.json({ error: 'playerId and action are required' }, { status: 400 });
  if (!libraryConfigured()) return NextResponse.json({ error: 'Storage is not configured on this environment' }, { status: 503 });
  try {
    if (body.action === 'select') {
      if (body.slot !== 1 && body.slot !== 2 && body.slot !== 'kit') return NextResponse.json({ error: "slot must be 1, 2 or 'kit'" }, { status: 400 });
      await selectLibraryPhoto(body.playerId, body.slot, body.url ?? null);
    } else if (body.action === 'delete') {
      if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      await deleteLibraryImage(body.playerId, body.id);
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[matchday library] action error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Library action failed' }, { status: 500 });
  }
}
