/**
 * GIANT TYPE — the surname is the hero.
 *
 * Magazine-cover composition: the player's surname is set enormous in Anton and
 * stacked three times (solid + two outlined echoes) BEHIND the real cutout, so
 * the player physically overlaps the letters. Painted entirely in the player's
 * club colour (extracted from the crest). No AI scene — fast and cheap.
 *
 * Z-order (back → front): colour field → grain → giant type → hero → slanted
 * fixture band → kicker/title/crests/date.
 */
import sharp from 'sharp';
import {
  type RenderV2Input,
  V2_W,
  V2_H,
  placeLayer,
  textLayer,
  div,
  text,
} from '../render';
import { hasSecond, secondSheet } from '../kit/second';
import { matchPalette, mix, readableOn } from '../kit/palette';
import { grain, stripes } from '../kit/texture';
import { discBadge } from '../kit/badges';
import { fitFontSize, splitName, wrapSurname, fitText, compLineFit } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import type { BrandOptions } from '../kit/brand';

/** satori skips text whose fill is fully transparent — use a near-invisible fill for outline type. */
const OUTLINE_FILL = 'rgba(255,255,255,0.01)';

export const GIANT_TYPE_BRAND: BrandOptions = { corner: 'top-right', size: 84, margin: 40 };

export async function renderGiantType(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const playerCrest = f.playerSide === 'home' ? i.homeCrest : i.awayCrest;
  const oppCrest = f.playerSide === 'home' ? i.awayCrest : i.homeCrest;
  const base = i.palette ?? (await matchPalette(playerCrest, oppCrest));
  // Remix variants: 0 Club colour · 1 Opponent colour · 2 Noir (black, club-colour type)
  const v = (i.variant ?? 0) % 3;
  const noir = v === 2;
  const p =
    v === 1
      ? { ...base, home: base.away, away: base.home, ink: mix(base.away, '#000000', 0.82), glow: mix(base.away, '#ffffff', 0.35) }
      : noir
        ? { ...base, home: '#202024', ink: '#060607', glow: mix(base.home, '#ffffff', 0.2) }
        : base;
  const seed = i.seed ?? 1;

  const { given, surname } = splitName(i.playerName);
  const SUR = surname.toUpperCase();
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);

  // ── 1) colour field ──────────────────────────────────────────────────────
  const field = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0.25" y2="1">` +
      `<stop offset="0%" stop-color="${mix(p.home, '#000000', 0.08)}"/>` +
      `<stop offset="55%" stop-color="${mix(p.home, '#000000', 0.5)}"/>` +
      `<stop offset="100%" stop-color="${p.ink}"/></linearGradient>` +
      `<radialGradient id="r" cx="50%" cy="46%" r="52%">` +
      `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.30"/>` +
      `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity="0.07"/>` +
      `<stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#g)"/>` +
      `<rect width="${V2_W}" height="${V2_H}" fill="url(#r)"/>` +
      `<polygon points="120,0 420,0 760,1920 300,1920" fill="url(#beam)"/>` +
      `<polygon points="620,0 800,0 1080,1500 1080,1920 900,1920" fill="url(#beam)"/>` +
      `</svg>`
  );
  const noiseLayer = await grain(seed, 0.12);
  const bg = await sharp(field)
    .composite([
      { input: stripes('#ffffff', 0.035, 16, -35, 2) },
      { input: noiseLayer, blend: 'overlay' },
    ])
    .png()
    .toBuffer();

  // ── 2) giant type, BEHIND the player ─────────────────────────────────────
  // Long compound surnames wrap to two lines; type is sized to the longest line.
  const lines = wrapSurname(SUR);
  const longest = lines.reduce((m, l) => (l.length > m.length ? l : m), '');
  const S = fitFontSize(longest, 1010, 'Anton', 640, 120, 2);
  const row = Math.round(S * 0.9);
  // Kicker + given name are fitted first; the giant rows start below them.
  const kick = compLineFit(f, 760, 'Bebas', 40, 22, 11);
  const givenLine = `${given.toUpperCase()}${i.squadNumber ? `  ·  ${i.squadNumber}` : ''}`.trim();
  const gl = fitText(givenLine, 900, 'Bebas', 54, 30, 22);
  const top1 = 246 + gl.size + 26;
  const solid = noir ? mix(base.home, '#ffffff', 0.12) : mix(p.home, '#ffffff', 0.86);
  const rowStyle = (top: number, extra: Record<string, string | number>) => ({
    position: 'absolute',
    top: `${top}px`,
    left: '0px',
    width: `${V2_W}px`,
    justifyContent: 'center',
    fontFamily: 'Anton',
    fontSize: `${S}px`,
    lineHeight: 1,
    letterSpacing: '2px',
    ...extra,
  });
  // Rows: the real line(s) in solid type, then outlined echoes of the last line
  // until three rows are filled (keeps the "stacked poster" rhythm).
  const outline = (op: number, k: number) => ({
    color: OUTLINE_FILL,
    WebkitTextStroke: `3px ${mix(p.home, '#ffffff', k)}`,
    opacity: op,
  });
  const rows = [
    ...lines.map((l) => ({ t: l, st: { color: solid } as Record<string, string | number> })),
    ...[outline(0.6, 0.7), outline(0.3, 0.6)]
      .slice(0, Math.max(0, 3 - lines.length))
      .map((st) => ({ t: lines[lines.length - 1], st })),
  ];
  const behind = await textLayer(
    div(
      { width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' },
      rows.map((r, k) => text(rowStyle(top1 + row * k, r.st), r.t))
    )
  );

  // ── 3) slanted fixture band (behind the hero's feet) ─────────────────────
  const bandTop = 1500;
  const band = Buffer.from(
    `<svg width="${V2_W}" height="${V2_H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${mix(p.ink, p.home, 0.14)}"/>` +
      `<stop offset="100%" stop-color="${p.ink}"/></linearGradient></defs>` +
      `<polygon points="0,${bandTop + 60} ${V2_W},${bandTop} ${V2_W},${V2_H} 0,${V2_H}" fill="url(#b)"/>` +
      `<polygon points="0,${bandTop + 60} ${V2_W},${bandTop} ${V2_W},${bandTop + 9} 0,${bandTop + 69}" fill="${p.glow}"/></svg>`
  );

  // ── 4) hero, in FRONT of the band so boots + ball break the edge ─────────
  const hero = await placeLayer(
    i.layers.cutAction,
    1290,
    (w) => ({ left: Math.round(V2_W / 2 - w / 2), top: 340 }),
    { mod: { brightness: 1.04, saturation: 1.1 } }
  );

  // ── 5) crests at the band corners, fixture facts centred under the boots ──
  const BS = 176;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, BS, { ring: p.glow, ringWidth: 5 }),
    discBadge(i.awayCrest, BS, { ring: p.glow, ringWidth: 5 }),
  ]);
  const crestY = bandTop + 112;
  const homeX = 64;
  const awayX = V2_W - 64 - BS;
  const colW = 300;

  const timeStr = f.time ? f.time : 'TBC';
  const dateStr = pd ? pd.short : f.date;
  const teamFit = (name: string) => fitFontSize(name.toUpperCase(), colW, 'Bebas', 44, 26, 2);
  const teamStyle = (left: number, name: string) => ({
    position: 'absolute',
    top: `${crestY + BS + 16}px`,
    left: `${left}px`,
    width: `${colW}px`,
    justifyContent: 'center',
    textAlign: 'center',
    fontFamily: 'Bebas',
    fontSize: `${teamFit(name)}px`,
    letterSpacing: '2px',
    color: '#ffffff',
  });

  const front = await textLayer(
    div({ width: `${V2_W}px`, height: `${V2_H}px`, position: 'relative' }, [
      text({ position: 'absolute', top: '58px', left: '0px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Bebas', fontSize: `${kick.size}px`, letterSpacing: '11px', color: p.glow }, kick.text),
      text({ position: 'absolute', top: '104px', left: '0px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Anton', fontSize: '100px', letterSpacing: '16px', color: '#ffffff' }, 'MATCHDAY'),
      text({ position: 'absolute', top: '246px', left: '0px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Bebas', fontSize: `${gl.size}px`, letterSpacing: '22px', color: mix(p.home, '#ffffff', 0.8) }, gl.text),
      ...(countdown
        ? [
            text({ position: 'absolute', top: `${bandTop - 74}px`, left: '56px', padding: '8px 26px 4px', fontFamily: 'Anton', fontSize: '46px', letterSpacing: '4px', background: p.glow, color: readableOn(p.glow) }, countdown),
          ]
        : []),
      text(teamStyle(homeX + BS / 2 - colW / 2, f.homeTeam), f.homeTeam.toUpperCase()),
      text(teamStyle(awayX + BS / 2 - colW / 2, f.awayTeam), f.awayTeam.toUpperCase()),
      // centre column — under the boots
      text({ position: 'absolute', top: `${bandTop + 196}px`, left: '0px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Anton', fontSize: '30px', letterSpacing: '10px', color: p.glow }, 'VS'),
      text({ position: 'absolute', top: `${bandTop + 236}px`, left: '0px', width: `${V2_W}px`, justifyContent: 'center', fontFamily: 'Anton', fontSize: '62px', letterSpacing: '5px', color: '#ffffff' }, `${dateStr}  ·  ${timeStr}`),
      ...(f.venue
        ? (() => {
            const v = fitText(f.venue.toUpperCase(), V2_W - 600, 'Bebas', 34, 18, 5);
            return [text({ position: 'absolute', top: `${bandTop + 322}px`, left: '300px', width: `${V2_W - 600}px`, justifyContent: 'center', fontFamily: 'Bebas', fontSize: `${v.size}px`, letterSpacing: '5px', color: mix(p.home, '#ffffff', 0.55) }, v.text)];
          })()
        : []),
    ])
  );

  // Second real photo: a club-colour duotone ghost BEHIND the giant type, so
  // it shows through the outlined rows (ghost → type → hero depth sandwich).
  const ghost = await secondSheet(i, {
    height: 1560, cx: 800, top: 230, flip: true, opacity: 0.9, fadeStart: 72,
    treatment: { kind: 'duotone', dark: p.ink, light: mix(noir ? base.home : p.home, '#ffffff', 0.62) },
  });
  const comp: sharp.OverlayOptions[] = [
    ...(ghost ? [{ input: ghost }] : []),
    { input: behind },
    { input: band },
    { input: hero },
    { input: front },
  ];
  if (cH) comp.push({ input: cH, left: homeX, top: crestY });
  if (cA) comp.push({ input: cA, left: awayX, top: crestY });
  return sharp(bg).composite(comp).png().toBuffer();
}
