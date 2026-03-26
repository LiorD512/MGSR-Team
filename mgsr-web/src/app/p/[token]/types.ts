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
  platform?: 'men' | 'women';
  enrichment?: PortfolioEnrichment;
}

/* ── Portfolio Enrichment types ── */

export interface PortfolioEnrichment {
  aiScore?: AIScoutScore;
  radarAttributes?: RadarAttribute[];
  sellingPoints?: SellingPoint[];
  comparisons?: ComparisonPlayer[];
  seasonStats?: SeasonStatsData;
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
