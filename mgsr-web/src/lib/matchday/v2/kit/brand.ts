/**
 * BRIT Sport Group brand mark.
 *
 * A small circular BRIT logo is stamped on EVERY generated MATCHDAY image
 * (all styles, old and new), applied once at the very end of renderV2 so no
 * style can forget it. Source: public/brit_circle_black_gold.svg.
 */
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { V2_W, V2_H } from '../render';

let svgCache: Buffer | null = null;

async function logoSvg(): Promise<Buffer> {
  if (!svgCache) svgCache = await fs.readFile(path.join(process.cwd(), 'public', 'brit_circle_black_gold.svg'));
  return svgCache;
}

export type BrandCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center';

export interface BrandOptions {
  corner?: BrandCorner;
  /** Diameter in px (default 86 — small but legible at story size). */
  size?: number;
  /** Distance from the canvas edge in px. */
  margin?: number;
}

/** Render the logo with a hairline ring + soft shadow so it reads on any bg. */
export async function brandMark(size: number): Promise<Buffer> {
  const logo = await sharp(await logoSvg(), { density: 300 }).resize(size, size).png().toBuffer();
  const pad = 10; // room for the shadow
  const box = size + pad * 2;
  const ring = Buffer.from(
    `<svg width="${box}" height="${box}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<radialGradient id="sh" cx="50%" cy="50%" r="50%"><stop offset="78%" stop-color="#000" stop-opacity="0.45"/>` +
      `<stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs>` +
      `<circle cx="${box / 2}" cy="${box / 2}" r="${box / 2}" fill="url(#sh)"/>` +
      `<circle cx="${box / 2}" cy="${box / 2}" r="${size / 2 + 1}" fill="none" stroke="#d8af4e" stroke-width="1.5" opacity="0.85"/></svg>`
  );
  return sharp(ring).composite([{ input: logo, left: pad, top: pad }]).png().toBuffer();
}

/** Composite the BRIT mark onto a finished poster (PNG buffer in, PNG out). */
export async function stampBrand(poster: Buffer, opts: BrandOptions = {}): Promise<Buffer> {
  const size = opts.size ?? 86;
  const margin = opts.margin ?? 44;
  const corner = opts.corner ?? 'bottom-right';
  const mark = await brandMark(size);
  const box = size + 20;
  const left =
    corner === 'bottom-center'
      ? Math.round((V2_W - box) / 2)
      : corner.endsWith('right')
        ? V2_W - box - margin + 10
        : margin - 10;
  const top = corner.startsWith('top') ? margin - 10 : V2_H - box - margin + 10;
  return sharp(poster).composite([{ input: mark, left, top }]).png().toBuffer();
}
