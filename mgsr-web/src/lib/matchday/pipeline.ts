/**
 * MATCHDAY generation pipeline.
 *
 *   match facts → curated photographs → high-resolution crests →
 *   deterministic render → quality checks → design memory
 *
 * There is deliberately no generative step. The previous version asked an image
 * model to return the finished artwork, which meant it repainted the player —
 * producing a convincing picture of somebody who does not exist. A likeness
 * cannot be guaranteed by asking nicely, so the player's face is now always a
 * photograph a human chose, placed by us, and generation is refused outright
 * when no such photograph exists.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import type {
  MatchdayAssets,
  MatchdayGenerateInput,
  MatchdayGenerateResult,
  MatchdayGenerationRecord,
  MatchdayMatchFacts,
  MatchdayQualityCheck,
} from './types';
import { gatherMatchFacts } from './facts';
import { buildMatchKey, recordDesign } from './designMemory';
import { fetchAndValidate } from './assets';
import { resolveCrest, type ResolvedCrest } from './crests';
import {
  renderMatchdayImage,
  CANVAS_W,
  CANVAS_H,
  PLAYER_PANEL,
  STADIUM_BAND,
} from './render';

/** Transfermarkt's placeholder silhouette — never a real likeness. */
const TM_SILHOUETTE = /\/default\.(jpg|png)(\?|$)/i;

export class MatchdayError extends Error {
  constructor(
    message: string,
    readonly code: 'NO_MATCH' | 'NO_PLAYER_PHOTO' | 'GENERATION_FAILED'
  ) {
    super(message);
    this.name = 'MatchdayError';
  }
}

export async function generateMatchday(input: MatchdayGenerateInput): Promise<MatchdayGenerateResult> {
  const generationId = randomUUID();

  // ── Stage 1: factual match data (required) ──
  const facts = await gatherMatchFacts({
    playerName: input.playerName,
    club: input.club,
    clubCountry: input.clubCountry,
    clubLogo: input.clubLogo,
    tmProfile: input.tmProfile,
  });
  if (!facts) {
    throw new MatchdayError('No upcoming fixture found for this player.', 'NO_MATCH');
  }

  // ── Stage 2: the curated player photograph (required) ──
  if (!input.playerPhotoUrl?.trim() || TM_SILHOUETTE.test(input.playerPhotoUrl)) {
    throw new MatchdayError(
      'This player has no MATCHDAY photo yet. Upload one to generate the graphic.',
      'NO_PLAYER_PHOTO'
    );
  }
  const playerPhoto = await fetchAndValidate({ url: input.playerPhotoUrl, source: 'curated' }, {
    minWidth: PLAYER_PANEL.width,
    minHeight: PLAYER_PANEL.height,
  });
  if (!playerPhoto) {
    throw new MatchdayError(
      `The MATCHDAY photo could not be used. It needs to be a reachable image of at least ${PLAYER_PANEL.width}×${PLAYER_PANEL.height}, so it fills the player panel without being enlarged.`,
      'NO_PLAYER_PHOTO'
    );
  }

  // ── Stage 3: optional curated stadium photograph ──
  const stadiumPhoto = input.stadiumPhotoUrl?.trim()
    ? await fetchAndValidate({ url: input.stadiumPhotoUrl, source: 'curated' }, {
        minWidth: STADIUM_BAND.width,
        minHeight: STADIUM_BAND.height,
      })
    : null;

  // ── Stage 4: crests, upgraded to a resolution worth drawing ──
  const [homeCrest, awayCrest] = await Promise.all([
    resolveCrest(facts.homeTeam, facts.homeLogo),
    resolveCrest(facts.awayTeam, facts.awayLogo),
  ]);

  // ── Stage 5: render ──
  const brandMark = await loadBrandMark();
  const rendered = await renderMatchdayImage({
    facts,
    playerPhoto: { bytes: playerPhoto.bytes, mimeType: playerPhoto.mimeType },
    stadiumPhoto: stadiumPhoto ? { bytes: stadiumPhoto.bytes, mimeType: stadiumPhoto.mimeType } : null,
    homeCrest,
    awayCrest,
    brandMark,
  });

  const assets: MatchdayAssets = {
    playerImages: [
      {
        url: playerPhoto.url,
        role: 'hero',
        source: 'curated',
        width: playerPhoto.width,
        height: playerPhoto.height,
      },
    ],
    stadium: stadiumPhoto
      ? { url: stadiumPhoto.url, venue: facts.venue ?? 'curated', source: 'curated' }
      : null,
  };

  const qualityChecks = buildQualityChecks({
    facts,
    playerPhoto: { width: playerPhoto.width, height: playerPhoto.height },
    stadiumPresent: Boolean(stadiumPhoto),
    homeCrest,
    awayCrest,
    rendered,
  });

  const record: MatchdayGenerationRecord = {
    generationId,
    playerId: input.playerId,
    playerName: input.playerName,
    matchKey: buildMatchKey(facts.playerName, facts.homeTeam, facts.awayTeam, facts.date),
    playerImagesUsed: [playerPhoto.url],
    stadiumImageUsed: stadiumPhoto?.url ?? null,
    savedImagePath: null,
    createdAt: Date.now(),
  };
  await recordDesign(record);

  return {
    generationId,
    imageDataUrl: `data:image/png;base64,${rendered.bytes.toString('base64')}`,
    facts,
    assets,
    qualityChecks,
  };
}

/** The BRIT wordmark, emitted as SVG by scripts/convert-logo.js at build time. */
async function loadBrandMark(): Promise<Buffer | null> {
  for (const file of ['logo.svg', 'logo_black.svg']) {
    try {
      return await fs.readFile(path.join(process.cwd(), 'public', file));
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

interface CheckInput {
  facts: MatchdayMatchFacts;
  playerPhoto: { width: number; height: number };
  stadiumPresent: boolean;
  homeCrest: ResolvedCrest | null;
  awayCrest: ResolvedCrest | null;
  rendered: { width: number; height: number };
}

/**
 * Quality checks that mean something. The previous set was entirely
 * informational — one entry was even hardcoded to `pass` — so a visibly broken
 * poster still reported clean. Anything that genuinely invalidates the output
 * now throws before we get here; what remains are real observations.
 */
function buildQualityChecks(input: CheckInput): MatchdayQualityCheck[] {
  const { facts, playerPhoto, homeCrest, awayCrest, rendered } = input;
  const checks: MatchdayQualityCheck[] = [];

  checks.push({
    id: 'identity',
    label: 'Player likeness is a curated photograph',
    status: 'pass',
    detail: `${playerPhoto.width}×${playerPhoto.height} · nothing generated`,
  });
  checks.push({
    id: 'teams',
    label: 'Home & away teams resolved',
    status: facts.homeTeam && facts.awayTeam ? 'pass' : 'fail',
    detail: `${facts.homeTeam} vs ${facts.awayTeam}`,
  });
  checks.push({
    id: 'datetime',
    label: 'Date & kickoff resolved',
    status: facts.date ? (facts.time ? 'pass' : 'warn') : 'fail',
    detail: `${facts.date}${facts.time ? ` • ${facts.time}` : ' • kickoff TBC'}`,
  });
  checks.push({
    id: 'competition',
    label: 'Competition / stage',
    status: facts.competition ? 'pass' : 'warn',
    detail: [facts.country, facts.competition, facts.round].filter(Boolean).join(' • ') || 'not listed',
  });
  checks.push({
    id: 'venue',
    label: 'Venue resolved',
    status: facts.venue ? 'pass' : 'warn',
    detail: facts.venue || 'venue TBC',
  });

  const crestDetail = (crest: ResolvedCrest | null) =>
    crest ? `${crest.width}×${crest.height} (${crest.source})` : 'not found';
  checks.push({
    id: 'crests',
    label: 'Club crests at poster resolution',
    status: homeCrest && awayCrest ? 'pass' : homeCrest || awayCrest ? 'warn' : 'fail',
    detail: `home ${crestDetail(homeCrest)} · away ${crestDetail(awayCrest)}`,
  });
  checks.push({
    id: 'stadium',
    label: 'Stadium band',
    status: input.stadiumPresent ? 'pass' : 'warn',
    detail: input.stadiumPresent ? 'curated photograph' : 'no stadium photo — flat band',
  });
  checks.push({
    id: 'canvas',
    label: 'Rendered at full resolution',
    status: rendered.width === CANVAS_W && rendered.height === CANVAS_H ? 'pass' : 'fail',
    detail: `${rendered.width}×${rendered.height} · no upscale`,
  });

  return checks;
}
