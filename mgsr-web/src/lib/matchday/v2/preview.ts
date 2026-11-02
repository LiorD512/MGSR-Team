/**
 * Style previews: the operator's REAL player (cached cutout) and REAL fixture in
 * every style, as small thumbnails, so the picker shows what they will get
 * instead of generic colour swatches.
 *
 * Cost model: the only paid step is the player cutout, which is cached and then
 * reused by the final generation. Previews never call Gemini for a scene — the
 * cinematic styles show their deterministic fallback background (the uploaded
 * stadium photo, graded, when there is one), so the final poster with an AI
 * scene is the same composition with a richer backdrop.
 */
import sharp from 'sharp';
import { MatchdayError } from '../pipeline';
import { prepareLayers } from './prepare';
import { renderV2 } from './render';
import { matchPalette } from './kit/palette';
import { hashSeed } from './kit/prng';
import { buildFacts, requirePlayerBytes, resolveCrests, fetchBytes } from './pipeline';
import { MATCHDAY_DESIGNS, type MatchdayV2Input } from './types';

const THUMB_W = 360;
const CONCURRENCY = 3;

export type PreviewInput = Omit<MatchdayV2Input, 'design'>;

export async function generatePreviews(input: PreviewInput): Promise<Record<string, string>> {
  const facts = buildFacts(input);
  const playerBytes = await requirePlayerBytes(input);
  const kitBytes = input.kitPhotoUrl?.trim() ? await fetchBytes(input.kitPhotoUrl) : null;
  const stadium = input.stadiumPhotoUrl?.trim() ? await fetchBytes(input.stadiumPhotoUrl) : null;

  const layers = await prepareLayers({
    playerPhoto: playerBytes,
    kitPhoto: kitBytes,
    squadNumber: input.squadNumber ?? null,
    needHero: false,
  });
  if (!layers.cutAction) {
    throw new MatchdayError(
      'The player cutout could not be prepared (the image model is busy or not configured). Try again in a moment, or upload a transparent PNG cutout.',
      'GENERATION_FAILED'
    );
  }

  const { homeCrest, awayCrest } = await resolveCrests(facts);
  const palette = await matchPalette(
    facts.playerSide === 'home' ? homeCrest : awayCrest,
    facts.playerSide === 'home' ? awayCrest : homeCrest
  );

  const ids = MATCHDAY_DESIGNS.map((d) => d.id);
  const out: Record<string, string> = {};
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const design = ids[next++];
      try {
        const r = await renderV2({
          design,
          facts,
          playerName: input.playerName.toUpperCase(),
          squadNumber: input.squadNumber ?? null,
          layers: { cutAction: layers.cutAction, hero: layers.cutAction, backdropMono: null, heroIsDistinct: false },
          homeCrest,
          awayCrest,
          stadium,
          sky: null,
          palette,
          seed: hashSeed(facts.playerName, facts.homeTeam, facts.awayTeam, facts.date, design, input.remix ?? 0),
        });
        const jpg = await sharp(r.bytes).resize(THUMB_W).jpeg({ quality: 80 }).toBuffer();
        out[design] = `data:image/jpeg;base64,${jpg.toString('base64')}`;
      } catch (e) {
        console.warn(`[matchday preview] ${design} failed:`, (e as Error).message);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}
