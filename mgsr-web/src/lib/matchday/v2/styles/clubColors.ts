/**
 * CLUB COLORS — the poster is painted in both clubs' real colours.
 *
 * A diagonal slash splits the canvas: the player's club colour on one side,
 * the opponent's on the other (both extracted from the crests). Giant crest
 * watermarks, a vertical MATCHDAY wordmark, the surname overlapping the legs
 * and a ticket-style fixture bar. Every fixture therefore looks different.
 */
import sharp from 'sharp';
import {
  type RenderV2Input,
  V2_W,
  V2_H,
  placeLayer,
  textLayer,
  crestPng,
  div,
  text,
  compLine,
} from '../render';
import { hasSecond, secondSheet } from '../kit/second';
import { matchPalette, mix, readableOn } from '../kit/palette';
import { grain, stripes } from '../kit/texture';
import { discBadge, withOpacity } from '../kit/badges';
import { fitFontSize, splitName, wrapSurname } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import type { BrandOptions } from '../kit/brand';

export const CLUB_COLORS_BRAND: BrandOptions = { corner: 'top-right', size: 84, margin: 40 };

export async function renderClubColors(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const playerCrest = f.playerSide === 'home' ? i.homeCrest : i.awayCrest;
  const oppCrest = f.playerSide === 'home' ? i.awayCrest : i.homeCrest;
  const base = i.palette ?? (await matchPalette(playerCrest, oppCrest));
  // Remix variants: 0 Slash · 1 Reverse (colours swapped, slash mirrored) · 2 Halves (vertical split)
  const v = (i.variant ?? 0) % 3;
  const p = v === 1 ? { ...base, home: base.away, away: base.home, ink: mix(base.away, '#000000', 0.82), glow: mix(base.away, '#ffffff', 0.35) } : base;
  const topCrest = v === 1 ? oppCrest : playerCrest;
  const bottomCrest = v === 1 ? playerCrest : oppCrest;
  const seed = i.seed ?? 1;
  const { given, surname } = splitName(i.playerName);
  const SUR = surname.toUpperCase();
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);

  // ── 1) the slashed two-colour field ───────────────────────────────────────
  const HALF = V2_W / 2;
  const A =
    v === 2 ? `0,0 ${HALF},0 ${HALF},${V2_H} 0,${V2_H}` : v === 1 ? `0,0 ${V2_W},0 ${V2_W},1240 0,640` : `0,0 ${V2_W},0 ${V2_W},640 0,1240`;
  const B =
    v === 2
      ? `${HALF},0 ${V2_W},0 ${V2_W},${V2_H} ${HALF},${V2_H}`
      : v === 1
        ? `0,640 ${V2_W},1240 ${V2_W},${V2_H} 0,${V2_H}`
        : `0,1240 ${V2_W},640 ${V2_W},${V2_H} 0,${V2_H}`;
  const EDGE =
    v === 2
      ? `${HALF - 8},0 ${HALF + 8},0 ${HALF + 8},${V2_H} ${HALF - 8},${V2_H}`
      : v === 1
        ? `0,640 ${V2_W},1240 ${V2_W},1256 0,656`
        : `0,1240 ${V2_W},640 ${V2_W},656 0,1256`;
  const field = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${mix(p.home, '#ffffff', 0.12)}"/>` +
      `<stop offset="100%" stop-color="${mix(p.home, '#000000', 0.38)}"/></linearGradient>` +
      `<linearGradient id="b" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${mix(p.away, '#ffffff', 0.05)}"/>` +
      `<stop offset="100%" stop-color="${mix(p.away, '#000000', 0.55)}"/></linearGradient>` +
      `<radialGradient id="glow" cx="50%" cy="46%" r="50%"><stop offset="0%" stop-color="#fff" stop-opacity="0.28"/>` +
      `<stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
      `<polygon points="${A}" fill="url(#a)"/><polygon points="${B}" fill="url(#b)"/>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#glow)"/>` +
      // concentric rings behind the player
      `<g fill="none" stroke="#fff" opacity="0.10">` +
      `<circle cx="560" cy="860" r="330" stroke-width="3"/><circle cx="560" cy="860" r="470" stroke-width="3"/>` +
      `<circle cx="560" cy="860" r="610" stroke-width="3"/></g>` +
      // the slash edge
      `<polygon points="${EDGE}" fill="#ffffff" opacity="0.9"/>` +
      `</svg>`
  );

  const [wmA, wmB] = await Promise.all([
    topCrest ? crestPng(topCrest, 780).then((b) => (b ? withOpacity(b, 0.16) : null)) : null,
    bottomCrest ? crestPng(bottomCrest, 740).then((b) => (b ? withOpacity(b, 0.16) : null)) : null,
  ]);
  const overlays: sharp.OverlayOptions[] = [{ input: stripes('#ffffff', 0.05, 18, -35, 3) }];
  if (wmA) overlays.push({ input: wmA, left: -170, top: -90 });
  if (wmB) overlays.push({ input: wmB, left: V2_W - 560, top: 1180 });
  overlays.push({ input: await grain(seed, 0.1), blend: 'overlay' });
  const bg = await sharp(field).composite(overlays).png().toBuffer();

  // ── 2) vertical wordmark (behind the player) ─────────────────────────────
  const onA = readableOn(mix(p.home, '#000000', 0.15));
  const behind = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      div(
        {
          position: 'absolute',
          left: '-350px',
          top: '780px',
          width: '900px',
          height: '220px',
          justifyContent: 'center',
          alignItems: 'center',
          transform: 'rotate(-90deg)',
        },
        text({ fontFamily: 'Anton', fontSize: '210px', letterSpacing: '18px', color: onA, opacity: 0.92, lineHeight: 1 }, 'MATCHDAY')
      ),
    ])
  );

  // ── 3) hero, straddling the slash ────────────────────────────────────────
  const hero = await placeLayer(
    i.layers.cutAction,
    1400,
    (w) => ({ left: Math.round(V2_W * (v === 2 ? 0.5 : 0.56) - w / 2), top: 300 }),
    { mod: { brightness: 1.04, saturation: 1.1 } }
  );

  // ── 4) front: kicker, surname over the legs, ticket bar ──────────────────
  const barTop = 1708;
  const bar = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect y="${barTop}" width="${V2_W}" height="${V2_H - barTop}" fill="${mix(p.ink, '#000000', 0.35)}"/>` +
      `<rect y="${barTop}" width="${V2_W}" height="8" fill="#ffffff"/>` +
      // ticket notches
      `<circle cx="0" cy="${barTop + 100}" r="26" fill="${mix(p.away, '#000000', 0.45)}"/>` +
      `<circle cx="${V2_W}" cy="${barTop + 100}" r="26" fill="${mix(p.away, '#000000', 0.45)}"/></svg>`
  );

  const onB = readableOn(mix(p.away, '#000000', 0.3));
  const sLines = wrapSurname(SUR);
  const sLongest = sLines.reduce((m, l) => (l.length > m.length ? l : m), '');
  const S = fitFontSize(sLongest, 940, 'Anton', sLines.length > 1 ? 170 : 250, 80, 2);
  const sTop = 1390 - (sLines.length - 1) * Math.round(S * 0.95);
  const teamsLine = `${f.homeTeam.toUpperCase()}  VS  ${f.awayTeam.toUpperCase()}`;
  const timeStr = f.time ?? 'TBC';
  const dateStr = pd ? pd.short : f.date;

  const front = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      text({ position: 'absolute', top: '52px', left: '56px', fontFamily: 'Bebas', fontSize: '40px', letterSpacing: '8px', color: onA }, compLine(f).toUpperCase()),
      ...(countdown
        ? [text({ position: 'absolute', top: '112px', left: '56px', padding: '8px 24px 4px', fontFamily: 'Anton', fontSize: '44px', letterSpacing: '4px', background: '#ffffff', color: '#0c0c0e' }, countdown)]
        : []),
      // surname over the legs
      text({ position: 'absolute', top: `${sTop - 74}px`, left: '56px', fontFamily: 'Bebas', fontSize: '50px', letterSpacing: '18px', color: onB, opacity: 0.9 }, `${given.toUpperCase()}${i.squadNumber ? `  ·  ${i.squadNumber}` : ''}`.trim()),
      ...sLines.map((l, k) =>
        text({ position: 'absolute', top: `${sTop + k * Math.round(S * 0.95)}px`, left: '50px', fontFamily: 'Anton', fontSize: `${S}px`, lineHeight: 1, letterSpacing: '2px', color: '#ffffff', textShadow: '0 6px 30px rgba(0,0,0,0.55)' }, l)
      ),
      // ticket bar
      text({ position: 'absolute', top: `${barTop + 26}px`, left: '230px', width: '620px', justifyContent: 'center', textAlign: 'center', fontFamily: 'Bebas', fontSize: `${fitFontSize(teamsLine, 620, 'Bebas', 44, 22, 3)}px`, letterSpacing: '3px', color: '#ffffff' }, teamsLine),
      text({ position: 'absolute', top: `${barTop + 86}px`, left: '230px', width: '620px', justifyContent: 'center', fontFamily: 'Anton', fontSize: '70px', letterSpacing: '5px', color: '#ffffff' }, `${dateStr}  ·  ${timeStr}`),
      ...(f.venue
        ? [text({ position: 'absolute', top: `${barTop + 170}px`, left: '230px', width: '620px', justifyContent: 'center', textAlign: 'center', fontFamily: 'Bebas', fontSize: `${fitFontSize(f.venue.toUpperCase(), 620, 'Bebas', 32, 20, 5)}px`, letterSpacing: '5px', color: p.glow }, f.venue.toUpperCase())]
        : []),
    ])
  );

  const cs = 150;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, cs, { ring: '#ffffff', ringWidth: 4 }),
    discBadge(i.awayCrest, cs, { ring: '#ffffff', ringWidth: 4 }),
  ]);
  // Second real photo: duotoned in the OTHER half's colour, behind the wordmark.
  const ghost = await secondSheet(i, {
    height: 1150, cx: 250, top: 600, flip: true, opacity: 0.88, fadeStart: 78,
    treatment: { kind: 'duotone', dark: mix(p.away, '#000000', 0.7), light: mix(p.away, '#ffffff', 0.4) },
  });
  const comp: sharp.OverlayOptions[] = [...(ghost ? [{ input: ghost }] : []), { input: behind }, { input: hero }, { input: bar }, { input: front }];
  if (cH) comp.push({ input: cH, left: 44, top: barTop + 36 });
  if (cA) comp.push({ input: cA, left: V2_W - 44 - cs, top: barTop + 36 });
  return sharp(bg).composite(comp).png().toBuffer();
}
