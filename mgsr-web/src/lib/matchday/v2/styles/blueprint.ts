/**
 * BLUEPRINT — the tactics board.
 *
 * A drafting grid with pitch markings, dimension lines and tactical X/O marks.
 * The player is the REAL photo, duotoned into the ink colour with a glowing
 * line-art overlay traced from the photo's own edges (an image filter — the
 * face is never redrawn). Fixture data is set as a technical spec sheet.
 *
 * Variants: 0 Navy blueprint · 1 Chalkboard · 2 Night pitch
 */
import sharp from 'sharp';
import { type RenderV2Input, V2_W, V2_H, textLayer, text, onCanvas, bottomFade } from '../render';
import { boxScale, isCroppedBottom } from '../kit/figure';
import { hasSecond, secondSheet } from '../kit/second';
import { abs, centred, root, sheet, flatten } from '../kit/compose';
import { grain } from '../kit/texture';
import { squareBadge } from '../kit/badges';
import { fitFontSize, splitName, fitText, compLineFit } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import { makeRng } from '../kit/prng';
import type { BrandOptions } from '../kit/brand';

export const BLUEPRINT_BRAND: BrandOptions = { corner: 'top-right', size: 80, margin: 40 };

const THEMES = [
  { bg: '#0b2a5b', bg2: '#06183a', line: '#9fd4ff', ink: '#cfe9ff', accent: '#ffd23a', duo: '#bfe3ff' },
  { bg: '#1f2a24', bg2: '#111814', line: '#e9efe6', ink: '#f2f5ef', accent: '#ffe066', duo: '#e8ece4' },
  { bg: '#04140c', bg2: '#010805', line: '#38ff9c', ink: '#c8ffe2', accent: '#38ff9c', duo: '#b8ffd8' },
];

/** Duotone photo + traced edge glow of a cutout, same size as the cutout. */
async function blueprintFigure(cutout: Buffer, duo: string, line: string): Promise<Buffer> {
  const meta = await sharp(cutout).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const alpha = await sharp(cutout).ensureAlpha().extractChannel(3).toBuffer();
  // Duotone: luminance → tinted, alpha preserved, slightly transparent.
  const tone = await sharp(cutout).flatten({ background: '#000' }).greyscale().clahe({ width: 40, height: 40, maxSlope: 4 }).tint(duo).removeAlpha().toBuffer();
  const duotone = await sharp(tone).joinChannel(await sharp(alpha).linear(0.85, 0).toBuffer()).png().toBuffer();
  // Edges: Laplacian of the photo (incl. the silhouette boundary).
  const edges = await sharp(cutout)
    .flatten({ background: '#000' })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] })
    .linear(2.6, -18)
    .toColourspace('b-w')
    .toBuffer();
  const lineRgb = await sharp({ create: { width: w, height: h, channels: 3, background: line } }).png().toBuffer();
  const lines = await sharp(lineRgb).joinChannel(edges).png().toBuffer();
  const glow = await sharp(lines).blur(4).png().toBuffer();
  return sharp(duotone).composite([{ input: glow, blend: 'screen' }, { input: lines, blend: 'screen' }]).png().toBuffer();
}

export async function renderBlueprint(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const T = THEMES[(i.variant ?? 0) % THEMES.length];
  const rng = makeRng((i.seed ?? 1) + 33);
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);
  const { surname } = splitName(i.playerName);

  // ── drafting board ───────────────────────────────────────────────────────
  const minor = Array.from({ length: Math.ceil(V2_W / 40) + 1 }, (_, k) => `<line x1="${k * 40}" y1="0" x2="${k * 40}" y2="${V2_H}"/>`).join('') +
    Array.from({ length: Math.ceil(V2_H / 40) + 1 }, (_, k) => `<line x1="0" y1="${k * 40}" x2="${V2_W}" y2="${k * 40}"/>`).join('');
  const major = Array.from({ length: 7 }, (_, k) => `<line x1="${k * 200}" y1="0" x2="${k * 200}" y2="${V2_H}"/>`).join('') +
    Array.from({ length: 11 }, (_, k) => `<line x1="0" y1="${k * 200}" x2="${V2_W}" y2="${k * 200}"/>`).join('');
  // pitch: half-way line, centre circle and box, drawn as the board's lower half
  const pitch =
    `<g fill="none" stroke="${T.line}" stroke-width="3" opacity="0.55">` +
    `<rect x="60" y="1060" width="${V2_W - 120}" height="780"/>` +
    `<line x1="60" y1="1450" x2="${V2_W - 60}" y2="1450"/><circle cx="540" cy="1450" r="150"/><circle cx="540" cy="1450" r="6" fill="${T.line}"/>` +
    `<rect x="300" y="1060" width="480" height="170"/><rect x="420" y="1060" width="240" height="70"/>` +
    `<path d="M440 1230 A 120 120 0 0 0 640 1230"/></g>`;
  // tactical marks
  const marks: string[] = [];
  for (let k = 0; k < 5; k++) {
    const x = 120 + rng() * 840;
    const y = 1100 + rng() * 680;
    marks.push(
      k % 2
        ? `<g stroke="${T.ink}" stroke-width="5" opacity="0.7"><line x1="${x - 16}" y1="${y - 16}" x2="${x + 16}" y2="${y + 16}"/><line x1="${x + 16}" y1="${y - 16}" x2="${x - 16}" y2="${y + 16}"/></g>`
        : `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="${T.accent}" stroke-width="5" opacity="0.8"/>`
    );
  }
  const arrow =
    `<path d="M 300 1700 C 160 1450, 420 1300, 560 1180" fill="none" stroke="${T.accent}" stroke-width="5" stroke-dasharray="18 12"/>` +
    `<polygon points="560,1180 532,1182 548,1206" fill="${T.accent}"/>`;
  // dimension line along the left edge
  const dims =
    `<g stroke="${T.line}" stroke-width="2" opacity="0.8"><line x1="46" y1="330" x2="46" y2="1030"/><line x1="36" y1="330" x2="56" y2="330"/><line x1="36" y1="1030" x2="56" y2="1030"/></g>`;
  const board = sheet(
    `<rect width="${V2_W}" height="${V2_H}" fill="url(#bg)"/>` +
      `<g stroke="${T.line}" stroke-width="1" opacity="0.10">${minor}</g><g stroke="${T.line}" stroke-width="2" opacity="0.18">${major}</g>` +
      pitch + marks.join('') + arrow + dims +
      `<rect x="24" y="24" width="${V2_W - 48}" height="${V2_H - 48}" fill="none" stroke="${T.line}" stroke-width="3" opacity="0.7"/>`,
    `<radialGradient id="bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="${T.bg}"/><stop offset="1" stop-color="${T.bg2}"/></radialGradient>`
  );
  const bg = await sharp(board).png().toBuffer();

  // ── figure ───────────────────────────────────────────────────────────────
  let figSheet: Buffer = await flatten([]);
  if (i.layers.cutAction) {
    const two = hasSecond(i);
    const m0 = await sharp(i.layers.cutAction).metadata();
    const fitH = Math.round((m0.height ?? 1) * boxScale(m0.width ?? 1, m0.height ?? 1, 1180, two ? 600 : 720));
    const scaled = await sharp(i.layers.cutAction).resize({ height: fitH }).png().toBuffer();
    let fig = await blueprintFigure(scaled, T.duo, T.line);
    const croppedHero = await isCroppedBottom(scaled);
    if (croppedHero) fig = await bottomFade(fig, 62);
    const fw = (await sharp(fig).metadata()).width ?? 1;
    figSheet = await onCanvas(fig, fw, fitH, Math.round((two ? 660 : 600) - fw / 2), croppedHero ? 330 : 330 + (1180 - fitH));
  }

  // ── spec sheet text ──────────────────────────────────────────────────────
  const mono = (top: number, left: number, s: string, size = 26, color = T.ink) =>
    text(abs(top, left, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: `${size}px`, letterSpacing: '2px', color }), s);
  const SUR = surname.toUpperCase();
  // One fact per row so long club names never wrap into the next label.
  const spec: Array<[string, string]> = [
    ['HOME', f.homeTeam],
    ['AWAY', f.awayTeam],
    ['DATE', pd ? pd.short : f.date],
    ['KICK-OFF', f.time ?? 'TBC'],
    ['VENUE', f.venue ?? 'TBC'],
  ];
  const t = await textLayer(
    root([
      (() => { const k = compLineFit(f, 840, 'SpaceMono', 22, 12, 2); return mono(58, 60, `// ${k.text}`, k.size, T.line); })(),
      text(abs(96, 52, { fontFamily: 'Bebas', fontSize: '196px', letterSpacing: '10px', color: T.ink, lineHeight: 1 }), 'MATCHDAY'),
      mono(292, 62, `TACTICAL BRIEF  ·  PLAYER: ${SUR}${i.squadNumber ? `  #${i.squadNumber}` : ''}`, 24, T.accent),
      text(abs(660, -290, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '20px', letterSpacing: '6px', color: T.line, transform: 'rotate(-90deg)', width: '700px', justifyContent: 'center' }), 'ELEVATION  ·  FRONT VIEW'),
      ...spec.flatMap(([k, v], n) => [
        mono(1442 + n * 72, 640, k, 18, T.line),
        (() => { const t2 = fitText(v.toUpperCase(), 370, 'SpaceMono', 26, 13, 1); return text(abs(1464 + n * 72, 640, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: `${t2.size}px`, color: T.ink }), t2.text); })(),
      ]),
      ...(countdown ? [mono(1380, 640, `> ${countdown}`, 26, T.accent)] : []),
      mono(1860, 60, `REF ${f.date.replace(/\//g, '.')}  ·  ${f.homeTeam.toUpperCase()}`, 18, T.line),
    ])
  );
  // spec box
  const box = sheet(`<rect x="616" y="1424" width="404" height="380" fill="${T.bg2}" fill-opacity="0.82" stroke="${T.line}" stroke-width="2"/>`);

  const BS = 120;
  const [cH, cA] = await Promise.all([
    squareBadge(i.homeCrest, BS, { fill: '#ffffff', stroke: T.line, strokeWidth: 3, radius: 4 }),
    squareBadge(i.awayCrest, BS, { fill: '#ffffff', stroke: T.line, strokeWidth: 3, radius: 4 }),
  ]);
  const vs = await textLayer(root([text(abs(1700, 60 + BS + 14, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '34px', color: T.accent }), 'VS')]));

  // Second real photo: a second elevation drawing, "VIEW B".
  let viewB: Buffer | null = null;
  if (hasSecond(i)) {
    const m2 = await sharp(i.layers.hero!).metadata();
    const h2 = Math.round((m2.height ?? 1) * boxScale(m2.width ?? 1, m2.height ?? 1, 820, 380));
    const s2 = await sharp(i.layers.hero!).resize({ height: h2 }).flop().png().toBuffer();
    const f2 = await blueprintFigure(s2, T.duo, T.line);
    let f2o = await sharp(f2).ensureAlpha().linear([1, 1, 1, 0.6], [0, 0, 0, 0]).png().toBuffer();
    const cropped2 = await isCroppedBottom(s2);
    if (cropped2) f2o = await bottomFade(f2o, 62);
    const w2 = (await sharp(f2o).metadata()).width ?? 1;
    const label = await textLayer(root([text(abs(1395, 120, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '20px', letterSpacing: '4px', color: T.line }), 'VIEW B')]));
    viewB = await flatten([{ input: await onCanvas(f2o, w2, h2, Math.round(270 - w2 / 2), cropped2 ? 560 : 560 + (820 - h2)) }, { input: label }]);
  }
  const overlays: sharp.OverlayOptions[] = [...(viewB ? [{ input: viewB }] : []), { input: figSheet }, { input: box }, { input: t }, { input: vs }];
  if (cH) overlays.push({ input: cH, left: 60, top: 1660 });
  if (cA) overlays.push({ input: cA, left: 60 + BS + 86, top: 1660 });
  overlays.push({ input: await grain((i.seed ?? 1) + 41, 0.07), blend: 'overlay' });
  return sharp(bg).composite(overlays).png().toBuffer();
}
