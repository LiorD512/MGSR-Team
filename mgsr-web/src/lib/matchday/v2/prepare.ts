/**
 * Asset preparation for MATCHDAY v2 (server-only, sharp).
 *
 * Gemini places the player on a flat MAGENTA background; here we key that colour
 * out to produce a TRUE transparent cutout (hard edges, no glow). This avoids
 * the two failures of asking Gemini for "transparency" directly: it either
 * keeps the real background or bakes in a checkerboard pattern.
 *
 * If the cutout can't be produced (no Gemini, or the model failed), the layers
 * are returned as null so the renderer SKIPS them — we never paste a raw
 * rectangular photo onto the poster.
 */

import sharp from 'sharp';
import { cutoutPlayer, swapKit, altPose, CHROMA_KEY } from './gemini';

export interface PreparedLayers {
  cutAction: Buffer | null; // transparent PNG (null if cutout failed)
  hero: Buffer | null; // transparent PNG
  backdropMono: Buffer | null; // transparent greyscale PNG
  usedGemini: boolean;
}

/**
 * Key out the flat magenta background to real transparency, then trim to the
 * subject. Uses a per-pixel distance to the key colour so anti-aliased edge
 * pixels fade out instead of leaving a magenta fringe. Returns null if the
 * image doesn't actually contain a keyable magenta field (so we don't ship a
 * rectangle).
 */
async function keyOutMagenta(buf: Buffer): Promise<Buffer | null> {
  const img = sharp(buf).ensureAlpha();
  const { width, height } = await img.metadata();
  if (!width || !height) return null;

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 4
  let keyed = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Distance from pure magenta (255,0,255). Magenta = high R, low G, high B.
    const dist = Math.sqrt((r - CHROMA_KEY.r) ** 2 + (g - CHROMA_KEY.g) ** 2 + (b - CHROMA_KEY.b) ** 2);
    if (dist < 70) {
      data[i + 3] = 0; // fully transparent
      keyed++;
    } else if (dist < 130) {
      // Edge feather: partial alpha, and pull magenta spill out of the colour.
      const a = Math.round(((dist - 70) / 60) * 255);
      data[i + 3] = Math.min(data[i + 3], a);
      // de-spill: clamp green up toward r/b average to neutralise magenta tint
      const avg = (r + b) / 2;
      if (g < avg) data[i + 1] = Math.round((g + avg) / 2);
    }
  }
  // If almost nothing was keyed, the model didn't give us a magenta field —
  // treat as a failed cutout rather than shipping a full rectangle.
  const ratio = keyed / (width * height);
  if (ratio < 0.04) return null;

  const out = await sharp(data, { raw: { width, height, channels: ch } }).png().toBuffer();
  // Trim the now-transparent border to the subject.
  return sharp(out).trim({ threshold: 1 }).png().toBuffer();
}

/** Greyscale a transparent cutout while preserving its alpha, for the backdrop. */
async function toMono(pngWithAlpha: Buffer): Promise<Buffer> {
  const alpha = await sharp(pngWithAlpha).ensureAlpha().extractChannel(3).toBuffer();
  const grey = await sharp(pngWithAlpha).removeAlpha().greyscale().linear(1.2, -12).toBuffer();
  return sharp(grey).joinChannel(alpha).png().toBuffer();
}

export async function prepareLayers(opts: {
  playerPhoto: Buffer;
  kitPhoto?: Buffer | null;
  squadNumber?: string | null;
  needHero: boolean;
}): Promise<PreparedLayers> {
  // 1) Optional kit swap FIRST (so cutout/pose carry the correct shirt).
  let source = opts.playerPhoto;
  if (opts.kitPhoto) {
    const swapped = await swapKit(source, opts.kitPhoto, opts.squadNumber ?? null);
    if (swapped) source = swapped.bytes;
  }

  // 2) Action cutout → key out magenta → true transparency.
  const cutRaw = await cutoutPlayer(source);
  const cutAction = cutRaw ? await keyOutMagenta(cutRaw.bytes) : null;

  // 3) Alternate hero pose (also keyed). Falls back to the action cutout.
  let hero = cutAction;
  if (opts.needHero) {
    const pose = await altPose(source);
    if (pose) {
      const keyed = await keyOutMagenta(pose.bytes);
      if (keyed) hero = keyed;
    }
  }

  // 4) Monochrome backdrop from the hero (or action) cutout — only if we have one.
  const backdropMono = hero ? await toMono(hero) : null;

  return { cutAction, hero, backdropMono, usedGemini: Boolean(cutAction) };
}
