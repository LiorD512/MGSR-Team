export interface SharedPlayer {
  fullName?: string;
  fullNameHe?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string; clubCountry?: string };
  age?: string;
  height?: string;
  nationality?: string;
  contractExpired?: string;
  tmProfile?: string;
  playerPhoneNumber?: string;
  agentPhoneNumber?: string;
}

export interface SharedHighlightVideo {
  id: string;
  source: string;
  title: string;
  thumbnailUrl: string;
  embedUrl: string;
  channelName?: string;
  viewCount?: number;
}

export interface ShareData {
  playerId: string;
  player: SharedPlayer;
  mandateInfo?: { hasMandate: boolean; expiresAt?: number };
  mandateUrl?: string;
  sharerPhone?: string;
  sharerName?: string;
  scoutReport?: string;
  highlights?: SharedHighlightVideo[];
  lang?: 'he' | 'en';
  platform?: 'men' | 'women' | 'youth';
  enrichment?: PortfolioEnrichment;
  familyStatus?: { isMarried?: boolean; kidsCount?: number };
  gpsData?: SharedGpsData;
  playerStats?: SharedPlayerStats;
  /** Timestamps marking when enrichment was last attempted (even if no data found).
   *  Prevents re-fetching from cold external servers on every page load. */
  _gpsCheckedAt?: number;
  _statsCheckedAt?: number;
  _enrichmentCheckedAt?: number;
}

/* ── API Football Stats types ── */

export interface SharedPlayerStats {
  position: string; // e.g. "Defender", "Midfielder", "Forward"
  league: string;
  leagueCountry: string;
  season?: number;
  appearances: number;
  minutes: number;
  goals?: number;
  assists?: number;
  rating?: number;
  stats: SharedStatItem[];
}

export interface SharedStatItem {
  key: string;
  label: string;
  labelHe: string;
  value: number;
  format: 'decimal' | 'pct' | 'number' | 'rating';
  /** 'good' | 'great' | 'elite' — only impressive stats are included */
  tier: 'good' | 'great' | 'elite';
  icon: string;
}

/* ── GPS Performance types ── */

export interface SharedGpsData {
  matchCount: number;
  totalMinutesPlayed: number;
  avgTotalDistance: number;
  avgMeteragePerMinute: number;
  avgHighIntensityRuns: number;
  avgSprints: number;
  peakMaxVelocity: number;
  avgMaxVelocity: number;
  totalStars: number;
  strengths: GpsStrength[];
  documentUrls?: string[];
}

export interface GpsStrength {
  title: string;
  description: string;
  value: string;
  benchmark?: string;
}

/* ── Portfolio Enrichment types ── */

export interface PortfolioEnrichment {
  aiScore?: AIScoutScore;
  radarAttributes?: RadarAttribute[];
  sellingPoints?: SellingPoint[];
  comparisons?: ComparisonPlayer[];
  seasonStats?: SeasonStatsData;
  /** One-line elevator pitch for the hero section */
  hookLine?: string;
  hookLineHe?: string;
  /** 4-6 bullet points: "Why Clubs Like Him" */
  clubSummary?: string[];
  clubSummaryHe?: string[];
  /** 5-6 scannable key traits (short phrases) */
  keyTraits?: string[];
  keyTraitsHe?: string[];
  /** Tactical fit: best formations, role, and description */
  tacticalFit?: TacticalFit;
}

export interface AIScoutScore {
  overall: number;
  categories: { name: string; nameHe: string; value: number }[];
}

export interface RadarAttribute {
  name: string;
  nameHe: string;
  value: number; // 0-100
}

export interface SellingPoint {
  icon: string;
  title: string;
  titleHe: string;
  description: string;
  descriptionHe: string;
}

export interface ComparisonPlayer {
  name: string;
  age: number;
  goalsAndAssists: number;
  keyStatLabel: string;
  keyStatLabelHe: string;
  keyStat: string;
  value: string;
  isSubject?: boolean;
}

export interface SeasonStatsData {
  season: string;
  goals?: number;
  assists?: number;
  appearances?: number;
  minutes?: number;
  keyStatLabel?: string;
  keyStatLabelHe?: string;
  keyStatValue?: number;
}

export interface TacticalFit {
  systems: string[];
  role: string;
  roleHe: string;
  description: string;
  descriptionHe: string;
}
