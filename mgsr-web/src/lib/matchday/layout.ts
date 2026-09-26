/**
 * MATCHDAY canvas geometry (section 1/2).
 *
 * Defines the 9:16 canvas and, per composition layout, where each player image
 * sits. Coordinates are fractions of the canvas so they scale with CANVAS_W/H.
 * The compositor (compositor.ts) turns these into pixel boxes for sharp.
 *
 * The bottom third is intentionally kept clear of the hero's face so the
 * deterministic text/logo band (Phase 4) has a clean area to occupy.
 */

import type { MatchdayLayout, MatchdayPlayerImage } from './types';

export const CANVAS_W = 1080;
export const CANVAS_H = 1920; // 9:16

/** A placement box in canvas fractions (0..1). `anchor` picks the alignment. */
export interface Placement {
  role: MatchdayPlayerImage['role'];
  /** Target width as a fraction of canvas width. Height follows aspect. */
  widthFrac: number;
  /** Center X / center Y as fractions of canvas. */
  cx: number;
  cy: number;
  /** Draw order — higher is on top. */
  z: number;
  /** Opacity 0..1 (used to push action shots slightly back). */
  opacity: number;
}

/**
 * Returns placements ordered back-to-front. The compositor only draws
 * placements for roles it actually has an image for.
 */
export function placementsFor(layout: MatchdayLayout): Placement[] {
  switch (layout) {
    case 'hero_right_action_left':
      return [
        { role: 'action', widthFrac: 0.5, cx: 0.28, cy: 0.42, z: 1, opacity: 0.92 },
        { role: 'action2', widthFrac: 0.34, cx: 0.34, cy: 0.62, z: 2, opacity: 0.9 },
        { role: 'hero', widthFrac: 0.72, cx: 0.66, cy: 0.4, z: 3, opacity: 1 },
      ];
    case 'hero_left_action_foreground':
      return [
        { role: 'hero', widthFrac: 0.72, cx: 0.36, cy: 0.4, z: 1, opacity: 1 },
        { role: 'action', widthFrac: 0.52, cx: 0.68, cy: 0.58, z: 2, opacity: 0.94 },
        { role: 'action2', widthFrac: 0.32, cx: 0.5, cy: 0.68, z: 3, opacity: 0.9 },
      ];
    case 'central_hero_two_actions':
      return [
        { role: 'action', widthFrac: 0.4, cx: 0.2, cy: 0.5, z: 1, opacity: 0.9 },
        { role: 'action2', widthFrac: 0.4, cx: 0.8, cy: 0.5, z: 1, opacity: 0.9 },
        { role: 'hero', widthFrac: 0.66, cx: 0.5, cy: 0.42, z: 3, opacity: 1 },
      ];
    case 'fullbody_foreground_closeup_behind':
      return [
        { role: 'hero', widthFrac: 0.95, cx: 0.5, cy: 0.36, z: 1, opacity: 0.85 },
        { role: 'action', widthFrac: 0.55, cx: 0.5, cy: 0.55, z: 2, opacity: 1 },
      ];
    case 'diagonal_runner_portrait_back':
      return [
        { role: 'hero', widthFrac: 0.62, cx: 0.62, cy: 0.34, z: 1, opacity: 0.8 },
        { role: 'action', widthFrac: 0.6, cx: 0.4, cy: 0.6, z: 2, opacity: 1 },
      ];
    case 'two_actions_one_portrait':
      return [
        { role: 'action', widthFrac: 0.46, cx: 0.26, cy: 0.44, z: 1, opacity: 0.92 },
        { role: 'action2', widthFrac: 0.42, cx: 0.3, cy: 0.64, z: 2, opacity: 0.9 },
        { role: 'hero', widthFrac: 0.66, cx: 0.68, cy: 0.42, z: 3, opacity: 1 },
      ];
    case 'stadium_dominant_player_overlay':
      return [
        { role: 'hero', widthFrac: 0.62, cx: 0.5, cy: 0.38, z: 2, opacity: 1 },
        { role: 'action', widthFrac: 0.38, cx: 0.24, cy: 0.56, z: 1, opacity: 0.88 },
      ];
  }
}
