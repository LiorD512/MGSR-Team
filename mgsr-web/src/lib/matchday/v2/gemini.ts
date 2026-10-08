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

async function generate(parts: unknown[], label: string): Promise<GenResult | null> {
  const ai = client();
  let resp;
  try {
    resp = await ai.models.generateContent({ model: MODEL_PRIMARY, contents: [{ role: 'user', parts }] as never });
  } catch (e) {
    console.warn(`[matchday v2] ${label}: primary model failed, falling back:`, (e as Error).message);
    resp = await ai.models.generateContent({ model: MODEL_FALLBACK, contents: [{ role: 'user', parts }] as never });
  }
  const cand = resp.candidates?.[0];
  for (const p of cand?.content?.parts ?? []) {
    const inline = (p as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (inline?.data) {
      const bytes = Buffer.from(inline.data, 'base64');
      return { bytes, mimeType: inline.mimeType ?? sniffMime(bytes) };
    }
  }
  console.warn(`[matchday v2] ${label}: no image returned (finish=${cand?.finishReason})`);
  return null;
}

/**
 * Clean cutout — hard, natural edges, no glow. Returns a flattened image the
 * caller re-cuts to transparency with sharp/rembg-equivalent, OR the original
 * bytes if Gemini is unavailable.
 */
export async function cutoutPlayer(src: Buffer): Promise<GenResult> {
  if (!geminiConfigured()) return { bytes: src, mimeType: sniffMime(src) };
  const out = await generate(
    [
      imagePart(src),
      {
        text:
          'Cut out the football player from this photo with a CLEAN, SHARP, NATURAL edge. ' +
          'Remove the entire background completely. Keep the player\'s face, body, kit, hair ' +
          'and any ball EXACTLY as in the photo — do not alter the person. Do NOT add any glow, ' +
          'halo, outline, shadow or light around the player. Edges around hair and body must be ' +
          'crisp and realistic, like a professional studio cutout. Output just the player.',
      },
    ],
    'cutout'
  );
  return out ?? { bytes: src, mimeType: sniffMime(src) };
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
          'level. Studio-style, clean. Output the player on a transparent background, high resolution.',
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
