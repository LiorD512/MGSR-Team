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
  familyStatus?: { isMarried?: boolean; kidsCount?: number };
  englishLevel?: string;
  gpsData?: SharedGpsData;
  playerStats?: SharedPlayerStats;
  /** Timestamps marking when GPS / stats were last fetched (even if no data found).
   *  Prevents re-fetching from cold external servers on every page load. */
  _gpsCheckedAt?: number;
  _statsCheckedAt?: number;
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
