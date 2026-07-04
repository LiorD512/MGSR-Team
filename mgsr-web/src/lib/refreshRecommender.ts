import { patternAnalyzer } from './searchPatternBreaker';
import { sessionTracker } from './sessionDiversityTracker';

export interface RefreshRecommendation {
  type: 'new_position' | 'new_league' | 'new_nationality' | 'strategy_shift' | 'underexposed' | 'momentum';
  title: string;
  description: string;
  suggestedParams: Record<string, string | number>;
  reason: string;
  priority: number;
}

export function generateRefreshRecommendations(): RefreshRecommendation[] {
  const recommendations: RefreshRecommendation[] = [];

  const sessionDiversity = sessionTracker.getRecentDiversity(5);
  const pattern = patternAnalyzer.detectRepetitivePattern();

  if (sessionDiversity < 0.5) {
    recommendations.push({
      type: 'strategy_shift',
      title: '🔄 Switch Discovery Mode',
      description: 'Your searches show low diversity. Try "Discovery" mode to explore far beyond typical profiles.',
      suggestedParams: { mode: 'discovery' },
      reason: 'Session diversity is only 50% - breaking patterns needed',
      priority: 10,
    });
  }

  if (pattern.detected && pattern.type === 'position') {
    recommendations.push({
      type: 'new_position',
      title: '⚽ Explore Different Positions',
      description: `You've searched for the same position ${pattern.count} times. Try a different role.`,
      suggestedParams: { diversify_position: 'true' },
      reason: `Repetitive position searching detected (${pattern.count}x in last 10 searches)`,
      priority: 9,
    });
  }

  if (pattern.detected && pattern.type === 'league') {
    const alternative = patternAnalyzer.suggestAlternative();
    if (alternative) {
      recommendations.push({
        type: 'new_league',
        title: '🌍 Discover Underrated Leagues',
        description: `Switch from your usual league to find hidden gems in ${alternative.values[0]}.`,
        suggestedParams: { league: alternative.values[0] },
        reason: `You've focused heavily on one league (${pattern.count}x recently)`,
        priority: 8,
      });
    }
  }

  if (pattern.detected && pattern.type === 'nationality') {
    recommendations.push({
      type: 'new_nationality',
      title: '🌐 Cross-Border Exploration',
      description: 'Branch into different nationalities to find international talent',
      suggestedParams: { randomize_nationality: 'true' },
      reason: `Nationality searches are clustered around same countries`,
      priority: 7,
    });
  }

  if (sessionTracker.getSearchCount() % 7 === 0 && sessionTracker.getSearchCount() > 0) {
    recommendations.push({
      type: 'momentum',
      title: '⚡ Catch Rising Stars',
      description: 'Find players whose ratings are improving this season - emerging talent.',
      suggestedParams: { focus_momentum: 'true' },
      reason: 'Time for momentum-based discovery (fresh angles keep search fresh)',
      priority: 6,
    });
  }

  recommendations.push({
    type: 'underexposed',
    title: '💎 Hidden Gems Mode',
    description: 'Dive into players nobody else searches for - underrated talents with huge potential.',
    suggestedParams: { underexposed_only: 'true' },
    reason: 'Regular exploration - introducing least-searched player segments',
    priority: 5,
  });

  return recommendations.sort((a, b) => b.priority - a.priority);
}

export function generateIntelligentAlternativeSearch(): {
  query: string;
  reason: string;
  expectedDiversity: string;
} | null {
  const alternative = patternAnalyzer.suggestAlternative();
  if (!alternative || alternative.values.length === 0) return null;

  const recentPositions = patternAnalyzer.getRecentPositions();
  const recentLeagues = patternAnalyzer.getRecentLeagues();

  let query = '';
  let reason = '';

  if (alternative.dimension === 'league' && recentPositions.length > 0) {
    query = `${recentPositions[0]} | ${alternative.values[0]}`;
    reason = `Shift league perspective: same position, new league`;
  } else if (alternative.dimension === 'position' && recentLeagues.length > 0) {
    query = `${alternative.values[0]} | ${recentLeagues[0]}`;
    reason = `New position in familiar league`;
  } else if (alternative.dimension === 'nationality') {
    query = `${alternative.values[0]} | National team`;
    reason = `Nationality-focused deep dive`;
  }

  return query
    ? {
        query,
        reason,
        expectedDiversity: 'High - completely different dimension',
      }
    : null;
}

export function getRefreshHint(): string {
  const recommendations = generateRefreshRecommendations();
  if (recommendations.length === 0) return 'Keep exploring!';

  const top = recommendations[0];
  if (top.type === 'strategy_shift') {
    return '💡 Tip: Switch to "Discovery" mode for more diverse results';
  }
  if (top.type === 'new_position') {
    return '💡 Tip: Try searching for a different position - you might find gems elsewhere';
  }
  if (top.type === 'new_league') {
    return '💡 Tip: Explore different leagues for fresh talent';
  }
  if (top.type === 'momentum') {
    return '⚡ Tip: Check out rising stars - players gaining form this season';
  }
  if (top.type === 'underexposed') {
    return '💎 Tip: Enable "Hidden Gems" mode for underrated discoveries';
  }

  return 'Try a different search dimension for more variety';
}

export function estimateFreshResults(
  recentSearchCount: number,
): { freshPercent: number; warning: boolean } {
  const diversity = sessionTracker.getRecentDiversity(5);
  const freshPercent = Math.round(diversity * 100);

  return {
    freshPercent,
    warning: freshPercent < 50,
  };
}
