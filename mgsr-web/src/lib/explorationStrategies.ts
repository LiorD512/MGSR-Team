import { buildQueryFingerprint } from './discoveryDiversity';

export interface ExplorationStrategy {
  name: string;
  description: string;
  apply: (candidate: Record<string, unknown>) => number;
}

interface StrategyContext {
  baseScore: number;
  tokens: string[];
  seenCount: number;
  candidateIndex: number;
  poolSize: number;
}

class ExplorationEngine {
  private strategyHistory: Map<string, number[]> = new Map();
  private lastStrategyRotation = 0;

  recordStrategyUse(queryFingerprint: string, strategy: string): void {
    const key = `${queryFingerprint}:${strategy}`;
    const history = this.strategyHistory.get(key) || [];
    history.push(Date.now());
    if (history.length > 100) history.shift();
    this.strategyHistory.set(key, history);
  }

  getRecentStrategyUsage(queryFingerprint: string, strategy: string, windowMs = 24 * 60 * 60 * 1000): number {
    const key = `${queryFingerprint}:${strategy}`;
    const history = this.strategyHistory.get(key) || [];
    const cutoff = Date.now() - windowMs;
    return history.filter((t) => t > cutoff).length;
  }

  shouldRotateStrategy(queryFingerprint: string): boolean {
    const now = Date.now();
    if (now - this.lastStrategyRotation < 60000) return false;
    this.lastStrategyRotation = now;
    return true;
  }
}

const engine = new ExplorationEngine();

export const EXPLORATION_STRATEGIES: Record<string, ExplorationStrategy> = {
  outlier_seeker: {
    name: 'Outlier Seeker',
    description: 'Finds statistical outliers: high potential, unusual playing style, undervalued gems',
    apply: (candidate: Record<string, unknown>) => {
      const potentialGap = (Number(candidate.fm_potential) || 0) - (Number(candidate.age) || 0);
      const marketValueNum = Number(candidate.market_value_euro) || 0;
      const abilityStat = Number(candidate.ability) || 0;

      if (potentialGap > 15 && marketValueNum < 3_000_000) return 0.15;
      if (abilityStat > 75 && marketValueNum < 1_000_000) return 0.12;
      if (potentialGap > 20) return 0.1;
      return 0;
    },
  },

  geographic_diversity: {
    name: 'Geographic Diversity',
    description: 'Explores players from underrepresented leagues and regions',
    apply: (candidate: Record<string, unknown>) => {
      const league = String(candidate.league || '').toLowerCase();
      const topLeagues = ['premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1'];
      const isTopLeague = topLeagues.some((l) => league.includes(l));

      if (!isTopLeague) return 0.08;
      if (league.includes('championship') || league.includes('serie b')) return 0.06;
      return 0;
    },
  },

  young_prospect: {
    name: 'Young Prospect Detector',
    description: 'Prioritizes young players with high performance metrics and low market value',
    apply: (candidate: Record<string, unknown>) => {
      const age = Number(candidate.age) || 0;
      const value = Number(candidate.market_value_euro) || 0;
      const rating = Number(candidate.rating) || 0;

      if (age <= 20 && rating >= 70 && value < 2_000_000) return 0.2;
      if (age <= 22 && rating >= 72 && value < 3_000_000) return 0.15;
      if (age <= 24 && rating >= 75 && value < 5_000_000) return 0.12;
      return 0;
    },
  },

  momentum_player: {
    name: 'Momentum Tracker',
    description: 'Finds players whose performance is improving (recent form boost)',
    apply: (candidate: Record<string, unknown>) => {
      const recentRating = Number(candidate.recent_rating) || 0;
      const previousRating = Number(candidate.season_start_rating) || 0;
      const improvement = recentRating - previousRating;

      if (improvement > 5) return 0.14;
      if (improvement > 3) return 0.08;
      if (improvement > 1) return 0.04;
      return 0;
    },
  },

  underexposed_league: {
    name: 'Underexposed League Champion',
    description: 'Boosts top performers from less-searched leagues',
    apply: (candidate: Record<string, unknown>) => {
      const rating = Number(candidate.rating) || 0;
      const league = String(candidate.league || '').toLowerCase();

      const rarityLeagues = [
        'primeira liga',
        'eredivisie',
        'jupiler pro league',
        'super lig',
        'russian premier league',
      ];
      const isRareLeague = rarityLeagues.some((l) => league.includes(l));

      if (isRareLeague && rating >= 74) return 0.12;
      if (isRareLeague && rating >= 72) return 0.08;
      return 0;
    },
  },

  contract_edge: {
    name: 'Contract Edge Exploit',
    description: 'Finds quality players in final contract year (good value)',
    apply: (candidate: Record<string, unknown>) => {
      const contract = String(candidate.contract || '').toLowerCase();
      const rating = Number(candidate.rating) || 0;

      if ((contract.includes('2024') || contract.includes('2025')) && rating >= 72) return 0.11;
      if ((contract.includes('2024') || contract.includes('2025')) && rating >= 70) return 0.07;
      return 0;
    },
  },

  position_scarcity: {
    name: 'Position Scarcity Play',
    description: 'Boosts quality players in historically hard-to-find positions',
    apply: (candidate: Record<string, unknown>) => {
      const position = String(candidate.position || '').toUpperCase();
      const rating = Number(candidate.rating) || 0;
      const value = Number(candidate.market_value_euro) || 0;

      const scarcePositions = ['GK', 'CB', 'DM'];
      const isScarce = scarcePositions.some((p) => position.includes(p));

      if (isScarce && rating >= 73 && value < 4_000_000) return 0.13;
      if (isScarce && rating >= 71) return 0.08;
      return 0;
    },
  },

  style_change: {
    name: 'Style Shifter',
    description: 'Finds players with unusual/unique playing styles',
    apply: (candidate: Record<string, unknown>) => {
      const style = String(candidate.playing_style || '').toLowerCase();
      const rating = Number(candidate.rating) || 0;

      const uniqueStyles = ['inverted winger', 'false 9', 'deep-lying playmaker', 'box-to-box'];
      const isUnique = uniqueStyles.some((s) => style.includes(s));

      if (isUnique && rating >= 70) return 0.1;
      return 0;
    },
  },
};

export function selectExplorationStrategy(
  queryFingerprint: string,
  useRotation = true,
): string {
  const strategies = Object.keys(EXPLORATION_STRATEGIES);
  if (!useRotation || !engine.shouldRotateStrategy(queryFingerprint)) {
    return strategies[Math.floor(Math.random() * strategies.length)];
  }

  let least = strategies[0];
  let leastCount = engine.getRecentStrategyUsage(queryFingerprint, least);

  for (const strategy of strategies) {
    const count = engine.getRecentStrategyUsage(queryFingerprint, strategy);
    if (count < leastCount) {
      least = strategy;
      leastCount = count;
    }
  }

  engine.recordStrategyUse(queryFingerprint, least);
  return least;
}

export function applyExplorationBoost(
  candidate: Record<string, unknown>,
  strategyName: string,
): number {
  const strategy = EXPLORATION_STRATEGIES[strategyName];
  if (!strategy) return 0;
  return strategy.apply(candidate);
}

export function getActiveStrategies(): string[] {
  return Object.keys(EXPLORATION_STRATEGIES);
}
