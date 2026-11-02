/**
 * Relighting / colour-matching of the real player cutout to its scene.
 *
 * A pasted cutout keeps the colour temperature of the photo it came from, which
 * is what makes it look "stuck on". These helpers grade the cutout toward the
 * scene's key colour (soft-light, so skin tones keep their own colour and
 * detail) and add a light-wrap: scene colour bleeding over the silhouette
 * edge, the way real backlight wraps around a subject.
 *
 * This is a colour grade of the original pixels — the face is never redrawn.
 */
import sharp from 'sharp';

/** Solid colour in the exact silhouette of `cutout`. */
async function silhouetteFill(cutout: Buffer, color: string): Promise<Buffer> {
  const m = await sharp(cutout).metadata();
  const alpha = await sharp(cutout).ensureAlpha().extractChannel(3).toBuffer();
  const rgb = await sharp({ create: { width: m.width ?? 1, height: m.height ?? 1, channels: 3, background: color } }).png().toBuffer();
  return sharp(rgb).joinChannel(alpha).png().toBuffer();
}

export interface RelightOptions {
  /** Key colour of the scene (rim / spotlight colour). */
  tint: string;
  /** 0..1 strength of the soft-light grade. ~0.35 is subtle, 0.6 strong. */
  amount?: number;
  /** 0..1 strength of the edge light-wrap. */
  wrap?: number;
  /** Light-wrap width in px (blur radius). */
  wrapWidth?: number;
}

/**
 * Grade + light-wrap a transparent cutout. Returns a cutout of the SAME size
 * and alpha, so it drops into any existing placement code.
 */
export async function relightCutout(cutout: Buffer, o: RelightOptions): Promise<Buffer> {
  const amount = Math.max(0, Math.min(1, o.amount ?? 0.35));
  const wrap = Math.max(0, Math.min(1, o.wrap ?? 0.5));
  const meta = await sharp(cutout).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const alpha = await sharp(cutout).ensureAlpha().extractChannel(3).toBuffer();

  // 1) soft-light grade toward the scene colour.
  const tintLayer = await sharp(await silhouetteFill(cutout, o.tint))
    .ensureAlpha()
    .linear([1, 1, 1, amount], [0, 0, 0, 0])
    .png()
    .toBuffer();
  let graded = await sharp(cutout).ensureAlpha().composite([{ input: tintLayer, blend: 'soft-light' }]).png().toBuffer();

  // 2) light-wrap: an INNER edge glow = silhouette minus its eroded core.
  if (wrap > 0) {
    const r = Math.max(2, o.wrapWidth ?? Math.round(Math.max(w, h) * 0.012));
    const core = await sharp(alpha).blur(r).linear(3, -255 * 1.6).toColourspace('b-w').toBuffer();
    // edge = alpha AND NOT core
    const edge = await sharp(alpha)
      .composite([{ input: await sharp(core).negate().toBuffer(), blend: 'multiply' }])
      .blur(Math.max(1, r / 2))
      .linear(wrap, 0)
      .toColourspace('b-w')
      .toBuffer();
    const glowRgb = await sharp({ create: { width: w, height: h, channels: 3, background: o.tint } }).png().toBuffer();
    const glow = await sharp(glowRgb).joinChannel(edge).png().toBuffer();
    graded = await sharp(graded).composite([{ input: glow, blend: 'screen' }]).png().toBuffer();
  }

  // Restore the exact original alpha (blends must not grow the silhouette).
  const rgb = await sharp(graded).removeAlpha().toBuffer();
  return sharp(rgb).joinChannel(alpha).png().toBuffer();
}
