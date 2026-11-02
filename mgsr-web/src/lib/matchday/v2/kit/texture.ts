/**
 * Procedural textures for MATCHDAY v3 (server-only, sharp, seeded).
 *
 *   grain()    – true per-pixel film grain (the old "grain" was ~220 dots)
 *   paper()    – warm newsprint base with fibres + edge toning
 *   halftone() – rotated-screen dot halftone of a cutout, silhouette-preserving
 *   stripes()  – diagonal hatch overlay
 */
import sharp from 'sharp';
import { makeRng } from './prng';
import { hexToRgb } from './palette';

const W = 1080;
const H = 1920;

/** Full-canvas film grain as a transparent PNG (screen/overlay it on a scene). */
export async function grain(seed: number, strength = 0.1, width = W, height = H): Promise<Buffer> {
  const rng = makeRng(seed);
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < px.length; i += 4) {
    const v = rng() > 0.5 ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = Math.round(rng() * 255 * strength);
  }
  return sharp(Buffer.from(px.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Warm newsprint paper: base tone, fine speckle, soft fibres, toned edges. */
export async function paper(seed: number, base = '#ece4d1'): Promise<Buffer> {
  const rng = makeRng(seed);
  const { r, g, b } = hexToRgb(base);
  const px = new Uint8ClampedArray(W * H * 3);
  for (let i = 0; i < px.length; i += 3) {
    const n = (rng() - 0.5) * 16;
    px[i] = r + n;
    px[i + 1] = g + n;
    px[i + 2] = b + n * 1.1;
  }
  const fibres: string[] = [];
  for (let k = 0; k < 260; k++) {
    const x = rng() * W;
    const y = rng() * H;
    const len = 12 + rng() * 50;
    const a = rng() * Math.PI;
    fibres.push(
      `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x + Math.cos(a) * len).toFixed(0)}" y2="${(y + Math.sin(a) * len).toFixed(0)}" stroke="#7a6a48" stroke-width="${(0.4 + rng() * 0.7).toFixed(1)}" opacity="${(0.05 + rng() * 0.1).toFixed(2)}"/>`
    );
  }
  const overlay = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<radialGradient id="e" cx="50%" cy="48%" r="72%"><stop offset="60%" stop-color="#5a4524" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="#5a4524" stop-opacity="0.38"/></radialGradient></defs>` +
      `${fibres.join('')}<rect width="${W}" height="${H}" fill="url(#e)"/></svg>`
  );
  return sharp(Buffer.from(px.buffer), { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: overlay }])
    .png()
    .toBuffer();
}

/** Diagonal hatch lines over the full canvas. */
export function stripes(color: string, opacity: number, gap = 14, angleDeg = -35, width = 2): Buffer {
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<pattern id="p" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angleDeg})">` +
      `<line x1="0" y1="0" x2="0" y2="${gap}" stroke="${color}" stroke-width="${width}"/></pattern></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#p)" opacity="${opacity}"/></svg>`
  );
}

export interface HalftoneOptions {
  /** Dot pitch in px. */
  cell?: number;
  /** Screen angle in degrees (45 = classic newsprint). */
  angle?: number;
  /** Ink colour of the dots. */
  ink?: string;
  /** Contrast boost on the tone curve (1 = none). */
  contrast?: number;
  /** Tone lift: <1 brightens mid-tones so dark skin keeps visible dot detail. */
  gamma?: number;
}

/**
 * Dot-screen halftone of a transparent cutout. The silhouette comes from the
 * cutout's own alpha (edges stay crisp), the dot size from its luminance.
 * Faces stay recognisable because the pitch is fine and the tone is the real
 * photograph's — this is a print treatment, never a regeneration.
 */
export async function halftone(cutout: Buffer, opts: HalftoneOptions = {}): Promise<Buffer> {
  const cell = opts.cell ?? 7;
  const theta = ((opts.angle ?? 45) * Math.PI) / 180;
  const contrast = opts.contrast ?? 1.35;
  const gamma = opts.gamma ?? 1;
  const ink = hexToRgb(opts.ink ?? '#16130f');

  const base = sharp(cutout).ensureAlpha();
  const { width, height } = await base.metadata();
  if (!width || !height) return cutout;

  const alpha = await base.clone().extractChannel(3).raw().toBuffer();
  // Tone: flatten on mid-grey so transparent surroundings don't skew edge cells,
  // greyscale, then blur ≈ one cell so sampling a cell centre = cell average.
  const tone = await sharp(cutout)
    .flatten({ background: '#808080' })
    .greyscale()
    // Local contrast (CLAHE): resolves features on dark skin / in shadow, so the
    // face stays recognisable in the dot screen instead of collapsing to black.
    .clahe({ width: 40, height: 40, maxSlope: 6 })
    .blur(Math.max(0.5, cell / 2))
    .raw()
    .toBuffer();

  const out = new Uint8ClampedArray(width * height * 4);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const a = alpha[idx];
      if (a < 8) continue;
      // rotate into screen space
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      const cu = (Math.floor(u / cell) + 0.5) * cell;
      const cv = (Math.floor(v / cell) + 0.5) * cell;
      // centre back to image space for tone sampling
      const sx = Math.min(width - 1, Math.max(0, Math.round(cu * cos - cv * sin)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(cu * sin + cv * cos)));
      let lum = Math.pow(tone[sy * width + sx] / 255, gamma);
      lum = Math.min(1, Math.max(0, (lum - 0.5) * contrast + 0.5));
      const dark = 1 - lum;
      const radius = cell * 0.72 * Math.sqrt(dark);
      const d = Math.hypot(u - cu, v - cv);
      const cov = Math.min(1, Math.max(0, radius - d + 0.6));
      if (cov <= 0) continue;
      const o = idx * 4;
      out[o] = ink.r;
      out[o + 1] = ink.g;
      out[o + 2] = ink.b;
      out[o + 3] = Math.round(cov * a);
    }
  }
  return sharp(Buffer.from(out.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();
}
