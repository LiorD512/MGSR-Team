/**
 * STREET — a fly-poster pasted on a wall.
 *
 * A wall texture (concrete / brick / dark neon-lit wall), a slightly rotated
 * paper sheet with torn edges and tape, the real player on it, heavy stencil
 * type on a colour block, crest "stickers" and a torn date label.
 *
 * Variants: 0 Concrete · 1 Brick · 2 Neon night
 */
import sharp from 'sharp';
import { type RenderV2Input, V2_W, V2_H, placeLayer, textLayer, text, crestPng } from '../render';
import { abs, root, sheet, flatten, rotateCanvas } from '../kit/compose';
import { grain } from '../kit/texture';
import { mix, matchPalette, readableOn } from '../kit/palette';
import { fitFontSize, splitName, wrapSurname } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import { makeRng } from '../kit/prng';
import type { BrandOptions } from '../kit/brand';

export const STREET_BRAND: BrandOptions = { corner: 'bottom-right', size: 80, margin: 36 };

const THEMES = [
  { wall: '#8d8b86', wall2: '#5d5c58', paper: '#f1ece2', ink: '#111111', block: '#ffd400', tape: '#e8dcb8', glow: '' },
  { wall: '#8a3a2a', wall2: '#5a2218', paper: '#f4f1ea', ink: '#111111', block: '#ffffff', tape: '#e8dcb8', glow: '' },
  { wall: '#17151c', wall2: '#09080c', paper: '#151418', ink: '#ffffff', block: '#ff2bd6', tape: '#5a5a66', glow: '#2bf4ff' },
];

/** Wall texture: noise + stains (concrete), brick courses, or dark wall + neon glow. */
async function wall(v: number, T: (typeof THEMES)[number], rng: () => number): Promise<Buffer> {
  let inner = `<rect width="${V2_W}" height="${V2_H}" fill="url(#w)"/>`;
  if (v === 1) {
    const rows: string[] = [];
    for (let y = 0, r = 0; y < V2_H; y += 64, r++) {
      for (let x = -(r % 2) * 70; x < V2_W; x += 140) {
        const shade = mix(T.wall, rng() > 0.5 ? '#000000' : '#ffffff', rng() * 0.18);
        rows.push(`<rect x="${x + 3}" y="${y + 3}" width="134" height="58" fill="${shade}"/>`);
      }
    }
    inner += `<rect width="${V2_W}" height="${V2_H}" fill="#3a1a12"/>${rows.join('')}`;
  } else {
    for (let k = 0; k < 40; k++) {
      inner += `<circle cx="${(rng() * V2_W).toFixed(0)}" cy="${(rng() * V2_H).toFixed(0)}" r="${(40 + rng() * 220).toFixed(0)}" fill="${rng() > 0.5 ? '#000' : '#fff'}" opacity="${(0.03 + rng() * 0.06).toFixed(2)}"/>`;
    }
  }
  const defs = `<radialGradient id="w" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="${T.wall}"/><stop offset="1" stop-color="${T.wall2}"/></radialGradient>`;
  let base = await sharp(sheet(inner, defs)).blur(v === 1 ? 0.6 : 6).png().toBuffer();
  if (v === 2) {
    const neon = await sharp(sheet(`<circle cx="160" cy="260" r="360" fill="${T.block}" opacity="0.55"/><circle cx="960" cy="1600" r="420" fill="${T.glow}" opacity="0.45"/>`)).blur(140).png().toBuffer();
    base = await sharp(base).composite([{ input: neon, blend: 'screen' }]).png().toBuffer();
  }
  return sharp(base).composite([{ input: await grain(Math.floor(rng() * 1e6), 0.22), blend: 'overlay' }]).png().toBuffer();
}

/** Jagged "torn paper" polygon for a rect. */
function tornRect(rng: () => number, x: number, y: number, w: number, h: number, jag = 12): string {
  const pts: string[] = [];
  const step = 26;
  for (let px = x; px <= x + w; px += step) pts.push(`${px},${y + (rng() - 0.5) * jag}`);
  for (let py = y; py <= y + h; py += step) pts.push(`${x + w + (rng() - 0.5) * jag},${py}`);
  for (let px = x + w; px >= x; px -= step) pts.push(`${px},${y + h + (rng() - 0.5) * jag}`);
  for (let py = y + h; py >= y; py -= step) pts.push(`${x + (rng() - 0.5) * jag},${py}`);
  return pts.join(' ');
}

/** A crest on a round white die-cut sticker with a soft shadow. */
async function sticker(crest: Buffer | null | undefined, size: number, deg: number): Promise<Buffer | null> {
  if (!crest) return null;
  const c = await crestPng(crest, Math.round(size * 0.74));
  if (!c) return null;
  const pad = 24;
  const box = size + pad * 2;
  const base = Buffer.from(
    `<svg width="${box}" height="${box}" xmlns="http://www.w3.org/2000/svg"><circle cx="${box / 2 + 4}" cy="${box / 2 + 8}" r="${size / 2}" fill="#000" opacity="0.35"/></svg>`
  );
  const shadow = await sharp(base).blur(6).png().toBuffer();
  const disc = Buffer.from(
    `<svg width="${box}" height="${box}" xmlns="http://www.w3.org/2000/svg"><circle cx="${box / 2}" cy="${box / 2}" r="${size / 2}" fill="#ffffff"/></svg>`
  );
  const out = await sharp(shadow).composite([{ input: disc }, { input: c, gravity: 'centre' }]).png().toBuffer();
  return sharp(out).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

export async function renderStreet(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const v = (i.variant ?? 0) % THEMES.length;
  const T = THEMES[v];
  const rng = makeRng((i.seed ?? 1) + 77);
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);
  const { surname } = splitName(i.playerName);
  const playerCrest = f.playerSide === 'home' ? i.homeCrest : i.awayCrest;
  const oppCrest = f.playerSide === 'home' ? i.awayCrest : i.homeCrest;
  const p = i.palette ?? (await matchPalette(playerCrest, oppCrest));
  const block = v === 1 ? p.home : T.block;

  const bg = await wall(v, T, rng);

  // ── the pasted sheet (built flat, then rotated as one piece) ─────────────
  const SX = 70, SY = 120, SW = 940, SH = 1560;
  /** y (relative to the sheet) where the surname block starts — below the ball. */
  const TYPE_Y = 1268;
  const paperSvg = sheet(
    `<polygon points="${tornRect(rng, SX + 10, SY + 14, SW, SH)}" fill="#000" opacity="0.4"/>` +
      `<polygon points="${tornRect(rng, SX, SY, SW, SH)}" fill="${T.paper}"/>` +
      // speed stripes in the colour block
      `<g opacity="0.9"><rect x="${SX}" y="${SY + TYPE_Y - 44}" width="${SW}" height="16" fill="${block}"/><rect x="${SX}" y="${SY + TYPE_Y - 16}" width="${SW}" height="6" fill="${block}"/></g>`
  );
  const paper = await sharp(paperSvg).png().toBuffer();
  const paperBlur = await sharp(sheet(`<polygon points="${tornRect(rng, SX + 10, SY + 14, SW, SH)}" fill="#000" opacity="0.45"/>`)).blur(14).png().toBuffer();

  const hero = await placeLayer(i.layers.cutAction, 1050, (w) => ({ left: Math.round(560 - w / 2), top: SY + 160 }), {
    mod: { brightness: 1.02, saturation: 1.12 },
  });
  // clip the hero to the sheet so nothing hangs off the paper
  const clip = sheet(`<polygon points="${tornRect(rng, SX, SY, SW, SH, 8)}" fill="#fff"/>`);
  const heroOnSheet = await sharp(hero).composite([{ input: clip, blend: 'dest-in' }]).png().toBuffer();

  const SUR = surname.toUpperCase();
  const sLines = wrapSurname(SUR, 12);
  const sLongest = sLines.reduce((m, l) => (l.length > m.length ? l : m), '');
  const supS = fitFontSize(sLongest, 840, 'ArchivoBlack', sLines.length > 1 ? 96 : 130, 40, 2);
  const supH = Math.round(supS * 0.98) * sLines.length;
  const onBlock = readableOn(block);
  const typeLayer = await textLayer(
    root([
      text(abs(SY + 36, SX + 40, { fontFamily: 'ArchivoBlack', fontSize: '150px', lineHeight: 0.92, color: T.ink, letterSpacing: '-2px' }), 'MATCH'),
      text(abs(SY + 176, SX + 40, { fontFamily: 'ArchivoBlack', fontSize: '150px', lineHeight: 0.92, color: onBlock, background: block, padding: '0px 20px 6px' }), 'DAY'),
      ...sLines.map((l, k) =>
        text(abs(SY + TYPE_Y + k * Math.round(supS * 0.98), SX + 40, { fontFamily: 'ArchivoBlack', fontSize: `${supS}px`, lineHeight: 1, color: T.ink, letterSpacing: '-2px' }), l)
      ),
      text(abs(SY + TYPE_Y + supH + 4, SX + 46, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '28px', letterSpacing: '3px', color: T.ink }), `${f.homeTeam.toUpperCase()} vs ${f.awayTeam.toUpperCase()}`),
      ...(f.venue ? [text(abs(SY + TYPE_Y + supH + 44, SX + 46, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '22px', letterSpacing: '3px', color: T.ink, opacity: 0.7 }), f.venue.toUpperCase())] : []),
      ...(i.squadNumber ? [text(abs(SY + 60, SX + SW - 230, { fontFamily: 'ArchivoBlack', fontSize: '130px', color: T.ink, opacity: 0.12 }), `#${i.squadNumber}`)] : []),
    ])
  );

  const tapes = sheet(
    [
      [SX - 30, SY - 20, -28],
      [SX + SW - 120, SY - 26, 24],
      [SX - 40, SY + SH - 40, 20],
      [SX + SW - 110, SY + SH - 34, -22],
    ]
      .map(([x, y, d]) => `<rect x="${x}" y="${y}" width="170" height="54" fill="${T.tape}" opacity="0.78" transform="rotate(${d} ${x + 85} ${y + 27})"/>`)
      .join('')
  );

  const sheetLayer = await rotateCanvas(await flatten([{ input: paperBlur }, { input: paper }, { input: heroOnSheet }, { input: typeLayer }, { input: tapes }]), -2.2);

  // ── torn date label + stickers (on top, un-rotated for variety) ──────────
  const dateStr = `${pd ? pd.short : f.date}  ·  ${f.time ?? 'TBC'}`;
  const labelW = Math.min(820, Math.round(dateStr.length * 34 + 80));
  const labelX = 120, labelY = 1700;
  const label = await sharp(sheet(`<polygon points="${tornRect(rng, labelX, labelY, labelW, 110, 10)}" fill="${block}"/>`))
    .png()
    .toBuffer();
  const labelText = await textLayer(
    root([
      text(abs(labelY + 22, labelX + 34, { fontFamily: 'ArchivoBlack', fontSize: '58px', color: onBlock, letterSpacing: '1px' }), dateStr),
      ...(countdown ? [text(abs(labelY - 54, labelX + 4, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '30px', padding: '6px 14px', background: T.ink, color: T.paper }), countdown)] : []),
    ])
  );
  const labelLayer = await rotateCanvas(await flatten([{ input: label }, { input: labelText }]), 3);

  const [sH, sA] = await Promise.all([sticker(i.homeCrest, 180, -12), sticker(i.awayCrest, 180, 9)]);
  // The two crest stickers overlap diagonally — the matchup reads without a VS sticker.

  const overlays: sharp.OverlayOptions[] = [{ input: sheetLayer }, { input: labelLayer }];
  if (sH) overlays.push({ input: sH, left: 790, top: 1010 });
  if (sA) overlays.push({ input: sA, left: 836, top: 1180 });
  overlays.push({ input: await grain((i.seed ?? 1) + 79, 0.08), blend: 'overlay' });
  return sharp(bg).composite(overlays).png().toBuffer();
}
