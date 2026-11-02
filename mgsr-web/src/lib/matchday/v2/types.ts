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
  | 'electric'
  | 'gianttype'
  | 'clubcolors'
  | 'broadsheet'
  | 'cinema'
  | 'blueprint'
  | 'street'
  | 'glass'
  | 'ticket'
  | 'card';

export type MatchdayFamily = 'graphic' | 'cinematic' | 'legacy';

export interface MatchdayDesign {
  id: MatchdayDesignId;
  /** Picker grouping. */
  family?: MatchdayFamily;
  /** Names of the Remix variants, in order (variant = remix % variants.length). */
  variants?: string[];
  /** Human label shown in the design picker. */
  name: string;
  /** One-line description for the picker card. */
  blurb: string;
}

// Four exceptional, cinematic styles — each builds the uploaded stadium into a
// dramatic smoke-filled scene (graded dark + spotlight + rim-light + grounding
// shadow + grain), differing by palette and mood.
export const MATCHDAY_DESIGNS: MatchdayDesign[] = [
  // ── Graphic styles: procedural, own layout + typography, no AI scene (fast, cheap) ──
  { id: 'gianttype', family: 'graphic', name: 'Giant Type', blurb: 'The surname towers behind the player — magazine-cover poster in club colours.', variants: ['Club', 'Opponent', 'Noir'] },
  { id: 'clubcolors', family: 'graphic', name: 'Club Colors', blurb: 'Split in both clubs’ real colours. Every fixture gets its own look.', variants: ['Slash', 'Reverse', 'Halves'] },
  { id: 'broadsheet', family: 'graphic', name: 'Broadsheet', blurb: 'Newspaper front page: halftone print, serif headline, spot colour.', variants: ['Club ink', 'Red ink', 'Late edition'] },
  { id: 'cinema', family: 'graphic', name: 'Cinema', blurb: 'Blockbuster movie poster: huge title, billing block, “in stadiums” date.', variants: ['Blockbuster', 'Thriller', 'Gold premiere'] },
  { id: 'blueprint', family: 'graphic', name: 'Blueprint', blurb: 'Tactics board: pitch grid, line-art glow, coordinates and arrows.', variants: ['Navy', 'Chalkboard', 'Night pitch'] },
  { id: 'street', family: 'graphic', name: 'Street', blurb: 'Fly-poster on a wall: torn paper, tape, stickers, bold stencil type.', variants: ['Concrete', 'Brick', 'Neon night'] },
  { id: 'glass', family: 'graphic', name: 'Glass', blurb: 'Soft gradient orbs + frosted glass cards. Clean, premium, modern.', variants: ['Club glow', 'Sunset', 'Midnight'] },
  { id: 'ticket', family: 'graphic', name: 'Ticket', blurb: 'The poster is the match ticket: perforated stub, real fixture details.', variants: ['Classic', 'VIP black', 'Retro'] },
  { id: 'card', family: 'graphic', name: 'Card', blurb: 'Collector card: foil frame, giant number, club crest, matchup below.', variants: ['Gold', 'Holo', 'Black'] },
  // ── Cinematic styles: AI-painted stadium scene behind the real cutout ──
  { id: 'inferno', family: 'cinematic', name: 'Inferno', blurb: 'Fire: low-angle hero, stacked MATCH/DAY, embers & heat streaks.', variants: ['Ember', 'Crimson', 'Blue flame'] },
  { id: 'frost', family: 'cinematic', name: 'Frost', blurb: 'Ice: frosted-glass fixture panel, HUD rings, drifting snow.', variants: ['Ice', 'Arctic', 'Aurora'] },
  { id: 'prestige', family: 'cinematic', name: 'Prestige', blurb: 'Luxury: double frame, vertical surname, editorial serif.', variants: ['Gold', 'Platinum', 'Rose gold'] },
  { id: 'electric', family: 'cinematic', name: 'Electric', blurb: 'Neon: RGB-split hero, glitch title, terminal data panel.', variants: ['Cyber', 'Acid', 'Sunset'] },
];

/** Variant count + label for a design (Remix cycles through these). */
export function designVariant(id: MatchdayDesignId, remix: number | undefined): { index: number; name: string; count: number } {
  const d = MATCHDAY_DESIGNS.find((x) => x.id === id);
  const names = d?.variants ?? ['Original'];
  const index = (((remix ?? 0) % names.length) + names.length) % names.length;
  return { index, name: names[index], count: names.length };
}


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
  /** Optional SECOND real player photo — used as the secondary figure (a real
   *  second pose, never AI-generated). */
  playerPhoto2Url?: string | null;
  /** Optional curated stadium photograph. */
  stadiumPhotoUrl?: string | null;
  /** Optional official kit reference image — enables the kit swap. */
  kitPhotoUrl?: string | null;
  /** Squad number to place on the swapped kit. */
  squadNumber?: string | null;

  /** Which named design to render. */
  design: MatchdayDesignId;
  /** "Remix" counter: changes the seeded texture/particles, same fixture + design. */
  remix?: number;
}

export interface MatchdayV2Result {
  generationId: string;
  design: MatchdayDesignId;
  /** Remix variant actually rendered (index + label). */
  variant?: { index: number; name: string };
  /** Data URL (base64 JPEG, q92) of the finished 1080×1920 image. */
  imageDataUrl: string;
  facts: MatchdayMatchFacts;
  qualityChecks: MatchdayQualityCheck[];
}
