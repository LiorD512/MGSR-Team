/**
 * Gemini image helpers for MATCHDAY v2 (server-only).
 *
 * SAFETY RAIL: every prompt here instructs the model to keep the player's face
 * and identity 100% unchanged. The model is only ever asked to remove a
 * background, swap a shirt from a real reference, or re-pose the body. If no
 * GEMINI_API_KEY is configured, the cutout gracefully falls back to returning
 * the original bytes so the feature still produces a (less polished) poster.
 *
 * MIME is always derived from the real bytes — never hardcoded — which avoids
 * the "declared png but is jpeg" class of errors.
 */

import { GoogleGenAI } from '@google/genai';


/**
 * The API key as configured, cleaned: env UIs (Vercel, .env files) often keep
 * a trailing newline / spaces or surrounding quotes, which make every call fail
 * with "API key not valid" while the key looks right.
 */
export function geminiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) return null;
  const k = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  return k || null;
}

export function geminiConfigured(): boolean {
  return Boolean(geminiKey());
}

function client(): GoogleGenAI {
  const apiKey = geminiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey });
}

export const IMAGE_MODELS = { primary: 'gemini-3-pro-image-preview', fallback: 'gemini-2.5-flash-image' } as const;
/** Text model used by the app's other AI features — a control in diagnostics. */
export const TEXT_CONTROL_MODEL = 'gemini-2.5-flash';
const MODEL_PRIMARY: string = IMAGE_MODELS.primary;
const MODEL_FALLBACK: string = IMAGE_MODELS.fallback;

/** Collects WHY a generation produced no image, so the UI can show the real cause. */
export interface GenDiag {
  errors: string[];
}

/** Hard cap per model call, so one hung request can't eat the whole function budget. */
const CALL_TIMEOUT_MS = 75_000;
/**
 * Total time budget per generation step (all retries + the fallback model).
 * The generate route allows 300 s; kit swap + cutout + scene must fit inside it.
 */
export const STEP_BUDGET_MS = { cutout: 100_000, kit: 70_000, scene: 60_000 } as const;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${what} took longer than ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * What kind of quota a 429 / RESOURCE_EXHAUSTED hit. Google's error text names
 * the quota (e.g. `generate_content_free_tier_requests, limit: 0`,
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`) and a retry delay.
 */
export interface QuotaInfo {
  /** 'free_tier' = the key's project has no billing → image models are not included (limit 0). */
  kind: 'free_tier' | 'per_day' | 'per_minute' | 'unknown';
  /** Seconds Google asks us to wait, when given. */
  retryAfterS: number | null;
  model: string | null;
}

export function parseQuota(raw: string): QuotaInfo | null {
  if (!/\b429\b|resource_exhausted|quota/i.test(raw)) return null;
  const freeTier = /free[_ -]?tier/i.test(raw) || /limit:\s*0\b/i.test(raw);
  const perDay = /per\s*day|perday|requests per day|daily/i.test(raw);
  const perMinute = /per\s*minute|perminute|tokens per minute|rpm/i.test(raw);
  const delay =
    raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i)?.[1] ?? raw.match(/retry in\s+(\d+(?:\.\d+)?)\s*s/i)?.[1] ?? null;
  const model = raw.match(/model:\s*([a-z0-9.\-]+)/i)?.[1] ?? null;
  return {
    kind: freeTier ? 'free_tier' : perDay ? 'per_day' : perMinute ? 'per_minute' : 'unknown',
    retryAfterS: delay ? Math.ceil(Number(delay)) : null,
    model,
  };
}

/**
 * Turn a raw Gemini / network error into a short, actionable reason. Raw API
 * messages contain the HTTP status and Google's error code.
 */
export function explainGeminiError(raw: string): string {
  const m = raw.toLowerCase();
  if (/api key not valid|api_key_invalid|invalid api key/.test(m))
    return 'Gemini rejected the API key — check GEMINI_API_KEY in the server environment (no spaces, quotes or line breaks), then redeploy.';
  if (/location is not supported|user location|failed_precondition/.test(m))
    return 'Gemini is not available from the server’s region — change the Vercel function region (e.g. to iad1).';
  if (/prepay|prepaid|credit balance|credits? (are|is) (depleted|exhausted)|insufficient (funds|credit)/.test(m))
    return 'The prepaid Gemini credits of this key’s project are used up — top up the balance in Google AI Studio (Billing).';
  if (/spend(ing)?\s*(cap|limit)|budget (exceeded|limit)|billing (account|is) (closed|disabled|suspended|not active)|billing account/.test(m))
    return 'The billing account / spend limit of this key’s project blocks the request — check Billing in Google AI Studio / Google Cloud.';
  const q = parseQuota(raw);
  if (q) {
    if (q.kind === 'free_tier')
      return 'This API key is on Google’s FREE tier, and image models are not included in it (limit 0) — so cutouts can never work with it. Fix: enable billing on the Google Cloud project of this key (aistudio.google.com, API keys, open the key’s project, Set up billing), or put a key from a billing-enabled project in GEMINI_API_KEY.';
    if (q.kind === 'per_day')
      return 'The daily image limit of this key’s project is used up. It resets within 24 h — or raise the limit / tier in Google AI Studio.';
    if (q.kind === 'per_minute')
      return `Too many image requests in the last minute.${q.retryAfterS ? ` Google asks to wait ${q.retryAfterS} s` : ' Wait a minute'} and try again.`;
    return 'Google refused with “quota exhausted” without saying which limit. Most often: the key’s Google project has no billing for image models, or its usage / spend limit is reached. Check “Usage & limits” for this key in Google AI Studio — the technical details below show Google’s exact answer.';
  }
  if (/rate limit|exhausted/.test(m)) return 'Rate limit hit on this key — wait a minute and try again.';
  if (/\b403\b|permission_denied|permission denied/.test(m))
    return 'This API key is not allowed to use the image models — enable billing / the Generative Language API on the key’s Google project.';
  if (/\b404\b|not_found|is not found|not supported for generatecontent/.test(m))
    return 'The image model is not available for this key / project.';
  if (/timeout|timed out|deadline/.test(m)) return 'The image model did not answer in time.';
  if (/\b5\d\d\b|unavailable|overloaded|internal/.test(m)) return 'Google’s image model is temporarily overloaded — try again in a minute.';
  if (/fetch failed|enotfound|econnreset|network/.test(m)) return 'The server could not reach Google (network error).';
  return raw.slice(0, 220);
}

export function sniffMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'image/jpeg';
}

function imagePart(buf: Buffer) {
  return { inlineData: { data: buf.toString('base64'), mimeType: sniffMime(buf) } };
}

interface GenResult {
  bytes: Buffer;
  mimeType: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transient failures worth retrying: rate limits, overload, timeouts, 5xx. */
function isTransient(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /\b(429|500|502|503|504)\b/.test(msg) || /rate|quota|overload|unavailable|timeout|exhausted|internal/.test(msg);
}

/** Why a 200 response carried no image (safety block, refusal, text-only answer …). */
function emptyReason(resp: unknown): string {
  const r = resp as { promptFeedback?: { blockReason?: string }; candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }> };
  if (r.promptFeedback?.blockReason) return `request blocked by the model (${r.promptFeedback.blockReason})`;
  const c = r.candidates?.[0];
  if (!c) return 'the model returned no result';
  const text = c.content?.parts?.map((p) => p.text).filter(Boolean).join(' ').slice(0, 120);
  return `the model returned no image (${c.finishReason ?? 'no reason'})${text ? `: “${text}”` : ''}`;
}

/** Pull the first inline image out of a response, if any. */
function extractImage(resp: unknown): GenResult | null {
  const cand = (resp as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates?.[0];
  for (const p of cand?.content?.parts ?? []) {
    const inline = (p as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (inline?.data) {
      const bytes = Buffer.from(inline.data, 'base64');
      return { bytes, mimeType: inline.mimeType ?? sniffMime(bytes) };
    }
  }
  return null;
}

/**
 * Call a model once, returning an image or null. Never throws for an empty
 * response; rethrows the API error so the caller can decide to retry/fallback.
 */
async function callModel(model: string, parts: unknown[], diag?: GenDiag, timeoutMs = CALL_TIMEOUT_MS): Promise<GenResult | null> {
  const ai = client();
  const resp = await withTimeout(ai.models.generateContent({ model, contents: [{ role: 'user', parts }] as never }), timeoutMs, model);
  const img = extractImage(resp);
  if (!img) diag?.errors.push(`${model}: ${emptyReason(resp)}`);
  return img;
}

/**
 * Robust generation: try the primary model, then the fallback, each with a
 * couple of retries on transient errors (rate limit / overload / 5xx). This is
 * what makes a burst of generations not suddenly fail with "no image".
 */
async function generate(parts: unknown[], label: string, diag?: GenDiag, budgetMs = 100_000): Promise<GenResult | null> {
  const models = [MODEL_PRIMARY, MODEL_FALLBACK];
  const deadline = Date.now() + budgetMs;
  for (let m = 0; m < models.length; m++) {
    const model = models[m];
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = deadline - Date.now();
      if (left < 8_000) {
        diag?.errors.push(`${model}: timeout — the ${label} step ran out of time (${Math.round(budgetMs / 1000)} s budget)`);
        console.warn(`[matchday v2] ${label}: time budget exhausted`);
        return null;
      }
      try {
        const img = await callModel(model, parts, diag, Math.min(CALL_TIMEOUT_MS, left));
        if (img) return img;
        // Empty (no image) — a short backoff then retry the same model.
        if (attempt < 2) await sleep(600 * (attempt + 1));
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        const quota = parseQuota(msg);
        // Free tier (limit 0) or a used-up daily quota: retrying can't help.
        const hopeless = quota?.kind === 'free_tier' || quota?.kind === 'per_day';
        const transient = !hopeless && isTransient(e);
        diag?.errors.push(`${model}: ${msg}`);
        console.warn(
          `[matchday v2] ${label}: ${model} attempt ${attempt + 1} failed (${transient ? 'transient' : 'permanent'}): ${(e as Error).message}`
        );
        if (transient && attempt < 2) {
          // Per-minute limit: wait what Google asks (if it fits the step budget), else a short backoff.
          const wantMs = quota?.retryAfterS ? quota.retryAfterS * 1000 + 500 : 800 * (attempt + 1);
          if (wantMs > deadline - Date.now() - 10_000) break; // not enough time left — try the next model
          await sleep(Math.min(wantMs, 35_000));
          continue;
        }
        break; // permanent error, or retries exhausted → try next model
      }
    }
  }
  console.warn(`[matchday v2] ${label}: all models/attempts exhausted — no image`);
  return null;
}

/**
 * The chroma-key colour we ask the model to place the player on. Pure magenta
 * is almost never present in skin/kit, so sharp can key it out cleanly. We ask
 * for a FLAT SOLID colour (never "transparency", which the model fakes with a
 * checkerboard it bakes into the pixels).
 */
export const CHROMA_KEY = { r: 255, g: 0, b: 255 } as const;

/**
 * Place the player on a flat magenta background so the caller can key it out to
 * true transparency. Returns null when Gemini is unavailable — the caller must
 * then skip the cutout rather than paste a raw rectangle.
 */
export async function cutoutPlayer(src: Buffer, diag?: GenDiag): Promise<GenResult | null> {
  if (!geminiConfigured()) return null;
  const out = await generate(
    [
      imagePart(src),
      {
        text:
          'Replace the ENTIRE background of this football player photo with a single FLAT, SOLID ' +
          'magenta colour (hex #FF00FF, RGB 255,0,255) that completely fills every pixel that is ' +
          'not the player. Keep the player\'s face, body, kit, hair and any ball EXACTLY as in the ' +
          'photo — do not alter the person, do not recolour them, do not add glow or shadow. The ' +
          'edge around the hair and body must be crisp. Do NOT output a checkerboard or any ' +
          'transparency pattern — the background must be a uniform magenta fill. Output the full image.',
      },
    ],
    'cutout',
    diag,
    STEP_BUDGET_MS.cutout
  );
  return out;
}

/**
 * Swap the player's shirt/shorts to the kit shown in `kitRef`, placing
 * `squadNumber`. Face/pose/identity are explicitly locked. Returns null on
 * failure so the caller keeps the original photo.
 */
export async function swapKit(src: Buffer, kitRef: Buffer, squadNumber: string | null, diag?: GenDiag): Promise<GenResult | null> {
  if (!geminiConfigured()) return null;
  const numberLine = squadNumber
    ? `Put the number ${squadNumber} on the shirt and shorts in the correct football placement.`
    : 'Keep any existing squad number as-is.';
  return generate(
    [
      imagePart(src),
      imagePart(kitRef),
      {
        text:
          'You are editing a football player photo. ABSOLUTE RULES: keep the player\'s FACE, HEAD, ' +
          'HAIR, SKIN, POSE, ARMS, LEGS and any BALL 100% identical to the first image — do not ' +
          'alter his identity in any way. ONLY change his shirt and shorts to exactly the kit shown ' +
          'in the SECOND image (match its colours, collar, sleeves, sponsor and crest placement). ' +
          numberLine +
          ' Match the kit lighting and perspective to the player\'s body so it looks naturally worn. ' +
          'Keep the background transparent/unchanged. Output only the edited player.',
      },
    ],
    'kit-swap',
    diag,
    STEP_BUDGET_MS.kit
  );
}

// NOTE: There is deliberately NO alternate-pose generator. Asking an image
// model to "re-pose" the player repaints the whole person — including the FACE
// — producing a convincing but DIFFERENT human. That violates the core rule
// that the player's face is never generated. The secondary figure in two-figure
// layouts is instead the real cutout, mirrored and darkened into a silhouette
// echo (see render.ts) — a design element, never a second invented person.

/** Generate an atmospheric background sky (no people, no text). */
export async function generateSky(kind: 'golden' | 'storm'): Promise<GenResult | null> {
  if (!geminiConfigured()) return null;
  const prompt =
    kind === 'golden'
      ? 'A dramatic golden-hour sky over an empty football stadium at sunset, vertical 9:16. ' +
        'Warm orange and amber clouds, glowing low sun, light haze and god-rays, cinematic sports-poster ' +
        'atmosphere. No people, no text. Dark enough at the top for white title text. Photorealistic.'
      : 'A dramatic stormy sky over a football stadium at dusk, vertical 9:16. Heavy dark grey and gold ' +
        'storm clouds, moody cinematic lighting, light breaking through, atmospheric haze. No people, no ' +
        'text. Photorealistic sports-poster background.';
  return generate([{ text: prompt }], `sky-${kind}`);
}

/**
 * Generate a full CINEMATIC BACKGROUND scene for the poster — dramatic, dark,
 * high-contrast, with thick atmospheric smoke and volumetric stadium lighting.
 * Crucially this contains NO people, NO text and NO logos: the real player
 * cutout, accurate crests and fixture text are composited on top afterwards, so
 * the player's face is never generated and the facts can never be garbled.
 *
 * When a stadium reference image is supplied, the model stylises THAT venue so
 * the backdrop is the real ground, dramatised. 9:16, tuned per palette.
 */
export async function generateCinematicScene(opts: {
  palette: string; // e.g. "deep crimson and ember orange"
  stadiumRef?: Buffer | null;
}): Promise<GenResult | null> {
  if (!geminiConfigured()) return null;
  const prompt =
    `Create a dramatic, cinematic football poster BACKGROUND in a strict 9:16 vertical ratio. ` +
    `Mood: dark, high-contrast, mature and premium — like a Champions League key visual. ` +
    `A moody football stadium at night under volumetric floodlight beams, with THICK rolling ` +
    `atmospheric smoke and haze drifting across the lower third, deep shadows, subtle ${opts.palette} ` +
    `colour grade, fine film grain and a strong vignette so the centre stays clear for a player. ` +
    (opts.stadiumRef
      ? `Base the stadium on the supplied reference photo, dramatised and darkened. `
      : ``) +
    `ABSOLUTELY NO people, NO players, NO text, NO letters, NO logos, NO crests, NO watermarks — ` +
    `only the empty atmospheric stadium scene. Photorealistic, ultra-detailed, 8K, no borders.`;

  const parts: unknown[] = opts.stadiumRef ? [imagePart(opts.stadiumRef), { text: prompt }] : [{ text: prompt }];
  return generate(parts, 'cinematic-scene', undefined, STEP_BUDGET_MS.scene);
}

/**
 * One readable reason from a GenDiag: the most specific error wins (a key /
 * quota / permission problem is more useful than the follow-up "no image").
 */
/** Google's error body without the SDK prefix, pretty enough to read and paste (max ~1.5 KB). */
function rawForSupport(raw: string): string {
  const i = raw.indexOf('{');
  if (i >= 0) {
    try {
      const body = JSON.parse(raw.slice(i));
      return `${raw.slice(0, i).trim()}\n${JSON.stringify(body, null, 1)}`.slice(0, 1500);
    } catch {
      /* not JSON */
    }
  }
  return raw.slice(0, 1500);
}

export function summarizeDiag(diag: GenDiag): string | null {
  if (!diag.errors.length) return null;
  const order = [/api key not valid|api_key_invalid/i, /location/i, /\b403\b|permission/i, /free[_ -]?tier|limit:\s*0\b/i, /per\s*day|perday/i, /\b429\b|quota|exhausted|rate/i, /\b404\b|not_found/i, /timeout/i, /blocked|no image|no result/i];
  for (const re of order) {
    const hit = diag.errors.find((e) => re.test(e));
    if (hit) return explainGeminiError(hit.replace(/^[^:]+:\s*/, ''));
  }
  return explainGeminiError(diag.errors[diag.errors.length - 1].replace(/^[^:]+:\s*/, ''));
}

// ── Diagnostics (used by /api/matchday/diagnose) ─────────────────────────────

export interface ModelCheck {
  model: string;
  ok: boolean;
  ms: number;
  /** Plain-language cause when not ok. */
  reason: string | null;
  /** Raw error (truncated) for support. */
  raw: string | null;
}

/** A tiny text request to a model: proves key / permission / quota / region, costs a fraction of a cent. */
export async function pingModel(model: string): Promise<ModelCheck> {
  const t0 = Date.now();
  try {
    const ai = client();
    await withTimeout(
      ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK. Do not create an image.' }] }] as never }),
      30_000,
      model
    );
    return { model, ok: true, ms: Date.now() - t0, reason: null, raw: null };
  } catch (e) {
    const raw = (e as Error).message ?? String(e);
    return { model, ok: false, ms: Date.now() - t0, reason: explainGeminiError(raw), raw: rawForSupport(raw) };
  }
}

/** A real (small) cutout of a synthetic figure — exercises the full image path. */
export async function testCutout(sample: Buffer): Promise<{ ok: boolean; ms: number; reason: string | null; errors: string[] }> {
  const t0 = Date.now();
  const diag: GenDiag = { errors: [] };
  const out = await cutoutPlayer(sample, diag);
  return { ok: Boolean(out), ms: Date.now() - t0, reason: out ? null : summarizeDiag(diag), errors: diag.errors.map((e) => rawForSupport(e)) };
}
