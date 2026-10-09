/**
 * MATCHDAY v2 renderer — the four designed templates, at true 9:16 (1080×1920).
 *
 * Photographic layers (backdrop portrait, action cutout) are composited with
 * sharp. Text layers (gold Cinzel title, info block, fixture) are rendered with
 * satori so fonts are embedded and layout is deterministic — then composited on
 * top. Backgrounds are procedural (marble) or a supplied/AI sky.
 */

import sharp from 'sharp';
import satori from 'satori';
import type { ReactNode } from 'react';
import { loadV2Fonts } from './fonts';
import type { MatchdayDesignId } from './types';
import type { MatchdayMatchFacts } from '../types';

export const V2_W = 1080;
export const V2_H = 1920;

const GOLD = '#d8af4e';
const GOLD_DEEP = '#a9772a';

export interface RenderV2Input {
  design: MatchdayDesignId;
  facts: MatchdayMatchFacts;
  playerName: string;
  squadNumber?: string | null;
  layers: { cutAction: Buffer | null; hero: Buffer | null; backdropMono: Buffer | null; heroIsDistinct?: boolean };
  homeCrest?: Buffer | null;
  awayCrest?: Buffer | null;
  stadium?: Buffer | null;
  sky?: Buffer | null;
}

// ── small helpers ─────────────────────────────────────────────────────────

async function sizeOf(buf: Buffer) {
  const m = await sharp(buf).metadata();
  return { w: m.width ?? 1, h: m.height ?? 1 };
}

/** Scale a layer to a target height, return buffer + dims. */
async function scaleH(buf: Buffer, targetH: number, mod?: { brightness?: number; saturation?: number; hue?: number }) {
  const { w, h } = await sizeOf(buf);
  const nh = Math.round(targetH);
  const nw = Math.round((w / h) * nh);
  let p = sharp(buf).resize(nw, nh);
  if (mod) p = p.modulate(mod);
  return { buf: await p.png().toBuffer(), w: nw, h: nh };
}

/** An empty full-canvas transparent sheet (used when a layer is missing). */
async function emptySheet(): Promise<Buffer> {
  return sharp({ create: { width: V2_W, height: V2_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
}

/** Place a layer onto a full-canvas transparent sheet, clipping overflow. */
async function onCanvas(buf: Buffer, w: number, h: number, left: number, top: number): Promise<Buffer> {
  const sheet = sharp({ create: { width: V2_W, height: V2_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const sx = left < 0 ? -left : 0;
  const sy = top < 0 ? -top : 0;
  const dx = Math.max(left, 0);
  const dy = Math.max(top, 0);
  const cw = Math.min(w - sx, V2_W - dx);
  const ch = Math.min(h - sy, V2_H - dy);
  if (cw <= 0 || ch <= 0) return sheet.png().toBuffer();
  const piece = await sharp(buf).extract({ left: sx, top: sy, width: cw, height: ch }).toBuffer();
  return sheet.composite([{ input: piece, left: dx, top: dy }]).png().toBuffer();
}

/**
 * Scale a (possibly null) layer to a target height and place it on the canvas
 * via a positioner. Returns a transparent sheet when the layer is missing, so
 * a failed cutout contributes nothing rather than a raw rectangle.
 */
async function placeLayer(
  buf: Buffer | null,
  targetH: number,
  position: (w: number, h: number) => { left: number; top: number },
  opts?: { mod?: { brightness?: number; saturation?: number }; fade?: boolean; fadeStart?: number; flip?: boolean }
): Promise<Buffer> {
  if (!buf) return emptySheet();
  let src = buf;
  if (opts?.flip) src = await sharp(buf).flop().png().toBuffer(); // mirror horizontally
  const s = await scaleH(src, targetH, opts?.mod);
  const body = opts?.fade ? await bottomFade(s.buf, opts.fadeStart ?? 60) : s.buf;
  const { left, top } = position(s.w, s.h);
  return onCanvas(body, s.w, s.h, left, top);
}

/**
 * Fade the bottom of a layer to transparent so it dissolves into the scene
 * instead of ending in a hard cut line. `startPct` is where the fade begins
 * (0..100) — a high value (e.g. 82) gives a gentle, natural leg/feet blend; a
 * low value (60) gives the stronger backdrop dissolve.
 */
async function bottomFade(buf: Buffer, startPct = 60): Promise<Buffer> {
  const { w, h } = await sizeOf(buf);
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="m" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#fff" stop-opacity="1"/>` +
      `<stop offset="${startPct}%" stop-color="#fff" stop-opacity="1"/>` +
      `<stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#m)"/></svg>`
  );
  return sharp(buf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/**
 * Normalise crests so two differently-shaped badges READ as the same size.
 *
 * Different crests have different aspect ratios (a round badge vs a tall
 * shield). A plain `fit:contain` into a square box makes them look unequal.
 * Instead we: trim each crest to its real content, scale it so its LONGEST side
 * is a fixed fraction (~86%) of the slot — i.e. equal bounding size — then
 * centre it on a uniform transparent square. Result: visually consistent crests
 * regardless of shape.
 */
async function crestPng(buf: Buffer | null | undefined, size: number): Promise<Buffer | null> {
  if (!buf) return null;
  // Trim transparent/flat borders so built-in padding doesn't skew the size.
  let trimmed: Buffer;
  try {
    trimmed = await sharp(buf).ensureAlpha().trim({ threshold: 8 }).png().toBuffer();
  } catch {
    trimmed = await sharp(buf).ensureAlpha().png().toBuffer();
  }

  // Perceptual equality is about VISUAL AREA, not bounding box: a shield fills
  // its box densely while a round badge leaves corners empty, so matching the
  // longest side made the shield look ~36% bigger. Instead we scale each crest
  // so its OPAQUE PIXEL AREA matches a common target, then centre it.
  const TARGET_AREA = (size * 0.74) ** 2; // reference filled-area for the slot
  const fit = Math.round(size * 0.92);
  let working = await sharp(trimmed)
    .resize(fit, fit, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Measure current opaque area, then rescale by sqrt(target/actual).
  const { data, info } = await sharp(working).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let k = 3; k < data.length; k += info.channels) if (data[k] > 30) opaque++;
  if (opaque > 0) {
    const factor = Math.min(1.6, Math.max(0.5, Math.sqrt(TARGET_AREA / opaque)));
    const nw = Math.max(1, Math.min(size, Math.round(info.width * factor)));
    const nh = Math.max(1, Math.min(size, Math.round(info.height * factor)));
    working = await sharp(working).resize(nw, nh, { fit: 'inside' }).png().toBuffer();
  }

  // Centre on a fixed square canvas so every crest occupies the same slot.
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: working, gravity: 'centre' }])
    .png()
    .toBuffer();
}

// ── text layers via satori ──────────────────────────────────────────────────

async function textLayer(node: ReactNode): Promise<Buffer> {
  const fonts = await loadV2Fonts();
  const svg = await satori(node as never, { width: V2_W, height: V2_H, fonts: fonts as never });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function compLine(facts: MatchdayMatchFacts): string {
  // The competition string often already carries the country (e.g.
  // "Lithuania: I Lyga"), so only prepend country when it isn't already there —
  // otherwise we get "LITHUANIA • LITHUANIA: I LYGA".
  const comp = (facts.competition ?? '').trim();
  const country = (facts.country ?? '').trim();
  const compHasCountry = country && comp.toLowerCase().includes(country.toLowerCase());
  const parts = compHasCountry ? [comp, facts.round] : [country, comp, facts.round];
  return parts.filter(Boolean).join('  •  ') || 'MATCHDAY';
}
function dateLine(facts: MatchdayMatchFacts): string {
  return facts.time ? `${facts.date} at ${facts.time}` : facts.date;
}

// Base div helper (satori needs explicit display:flex on multi-child nodes)
type Style = Record<string, string | number>;
function div(style: Style, children?: ReactNode): ReactNode {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } } as unknown as ReactNode;
}
function text(style: Style, value: string): ReactNode {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: value } } as unknown as ReactNode;
}

// ── procedural marble backgrounds ────────────────────────────────────────────

function marbleSvg(dark: boolean): Buffer {
  const veins = Array.from({ length: dark ? 16 : 13 })
    .map(() => {
      let x = (Math.random() * V2_W) | 0;
      let y = (Math.random() * V2_H) | 0;
      let d = `M ${x} ${y}`;
      const steps = 6 + ((Math.random() * 6) | 0);
      for (let s = 0; s < steps; s++) {
        x += Math.random() * 240 - 120;
        y += Math.random() * 260 - 50;
        d += ` Q ${(x - 50) | 0} ${(y - 30) | 0} ${x | 0} ${y | 0}`;
      }
      const w = (Math.random() * 2 + 0.4).toFixed(1);
      const o = (Math.random() * (dark ? 0.3 : 0.14) + (dark ? 0.06 : 0.03)).toFixed(2);
      const col = dark ? (Math.random() > 0.5 ? '#c9972f' : '#8f6f28') : Math.random() > 0.6 ? '#c97b3a' : '#9aa0a6';
      return `<path d="${d}" stroke="${col}" stroke-width="${w}" fill="none" opacity="${o}"/>`;
    })
    .join('');
  const bg = dark
    ? `<radialGradient id="bg" cx="50%" cy="34%" r="80%"><stop offset="0%" stop-color="#1c1a16"/><stop offset="45%" stop-color="#0e0d0b"/><stop offset="100%" stop-color="#050504"/></radialGradient>`
    : `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f4f2ee"/><stop offset="50%" stop-color="#eceae5"/><stop offset="100%" stop-color="#e2ded7"/></linearGradient>`;
  const glow = dark
    ? `<radialGradient id="gl" cx="50%" cy="30%" r="42%"><stop offset="0%" stop-color="#caa23f" stop-opacity="0.16"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>`
    : '';
  return Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>${bg}${glow}</defs>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#bg)"/>${veins}` +
      (dark ? `<rect width="${V2_W}" height="${V2_H}" fill="url(#gl)"/>` : '') +
      `</svg>`
  );
}

// ── designs ───────────────────────────────────────────────────────────────

async function renderMidnight(i: RenderV2Input): Promise<Buffer> {
  const bg = await sharp(marbleSvg(true)).png().toBuffer();

  const backSheet = await placeLayer(
    i.layers.backdropMono,
    Math.round(V2_H * 0.64),
    (w) => ({ left: Math.round(V2_W * 0.47 - w / 2), top: Math.round(V2_H * 0.1) }),
    { fade: true }
  );
  const actSheet = await placeLayer(
    i.layers.cutAction,
    Math.round(V2_H * 0.56),
    (w, h) => ({ left: Math.round(V2_W * 0.72 - w / 2), top: V2_H - h - 20 }),
    { mod: { brightness: 1.04, saturation: 1.08 }, fade: true, fadeStart: 84 }
  );

  const margin = 60;
  const txt = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, flexDirection: 'column', position: 'relative', padding: `${margin}px` }, [
      text({ fontFamily: 'Cinzel', fontWeight: 700, fontSize: '118px', color: GOLD, letterSpacing: '2px', lineHeight: 1 }, 'MATCHDAY'),
      text({ fontFamily: 'Montserrat', fontWeight: 300, fontSize: '48px', color: '#fff', marginTop: '8px' }, i.playerName),
      div({ position: 'absolute', left: `${margin}px`, bottom: '300px', width: `${V2_W - margin * 2}px`, flexDirection: 'column' }, [
        text({ fontFamily: 'Montserrat', fontWeight: 600, fontSize: '28px', color: GOLD, width: `${V2_W - margin * 2}px` }, compLine(i.facts).toUpperCase()),
        text({ fontFamily: 'Montserrat', fontWeight: 400, fontSize: '40px', color: '#fff', marginTop: '14px' }, dateLine(i.facts)),
        text({ fontFamily: 'Montserrat', fontWeight: 300, fontSize: '30px', color: '#c9c9c9', marginTop: '10px', width: `${V2_W - margin * 2}px` }, i.facts.venue ?? ''),
      ]),
    ])
  );

  const bs = 150;
  const [cH, cA] = await Promise.all([crestPng(i.homeCrest, bs), crestPng(i.awayCrest, bs)]);
  const crestY = V2_H - 250;
  const crestTxt = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      text({ position: 'absolute', left: `${margin + bs + 30}px`, top: `${crestY + bs / 2 - 32}px`, fontFamily: 'Cinzel', fontWeight: 700, fontSize: '58px', color: GOLD }, 'VS'),
      text({ position: 'absolute', left: `${margin}px`, top: `${crestY + bs + 10}px`, width: `${bs}px`, justifyContent: 'center', textAlign: 'center', fontFamily: 'Montserrat', fontWeight: 600, fontSize: '20px', lineHeight: 1.15, color: '#fff' }, i.facts.homeTeam),
      text({ position: 'absolute', left: `${margin + bs + 120}px`, top: `${crestY + bs + 10}px`, width: `${bs}px`, justifyContent: 'center', textAlign: 'center', fontFamily: 'Montserrat', fontWeight: 600, fontSize: '20px', lineHeight: 1.15, color: '#fff' }, i.facts.awayTeam),
    ])
  );

  const comp: sharp.OverlayOptions[] = [
    { input: backSheet, left: 0, top: 0 },
    { input: actSheet, left: 0, top: 0 },
    { input: txt, left: 0, top: 0 },
  ];
  if (cH) comp.push({ input: cH, left: margin, top: crestY });
  if (cA) comp.push({ input: cA, left: margin + bs + 120, top: crestY });
  comp.push({ input: crestTxt, left: 0, top: 0 });
  return sharp(bg).composite(comp).png().toBuffer();
}

async function renderMarble(i: RenderV2Input): Promise<Buffer> {
  const bg = await sharp(marbleSvg(false)).png().toBuffer();

  const backSheet = await placeLayer(
    i.layers.backdropMono,
    Math.round(V2_H * 0.52),
    (w) => ({ left: Math.round(V2_W * 0.5 - w / 2), top: Math.round(V2_H * 0.03) }),
    { fade: true }
  );
  const actSheet = await placeLayer(
    i.layers.cutAction,
    Math.round(V2_H * 0.56),
    (w, h) => ({ left: Math.round(V2_W * 0.74 - w / 2), top: V2_H - h - 30 }),
    { mod: { brightness: 1.03, saturation: 1.06 }, fade: true, fadeStart: 84 }
  );

  const margin = 56;
  const txt = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      text({ position: 'absolute', left: `${margin}px`, top: `${V2_H - 690}px`, fontFamily: 'Cinzel', fontWeight: 700, fontSize: '40px', color: GOLD_DEEP, letterSpacing: '2px' }, i.playerName),
      text({ position: 'absolute', left: `${margin}px`, top: `${V2_H - 620}px`, fontFamily: 'Cinzel', fontWeight: 700, fontSize: '104px', color: '#1a1a1a', letterSpacing: '1px' }, 'MATCHDAY'),
      text({ position: 'absolute', left: `${margin}px`, top: `${V2_H - 486}px`, fontFamily: 'Montserrat', fontWeight: 600, fontSize: '40px', color: '#333' }, dateLine(i.facts)),
    ])
  );

  const fsz = 170;
  async function frame(crest: Buffer | null | undefined): Promise<Buffer | null> {
    if (!crest) return null;
    const frameSvg = Buffer.from(
      `<svg width="${fsz}" height="${fsz}" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="${fsz - 4}" height="${fsz - 4}" rx="26" ry="26" fill="#ffffff" stroke="${GOLD}" stroke-width="3"/></svg>`
    );
    // Normalise the crest (trim + equal bounding box) so round and shield crests
    // read as the same size inside the frame.
    const c = await crestPng(crest, fsz - 44);
    return sharp(frameSvg).composite([{ input: c!, gravity: 'centre' }]).png().toBuffer();
  }
  const [fH, fA] = await Promise.all([frame(i.homeCrest), frame(i.awayCrest)]);
  const crestY = V2_H - 300;
  const crestTxt = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      text({ position: 'absolute', left: `${margin}px`, top: `${crestY + fsz + 14}px`, width: `${fsz}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 600, fontSize: '26px', color: '#1a1a1a' }, i.facts.homeTeam),
      text({ position: 'absolute', left: `${margin + fsz + 120}px`, top: `${crestY + fsz + 14}px`, width: `${fsz}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 600, fontSize: '26px', color: '#1a1a1a' }, i.facts.awayTeam),
    ])
  );

  const comp: sharp.OverlayOptions[] = [
    { input: backSheet, left: 0, top: 0 },
    { input: actSheet, left: 0, top: 0 },
    { input: txt, left: 0, top: 0 },
  ];
  if (fH) comp.push({ input: fH, left: margin, top: crestY });
  if (fA) comp.push({ input: fA, left: margin + fsz + 120, top: crestY });
  comp.push({ input: crestTxt, left: 0, top: 0 });
  return sharp(bg).composite(comp).png().toBuffer();
}

async function skyBackground(i: RenderV2Input, fallbackTint: { r: number; g: number; b: number }): Promise<Buffer> {
  let base: Buffer;
  if (i.sky) {
    base = await sharp(i.sky).resize(V2_W, V2_H, { fit: 'cover', position: 'centre' }).toBuffer();
  } else {
    // Fallback gradient sky when no AI sky is available.
    const g = Buffer.from(
      `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
        `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="rgb(${fallbackTint.r - 10},${fallbackTint.g - 10},${fallbackTint.b})"/>` +
        `<stop offset="55%" stop-color="rgb(${fallbackTint.r},${fallbackTint.g},${fallbackTint.b})"/>` +
        `<stop offset="100%" stop-color="#0a0603"/></linearGradient></defs>` +
        `<rect width="${V2_W}" height="${V2_H}" fill="url(#s)"/></svg>`
    );
    base = await sharp(g).png().toBuffer();
  }
  const ov = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="v" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#160d05" stop-opacity="0.78"/>` +
      `<stop offset="22%" stop-color="#160d05" stop-opacity="0.22"/>` +
      `<stop offset="70%" stop-color="#120a04" stop-opacity="0.1"/>` +
      `<stop offset="100%" stop-color="#0a0603" stop-opacity="0.82"/></linearGradient></defs>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#v)"/></svg>`
  );
  return sharp(base).composite([{ input: ov, blend: 'over' }]).png().toBuffer();
}

function centredBottomText(i: RenderV2Input): Promise<Buffer> {
  const baseY = V2_H - 300;
  return textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative', flexDirection: 'column' }, [
      text({ position: 'absolute', top: '70px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 600, fontSize: '30px', color: '#fff', letterSpacing: '6px' }, compLine(i.facts).toUpperCase()),
      text({ position: 'absolute', top: '150px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Cinzel', fontWeight: 700, fontSize: '120px', color: GOLD, letterSpacing: '2px' }, 'MATCHDAY'),
      text({ position: 'absolute', top: '300px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 400, fontSize: '44px', color: '#fff', letterSpacing: '4px' }, i.playerName),
      text({ position: 'absolute', top: `${baseY}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 600, fontSize: '40px', color: '#fff' }, `${i.facts.homeTeam}   vs   ${i.facts.awayTeam}`),
      text({ position: 'absolute', top: `${baseY + 60}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 400, fontSize: '32px', color: '#d9c08a', letterSpacing: '4px' }, dateLine(i.facts)),
    ])
  );
}

async function renderGolden(i: RenderV2Input): Promise<Buffer> {
  const bg = await skyBackground(i, { r: 60, g: 32, b: 12 });
  // Secondary figure ONLY when we have a genuinely different pose. When we don't,
  // a single centred hero reads far better than two identical copies.
  const twoFigures = Boolean(i.layers.heroIsDistinct && i.layers.hero);
  const secSheet = twoFigures
    ? await placeLayer(
        i.layers.hero,
        Math.round(V2_H * 0.48), // clearly smaller than the hero
        (w) => ({ left: Math.round(V2_W * 0.24 - w / 2), top: Math.round(V2_H * 0.4) }),
        { mod: { brightness: 0.82, saturation: 0.9 }, flip: true, fade: true, fadeStart: 80 }
      )
    : await emptySheet();
  const heroSheet = await placeLayer(
    i.layers.cutAction,
    Math.round(V2_H * 0.62),
    (w) => ({ left: Math.round((twoFigures ? V2_W * 0.62 : V2_W * 0.5) - w / 2), top: Math.round(V2_H * 0.3) }),
    { mod: { brightness: 1.05, saturation: 1.08 }, fade: true, fadeStart: 84 }
  );
  const txt = await centredBottomText(i);

  const bs = 180;
  const [cH, cA] = await Promise.all([crestPng(i.homeCrest, bs), crestPng(i.awayCrest, bs)]);
  const crestY = V2_H - 200;
  const vs = await textLayer(div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
    text({ position: 'absolute', top: `${crestY + bs / 2 - 34}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Cinzel', fontWeight: 700, fontSize: '58px', color: GOLD }, 'VS'),
  ]));

  const comp: sharp.OverlayOptions[] = [
    { input: secSheet, left: 0, top: 0 },
    { input: heroSheet, left: 0, top: 0 },
    { input: txt, left: 0, top: 0 },
  ];
  if (cH) comp.push({ input: cH, left: Math.round(V2_W / 2 - 130 - bs / 2), top: crestY });
  if (cA) comp.push({ input: cA, left: Math.round(V2_W / 2 + 130 - bs / 2), top: crestY });
  comp.push({ input: vs, left: 0, top: 0 });
  return sharp(bg).composite(comp).png().toBuffer();
}

async function renderStorm(i: RenderV2Input): Promise<Buffer> {
  const bg = await skyBackground(i, { r: 30, g: 32, b: 40 });

  // Two genuinely different poses → hero + one mirrored secondary (never three
  // copies of the same image). One pose → a single centred hero.
  const twoFigures = Boolean(i.layers.heroIsDistinct && i.layers.hero);
  const heroSheet = await placeLayer(
    i.layers.hero,
    Math.round(V2_H * 0.58),
    (w) => ({ left: Math.round((twoFigures ? V2_W * 0.62 : V2_W * 0.5) - w / 2), top: Math.round(V2_H * 0.2) }),
    { fade: true, fadeStart: 84 }
  );
  const a1Sheet = twoFigures
    ? await placeLayer(
        i.layers.cutAction,
        Math.round(V2_H * 0.42),
        (w) => ({ left: Math.round(V2_W * 0.26 - w / 2), top: Math.round(V2_H * 0.34) }),
        { mod: { brightness: 0.84, saturation: 0.9 }, flip: true, fade: true, fadeStart: 80 }
      )
    : await emptySheet();
  const a2Sheet = await emptySheet();
  const txt = await centredBottomText(i);

  const bs = 160;
  const [cH, cA] = await Promise.all([crestPng(i.homeCrest, bs), crestPng(i.awayCrest, bs)]);
  const crestY = V2_H - 200;
  const vs = await textLayer(div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
    text({ position: 'absolute', top: `${crestY + bs / 2 - 30}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Cinzel', fontWeight: 700, fontSize: '54px', color: GOLD }, 'VS'),
  ]));

  const comp: sharp.OverlayOptions[] = [
    { input: a1Sheet, left: 0, top: 0 },
    { input: a2Sheet, left: 0, top: 0 },
    { input: heroSheet, left: 0, top: 0 },
    { input: txt, left: 0, top: 0 },
  ];
  if (cH) comp.push({ input: cH, left: Math.round(V2_W / 2 - 130 - bs / 2), top: crestY });
  if (cA) comp.push({ input: cA, left: Math.round(V2_W / 2 + 130 - bs / 2), top: crestY });
  comp.push({ input: vs, left: 0, top: 0 });
  return sharp(bg).composite(comp).png().toBuffer();
}

// ── New premium styles ─────────────────────────────────────────────────────
// A shared, themeable builder: an atmospheric background + a sharp hero (plus a
// subtle mirrored secondary when a distinct pose exists), accent geometry,
// themed gold/colour typography and a consistent crest bar. Each named style
// below is a distinct palette + treatment on top of this proven skeleton.

interface Theme {
  /** Title + accent colour. */
  accent: string;
  /** Title fill (solid or gradient id defined in the text layer). */
  titleColor: string;
  /** Player colour grade (graded toward the scene palette). */
  heroMod: { brightness?: number; saturation?: number };
  /** Secondary figure placement style. */
  secondary: 'mirror-left' | 'none';
  /** Cinematic scene parameters — stadium bg + smoke + spotlight. */
  scene: {
    wash: string;
    washOpacity: number;
    spot: string;
    smokeTint: string;
    smokeIntensity?: number;
    bottom: string;
    rim: string;
  };
}

function gradientField(stops: string): Buffer {
  return Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">${stops}</linearGradient>` +
      `<radialGradient id="spot" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="100%" stop-color="#000000" stop-opacity="0"/></radialGradient>` +
      `</defs><rect width="${V2_W}" height="${V2_H}" fill="url(#g)"/><rect width="${V2_W}" height="${V2_H}" fill="url(#spot)"/></svg>`
  );
}

function rays(color: string, opacity: number): Buffer {
  const n = 11;
  const polys = Array.from({ length: n })
    .map((_, k) => {
      const cx = V2_W / 2;
      const spread = (k - (n - 1) / 2) * 90;
      return `<polygon points="${cx},${V2_H * 0.42} ${cx + spread - 24},-50 ${cx + spread + 24},-50" fill="${color}" opacity="${(opacity * (1 - Math.abs(k - (n - 1) / 2) / n)).toFixed(3)}"/>`;
    })
    .join('');
  return Buffer.from(`<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">${polys}</svg>`);
}

async function noise(base: Buffer): Promise<Buffer> {
  // Subtle film grain for cinematic depth.
  const grain = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">` +
      Array.from({ length: 220 })
        .map(() => {
          const x = (Math.random() * V2_W) | 0;
          const y = (Math.random() * V2_H) | 0;
          const o = (Math.random() * 0.05).toFixed(3);
          return `<circle cx="${x}" cy="${y}" r="1" fill="#ffffff" opacity="${o}"/>`;
        })
        .join('') +
      `</svg>`
  );
  return sharp(base).composite([{ input: grain, blend: 'over' }]).png().toBuffer();
}

// ── Cinematic scene helpers ─────────────────────────────────────────────────

/**
 * Thick atmospheric smoke: layered soft blobs with heavy blur, concentrated in
 * the lower/mid frame and drifting up. Tinted to the scene colour so it reads
 * as volumetric haze, not noise.
 */
async function smokeLayer(tint: string, intensity = 1): Promise<Buffer> {
  const blobs: string[] = [];
  const n = 26;
  for (let k = 0; k < n; k++) {
    const x = (Math.random() * V2_W) | 0;
    const y = (V2_H * 0.35 + Math.random() * V2_H * 0.6) | 0; // lower/mid heavy
    const r = (90 + Math.random() * 230) | 0;
    const o = (0.05 + Math.random() * 0.16 * intensity).toFixed(3);
    blobs.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${tint}" opacity="${o}"/>`);
  }
  const svg = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">${blobs.join('')}</svg>`
  );
  // Heavy blur turns the blobs into billowing smoke.
  return sharp(svg).blur(55).png().toBuffer();
}

/** A radial spotlight glow (behind the player) in a given colour. */
function spotlight(color: string, opacity: number, cy = 0.42): Buffer {
  return Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<radialGradient id="sp" cx="50%" cy="${(cy * 100).toFixed(0)}%" r="46%">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="${opacity}"/>` +
      `<stop offset="60%" stop-color="${color}" stop-opacity="${(opacity * 0.3).toFixed(3)}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#sp)"/></svg>`
  );
}

/** Bottom + top vignette so title and fixture text always sit on darkness. */
function cinematicVignette(bottom: string): Buffer {
  return Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="cv" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#000" stop-opacity="0.72"/>` +
      `<stop offset="18%" stop-color="#000" stop-opacity="0.25"/>` +
      `<stop offset="55%" stop-color="#000" stop-opacity="0.12"/>` +
      `<stop offset="78%" stop-color="${bottom}" stop-opacity="0.55"/>` +
      `<stop offset="100%" stop-color="${bottom}" stop-opacity="0.96"/></linearGradient>` +
      `<radialGradient id="edge" cx="50%" cy="46%" r="75%">` +
      `<stop offset="62%" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="#000" stop-opacity="0.55"/></radialGradient></defs>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#cv)"/>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#edge)"/></svg>`
  );
}

/**
 * Build the cinematic MAIN BACKGROUND from the uploaded stadium (preferred) or
 * an AI sky, graded dark and colour-washed to the theme, with thick smoke and a
 * spotlight. This is the big quality lever: a real, integrated, moody scene
 * instead of a flat gradient.
 */
async function cinematicStadiumBg(
  i: RenderV2Input,
  opts: { wash: string; washOpacity: number; spot: string; smokeTint: string; smokeIntensity?: number; bottom: string }
): Promise<Buffer> {
  // Base: stadium photo (user upload) → else AI sky → else deep gradient.
  let base: Buffer;
  const source = i.stadium ?? i.sky ?? null;
  if (source) {
    base = await sharp(source)
      .resize(V2_W, V2_H, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 0.5, saturation: 0.85 }) // graded dark + cinematic
      .blur(3)
      .toBuffer();
  } else {
    base = await sharp(
      gradientField(`<stop offset="0%" stop-color="${opts.bottom}"/><stop offset="100%" stop-color="#05060a"/>`)
    )
      .png()
      .toBuffer();
  }

  const smoke = await smokeLayer(opts.smokeTint, opts.smokeIntensity ?? 1);
  const composed = await sharp(base)
    .composite([
      // colour-wash to unify the scene with the theme palette
      {
        input: Buffer.from(
          `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><rect width="${V2_W}" height="${V2_H}" fill="${opts.wash}" opacity="${opts.washOpacity}"/></svg>`
        ),
        blend: 'over',
      },
      { input: spotlight(opts.spot, 0.5), blend: 'screen' },
      { input: smoke, blend: 'screen' },
      { input: cinematicVignette(opts.bottom), blend: 'over' },
    ])
    .png()
    .toBuffer();
  return noise(composed);
}

/**
 * A soft elliptical contact shadow to ground the player at the given x and
 * baseline y (both in px). Returned as a full-canvas layer, drawn under the
 * hero so he stops floating.
 */
function contactShadow(cx: number, baseY: number, width: number): Buffer {
  const rx = Math.round(width * 0.55);
  const ry = Math.round(width * 0.12);
  return Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<radialGradient id="sh" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="#000" stop-opacity="0.6"/>` +
      `<stop offset="70%" stop-color="#000" stop-opacity="0.25"/>` +
      `<stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs>` +
      `<ellipse cx="${cx}" cy="${baseY}" rx="${rx}" ry="${ry}" fill="url(#sh)"/></svg>`
  );
}

/**
 * Rim-light glow: a blurred, tinted silhouette of the player placed just behind
 * them, so they separate from the smoke with a cinematic edge light.
 */
async function rimGlow(playerSheet: Buffer, color: string): Promise<Buffer> {
  // Tint the player's alpha into a solid colour, then blur into a halo.
  const alpha = await sharp(playerSheet).ensureAlpha().extractChannel(3).toBuffer();
  const solid = await sharp({
    create: { width: V2_W, height: V2_H, channels: 3, background: color },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return sharp(solid).blur(26).png().toBuffer();
}

async function themedPoster(i: RenderV2Input, theme: Theme): Promise<Buffer> {
  // 1) Cinematic MAIN background: stadium (or sky) graded dark + colour wash +
  //    spotlight + thick smoke + vignette + grain.
  const bg = await cinematicStadiumBg(i, theme.scene);

  const twoFigures = theme.secondary !== 'none' && Boolean(i.layers.heroIsDistinct && i.layers.hero);

  // 2) Hero geometry (compute placement so we can ground + rim-light it).
  const heroH = Math.round(V2_H * 0.66);
  const heroCx = twoFigures ? V2_W * 0.6 : V2_W * 0.5;
  const heroTop = Math.round(V2_H * 0.26);
  const heroSheet = await placeLayer(
    i.layers.cutAction,
    heroH,
    (w) => ({ left: Math.round(heroCx - w / 2), top: heroTop }),
    { mod: theme.heroMod, fade: true, fadeStart: 86 }
  );
  const rimHero = await rimGlow(heroSheet, theme.scene.rim);

  // 3) Secondary figure (mirrored, dimmer) behind, when a distinct pose exists.
  const secSheet = twoFigures
    ? await placeLayer(
        i.layers.hero,
        Math.round(V2_H * 0.52),
        (w) => ({ left: Math.round(V2_W * 0.26 - w / 2), top: Math.round(V2_H * 0.34) }),
        { mod: { brightness: 0.72, saturation: 0.8 }, flip: true, fade: true, fadeStart: 78 }
      )
    : await emptySheet();

  // 4) Contact shadow grounding the hero (sits on the fixture band).
  const shadow = contactShadow(Math.round(heroCx), Math.round(V2_H * 0.78), Math.round(heroH * 0.42));

  // 5) Giant number watermark behind the player for depth + sports energy.
  const number = (i.squadNumber ?? '').trim();
  const watermark = number
    ? await textLayer(
        div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
          text(
            {
              position: 'absolute',
              top: `${Math.round(V2_H * 0.3)}px`,
              width: `${V2_W}px`,
              justifyContent: 'center',
              fontFamily: 'Cinzel',
              fontWeight: 700,
              fontSize: '460px',
              color: theme.accent,
              opacity: '0.08',
            },
            number
          ),
        ])
      )
    : await emptySheet();

  // 6) Typography — competition kicker, MATCHDAY title, player name, fixture.
  const info = '#ffffff';
  const sub = '#c9d2dd';
  const titleY = 128;
  const txt = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative', flexDirection: 'column' }, [
      text({ position: 'absolute', top: '64px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 600, fontSize: '28px', color: theme.accent, letterSpacing: '7px' }, compLine(i.facts).toUpperCase()),
      text({ position: 'absolute', top: `${titleY}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Cinzel', fontWeight: 700, fontSize: '120px', color: theme.titleColor, letterSpacing: '2px' }, 'MATCHDAY'),
      text({ position: 'absolute', top: `${titleY + 148}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 400, fontSize: '42px', color: info, letterSpacing: '5px' }, i.playerName),
      text({ position: 'absolute', top: `${V2_H - 296}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 700, fontSize: '40px', color: info }, `${i.facts.homeTeam}   vs   ${i.facts.awayTeam}`),
      text({ position: 'absolute', top: `${V2_H - 238}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 400, fontSize: '30px', color: sub, letterSpacing: '4px' }, dateLine(i.facts)),
    ])
  );

  const bs = 170;
  const [cH, cA] = await Promise.all([crestPng(i.homeCrest, bs), crestPng(i.awayCrest, bs)]);
  const crestY = V2_H - 188;
  const vs = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      text({ position: 'absolute', top: `${crestY + bs / 2 - 32}px`, width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Cinzel', fontWeight: 700, fontSize: '56px', color: theme.accent }, 'VS'),
    ])
  );

  // Compositing order (back → front): bg, number watermark, smoke-behind
  // (already in bg), secondary figure, rim glow, contact shadow, hero, text.
  const comp: sharp.OverlayOptions[] = [
    { input: watermark, left: 0, top: 0 },
    { input: secSheet, left: 0, top: 0 },
    { input: rimHero, left: 0, top: 0 },
    { input: shadow, left: 0, top: 0 },
    { input: heroSheet, left: 0, top: 0 },
    { input: txt, left: 0, top: 0 },
  ];
  if (cH) comp.push({ input: cH, left: Math.round(V2_W / 2 - 125 - bs / 2), top: crestY });
  if (cA) comp.push({ input: cA, left: Math.round(V2_W / 2 + 125 - bs / 2), top: crestY });
  comp.push({ input: vs, left: 0, top: 0 });
  return sharp(bg).composite(comp).png().toBuffer();
}

// INFERNO — fiery red/orange, diagonal split, rays.
async function renderInferno(i: RenderV2Input): Promise<Buffer> {
  return themedPoster(i, {
    accent: '#ffcf6b',
    titleColor: '#ffe3a6',
    heroMod: { brightness: 1.03, saturation: 1.16 }, // warm grade to match embers
    secondary: 'mirror-left',
    scene: {
      wash: '#7c1d08',
      washOpacity: 0.42,
      spot: '#ff7a1a',
      smokeTint: '#ff6a2a',
      smokeIntensity: 1.15,
      bottom: '#140502',
      rim: '#ff8a3a',
    },
  });
}

// FROST — cold cinematic ice-blue, teal rim, drifting cold smoke.
async function renderFrost(i: RenderV2Input): Promise<Buffer> {
  return themedPoster(i, {
    accent: '#8fe3ff',
    titleColor: '#eaf7ff',
    heroMod: { brightness: 1.05, saturation: 0.96 }, // cool grade
    secondary: 'mirror-left',
    scene: {
      wash: '#13395c',
      washOpacity: 0.44,
      spot: '#aee9ff',
      smokeTint: '#bfe6ff',
      smokeIntensity: 1.0,
      bottom: '#05101c',
      rim: '#7fd8ff',
    },
  });
}

// PRESTIGE — luxury black & gold, single hero, warm smoke, deep darkness.
async function renderPrestige(i: RenderV2Input): Promise<Buffer> {
  return themedPoster(i, {
    accent: '#d8af4e',
    titleColor: '#e9cd7f',
    heroMod: { brightness: 1.0, saturation: 1.05 },
    secondary: 'none',
    scene: {
      wash: '#1a1407',
      washOpacity: 0.5,
      spot: '#e9c879',
      smokeTint: '#d8af4e',
      smokeIntensity: 0.85,
      bottom: '#050403',
      rim: '#caa23f',
    },
  });
}

// ELECTRIC — neon cyber, teal/violet glow, charged smoke.
async function renderElectric(i: RenderV2Input): Promise<Buffer> {
  return themedPoster(i, {
    accent: '#7cf6c8',
    titleColor: '#ffffff',
    heroMod: { brightness: 1.05, saturation: 1.14 },
    secondary: 'mirror-left',
    scene: {
      wash: '#241158',
      washOpacity: 0.46,
      spot: '#7cf6c8',
      smokeTint: '#9f6bff',
      smokeIntensity: 1.1,
      bottom: '#070314',
      rim: '#7cf6c8',
    },
  });
}

export async function renderV2(input: RenderV2Input): Promise<{ bytes: Buffer; width: number; height: number }> {
  let bytes: Buffer;
  switch (input.design) {
    case 'midnight':
      bytes = await renderMidnight(input);
      break;
    case 'marble':
      bytes = await renderMarble(input);
      break;
    case 'golden':
      bytes = await renderGolden(input);
      break;
    case 'storm':
      bytes = await renderStorm(input);
      break;
    case 'inferno':
      bytes = await renderInferno(input);
      break;
    case 'frost':
      bytes = await renderFrost(input);
      break;
    case 'prestige':
      bytes = await renderPrestige(input);
      break;
    case 'electric':
      bytes = await renderElectric(input);
      break;
    default:
      bytes = await renderMidnight(input);
  }
  // Guarantee exact 9:16 output dimensions.
  const normalized = await sharp(bytes).resize(V2_W, V2_H, { fit: 'cover' }).png().toBuffer();
  return { bytes: normalized, width: V2_W, height: V2_H };
}
