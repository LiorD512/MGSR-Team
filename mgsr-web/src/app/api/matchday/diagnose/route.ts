import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { guardMatchday } from '@/lib/matchday/v2/guard';
import { IMAGE_MODELS, geminiKey, pingImageModel, testCutout } from '@/lib/matchday/v2/gemini';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * MATCHDAY AI health check, run on the SERVER (so it reflects production env).
 *   GET                → key + region + a tiny text ping to each image model (≈ free)
 *   GET ?full=1        → also one real small cutout (≈ $0.04–0.13)
 * Never returns the key itself — only its length, last 4 characters and
 * whether it had whitespace / quotes around it.
 */
export async function GET(request: NextRequest) {
  const caller = await guardMatchday(request, 'diagnose');
  if (caller instanceof NextResponse) return caller;

  const raw = process.env.GEMINI_API_KEY ?? '';
  const clean = geminiKey();
  const key = {
    present: Boolean(clean),
    length: clean?.length ?? 0,
    last4: clean ? clean.slice(-4) : null,
    /** The env value had spaces / line breaks / quotes around it (now stripped automatically). */
    hadExtraCharacters: Boolean(raw) && raw !== clean,
  };
  const server = {
    vercel: Boolean(process.env.VERCEL),
    env: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    region: process.env.VERCEL_REGION ?? null,
  };
  if (!key.present) {
    return NextResponse.json({ ok: false, key, server, models: [], verdict: 'GEMINI_API_KEY is not set on this server. Add it in Vercel → Settings → Environment Variables (Production) and redeploy.' });
  }

  const models = await Promise.all([pingImageModel(IMAGE_MODELS.primary), pingImageModel(IMAGE_MODELS.fallback)]);

  let cutout: Awaited<ReturnType<typeof testCutout>> | null = null;
  if (request.nextUrl.searchParams.get('full') === '1') {
    // Synthetic "player": a simple figure on a light background (no real person).
    const sample = await sharp(
      Buffer.from(
        '<svg width="320" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="480" fill="#d9d4c8"/>' +
          '<circle cx="160" cy="90" r="42" fill="#5a3a2a"/><rect x="104" y="140" width="112" height="150" rx="20" fill="#ffffff" stroke="#1d3a9a" stroke-width="8"/>' +
          '<rect x="112" y="290" width="40" height="150" fill="#1d3a9a"/><rect x="168" y="290" width="40" height="150" fill="#1d3a9a"/></svg>'
      )
    )
      .jpeg({ quality: 90 })
      .toBuffer();
    cutout = await testCutout(sample);
  }

  const okModel = models.find((m) => m.ok);
  const ok = Boolean(okModel) && (cutout ? cutout.ok : true);
  const verdict = ok
    ? cutout
      ? 'All good — the server can reach the image models and cut out a test figure.'
      : `The key works with ${models.filter((m) => m.ok).map((m) => m.model).join(' and ')}. If posters still fail, run the full test.`
    : cutout && okModel
      ? `The key reaches the models, but the cutout test failed: ${cutout.reason ?? 'no image returned'}`
      : models[0].reason ?? models[1].reason ?? 'The image models are not reachable with this key.';
  return NextResponse.json({ ok, key, server, models, cutout, verdict });
}
