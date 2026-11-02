/**
 * GLASS — soft gradient orbs + frosted glass cards.
 *
 * Clean, premium "OS widget" look: blurred colour orbs, the relit player, and
 * glass cards that genuinely blur what is behind them (including the player's
 * legs). A large kick-off "widget", crest chips and a countdown pill.
 *
 * Variants: 0 Club glow (crest colours) · 1 Sunset · 2 Midnight
 */
import sharp from 'sharp';
import { type RenderV2Input, V2_W, V2_H, placeLayer, textLayer, text, contactShadow } from '../render';
import { hasSecond, secondSheet } from '../kit/second';
import { abs, centred, column, root, sheet, orbs, frostedGlass } from '../kit/compose';
import { relightCutout } from '../kit/relight';
import { grain } from '../kit/texture';
import { discBadge } from '../kit/badges';
import { mix, matchPalette } from '../kit/palette';
import { fitFontSize, fitText, compLineFit } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import type { BrandOptions } from '../kit/brand';

export const GLASS_BRAND: BrandOptions = { corner: 'top-right', size: 80, margin: 44 };

export async function renderGlass(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const v = (i.variant ?? 0) % 3;
  const playerCrest = f.playerSide === 'home' ? i.homeCrest : i.awayCrest;
  const oppCrest = f.playerSide === 'home' ? i.awayCrest : i.homeCrest;
  const p = i.palette ?? (await matchPalette(playerCrest, oppCrest));
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);

  const P =
    v === 1
      ? { base: '#2a0f2e', a: '#ff7a59', b: '#ff3d8b', c: '#ffc46b', key: '#ffb08a' }
      : v === 2
        ? { base: '#05060f', a: '#3b2bff', b: '#00c2ff', c: '#8a2bff', key: '#7fb4ff' }
        : { base: mix(p.home, '#000000', 0.8), a: p.home, b: p.away, c: mix(p.home, '#ffffff', 0.4), key: mix(p.home, '#ffffff', 0.5) };

  const base = await sharp(sheet(`<rect width="${V2_W}" height="${V2_H}" fill="${P.base}"/>`)).png().toBuffer();
  const glow = await orbs(
    [
      { x: 180, y: 380, r: 420, color: P.a },
      { x: 960, y: 820, r: 460, color: P.b, opacity: 0.85 },
      { x: 320, y: 1500, r: 420, color: P.c, opacity: 0.75 },
      { x: 900, y: 1820, r: 300, color: P.a, opacity: 0.6 },
    ],
    150
  );
  const bg = await sharp(base).composite([{ input: glow }, { input: await grain((i.seed ?? 1) + 51, 0.06), blend: 'overlay' }]).png().toBuffer();

  const lit = i.layers.cutAction ? await relightCutout(i.layers.cutAction, { tint: P.key, amount: 0.3, wrap: 0.9 }) : null;
  const two = hasSecond(i);
  const hero = await placeLayer(lit, 1000, (w) => ({ left: Math.round((two ? 640 : V2_W / 2) - w / 2), top: 370 }), { maxW: two ? 540 : 760 });
  // Second real photo: a second, slightly receding figure; the glass card blurs its legs.
  const second = await secondSheet(i, { height: 900, cx: 290, top: 520, flip: true, opacity: 0.9, maxW: 420, treatment: { kind: 'relit', tint: P.key, amount: 0.35, brightness: 0.9 } });
  const scene = await sharp(bg)
    .composite([...(second ? [{ input: second }] : []), { input: contactShadow(two ? 640 : 540, 1362, 380) }, { input: hero }])
    .png()
    .toBuffer();

  // Glass cards (blur the composited scene underneath).
  const top = await frostedGlass(scene, 60, 60, 960, 290, { radius: 44 });
  const bottom = await frostedGlass(scene, 60, 1380, 960, 480, { radius: 52 });
  const chipL = await frostedGlass(scene, 100, 1424, 190, 190, { radius: 95, blur: 18 });
  const chipR = await frostedGlass(scene, 790, 1424, 190, 190, { radius: 95, blur: 18 });

  const BS = 150;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, BS, { fill: '#ffffff', fillOpacity: 0.9 }),
    discBadge(i.awayCrest, BS, { fill: '#ffffff', fillOpacity: 0.9 }),
  ]);

  const name = i.playerName.toUpperCase();
  const time = f.time ?? 'TBC';
  const nameFit = (n: string) => fitFontSize(n.toUpperCase(), 230, 'Montserrat', 22, 14, 1);
  const t = await textLayer(
    root([
      (() => { const k = compLineFit(f, 800, 'Montserrat', 22, 13, 6); return text(abs(96, 110, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: `${k.size}px`, letterSpacing: '6px', color: '#ffffff', opacity: 0.8 }), k.text); })(),
      text(abs(132, 104, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '112px', letterSpacing: '-3px', color: '#ffffff', lineHeight: 1 }), 'Matchday'),
      (() => { const n = fitText(name + (i.squadNumber ? `  ·  ${i.squadNumber}` : ''), 860, 'Montserrat', 36, 18, 4); return text(abs(266, 110, { fontFamily: 'Montserrat', fontWeight: 400, fontSize: `${n.size}px`, letterSpacing: '4px', color: '#ffffff', opacity: 0.92 }), n.text); })(),
      ...(countdown
        ? [text(abs(1310, 60, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '26px', letterSpacing: '4px', padding: '12px 26px', borderRadius: '40px', background: 'rgba(255,255,255,0.92)', color: P.base }), countdown)]
        : []),
      text(column(1630, 70, 250, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: `${nameFit(f.homeTeam)}px`, color: '#ffffff', letterSpacing: '1px' }), f.homeTeam.toUpperCase()),
      text(column(1630, 760, 250, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: `${nameFit(f.awayTeam)}px`, color: '#ffffff', letterSpacing: '1px' }), f.awayTeam.toUpperCase()),
      text(column(1410, 300, 480, { fontFamily: 'Montserrat', fontWeight: 400, fontSize: '30px', letterSpacing: '6px', color: '#ffffff', opacity: 0.85 }), pd ? pd.short : f.date),
      text(column(1452, 300, 480, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '170px', letterSpacing: '-6px', color: '#ffffff', lineHeight: 1 }), time),
      text(column(1640, 300, 480, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '22px', letterSpacing: '8px', color: '#ffffff', opacity: 0.7 }), 'KICK-OFF'),
      ...(f.venue ? [text(centred(1760, { fontFamily: 'Montserrat', fontWeight: 400, fontSize: `${fitFontSize(f.venue.toUpperCase(), 860, 'Montserrat', 26, 16, 5)}px`, letterSpacing: '5px', color: '#ffffff', opacity: 0.85 }), f.venue.toUpperCase())] : []),
    ])
  );

  const overlays: sharp.OverlayOptions[] = [{ input: top }, { input: bottom }, { input: chipL }, { input: chipR }, { input: t }];
  if (cH) overlays.push({ input: cH, left: 120, top: 1444 });
  if (cA) overlays.push({ input: cA, left: 810, top: 1444 });
  return sharp(scene).composite(overlays).png().toBuffer();
}
