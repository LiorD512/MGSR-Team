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

const MODEL_PRIMARY = 'gemini-3-pro-image-preview';
const MODEL_FALLBACK = 'gemini-2.5-flash-image';

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenAI({ apiKey });
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
async function callModel(model: string, parts: unknown[]): Promise<GenResult | null> {
  const ai = client();
  const resp = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }] as never });
  return extractImage(resp);
}

/**
 * Robust generation: try the primary model, then the fallback, each with a
 * couple of retries on transient errors (rate limit / overload / 5xx). This is
 * what makes a burst of generations not suddenly fail with "no image".
 */
async function generate(parts: unknown[], label: string): Promise<GenResult | null> {
  const models = [MODEL_PRIMARY, MODEL_FALLBACK];
  for (let m = 0; m < models.length; m++) {
    const model = models[m];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const img = await callModel(model, parts);
        if (img) return img;
        // Empty (no image) — a short backoff then retry the same model.
        if (attempt < 2) await sleep(600 * (attempt + 1));
      } catch (e) {
        const transient = isTransient(e);
        console.warn(
          `[matchday v2] ${label}: ${model} attempt ${attempt + 1} failed (${transient ? 'transient' : 'permanent'}): ${(e as Error).message}`
        );
        if (transient && attempt < 2) {
          await sleep(800 * (attempt + 1)); // 0.8s, 1.6s backoff
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
export async function cutoutPlayer(src: Buffer): Promise<GenResult | null> {
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
    'cutout'
  );
  return out;
}

/**
 * Swap the player's shirt/shorts to the kit shown in `kitRef`, placing
 * `squadNumber`. Face/pose/identity are explicitly locked. Returns null on
 * failure so the caller keeps the original photo.
 */
export async function swapKit(src: Buffer, kitRef: Buffer, squadNumber: string | null): Promise<GenResult | null> {
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
    'kit-swap'
  );
}

/**
 * Produce an alternate confident HERO pose (chest/waist-up, arms crossed or
 * hands on hips) with the face strictly preserved. Returns null on failure.
 */
export async function altPose(src: Buffer): Promise<GenResult | null> {
  if (!geminiConfigured()) return null;
  return generate(
    [
      imagePart(src),
      {
        text:
          'Create an ALTERNATE HERO POSE of this exact football player for a poster. ABSOLUTE RULES: ' +
          'keep the FACE, HEAD, HAIR, SKIN TONE and FACIAL FEATURES 100% identical — same person, ' +
          'unmistakably; do not restyle, age, slim or beautify the face. Keep the same kit and ' +
          'number. CHANGE ONLY the body pose and framing to a confident static hero pose: chest-up ' +
          'to waist-up, facing camera, arms crossed or hands on hips, calm powerful expression, head ' +
          'level. Place the player on a single FLAT, SOLID magenta background (hex #FF00FF) filling ' +
          'every non-player pixel — never a checkerboard or transparency pattern. High resolution.',
      },
    ],
    'alt-pose'
  );
}

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
