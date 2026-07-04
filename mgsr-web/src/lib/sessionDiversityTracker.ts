import { buildQueryFingerprint } from './discoveryDiversity';

interface SessionSearchRecord {
  timestamp: number;
  queryFingerprint: string;
  resultKeys: Set<string>;
  diversityMode: string;
}

interface DiversityBatch {
  searchNumber: number;
  sessionId: string;
  diversity: number;
}

class SessionDiversityTracker {
  private sessionSearches: SessionSearchRecord[] = [];
  private maxHistorySize = 20;
  private sessionId = this.generateSessionId();

  private generateSessionId(): string {
    if (typeof window === 'undefined') return 'server';
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  recordSearch(
    queryFingerprint: string,
    resultKeys: string[],
    diversityMode: string,
  ): void {
    const record: SessionSearchRecord = {
      timestamp: Date.now(),
      queryFingerprint,
      resultKeys: new Set(resultKeys),
      diversityMode,
    };

    this.sessionSearches.push(record);
    if (this.sessionSearches.length > this.maxHistorySize) {
      this.sessionSearches.shift();
    }
  }

  getRecentDiversity(windowCount = 5): number {
    if (this.sessionSearches.length === 0) return 1.0;

    const recent = this.sessionSearches.slice(-windowCount);
    let totalUnique = 0;
    let totalDuplicate = 0;

    for (let i = 0; i < recent.length; i += 1) {
      const current = recent[i];
      const currentKeys = Array.from(current.resultKeys);
      for (let j = i + 1; j < recent.length; j += 1) {
        const other = recent[j];
        const overlap = currentKeys.filter((k) => other.resultKeys.has(k)).length;
        totalDuplicate += overlap;
        totalUnique += current.resultKeys.size - overlap;
      }
    }

    if (totalUnique + totalDuplicate === 0) return 1.0;
    return totalUnique / (totalUnique + totalDuplicate);
  }

  shouldApplyExtraBoost(): boolean {
    const diversity = this.getRecentDiversity(3);
    return diversity < 0.5;
  }

  getRepetitionScore(resultKeys: string[]): number {
    if (this.sessionSearches.length === 0) return 0;

    const keySet = new Set(resultKeys);
    let repetitions = 0;

    for (const record of this.sessionSearches.slice(-10)) {
      const keyArray = Array.from(keySet);
      for (let i = 0; i < keyArray.length; i += 1) {
        const key = keyArray[i];
        if (record.resultKeys.has(key)) {
          repetitions += 1;
        }
      }
    }

    return Math.min(1.0, repetitions / (resultKeys.length * 5));
  }

  getSuggestedDiversityMode(): 'strict' | 'balanced' | 'discovery' {
    const diversity = this.getRecentDiversity(5);
    if (diversity < 0.4) return 'discovery';
    if (diversity < 0.6) return 'balanced';
    return 'balanced';
  }

  clear(): void {
    this.sessionSearches = [];
    this.sessionId = this.generateSessionId();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSearchCount(): number {
    return this.sessionSearches.length;
  }

  getRecentSearches(limit = 5): SessionSearchRecord[] {
    return this.sessionSearches.slice(-limit).map((r) => ({
      ...r,
      resultKeys: new Set(r.resultKeys),
    }));
  }
}

export const sessionTracker = new SessionDiversityTracker();

export function getSessionDiversity(): number {
  return sessionTracker.getRecentDiversity(5);
}

export function isRepetitionHighRisk(resultKeys: string[]): boolean {
  const repetitionScore = sessionTracker.getRepetitionScore(resultKeys);
  return repetitionScore > 0.6;
}

export function shouldBoostExploration(): boolean {
  return sessionTracker.shouldApplyExtraBoost();
}

export function getSuggestedMode(): 'strict' | 'balanced' | 'discovery' {
  return sessionTracker.getSuggestedDiversityMode();
}

export function getSessionId(): string {
  return sessionTracker.getSessionId();
}
