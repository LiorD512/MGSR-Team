/**
 * MATCHDAY rendering — deterministic, no generative AI anywhere.
 *
 * Satori lays the poster out with real font metrics (so long names wrap instead
 * of silently shrinking) and converts every glyph to a vector path, which means
 * the rasteriser needs no font access and the same fixture always produces a
 * byte-identical PNG. sharp then rasterises at exactly 1080×1920 — there is no
 * resize step anywhere, so nothing is softened.
 *
 * Photographs are placed as deliberate hard-edged panels with hairline frames,
 * in the BRIT editorial language. We do not attempt a cutout: a rectangle that
 * is obviously intentional reads far better than a failed silhouette. A
 * pre-cut transparent PNG also works — its transparency simply reveals the
 * band behind it.
 */

import path from 'path';
import fs from 'fs/promises';
import satori from 'satori';
import sharp from 'sharp';
import type { MatchdayMatchFacts } from './types';

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

/**
 * The panel the player photograph fills. A photo smaller than this in either
 * axis would have to be enlarged to cover it, so these are also the minimum
 * dimensions a curated upload has to meet.
 */
export const PLAYER_PANEL = { width: 640, height: 1040 } as const;
/** The stadium band is wide and shallow, so it asks much less of a photo. */
export const STADIUM_BAND = { width: 936, height: 420 } as const;

// BRIT tokens — mirror of :root in globals.css. Flat, square, hairline. No
// gradients, no glows, no drop shadows.
const BLACK = '#11110f';
const PAPER = '#f3f0e8';
const GOLD = '#a47d43';
const GOLD_SOFT = '#c9a66b';
const MUTED = 'rgba(243,240,232,0.55)';
const LINE = 'rgba(243,240,232,0.2)';
const PANEL = '#1b1b18';

const PAD = 72;
const CONTENT_W = CANVAS_W - PAD * 2;

type FontWeight = 400 | 500 | 600;
interface LoadedFont {
  name: string;
  data: Buffer;
  weight: FontWeight;
  style: 'normal';
}

let fontCache: LoadedFont[] | null = null;

async function loadFonts(): Promise<LoadedFont[]> {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  const [oswaldMedium, oswaldSemi, monoRegular, monoMedium] = await Promise.all([
    fs.readFile(path.join(dir, 'Oswald-Medium.woff')),
    fs.readFile(path.join(dir, 'Oswald-SemiBold.woff')),
    fs.readFile(path.join(dir, 'DMMono-Regular.woff')),
    fs.readFile(path.join(dir, 'DMMono-Medium.woff')),
  ]);
  fontCache = [
    { name: 'Oswald', data: oswaldMedium, weight: 500, style: 'normal' },
    { name: 'Oswald', data: oswaldSemi, weight: 600, style: 'normal' },
    { name: 'DMMono', data: monoRegular, weight: 400, style: 'normal' },
    { name: 'DMMono', data: monoMedium, weight: 500, style: 'normal' },
  ];
  return fontCache;
}

/* ── Element helpers ────────────────────────────────────────────────────────
   Satori needs an explicit `display` on every div, so these keep the tree
   readable rather than repeating boilerplate. */

type El = { type: string; props: Record<string, unknown> };

const box = (style: Record<string, unknown>, children?: unknown): El => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, ...(children === undefined ? {} : { children }) },
});

const spacer = (height: number): El => box({ height, flexShrink: 0 });

const rule = (width: number | string = '100%'): El =>
  box({ width, height: 1, backgroundColor: LINE, flexShrink: 0 });

const mono = (
  text: string,
  size: number,
  color: string,
  letterSpacing: number,
  weight: FontWeight = 400
): El =>
  box(
    {
      fontFamily: 'DMMono',
      fontWeight: weight,
      fontSize: size,
      color,
      letterSpacing,
      textTransform: 'uppercase',
      lineHeight: 1.35,
    },
    text
  );

const display = (
  text: string,
  size: number,
  color: string,
  weight: FontWeight,
  extra: Record<string, unknown> = {}
): El =>
  box(
    {
      fontFamily: 'Oswald',
      fontWeight: weight,
      fontSize: size,
      color,
      textTransform: 'uppercase',
      lineHeight: 0.92,
      ...extra,
    },
    text
  );

function dataUrl(bytes: Buffer, mimeType = 'image/png'): string {
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

/**
 * Scale a photograph to exactly the box it will occupy before embedding it.
 *
 * Two reasons, both load-bearing. Satori inlines images as base64 inside the
 * SVG, and a full-size photo pushes the document past librsvg's XML buffer
 * limit, which fails the render outright. And resizing here with
 * `withoutEnlargement` makes it structurally impossible to draw a photo larger
 * than its source — the upscaling that softened the old output.
 *
 * Photographs become JPEG because base64 PNG is enormous; anything carrying
 * transparency (a pre-cut player cutout) stays PNG so its alpha survives.
 */
async function fitToBox(
  bytes: Buffer,
  box: { width: number; height: number },
  position: string = 'centre'
): Promise<{ bytes: Buffer; mimeType: string }> {
  const base = sharp(bytes).resize(box.width, box.height, {
    fit: 'cover',
    position,
    withoutEnlargement: true,
  });
  const { hasAlpha } = await sharp(bytes).metadata();
  if (hasAlpha) {
    return { bytes: await base.png({ compressionLevel: 9 }).toBuffer(), mimeType: 'image/png' };
  }
  return { bytes: await base.jpeg({ quality: 90, mozjpeg: true }).toBuffer(), mimeType: 'image/jpeg' };
}

/**
 * Crests are trimmed of any flat border and reduced to the size they are drawn
 * at. They sit on a paper tile in the composition: club crests are frequently
 * dark navy or black and would otherwise disappear into the near-black field,
 * and a tile also makes crests with a baked-in white background look identical
 * to transparent ones.
 */
async function fitCrest(bytes: Buffer, size: number): Promise<Buffer> {
  const inner = size - 16;
  try {
    return await sharp(bytes)
      .trim({ threshold: 12 })
      .resize(inner, inner, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    // `trim` throws when the image is entirely one colour.
    return sharp(bytes)
      .resize(inner, inner, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
}


/* ── Copy assembly ── */

/** `UZBEKISTAN · SUPER LEAGUE · ROUND 23` — country never duplicated. */
function eyebrowText(facts: MatchdayMatchFacts): string {
  const stage = facts.round
    ? /^\d+$/.test(facts.round.trim())
      ? `Round ${facts.round.trim()}`
      : facts.round.trim()
    : null;
  return [facts.country, facts.competition, stage].filter(Boolean).join('  ·  ');
}

/** Kickoff is labelled TBC rather than silently omitted. */
function kickoffText(facts: MatchdayMatchFacts): string {
  return `${facts.date}  ·  ${facts.time ?? 'Time TBC'}`;
}

/** Name wraps on word boundaries; step the size down only for extreme lengths. */
function nameFontSize(name: string): number {
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length), 1);
  if (name.length > 26 || longest > 13) return 54;
  if (name.length > 18) return 64;
  return 74;
}

export interface RenderInput {
  facts: MatchdayMatchFacts;
  /** The curated player photograph. Required — generation is blocked without it. */
  playerPhoto: { bytes: Buffer; mimeType: string };
  /** Optional curated stadium photograph for the band behind the player. */
  stadiumPhoto?: { bytes: Buffer; mimeType: string } | null;
  homeCrest?: { bytes: Buffer } | null;
  awayCrest?: { bytes: Buffer } | null;
  /** BRIT wordmark SVG, emitted into public/ by scripts/convert-logo.js. */
  brandMark?: Buffer | null;
}

export interface RenderOutput {
  bytes: Buffer;
  width: number;
  height: number;
}

export async function renderMatchdayImage(input: RenderInput): Promise<RenderOutput> {
  const { facts } = input;
  const fonts = await loadFonts();

  const CREST = 124;

  // The stadium band runs behind the TOP of the player panel rather than above
  // it, so the stage is the same height whether or not a stadium photo exists —
  // stacking them left a large dead gap in the common case where it does not.
  const BAND_H = STADIUM_BAND.height;
  const PLAYER_W = PLAYER_PANEL.width;
  const PLAYER_H = PLAYER_PANEL.height;
  const STAGE_H = PLAYER_H + 60;

  // Every raster is reduced to exactly the box it occupies before it is
  // embedded — see fitToBox.
  const [playerArt, stadiumArt, homeArt, awayArt] = await Promise.all([
    fitToBox(input.playerPhoto.bytes, PLAYER_PANEL, 'top'),
    input.stadiumPhoto
      ? fitToBox(input.stadiumPhoto.bytes, { width: CONTENT_W, height: BAND_H })
      : Promise.resolve(null),
    input.homeCrest ? fitCrest(input.homeCrest.bytes, CREST) : Promise.resolve(null),
    input.awayCrest ? fitCrest(input.awayCrest.bytes, CREST) : Promise.resolve(null),
  ]);

  const stage: unknown[] = [];

  if (stadiumArt) {
    stage.push(
      box(
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: CONTENT_W,
          height: BAND_H,
          borderTop: `1px solid ${LINE}`,
          borderBottom: `1px solid ${LINE}`,
          backgroundColor: PANEL,
          overflow: 'hidden',
        },
        [
          {
            type: 'img',
            props: {
              src: dataUrl(stadiumArt.bytes, stadiumArt.mimeType),
              width: CONTENT_W,
              height: BAND_H,
              style: { objectFit: 'cover' },
            },
          },
          // Scrim rather than a CSS filter — knocks the photo back to a BRIT
          // surface so it reads as an element, not a backdrop.
          box({
            position: 'absolute',
            top: 0,
            left: 0,
            width: CONTENT_W,
            height: BAND_H,
            backgroundColor: 'rgba(17,17,15,0.62)',
          }),
        ]
      )
    );
  }

  stage.push(
    box(
      {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: PLAYER_W,
        height: PLAYER_H,
        backgroundColor: PANEL,
        borderTop: `1px solid ${LINE}`,
        borderLeft: `1px solid ${LINE}`,
        overflow: 'hidden',
      },
      [
        {
          type: 'img',
          props: {
            src: dataUrl(playerArt.bytes, playerArt.mimeType),
            width: PLAYER_W,
            height: PLAYER_H,
            style: { objectFit: 'cover', objectPosition: 'top' },
          },
        },
      ]
    )
  );

  if (facts.venue) {
    stage.push(
      box(
        {
          position: 'absolute',
          left: 0,
          bottom: 28,
          flexDirection: 'column',
          maxWidth: CONTENT_W - PLAYER_W - 32,
        },
        [mono(facts.venue, 20, GOLD_SOFT, 4, 500)]
      )
    );
  }

  /** A crest on a paper tile, so dark crests stay legible on the black field. */
  const crestTile = (art: Buffer): El =>
    box(
      {
        width: CREST,
        height: CREST,
        backgroundColor: PAPER,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      },
      [
        {
          type: 'img',
          props: {
            src: dataUrl(art),
            width: CREST - 16,
            height: CREST - 16,
            style: { objectFit: 'contain' },
          },
        },
      ]
    );

  const crestRow: unknown[] = [];
  if (homeArt) crestRow.push(crestTile(homeArt));
  crestRow.push(
    box({ flexDirection: 'column', alignItems: 'center', flexGrow: 1, paddingLeft: 24, paddingRight: 24 }, [
      mono(`${facts.homeTeam}  v  ${facts.awayTeam}`, 21, PAPER, 4, 500),
      spacer(16),
      display(kickoffText(facts), 40, GOLD, 500, { letterSpacing: 1 }),
    ])
  );
  if (awayArt) crestRow.push(crestTile(awayArt));

  // The publisher credit is set as type rather than placed as a logo: the
  // repo's logo.svg is a converted Android drawable that librsvg cannot parse,
  // and a mono wordmark is both more robust and more consistent with how BRIT
  // labels everything else.
  const footer: unknown[] = [
    rule(),
    spacer(34),
    box({ alignItems: 'center', width: CONTENT_W }, crestRow),
    spacer(32),
    rule(),
    spacer(22),
    box({ justifyContent: 'center', width: CONTENT_W }, [
      mono('Brit Sport Group', 16, MUTED, 7, 500),
    ]),
  ];

  const tree = box(
    {
      width: CANVAS_W,
      height: CANVAS_H,
      flexDirection: 'column',
      backgroundColor: BLACK,
      padding: `${PAD}px ${PAD}px 80px`,
      justifyContent: 'space-between',
    },
    [
      box({ flexDirection: 'column' }, [
        mono(eyebrowText(facts) || 'Fixture', 22, GOLD_SOFT, 6),
        spacer(20),
        rule(),
        spacer(30),
        display('Matchday', 152, PAPER, 600, { letterSpacing: -2 }),
        spacer(22),
        display(facts.playerName, nameFontSize(facts.playerName), GOLD, 500, {
          maxWidth: CONTENT_W,
          flexWrap: 'wrap',
          letterSpacing: 1,
        }),
      ]),
      box({ position: 'relative', width: CONTENT_W, height: STAGE_H, flexShrink: 0 }, stage),
      box({ flexDirection: 'column' }, footer),
    ]
  );

  const svg = await satori(tree as never, { width: CANVAS_W, height: CANVAS_H, fonts });
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  return { bytes, width: CANVAS_W, height: CANVAS_H };
}

/** Unused today but kept adjacent to the palette it belongs to. */
export const BRIT_TOKENS = { BLACK, PAPER, GOLD, GOLD_SOFT, MUTED, LINE, PANEL };
