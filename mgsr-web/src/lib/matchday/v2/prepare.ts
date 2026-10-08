/**
 * Asset preparation for MATCHDAY v2 (server-only, sharp).
 *
 * Turns a curated player photo into the layers the templates need:
 *   - cutActionColor  : sharp colour cutout (hard edges, no glow)
 *   - heroColor       : alternate hero pose cutout (falls back to action)
 *   - backdropMono    : large monochrome portrait for the backdrop layer
 *
 * The transparent cutout comes from Gemini when configured; otherwise we fall
 * back to the original photo trimmed to content (still usable, less polished).
 */

import sharp from 'sharp';
import { cutoutPlayer, swapKit, altPose, geminiConfigured } from './gemini';

export interface PreparedLayers {
  cutAction: Buffer; // transparent PNG
  hero: Buffer; // transparent PNG (alt pose or same as action)
  backdropMono: Buffer; // transparent PNG, greyscale
  usedGemini: boolean;
}

/**
 * Ensure a buffer is a transparent PNG trimmed to the subject. If the input is
 * already PNG with alpha we trim; otherwise we return it normalized to PNG
 * (opaque) — the templates still composite it, just without a clean edge.
 */
async function toTrimmedPng(buf: Buffer): Promise<Buffer> {
  const img = sharp(buf);
  const meta = await img.metadata();
  // Trim transparent borders when the image has an alpha channel.
  if (meta.hasAlpha) {
    return sharp(buf).trim({ threshold: 10 }).png().toBuffer();
  }
  return sharp(buf).png().toBuffer();
}

/** Build a greyscale, high-contrast version preserving alpha for the backdrop. */
async function toMono(pngWithAlpha: Buffer): Promise<Buffer> {
  const base = sharp(pngWithAlpha);
  const meta = await base.metadata();
  if (meta.hasAlpha) {
    // Extract alpha, greyscale the colour, recombine.
    const alpha = await sharp(pngWithAlpha).ensureAlpha().extractChannel(3).toBuffer();
    const grey = await sharp(pngWithAlpha).removeAlpha().greyscale().linear(1.2, -12).toBuffer();
    return sharp(grey)
      .joinChannel(alpha)
      .png()
      .toBuffer();
  }
  return sharp(pngWithAlpha).greyscale().linear(1.2, -12).png().toBuffer();
}

export async function prepareLayers(opts: {
  playerPhoto: Buffer;
  kitPhoto?: Buffer | null;
  squadNumber?: string | null;
  needHero: boolean;
}): Promise<PreparedLayers> {
  const usedGemini = geminiConfigured();

  // 1) Optional kit swap FIRST (so cutout/pose carry the correct shirt).
  let source = opts.playerPhoto;
  if (opts.kitPhoto) {
    const swapped = await swapKit(source, opts.kitPhoto, opts.squadNumber ?? null);
    if (swapped) source = swapped.bytes;
  }

  // 2) Clean action cutout.
  const cut = await cutoutPlayer(source);
  const cutAction = await toTrimmedPng(cut.bytes);

  // 3) Alternate hero pose when the chosen design needs two poses.
  let hero = cutAction;
  if (opts.needHero) {
    const pose = await altPose(source);
    if (pose) {
      const posed = await cutoutPlayer(pose.bytes);
      hero = await toTrimmedPng(posed.bytes);
    }
  }

  // 4) Monochrome backdrop from the hero (or action) cutout.
  const backdropMono = await toMono(hero);

  return { cutAction, hero, backdropMono, usedGemini };
}
