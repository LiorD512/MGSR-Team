/**
 * MATCHDAY motion — runs entirely in the BROWSER on a <canvas>.
 *
 * Why client-side: the first prototype posted the finished 1080×1920 PNG back
 * to the server (≈3.4–4.7 MB of base64). That is at/over Vercel's 4.5 MB
 * request-body limit, so on deploys the button silently failed. Animating
 * locally needs no upload, previews instantly, and MediaRecorder can export a
 * real video (MP4 where the browser supports it — Chrome 126+/Safari — else
 * WebM) that WhatsApp / Instagram stories accept.
 *
 * The motion animates the FINISHED poster (nothing is regenerated, so the face
 * is exactly the poster's). The poster never scales ABOVE 100 %, so nothing on
 * it — text, crests, the BRIT mark — is ever cropped: it "breathes" between
 * ~93 % and 100 % over a blurred, dimmed copy of itself, with a slow drift, a
 * diagonal light sweep, drifting light dust and, for the exported video, a
 * short scale-up intro from black.
 */

export interface MotionOptions {
  /** Seconds per cycle. */
  duration?: number;
  /** Seeded so the dust layout is stable for a given poster. */
  seed?: number;
  /** How far the poster shrinks at the breath's low point (0.07 = 93 %). Never zooms above 100 %. */
  zoom?: number;
  /** Include the intro (fade from black + punch-in) — used for video export. */
  intro?: boolean;
}

interface Dust {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDust(seed: number, n = 46): Dust[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    x: r(),
    y: r(),
    r: 0.6 + r() * 2.4,
    speed: 0.02 + r() * 0.05,
    phase: r() * Math.PI * 2,
  }));
}

const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/**
 * Draw one frame of the motion at time `t` (seconds) onto `ctx`, whose canvas
 * defines the output size. Pure function of (image, t, options) — the preview
 * loop and the video recorder share it, so what you see is what you export.
 */
export function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  t: number,
  o: MotionOptions & { dust: Dust[] }
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const D = o.duration ?? 6;
  const depth = o.zoom ?? 0.07;
  const p = (t % D) / D;

  // ── camera: loop-safe breath (100 % → 93 % → 100 %) + gentle drift ──
  let z = 1 - depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * p));
  let alpha = 1;
  if (o.intro && t < 0.9) {
    // scale up from 82 % and fade up from black during the first 0.9 s
    const k = easeInOut(t / 0.9);
    z = 0.82 + (z - 0.82) * k;
    alpha = k;
  }
  const dx = Math.sin(2 * Math.PI * p) * W * (1 - z) * 0.35;
  const dw = W * z;
  const dh = H * z;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingQuality = 'high';
  // backdrop: the same poster, enlarged, blurred and dimmed (fills the margins)
  const bz = 1.12;
  const canFilter = typeof (ctx as { filter?: unknown }).filter === 'string';
  if (canFilter) ctx.filter = 'blur(22px) brightness(0.45) saturate(1.2)';
  ctx.drawImage(img, (W - W * bz) / 2, (H - H * bz) / 2, W * bz, H * bz);
  if (canFilter) {
    ctx.filter = 'none';
  } else {
    // older Safari: no canvas filters — just dim the enlarged copy
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
  }
  // soft shadow under the poster card
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40 * (W / 1080);
  ctx.drawImage(img, (W - dw) / 2 + dx, (H - dh) / 2, dw, dh);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // ── light sweep: a soft diagonal band crossing once per cycle ──
  const sp = (p - 0.18) / 0.5;
  if (sp > 0 && sp < 1) {
    const x = -W * 0.6 + sp * W * 2.2;
    const g = ctx.createLinearGradient(x, 0, x + W * 0.45, H * 0.25);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ── drifting light dust (rises slowly, twinkles) ──
  ctx.globalCompositeOperation = 'screen';
  const s = W / 1080;
  for (const d of o.dust) {
    const y = ((d.y - (t * d.speed) % 1) + 1) % 1;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + d.phase));
    ctx.globalAlpha = alpha * 0.55 * tw;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(d.x * W, y * H, d.r * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── subtle vignette breathing so the edges stay cinematic ──
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H * 0.46, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${(0.28 + 0.08 * Math.sin(2 * Math.PI * p)).toFixed(3)})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Decode a data URL / URL into an ImageBitmap-like source. */
export async function loadPosterImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

/** Start a looping preview on `canvas`. Returns a stop() function. */
export function playMotion(canvas: HTMLCanvasElement, img: HTMLImageElement, o: MotionOptions = {}): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const dust = makeDust(o.seed ?? 7);
  let raf = 0;
  const t0 = performance.now();
  const tick = (now: number) => {
    drawMotionFrame(ctx, img, (now - t0) / 1000, { ...o, dust });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Best container the browser can record: MP4 (H.264) first, then WebM. */
export function pickVideoMime(): { mimeType: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates: Array<[string, 'mp4' | 'webm']> = [
    ['video/mp4;codecs=avc1.42E01E', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [m, ext] of candidates) if (MediaRecorder.isTypeSupported(m)) return { mimeType: m, ext };
  return null;
}

export interface RecordResult {
  blob: Blob;
  mimeType: string;
  ext: 'mp4' | 'webm';
}

/**
 * Record a `seconds`-long video of the motion (with intro) in real time on an
 * offscreen canvas. 720×1280 keeps encoding smooth on laptops and phones while
 * staying sharp on a phone screen.
 */
export async function recordMotionVideo(
  img: HTMLImageElement,
  o: MotionOptions & { seconds?: number; width?: number; fps?: number; onProgress?: (p: number) => void } = {}
): Promise<RecordResult> {
  const picked = pickVideoMime();
  if (!picked) throw new Error('This browser cannot record video (MediaRecorder unavailable).');
  const width = o.width ?? 720;
  const height = Math.round((width * 16) / 9);
  const fps = o.fps ?? 30;
  const seconds = o.seconds ?? 6;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const dust = makeDust(o.seed ?? 7);
  drawMotionFrame(ctx, img, 0, { ...o, intro: true, dust });

  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: picked.mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const done = new Promise<void>((resolve, reject) => {
    rec.onstop = () => resolve();
    rec.onerror = (e) => reject((e as unknown as { error?: Error }).error ?? new Error('Recording failed'));
  });

  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      drawMotionFrame(ctx, img, t, { ...o, intro: true, dust, duration: o.duration ?? seconds });
      o.onProgress?.(Math.min(1, t / seconds));
      if (t >= seconds) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await done;
  return { blob: new Blob(chunks, { type: picked.mimeType.split(';')[0] }), mimeType: picked.mimeType, ext: picked.ext };
}
