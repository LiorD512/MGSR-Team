import type { Focus, Level, PlayerTierDoc } from './types';

/** The level/focus we show for a player: confirmed tag if any, otherwise the AI proposal. */
export function effectiveLevel(d: PlayerTierDoc): Level | undefined {
  return d.level ?? d.ai?.level;
}
export function effectiveFocus(d: PlayerTierDoc): Focus | undefined {
  return d.focus ?? d.ai?.focus;
}

/** What the AI would change (undefined fields = no change). */
export function suggestionOf(d: PlayerTierDoc): { level?: Level; focus?: Focus; isNew: boolean } | null {
  const ai = d.ai;
  if (!ai || d.locked) return null;
  const level = ai.level !== d.level ? ai.level : undefined;
  const focus = ai.focus !== d.focus ? ai.focus : undefined;
  if (level == null && focus == null) return null;
  // Same suggestion was dismissed already -> hide until the engine proposes something different.
  const dis = d.dismissed;
  if (dis && dis.level === ai.level && dis.focus === ai.focus) return null;
  return { level, focus, isNew: d.level == null && d.focus == null };
}

export function hasSuggestion(d: PlayerTierDoc): boolean {
  return suggestionOf(d) !== null;
}
