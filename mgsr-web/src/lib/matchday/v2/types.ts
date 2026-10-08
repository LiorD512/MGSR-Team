/**
 * MATCHDAY v2 — AI-assisted designed posters.
 *
 * Philosophy and safety rail:
 *   The player's FACE is never AI-generated. The source is always a photograph a
 *   human chose. Gemini is used only to (a) cut the player out cleanly, (b)
 *   optionally swap the shirt to the correct kit from a real reference, and (c)
 *   optionally produce an alternate body pose — in every case the face/identity
 *   is preserved. Match facts and crests are sourced, never invented.
 *
 * This lives alongside the original deterministic pipeline (../pipeline.ts),
 * which remains available. v2 is the "designed" look requested by the product.
 */

import type { MatchdayMatchFacts, MatchdayQualityCheck } from '../types';

export type MatchdayDesignId =
  | 'midnight'
  | 'golden'
  | 'storm'
  | 'marble'
  | 'inferno'
  | 'frost'
  | 'prestige'
  | 'electric';

export interface MatchdayDesign {
  id: MatchdayDesignId;
  /** Human label shown in the design picker. */
  name: string;
  /** One-line description for the picker card. */
  blurb: string;
}

export const MATCHDAY_DESIGNS: MatchdayDesign[] = [
  { id: 'midnight', name: 'Midnight', blurb: 'Black marble, monochrome portrait + colour action.' },
  { id: 'golden', name: 'Golden Hour', blurb: 'Sunset stadium sky, dual pose, centred.' },
  { id: 'storm', name: 'Storm', blurb: 'Dramatic storm sky, three-pose composition.' },
  { id: 'marble', name: 'Marble', blurb: 'Clean white marble, portrait backdrop, framed crests.' },
  { id: 'inferno', name: 'Inferno', blurb: 'Fiery red-orange energy with a bold diagonal split.' },
  { id: 'frost', name: 'Frost', blurb: 'Cool cinematic ice-blue with a teal rim glow.' },
  { id: 'prestige', name: 'Prestige', blurb: 'Luxury black & gold, art-deco editorial elegance.' },
  { id: 'electric', name: 'Electric', blurb: 'Vibrant neon cyber energy with glowing accents.' },
];

/** A fixture already resolved by the dossier — used verbatim, never re-scraped. */
export interface MatchdayV2Fixture {
  homeTeam: string;
  awayTeam: string;
  playerSide: 'home' | 'away';
  homeLogo: string | null;
  awayLogo: string | null;
  date: string;
  time: string | null;
  competition: string | null;
  round: string | null;
  venue: string | null;
}

export interface MatchdayV2Input {
  playerId: string | null;
  playerName: string;
  tmProfile?: string | null;
  club: string;
  clubCountry?: string | null;
  clubLogo?: string | null;
  /** Pre-resolved fixture from the dossier (preferred over scraping). */
  fixture?: MatchdayV2Fixture | null;

  /** Curated player photograph (required). */
  playerPhotoUrl?: string | null;
  /** Optional curated stadium photograph. */
  stadiumPhotoUrl?: string | null;
  /** Optional official kit reference image — enables the kit swap. */
  kitPhotoUrl?: string | null;
  /** Squad number to place on the swapped kit. */
  squadNumber?: string | null;

  /** Which named design to render. */
  design: MatchdayDesignId;
}

export interface MatchdayV2Result {
  generationId: string;
  design: MatchdayDesignId;
  /** Data URL (base64 PNG) of the finished 1080×1920 image. */
  imageDataUrl: string;
  facts: MatchdayMatchFacts;
  qualityChecks: MatchdayQualityCheck[];
}
