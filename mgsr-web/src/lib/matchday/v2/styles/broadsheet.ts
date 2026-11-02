/**
 * BROADSHEET — the newspaper front page.
 *
 * Warm newsprint, a serif masthead, a surname headline and the player as a
 * rotated-screen HALFTONE print over a slightly mis-registered flat spot
 * colour (the club's own colour). A red-stamp "MATCHDAY", a boxed fixture
 * column in monospace and a crest footer. Headline copy is strictly factual
 * (the surname + the two clubs) — nothing editorial is invented.
 */
import sharp from 'sharp';
import { boxScale, isCroppedBottom } from '../kit/figure';
import {
  onCanvas,
  type RenderV2Input,
  V2_W,
  V2_H,
  placeLayer,
  bottomFade,
  textLayer,
  div,
  text,
} from '../render';
import { hasSecond, secondSheet } from '../kit/second';
import { matchPalette, hexToRgb, luminance, mix } from '../kit/palette';
import { paper, halftone, grain } from '../kit/texture';
import { squareBadge } from '../kit/badges';
import { fitFontSize, splitName, wrapSurname } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import type { BrandOptions } from '../kit/brand';

export const BROADSHEET_BRAND: BrandOptions = { corner: 'bottom-right', size: 84, margin: 40 };

const INK = '#1a1713';

/** A spot colour that reads as ink-on-paper: the club colour if it's rich and dark enough. */
function spotColour(club: string): string {
  const c = hexToRgb(club);
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  return luminance(c) < 0.5 && chroma > 70 ? club : '#c8281e';
}

export async function renderBroadsheet(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const playerCrest = f.playerSide === 'home' ? i.homeCrest : i.awayCrest;
  const oppCrest = f.playerSide === 'home' ? i.awayCrest : i.homeCrest;
  const p = i.palette ?? (await matchPalette(playerCrest, oppCrest));
  const seed = i.seed ?? 1;
  // Remix variants: 0 Club ink · 1 Red ink (classic) · 2 Late edition (salmon paper, black-only print)
  const v = (i.variant ?? 0) % 3;
  const spot = v === 1 ? '#c8281e' : v === 2 ? '#6b5442' : spotColour(p.home);
  const paperTone = v === 2 ? '#efd2bf' : '#ece4d1';
  const { surname } = splitName(i.playerName);
  const SUR = surname.toUpperCase();
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);
  const timeStr = f.time ?? 'TBC';
  const dateShort = pd ? pd.short : f.date;
  const dateLong = pd ? pd.long : f.date;
  const comp = (f.competition ?? '').trim();

  // ── 1) paper + rules ─────────────────────────────────────────────────────
  const base = await paper(seed, paperTone);
  const rule = (y: number, h: number) => `<rect x="50" y="${y}" width="${V2_W - 100}" height="${h}" fill="${INK}"/>`;
  const rules = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">` +
      rule(48, 7) + rule(60, 2) +
      rule(262, 2) + rule(270, 6) +
      rule(332, 3) +
      rule(1700, 6) + rule(1712, 2) +
      `</svg>`
  );

  // ── 2) masthead + date strip + headline ──────────────────────────────────
  const MAST = v === 2 ? 'LATE EDITION' : 'THE MATCHDAY';
  const mastSize = fitFontSize(MAST, 960, 'DMSerif', 176, 90);
  const strip = comp ? `${dateLong}  ·  ${comp.toUpperCase()}` : dateLong;
  const hLines = wrapSurname(SUR, 10);
  const hLongest = hLines.reduce((m, l) => (l.length > m.length ? l : m), '');
  const headS = fitFontSize(hLongest, 980, 'DMSerif', hLines.length > 1 ? 150 : 250, 70);
  const deck = `${f.homeTeam} vs ${f.awayTeam}`;
  const deckS = fitFontSize(deck, 980, 'DMSerif', 70, 34);

  const top = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      text({ position: 'absolute', top: '70px', left: '0px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'DMSerif', fontSize: `${mastSize}px`, lineHeight: 1, color: INK }, MAST),
      text({ position: 'absolute', top: '284px', left: '50px', width: `${V2_W - 100}px`, justifyContent: 'center', fontFamily: 'Bebas', fontSize: `${fitFontSize(strip, 980, 'Bebas', 34, 20, 4)}px`, letterSpacing: '4px', color: INK }, strip),
      ...hLines.map((l, k) =>
        text({ position: 'absolute', top: `${350 + k * Math.round(headS * 0.98)}px`, left: '50px', fontFamily: 'DMSerif', fontSize: `${headS}px`, lineHeight: 1, letterSpacing: '-2px', color: INK }, l)
      ),
      text({ position: 'absolute', top: `${350 + hLines.length * Math.round(headS * 0.98) + 8}px`, left: '54px', fontFamily: 'DMSerif', fontSize: `${deckS}px`, lineHeight: 1.1, color: INK, opacity: 0.88 }, deck),
    ])
  );

  // ── 3) halftone print of the real cutout + offset spot-colour plate ──────
  const heroH = 1010;
  const heroTop = 690;
  const cx = 668;
  const heroPlaced = await placeLayer(i.layers.cutAction, heroH, (w) => ({ left: Math.round(cx - w / 2), top: heroTop }), {});
  let heroInk: Buffer;
  let heroSpot: Buffer;
  if (i.layers.cutAction) {
    // Work at placed size so the dot pitch is identical across players.
    // Box-fit (max 640 wide, clear of the fixture box) and bottom-anchor.
    const m0 = await sharp(i.layers.cutAction).metadata();
    const fitH = Math.round((m0.height ?? 1) * boxScale(m0.width ?? 1, m0.height ?? 1, heroH, 640));
    const scaled = await sharp(i.layers.cutAction).resize({ height: fitH }).png().toBuffer();
    const meta = await sharp(scaled).metadata();
    const w = meta.width ?? 1;
    const croppedHero = await isCroppedBottom(scaled);
    const figTop = croppedHero ? heroTop : heroTop + (heroH - fitH);
    const fadeAt = croppedHero ? 62 : 90;
    const ht = await halftone(scaled, { cell: 4, angle: 45, ink: INK, contrast: 1.2, gamma: 0.6 });
    // Flat spot-colour plate in the exact silhouette of the cutout.
    const plateAlpha = await sharp(scaled).ensureAlpha().extractChannel(3).toBuffer();
    const plateRgb = await sharp({ create: { width: w, height: fitH, channels: 3, background: mix(spot, paperTone, 0.28) } }).png().toBuffer();
    const solid = await sharp(plateRgb).joinChannel(plateAlpha).png().toBuffer();
    const faded = (b: Buffer) => bottomFade(b, fadeAt);
    // onCanvas clips safely (a figure may never crash the render by overflowing).
    const place = async (b: Buffer, dx: number, dy: number) => onCanvas(await faded(b), w, fitH, Math.round(cx - w / 2) + dx, figTop + dy);
    heroInk = await place(ht, 0, 0);
    heroSpot = await place(solid, 16, 12); // deliberate misregistration
  } else {
    heroInk = heroPlaced;
    heroSpot = heroPlaced;
  }

  // ── 4) fixture box, stamp, footer ────────────────────────────────────────
  const boxX = 50;
  const boxY = 760;
  const boxW = 300;
  const boxSvg = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="520" fill="#f3ecdc" stroke="${INK}" stroke-width="4"/>` +
      `<rect x="${boxX + 8}" y="${boxY + 8}" width="${boxW - 16}" height="504" fill="none" stroke="${INK}" stroke-width="1.5"/></svg>`
  );
  const lab = (y: number, label: string, value: string, vSize: number) => [
    text({ position: 'absolute', top: `${y}px`, left: `${boxX + 26}px`, fontFamily: 'SpaceMono', fontSize: '19px', letterSpacing: '2px', color: spot }, label),
    text({ position: 'absolute', top: `${y + 28}px`, left: `${boxX + 26}px`, width: `${boxW - 52}px`, fontFamily: 'DMSerif', fontSize: `${vSize}px`, lineHeight: 1.05, color: INK }, value),
  ];
  const venue = f.venue ?? '';
  const stampColour = spot;
  const stamp = div(
    {
      position: 'absolute',
      left: '58px',
      top: '1448px',
      padding: '10px 26px 6px',
      border: `8px solid ${stampColour}`,
      transform: 'rotate(-8deg)',
      opacity: 0.93,
    },
    text({ fontFamily: 'ArchivoBlack', fontSize: '72px', letterSpacing: '4px', color: stampColour, lineHeight: 1 }, 'MATCHDAY')
  );

  const fx = 440;
  const mid = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      ...lab(boxY + 26, 'KICK-OFF', timeStr, 76),
      ...lab(boxY + 152, f.round ? 'ROUND' : 'COMPETITION', (f.round ?? comp ?? '').toString() || 'TBC', 38),
      ...lab(boxY + 262, 'VENUE', venue || 'TBC', fitFontSize(venue || 'TBC', boxW - 52, 'DMSerif', 38, 22) > 30 ? 36 : 28),
      ...(countdown ? lab(boxY + 402, 'COUNTDOWN', countdown, 40) : []),
      stamp,
      // footer
      text({ position: 'absolute', top: '1730px', left: `${fx}px`, fontFamily: 'DMSerif', fontSize: `${fitFontSize(dateShort, 480, 'DMSerif', 84, 40)}px`, lineHeight: 1, color: INK }, dateShort),
      text({ position: 'absolute', top: '1830px', left: `${fx}px`, fontFamily: 'SpaceMono', fontSize: '28px', letterSpacing: '3px', color: INK }, `KICK-OFF ${timeStr}`),
      text({ position: 'absolute', top: '1790px', left: '218px', fontFamily: 'DMSerif', fontSize: '54px', lineHeight: 1, color: spot }, 'vs'),
    ])
  );

  const cs = 128;
  const [cH, cA] = await Promise.all([
    squareBadge(i.homeCrest, cs, { fill: '#f3ecdc', stroke: INK, strokeWidth: 3, radius: 6 }),
    squareBadge(i.awayCrest, cs, { fill: '#f3ecdc', stroke: INK, strokeWidth: 3, radius: 6 }),
  ]);

  const overlays: sharp.OverlayOptions[] = [
    { input: rules },
    // Second real photo: a second, lighter halftone print layered behind (a photo collage).
    ...(await (async () => {
      const g = await secondSheet(i, { height: 900, cx: 330, top: 600, flip: true, opacity: 0.42, fadeStart: 86, maxW: 520, treatment: { kind: 'halftone', ink: INK, cell: 6 } });
      return g ? [{ input: g, blend: 'multiply' as const }] : [];
    })()),
    { input: heroSpot, blend: 'multiply' },
    { input: heroInk },
    { input: boxSvg },
    { input: mid },
    { input: top },
  ];
  if (cH) overlays.push({ input: cH, left: 50, top: 1740 });
  if (cA) overlays.push({ input: cA, left: 270, top: 1740 });
  // light ink-grain over everything so it feels printed
  overlays.push({ input: await grain(seed + 7, 0.08), blend: 'multiply' });
  return sharp(base).composite(overlays).png().toBuffer();
}
