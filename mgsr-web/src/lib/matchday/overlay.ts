/**
 * Deterministic text + club-logo overlay (sections 6, 9, 10).
 *
 * THIS is where 100%-accurate information is placed. All factual text
 * (MATCHDAY headline, player name, teams, date/time, competition/round) and the
 * REAL club logos are rendered by us — never by the AI image model. The AI only
 * produced the artwork behind this layer.
 *
 * Typography is rendered via an SVG with the Roboto TTFs embedded as base64 so
 * output is identical on any host (including fontless serverless runtimes).
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { CANVAS_W, CANVAS_H } from './layout';
import { fetchAndValidate } from './assets';
import type { MatchdayMatchFacts } from './types';

// ── Embedded fonts (loaded once) ──
let fontCache: { bold: string; regular: string } | null = null;

async function loadFonts(): Promise<{ bold: string; regular: string }> {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  const [bold, regular] = await Promise.all([
    fs.readFile(path.join(dir, 'Roboto-Bold.ttf')).then((b) => b.toString('base64')),
    fs.readFile(path.join(dir, 'Roboto-Regular.ttf')).then((b) => b.toString('base64')),
  ]);
  fontCache = { bold, regular };
  return fontCache;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Scale a font size down so the text (including letter-spacing) fits within
 * maxWidthPx. Roboto uppercase averages ~0.62em per glyph; letter-spacing adds
 * a fixed amount per gap, so we solve for the size that fits both together.
 */
function fitFontSize(
  text: string,
  base: number,
  maxWidthPx: number,
  letterSpacing = 0,
  avgCharRatio = 0.66
): number {
  const n = Math.max(text.length, 1);
  const gaps = Math.max(n - 1, 0);
  const widthAt = (size: number) => n * size * avgCharRatio + gaps * letterSpacing;
  if (widthAt(base) <= maxWidthPx) return base;
  // width(size) = n*ratio*size + gaps*ls  ⇒  size = (max - gaps*ls) / (n*ratio)
  const size = (maxWidthPx - gaps * letterSpacing) / (n * avgCharRatio);
  return Math.max(20, Math.floor(size));
}

export interface OverlayInput {
  base: Buffer;
  facts: MatchdayMatchFacts;
}

export interface OverlayResult {
  bytes: Buffer;
  homeLogoPlaced: boolean;
  awayLogoPlaced: boolean;
}

export async function applyOverlay(input: OverlayInput): Promise<OverlayResult> {
  const { facts } = input;
  const fonts = await loadFonts();

  // Round: label bare numbers as "ROUND N"; leave named rounds (e.g. "FINAL").
  const roundLabel = facts.round
    ? /^\d+$/.test(facts.round.trim())
      ? `ROUND ${facts.round.trim()}`
      : facts.round.trim()
    : null;
  const eyebrow = [facts.country, facts.competition, roundLabel]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join('  •  ');

  const playerName = facts.playerName.toUpperCase();
  const teams = `${facts.homeTeam}   VS   ${facts.awayTeam}`.toUpperCase();
  const dateLine = [facts.date, facts.time].filter(Boolean).join('   •   ');

  const cx = CANVAS_W / 2;
  const headlineSize = 176;
  const nameSize = fitFontSize(playerName, 56, CANVAS_W * 0.82, 16);
  const teamsSize = fitFontSize(teams, 42, CANVAS_W * 0.86, 5);
  const eyebrowSize = fitFontSize(eyebrow, 25, CANVAS_W * 0.84, 9);

  // Vertical rhythm for the header block.
  const eyebrowY = 108;
  const headlineY = 250;
  const nameY = headlineY + 62;

  // Bottom info band, built bottom-up so the logo row anchors it.
  const logoSize = 132;
  const logoBottomMargin = 90;
  const logoY = CANVAS_H - logoBottomMargin - logoSize;
  const dateY = logoY - 46;
  const teamsY = dateY - 46;

  const svg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face { font-family: 'MDBold'; src: url(data:font/ttf;base64,${fonts.bold}) format('truetype'); }
      @font-face { font-family: 'MDReg'; src: url(data:font/ttf;base64,${fonts.regular}) format('truetype'); }
    </style>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7e6ac"/>
      <stop offset="40%" stop-color="#e7b74d"/>
      <stop offset="72%" stop-color="#b9822f"/>
      <stop offset="100%" stop-color="#7d4f19"/>
    </linearGradient>
    <filter id="sh" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="5" stdDeviation="10" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <filter id="soft" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000" flood-opacity="0.7"/>
    </filter>
  </defs>

  <!-- Eyebrow -->
  <text x="${cx}" y="${eyebrowY}" text-anchor="middle"
    font-family="MDReg" font-size="${eyebrowSize}" letter-spacing="9" fill="#e9e4d8" filter="url(#soft)">${escapeXml(eyebrow)}</text>

  <!-- MATCHDAY headline -->
  <text x="${cx}" y="${headlineY}" text-anchor="middle" filter="url(#sh)"
    font-family="MDBold" font-size="${headlineSize}" letter-spacing="4" fill="url(#gold)">MATCHDAY</text>

  <!-- Player name -->
  <text x="${cx}" y="${nameY}" text-anchor="middle" filter="url(#soft)"
    font-family="MDReg" font-size="${nameSize}" letter-spacing="16" fill="#f4efe3">${escapeXml(playerName)}</text>

  <!-- Teams -->
  <text x="${cx}" y="${teamsY}" text-anchor="middle" filter="url(#soft)"
    font-family="MDBold" font-size="${teamsSize}" letter-spacing="5" fill="#ffffff">${escapeXml(teams)}</text>

  <!-- Date / time -->
  <text x="${cx}" y="${dateY}" text-anchor="middle"
    font-family="MDReg" font-size="29" letter-spacing="8" fill="#e0af4c">${escapeXml(dateLine)}</text>
</svg>`;

  const overlays: sharp.OverlayOptions[] = [{ input: Buffer.from(svg), left: 0, top: 0 }];

  // ── Real club logos (section 6: originals, never redrawn) ──
  const gap = 96; // half-gap between the VS and each logo tile
  const homeLogo = await renderLogoTile(facts.homeLogo, logoSize);
  const awayLogo = await renderLogoTile(facts.awayLogo, logoSize);

  let homeLogoPlaced = false;
  let awayLogoPlaced = false;

  if (homeLogo) {
    overlays.push({ input: homeLogo, left: Math.round(cx - gap - logoSize), top: logoY });
    homeLogoPlaced = true;
  }
  if (awayLogo) {
    overlays.push({ input: awayLogo, left: Math.round(cx + gap), top: logoY });
    awayLogoPlaced = true;
  }

  // "VS" centered between the logos.
  if (homeLogoPlaced || awayLogoPlaced) {
    const vs = `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
      <defs><style>@font-face { font-family: 'MDBold'; src: url(data:font/ttf;base64,${fonts.bold}) format('truetype'); }</style></defs>
      <text x="${cx}" y="${logoY + logoSize / 2 + 14}" text-anchor="middle"
        font-family="MDBold" font-size="38" letter-spacing="2" fill="#e0af4c">VS</text>
    </svg>`;
    overlays.push({ input: Buffer.from(vs), left: 0, top: 0 });
  }

  const bytes = await sharp(input.base).composite(overlays).png().toBuffer();
  return { bytes, homeLogoPlaced, awayLogoPlaced };
}

/**
 * Render a club crest for placement: the REAL logo, contain-fit into a square
 * box (never cropped — football crests are shields/wide marks, so cropping
 * would mangle them), upscaled smoothly for small source images, with a soft
 * drop shadow so it separates cleanly from the artwork. Matches the reference
 * designs, which show crests directly with no plate. The logo is never redrawn.
 */
async function renderLogoTile(url: string | null, tileSize: number): Promise<Buffer | null> {
  if (!url) return null;
  const img = await fetchAndValidate({ url, source: 'logo' }, 20);
  if (!img) return null;
  try {
    // A subtle shadow canvas slightly larger than the logo for separation.
    const pad = Math.round(tileSize * 0.08);
    const logoBox = tileSize - pad * 2;
    const logo = await sharp(img.bytes)
      .resize(logoBox, logoBox, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: 'lanczos3',
      })
      .png()
      .toBuffer();

    // Soft shadow: darken the logo to near-black, blur it, place it slightly
    // below/behind the crest for separation from the artwork.
    const shadowLayer = await sharp(logo)
      .ensureAlpha()
      .modulate({ brightness: 0.02 })
      .blur(5)
      .png()
      .toBuffer();

    return await sharp({
      create: { width: tileSize, height: tileSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: shadowLayer, left: pad, top: pad + 3 },
        { input: logo, left: pad, top: pad },
      ])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
