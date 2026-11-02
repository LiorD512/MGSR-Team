/**
 * CINEMA — the blockbuster movie poster.
 *
 * Player "billed" across the top like a lead actor, a huge hero, a condensed
 * MATCHDAY title with a fixture subtitle, a classic tall-condensed billing
 * block and "IN STADIUMS <date>" at the foot. Every line of the billing block
 * is a real fact (club, competition, round, venue, kick-off) — no invented copy.
 *
 * Variants: 0 Blockbuster (teal & orange) · 1 Thriller (red & black) · 2 Gold premiere
 */
import sharp from 'sharp';
import { type RenderV2Input, V2_W, V2_H, placeLayer, textLayer, cinematicStadiumBg, rimGlow, contactShadow, text, div } from '../render';
import { hasSecond, secondSheet } from '../kit/second';
import { abs, centred, root, sheet } from '../kit/compose';
import { relightCutout } from '../kit/relight';
import { grain } from '../kit/texture';
import { discBadge } from '../kit/badges';
import { fitFontSize, splitName } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import type { BrandOptions } from '../kit/brand';

export const CINEMA_BRAND: BrandOptions = { corner: 'bottom-right', size: 76, margin: 40 };

const THEMES = [
  { wash: '#0b3a4a', spot: '#ffb36b', smoke: '#5fc6d6', bottom: '#020a0e', title: '#ffffff', accent: '#ffb36b', sub: '#cfe7ec', rim: '#ffa04a', glow: 'rgba(255,160,74,0.45)' },
  { wash: '#3a0306', spot: '#ff2a2a', smoke: '#8a1a1a', bottom: '#050101', title: '#ffffff', accent: '#ff3030', sub: '#d9c3c3', rim: '#ff3a3a', glow: 'rgba(255,40,40,0.5)' },
  { wash: '#1a1306', spot: '#f2cf7a', smoke: '#d8af4e', bottom: '#040302', title: '#f6e2a8', accent: '#d8af4e', sub: '#e6dcc4', rim: '#e6c06a', glow: 'rgba(230,192,106,0.5)' },
];

export async function renderCinema(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const T = THEMES[(i.variant ?? 0) % THEMES.length];
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);
  const { given, surname } = splitName(i.playerName);
  const timeStr = f.time ?? 'TBC';

  // Graphic family: never an AI scene — the uploaded stadium (graded) or a gradient.
  const bg = await cinematicStadiumBg({ ...i, sky: null }, { wash: T.wash, washOpacity: 0.55, spot: T.spot, smokeTint: T.smoke, smokeIntensity: 0.9, bottom: T.bottom });

  const lit = i.layers.cutAction ? await relightCutout(i.layers.cutAction, { tint: T.rim, amount: 0.35, wrap: 0.8 }) : null;
  const two = hasSecond(i);
  const hero = await placeLayer(lit, 1330, (w) => ({ left: Math.round((two ? 430 : V2_W / 2) - w / 2), top: 250 }), { fade: true, fadeStart: 82 });
  // Second real photo: the classic one-sheet "giant figure in the sky" behind the lead.
  const sky = await secondSheet(i, { height: 1480, cx: 790, top: 90, flip: true, opacity: 0.8, fadeStart: 58, treatment: { kind: 'relit', tint: T.rim, amount: 0.55, brightness: 0.62 } });
  const rim = await rimGlow(hero, T.rim);

  // Heavy bottom fade so the title + billing sit on near-black, like a real one-sheet.
  const fade = sheet(
    `<rect y="1060" width="${V2_W}" height="${V2_H - 1060}" fill="url(#f)"/><rect width="${V2_W}" height="260" fill="url(#t)"/>`,
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.bottom}" stop-opacity="0"/><stop offset="0.45" stop-color="${T.bottom}" stop-opacity="0.92"/><stop offset="1" stop-color="${T.bottom}" stop-opacity="1"/></linearGradient>` +
      `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.bottom}" stop-opacity="0.85"/><stop offset="1" stop-color="${T.bottom}" stop-opacity="0"/></linearGradient>`
  );

  const billing = (`${given} ${surname}`).trim().toUpperCase();
  const titleSize = fitFontSize('MATCHDAY', 960, 'Anton', 300, 160);
  const matchup = `${f.homeTeam.toUpperCase()}  VS  ${f.awayTeam.toUpperCase()}`;
  const comp = [f.competition, f.round].filter(Boolean).join('  ·  ').toUpperCase();

  // Billing block: alternating small "credit" words and tall condensed names.
  const credit = (s: string) => text({ fontFamily: 'Montserrat', fontWeight: 400, fontSize: '17px', letterSpacing: '1px', color: T.sub, marginRight: '10px', marginTop: '9px' }, s);
  const name = (s: string) => text({ fontFamily: 'Bebas', fontSize: '42px', letterSpacing: '1px', color: T.sub, marginRight: '18px', lineHeight: 1 }, s.toUpperCase());
  const blockRow = (children: ReturnType<typeof text>[]) =>
    div({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', width: '900px' }, children);

  const t = await textLayer(
    root([
      text(centred(58, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '22px', letterSpacing: '12px', color: T.sub }), 'BRIT SPORT GROUP PRESENTS'),
      text(centred(98, { fontFamily: 'Bebas', fontSize: `${fitFontSize(billing, 980, 'Bebas', 92, 50, 10)}px`, letterSpacing: '10px', color: T.title }), billing),
      ...(i.squadNumber ? [text(centred(196, { fontFamily: 'Bebas', fontSize: '36px', letterSpacing: '14px', color: T.accent }), `NO. ${i.squadNumber}`)] : []),
      // Title
      text(centred(1250, { fontFamily: 'Anton', fontSize: `${titleSize}px`, lineHeight: 1, letterSpacing: '0px', color: T.title, textShadow: `0 0 60px ${T.glow}` }), 'MATCHDAY'),
      text(centred(1572, { fontFamily: 'Bebas', fontSize: `${fitFontSize(matchup, 960, 'Bebas', 58, 30, 6)}px`, letterSpacing: '6px', color: T.accent }), matchup),
      ...(comp ? [text(centred(1640, { fontFamily: 'Montserrat', fontWeight: 600, fontSize: '20px', letterSpacing: '8px', color: T.sub }), comp)] : []),
      // Billing block
      div(abs(1690, 90, { width: '900px', flexDirection: 'column', alignItems: 'center', opacity: 0.82 }), [
        blockRow([credit('BRIT SPORT GROUP presents'), name(billing), credit('in'), name(f.homeTeam), credit('versus'), name(f.awayTeam)]),
        blockRow([credit('venue'), name(f.venue ?? 'TBC'), credit('kick-off'), name(timeStr), ...(f.round ? [credit('round'), name(f.round.replace(/^round\s*/i, ''))] : [])]),
      ]),
      text(centred(1838, { fontFamily: 'Bebas', fontSize: '50px', letterSpacing: '14px', color: T.title }), `IN STADIUMS ${pd ? pd.short : f.date}`),
      ...(countdown ? [text(abs(1846, 60, { fontFamily: 'Bebas', fontSize: '30px', letterSpacing: '4px', color: T.accent }), countdown)] : []),
    ])
  );

  const BS = 96;
  const [cH, cA] = await Promise.all([
    discBadge(i.homeCrest, BS, { ring: T.accent, ringWidth: 3 }),
    discBadge(i.awayCrest, BS, { ring: T.accent, ringWidth: 3 }),
  ]);
  const overlays: sharp.OverlayOptions[] = [
    ...(sky ? [{ input: sky }] : []),
    { input: rim, blend: 'screen' },
    { input: contactShadow(540, 1540, 420) },
    { input: hero },
    { input: fade },
    { input: t },
  ];
  if (cH) overlays.push({ input: cH, left: 60, top: 240 });
  if (cA) overlays.push({ input: cA, left: V2_W - 60 - BS, top: 240 });
  overlays.push({ input: await grain((i.seed ?? 1) + 21, 0.1), blend: 'overlay' });
  return sharp(bg).composite(overlays).png().toBuffer();
}
