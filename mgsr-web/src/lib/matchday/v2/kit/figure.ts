/**
 * Figure-fitting helpers: a player cutout must stay inside the region a style
 * reserves for it, whatever shape the photo is (narrow full-body, waist-up
 * portrait, arms-out celebration…).
 */
import sharp from 'sharp';

/**
 * Scale for a cutout so it fits a `maxW` × `targetH` box: height-limited for
 * normal full-body photos (identical to the old behaviour), width-limited for
 * wide / waist-up photos.
 */
export function boxScale(w: number, h: number, targetH: number, maxW?: number): number {
  const byH = targetH / h;
  return maxW ? Math.min(byH, maxW / w) : byH;
}

/**
 * True when the photo was cropped at the bottom (e.g. a waist-up shot): the
 * last rows are one wide, solid band (a cut torso). Feet and a ball on the
 * ground also touch the bottom, but as separate narrow blobs — measured on real
 * cutouts: full-body 0.17–0.22 coverage, waist-up 0.45 — so we require BOTH
 * high coverage and a long continuous run.
 */
export async function isCroppedBottom(buf: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buf).ensureAlpha().extractChannel(3).resize({ width: 120 }).raw().toBuffer({ resolveWithObject: true });
  const rows = Math.max(2, Math.round(info.height * 0.015));
  let opaque = 0;
  let longest = 0;
  for (let y = info.height - rows; y < info.height; y++) {
    let run = 0;
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] > 128) {
        opaque++;
        run++;
        if (run > longest) longest = run;
      } else run = 0;
    }
  }
  return opaque / (rows * info.width) > 0.32 && longest / info.width > 0.3;
}
