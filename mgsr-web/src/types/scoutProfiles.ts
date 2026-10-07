export interface ScoutProfileResponse {
  id: string;
  tmProfileUrl: string;
  agentId: string;
  profileType: string;
  profileTypeLabel: string;
  profileTypeLabelHe: string;
  playerName: string;
  profileImage: string | null;
  age: number;
  position: string;
  marketValue: string;
  marketValueEuro: number;
  club: string;
  league: string;
  leagueTier: number;
  nationality: string | null;
  matchReason: string;
  matchScore: number;
  fmPa: number | null;
  fmCa: number | null;
  contractExpires: string | null;
  discoveredAt: number;
  lastRefreshedAt: number;
  agentName: string;
  agentNameHe: string;
  agentFlag: string;
  scoutExplanationEn?: string;
  scoutExplanationHe?: string;

  // ── Sport Director intelligence (may be null for lower-ranked profiles) ──
  directorVerdict?: string | null;
  directorAction?: 'SHORTLIST_NOW' | 'MONITOR' | 'LOW_PRIORITY' | string | null;
  directorFitScore?: number | null;
  directorValueArc?: 'rising' | 'peak' | 'declining' | string | null;
  directorDataFlags?: string[];
  scoutNarrative?: string | null;

  // ── Per-90 performance (API-Football) ──
  goalsPer90?: number | null;
  contribPer90?: number | null;
  apiRating?: number | null;
  apiGoals?: number | null;
  apiAssists?: number | null;
  apiMinutes90s?: number | null;

  // ── Real-world intel (TheSportsDB / ClubElo) ──
  intelWage?: string | null;
  intelAgent?: string | null;
  intelHonours?: number | null;
  intelClubElo?: number | null;
  intelFoot?: string | null;
  intelHeight?: string | null;

  // ── Cross-agent corroboration ──
  corroboratingAgents?: { id: string; name: string; nameHe: string; flag: string }[];
  corroborationCount?: number;
}

/** The daily "sweep funnel" summary from the latest ScoutAgentRuns doc. */
export interface ScoutRunSummary {
  scanned: number | null;
  matched: number | null;
  approved: number | null;
  rejected: number | null;
  leaguesScanned: number | null;
  crossAgent: number | null;
}
