import { buildQueryFingerprint } from './discoveryDiversity';

interface SearchPattern {
  queryFingerprint: string;
  position?: string;
  nationality?: string;
  league?: string;
  ageRange?: { min: number; max: number };
  valueRange?: { min: number; max: number };
  timestamp: number;
}

class SearchPatternAnalyzer {
  private patterns: SearchPattern[] = [];
  private readonly maxPatterns = 30;

  recordPattern(query: string, tokens: string[]): void {
    const position = this.extractToken(tokens, 'pos:');
    const nationality = this.extractToken(tokens, 'nation:');
    const league = this.extractToken(tokens, 'league:');

    const pattern: SearchPattern = {
      queryFingerprint: buildQueryFingerprint(query),
      position,
      nationality,
      league,
      timestamp: Date.now(),
    };

    this.patterns.push(pattern);
    if (this.patterns.length > this.maxPatterns) {
      this.patterns.shift();
    }
  }

  private extractToken(tokens: string[], prefix: string): string | undefined {
    const token = tokens.find((t) => t.startsWith(prefix));
    return token ? token.slice(prefix.length) : undefined;
  }

  detectRepetitivePattern(): { detected: boolean; type?: string; count?: number } {
    if (this.patterns.length < 3) return { detected: false };

    const recent = this.patterns.slice(-10);

    const positionCounts = new Map<string, number>();
    const leagueCounts = new Map<string, number>();
    const nationalityCounts = new Map<string, number>();

    for (const p of recent) {
      if (p.position) positionCounts.set(p.position, (positionCounts.get(p.position) ?? 0) + 1);
      if (p.league) leagueCounts.set(p.league, (leagueCounts.get(p.league) ?? 0) + 1);
      if (p.nationality) nationalityCounts.set(p.nationality, (nationalityCounts.get(p.nationality) ?? 0) + 1);
    }

    const maxPosition = Math.max(...Array.from(positionCounts.values()), 0);
    const maxLeague = Math.max(...Array.from(leagueCounts.values()), 0);
    const maxNationality = Math.max(...Array.from(nationalityCounts.values()), 0);

    if (maxPosition >= 5) return { detected: true, type: 'position', count: maxPosition };
    if (maxLeague >= 4) return { detected: true, type: 'league', count: maxLeague };
    if (maxNationality >= 5) return { detected: true, type: 'nationality', count: maxNationality };

    return { detected: false };
  }

  suggestAlternative(): { dimension: string; values: string[] } | null {
    const repetition = this.detectRepetitivePattern();
    if (!repetition.detected || !repetition.type) return null;

    const recent = this.patterns.slice(-15);
    const alternatives: Record<string, Set<string>> = {
      position: new Set(),
      league: new Set(),
      nationality: new Set(),
    };

    for (const p of recent) {
      if (p.position) alternatives.position.add(p.position);
      if (p.league) alternatives.league.add(p.league);
      if (p.nationality) alternatives.nationality.add(p.nationality);
    }

    let suggestDimension = 'league';
    if (repetition.type === 'position') suggestDimension = 'league';
    if (repetition.type === 'league') suggestDimension = 'nationality';
    if (repetition.type === 'nationality') suggestDimension = 'position';

    return {
      dimension: suggestDimension,
      values: Array.from(alternatives[suggestDimension as keyof typeof alternatives] || []).slice(0, 5),
    };
  }

  getRecentLeagues(): string[] {
    const leagues = new Set<string>();
    for (const p of this.patterns.slice(-20)) {
      if (p.league) leagues.add(p.league);
    }
    return Array.from(leagues).slice(0, 5);
  }

  getRecentPositions(): string[] {
    const positions = new Set<string>();
    for (const p of this.patterns.slice(-20)) {
      if (p.position) positions.add(p.position);
    }
    return Array.from(positions).slice(0, 5);
  }

  clear(): void {
    this.patterns = [];
  }
}

export const patternAnalyzer = new SearchPatternAnalyzer();

export function detectPatternLooping(): { looping: boolean; pattern?: string; suggestion?: string } {
  const repetition = patternAnalyzer.detectRepetitivePattern();
  if (!repetition.detected) return { looping: false };

  const alternative = patternAnalyzer.suggestAlternative();
  return {
    looping: true,
    pattern: repetition.type,
    suggestion: alternative?.dimension,
  };
}

export function getAlternativeSuggestion(): { dimension: string; values: string[] } | null {
  return patternAnalyzer.suggestAlternative();
}

export function recordSearchPatternMetadata(query: string, tokens: string[]): void {
  patternAnalyzer.recordPattern(query, tokens);
}
