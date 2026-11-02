/**
 * Builds the STYLE EXAMPLES shown in the MATCHDAY design picker:
 *   public/matchday-samples/<design>-v<variant>.jpg   (one photo, every variant)
 *   public/matchday-samples/<design>-two.jpg          (variant 0 with a 2nd photo)
 *
 *   cd mgsr-web && npx tsx scripts/matchday-samples.ts
 *
 * Everything is FAKE on purpose: the "player" is an anonymous flat-illustration
 * mannequin derived only from the silhouette/tones of the POC cutouts (heavy
 * blur + 3-tone posterize, head forced to a solid tone, so no face or identity
 * survives), the clubs, crests, venue and competition are invented, and the name
 * reads "YOUR PLAYER". Re-run after changing any style.
 */
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { renderV2 } from '../src/lib/matchday/v2/render';
import { matchPalette } from '../src/lib/matchday/v2/kit/palette';
import { hashSeed } from '../src/lib/matchday/v2/kit/prng';
import { MATCHDAY_DESIGNS } from '../src/lib/matchday/v2/types';

const OUT = path.join(process.cwd(), 'public', 'matchday-samples');
const WIDTH = 300;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Anonymous flat-illustration mannequin from a cutout's silhouette + blurred tones. */
async function mannequin(file: string, headFrac: number): Promise<Buffer> {
  const cut = await fs.readFile(file);
  const m = await sharp(cut).metadata();
  const W = m.width!, H = m.height!;
  const alpha = await sharp(cut).ensureAlpha().extractChannel(3).toBuffer();
  const grey = await sharp(cut).flatten({ background: '#808080' }).greyscale().blur(Math.max(8, H / 105)).raw().toBuffer();
  const dark = [24, 32, 56], mid = [92, 110, 152], light = [232, 236, 244];
  const out = Buffer.alloc(W * H * 3);
  const headY = Math.round(H * headFrac);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      let v = grey[k] / 255;
      if (y < headY) v = 0; // head: solid tone, never facial shading
      const t1 = smooth(0.3, 0.36, v), t2 = smooth(0.58, 0.64, v);
      for (let c = 0; c < 3; c++) out[k * 3 + c] = dark[c] + (mid[c] - dark[c]) * t1 + (light[c] - mid[c]) * t2;
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).joinChannel(alpha).png().toBuffer();
}

async function crest(kind: 'round' | 'shield', a: string, b: string, letter: string): Promise<Buffer> {
  const shape =
    kind === 'round'
      ? `<circle cx="256" cy="256" r="236" fill="${a}" stroke="${b}" stroke-width="26"/><circle cx="256" cy="256" r="186" fill="none" stroke="${b}" stroke-width="6"/>`
      : `<path d="M60 40 H452 V250 C452 380 340 450 256 492 C172 450 60 380 60 250 Z" fill="${a}" stroke="${b}" stroke-width="24"/>` +
        `<path d="M150 40 V420 M362 40 V420" stroke="${b}" stroke-width="30" opacity="0.5"/>`;
  return sharp(
    Buffer.from(
      `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">${shape}` +
        `<text x="256" y="330" font-size="220" font-family="Georgia, serif" font-weight="700" text-anchor="middle" fill="${b}">${letter}</text></svg>`
    )
  )
    .png()
    .toBuffer();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const docs = path.join(process.cwd(), '..', 'docs/matchday-poc/results');
  const p1 = await mannequin(path.join(docs, 'cutout_clean.png'), 0.125);
  const p2 = await mannequin(path.join(docs, 'diomande_cutout.png'), 0.13);
  const homeCrest = await crest('round', '#14306e', '#e7c35a', 'N');
  const awayCrest = await crest('shield', '#1f7a4a', '#ffffff', 'R');
  const palette = await matchPalette(homeCrest, awayCrest);
  const facts = {
    playerName: 'Your Player',
    homeTeam: 'Northbridge FC',
    awayTeam: 'Riverside Athletic',
    playerSide: 'home' as const,
    country: null,
    competition: 'Sample League',
    round: 'Round 1',
    date: '14/03/2027',
    time: '19:45',
    venue: 'Example Park',
    homeLogo: null,
    awayLogo: null,
  };

  let n = 0;
  for (const d of MATCHDAY_DESIGNS) {
    const variants = d.variants?.length ?? 1;
    const jobs: Array<{ v: number; two: boolean; file: string }> = [
      ...Array.from({ length: variants }, (_, v) => ({ v, two: false, file: `${d.id}-v${v}.jpg` })),
      { v: 0, two: true, file: `${d.id}-two.jpg` },
    ];
    for (const j of jobs) {
      const r = await renderV2({
        design: d.id,
        variant: j.v,
        facts,
        playerName: 'YOUR PLAYER',
        squadNumber: '10',
        layers: { cutAction: p1, hero: j.two ? p2 : p1, backdropMono: null, heroIsDistinct: j.two },
        homeCrest,
        awayCrest,
        stadium: null,
        sky: null,
        palette,
        seed: hashSeed('sample', d.id, j.v),
      });
      await sharp(r.bytes).resize(WIDTH).jpeg({ quality: 74, mozjpeg: true }).toFile(path.join(OUT, j.file));
      n++;
    }
    console.log(`${d.id}: ${variants} variants + two-photo`);
  }
  console.log(`wrote ${n} examples to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
