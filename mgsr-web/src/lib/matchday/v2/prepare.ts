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
import { cutoutPlayer, swapKit, CHROMA_KEY } from './gemini';

export interface PreparedLayers {
  cutAction: Buffer | null; // transparent PNG (null if cutout failed)
  hero: Buffer | null; // transparent PNG
  backdropMono: Buffer | null; // transparent greyscale PNG
  /** True only when `hero` is a genuinely DIFFERENT pose from `cutAction`. */
  heroIsDistinct: boolean;
  usedGemini: boolean;
}

/**
 * Key out the flat magenta background to real transparency, then trim to the
 * subject. Uses a per-pixel distance to the key colour so anti-aliased edge
 * pixels fade out instead of leaving a magenta fringe. Returns null if the
 * image doesn't actually contain a keyable magenta field (so we don't ship a
 * rectangle).
 */
/**
 * Shrink a cutout's alpha mask by ~1px so the outermost ring of edge pixels
 * (where chroma spill lingers) is removed. Done by thresholding a slightly
 * blurred alpha channel and reapplying it.
 */
async function erodeAlpha(png: Buffer): Promise<Buffer> {
  const base = sharp(png).ensureAlpha();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) return png;
  // Erode: blur the alpha a touch, then push mid values to 0 (threshold high),
  // which pulls the mask edge inward by about a pixel.
  const alpha = await sharp(png)
    .ensureAlpha()
    .extractChannel(3)
    .blur(1)
    .linear(2.2, -200) // steepen + bias so partial edges drop out
    .toColourspace('b-w')
    .toBuffer();
  const rgb = await sharp(png).removeAlpha().toBuffer();
  return sharp(rgb).joinChannel(alpha).png().toBuffer();
}

async function keyOutMagenta(buf: Buffer): Promise<Buffer | null> {
  const img = sharp(buf).ensureAlpha();
  const { width, height } = await img.metadata();
  if (!width || !height) return null;

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 4
  let keyed = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.sqrt((r - CHROMA_KEY.r) ** 2 + (g - CHROMA_KEY.g) ** 2 + (b - CHROMA_KEY.b) ** 2);

    if (dist < 90) {
      // Core magenta → fully transparent (wider core removes more fringe).
      data[i + 3] = 0;
      keyed++;
      continue;
    }
    if (dist < 170) {
      // Edge feather: ramp alpha from 0→full across the transition band.
      const a = Math.round(((dist - 90) / 80) * 255);
      data[i + 3] = Math.min(data[i + 3], a);
    }

    // Magenta DE-SPILL — the purple/pink halo (worst on dark curly hair) is any
    // pixel where GREEN is the minority channel while red & blue are elevated
    // relative to it. The previous version only fired on BRIGHT pixels (r,b>90),
    // so it missed dark hair strands — exactly where the glow showed. Now it
    // fires on ANY magenta-cast pixel, bright or dark, and both lifts green AND
    // pulls red/blue down toward green so the cast is fully neutralised.
    const avgRB = (r + b) / 2;
    const magentaCast = avgRB - g; // how much more red/blue than green
    if (magentaCast > 18) {
      // Neutralise toward grey: green up, red & blue down, proportional to cast.
      const target = Math.round(g + magentaCast * 0.5); // common mid value
      data[i + 1] = Math.min(255, Math.round(g + (target - g) * 0.9)); // lift green
      data[i] = Math.round(r - (r - target) * 0.6); // pull red down
      data[i + 2] = Math.round(b - (b - target) * 0.6); // pull blue down
      // Fringe pixels that are strongly magenta-cast are almost always edge
      // spill, not real detail — fade their alpha a touch to thin the halo.
      if (magentaCast > 60) data[i + 3] = Math.round(data[i + 3] * 0.6);
    }
  }
  // If almost nothing was keyed, the model didn't give us a magenta field —
  // treat as a failed cutout rather than shipping a full rectangle.
  const ratio = keyed / (width * height);
  if (ratio < 0.04) return null;

  // One extra erode step: shrink the alpha mask by ~1px so any last ring of
  // magenta-tinted edge pixels is cut away entirely.
  const out = await sharp(data, { raw: { width, height, channels: ch } }).png().toBuffer();
  const eroded = await erodeAlpha(out);
  return sharp(eroded).trim({ threshold: 1 }).png().toBuffer();
}

/** Greyscale a transparent cutout while preserving its alpha, for the backdrop. */
async function toMono(pngWithAlpha: Buffer): Promise<Buffer> {
  const alpha = await sharp(pngWithAlpha).ensureAlpha().extractChannel(3).toBuffer();
  const grey = await sharp(pngWithAlpha).removeAlpha().greyscale().linear(1.2, -12).toBuffer();
  return sharp(grey).joinChannel(alpha).png().toBuffer();
}

export async function prepareLayers(opts: {
  playerPhoto: Buffer;
  /** Optional SECOND real photo — becomes a real secondary figure. */
  playerPhoto2?: Buffer | null;
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

  // 3) SECONDARY FIGURE.
  //    PREFERRED: a SECOND REAL photo the operator uploaded — cut out the same
  //    way. This is a genuine second pose of the real player (how posters are
  //    really made), never AI-invented, so it is marked distinct and rendered
  //    sharp. FALLBACK (no 2nd photo): reuse the same cutout as a dark
  //    silhouette echo (handled in the renderer); NOT a generated pose.
  let hero = cutAction;
  let heroIsDistinct = false;
  if (opts.playerPhoto2) {
    let src2 = opts.playerPhoto2;
    if (opts.kitPhoto) {
      const swapped2 = await swapKit(src2, opts.kitPhoto, opts.squadNumber ?? null);
      if (swapped2) src2 = swapped2.bytes;
    }
    const raw2 = await cutoutPlayer(src2);
    const cut2 = raw2 ? await keyOutMagenta(raw2.bytes) : null;
    if (cut2) {
      hero = cut2; // a real second pose
      heroIsDistinct = true;
    }
  }

  // 4) Monochrome backdrop from the primary cutout.
  const backdropMono = cutAction ? await toMono(cutAction) : null;

  return { cutAction, hero, backdropMono, heroIsDistinct, usedGemini: Boolean(cutAction) };
}
