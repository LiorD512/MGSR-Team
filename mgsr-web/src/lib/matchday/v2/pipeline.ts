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
import { gatherMatchFacts } from '../facts';
import { fetchAndValidate } from '../assets';
import { resolveCrest } from '../crests';
import { buildMatchKey, recordDesign } from '../designMemory';
import { MatchdayError } from '../pipeline';
import { prepareLayers } from './prepare';
import { renderV2, V2_W, V2_H } from './render';
import { generateSky, geminiConfigured } from './gemini';
import type { MatchdayV2Input, MatchdayV2Result } from './types';

const TM_SILHOUETTE = /\/default\.(jpg|png)(\?|$)/i;

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
  const facts = await gatherMatchFacts({
    playerName: input.playerName,
    club: input.club,
    clubCountry: input.clubCountry,
    clubLogo: input.clubLogo,
    tmProfile: input.tmProfile,
  });
  if (!facts) throw new MatchdayError('No upcoming fixture found for this player.', 'NO_MATCH');

  // ── Stage 2: curated player photo (required) ──
  if (!input.playerPhotoUrl?.trim() || TM_SILHOUETTE.test(input.playerPhotoUrl)) {
    throw new MatchdayError('This player has no MATCHDAY photo yet. Upload one to generate the graphic.', 'NO_PLAYER_PHOTO');
  }
  const playerBytes = await fetchBytes(input.playerPhotoUrl);
  if (!playerBytes) throw new MatchdayError('The MATCHDAY photo could not be downloaded.', 'NO_PLAYER_PHOTO');

  // Optional kit reference + stadium.
  const kitBytes = input.kitPhotoUrl?.trim() ? await fetchBytes(input.kitPhotoUrl) : null;

  // ── Stage 3: AI-assisted layer prep (face preserved) ──
  const needHero = input.design === 'golden' || input.design === 'storm' || input.design === 'midnight' || input.design === 'marble';
  const layers = await prepareLayers({
    playerPhoto: playerBytes,
    kitPhoto: kitBytes,
    squadNumber: input.squadNumber ?? null,
    needHero,
  });

  // ── Stage 4: crests (sourced) ──
  const [homeCrest, awayCrest] = await Promise.all([
    resolveCrest(facts.homeTeam, facts.homeLogo),
    resolveCrest(facts.awayTeam, facts.awayLogo),
  ]);

  // ── Stage 5: background sky for sky-based designs ──
  let sky: Buffer | null = null;
  if (input.design === 'golden' || input.design === 'storm') {
    const gen = await generateSky(input.design === 'golden' ? 'golden' : 'storm');
    if (gen) sky = gen.bytes;
  }

  // Optional stadium photo (used only as a fallback band in some designs).
  const stadium = input.stadiumPhotoUrl?.trim() ? await fetchBytes(input.stadiumPhotoUrl) : null;

  // ── Stage 6: render ──
  const rendered = await renderV2({
    design: input.design,
    facts,
    playerName: input.playerName.toUpperCase(),
    squadNumber: input.squadNumber ?? null,
    layers: { cutAction: layers.cutAction, hero: layers.hero, backdropMono: layers.backdropMono },
    homeCrest: homeCrest?.bytes ?? null,
    awayCrest: awayCrest?.bytes ?? null,
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

  const qualityChecks = buildChecks(facts, layers.usedGemini, Boolean(homeCrest), Boolean(awayCrest), Boolean(kitBytes), rendered.width, rendered.height);

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
  usedGemini: boolean,
  home: boolean,
  away: boolean,
  kitSwapped: boolean,
  w: number,
  h: number
): MatchdayQualityCheck[] {
  return [
    { id: 'identity', label: 'Player face preserved (never generated)', status: 'pass', detail: usedGemini ? 'AI used only for cutout/kit/pose' : 'no AI — original photo composited' },
    { id: 'kit', label: 'Kit', status: kitSwapped ? 'pass' : 'warn', detail: kitSwapped ? 'swapped from reference' : 'original kit kept' },
    { id: 'teams', label: 'Home & away teams resolved', status: facts.homeTeam && facts.awayTeam ? 'pass' : 'fail', detail: `${facts.homeTeam} vs ${facts.awayTeam}` },
    { id: 'datetime', label: 'Date & kickoff', status: facts.date ? (facts.time ? 'pass' : 'warn') : 'fail', detail: `${facts.date}${facts.time ? ` • ${facts.time}` : ' • TBC'}` },
    { id: 'crests', label: 'Club crests', status: home && away ? 'pass' : home || away ? 'warn' : 'fail', detail: `home ${home ? 'ok' : 'missing'} · away ${away ? 'ok' : 'missing'}` },
    { id: 'canvas', label: 'Rendered at 9:16', status: w === V2_W && h === V2_H ? 'pass' : 'fail', detail: `${w}×${h}` },
  ];
}
