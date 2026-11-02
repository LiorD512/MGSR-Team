/**
 * The SECOND real photo of the player (a genuinely different pose the operator
 * uploaded). Every style composes it in its own way — a duotone ghost behind
 * the type, a halftone print, a taped polaroid, a fanned second card … — so a
 * two-photo poster feels designed rather than "two cutouts side by side".
 *
 * All treatments are colour/tone filters on the operator's real photograph; no
 * pixels are generated, and the alpha (silhouette) is always preserved.
 */
import sharp from 'sharp';
import { type RenderV2Input, bottomFade, onCanvas } from '../render';
import { hexToRgb } from './palette';
import { relightCutout } from './relight';
import { halftone } from './texture';
import { boxScale, isCroppedBottom } from './figure';

export type SecondTreatment =
  | { kind: 'photo'; brightness?: number; saturation?: number }
  | { kind: 'duotone'; dark: string; light: string }
  | { kind: 'relit'; tint: string; amount?: number; brightness?: number }
  | { kind: 'halftone'; ink: string; cell?: number };

export interface SecondOptions {
  /** Target height in px. */
  height: number;
  /** Horizontal centre in px. */
  cx: number;
  top: number;
  flip?: boolean;
  treatment: SecondTreatment;
  /** 0..1 overall opacity. */
  opacity?: number;
  /** Start of the bottom dissolve, in % of the figure height (omit = no fade). */
  fadeStart?: number;
  /** Max width (box fitting): wide / waist-up photos shrink to fit and sit on the box bottom. */
  maxW?: number;
}

/** True when the operator supplied a second photo AND it was cut out successfully. */
export function hasSecond(i: RenderV2Input): boolean {
  return Boolean(i.layers.heroIsDistinct && i.layers.hero);
}

async function duotone(cut: Buffer, dark: string, light: string): Promise<Buffer> {
  const { data, info } = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = hexToRgb(dark);
  const l = hexToRgb(light);
  for (let k = 0; k < data.length; k += 4) {
    const y = (0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) / 255;
    data[k] = d.r + (l.r - d.r) * y;
    data[k + 1] = d.g + (l.g - d.g) * y;
    data[k + 2] = d.b + (l.b - d.b) * y;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** The second cutout, scaled + treated, as a bare (not canvas-sized) PNG. */
export async function secondCutout(i: RenderV2Input, height: number, treatment: SecondTreatment, flip = false, opacity = 1, maxW?: number): Promise<Buffer | null> {
  if (!hasSecond(i)) return null;
  const m0 = await sharp(i.layers.hero!).metadata();
  const h0 = Math.round((m0.height ?? 1) * boxScale(m0.width ?? 1, m0.height ?? 1, height, maxW));
  let img = await sharp(i.layers.hero!).resize({ height: h0 }).png().toBuffer();
  if (flip) img = await sharp(img).flop().png().toBuffer();
  switch (treatment.kind) {
    case 'photo':
      img = await sharp(img).modulate({ brightness: treatment.brightness ?? 1, saturation: treatment.saturation ?? 1 }).png().toBuffer();
      break;
    case 'duotone':
      img = await duotone(img, treatment.dark, treatment.light);
      break;
    case 'relit':
      img = await relightCutout(img, { tint: treatment.tint, amount: treatment.amount ?? 0.5, wrap: 0.6 });
      if (treatment.brightness !== undefined) img = await sharp(img).modulate({ brightness: treatment.brightness }).png().toBuffer();
      break;
    case 'halftone':
      img = await halftone(img, { cell: treatment.cell ?? 6, ink: treatment.ink, contrast: 1.2, gamma: 0.6 });
      break;
  }
  if (opacity < 1) img = await sharp(img).ensureAlpha().linear([1, 1, 1, opacity], [0, 0, 0, 0]).png().toBuffer();
  return img;
}

/** The second cutout placed on a full transparent canvas (null when there is no second photo). */
export async function secondSheet(i: RenderV2Input, o: SecondOptions): Promise<Buffer | null> {
  let img = await secondCutout(i, o.height, o.treatment, o.flip, o.opacity ?? 1, o.maxW);
  if (!img) return null;
  let fadeStart = o.fadeStart;
  const cropped = Boolean(o.maxW) && (await isCroppedBottom(img));
  if (cropped) fadeStart = Math.min(fadeStart ?? 100, 62);
  if (fadeStart !== undefined) img = await bottomFade(img, fadeStart);
  const m = await sharp(img).metadata();
  const w = m.width ?? 1;
  const h = m.height ?? 1;
  // full-body: feet stay on the box bottom · waist-up: head at the box top
  return onCanvas(img, w, h, Math.round(o.cx - w / 2), Math.round(cropped ? o.top : o.top + (o.height - h)));
}
