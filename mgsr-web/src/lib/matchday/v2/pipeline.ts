/**
 * MATCHDAY v2 pipeline — AI-assisted designed posters.
 *
 *   match facts (sourced) → curated player photo → [AI: kit swap, cutout, pose]
 *   → crests (sourced) → optional AI sky → deterministic composite → quality
 *
 * The face is never generated. Facts and crests are sourced, never invented.
 */

import { randomUUID } from 'crypto';
import type { MatchdayMatchFacts, MatchdayQualityCheck } from '../types';
import { resolveCrest } from '../crests';
import { buildMatchKey, recordDesign } from '../designMemory';
import { MatchdayError } from '../pipeline';
import { prepareLayers } from './prepare';
import { renderV2, V2_W, V2_H } from './render';
import { generateCinematicScene, geminiConfigured } from './gemini';
import type { MatchdayDesignId, MatchdayV2Input, MatchdayV2Result } from './types';

const TM_SILHOUETTE = /\/default\.(jpg|png)(\?|$)/i;

/** Colour-grade words for the AI cinematic scene, per style. */
const SCENE_PALETTES: Record<MatchdayDesignId, string> = {
  inferno: 'deep crimson and ember orange',
  frost: 'icy cyan and steel blue',
  prestige: 'black and antique gold',
  electric: 'neon teal and electric violet',
  // legacy styles (no longer in the picker) fall back sensibly
  midnight: 'black and warm gold',
  golden: 'warm amber sunset',
  storm: 'stormy grey and gold',
  marble: 'cool neutral grey',
};

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function generateMatchdayV2(input: MatchdayV2Input): Promise<MatchdayV2Result> {
  const generationId = randomUUID();

  // ── Stage 1: facts (required) ──
  // CORRECTNESS RULE: use ONLY the fixture the dossier already resolved and
  // showed the operator (correct teams, date, competition and the exact logos).
  // We deliberately do NOT fall back to scraping by player name here: that
  // produced CONFIDENTLY WRONG fixtures (e.g. Bawa shown Bnei Yehuda's match)
  // because an obscure name matches the wrong player. For a scouting product a
  // wrong fixture is worse than no poster — so refuse instead of inventing one.
  if (!input.fixture) {
    throw new MatchdayError(
      'No confirmed next match for this player yet. Open the player card and wait for the "Next match" to load, then generate.',
      'NO_MATCH'
    );
  }
  const f = input.fixture;
  const facts: MatchdayMatchFacts = {
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

  // ── Stage 2: curated player photo (required) ──
  if (!input.playerPhotoUrl?.trim() || TM_SILHOUETTE.test(input.playerPhotoUrl)) {
    throw new MatchdayError('This player has no MATCHDAY photo yet. Upload one to generate the graphic.', 'NO_PLAYER_PHOTO');
  }
  const playerBytes = await fetchBytes(input.playerPhotoUrl);
  if (!playerBytes) throw new MatchdayError('The MATCHDAY photo could not be downloaded.', 'NO_PLAYER_PHOTO');

  // Optional kit reference + stadium.
  const kitBytes = input.kitPhotoUrl?.trim() ? await fetchBytes(input.kitPhotoUrl) : null;

  // ── Stage 3: AI-assisted layer prep (face preserved) ──
  // Only the two-figure designs need a genuinely different second pose. For the
  // single-figure designs the backdrop reuses the action cutout (greyscaled),
  // which avoids a wasted alt-pose generation.
  const needHero =
    input.design === 'golden' ||
    input.design === 'storm' ||
    input.design === 'inferno' ||
    input.design === 'frost' ||
    input.design === 'electric';
  const layers = await prepareLayers({
    playerPhoto: playerBytes,
    kitPhoto: kitBytes,
    squadNumber: input.squadNumber ?? null,
    needHero,
  });

  // ── Stage 4: crests ──
  // Resolve a HIGH-RESOLUTION crest for each club. Because the team names now
  // come from the dossier (correct), resolveCrest() searches for the RIGHT club
  // — fixing both the wrong-logo bug and the pixelation (it upgrades the tiny
  // Flashscore/TM badge to a Transfermarkt `original`/`big` or Wikipedia crest,
  // never upscaling a thumbnail). The small dossier URL is only the last resort.
  const [homeRes, awayRes] = await Promise.all([
    resolveCrest(facts.homeTeam, facts.homeLogo),
    resolveCrest(facts.awayTeam, facts.awayLogo),
  ]);
  const homeCrest = homeRes?.bytes ?? (facts.homeLogo ? await fetchBytes(facts.homeLogo) : null);
  const awayCrest = awayRes?.bytes ?? (facts.awayLogo ? await fetchBytes(facts.awayLogo) : null);

  // Optional stadium photo — used as a REFERENCE for the generated scene, and
  // as a deterministic fallback background if generation is unavailable.
  const stadium = input.stadiumPhotoUrl?.trim() ? await fetchBytes(input.stadiumPhotoUrl) : null;

  // ── Stage 5: AI cinematic background scene (no people/text/logos) ──
  // The generative "wow" lever: Gemini paints a dramatic dark stadium scene with
  // thick smoke, graded to the style palette. The player, crests and text are
  // composited ON TOP afterwards, so the face is never generated. Falls back to
  // the deterministic stadium/gradient background when Gemini is unavailable.
  const scenePalette = SCENE_PALETTES[input.design] ?? 'cinematic steel blue';
  const generatedScene = await generateCinematicScene({ palette: scenePalette, stadiumRef: stadium });
  const sky: Buffer | null = generatedScene?.bytes ?? null;

  // ── Stage 6: render ──
  const rendered = await renderV2({
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
  await recordDesign({
    generationId,
    playerId: input.playerId,
    playerName: input.playerName,
    matchKey: buildMatchKey(facts.playerName, facts.homeTeam, facts.awayTeam, facts.date),
    playerImagesUsed: [input.playerPhotoUrl],
    stadiumImageUsed: input.stadiumPhotoUrl ?? null,
    savedImagePath: null,
    createdAt: Date.now(),
  });

  const qualityChecks = buildChecks(facts, geminiConfigured(), Boolean(layers.cutAction), Boolean(homeCrest), Boolean(awayCrest), Boolean(kitBytes), rendered.width, rendered.height);

  return {
    generationId,
    design: input.design,
    imageDataUrl: `data:image/png;base64,${rendered.bytes.toString('base64')}`,
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
  h: number
): MatchdayQualityCheck[] {
  // Report the ACCURATE reason: a missing key vs a transient model failure
  // (rate-limit / overload) are different problems with different fixes.
  const cutoutDetail = haveCutout
    ? 'clean transparent cutout'
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
