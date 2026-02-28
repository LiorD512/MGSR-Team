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
}
