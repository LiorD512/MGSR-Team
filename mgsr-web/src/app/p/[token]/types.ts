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
}

export interface ShareData {
  playerId: string;
  player: SharedPlayer;
  mandateInfo?: { hasMandate: boolean; expiresAt?: number };
  mandateUrl?: string;
  sharerPhone?: string;
  scoutReport?: string;
  lang?: 'he' | 'en';
}
