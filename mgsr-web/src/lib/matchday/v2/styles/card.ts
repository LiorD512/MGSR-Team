/**
 * CARD — the collector card.
 *
 * A foil-framed trading card: giant squad number + club crest in the corner,
 * the real player inside the card art, a name plate, and the matchup row
 * below the card. No invented ratings or stats — only the number and facts.
 *
 * Variants: 0 Gold · 1 Holo (rainbow foil) · 2 Black (carbon + club accent)
 */
import sharp from 'sharp';
import { type RenderV2Input, V2_W, V2_H, placeLayer, textLayer, text, crestPng, compLine } from '../render';
import { abs, centred, column, root, sheet, orbs } from '../kit/compose';
import { relightCutout } from '../kit/relight';
import { grain, stripes } from '../kit/texture';
import { discBadge } from '../kit/badges';
import { mix, matchPalette } from '../kit/palette';
import { fitFontSize, splitName } from '../kit/fit';
import { posterDate, countdownLabel } from '../kit/dates';
import type { BrandOptions } from '../kit/brand';

export const CARD_BRAND: BrandOptions = { corner: 'bottom-right', size: 76, margin: 40 };

export async function renderCard(i: RenderV2Input): Promise<Buffer> {
  const f = i.facts;
  const v = (i.variant ?? 0) % 3;
  const playerCrest = f.playerSide === 'home' ? i.homeCrest : i.awayCrest;
  const oppCrest = f.playerSide === 'home' ? i.awayCrest : i.homeCrest;
  const p = i.palette ?? (await matchPalette(playerCrest, oppCrest));
  const pd = posterDate(f.date);
  const countdown = countdownLabel(f.date);
  const { given, surname } = splitName(i.playerName);

  const foil =
    v === 1
      ? `<stop offset="0" stop-color="#ff7ad9"/><stop offset="0.2" stop-color="#ffd36b"/><stop offset="0.4" stop-color="#7affc0"/><stop offset="0.6" stop-color="#6bc7ff"/><stop offset="0.8" stop-color="#b47aff"/><stop offset="1" stop-color="#ff7ad9"/>`
      : v === 2
        ? `<stop offset="0" stop-color="#3a3a40"/><stop offset="0.5" stop-color="#101012"/><stop offset="1" stop-color="#3a3a40"/>`
        : `<stop offset="0" stop-color="#fff0b8"/><stop offset="0.35" stop-color="#d8af4e"/><stop offset="0.55" stop-color="#8a6420"/><stop offset="0.8" stop-color="#f3d27a"/><stop offset="1" stop-color="#b8892e"/>`;
  const inkOnCard = v === 2 ? '#ffffff' : v === 1 ? '#1a1030' : '#2a1d05';
  const art1 = v === 2 ? '#111114' : v === 1 ? mix(p.home, '#ffffff', 0.35) : mix(p.home, '#f3d27a', 0.35);
  const art2 = v === 2 ? mix(p.home, '#000000', 0.55) : mix(p.home, '#000000', 0.25);
  const accent = v === 2 ? p.home : v === 1 ? '#ffffff' : '#fff3c4';

  // background: dark with soft club-colour bokeh
  const bgBase = await sharp(sheet(`<rect width="${V2_W}" height="${V2_H}" fill="${mix(p.home, '#000000', 0.88)}"/>`)).png().toBuffer();
  const bokeh = await orbs(
    [
      { x: 140, y: 300, r: 260, color: p.home, opacity: 0.6 },
      { x: 980, y: 700, r: 300, color: p.away, opacity: 0.4 },
      { x: 540, y: 1700, r: 380, color: p.home, opacity: 0.35 },
    ],
    110
  );
  const bg = await sharp(bgBase).composite([{ input: bokeh }, { input: await grain((i.seed ?? 1) + 91, 0.08), blend: 'overlay' }]).png().toBuffer();

  // card geometry
  const CX = 110, CY = 110, CW = 860, CH = 1330, R = 44, B = 22;
  const IX = CX + B, IY = CY + B, IW = CW - 2 * B, IH = CH - 2 * B;
  const frame = sheet(
    `<rect x="${CX + 10}" y="${CY + 24}" width="${CW}" height="${CH}" rx="${R}" fill="#000" opacity="0.5"/>` +
      `<rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="${R}" fill="url(#foil)"/>` +
      `<rect x="${IX}" y="${IY}" width="${IW}" height="${IH}" rx="${R - 14}" fill="url(#art)"/>`,
    `<linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">${foil}</linearGradient>` +
      `<linearGradient id="art" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${art1}"/><stop offset="1" stop-color="${art2}"/></linearGradient>`
  );
  const frameBlurred = await sharp(frame).png().toBuffer();
  const artMask = sheet(`<rect x="${IX}" y="${IY}" width="${IW}" height="${IH}" rx="${R - 14}" fill="#fff"/>`);
  const pattern = await sharp(stripes('#ffffff', v === 2 ? 0.05 : 0.09, 18, -45, 3)).composite([{ input: artMask, blend: 'dest-in' }]).png().toBuffer();

  // corner number + crest, watermark crest
  const big = await crestPng(playerCrest, 560);
  const wm = big ? await sharp(big).ensureAlpha().linear([1, 1, 1, 0.12], [0, 0, 0, 0]).png().toBuffer() : null;
  const corner = await discBadge(playerCrest, 120, { fill: '#ffffff', ring: accent, ringWidth: 3 });

  const lit = i.layers.cutAction ? await relightCutout(i.layers.cutAction, { tint: mix(p.home, '#ffffff', 0.4), amount: 0.25, wrap: 0.7 }) : null;
  const hero = await placeLayer(lit, 1080, (w) => ({ left: Math.round(CX + CW / 2 + 40 - w / 2), top: IY + 70 }), {});
  const heroIn = await sharp(hero).composite([{ input: artMask, blend: 'dest-in' }]).png().toBuffer();

  // name plate
  const PY = IY + IH - 250;
  const plate = sheet(
    `<rect x="${IX}" y="${PY}" width="${IW}" height="250" fill="url(#pl)"/><rect x="${IX + 40}" y="${PY + 6}" width="${IW - 80}" height="4" fill="url(#foil)"/>`,
    `<linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.35" stop-color="#000" stop-opacity="0.7"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient>` +
      `<linearGradient id="foil" x1="0" y1="0" x2="1" y2="0">${foil}</linearGradient>`
  );
  const plateMasked = await sharp(plate).composite([{ input: artMask, blend: 'dest-in' }]).png().toBuffer();

  // holo sheen across the whole card
  const sheen =
    v === 1
      ? await sharp(sheet(`<rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="${R}" fill="url(#h)"/>`, `<linearGradient id="h" x1="0" y1="0" x2="1" y2="1">${foil}</linearGradient>`))
          .ensureAlpha()
          .linear([1, 1, 1, 0.16], [0, 0, 0, 0])
          .png()
          .toBuffer()
      : await sharp(
          sheet(
            `<polygon points="${CX + 120},${CY} ${CX + 380},${CY} ${CX + 120},${CY + CH} ${CX - 140},${CY + CH}" fill="#ffffff" opacity="0.10"/>`
          )
        )
          .composite([{ input: sheet(`<rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="${R}" fill="#fff"/>`), blend: 'dest-in' }])
          .png()
          .toBuffer();

  const SUR = surname.toUpperCase();
  const t = await textLayer(
    root([
      ...(i.squadNumber
        ? [text(abs(IY + 26, IX + 40, { fontFamily: 'Anton', fontSize: '190px', lineHeight: 1, color: accent, textShadow: '0 4px 20px rgba(0,0,0,0.5)' }), i.squadNumber)]
        : []),
      text(abs(IY + (i.squadNumber ? 236 : 40), IX + 46, { fontFamily: 'Bebas', fontSize: '40px', letterSpacing: '8px', color: accent }), 'MATCHDAY'),
      text(column(PY + 38, IX, IW, { fontFamily: 'Bebas', fontSize: '40px', letterSpacing: '14px', color: '#ffffff', opacity: 0.85 }), given.toUpperCase()),
      text(column(PY + 80, IX, IW, { fontFamily: 'Anton', fontSize: `${fitFontSize(SUR, IW - 80, 'Anton', 150, 70, 4)}px`, letterSpacing: '4px', color: '#ffffff', lineHeight: 1 }), SUR),
      // below the card
      text(centred(1490, { fontFamily: 'Bebas', fontSize: '30px', letterSpacing: '10px', color: mix(p.home, '#ffffff', 0.6) }), compLine(f).toUpperCase()),
      text(centred(1712, { fontFamily: 'Anton', fontSize: '76px', letterSpacing: '4px', color: '#ffffff' }), `${pd ? pd.short : f.date}  ·  ${f.time ?? 'TBC'}`),
      ...(f.venue ? [text(centred(1808, { fontFamily: 'Bebas', fontSize: '32px', letterSpacing: '8px', color: mix(p.home, '#ffffff', 0.55) }), f.venue.toUpperCase())] : []),
      ...(countdown ? [text(abs(CY - 40, CX + CW - 300, { fontFamily: 'Bebas', fontSize: '36px', letterSpacing: '4px', padding: '6px 20px 2px', background: '#ffffff', color: '#0c0c0e', width: '300px', justifyContent: 'center' }), countdown)] : []),
      text(centred(1580, { fontFamily: 'Anton', fontSize: '54px', color: mix(p.home, '#ffffff', 0.4) }), 'VS'),
      text(column(1680 - 30, 90, 330, { fontFamily: 'Bebas', fontSize: `${fitFontSize(f.homeTeam.toUpperCase(), 300, 'Bebas', 30, 18, 2)}px`, letterSpacing: '2px', color: '#ffffff' }), f.homeTeam.toUpperCase()),
      text(column(1680 - 30, V2_W - 90 - 330, 330, { fontFamily: 'Bebas', fontSize: `${fitFontSize(f.awayTeam.toUpperCase(), 300, 'Bebas', 30, 18, 2)}px`, letterSpacing: '2px', color: '#ffffff' }), f.awayTeam.toUpperCase()),
    ])
  );
  void inkOnCard;

  const BS = 120;
  const [cH, cA] = await Promise.all([discBadge(i.homeCrest, BS, { ring: accent, ringWidth: 3 }), discBadge(i.awayCrest, BS, { ring: accent, ringWidth: 3 })]);

  const overlays: sharp.OverlayOptions[] = [{ input: frameBlurred }, { input: pattern }];
  if (wm) overlays.push({ input: wm, left: IX + IW - 520, top: IY + 160 });
  overlays.push({ input: heroIn }, { input: plateMasked }, { input: sheen });
  if (corner) overlays.push({ input: corner, left: IX + IW - 160, top: IY + 40 });
  overlays.push({ input: t });
  if (cH) overlays.push({ input: cH, left: 195, top: 1530 });
  if (cA) overlays.push({ input: cA, left: V2_W - 195 - BS, top: 1530 });
  return sharp(bg).composite(overlays).png().toBuffer();
}
