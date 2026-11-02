/**
 * TICKET — the poster is the match ticket.
 *
 * A paper ticket with rounded corners, a club-colour header, the player in a
 * photo window (head breaking out of the top edge), a grid of REAL fixture
 * fields, a perforated tear line with notches and a stub with both crests and
 * a decorative barcode. "Match pass" is a design device — nothing on it claims
 * to be a real seat, gate or price.
 *
 * Variants: 0 Classic (cream) · 1 VIP black (gold foil) · 2 Retro (mint + red serif)
 */
import sharp from 'sharp';
import { type RenderV2Input, V2_W, V2_H, placeLayer, textLayer, text, compLine } from '../render';
import { hasSecond, secondSheet } from '../kit/second';
import { abs, column, root, sheet, barcodeSvg } from '../kit/compose';
import { paper, grain, stripes } from '../kit/texture';
import { squareBadge } from '../kit/badges';
import { mix, matchPalette, readableOn } from '../kit/palette';
import { fitFontSize } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import { makeRng } from '../kit/prng';
import type { BrandOptions } from '../kit/brand';

export const TICKET_BRAND: BrandOptions = { corner: 'bottom-right', size: 78, margin: 70 };

export async function renderTicket(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const v = (i.variant ?? 0) % 3;
  const rng = makeRng((i.seed ?? 1) + 61);
  const playerCrest = f.playerSide === 'home' ? i.homeCrest : i.awayCrest;
  const oppCrest = f.playerSide === 'home' ? i.awayCrest : i.homeCrest;
  const p = i.palette ?? (await matchPalette(playerCrest, oppCrest));
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);

  const T =
    v === 1
      ? { desk: '#0d0d10', paperTone: '#141416', ink: '#f0d690', head: '#d8af4e', onHead: '#141416', mute: '#a8955f', title: 'Bebas' }
      : v === 2
        ? { desk: '#2b3b36', paperTone: '#dfeee2', ink: '#1d2a26', head: '#c8381e', onHead: '#f6efe0', mute: '#55675f', title: 'DMSerif' }
        : { desk: mix(p.home, '#000000', 0.75), paperTone: '#efe8d8', ink: '#16161a', head: p.home, onHead: readableOn(p.home), mute: '#6d6758', title: 'Anton' };

  // desk + ticket body
  const TX = 70, TY = 90, TW = 940, TH = 1740, R = 46;
  const STUB = TY + TH - 360; // perforation y
  const desk = await sharp(sheet(`<rect width="${V2_W}" height="${V2_H}" fill="${T.desk}"/>`))
    .composite([{ input: stripes('#ffffff', 0.03, 22, 35, 3) }, { input: await grain((i.seed ?? 1) + 2, 0.14), blend: 'overlay' }])
    .png()
    .toBuffer();
  const body = await paper((i.seed ?? 1) + 3, T.paperTone);
  const ticketMask = sheet(
    `<rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="${R}" fill="#fff"/>` +
      `<circle cx="${TX}" cy="${STUB}" r="34" fill="#000"/><circle cx="${TX + TW}" cy="${STUB}" r="34" fill="#000"/>`
  );
  // dest-in keeps where mask is white: black notches cut holes
  const maskPng = await sharp(ticketMask).png().toBuffer();
  const ticket = await sharp(body).ensureAlpha().composite([{ input: await sharp(maskPng).extractChannel(0).toColourspace('b-w').toBuffer(), blend: 'dest-in' }]).png().toBuffer();
  const shadow = await sharp(sheet(`<rect x="${TX + 12}" y="${TY + 22}" width="${TW}" height="${TH}" rx="${R}" fill="#000" opacity="0.55"/>`)).blur(22).png().toBuffer();

  // header band, photo window, perforation, barcode
  const WX = TX + 50, WY = TY + 300, WW = TW - 100, WH = 820;
  const deco = sheet(
    `<rect x="${TX}" y="${TY}" width="${TW}" height="250" rx="${R}" fill="${T.head}"/><rect x="${TX}" y="${TY + 200}" width="${TW}" height="50" fill="${T.head}"/>` +
      `<rect x="${WX}" y="${WY}" width="${WW}" height="${WH}" rx="26" fill="${mix(T.head, T.paperTone, v === 1 ? 0.75 : 0.2)}"/>` +
      Array.from({ length: 34 }, (_, k) => `<circle cx="${TX + 50 + k * 26}" cy="${STUB}" r="5" fill="${T.desk}" opacity="0.6"/>`).join('') +
      barcodeSvg(rng, TX + 560, STUB + 210, 330, 90, T.ink) +
      `<rect x="${TX + 20}" y="${TY + 20}" width="${TW - 40}" height="${TH - 40}" rx="${R - 16}" fill="none" stroke="${T.ink}" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="4 8"/>`
  );
  const windowStripes = await sharp(stripes(T.paperTone, 0.18, 26, -30, 10))
    .composite([{ input: sheet(`<rect x="${WX}" y="${WY}" width="${WW}" height="${WH}" rx="26" fill="#fff"/>`), blend: 'dest-in' }])
    .png()
    .toBuffer();

  // hero: clipped only at the window's bottom edge, so the head breaks out of the top
  const two = hasSecond(i);
  const hero = await placeLayer(i.layers.cutAction, 960, (w) => ({ left: Math.round(TX + TW * (two ? 0.62 : 0.5) - w / 2), top: WY - 70 }), { mod: { brightness: 1.03, saturation: 1.08 } });
  // Second real photo: a second figure inside the photo window (clipped to it — it never breaks out).
  const secondRaw = await secondSheet(i, { height: 780, cx: TX + TW * 0.27, top: WY + 70, flip: true, opacity: 0.95, treatment: { kind: 'photo', brightness: 0.92, saturation: 0.95 } });
  const secondIn = secondRaw
    ? await sharp(secondRaw).composite([{ input: sheet(`<rect x="${WX}" y="${WY}" width="${WW}" height="${WH}" rx="26" fill="#fff"/>`), blend: 'dest-in' }]).png().toBuffer()
    : null;
  const heroClip = await sharp(hero).composite([{ input: sheet(`<rect x="0" y="0" width="${V2_W}" height="${WY + WH}" fill="#fff"/>`), blend: 'dest-in' }]).png().toBuffer();

  const field = (top: number, left: number, w: number, label: string, value: string, max = 46) => [
    text(abs(top, left, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '18px', letterSpacing: '3px', color: T.mute }), label),
    text(abs(top + 26, left, { fontFamily: T.title, fontSize: `${fitFontSize(value.toUpperCase(), w, T.title, max, 22)}px`, color: T.ink, lineHeight: 1.05, width: `${w}px` }), value.toUpperCase()),
  ];
  const fy = WY + WH + 34;
  const t = await textLayer(
    root([
      text(abs(TY + 42, TX + 50, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '22px', letterSpacing: '6px', color: T.onHead, opacity: 0.85 }), compLine(f).toUpperCase()),
      text(abs(TY + 74, TX + 44, { fontFamily: T.title, fontSize: '150px', lineHeight: 1, letterSpacing: v === 2 ? '0px' : '4px', color: T.onHead }), v === 2 ? 'Matchday' : 'MATCHDAY'),
      text(abs(TY + 92, TX + TW - 250, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '20px', letterSpacing: '4px', color: T.onHead, width: '200px', justifyContent: 'flex-end' }), 'MATCH PASS'),
      ...(i.squadNumber ? [text(abs(TY + 124, TX + TW - 250, { fontFamily: T.title, fontSize: '80px', color: T.onHead, width: '200px', justifyContent: 'flex-end', lineHeight: 1 }), `#${i.squadNumber}`)] : []),
      text(abs(WY + WH - 70, WX + 26, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: `${fitFontSize(i.playerName.toUpperCase(), WW - 60, 'SpaceMono', 34, 18, 2)}px`, letterSpacing: '2px', color: '#ffffff', padding: '6px 14px', background: 'rgba(0,0,0,0.55)' }), i.playerName.toUpperCase()),
      ...field(fy, TX + 50, 260, 'DATE', pd ? pd.short : f.date),
      ...field(fy, TX + 340, 220, 'KICK-OFF', f.time ?? 'TBC'),
      ...field(fy, TX + 590, 300, 'ROUND', f.round ?? '—'),
      ...field(fy + 104, TX + 50, TW - 100, 'VENUE', f.venue ?? 'TBC', 40),
      ...(countdown ? [text(abs(STUB - 66, TX + 50, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '24px', letterSpacing: '4px', padding: '6px 14px', background: T.head, color: T.onHead }), countdown)] : []),
      // stub
      text(column(STUB + 112, TX + 210, 120, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '34px', color: T.ink }), 'VS'),
      text(abs(STUB + 60, TX + 560, { fontFamily: T.title, fontSize: `${fitFontSize(`${f.homeTeam} v ${f.awayTeam}`.toUpperCase(), 330, T.title, 40, 18)}px`, color: T.ink, width: '340px', lineHeight: 1.1 }), `${f.homeTeam} v ${f.awayTeam}`.toUpperCase()),
      text(abs(STUB + 316, TX + 560, { fontFamily: 'SpaceMono', fontWeight: 700, fontSize: '16px', letterSpacing: '6px', color: T.mute }), `BRIT · ${f.date.replace(/\//g, '')}`),
    ])
  );

  const BS = 150;
  const [cH, cA] = await Promise.all([
    squareBadge(i.homeCrest, BS, { fill: '#ffffff', stroke: T.ink, strokeWidth: 2, radius: 20 }),
    squareBadge(i.awayCrest, BS, { fill: '#ffffff', stroke: T.ink, strokeWidth: 2, radius: 20 }),
  ]);
  const overlays: sharp.OverlayOptions[] = [
    { input: shadow },
    { input: ticket },
    { input: deco },
    { input: windowStripes },
    ...(secondIn ? [{ input: secondIn }] : []),
    { input: heroClip },
    { input: t },
  ];
  if (cH) overlays.push({ input: cH, left: TX + 60, top: STUB + 60 });
  if (cA) overlays.push({ input: cA, left: TX + 330, top: STUB + 60 });
  return sharp(desk).composite(overlays).png().toBuffer();
}
