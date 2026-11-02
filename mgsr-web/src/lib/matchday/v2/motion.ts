/**
 * MATCHDAY motion PROTOTYPE (server-only, sharp — no ffmpeg needed).
 *
 * Turns a finished 1080×1920 poster into a short seamless-loop animated WebP:
 *   • a slow cinematic push-in that eases out and back (frame 0 == last frame)
 *   • a soft diagonal light sweep passing over the poster
 *
 * It animates the FINISHED image, so the face is exactly the face on the poster
 * (nothing is regenerated). True layer parallax / particles need the separate
 * layers and a video encoder (ffmpeg worker) — see docs/MATCHDAY_V3_PLAN.md.
 */
import sharp from 'sharp';

export interface MotionOptions {
  /** Output width in px (height keeps 9:16). Default 540 — a few MB, WhatsApp-friendly. */
  width?: number;
  frames?: number;
  /** Per-frame delay in ms. Default 70 (36 frames → 2.5 s loop). */
  delayMs?: number;
  /** Peak zoom, e.g. 0.06 = 6 %. */
  zoom?: number;
}

export async function animatePoster(poster: Buffer, opts: MotionOptions = {}): Promise<{ bytes: Buffer; frames: number; width: number; height: number }> {
  const width = opts.width ?? 540;
  const height = Math.round((width * 16) / 9);
  const frames = opts.frames ?? 36;
  const delay = opts.delayMs ?? 70;
  const zoom = opts.zoom ?? 0.06;

  // Source a bit larger than the frame so every crop is sharp.
  const maxScale = 1 + zoom;
  const srcW = Math.ceil(width * maxScale);
  const srcH = Math.ceil(height * maxScale);
  // Slight blur before encoding: the poster's film grain is incompressible and
  // would multiply the file size across frames (heavier file, visible shimmer).
  const src = await sharp(poster).removeAlpha().resize(srcW, srcH, { fit: 'cover' }).blur(0.7).raw().toBuffer();

  const frameBufs: Buffer[] = [];
  for (let k = 0; k < frames; k++) {
    const t = k / frames;
    const ease = (1 - Math.cos(2 * Math.PI * t)) / 2; // 0 → 1 → 0, seamless loop
    const z = 1 + zoom * ease;
    const cw = Math.round(srcW / (maxScale / z));
    const ch = Math.round(srcH / (maxScale / z));
    const left = Math.floor((srcW - cw) / 2);
    const top = Math.floor((srcH - ch) / 2);

    // light sweep: travels across during the middle 60 % of the loop
    const p = (t - 0.18) / 0.6;
    let img = sharp(src, { raw: { width: srcW, height: srcH, channels: 3 } })
      .extract({ left, top, width: cw, height: ch })
      .resize(width, height, { kernel: 'lanczos3' });
    if (p > 0 && p < 1) {
      const x = -width * 0.5 + p * width * 2.0;
      const band = Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs>` +
          `<linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
          `<stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
          `<polygon points="${x},0 ${x + width * 0.38},0 ${x + width * 0.38 - height * 0.22},${height} ${x - height * 0.22},${height}" fill="url(#b)"/></svg>`
      );
      img = img.composite([{ input: band, blend: 'screen' }]);
    }
    frameBufs.push(await img.removeAlpha().raw().toBuffer());
  }

  // Animated WebP from a tall raw strip (pageHeight = one frame).
  const strip = Buffer.concat(frameBufs);
  const bytes = await sharp(strip, { raw: { width, height: height * frames, channels: 3, pageHeight: height } })
    .webp({ quality: 82, effort: 4, loop: 0, delay: new Array(frames).fill(delay) })
    .toBuffer();
  return { bytes, frames, width, height };
}
