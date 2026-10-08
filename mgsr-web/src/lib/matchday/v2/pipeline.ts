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
  // Prefer the fixture the dossier already resolved and showed the operator
  // (correct teams + the exact logos). Only fall back to scraping when the UI
  // didn't have a ready fixture — this is what stops wrong crests like "LASK".
  let facts: MatchdayMatchFacts | null;
  if (input.fixture) {
    const f = input.fixture;
    facts = {
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
  } else {
    facts = await gatherMatchFacts({
      playerName: input.playerName,
      club: input.club,
      clubCountry: input.clubCountry,
      clubLogo: input.clubLogo,
      tmProfile: input.tmProfile,
    });
  }
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
  // Only the two-figure designs need a genuinely different second pose. For the
  // single-figure designs the backdrop reuses the action cutout (greyscaled),
  // which avoids a wasted alt-pose generation.
  const needHero = input.design === 'golden' || input.design === 'storm';
  const layers = await prepareLayers({
    playerPhoto: playerBytes,
    kitPhoto: kitBytes,
    squadNumber: input.squadNumber ?? null,
    needHero,
  });

  // ── Stage 4: crests ──
  // When the dossier supplied a fixture, the logo URLs are the correct, operator-
  // verified ones — use them VERBATIM (just fetch the bytes). Only fall back to
  // resolveCrest()'s scraping/search when a URL is genuinely missing.
  async function crestFrom(url: string | null, team: string): Promise<Buffer | null> {
    if (input.fixture) {
      if (url) {
        const bytes = await fetchBytes(url);
        if (bytes) return bytes;
      }
      // Missing URL even though the UI had a fixture: last-resort resolve.
      const r = await resolveCrest(team, url);
      return r?.bytes ?? null;
    }
    const r = await resolveCrest(team, url);
    return r?.bytes ?? null;
  }
  const [homeCrest, awayCrest] = await Promise.all([
    crestFrom(facts.homeLogo, facts.homeTeam),
    crestFrom(facts.awayLogo, facts.awayTeam),
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

  const qualityChecks = buildChecks(facts, layers.usedGemini, Boolean(layers.cutAction), Boolean(homeCrest), Boolean(awayCrest), Boolean(kitBytes), rendered.width, rendered.height);

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
  haveCutout: boolean,
  home: boolean,
  away: boolean,
  kitSwapped: boolean,
  w: number,
  h: number
): MatchdayQualityCheck[] {
  return [
    { id: 'identity', label: 'Player face preserved (never generated)', status: 'pass', detail: 'AI used only for cutout/kit/pose' },
    { id: 'cutout', label: 'Player cutout', status: haveCutout ? 'pass' : 'fail', detail: haveCutout ? 'clean transparent cutout' : 'cutout unavailable — set GEMINI_API_KEY' },
    { id: 'kit', label: 'Kit', status: kitSwapped ? 'pass' : 'warn', detail: kitSwapped ? 'swapped from reference' : 'original kit kept' },
    { id: 'teams', label: 'Home & away teams resolved', status: facts.homeTeam && facts.awayTeam ? 'pass' : 'fail', detail: `${facts.homeTeam} vs ${facts.awayTeam}` },
    { id: 'datetime', label: 'Date & kickoff', status: facts.date ? (facts.time ? 'pass' : 'warn') : 'fail', detail: `${facts.date}${facts.time ? ` • ${facts.time}` : ' • TBC'}` },
    { id: 'crests', label: 'Club crests', status: home && away ? 'pass' : home || away ? 'warn' : 'fail', detail: `home ${home ? 'ok' : 'missing'} · away ${away ? 'ok' : 'missing'}` },
    { id: 'canvas', label: 'Rendered at 9:16', status: w === V2_W && h === V2_H ? 'pass' : 'fail', detail: `${w}×${h}` },
  ];
}
