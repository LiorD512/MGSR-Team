export interface SearchAnalytics {
  timestamp: number;
  queryFingerprint: string;
  diversityMode: string;
  resultsCount: number;
  novelResultsCount: number;
  repeatPlayersCount: number;
  strategyUsed?: string;
  sessionId: string;
  clientDiversity: number;
}

class DiscoveryAnalyticsCollector {
  private events: SearchAnalytics[] = [];
  private readonly maxEvents = 1000;

  recordSearch(event: Omit<SearchAnalytics, 'timestamp'>): void {
    this.events.push({
      ...event,
      timestamp: Date.now(),
    });

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  getNoveltyRatio(): number {
    if (this.events.length === 0) return 0;
    const recent = this.events.slice(-10);
    const totalNovel = recent.reduce((sum, e) => sum + e.novelResultsCount, 0);
    const totalResults = recent.reduce((sum, e) => sum + e.resultsCount, 0);
    return totalResults > 0 ? totalNovel / totalResults : 0;
  }

  getAverageDiversity(): number {
    if (this.events.length === 0) return 0.5;
    const recent = this.events.slice(-20);
    const avg = recent.reduce((sum, e) => sum + e.clientDiversity, 0) / recent.length;
    return avg;
  }

  getUniquePlayersDiscovered(windowSize = 50): number {
    const recent = this.events.slice(-windowSize);
    const uniqueKeys = new Set<string>();

    for (const event of recent) {
      const estimate = Math.round(event.resultsCount * (event.novelResultsCount / Math.max(1, event.resultsCount)));
      for (let i = 0; i < estimate; i++) {
        uniqueKeys.add(`${event.queryFingerprint}:${i}`);
      }
    }

    return uniqueKeys.size;
  }

  getMostUsedStrategy(): string | null {
    if (this.events.length === 0) return null;

    const strategyCounts = new Map<string, number>();
    for (const event of this.events.slice(-50)) {
      if (event.strategyUsed) {
        strategyCounts.set(event.strategyUsed, (strategyCounts.get(event.strategyUsed) ?? 0) + 1);
      }
    }

    let mostUsed: string | null = null;
    let maxCount = 0;

    for (const [strategy, count] of strategyCounts.entries()) {
      if (count > maxCount) {
        mostUsed = strategy;
        maxCount = count;
      }
    }

    return mostUsed;
  }

  getRepetitionTrend(): { trend: 'improving' | 'stable' | 'degrading'; ratio: number } {
    if (this.events.length < 2) return { trend: 'stable', ratio: 0 };

    const old = this.events.slice(0, 5);
    const recent = this.events.slice(-5);

    const oldRepetition = old.reduce((sum, e) => sum + e.repeatPlayersCount, 0) / Math.max(1, old.length * 15);
    const recentRepetition = recent.reduce((sum, e) => sum + e.repeatPlayersCount, 0) / Math.max(1, recent.length * 15);

    const ratio = oldRepetition > 0 ? recentRepetition / oldRepetition : 1;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (ratio < 0.7) trend = 'improving';
    if (ratio > 1.3) trend = 'degrading';

    return { trend, ratio };
  }

  generateReport(): {
    noveltyRatio: number;
    averageDiversity: number;
    uniquePlayersLast50: number;
    mostUsedStrategy: string | null;
    repetitionTrend: string;
    searchCount: number;
  } {
    const trend = this.getRepetitionTrend();
    return {
      noveltyRatio: this.getNoveltyRatio(),
      averageDiversity: this.getAverageDiversity(),
      uniquePlayersLast50: this.getUniquePlayersDiscovered(50),
      mostUsedStrategy: this.getMostUsedStrategy(),
      repetitionTrend: `${trend.trend} (${(trend.ratio * 100).toFixed(1)}%)`,
      searchCount: this.events.length,
    };
  }

  export(): SearchAnalytics[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

export const analyticsCollector = new DiscoveryAnalyticsCollector();

export function recordSearchEvent(event: Omit<SearchAnalytics, 'timestamp'>): void {
  analyticsCollector.recordSearch(event);
}

export function getDiscoveryMetrics() {
  return analyticsCollector.generateReport();
}

export function getNoveltyTrend(): 'improving' | 'stable' | 'degrading' {
  return analyticsCollector.getRepetitionTrend().trend;
}

export function exportAnalytics(): SearchAnalytics[] {
  return analyticsCollector.export();
}
