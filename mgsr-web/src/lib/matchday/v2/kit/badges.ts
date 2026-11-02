/**
 * Crest presentation helpers shared by the V3 styles. Crests keep their own
 * artwork; only the frame around them changes per style.
 */
import sharp from 'sharp';
import { crestPng } from '../render';

export interface DiscOptions {
  fill?: string;
  fillOpacity?: number;
  ring?: string;
  ringWidth?: number;
  /** Fraction of the disc the (area-normalised) crest may occupy. */
  inner?: number;
}

/** Crest centred in a solid disc — guarantees legibility on any background. */
export async function discBadge(
  crest: Buffer | null | undefined,
  size: number,
  o: DiscOptions = {}
): Promise<Buffer | null> {
  if (!crest) return null;
  const inner = Math.round(size * (o.inner ?? 0.78));
  const c = await crestPng(crest, inner);
  if (!c) return null;
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${o.fill ?? '#ffffff'}" fill-opacity="${o.fillOpacity ?? 0.96}"/>` +
      (o.ring
        ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2 - (o.ringWidth ?? 4) / 2}" fill="none" stroke="${o.ring}" stroke-width="${o.ringWidth ?? 4}"/>`
        : '') +
      `</svg>`
  );
  return sharp(svg).composite([{ input: c, gravity: 'centre' }]).png().toBuffer();
}

/** Multiply an image's alpha by `a` (0..1) — for watermark-style crests. */
export async function withOpacity(buf: Buffer, a: number): Promise<Buffer> {
  return sharp(buf).ensureAlpha().linear([1, 1, 1, a], [0, 0, 0, 0]).png().toBuffer();
}

/** Crest centred in a rounded square (used by print / ticket styles). */
export async function squareBadge(
  crest: Buffer | null | undefined,
  size: number,
  o: { fill?: string; stroke?: string; strokeWidth?: number; radius?: number } = {}
): Promise<Buffer | null> {
  if (!crest) return null;
  const c = await crestPng(crest, Math.round(size * 0.74));
  if (!c) return null;
  const sw = o.strokeWidth ?? 0;
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${sw / 2}" y="${sw / 2}" width="${size - sw}" height="${size - sw}" rx="${o.radius ?? 0}" fill="${o.fill ?? 'none'}"` +
      (sw ? ` stroke="${o.stroke ?? '#000'}" stroke-width="${sw}"` : '') +
      `/></svg>`
  );
  return sharp(svg).composite([{ input: c, gravity: 'centre' }]).png().toBuffer();
}
