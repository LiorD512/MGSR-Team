import { NextRequest, NextResponse } from 'next/server';
import { authenticate, exec, failure, isResponse } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';

const COLUMN: Record<string, string> = { correct: 'fb_correct', incorrect: 'fb_incorrect', outdated: 'fb_outdated' };

/** POST /api/transfer-radar/feedback {reportId, kind: correct|incorrect|outdated} - feeds source reliability and the evaluation set. */
export async function POST(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    const { reportId, kind } = (await req.json()) as { reportId?: string; kind?: string };
    const col = COLUMN[String(kind)];
    if (!reportId || !col) return NextResponse.json({ error: 'reportId and kind (correct|incorrect|outdated) required' }, { status: 400 });
    const r = await exec(`UPDATE reports SET ${col} = ${col} + 1 WHERE id = ?`, [reportId]);
    return NextResponse.json({ ok: r.rowsAffected === 1 });
  } catch (e) { return failure(e); }
}
