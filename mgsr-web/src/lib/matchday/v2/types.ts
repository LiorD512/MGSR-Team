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

export type MatchdayDesignId = 'midnight' | 'golden' | 'storm' | 'marble';

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
];

export interface MatchdayV2Input {
  playerId: string | null;
  playerName: string;
  tmProfile?: string | null;
  club: string;
  clubCountry?: string | null;
  clubLogo?: string | null;

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
