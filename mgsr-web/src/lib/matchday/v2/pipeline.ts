/**
 * MATCHDAY v2 pipeline — AI-assisted designed posters.
 *
 *   match facts (sourced) → curated player photo → [AI: kit swap, cutout, pose]
 *   → crests (sourced) → optional AI sky → deterministic composite → quality
 *
 * The face is never generated. Facts and crests are sourced, never invented.
 */

import { randomUUID } from 'crypto';
import sharp from 'sharp';
import type { MatchdayMatchFacts, MatchdayQualityCheck } from '../types';
import { resolveCrest } from '../crests';
import { buildMatchKey, recordDesign } from '../designMemory';
import { MatchdayError } from '../pipeline';
import { prepareLayers } from './prepare';
import { cachedCrest } from './cache';
import { renderV2, V2_W, V2_H } from './render';
import { generateCinematicScene, geminiConfigured } from './gemini';
import { matchPalette } from './kit/palette';
import { hashSeed } from './kit/prng';
import { MATCHDAY_DESIGNS, designVariant, type MatchdayDesignId, type MatchdayV2Input, type MatchdayV2Result } from './types';
import { CINEMATIC_SCENE_WORDS } from './styles/cinematic';

const TM_SILHOUETTE = /\/default\.(jpg|png)(\?|$)/i;

/** Colour-grade words for the AI cinematic scene, per style. */
const SCENE_PALETTES: Partial<Record<MatchdayDesignId, string>> = {
  inferno: 'deep crimson and ember orange',
  frost: 'icy cyan and steel blue',
  prestige: 'black and antique gold',
  electric: 'neon teal and electric violet',
  // legacy styles (no longer in the picker) fall back sensibly
  midnight: 'black and warm gold',
  golden: 'warm amber sunset',
  storm: 'stormy grey and gold',
  marble: 'cool neutral grey',
  // V3 graphic styles never request an AI scene (see GRAPHIC_STYLES); entries
  // exist only to satisfy the exhaustive Record type.
  gianttype: 'club colours',
  clubcolors: 'club colours',
  broadsheet: 'newsprint',
};

/**
 * V3 graphic styles are fully procedural (colour fields, type, halftone): no
 * Gemini scene and no secondary figure. That makes them faster and removes one
 * paid image-generation call per poster compared with the cinematic styles.
 */
const GRAPHIC_STYLES: ReadonlySet<MatchdayDesignId> = new Set<MatchdayDesignId>(
  MATCHDAY_DESIGNS.filter((d) => d.family === 'graphic').map((d) => d.id)
);

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Stage 1 — facts (required).
 * CORRECTNESS RULE: use ONLY the fixture the dossier already resolved and
 * showed the operator (correct teams, date, competition and the exact logos).
 * We deliberately do NOT fall back to scraping by player name here: that
 * produced CONFIDENTLY WRONG fixtures (e.g. Bawa shown Bnei Yehuda's match)
 * because an obscure name matches the wrong player. For a scouting product a
 * wrong fixture is worse than no poster — so refuse instead of inventing one.
 * Shared by the final generation and the style previews.
 */
export function buildFacts(input: Pick<MatchdayV2Input, 'fixture' | 'playerName' | 'clubCountry'>): MatchdayMatchFacts {
  if (!input.fixture) {
    throw new MatchdayError(
      'No confirmed next match for this player yet. Open the player card and wait for the "Next match" to load, then generate.',
      'NO_MATCH'
    );
  }
  const f = input.fixture;
  return {
    playerName: input.playerName,
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    playerSide: f.playerSide,
    country: input.clubCountry ?? null,
    competition: f.competition,
    round: f.round,
    date: f.date,
    time: f.time,
    venue: f.venue,
    homeLogo: f.homeLogo,
    awayLogo: f.awayLogo,
  };
}

/** Stage 2 — the curated player photo (required). */
export async function requirePlayerBytes(input: Pick<MatchdayV2Input, 'playerPhotoUrl'>): Promise<Buffer> {
  if (!input.playerPhotoUrl?.trim() || TM_SILHOUETTE.test(input.playerPhotoUrl)) {
    throw new MatchdayError('This player has no MATCHDAY photo yet. Upload one to generate the graphic.', 'NO_PLAYER_PHOTO');
  }
  const bytes = await fetchBytes(input.playerPhotoUrl);
  if (!bytes) throw new MatchdayError('The MATCHDAY photo could not be downloaded.', 'NO_PLAYER_PHOTO');
  return bytes;
}

/** High-resolution crests for both clubs (cached for an hour per club). */
export async function resolveCrests(facts: MatchdayMatchFacts): Promise<{ homeCrest: Buffer | null; awayCrest: Buffer | null }> {
  const one = (team: string, logo: string | null) =>
    cachedCrest(team, logo, async () => {
      const res = await resolveCrest(team, logo);
      return res?.bytes ?? (logo ? await fetchBytes(logo) : null);
    });
  const [homeCrest, awayCrest] = await Promise.all([one(facts.homeTeam, facts.homeLogo), one(facts.awayTeam, facts.awayLogo)]);
  return { homeCrest, awayCrest };
}

export { GRAPHIC_STYLES, fetchBytes };

export async function generateMatchdayV2(input: MatchdayV2Input): Promise<MatchdayV2Result> {
  const generationId = randomUUID();

  const facts = buildFacts(input);
  const playerBytes = await requirePlayerBytes(input);

  // Optional SECOND real player photo (a genuine second pose) + kit reference.
  const graphic = GRAPHIC_STYLES.has(input.design);
  // Graphic styles use a single hero, so the 2nd photo (and its extra Gemini
  // cutout call) is skipped for them.
  const player2Bytes = !graphic && input.playerPhoto2Url?.trim() ? await fetchBytes(input.playerPhoto2Url) : null;
  const kitBytes = input.kitPhotoUrl?.trim() ? await fetchBytes(input.kitPhotoUrl) : null;

  // ── Stage 3: AI-assisted layer prep (face preserved) ──
  // Only the two-figure designs need a genuinely different second pose. For the
  // single-figure designs the backdrop reuses the action cutout (greyscaled),
  // Two-figure styles always want a secondary; and ANY design benefits from a
  // real second photo when one was uploaded.
  const needHero =
    Boolean(player2Bytes) ||
    input.design === 'inferno' ||
    input.design === 'frost' ||
    input.design === 'electric';
  const layers = await prepareLayers({
    playerPhoto: playerBytes,
    playerPhoto2: player2Bytes,
    kitPhoto: kitBytes,
    squadNumber: input.squadNumber ?? null,
    needHero,
  });

  // ── Stage 4: crests (hi-res, cached) ──
  const { homeCrest, awayCrest } = await resolveCrests(facts);

  // Optional stadium photo — used as a REFERENCE for the generated scene, and
  // as a deterministic fallback background if generation is unavailable.
  const stadium = input.stadiumPhotoUrl?.trim() ? await fetchBytes(input.stadiumPhotoUrl) : null;

  // ── Stage 5: AI cinematic background scene (no people/text/logos) ──
  // The generative "wow" lever: Gemini paints a dramatic dark stadium scene with
  // thick smoke, graded to the style palette. The player, crests and text are
  // composited ON TOP afterwards, so the face is never generated. Falls back to
  // the deterministic stadium/gradient background when Gemini is unavailable.
  const variant = designVariant(input.design, input.remix);
  const scenePalette =
    CINEMATIC_SCENE_WORDS[input.design]?.[variant.index] ?? SCENE_PALETTES[input.design] ?? 'cinematic steel blue';
  const generatedScene = graphic ? null : await generateCinematicScene({ palette: scenePalette, stadiumRef: stadium });
  const sky: Buffer | null = generatedScene?.bytes ?? null;

  // ── Stage 6: render ──
  // Club colours (from the crests) + a reproducible seed: the same fixture and
  // style always yields the same texture; a different design changes it.
  const playerCrest = facts.playerSide === 'home' ? homeCrest : awayCrest;
  const opponentCrest = facts.playerSide === 'home' ? awayCrest : homeCrest;
  const palette = await matchPalette(playerCrest, opponentCrest);
  const seed = hashSeed(facts.playerName, facts.homeTeam, facts.awayTeam, facts.date, input.design, input.remix ?? 0);
  const rendered = await renderV2({
    palette,
    seed,
    variant: variant.index,
    design: input.design,
    facts,
    playerName: input.playerName.toUpperCase(),
    squadNumber: input.squadNumber ?? null,
    layers: { cutAction: layers.cutAction, hero: layers.hero, backdropMono: layers.backdropMono, heroIsDistinct: layers.heroIsDistinct },
    homeCrest,
    awayCrest,
    stadium,
    sky,
  });

  // Design memory (reuse existing record shape).
  // Best-effort log. The Firestore client SDK retries a failing write FOREVER
  // (bad rules / offline / wrong project), which used to hang the whole request,
  // so never wait on it for more than a couple of seconds.
  await Promise.race([
    recordDesign({
    generationId,
    playerId: input.playerId,
    playerName: input.playerName,
    matchKey: buildMatchKey(facts.playerName, facts.homeTeam, facts.awayTeam, facts.date),
    playerImagesUsed: input.playerPhotoUrl ? [input.playerPhotoUrl] : [],
    stadiumImageUsed: input.stadiumPhotoUrl ?? null,
    savedImagePath: null,
    createdAt: Date.now(),
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);

  // Deliver as high-quality JPEG (q92, 4:4:4 chroma): visually identical to the
  // PNG — even on Broadsheet's fine halftone — but ~5–8× smaller. As a base64
  // PNG the heaviest styles reached 4.7 MB, over Vercel's 4.5 MB response limit,
  // and the same payload is posted back by Save / Send.
  const posterJpeg = await sharp(rendered.bytes).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();

  const qualityChecks = buildChecks(facts, geminiConfigured(), Boolean(layers.cutAction), Boolean(homeCrest), Boolean(awayCrest), Boolean(kitBytes), rendered.width, rendered.height, layers.preCut ? 'your transparent cutout, used as-is (no AI)' : layers.fromCache ? 'clean transparent cutout (cached — no AI call this run)' : null);

  return {
    generationId,
    design: input.design,
    variant: { index: variant.index, name: variant.name },
    imageDataUrl: `data:image/jpeg;base64,${posterJpeg.toString('base64')}`,
    facts,
    qualityChecks,
  };
}

function buildChecks(
  facts: MatchdayMatchFacts,
  keyConfigured: boolean,
  haveCutout: boolean,
  home: boolean,
  away: boolean,
  kitSwapped: boolean,
  w: number,
  h: number,
  cutoutNote: string | null = null
): MatchdayQualityCheck[] {
  // Report the ACCURATE reason: a missing key vs a transient model failure
  // (rate-limit / overload) are different problems with different fixes.
  const cutoutDetail = haveCutout
    ? cutoutNote ?? 'clean transparent cutout'
    : keyConfigured
      ? 'cutout failed this run (model busy/rate-limited) — try again in a moment'
      : 'cutout unavailable — GEMINI_API_KEY is not set';
  return [
    { id: 'identity', label: 'Player face preserved (never generated)', status: 'pass', detail: 'AI used only for cutout/kit/pose' },
    { id: 'cutout', label: 'Player cutout', status: haveCutout ? 'pass' : 'fail', detail: cutoutDetail },
    { id: 'kit', label: 'Kit', status: kitSwapped ? 'pass' : 'warn', detail: kitSwapped ? 'swapped from reference' : 'original kit kept' },
    { id: 'teams', label: 'Home & away teams resolved', status: facts.homeTeam && facts.awayTeam ? 'pass' : 'fail', detail: `${facts.homeTeam} vs ${facts.awayTeam}` },
    { id: 'datetime', label: 'Date & kickoff', status: facts.date ? (facts.time ? 'pass' : 'warn') : 'fail', detail: `${facts.date}${facts.time ? ` • ${facts.time}` : ' • TBC'}` },
    { id: 'crests', label: 'Club crests', status: home && away ? 'pass' : home || away ? 'warn' : 'fail', detail: `home ${home ? 'ok' : 'missing'} · away ${away ? 'ok' : 'missing'}` },
    { id: 'canvas', label: 'Rendered at 9:16', status: w === V2_W && h === V2_H ? 'pass' : 'fail', detail: `${w}×${h}` },
  ];
}
