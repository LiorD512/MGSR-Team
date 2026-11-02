/**
 * Small composition helpers shared by the V3 style modules: satori positioning
 * shorthands, full-canvas SVG sheets, rotation, masking and frosted glass.
 */
import sharp from 'sharp';
import type { ReactNode } from 'react';
import { V2_W, V2_H, div } from '../render';

export type Sty = Record<string, string | number>;

export const abs = (top: number, left: number, extra: Sty = {}): Sty => ({
  position: 'absolute',
  top: `${Math.round(top)}px`,
  left: `${Math.round(left)}px`,
  ...extra,
});
export const centred = (top: number, extra: Sty = {}): Sty =>
  abs(top, 0, { width: `${V2_W}px`, justifyContent: 'center', ...extra });
/** A fixed-width centred text box whose column starts at `left`. */
export const column = (top: number, left: number, width: number, extra: Sty = {}): Sty =>
  abs(top, left, { width: `${Math.round(width)}px`, justifyContent: 'center', textAlign: 'center', ...extra });
export const root = (children: ReactNode[]): ReactNode =>
  div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, children);

/** Wrap SVG markup in a full-canvas <svg>. */
export function sheet(inner: string, defs = ''): Buffer {
  return Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">${defs ? `<defs>${defs}</defs>` : ''}${inner}</svg>`
  );
}

/** Transparent full canvas. */
export function blankCanvas(): sharp.Sharp {
  return sharp({ create: { width: V2_W, height: V2_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
}

/** Flatten a list of overlays into one full-canvas transparent PNG. */
export async function flatten(overlays: sharp.OverlayOptions[]): Promise<Buffer> {
  return blankCanvas().composite(overlays).png().toBuffer();
}

/**
 * Rotate a full-canvas layer about the canvas centre and crop back to the
 * canvas, so it can be composited at 0,0 like every other layer.
 */
export async function rotateCanvas(layer: Buffer, deg: number): Promise<Buffer> {
  const r = await sharp(layer).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(r).metadata();
  const left = Math.max(0, Math.round(((m.width ?? V2_W) - V2_W) / 2));
  const top = Math.max(0, Math.round(((m.height ?? V2_H) - V2_H) / 2));
  return sharp(r).extract({ left, top, width: V2_W, height: V2_H }).png().toBuffer();
}

/** Keep only the parts of `layer` inside the white areas of `maskSvg`. */
export async function maskWith(layer: Buffer, maskSvg: Buffer): Promise<Buffer> {
  return sharp(layer).ensureAlpha().composite([{ input: maskSvg, blend: 'dest-in' }]).png().toBuffer();
}

/**
 * Frosted glass panel: a real blur of what is underneath (`under` = the full
 * composite so far), brightened, clipped to a rounded rect, with a sheen and a
 * hairline border. Returns a full-canvas layer.
 */
export async function frostedGlass(
  under: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { radius?: number; tint?: string; tintOpacity?: number; border?: string; blur?: number; brightness?: number } = {}
): Promise<Buffer> {
  const r = o.radius ?? 36;
  const crop = await sharp(under)
    .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) })
    .blur(o.blur ?? 26)
    .modulate({ brightness: o.brightness ?? 1.25, saturation: 1.1 })
    .png()
    .toBuffer();
  const W = Math.round(w);
  const H = Math.round(h);
  const overlay = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/><stop offset="60%" stop-color="#ffffff" stop-opacity="0.05"/>` +
      `<stop offset="100%" stop-color="#ffffff" stop-opacity="0.14"/></linearGradient></defs>` +
      `<rect width="${W}" height="${H}" rx="${r}" fill="${o.tint ?? '#ffffff'}" fill-opacity="${o.tintOpacity ?? 0.06}"/>` +
      `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${r}" fill="url(#s)" stroke="${o.border ?? '#ffffff'}" stroke-opacity="0.5" stroke-width="2"/></svg>`
  );
  const mask = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="${r}" fill="#fff"/></svg>`);
  const panel = await sharp(crop).composite([{ input: overlay }, { input: mask, blend: 'dest-in' }]).png().toBuffer();
  return flatten([{ input: panel, left: Math.round(x), top: Math.round(y) }]);
}

/** Soft blurred colour orbs (for gradient-mesh style backgrounds). */
export async function orbs(list: Array<{ x: number; y: number; r: number; color: string; opacity?: number }>, blur = 120): Promise<Buffer> {
  const svg = sheet(list.map((o) => `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="${o.color}" opacity="${o.opacity ?? 0.9}"/>`).join(''));
  return sharp(svg).blur(blur).png().toBuffer();
}

/** Seeded decorative barcode bars as SVG (purely graphic — encodes nothing). */
export function barcodeSvg(rng: () => number, x: number, y: number, w: number, h: number, color: string): string {
  let cx = x;
  const bars: string[] = [];
  while (cx < x + w) {
    const bw = 2 + Math.floor(rng() * 6);
    if (rng() > 0.4) bars.push(`<rect x="${cx}" y="${y}" width="${bw}" height="${h}" fill="${color}"/>`);
    cx += bw + 2 + Math.floor(rng() * 4);
  }
  return bars.join('');
}
