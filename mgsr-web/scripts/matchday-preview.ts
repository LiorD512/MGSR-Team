/**
 * Dev tool: render MATCHDAY v2/v3 posters locally with NO network and NO Gemini.
 *
 *   cd mgsr-web
 *   npx tsx scripts/matchday-preview.ts [designId ...] [--out=/some/dir] [--name="Full Name"] [--variant=N | --all-variants] [--two]
 *
 * Uses a real transparent cutout from docs/matchday-poc/results and synthetic
 * crests, so layout / typography / texture work can be reviewed quickly.
 * Output: PNGs in --out (default ./.matchday-preview, git-ignored by name).
 */
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { renderV2 } from '../src/lib/matchday/v2/render';
import { matchPalette } from '../src/lib/matchday/v2/kit/palette';
import { hashSeed } from '../src/lib/matchday/v2/kit/prng';
import { MATCHDAY_DESIGNS, type MatchdayDesignId } from '../src/lib/matchday/v2/types';

async function crest(kind: 'round' | 'shield', a: string, b: string, letter: string): Promise<Buffer> {
  const shape =
    kind === 'round'
      ? `<circle cx="256" cy="256" r="240" fill="${a}" stroke="${b}" stroke-width="28"/>`
      : `<path d="M60 40 H452 V260 C452 380 340 450 256 490 C172 450 60 380 60 260 Z" fill="${a}" stroke="${b}" stroke-width="26"/>`;
  return sharp(
    Buffer.from(
      `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">${shape}` +
        `<text x="256" y="320" font-size="230" font-family="Arial Black, Arial" font-weight="900" text-anchor="middle" fill="${b}">${letter}</text></svg>`
    )
  )
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith('--out='));
  const outDir = outArg ? outArg.slice(6) : path.join(process.cwd(), '.matchday-preview');
  const nameArg = args.find((a) => a.startsWith('--name='));
  const playerName = nameArg ? nameArg.slice(7) : 'Moses Bawa';
  const varArg = args.find((a) => a.startsWith('--variant='));
  const allVariants = args.includes('--all-variants');
  const two = args.includes('--two');
  // --stress: realistic worst-case lengths (two-word given name, accented surname,
  // long clubs / competition / venue) to catch overlapping elements.
  const stress = args.includes('--stress');
  // --pose=half | wide : realistic awkward photo shapes for layout testing.
  //   half = waist-up portrait (cropped cutout, ~1:1)   wide = arms-out pose (~1:1.1)
  const poseArg = args.find((a) => a.startsWith('--pose='))?.slice(7) ?? null;
  const wanted = args.filter((a) => !a.startsWith('--'));
  const designs = (wanted.length ? wanted : MATCHDAY_DESIGNS.map((d) => d.id)) as MatchdayDesignId[];
  await fs.mkdir(outDir, { recursive: true });

  const cutout = await fs.readFile(path.join(process.cwd(), '..', 'docs/matchday-poc/results/cutout_clean.png'));
  // --two: a genuinely different second pose (the POC's orange-bib cutout).
  async function shaped(buf: Buffer, pose: string | null): Promise<Buffer> {
    if (pose === 'half') {
      const m = await sharp(buf).metadata();
      return sharp(buf).extract({ left: 0, top: 0, width: m.width!, height: Math.round(m.height! * 0.52) }).png().toBuffer();
    }
    if (pose === 'wide') {
      const m = await sharp(buf).metadata();
      // widen the silhouette (a stand-in for an arms-out celebration)
      return sharp(buf).resize({ width: Math.round(m.width! * 1.75), height: m.height!, fit: 'fill' }).png().toBuffer();
    }
    return buf;
  }
  const cutout2Raw = two ? await fs.readFile(path.join(process.cwd(), '..', 'docs/matchday-poc/results/diomande_cutout.png')) : null;
  const heroCut = await shaped(cutout, poseArg);
  const cutout2 = cutout2Raw ? await shaped(cutout2Raw, poseArg === 'half' ? 'half' : poseArg === 'wide' ? 'wide' : null) : null;
  const homeCrest = await crest('round', '#1d4ed8', '#fde047', 'G');
  const awayCrest = await crest('shield', '#b91c1c', '#ffffff', 'K');
  const palette = await matchPalette(homeCrest, awayCrest);

  const jobs: Array<{ design: MatchdayDesignId; variant: number }> = [];
  for (const design of designs) {
    const n = MATCHDAY_DESIGNS.find((d) => d.id === design)?.variants?.length ?? 1;
    const vs = allVariants ? Array.from({ length: n }, (_, k) => k) : [varArg ? Number(varArg.slice(10)) : 0];
    for (const variant of vs) jobs.push({ design, variant });
  }
  for (const { design, variant } of jobs) {
    const t0 = Date.now();
    const out = await renderV2({
      variant,
      design,
      playerName: (stress ? 'Gontie Junior Diomandé' : playerName).toUpperCase(),
      squadNumber: '57',
      facts: stress
        ? {
            playerName: 'Gontie Junior Diomandé',
            homeTeam: 'Hapoel Ironi Kiryat Shmona',
            awayTeam: 'Maccabi Bnei Reineh',
            playerSide: 'home',
            country: 'Israel',
            competition: "Israel: Ligat ha'Al Championship Round",
            round: 'Round 13',
            date: '09/11/2026',
            time: '19:00',
            venue: 'Municipal Stadium Kiryat Shmona Galil',
            homeLogo: null,
            awayLogo: null,
          }
        : {
            playerName,
            homeTeam: 'FK Garliava',
            awayTeam: 'Kauno Zalgiris II',
            playerSide: 'home',
            country: 'Lithuania',
            competition: 'Lithuania: I Lyga',
            round: 'Round 9',
            date: '09/10/2026',
            time: '16:00',
            venue: 'Garliavos Stadionas',
            homeLogo: null,
            awayLogo: null,
          },
      layers: { cutAction: heroCut, hero: cutout2 ?? heroCut, backdropMono: null, heroIsDistinct: Boolean(cutout2) },
      homeCrest,
      awayCrest,
      stadium: null,
      sky: null,
      palette,
      seed: hashSeed(playerName, design, variant),
    });
    const tag = variant ? `${design}-v${variant}` : design;
    const file = path.join(outDir, `${tag}.png`);
    await fs.writeFile(file, out.bytes);
    // small JPEG for quick viewing
    await sharp(out.bytes).resize(540).jpeg({ quality: 82 }).toFile(path.join(outDir, `${tag}_small.jpg`));
    console.log(`${tag}: ${Date.now() - t0}ms -> ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
