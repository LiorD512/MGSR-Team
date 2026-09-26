/**
 * MATCHDAY compositor (section 8 & hybrid approach).
 *
 * Builds the base 9:16 artwork by layering:
 *   1. AI-generated cinematic background (or a graded real stadium fallback)
 *   2. Real player cutouts (identity preserved — never regenerated)
 * onto a fixed canvas with a bottom legibility gradient.
 *
 * Text and club logos are NOT added here — that is the deterministic overlay
 * step (Phase 4), which composes on top of this base.
 */

import sharp from 'sharp';
import { CANVAS_W, CANVAS_H, placementsFor, type Placement } from './layout';
import type {
  GeneratedImage,
  ImageGenerationProvider,
  MatchdayComposition,
} from './types';
import type { FetchedImage } from './assets';

export interface CompositeInput {
  composition: MatchdayComposition;
  /** AI background bytes; null falls back to graded stadium / solid canvas. */
  background: GeneratedImage | null;
  /** Real stadium (graded and used as base when no AI background). */
  stadium: FetchedImage | null;
  /** Real player cutouts/photos with assigned roles. */
  players: Array<FetchedImage & { role: Placement['role'] }>;
  provider: ImageGenerationProvider;
}

export interface CompositeResult {
  /** Base canvas PNG (no text/logos yet). */
  bytes: Buffer;
  /** True if any player was isolated via the provider cutout. */
  cutoutUsed: boolean;
}

/** Cover-fit any image to the full canvas. */
async function toCanvasBackground(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize(CANVAS_W, CANVAS_H, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();
}

/** Darken + slightly desaturate a stadium so it reads as a cinematic base. */
async function gradeStadium(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize(CANVAS_W, CANVAS_H, { fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.62, saturation: 0.8 })
    .tint({ r: 30, g: 24, b: 16 })
    .png()
    .toBuffer();
}

/** Neutral dark canvas as an absolute last resort. */
async function solidCanvas(): Promise<Buffer> {
  return sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      background: { r: 14, g: 12, b: 12, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

/**
 * A vertical gradient (transparent at top → dark at bottom) so the lower text
 * band stays readable regardless of the artwork behind it.
 */
async function legibilityGradient(): Promise<Buffer> {
  const svg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
        <stop offset="18%" stop-color="#000000" stop-opacity="0.05"/>
        <stop offset="60%" stop-color="#000000" stop-opacity="0.10"/>
        <stop offset="80%" stop-color="#000000" stop-opacity="0.60"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  return Buffer.from(svg);
}

/** Resize a player image to the placement width, keeping aspect. */
async function preparePlayer(
  bytes: Buffer,
  placement: Placement
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const targetW = Math.round(CANVAS_W * placement.widthFrac);
  let pipeline = sharp(bytes).resize({ width: targetW, withoutEnlargement: false });

  if (placement.opacity < 1) {
    // Apply opacity by multiplying the alpha channel.
    pipeline = pipeline.ensureAlpha().composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(placement.opacity * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ]);
  }

  const buffer = await pipeline.png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width ?? targetW, height: meta.height ?? targetW };
}

function topLeftFromCenter(cx: number, cy: number, w: number, h: number): { left: number; top: number } {
  const left = Math.round(CANVAS_W * cx - w / 2);
  const top = Math.round(CANVAS_H * cy - h / 2);
  return { left, top };
}

/**
 * sharp.composite() rejects overlays that extend beyond the base canvas
 * (negative offset or larger than base). This crops the layer to just the
 * region that is actually visible on the canvas and returns a safe offset.
 * Returns null when the layer would be entirely off-canvas.
 */
async function clampToCanvas(
  layer: Buffer,
  left: number,
  top: number
): Promise<{ input: Buffer; left: number; top: number } | null> {
  const meta = await sharp(layer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w === 0 || h === 0) return null;

  // Intersect the layer rectangle with the canvas rectangle.
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(CANVAS_W, left + w);
  const y1 = Math.min(CANVAS_H, top + h);
  const visW = x1 - x0;
  const visH = y1 - y0;
  if (visW <= 0 || visH <= 0) return null; // fully off-canvas

  if (visW === w && visH === h && left >= 0 && top >= 0) {
    return { input: layer, left, top };
  }

  // Extract the visible sub-rectangle from the layer.
  const cropLeft = x0 - left;
  const cropTop = y0 - top;
  const cropped = await sharp(layer)
    .extract({ left: cropLeft, top: cropTop, width: visW, height: visH })
    .png()
    .toBuffer();
  return { input: cropped, left: x0, top: y0 };
}

/** Try to isolate a player onto transparency via the provider; fall back to raw. */
async function cutout(
  provider: ImageGenerationProvider,
  img: FetchedImage
): Promise<{ bytes: Buffer; isolated: boolean }> {
  if (!provider.cutoutPlayer || !provider.isConfigured()) {
    return { bytes: img.bytes, isolated: false };
  }
  try {
    const out = await provider.cutoutPlayer({
      image: { bytes: img.bytes, mimeType: img.mimeType },
      prompt:
        'Cleanly isolate the football player from the background, cutting tightly around hair and body.',
    });
    // Ensure a usable PNG with alpha.
    const png = await sharp(out.bytes).ensureAlpha().png().toBuffer();
    return { bytes: png, isolated: true };
  } catch (err) {
    console.error('[matchday] cutout failed, using original photo:', err);
    return { bytes: img.bytes, isolated: false };
  }
}

export async function composite(input: CompositeInput): Promise<CompositeResult> {
  // ── Base layer ──
  let base: Buffer;
  if (input.background) {
    base = await toCanvasBackground(input.background.bytes);
  } else if (input.stadium) {
    base = await gradeStadium(input.stadium.bytes);
  } else {
    base = await solidCanvas();
  }

  // ── Player layers (back-to-front) ──
  const placements = placementsFor(input.composition.layout).sort((a, b) => a.z - b.z);
  const overlays: sharp.OverlayOptions[] = [];
  let cutoutUsed = false;

  for (const placement of placements) {
    const player = input.players.find((p) => p.role === placement.role);
    if (!player) continue;

    const { bytes: cutBytes, isolated } = await cutout(input.provider, player);
    if (isolated) cutoutUsed = true;

    const prepared = await preparePlayer(cutBytes, placement);
    // Cap dimensions to the canvas so nothing exceeds the base in either axis.
    let finalBuf = prepared.buffer;
    if (prepared.height > CANVAS_H || prepared.width > CANVAS_W) {
      finalBuf = await sharp(prepared.buffer)
        .resize({ width: CANVAS_W, height: CANVAS_H, fit: 'inside' })
        .png()
        .toBuffer();
    }
    const meta = await sharp(finalBuf).metadata();
    const w = meta.width ?? prepared.width;
    const h = meta.height ?? prepared.height;
    const { left, top } = topLeftFromCenter(placement.cx, placement.cy, w, h);
    const safe = await clampToCanvas(finalBuf, left, top);
    if (safe) overlays.push(safe);
  }

  // ── Legibility gradient on top of everything ──
  overlays.push({ input: await legibilityGradient(), left: 0, top: 0 });

  const composed = await sharp(base).composite(overlays).png().toBuffer();
  return { bytes: composed, cutoutUsed };
}
