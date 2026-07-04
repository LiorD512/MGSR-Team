import { applyExplorationBoost, selectExplorationStrategy } from './explorationStrategies';
import { buildQueryFingerprint } from './discoveryDiversity';

export interface EnhancedScoringOptions {
  baseScore: number;
  candidate: Record<string, unknown>;
  queryFingerprint: string;
  diversityMode: 'strict' | 'balanced' | 'discovery';
  relevance: number;
  seenTimes: number;
  overlap: number;
  rarity: number;
  noveltyPenalty: number;
  overlapPenalty: number;
  rarityBonus: number;
  noise: number;
  seenPenalty: number;
  rng: () => number;
}

export function computeEnhancedScore(options: EnhancedScoringOptions): number {
  const {
    baseScore,
    candidate,
    queryFingerprint,
    diversityMode,
    relevance,
    seenTimes,
    overlap,
    rarity,
    noveltyPenalty,
    overlapPenalty,
    rarityBonus,
    noise,
    seenPenalty,
    rng,
  } = options;

  let score =
    relevance + rarity * rarityBonus - overlap * overlapPenalty - noveltyPenalty + rng() * noise;

  if (diversityMode === 'discovery' && seenTimes > 3) {
    score *= 0.6;
  }

  if (diversityMode === 'discovery') {
    const strategy = selectExplorationStrategy(queryFingerprint, false);
    const boost = applyExplorationBoost(candidate, strategy);
    score += boost;
  }

  return Math.max(0, score);
}

export function shouldApplyExplorationMode(
  seenCount: number,
  totalCandidates: number,
): boolean {
  const repititionRatio = seenCount / Math.max(1, totalCandidates);
  return repititionRatio > 0.5;
}

export function getExplorationMultiplier(
  seenTimes: number,
  diversityMode: 'strict' | 'balanced' | 'discovery',
): number {
  if (diversityMode === 'strict') return 1.0;
  if (diversityMode === 'balanced') {
    if (seenTimes === 0) return 1.0;
    if (seenTimes === 1) return 0.9;
    if (seenTimes <= 3) return 0.7;
    return 0.3;
  }

  if (diversityMode === 'discovery') {
    if (seenTimes === 0) return 1.0;
    if (seenTimes === 1) return 0.85;
    if (seenTimes <= 2) return 0.6;
    if (seenTimes <= 4) return 0.2;
    return 0.05;
  }

  return 1.0;
}
