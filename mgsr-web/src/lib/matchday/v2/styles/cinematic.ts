/**
 * CINEMATIC family (V3) — Inferno, Frost, Prestige, Electric.
 *
 * These four used to be one template in four colours. Each is now its own
 * composition with a distinct visual idea, while still sitting on the shared
 * cinematic scene (AI stadium scene when available, otherwise a graded
 * gradient + smoke + spotlight):
 *
 *   INFERNO   low-angle hero bleeding off the bottom, stacked MATCH/DAY, embers
 *   FROST     frosted-glass fixture panel (real blur of the scene) + HUD marks
 *   PRESTIGE  gold double frame, vertical surname watermark, editorial centre
 *   ELECTRIC  RGB-split hero, glitch title, terminal-style data panel
 *
 * The player is always the real cutout; nothing here generates a face.
 */
import sharp from 'sharp';
import {
  type RenderV2Input,
  V2_W,
  V2_H,
  placeLayer,
  textLayer,
  cinematicStadiumBg,
  rimGlow,
  contactShadow,
  div,
  text,
  emptySheet,
  smokeLayer,
} from '../render';
import { mix } from '../kit/palette';
import { relightCutout } from '../kit/relight';
import { hasSecond, secondSheet } from '../kit/second';
import { makeRng } from '../kit/prng';
import { grain } from '../kit/texture';
import { discBadge } from '../kit/badges';
import { fitFontSize, splitName, fitText, compLineFit } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import type { BrandOptions } from '../kit/brand';

type Sty = Record<string, string | number>;
const abs = (top: number, left: number, extra: Sty): Sty => ({ position: 'absolute', top: `${top}px`, left: `${left}px`, ...extra });
const centred = (top: number, extra: Sty): Sty => abs(top, 0, { width: `${V2_W}px`, justifyContent: 'center', ...extra });
const root = (children: unknown[]) =>
  div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, children as never);

interface Shared {
  pd: ReturnType<typeof posterDate>;
  countdown: string | null;
  dateStr: string;
  timeStr: string;
  rng: () => number;
}
function shared(i: RenderV2Input): Shared {
  const pd = posterDate(i.facts.date);
  return {
    pd,
    countdown: countdownLabel(i.facts.date),
    dateStr: pd ? pd.short : i.facts.date,
    timeStr: i.facts.time ?? 'TBC',
    rng: makeRng((i.seed ?? 1) + 101),
  };
}

/** Tint a cutout's silhouette a flat colour (alpha preserved). */
async function tintCutout(cutout: Buffer, color: string): Promise<Buffer> {
  const alpha = await sharp(cutout).ensureAlpha().extractChannel(3).toBuffer();
  const m = await sharp(cutout).metadata();
  const rgb = await sharp({ create: { width: m.width ?? 1, height: m.height ?? 1, channels: 3, background: color } }).png().toBuffer();
  return sharp(rgb).joinChannel(alpha).png().toBuffer();
}

/** Glowing particles (embers / snow): seeded, soft, screen-blended. */
async function particles(rng: () => number, color: string, n: number, yMin: number, yMax: number, rMax = 5): Promise<Buffer> {
  const dots: string[] = [];
  for (let k = 0; k < n; k++) {
    const x = (rng() * V2_W).toFixed(0);
    const y = (yMin + rng() * (yMax - yMin)).toFixed(0);
    const r = (1 + rng() * rMax).toFixed(1);
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${(0.3 + rng() * 0.7).toFixed(2)}"/>`);
  }
  const svg = Buffer.from(`<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">${dots.join('')}</svg>`);
  const soft = await sharp(svg).blur(1.4).png().toBuffer();
  const halo = await sharp(svg).blur(9).png().toBuffer();
  return sharp(halo).composite([{ input: soft }]).png().toBuffer();
}

// ── Remix variants: one theme per variant (index = remix % length) ──────────
interface InfernoTheme { wash: string; spot: string; smoke: string; bottom: string; hot: string; accent: string; titleA: string; titleB: string; onAccent: string; rim: string; panel: string; badge: string; venue: string; emberF: string; emberB: string; glowA: string; glowB: string; glowC: string }
export const INFERNO_THEMES: InfernoTheme[] = [
  { wash: '#7c1d08', spot: '#ff7a1a', smoke: '#ff6a2a', bottom: '#140502', hot: '#ff9a3a', accent: '#ffcf6b', titleA: '#ffe3a6', titleB: '#ff7a2a', onAccent: '#1a0802', rim: '#ff8a3a', panel: '#0d0301', badge: '#16090a', venue: '#ffb36b', emberF: '#ffb05a', emberB: '#ff6a1a', glowA: 'rgba(255,100,20,0.85)', glowB: 'rgba(255,60,10,0.8)', glowC: 'rgba(255,110,20,0.6)' },
  { wash: '#5c0614', spot: '#ff2a3a', smoke: '#ff3a4a', bottom: '#120206', hot: '#ff5a5a', accent: '#ffd27a', titleA: '#fff1d6', titleB: '#ff2a3a', onAccent: '#1a0206', rim: '#ff4a5a', panel: '#0d0103', badge: '#16070a', venue: '#ff9aa0', emberF: '#ffc0a8', emberB: '#ff2a3a', glowA: 'rgba(255,40,60,0.85)', glowB: 'rgba(255,20,40,0.8)', glowC: 'rgba(255,60,60,0.6)' },
  { wash: '#0b2a6e', spot: '#3aa0ff', smoke: '#4ab0ff', bottom: '#020814', hot: '#5ad0ff', accent: '#bff4ff', titleA: '#e8fbff', titleB: '#3aa8ff', onAccent: '#02101e', rim: '#5ac8ff', panel: '#010610', badge: '#06101c', venue: '#9ad8ff', emberF: '#c8f0ff', emberB: '#3a8cff', glowA: 'rgba(60,170,255,0.85)', glowB: 'rgba(40,120,255,0.8)', glowC: 'rgba(80,190,255,0.6)' },
];

interface FrostTheme { wash: string; spot: string; smoke: string; bottom: string; accent: string; rim: string; title: string; onAccent: string; venue: string; snow: string; glowA: string; glowB: string }
export const FROST_THEMES: FrostTheme[] = [
  { wash: '#13395c', spot: '#aee9ff', smoke: '#bfe6ff', bottom: '#05101c', accent: '#8fe3ff', rim: '#7fd8ff', title: '#eaf7ff', onAccent: '#04121e', venue: '#d6f3ff', snow: '#ffffff', glowA: 'rgba(143,227,255,0.55)', glowB: 'rgba(143,227,255,0.6)' },
  { wash: '#3a5266', spot: '#ffffff', smoke: '#ffffff', bottom: '#0c1620', accent: '#ffffff', rim: '#e6f4ff', title: '#ffffff', onAccent: '#0c1620', venue: '#e6f0f8', snow: '#ffffff', glowA: 'rgba(255,255,255,0.55)', glowB: 'rgba(255,255,255,0.55)' },
  { wash: '#0c3b3a', spot: '#5cffb0', smoke: '#7a5cff', bottom: '#030c12', accent: '#7dffc4', rim: '#5cffb0', title: '#eafff5', onAccent: '#03140e', venue: '#c8ffe8', snow: '#d8ffee', glowA: 'rgba(92,255,176,0.55)', glowB: 'rgba(122,92,255,0.6)' },
];

interface PrestigeTheme { gold: string; light: string; deep: string; wash: string; spot: string; smoke: string; bottom: string; rim: string; badge: string; venue: string }
export const PRESTIGE_THEMES: PrestigeTheme[] = [
  { gold: '#d8af4e', light: '#ecd28a', deep: '#a9772a', wash: '#1a1407', spot: '#e9c879', smoke: '#d8af4e', bottom: '#050403', rim: '#caa23f', badge: '#0c0a05', venue: '#c9c2ae' },
  { gold: '#c9d0d8', light: '#eef2f6', deep: '#7d868f', wash: '#0d1014', spot: '#e8eef4', smoke: '#c9d0d8', bottom: '#040506', rim: '#b8c2cc', badge: '#08090b', venue: '#b9bec4' },
  { gold: '#e0a084', light: '#f6d2c2', deep: '#a8644a', wash: '#1c0f0c', spot: '#f2b8a0', smoke: '#e0a084', bottom: '#060303', rim: '#d89078', badge: '#0d0706', venue: '#d6c0b6' },
];

interface ElectricTheme { cy: string; mg: string; gr: string; wash: string; spot: string; smoke: string; bottom: string; panel: string; badge: string }
export const ELECTRIC_THEMES: ElectricTheme[] = [
  { cy: '#4df2ff', mg: '#ff3df2', gr: '#7cf6c8', wash: '#241158', spot: '#7cf6c8', smoke: '#9f6bff', bottom: '#070314', panel: '#07031a', badge: '#0a0420' },
  { cy: '#c6ff3a', mg: '#8a3aff', gr: '#c6ff3a', wash: '#1a0c3a', spot: '#c6ff3a', smoke: '#8a3aff', bottom: '#06020f', panel: '#060210', badge: '#0a0418' },
  { cy: '#ffb03a', mg: '#ff3a7a', gr: '#ffd23a', wash: '#4a0f2a', spot: '#ff8a3a', smoke: '#ff3a7a', bottom: '#12040a', panel: '#14040c', badge: '#18060e' },
];

/** Colour words for the AI stadium scene, per cinematic design + variant. */
export const CINEMATIC_SCENE_WORDS: Record<string, string[]> = {
  inferno: ['deep crimson and ember orange', 'blood red and dark gold', 'electric blue flame and deep navy'],
  frost: ['icy cyan and steel blue', 'white arctic haze and pale steel', 'aurora green and violet'],
  prestige: ['black and antique gold', 'black and cool platinum silver', 'black and warm rose gold'],
  electric: ['neon teal and electric violet', 'acid lime and ultraviolet', 'neon orange and hot pink'],
};

const lines = (s: string) => s.toUpperCase();

// ═══════════════════════════ INFERNO ═══════════════════════════
export const INFERNO_BRAND: BrandOptions = { corner: 'top-right', size: 84, margin: 40 };

export async function renderInfernoV3(i: RenderV2Input): Promise<Buffer> {
  const T = INFERNO_THEMES[(i.variant ?? 0) % INFERNO_THEMES.length];
  // Grade the real cutout toward the scene light (no pixels are redrawn).
  const lit = i.layers.cutAction ? await relightCutout(i.layers.cutAction, { tint: T.rim, amount: 0.38, wrap: 0.7 }) : null;
  const f = i.facts;
  const { countdown, dateStr, timeStr, rng } = shared(i);
  const { given, surname } = splitName(i.playerName);
  const bg = await cinematicStadiumBg(i, {
    wash: T.wash, washOpacity: 0.42, spot: T.spot, smokeTint: T.smoke, smokeIntensity: 1.15, bottom: T.bottom,
  });

  // diagonal heat streaks
  const streaks: string[] = [];
  for (let k = 0; k < 16; k++) {
    const x = rng() * (V2_W + 600) - 300;
    const len = 500 + rng() * 900;
    streaks.push(
      `<line x1="${x.toFixed(0)}" y1="${(rng() * 900).toFixed(0)}" x2="${(x - len * 0.45).toFixed(0)}" y2="${(len + rng() * 500).toFixed(0)}" stroke="${T.hot}" stroke-width="${(2 + rng() * 5).toFixed(1)}" opacity="${(0.1 + rng() * 0.25).toFixed(2)}"/>`
    );
  }
  const streakLayer = await sharp(Buffer.from(`<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">${streaks.join('')}</svg>`)).blur(2.5).png().toBuffer();

  const SUR = lines(surname);
  const kickI = compLineFit(f, 860, 'Bebas', 38, 22, 9);
  // Name block sits in FRONT of the hero (legible even where the arm crosses it).
  const gI = given ? fitText(lines(given), 560, 'Bebas', 46, 28, 12) : null;
  const sI = fitText(SUR, 560, 'Anton', 92, 44, 3);
  const title = await textLayer(
    root([
      text(abs(64, 56, { fontFamily: 'Bebas', fontSize: `${kickI.size}px`, letterSpacing: '9px', color: T.accent }), kickI.text),
      text(abs(134, 46, { fontFamily: 'Anton', fontSize: '262px', lineHeight: 0.9, color: T.titleA, letterSpacing: '2px', textShadow: `0 0 70px ${T.glowA}` }), 'MATCH'),
      text(abs(368, 46, { fontFamily: 'Anton', fontSize: '262px', lineHeight: 0.9, color: T.titleB, letterSpacing: '2px', textShadow: `0 0 70px ${T.glowB}` }), 'DAY'),
    ])
  );

  const cx = 662;
  const hero = await placeLayer(lit, 1500, (w) => ({ left: Math.round(cx - w / 2), top: 340 }), {
    mod: { brightness: 1.03, saturation: 1.18 }, fade: true, fadeStart: 94, maxW: 740,
  });
  const rim = await rimGlow(hero, T.rim);
  const shadow = contactShadow(cx, 1790, 520);

  const panel = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="p" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${T.panel}" stop-opacity="0.9"/>` +
      `<stop offset="62%" stop-color="${T.panel}" stop-opacity="0.55"/><stop offset="100%" stop-color="${T.panel}" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.8"/></linearGradient></defs>` +
      `<rect y="1330" width="${V2_W}" height="590" fill="url(#v)"/><rect y="1330" width="760" height="590" fill="url(#p)"/>` +
      `<rect x="56" y="1352" width="170" height="6" fill="${T.titleB}"/></svg>`
  );

  const BS = 150;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, BS, { ring: T.hot, ringWidth: 5, fill: T.badge, fillOpacity: 0.9 }),
    discBadge(i.awayCrest, BS, { ring: T.hot, ringWidth: 5, fill: T.badge, fillOpacity: 0.9 }),
  ]);
  const nameFit = (n: string) => fitFontSize(n.toUpperCase(), 250, 'Bebas', 38, 22, 3);
  const info = await textLayer(
    root([
      ...(gI ? [text(abs(626, 56, { fontFamily: 'Bebas', fontSize: `${gI.size}px`, letterSpacing: '12px', color: '#ffffff', textShadow: '0 2px 14px rgba(0,0,0,0.75)' }), gI.text)] : []),
      text(abs(gI ? 626 + gI.size + 2 : 626, 52, { fontFamily: 'Anton', fontSize: `${sI.size}px`, letterSpacing: '3px', color: '#ffffff', lineHeight: 1, textShadow: '0 3px 18px rgba(0,0,0,0.8)' }), sI.text),
      ...(i.squadNumber
        ? [text(abs((gI ? 626 + gI.size + 2 : 626) + sI.size + 14, 56, { fontFamily: 'Anton', fontSize: '42px', padding: '6px 20px 2px', background: T.titleB, color: T.onAccent, letterSpacing: '3px' }), `#${i.squadNumber}`)]
        : []),
      ...(countdown
        ? [text(abs(1372 - 80, 56, { fontFamily: 'Anton', fontSize: '40px', letterSpacing: '4px', padding: '6px 22px 2px', background: T.accent, color: T.onAccent }), countdown)]
        : []),
      text(centredAt(1530, 56, 250, { fontFamily: 'Bebas', fontSize: `${nameFit(f.homeTeam)}px`, letterSpacing: '3px', color: '#fff' }), lines(f.homeTeam)),
      text(centredAt(1530, 56 + BS + 70, 250, { fontFamily: 'Bebas', fontSize: `${nameFit(f.awayTeam)}px`, letterSpacing: '3px', color: '#fff' }), lines(f.awayTeam)),
      text(abs(1372 + BS / 2 - 28, 56 + BS + 8, { fontFamily: 'Anton', fontSize: '44px', color: T.hot, width: '54px', justifyContent: 'center' }), 'VS'),
      text(abs(1596, 56, { fontFamily: 'Anton', fontSize: '98px', letterSpacing: '3px', color: '#fff', lineHeight: 1 }), dateStr),
      text(abs(1696, 56, { fontFamily: 'Anton', fontSize: '150px', letterSpacing: '2px', color: T.accent, lineHeight: 1, textShadow: `0 0 40px ${T.glowC}` }), timeStr),
      ...(f.venue ? (() => { const v = fitText(lines(f.venue), 600, 'Bebas', 32, 20, 7); return [text(abs(1856, 56, { fontFamily: 'Bebas', fontSize: `${v.size}px`, letterSpacing: '7px', color: T.venue }), v.text)]; })() : []),
    ])
  );

  const embersFront = await particles(rng, T.emberF, 120, 300, 1900, 5);
  const embersBack = await particles(rng, T.emberB, 60, 200, 1700, 8);
  const comp: sharp.OverlayOptions[] = [
    { input: streakLayer, blend: 'screen' },
    { input: embersBack, blend: 'screen' },
    // Second real photo: a fire-relit, darkened figure rising behind the title.
    ...(await (async () => {
      const g = await secondSheet(i, { height: 1060, cx: 250, top: 380, flip: true, opacity: 0.92, fadeStart: 62, maxW: 460, treatment: { kind: 'relit', tint: T.rim, amount: 0.65, brightness: 0.75 } });
      return g ? [{ input: g }] : [];
    })()),
    { input: title },
    { input: rim },
    { input: shadow },
    { input: hero },
    { input: await frontHaze(T.smoke, 0.9, 1350, 1760), blend: 'screen' },
    { input: panel },
    { input: info },
    { input: embersFront, blend: 'screen' },
  ];
  if (cH) comp.push({ input: cH, left: 56, top: 1372 });
  if (cA) comp.push({ input: cA, left: 56 + BS + 70, top: 1372 });
  comp.push({ input: await grain((i.seed ?? 1) + 5, 0.1), blend: 'overlay' });
  return sharp(bg).composite(comp).png().toBuffer();
}

/**
 * Foreground haze: soft smoke drifting IN FRONT of the player's legs (masked to
 * the lower part of the frame), so the hero sits inside the scene instead of
 * on top of it.
 */
async function frontHaze(tint: string, intensity: number, fromY = 1250, toY = 1700): Promise<Buffer> {
  const smoke = await smokeLayer(tint, intensity);
  const mask = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="${(fromY / V2_H).toFixed(3)}" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset="${(toY / V2_H).toFixed(3)}" stop-color="#fff" stop-opacity="1"/>` +
      `<stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient></defs>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#m)"/></svg>`
  );
  return sharp(smoke).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** A text box of fixed width centred on its own column (left = column left). */
function centredAt(top: number, left: number, width: number, extra: Sty): Sty {
  return abs(top, left, { width: `${width}px`, justifyContent: 'center', textAlign: 'center', ...extra });
}

// ═══════════════════════════ FROST ═══════════════════════════
export const FROST_BRAND: BrandOptions = { corner: 'top-right', size: 84, margin: 40 };

async function glassPanel(bg: Buffer, x: number, y: number, w: number, h: number, r: number): Promise<Buffer> {
  const crop = await sharp(bg).extract({ left: x, top: y, width: w, height: h }).blur(24).modulate({ brightness: 1.35, saturation: 1.15 }).png().toBuffer();
  const mask = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);
  const frosted = await sharp(crop).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const sheen = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#dff6ff" stop-opacity="0.26"/><stop offset="55%" stop-color="#9fdcff" stop-opacity="0.07"/>` +
      `<stop offset="100%" stop-color="#dff6ff" stop-opacity="0.16"/></linearGradient></defs>` +
      `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r}" fill="url(#s)" stroke="#dff6ff" stroke-opacity="0.5" stroke-width="2"/></svg>`
  );
  const panel = await sharp(frosted).composite([{ input: sheen }]).png().toBuffer();
  return sharp({ create: { width: V2_W, height: V2_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: panel, left: x, top: y }])
    .png()
    .toBuffer();
}

export async function renderFrostV3(i: RenderV2Input): Promise<Buffer> {
  const T = FROST_THEMES[(i.variant ?? 0) % FROST_THEMES.length];
  // Grade the real cutout toward the scene light (no pixels are redrawn).
  const lit = i.layers.cutAction ? await relightCutout(i.layers.cutAction, { tint: T.rim, amount: 0.38, wrap: 0.7 }) : null;
  const f = i.facts;
  const { countdown, dateStr, timeStr, rng } = shared(i);
  const bg = await cinematicStadiumBg(i, {
    wash: T.wash, washOpacity: 0.44, spot: T.spot, smokeTint: T.smoke, smokeIntensity: 1.0, bottom: T.bottom,
  });
  const ICE = T.accent;

  const hud = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${ICE}">` +
      // targeting rings behind the player
      `<g opacity="0.32"><circle cx="540" cy="900" r="360" stroke-width="2"/><circle cx="540" cy="900" r="430" stroke-width="1" stroke-dasharray="3 14"/></g>` +
      Array.from({ length: 72 }, (_, k) => {
        const a = (k / 72) * Math.PI * 2;
        const r1 = 430, r2 = k % 6 === 0 ? 452 : 440;
        return `<line x1="${540 + Math.cos(a) * r1}" y1="${900 + Math.sin(a) * r1}" x2="${540 + Math.cos(a) * r2}" y2="${900 + Math.sin(a) * r2}" stroke-width="${k % 6 === 0 ? 3 : 1.5}" opacity="0.4"/>`;
      }).join('') +
      // corner brackets
      `<g stroke-width="4" opacity="0.9"><path d="M48 150 V48 H150"/><path d="M${V2_W - 48} 150 V48 H${V2_W - 150}"/>` +
      `<path d="M48 ${V2_H - 150} V${V2_H - 48} H150"/><path d="M${V2_W - 48} ${V2_H - 150} V${V2_H - 48} H${V2_W - 150}"/></g>` +
      `</svg>`
  );

  const hero = await placeLayer(lit, 1200, (w) => ({ left: Math.round((hasSecond(i) ? 470 : 540) - w / 2), top: 370 }), {
    mod: { brightness: 1.06, saturation: 0.96 }, fade: true, fadeStart: 93, maxW: hasSecond(i) ? 600 : 760,
  });
  const rim = await rimGlow(hero, T.rim);

  const panelBg = await sharp(bg).composite([{ input: hud }, { input: rim, blend: 'screen' }]).png().toBuffer();
  const PX = 60, PY = 1462, PW = 960, PH = 384;
  const glass = await glassPanel(panelBg, PX, PY, PW, PH, 40);

  const snow = await particles(rng, T.snow, 140, 0, 1900, 3);

  const BS = 156;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, BS, { ring: ICE, ringWidth: 4, fill: '#ffffff', fillOpacity: 0.92 }),
    discBadge(i.awayCrest, BS, { ring: ICE, ringWidth: 4, fill: '#ffffff', fillOpacity: 0.92 }),
  ]);
  const nameFit = (n: string) => fitFontSize(n.toUpperCase(), 230, 'Bebas', 36, 22, 3);
  const text1 = await textLayer(
    root([
      (() => { const k = compLineFit(f, 760, 'Bebas', 36, 20, 12); return text(centred(66, { fontFamily: 'Bebas', fontSize: `${k.size}px`, letterSpacing: '12px', color: ICE }), k.text); })(),
      text(centred(104, { fontFamily: 'Bebas', fontSize: '196px', letterSpacing: '30px', color: T.title, lineHeight: 1, textShadow: `0 0 50px ${T.glowA}` }), 'MATCHDAY'),
      (() => { const n = fitText(lines(i.playerName), 900, 'Montserrat', 38, 22, 16); return text(centred(312, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: `${n.size}px`, letterSpacing: '16px', color: '#ffffff' }), n.text); })(),
      ...(countdown
        ? [text(abs(PY - 66, PX, { fontFamily: 'Bebas', fontSize: '42px', letterSpacing: '6px', padding: '6px 22px 2px', background: ICE, color: T.onAccent }), countdown)]
        : []),
      text(centredAt(PY + 24 + BS + 14, PX + 36 - 32, BS + 64, { fontFamily: 'Bebas', fontSize: `${nameFit(f.homeTeam)}px`, letterSpacing: '3px', color: '#fff' }), lines(f.homeTeam)),
      text(centredAt(PY + 24 + BS + 14, PX + PW - 36 - BS - 32, BS + 64, { fontFamily: 'Bebas', fontSize: `${nameFit(f.awayTeam)}px`, letterSpacing: '3px', color: '#fff' }), lines(f.awayTeam)),
      text(centredAt(PY + 34, PX + 270, 420, { fontFamily: 'Bebas', fontSize: '92px', letterSpacing: '8px', color: '#ffffff', lineHeight: 1 }), dateStr),
      text(centredAt(PY + 128, PX + 270, 420, { fontFamily: 'Bebas', fontSize: '170px', letterSpacing: '6px', color: ICE, lineHeight: 1, textShadow: `0 0 40px ${T.glowB}` }), timeStr),
      ...(f.venue
        ? [(() => { const v = fitText(lines(f.venue), 600, 'Montserrat', 24, 14, 5); return text(centredAt(PY + 314, PX + 180, 600, { fontFamily: 'Montserrat', fontWeight: 400, fontSize: `${v.size}px`, letterSpacing: '5px', color: T.venue }), v.text); })()]
        : []),
    ])
  );

  const comp: sharp.OverlayOptions[] = [
    { input: hud },
    // Second real photo: an ice-duotone figure inside the HUD ring.
    ...(await (async () => {
      const g = await secondSheet(i, { height: 1000, cx: 840, top: 460, flip: true, opacity: 0.6, fadeStart: 74, maxW: 420, treatment: { kind: 'duotone', dark: T.bottom, light: T.accent } });
      return g ? [{ input: g }] : [];
    })()),
    { input: rim, blend: 'screen' },
    { input: contactShadow(540, 1560, 480) },
    { input: hero },
    { input: await frontHaze(T.smoke, 1.0, 1150, 1500), blend: 'screen' },
    { input: glass },
    { input: snow, blend: 'screen' },
    { input: text1 },
  ];
  if (cH) comp.push({ input: cH, left: PX + 36, top: PY + 24 });
  if (cA) comp.push({ input: cA, left: PX + PW - 36 - BS, top: PY + 24 });
  comp.push({ input: await grain((i.seed ?? 1) + 9, 0.08), blend: 'overlay' });
  void emptySheet;
  return sharp(bg).composite(comp).png().toBuffer();
}

// ═══════════════════════════ PRESTIGE ═══════════════════════════
export const PRESTIGE_BRAND: BrandOptions = { corner: 'top-right', size: 76, margin: 70 };

export async function renderPrestigeV3(i: RenderV2Input): Promise<Buffer> {
  const T = PRESTIGE_THEMES[(i.variant ?? 0) % PRESTIGE_THEMES.length];
  // Grade the real cutout toward the scene light (no pixels are redrawn).
  const lit = i.layers.cutAction ? await relightCutout(i.layers.cutAction, { tint: T.rim, amount: 0.38, wrap: 0.7 }) : null;
  const f = i.facts;
  const { pd, countdown, timeStr } = shared(i);
  const GOLD = T.gold;
  const GOLD_L = T.light;
  const bg = await cinematicStadiumBg(i, {
    wash: T.wash, washOpacity: 0.5, spot: T.spot, smokeTint: T.smoke, smokeIntensity: 0.85, bottom: T.bottom,
  });
  const SUR = lines(splitName(i.playerName).surname);

  const frame = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg" fill="none"><defs>` +
      `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GOLD_L}" stop-opacity="0.22"/><stop offset="100%" stop-color="${GOLD_L}" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${GOLD_L}"/><stop offset="50%" stop-color="${T.deep}"/><stop offset="100%" stop-color="${GOLD_L}"/></linearGradient></defs>` +
      `<polygon points="420,0 660,0 900,1500 180,1500" fill="url(#beam)"/>` +
      `<rect x="34" y="34" width="${V2_W - 68}" height="${V2_H - 68}" stroke="url(#gl)" stroke-width="3"/>` +
      `<rect x="52" y="52" width="${V2_W - 104}" height="${V2_H - 104}" stroke="${GOLD}" stroke-opacity="0.55" stroke-width="1"/>` +
      [[34, 34], [V2_W - 34, 34], [34, V2_H - 34], [V2_W - 34, V2_H - 34]]
        .map(([x, y]) => `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" transform="rotate(45 ${x} ${y})" fill="${GOLD}" stroke="${T.bottom}" stroke-width="3"/>`)
        .join('') +
      `<line x1="150" y1="156" x2="380" y2="156" stroke="${GOLD}" stroke-width="2"/><line x1="${V2_W - 380}" y1="156" x2="${V2_W - 150}" y2="156" stroke="${GOLD}" stroke-width="2"/>` +
      `<line x1="150" y1="1486" x2="${V2_W - 150}" y2="1486" stroke="${GOLD}" stroke-width="2" opacity="0.8"/>` +
      `</svg>`
  );

  const wmSize = fitFontSize(SUR, 1000, 'Cinzel', 190, 70);
  const watermark = await textLayer(
    root([
      div(
        { position: 'absolute', left: '-390px', top: '760px', width: '1000px', height: '260px', justifyContent: 'center', alignItems: 'center', transform: 'rotate(-90deg)' },
        text({ fontFamily: 'Cinzel', fontWeight: 700, fontSize: `${wmSize}px`, color: GOLD, opacity: 0.2, letterSpacing: '10px', lineHeight: 1 }, SUR)
      ),
    ])
  );

  const hero = await placeLayer(lit, 1130, (w) => ({ left: Math.round(560 - w / 2), top: 340 }), {
    mod: { brightness: 1.0, saturation: 1.04 }, fade: true, fadeStart: 92, maxW: 640,
  });
  const rim = await rimGlow(hero, T.rim);

  const BS = 150;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, BS, { ring: GOLD, ringWidth: 4, fill: T.badge, fillOpacity: 0.92 }),
    discBadge(i.awayCrest, BS, { ring: GOLD, ringWidth: 4, fill: T.badge, fillOpacity: 0.92 }),
  ]);
  const longDate = pd ? pd.long : i.facts.date;
  const nameFit = (n: string) => fitFontSize(n.toUpperCase(), 330, 'Cinzel', 26, 16, 2);
  const crestY = 1514;
  const t = await textLayer(
    root([
      (() => { const k = compLineFit(f, 700, 'Montserrat', 22, 13, 9); return text(centred(84, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: `${k.size}px`, letterSpacing: '9px', color: GOLD_L }), k.text); })(),
      text(centred(118, { fontFamily: 'Cinzel', fontWeight: 700, fontSize: '84px', letterSpacing: '26px', color: GOLD_L, lineHeight: 1 }), 'MATCHDAY'),
      (() => { const n = fitText(lines(i.playerName), 860, 'Cinzel', 36, 20, 14); return text(centred(224, { fontFamily: 'Cinzel', fontWeight: 700, fontSize: `${n.size}px`, letterSpacing: '14px', color: '#ffffff' }), n.text); })(),
      ...(i.squadNumber ? [text(centred(278, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '22px', letterSpacing: '10px', color: GOLD }), `No. ${i.squadNumber}`)] : []),
      text(centredAt(crestY + BS + 12, 170 - 90, BS + 180, { fontFamily: 'Cinzel', fontWeight: 700, fontSize: `${nameFit(f.homeTeam)}px`, letterSpacing: '2px', color: '#fff' }), lines(f.homeTeam)),
      text(centredAt(crestY + BS + 12, V2_W - 170 - BS - 90, BS + 180, { fontFamily: 'Cinzel', fontWeight: 700, fontSize: `${nameFit(f.awayTeam)}px`, letterSpacing: '2px', color: '#fff' }), lines(f.awayTeam)),
      text(centred(crestY + 46, { fontFamily: 'Cinzel', fontWeight: 700, fontSize: '40px', color: GOLD, letterSpacing: '4px' }), 'VS'),
      text(centredAt(crestY + 100, 270, 540, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '26px', letterSpacing: '8px', color: GOLD_L }), `KICK-OFF  ·  ${timeStr}`),
      text(centred(1728, { fontFamily: 'Cinzel', fontWeight: 700, fontSize: `${fitFontSize(longDate, 820, 'Cinzel', 56, 30, 2)}px`, color: GOLD_L, letterSpacing: '2px' }), longDate),
      ...(f.venue ? (() => { const v = fitText(lines(f.venue), 820, 'Montserrat', 24, 14, 8); return [text(centred(1798, { fontFamily: 'Montserrat', fontWeight: 400, fontSize: `${v.size}px`, letterSpacing: '8px', color: T.venue }), v.text)]; })() : []),
      ...(countdown ? [text(centred(1834, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '22px', letterSpacing: '10px', color: GOLD }), `—  ${countdown}  —`)] : []),
    ])
  );

  const comp: sharp.OverlayOptions[] = [
    { input: frame },
    // Second real photo: a gold duotone portrait receding into the darkness.
    ...(await (async () => {
      const g = await secondSheet(i, { height: 1240, cx: 290, top: 300, flip: true, opacity: 0.45, fadeStart: 66, maxW: 480, treatment: { kind: 'duotone', dark: '#000000', light: T.gold } });
      return g ? [{ input: g }] : [];
    })()),
    { input: watermark },
    { input: rim },
    { input: contactShadow(560, 1470, 460) },
    { input: hero },
    { input: await frontHaze(T.smoke, 0.7, 1250, 1500), blend: 'screen' },
    { input: t },
  ];
  if (cH) comp.push({ input: cH, left: 170, top: crestY - 0 });
  if (cA) comp.push({ input: cA, left: V2_W - 170 - BS, top: crestY - 0 });
  comp.push({ input: await grain((i.seed ?? 1) + 13, 0.09), blend: 'overlay' });
  return sharp(bg).composite(comp).png().toBuffer();
}

// ═══════════════════════════ ELECTRIC ═══════════════════════════
export const ELECTRIC_BRAND: BrandOptions = { corner: 'top-right', size: 84, margin: 40 };

export async function renderElectricV3(i: RenderV2Input): Promise<Buffer> {
  const T = ELECTRIC_THEMES[(i.variant ?? 0) % ELECTRIC_THEMES.length];
  // Grade the real cutout toward the scene light (no pixels are redrawn).
  const lit = i.layers.cutAction ? await relightCutout(i.layers.cutAction, { tint: T.cy, amount: 0.38, wrap: 0.7 }) : null;
  const f = i.facts;
  const { countdown, dateStr, timeStr, rng } = shared(i);
  const CY = T.cy;
  const MG = T.mg;
  const GR = T.gr;
  const bg = await cinematicStadiumBg(i, {
    wash: T.wash, washOpacity: 0.46, spot: T.spot, smokeTint: T.smoke, smokeIntensity: 1.1, bottom: T.bottom,
  });

  // neon frame + light streaks + scanlines
  const streakLines = Array.from({ length: 9 }, () => {
    const y = 160 + rng() * 1400;
    const x = rng() * 500;
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(300 + rng() * 600).toFixed(0)}" height="${(2 + rng() * 3).toFixed(0)}" fill="${rng() > 0.5 ? CY : MG}" opacity="${(0.25 + rng() * 0.4).toFixed(2)}"/>`;
  }).join('');
  const neon = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg" fill="none">` +
      `<rect x="120" y="420" width="760" height="1130" stroke="${GR}" stroke-width="5"/>` +
      `<rect x="150" y="450" width="760" height="1130" stroke="${MG}" stroke-width="2" opacity="0.7"/>` +
      streakLines + `</svg>`
  );
  const neonGlow = await sharp(neon).blur(10).png().toBuffer();
  const scan = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="s" width="4" height="4" patternUnits="userSpaceOnUse">` +
      `<rect width="4" height="2" fill="#000" opacity="0.16"/></pattern></defs><rect width="${V2_W}" height="${V2_H}" fill="url(#s)"/></svg>`
  );

  // RGB-split hero
  const H = 1300;
  const cx = 610, top = 400;
  const pos = (dx: number, dy: number) => (w: number) => ({ left: Math.round(cx - w / 2) + dx, top: top + dy });
  const cut = i.layers.cutAction;
  // all three copies share the same box so the RGB split stays aligned
  const EW = 700;
  const cyanCopy = cut ? await placeLayer(await tintCutout(cut, CY), H, pos(-15, -3), { maxW: EW }) : await emptySheet();
  const magCopy = cut ? await placeLayer(await tintCutout(cut, MG), H, pos(15, 3), { maxW: EW }) : await emptySheet();
  const hero = await placeLayer(lit, H, pos(0, 0), { mod: { brightness: 1.05, saturation: 1.14 }, fade: true, fadeStart: 94, maxW: EW });

  // glitch title (3 offset layers)
  const titleStyle = (extra: Sty) => ({ fontFamily: 'Anton', fontSize: '206px', letterSpacing: '8px', lineHeight: 1, ...extra });
  const titleCy = await textLayer(root([text(centred(110, titleStyle({ color: CY })), 'MATCHDAY')]));
  const titleMg = await textLayer(root([text(centred(110, titleStyle({ color: MG })), 'MATCHDAY')]));
  const titleW = await textLayer(
    root([
      (() => { const k = compLineFit(f, 740, 'SpaceMono', 26, 14, 6); return text(centred(68, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: `${k.size}px`, letterSpacing: '6px', color: GR }), `// ${k.text}`); })(),
      text(centred(110, titleStyle({ color: '#ffffff' })), 'MATCHDAY'),
      (() => { const n = fitText(lines(i.playerName) + (i.squadNumber ? `  #${i.squadNumber}` : ''), 940, 'SpaceMono', 40, 20, 8); return text(centred(330, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: `${n.size}px`, letterSpacing: '8px', color: '#ffffff' }), n.text); })(),
    ])
  );

  // terminal data panel
  const PX = 56, PY = 1560, PW = 700, PH = 300;
  const panel = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg" fill="none">` +
      `<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" fill="${T.panel}" fill-opacity="0.82"/>` +
      `<g stroke="${GR}" stroke-width="4"><path d="M${PX} ${PY + 40} V${PY} H${PX + 40}"/><path d="M${PX + PW} ${PY + 40} V${PY} H${PX + PW - 40}"/>` +
      `<path d="M${PX} ${PY + PH - 40} V${PY + PH} H${PX + 40}"/><path d="M${PX + PW} ${PY + PH - 40} V${PY + PH} H${PX + PW - 40}"/></g></svg>`
  );
  const row = (k: number, label: string, value: string) => {
    const s = fitFontSize(value.toUpperCase(), 470, 'SpaceMono', 34, 18, 1);
    return [
      text(abs(PY + 24 + k * 54, PX + 28, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '30px', color: GR }), label),
      text(abs(PY + 24 + k * 54 + (34 - s) / 2, PX + 190, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: `${s}px`, color: '#ffffff', letterSpacing: '1px', width: '490px' }), value.toUpperCase()),
    ];
  };
  const data = await textLayer(
    root([
      ...row(0, 'HOME', f.homeTeam),
      ...row(1, 'AWAY', f.awayTeam),
      ...row(2, 'DATE', dateStr),
      ...row(3, 'KO', timeStr),
      ...row(4, 'VENUE', f.venue ?? 'TBC'),
      ...(countdown ? [text(abs(PY - 58, PX, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '30px', padding: '8px 20px', background: MG, color: '#ffffff', letterSpacing: '4px' }), `> ${countdown}`)] : []),
    ])
  );

  const BS = 150;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, BS, { ring: CY, ringWidth: 4, fill: T.badge, fillOpacity: 0.92 }),
    discBadge(i.awayCrest, BS, { ring: MG, ringWidth: 4, fill: T.badge, fillOpacity: 0.92 }),
  ]);
  const comp: sharp.OverlayOptions[] = [
    { input: neonGlow, blend: 'screen' },
    { input: neon },
    // Second real photo: a neon hologram (duotone, screen-blended) behind the hero.
    ...(await (async () => {
      const g = await secondSheet(i, { height: 1180, cx: 860, top: 380, flip: true, opacity: 1, fadeStart: 80, maxW: 440, treatment: { kind: 'duotone', dark: '#000000', light: T.cy } });
      return g ? [{ input: g, blend: 'screen' as const }] : [];
    })()),
    { input: titleCy, left: -7, top: 0, blend: 'screen' },
    { input: titleMg, left: 7, top: 0, blend: 'screen' },
    { input: cyanCopy, blend: 'screen' },
    { input: magCopy, blend: 'screen' },
    { input: hero },
    { input: titleW },
    { input: panel },
    { input: data },
    { input: scan },
  ];
  if (cH) comp.push({ input: cH, left: 800, top: 1510 });
  if (cA) comp.push({ input: cA, left: 800, top: 1700 });
  comp.push({ input: await grain((i.seed ?? 1) + 17, 0.1), blend: 'overlay' });
  return sharp(bg).composite(comp).png().toBuffer();
}
