/**
 * MATCHDAY composition planner (sections 2 & 13).
 *
 * Chooses a layout + mood + lighting/color direction for each generation while
 * deliberately steering away from what was recently used for the same player
 * (design memory). The goal is "same brand, same DNA, different artwork every
 * time" — never a fixed template.
 */

import type {
  MatchdayComposition,
  MatchdayLayout,
  MatchdayMood,
} from './types';
import { getRecentDesignsForPlayer } from './designMemory';

const ALL_LAYOUTS: MatchdayLayout[] = [
  'hero_right_action_left',
  'hero_left_action_foreground',
  'central_hero_two_actions',
  'fullbody_foreground_closeup_behind',
  'diagonal_runner_portrait_back',
  'two_actions_one_portrait',
  'stadium_dominant_player_overlay',
];

const ALL_MOODS: MatchdayMood[] = ['cinematic', 'dark', 'golden_hour', 'night', 'dramatic'];

const MOOD_COLOR: Record<MatchdayMood, { colorMood: string; lighting: string }> = {
  cinematic: {
    colorMood: 'warm gold and bronze highlights over deep charcoal shadows, high contrast',
    lighting: 'dramatic rim lighting with soft volumetric haze',
  },
  dark: {
    colorMood: 'near-black atmosphere with restrained warm accents, moody and sophisticated',
    lighting: 'low-key lighting, single strong key light, deep falloff',
  },
  golden_hour: {
    colorMood: 'burnished amber and copper sunset tones, glowing warm light',
    lighting: 'low golden sun, long shadows, hazy backlight',
  },
  night: {
    colorMood: 'cool stadium floodlight blues cut with warm bronze, cinematic night',
    lighting: 'stadium floodlights, crisp specular highlights, dark sky',
  },
  dramatic: {
    colorMood: 'stormy high-contrast palette, smoke and dramatic clouds, bronze rim light',
    lighting: 'hard directional light through heavy cloud, theatrical contrast',
  },
};

function pickAvoiding<T>(all: T[], avoid: T[], seed: number): T {
  const fresh = all.filter((x) => !avoid.includes(x));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[seed % pool.length];
}

export function describeLayout(layout: MatchdayLayout): string {
  switch (layout) {
    case 'hero_right_action_left':
      return 'large hero portrait anchored on the right, dynamic action figure on the left, stadium grounded at the bottom';
    case 'hero_left_action_foreground':
      return 'large hero portrait on the left with a running action figure driving through the foreground, stadium behind';
    case 'central_hero_two_actions':
      return 'dominant central hero portrait flanked by two smaller action shots, stadium low in frame';
    case 'fullbody_foreground_closeup_behind':
      return 'full-body player in the foreground with a huge close-up portrait layered behind';
    case 'diagonal_runner_portrait_back':
      return 'diagonal running player sweeping across the foreground with the portrait set deep in the background';
    case 'two_actions_one_portrait':
      return 'two action images balanced against one dominant portrait, strong depth layering';
    case 'stadium_dominant_player_overlay':
      return 'the real stadium becomes the dominant background with the player layered cinematically over it';
  }
}

/**
 * Plan a composition. If `overrides` fix a layout/mood, those win; otherwise we
 * choose values that differ from the player's recent history.
 */
export async function planComposition(
  playerId: string | null,
  playerName: string,
  overrides?: { mood?: MatchdayMood; layout?: MatchdayLayout },
  seedInput?: number
): Promise<MatchdayComposition> {
  const seed = seedInput ?? Math.floor(Math.random() * 100000);
  const prior = await getRecentDesignsForPlayer(playerId, playerName);

  const layout = overrides?.layout ?? pickAvoiding(ALL_LAYOUTS, prior.layouts.slice(0, 3), seed);
  const mood = overrides?.mood ?? pickAvoiding(ALL_MOODS, prior.moods.slice(0, 2), seed >> 2);
  const { colorMood, lighting } = MOOD_COLOR[mood];

  return {
    layout,
    mood,
    colorMood,
    lightingStyle: lighting,
    summary: `${layout} · ${mood} · ${lighting}`,
  };
}

/**
 * Builds the background-only prompt for the AI image model.
 *
 * CRITICAL (sections 4, 6, 10): this prompt must NOT ask the model to draw the
 * player, club logos, or any factual text. Those are composited deterministically
 * afterwards. The model only produces the cinematic environment/atmosphere.
 */
/**
 * Full-scene prompt for provider.composeScene — the preferred path. Describes a
 * premium, cinematic MATCHDAY artwork built AROUND the real player photo(s),
 * matching the reference visual language (agency-grade, dark, dramatic, gold).
 */
export function buildScenePrompt(
  composition: MatchdayComposition,
  playerName: string,
  venue: string | null,
  playerCount: number,
  hasStadiumReference: boolean
): string {
  const stadiumLine = hasStadiumReference
    ? `Ground the scene in the supplied real stadium photograph${venue ? ` (${venue})` : ''}: color grade it, darken it, add atmospheric haze, dramatic clouds and smoke, and blend it seamlessly into one coherent cinematic environment.`
    : `Set the scene in a realistic professional football stadium environment${venue ? ` reminiscent of ${venue}` : ''} with dramatic clouds, smoke and cinematic depth.`;

  const multiLine =
    playerCount > 1
      ? `Compose the player in multiple layered representations of the SAME real person: one large dominant hero portrait plus ${playerCount - 1} smaller dynamic action shot(s), with strong depth and separation.`
      : `Compose one large dominant, dramatic hero representation of the real player.`;

  return [
    `Create a premium football-agency MATCHDAY poster artwork for ${playerName}. Cinematic, dramatic, mature, elegant, high-contrast — the quality of a high-end sports creative director, NOT a generic AI poster or template.`,
    // Identity source rule: the FIRST reference photo is the authoritative
    // likeness. Any later photos may show a different lookalike, so the face,
    // head and hair must be taken ONLY from the first image.
    'IDENTITY SOURCE: the FIRST supplied photo is the definitive likeness of this exact player. Reproduce his face, head shape, hairline, hair and skin tone strictly from that first photo. Use any additional photos ONLY for body pose and action energy — never copy a face from them. Do not merge, average, beautify or swap faces.',
    `Composition style: ${describeLayout(composition.layout)}.`,
    multiLine,
    stadiumLine,
    `Color and mood: ${composition.colorMood}. Lighting: ${composition.lightingStyle}.`,
    'Relight the player to match the scene, add realistic contact shadows and rim light, integrate edges naturally, and add depth so nothing looks pasted or flat. Warm gold/bronze cinematic highlights. Realistic football photography look.',
  ].join(' ');
}

export function buildBackgroundPrompt(
  composition: MatchdayComposition,
  venue: string | null,
  hasStadiumReference: boolean
): string {
  const stadiumLine = hasStadiumReference
    ? `Use the provided stadium photograph as the base environment${venue ? ` (the real ${venue})` : ''}. Color grade it, add atmospheric haze, cinematic depth, dramatic clouds and smoke, and integrate it into a single coherent scene.`
    : `Depict a realistic professional football stadium environment${venue ? ` reminiscent of ${venue}` : ''} with dramatic clouds, smoke and cinematic lighting.`;

  return [
    'Premium football agency MATCHDAY poster BACKGROUND ONLY, 9:16 vertical, cinematic and dramatic.',
    stadiumLine,
    `Color and mood: ${composition.colorMood}.`,
    `Lighting: ${composition.lightingStyle}.`,
    'Dark atmospheric sky, dramatic volumetric clouds and smoke, strong depth and layering, high-end sports campaign quality, realistic photography, mature and elegant, high contrast.',
    'Leave a clean central/vertical negative space suitable for compositing a player and text on top.',
    'IMPORTANT: do NOT render any people, players, faces, club logos, badges, numbers, letters, words or text. Produce ONLY the empty cinematic environment and atmosphere.',
  ].join(' ');
}
