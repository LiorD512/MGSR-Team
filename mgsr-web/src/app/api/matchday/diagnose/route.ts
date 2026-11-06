import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { guardMatchday } from '@/lib/matchday/v2/guard';
import { IMAGE_MODELS, TEXT_CONTROL_MODEL, geminiKey, pingModel, testCutout } from '@/lib/matchday/v2/gemini';

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
    return NextResponse.json({ ok: false, key, server, models: [], verdict: 'GEMINI_API_KEY is not set on this server. Add it in Vercel (Settings, Environment Variables, Production) and redeploy.' });
  }

  // Image models + a text model as control (the one the app's other AI features use).
  const [p1, p2, textModel] = await Promise.all([pingModel(IMAGE_MODELS.primary), pingModel(IMAGE_MODELS.fallback), pingModel(TEXT_CONTROL_MODEL)]);
  const models = [p1, p2];

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
  // The text control tells WHERE the problem is: the image models only, or the whole key / project.
  const scope = okModel
    ? null
    : textModel.ok
      ? 'The key works for text models but NOT for image models. The key is fine — its Google project has no access / quota for image models (usually no billing on that project, or a usage limit). Fix it in Google AI Studio (Billing, Usage & limits for that key), or use a key from a billing-enabled project.'
      : 'The key fails for text models too — so the problem is the key / its whole project, not only the image models (other AI features using this key are affected as well).';
  const verdict = ok
    ? cutout
      ? 'All good — the server can reach the image models and cut out a test figure.'
      : `The key works with ${models.filter((m) => m.ok).map((m) => m.model).join(' and ')}. If posters still fail, run the full test.`
    : cutout && okModel
      ? `The key reaches the models, but the cutout test failed: ${cutout.reason ?? 'no image returned'}`
      : scope && textModel.ok
        ? scope
        : `${scope ?? ''} ${models[0].reason ?? models[1].reason ?? ''}`.trim();
  return NextResponse.json({ ok, key, server, models, textModel, cutout, verdict });
}
