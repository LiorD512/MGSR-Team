/**
 * Gemini usage recording — tokens and images per call, per feature.
 *
 * Every server-side Gemini call reports its `usageMetadata` here. Each call is:
 *   1. logged as one JSON line: `[gemini-usage] {...}` (Vercel logs), and
 *   2. added to a daily Firestore total: `GeminiUsage/{YYYY-MM-DD}` →
 *      `byFeature.<feature>.{calls,tokensIn,tokensOut,thoughts,images,estUsd,late,failed}`.
 *
 * `estUsd` is an ESTIMATE from the list prices in PRICES below (verify them in AI
 * Studio when prices change). The real bill is in Google Cloud Billing.
 *
 * Recording never throws and never blocks a feature for more than ~1.5 s.
 */

export type GeminiFeature =
  | 'market-radar'
  | 'documents-detect'
  | 'matchday-image'
  | 'matchday-diagnose';

/** USD per 1M tokens (text) and per output image. Estimates for the log only. */
const PRICES: Record<string, { in: number; out: number; image?: number }> = {
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
  'gemini-2.5-flash-image': { in: 0.3, out: 2.5, image: 0.039 },
  'gemini-3-pro-image-preview': { in: 2, out: 12, image: 0.134 },
};

export interface GeminiUsageMeta {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export interface RecordOptions {
  feature: GeminiFeature;
  model: string;
  usage?: GeminiUsageMeta | null;
  /** Number of images the call returned (image models). */
  images?: number;
  /** The answer arrived after the caller had already given up on it (still billed). */
  late?: boolean;
  /** The call failed (no usage reported — usually not billed). */
  failed?: boolean;
  /** Extra context for the log line (e.g. item counts). Keep it small, no personal data. */
  extra?: Record<string, unknown>;
}

function estimateUsd(model: string, tokensIn: number, tokensOut: number, thoughts: number, images: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  // Image models: the output tokens ARE the image, billed as the per-image price —
  // so count input + thinking tokens plus the images (not the image tokens again).
  if (p.image !== undefined) return (tokensIn * p.in + thoughts * p.out) / 1_000_000 + images * p.image;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Records one Gemini call. Safe to await; resolves within ~1.5 s even if Firestore is slow. */
export async function recordGeminiUsage(o: RecordOptions): Promise<void> {
  try {
    const tokensIn = o.usage?.promptTokenCount ?? 0;
    const thoughts = o.usage?.thoughtsTokenCount ?? 0;
    const tokensOut = (o.usage?.candidatesTokenCount ?? 0) + thoughts;
    const images = o.images ?? 0;
    const estUsd = o.failed ? 0 : estimateUsd(o.model, tokensIn, tokensOut, thoughts, images);

    console.log(
      `[gemini-usage] ${JSON.stringify({
        feature: o.feature,
        model: o.model,
        tokensIn,
        tokensOut,
        thoughts,
        images,
        estUsd: Number(estUsd.toFixed(6)),
        ...(o.late ? { late: true } : {}),
        ...(o.failed ? { failed: true } : {}),
        ...(o.extra ?? {}),
      })}`
    );

    const write = (async () => {
      const { adminDb, getFirebaseAdmin } = await import('./firebaseAdmin');
      if (!getFirebaseAdmin()) return;
      const { FieldValue } = await import('firebase-admin/firestore');
      const inc = FieldValue.increment;
      const f = o.feature;
      await adminDb()
        .collection('GeminiUsage')
        .doc(dayKey())
        .set(
          {
            date: dayKey(),
            updatedAt: Date.now(),
            byFeature: {
              [f]: {
                calls: inc(o.failed ? 0 : 1),
                failed: inc(o.failed ? 1 : 0),
                late: inc(o.late ? 1 : 0),
                tokensIn: inc(tokensIn),
                tokensOut: inc(tokensOut),
                thoughts: inc(thoughts),
                images: inc(images),
                estUsd: inc(estUsd),
              },
            },
            byModel: {
              [o.model.replace(/[.]/g, '_')]: { calls: inc(o.failed ? 0 : 1), estUsd: inc(estUsd) },
            },
          },
          { merge: true }
        );
    })().catch(() => {});
    await Promise.race([write, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    // usage recording must never break a feature
  }
}
