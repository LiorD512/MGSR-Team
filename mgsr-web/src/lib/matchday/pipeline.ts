/**
 * MATCHDAY generation pipeline (section 11).
 *
 *   match facts → assets (player + stadium) → composition → AI background →
 *   composite (player cutouts + stadium) → deterministic text/logos →
 *   quality checks → save + design memory
 *
 * This orchestrator is intentionally phase-seamed: each stage is a separate
 * module so phases can be built and tested independently. Stages that are not
 * yet implemented degrade gracefully rather than failing the whole run, so the
 * UI always gets back the factual data it can already show.
 */

import { randomUUID } from 'crypto';
import type {
  MatchdayGenerateInput,
  MatchdayGenerateResult,
  MatchdayGenerationRecord,
  MatchdayQualityCheck,
} from './types';
import { gatherMatchFacts } from './facts';
import { planComposition } from './composition';
import { buildMatchKey, recordDesign } from './designMemory';
import { createDefaultImageProvider } from './providers/gemini';

export class MatchdayError extends Error {
  constructor(message: string, readonly code: 'NO_MATCH' | 'PROVIDER_UNCONFIGURED' | 'GENERATION_FAILED') {
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

  // ── Stage 2: creative concept (varies vs. design memory) ──
  const composition = await planComposition(input.playerId, input.playerName, {
    mood: input.overrides?.mood,
    layout: input.overrides?.layout,
  });

  // ── Stage 3–6: assets, AI background, compositing, overlay ──
  // Implemented across phases 2–4. `renderMatchday` is the single entry point
  // the later phases fill in. Until then it produces a factual placeholder so
  // the UI flow, progress steps, and data plumbing are all exercised.
  const provider = createDefaultImageProvider();
  const { imageDataUrl, assets, qualityChecks } = await renderMatchday({
    generationId,
    input,
    facts,
    composition,
    provider,
  });

  // ── Stage 7: design memory ──
  const record: MatchdayGenerationRecord = {
    generationId,
    playerId: input.playerId,
    playerName: input.playerName,
    matchKey: buildMatchKey(facts.playerName, facts.homeTeam, facts.awayTeam, facts.date),
    compositionStyle: composition.layout,
    mood: composition.mood,
    colorMood: composition.colorMood,
    lightingStyle: composition.lightingStyle,
    playerImagesUsed: assets.playerImages.map((p) => p.url),
    stadiumImageUsed: assets.stadium?.url ?? null,
    savedImagePath: null,
    createdAt: Date.now(),
    providerId: provider.id,
  };
  await recordDesign(record);

  return {
    generationId,
    imageDataUrl,
    facts,
    composition,
    assets,
    qualityChecks,
    providerId: provider.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// renderMatchday — the visual pipeline (phases 2–4 land here).
// For Phase 1 it returns a lightweight placeholder + baseline quality checks so
// the end-to-end flow works before the AI/compositing stages exist.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MatchdayAssets,
  MatchdayComposition,
  MatchdayMatchFacts,
  ImageGenerationProvider,
} from './types';
import { gatherAssets } from './assets';
import { imageSearchConfigured } from './imageSearch';
import sharp from 'sharp';
import { buildBackgroundPrompt, buildScenePrompt } from './composition';
import { composite } from './compositor';
import { applyOverlay } from './overlay';
import { CANVAS_W, CANVAS_H } from './layout';
import type { GeneratedImage } from './types';

/**
 * Fetch the authoritative portrait from the player's Transfermarkt profile.
 * This is tied to the exact player page, so it is the correct person even when
 * their name is shared by other footballers. Best-effort — returns null on
 * failure and the pipeline falls back to search with a low-confidence flag.
 */
async function fetchTmPortrait(tmProfile: string): Promise<string | null> {
  try {
    const { handlePlayer } = await import('@/lib/transfermarkt');
    const player = await handlePlayer(tmProfile);
    return player.profileImage || null;
  } catch (err) {
    console.error('[matchday] TM portrait fetch failed:', err);
    return null;
  }
}

/** Normalise any AI output to the exact 9:16 canvas (cover-fit). */
async function fitToCanvas(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize(CANVAS_W, CANVAS_H, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();
}

interface RenderArgs {
  generationId: string;
  input: MatchdayGenerateInput;
  facts: MatchdayMatchFacts;
  composition: MatchdayComposition;
  provider: ImageGenerationProvider;
}

async function renderMatchday(args: RenderArgs): Promise<{
  imageDataUrl: string;
  assets: MatchdayAssets;
  qualityChecks: MatchdayQualityCheck[];
}> {
  const { facts, input, composition, provider } = args;

  // The authoritative identity anchor is the Transfermarkt profile portrait
  // (tied to the exact player page). If the DB value is missing, re-fetch it
  // from the player's TM profile so the likeness is never guessed by search.
  let profileImage = input.playerImage ?? null;
  if (!profileImage && input.tmProfile) {
    profileImage = await fetchTmPortrait(input.tmProfile);
  }

  // ── Stage 3: gather real player + stadium images ──
  const gathered = await gatherAssets({
    playerName: input.playerName,
    club: input.club,
    profileImage,
    instagramHandle: input.instagramHandle,
    facts,
    overrides: {
      playerImageUrls: input.overrides?.playerImageUrls,
      stadiumImageUrl: input.overrides?.stadiumImageUrl,
    },
  });

  const qualityChecks = [
    ...baselineFactChecks(facts),
    ...assetChecks(gathered.summary),
  ];

  // Identity confidence: PASS only when the authoritative DB/TM portrait
  // anchors the likeness. A name-search-only hero can be the wrong same-named
  // player, so it is a WARN the operator should review/override.
  qualityChecks.push({
    id: 'identity',
    label: 'Correct player identity anchored',
    status: gathered.identityAnchored ? 'pass' : gathered.playerImages.length ? 'warn' : 'fail',
    detail: gathered.identityAnchored
      ? 'anchored on verified profile portrait'
      : gathered.playerImages.length
        ? 'no verified portrait — using search photo; verify or override images'
        : 'no player photo available',
  });

  // ── Stage 4+5: produce the cinematic artwork ──
  // PRIMARY path: single image-to-image scene composition — the model builds
  // the whole scene around the REAL player photos so nothing looks pasted.
  // FALLBACK path: AI background + sharp cutout compositing, then graded
  // stadium, then a solid canvas — each degrading gracefully.
  const providerConfigured = provider.isConfigured();
  let baseBytes: Buffer | null = null;
  let renderMode: 'scene' | 'composited' | 'graded' | 'none' = 'none';

  if (providerConfigured && provider.composeScene && gathered.playerImages.length > 0) {
    try {
      const prompt = buildScenePrompt(
        composition,
        facts.playerName,
        facts.venue,
        gathered.playerImages.length,
        Boolean(gathered.stadium)
      );
      const scene = await provider.composeScene({
        prompt,
        playerImages: gathered.playerImages.map((p) => ({ bytes: p.bytes, mimeType: p.mimeType })),
        stadium: gathered.stadium
          ? { bytes: gathered.stadium.bytes, mimeType: gathered.stadium.mimeType }
          : undefined,
        aspectRatio: '9:16',
      });
      baseBytes = await fitToCanvas(scene.bytes);
      renderMode = 'scene';
    } catch (err) {
      console.error('[matchday] scene composition failed, falling back to compositor:', err);
    }
  }

  if (!baseBytes) {
    // Fallback: generate a background, then composite cutouts with sharp.
    let background: GeneratedImage | null = null;
    if (providerConfigured) {
      try {
        const prompt = buildBackgroundPrompt(composition, facts.venue, Boolean(gathered.stadium));
        background = await provider.generateBackground({
          prompt,
          referenceImages: gathered.stadium
            ? [{ bytes: gathered.stadium.bytes, mimeType: gathered.stadium.mimeType }]
            : undefined,
          aspectRatio: '9:16',
        });
      } catch (err) {
        console.error('[matchday] background generation failed, using graded stadium:', err);
      }
    }
    const composited = await composite({
      composition,
      background,
      stadium: gathered.stadium,
      players: gathered.playerImages,
      provider,
    });
    baseBytes = composited.bytes;
    renderMode = background ? 'composited' : gathered.stadium ? 'graded' : 'none';
  }

  qualityChecks.push({
    id: 'artwork',
    label: 'Cinematic artwork (identity preserved)',
    status: renderMode === 'scene' ? 'pass' : renderMode === 'none' ? 'fail' : 'warn',
    detail:
      renderMode === 'scene'
        ? `AI scene composition · ${composition.mood} · ${composition.layout}`
        : renderMode === 'composited'
          ? 'AI background + composited real player'
          : renderMode === 'graded'
            ? providerConfigured
              ? 'AI unavailable — graded real stadium + real player'
              : 'GEMINI_API_KEY not set — graded real stadium + real player'
            : 'no artwork sources available',
  });

  // ── Stage 6: deterministic factual text + real club logos on top ──
  // baseBytes is always assigned by the fallback chain above.
  const overlayResult = await applyOverlay({ base: baseBytes as Buffer, facts });
  qualityChecks.push({
    id: 'logos_placed',
    label: 'Original club logos placed',
    status:
      overlayResult.homeLogoPlaced && overlayResult.awayLogoPlaced
        ? 'pass'
        : overlayResult.homeLogoPlaced || overlayResult.awayLogoPlaced
          ? 'warn'
          : 'warn',
    detail: `${overlayResult.homeLogoPlaced ? 'home ✓' : 'home ✗'} · ${
      overlayResult.awayLogoPlaced ? 'away ✓' : 'away ✗'
    }`,
  });
  qualityChecks.push({
    id: 'factual_text',
    label: 'Factual text rendered (not AI)',
    status: 'pass',
    detail: `${facts.homeTeam} vs ${facts.awayTeam} • ${facts.date}`,
  });

  const imageDataUrl = `data:image/png;base64,${overlayResult.bytes.toString('base64')}`;

  return { imageDataUrl, assets: gathered.summary, qualityChecks };
}

function assetChecks(assets: MatchdayAssets): MatchdayQualityCheck[] {
  const checks: MatchdayQualityCheck[] = [];
  const configured = imageSearchConfigured();
  const playerCount = assets.playerImages.length;
  const hasHero = assets.playerImages.some((p) => p.role === 'hero');

  checks.push({
    id: 'player_images',
    label: 'Player images found',
    status: playerCount >= 2 && hasHero ? 'pass' : playerCount >= 1 ? 'warn' : 'fail',
    detail: configured
      ? `${playerCount} image(s)${hasHero ? ', hero ✓' : ''}`
      : 'image search not configured (set SERPER_API_KEY)',
  });
  checks.push({
    id: 'stadium_image',
    label: 'Real stadium image',
    status: assets.stadium ? 'pass' : 'warn',
    detail: assets.stadium ? assets.stadium.venue : 'no stadium image sourced',
  });
  return checks;
}

function baselineFactChecks(facts: MatchdayMatchFacts): MatchdayQualityCheck[] {
  const checks: MatchdayQualityCheck[] = [];
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
    detail: `${facts.date}${facts.time ? ` • ${facts.time}` : ' • time TBC'}`,
  });
  checks.push({
    id: 'competition',
    label: 'Competition / round',
    status: facts.competition ? 'pass' : 'warn',
    detail: [facts.competition, facts.round].filter(Boolean).join(' • ') || 'not listed',
  });
  checks.push({
    id: 'venue',
    label: 'Venue resolved',
    status: facts.venue ? 'pass' : 'warn',
    detail: facts.venue || 'venue TBC',
  });
  checks.push({
    id: 'logos',
    label: 'Club logos available',
    status: facts.homeLogo && facts.awayLogo ? 'pass' : 'warn',
    detail: `${facts.homeLogo ? 'home ✓' : 'home ✗'} · ${facts.awayLogo ? 'away ✓' : 'away ✗'}`,
  });
  return checks;
}
