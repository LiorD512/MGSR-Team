/**
 * MATCHDAY asset gathering (sections 3, 7).
 *
 * Finds 2–3 real player photos (prefer the DB profile image + current-club
 * action shots) and a real image of the actual match stadium. Every candidate
 * is downloaded and validated with sharp so we never hand a broken/tiny URL to
 * the compositor.
 *
 * Nothing here is AI-generated — these are real photographs. Identity
 * preservation (section 4) relies on using genuine player images as-is.
 */

import sharp from 'sharp';
import { searchImages, type ImageHit } from './imageSearch';
import type {
  MatchdayAssets,
  MatchdayMatchFacts,
  MatchdayPlayerImage,
  MatchdayStadiumImage,
} from './types';

/** A validated, in-memory image. */
export interface FetchedImage {
  url: string;
  source: string;
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

const MIN_DIMENSION = 200; // reject thumbnails/icons
const FETCH_TIMEOUT = 12000;

export async function fetchAndValidate(
  hit: ImageHit,
  minDimension = MIN_DIMENSION
): Promise<FetchedImage | null> {
  try {
    const res = await fetch(hit.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148 Safari/537.36',
        accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) return null;

    const arrayBuf = await res.arrayBuffer();
    const bytes = Buffer.from(arrayBuf);
    if (bytes.byteLength < 1024) return null; // too small to be useful

    // Decode with sharp to confirm it's a real image and get dimensions.
    const meta = await sharp(bytes).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < minDimension || height < minDimension) return null;

    // Normalise to PNG so downstream compositing has a predictable format.
    const png = await sharp(bytes).png().toBuffer();
    return {
      url: hit.url,
      source: hit.source,
      bytes: png,
      mimeType: 'image/png',
      width,
      height,
    };
  } catch {
    return null;
  }
}

/** Fetch the first N hits that pass validation, trying more than needed. */
async function collectValidated(hits: ImageHit[], need: number): Promise<FetchedImage[]> {
  const out: FetchedImage[] = [];
  for (const hit of hits) {
    if (out.length >= need) break;
    const img = await fetchAndValidate(hit);
    if (img) out.push(img);
  }
  return out;
}

export interface GatheredAssets {
  /** Validated in-memory images keyed by role, for the compositor. */
  playerImages: Array<FetchedImage & { role: MatchdayPlayerImage['role'] }>;
  stadium: (FetchedImage & { venue: string }) | null;
  /** Serialisable summary for the pipeline result + design memory. */
  summary: MatchdayAssets;
  /** True when the hero is the authoritative DB/TM portrait of THIS player. */
  identityAnchored: boolean;
}

export interface GatherInput {
  playerName: string;
  club: string;
  /** DB profile image (preferred hero source). */
  profileImage?: string | null;
  /** Instagram handle (without @) for more targeted photo search. */
  instagramHandle?: string | null;
  facts: MatchdayMatchFacts;
  overrides?: {
    playerImageUrls?: string[];
    stadiumImageUrl?: string;
  };
}

export async function gatherAssets(input: GatherInput): Promise<GatheredAssets> {
  const { images: playerImages, identityAnchored } = await gatherPlayerImages(input);
  const stadium = await gatherStadium(input);

  const summary: MatchdayAssets = {
    playerImages: playerImages.map((p) => ({
      url: p.url,
      role: p.role,
      source: p.source,
      width: p.width,
      height: p.height,
    })),
    stadium: stadium
      ? ({ url: stadium.url, venue: stadium.venue, source: stadium.source } as MatchdayStadiumImage)
      : null,
  };

  return { playerImages, stadium, summary, identityAnchored };
}

/**
 * Player images with a critical identity contract:
 *
 * The tracked player's Transfermarkt/DB profile portrait is the AUTHORITATIVE
 * identity anchor — it is tied to that exact player's page, so it is
 * unambiguously the right person. Name-based web searches are NOT reliable for
 * identity: common names (e.g. "Amadou Doumbouya") return different players. So
 * the anchor is always placed FIRST (role 'hero') and web-search shots are only
 * ever used as extra POSE reference — never as the face source. The scene
 * prompt tells the model to take the face exclusively from the first image.
 *
 * Returns `identityAnchored: true` only when a trustworthy anchor was obtained.
 */
async function gatherPlayerImages(
  input: GatherInput
): Promise<{
  images: Array<FetchedImage & { role: MatchdayPlayerImage['role'] }>;
  identityAnchored: boolean;
}> {
  const roles: MatchdayPlayerImage['role'][] = ['hero', 'action', 'action2'];
  const collected: Array<FetchedImage & { role: MatchdayPlayerImage['role'] }> = [];
  const usedUrls = new Set<string>();

  // Manual override wins entirely (section 15): the operator vouches for these.
  if (input.overrides?.playerImageUrls?.length) {
    const hits: ImageHit[] = input.overrides.playerImageUrls.map((url) => ({ url, source: 'override' }));
    const valid = await collectValidated(hits, 3);
    valid.forEach((img, i) => {
      usedUrls.add(img.url);
      collected.push({ ...img, role: roles[i] ?? 'action2' });
    });
    return { images: collected, identityAnchored: valid.length > 0 };
  }

  // 1) Identity anchor: the DB/Transfermarkt profile portrait. MANDATORY hero.
  let identityAnchored = false;
  if (input.profileImage) {
    const heroValid = await collectValidated([{ url: input.profileImage, source: 'db' }], 1);
    if (heroValid[0]) {
      usedUrls.add(heroValid[0].url);
      collected.push({ ...heroValid[0], role: 'hero' });
      identityAnchored = true;
    }
  }

  // 2) Extra POSE reference shots via search — disambiguated by club so we do
  // not pull a different same-named player. These never become the face source.
  const name = input.playerName;
  const club = input.club && input.club !== '—' ? input.club : '';
  const handle = input.instagramHandle?.replace(/^@/, '').trim();
  // Quote the name to keep it together, and always pair with the club to
  // disambiguate. Handle-led queries first (the player's own account).
  const queries = [
    ...(handle ? [`"${name}" ${club} instagram ${handle}`.trim()] : []),
    `"${name}" ${club} footballer`.trim(),
    `"${name}" ${club} action match`.trim(),
    `"${name}" ${club} running`.trim(),
  ];

  for (const q of queries) {
    if (collected.length >= 3) break;
    const hits = (await searchImages(q, 8)).filter((h) => !usedUrls.has(h.url));
    const need = 3 - collected.length;
    const valid = await collectValidated(hits, need);
    for (const img of valid) {
      if (collected.length >= 3 || usedUrls.has(img.url)) continue;
      usedUrls.add(img.url);
      collected.push({ ...img, role: roles[collected.length] ?? 'action2' });
    }
  }

  // If we have an anchor, it MUST stay the hero (index 0). Only re-sort the
  // remaining (non-anchor) shots by resolution for the best action framing.
  if (identityAnchored && collected.length > 1) {
    const [anchor, ...rest] = collected;
    rest.sort((a, b) => b.width * b.height - a.width * a.height);
    const reordered = [anchor, ...rest];
    reordered.forEach((img, i) => (img.role = roles[i] ?? 'action2'));
    collected.length = 0;
    collected.push(...reordered);
  } else if (!identityAnchored && collected.length > 1) {
    // No anchor: pick the largest as hero but flag low identity confidence.
    collected.sort((a, b) => b.width * b.height - a.width * a.height);
    collected.forEach((img, i) => (img.role = roles[i] ?? 'action2'));
  }

  return { images: collected, identityAnchored };
}

async function gatherStadium(
  input: GatherInput
): Promise<(FetchedImage & { venue: string }) | null> {
  const venue = input.facts.venue;

  // Manual override wins (section 15).
  if (input.overrides?.stadiumImageUrl) {
    const valid = await collectValidated(
      [{ url: input.overrides.stadiumImageUrl, source: 'override' }],
      1
    );
    if (valid[0]) return { ...valid[0], venue: venue || 'override' };
  }

  if (!venue) return null;

  // Prefer the exact venue name; fall back to the hosting club's stadium.
  const hostClub = input.facts.playerSide === 'home' ? input.facts.homeTeam : input.facts.awayTeam;
  const queries = [
    `${venue} stadium football`,
    `${hostClub} stadium ${venue}`.trim(),
    `${venue} football pitch aerial`,
  ];

  for (const q of queries) {
    const hits = await searchImages(q, 8);
    // Stadiums should be landscape and reasonably large.
    const valid = await collectValidated(hits, 1);
    const shot = valid.find((v) => v.width >= v.height) ?? valid[0];
    if (shot) return { ...shot, venue };
  }
  return null;
}
