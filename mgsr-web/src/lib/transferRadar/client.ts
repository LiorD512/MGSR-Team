'use client';

import { auth } from '@/lib/firebase';
import type { Situation } from './situations';

export class RadarApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** fetch wrapper: adds the Firebase ID token; errors carry the server code (e.g. RADAR_NOT_CONFIGURED, RADAR_FORBIDDEN). */
export async function radarFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/transfer-radar/${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token ?? ''}` },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new RadarApiError(res.status, json.error ?? 'ERROR', json.message ?? json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export type Level = 'Exceptional' | 'High priority' | 'Potential' | 'Monitor' | 'Low priority' | 'Closed';
export type Verification = 'CONFIRMED' | 'REPORTED' | 'RUMOR';
export type Tier = 'A' | 'B' | 'C' | 'D';
export interface FlagInfo { by: string | null; at: number; reason?: string | null }
export interface Flags { watch?: FlagInfo; contacted?: FlagInfo; hidden?: FlagInfo }

export interface Opportunity {
  playerId: string; displayName: string; writtenAs: string | null; clubName: string | null; country: string | null; countryIsClub: boolean;
  score: number; rawScore: number; level: Level; closed: boolean; situations: Situation[]; mainSituation: Situation; loanAvailable: boolean;
  topHeadline: string | null; topOutlet: string | null; topTier: Tier | null; bestVerification: Verification; bestTier: Tier; reportCount: number; independentOrigins: number;
  action: string | null; firstSeenAt: number; lastReportAt: number; lastChangeAt: number; flags: Flags;
}
export interface OpportunitiesResponse { items: Opportunity[]; generatedAt: number }

export interface SummaryResponse {
  kpi: Record<string, number>;
  leads: { id: string; outlet: string; url: string; published_at: number; title_orig: string; headline_en: string | null; club_raw: string | null; country: string | null }[];
  removed: { id: string; outlet: string; url: string; published_at: number; headline_en: string | null; title_orig: string; player_raw: string | null; club_raw: string | null; drop_reason: string }[];
  lastRun: { started_at: number; ended_at: number | null; status: string } | null;
  nextAnalysisAt: number | null;
  coverage: { sources: number; countries: number };
  generatedAt: number;
}

export interface TimelineItem {
  id: string; at: number; kind: 'REPORT' | 'STATUS_CHANGE'; reportId: string; signals: string[]; verification: Verification; outlet: string; tier: Tier; url: string;
  headlineEn: string | null; titleOrig: string; quote: string | null; claim: string | null; evidenceOk: boolean; attributedTo: string | null; headlineOnly: boolean; originKey: string | null;
  feedback: { correct: number; incorrect: number; outdated: number };
}
export interface ScoreComponent { key: string; points: number; max: number; signal?: string; outlet?: string; tier?: string; verification?: string; confidence?: number; recency?: number; ageDays?: number; note?: string }
export interface PlayerResponse {
  player: { id: string; displayName: string; writtenAs: string | null; clubName: string | null; country: string | null; countryIsClub: boolean; league: string | null; position: string | null; dob: string | null;
    nationalities: string[]; foot: string | null; heightCm: number | null; contractExpires: number | null; contractVerified: boolean; resolutionStatus: string };
  opportunity: null | { score: number; rawScore: number; level: Level; closed: boolean; scoreDelta7d: number; urgency: string; categories: string[]; bestVerification: Verification; bestTier: Tier; reportCount: number;
    independentOrigins: number; action: string | null; explanation: { components?: ScoreComponent[]; caps?: string[]; modifiers?: string[] }; configVersion: number; firstSeenAt: number; lastReportAt: number; lastChangeAt: number };
  timeline: TimelineItem[];
  history: { at: number; score: number; level: string }[];
  flags: Flags;
}

export type FlagAction = 'watch' | 'unwatch' | 'contacted' | 'uncontacted' | 'hide' | 'restore';
export const postFlag = (playerId: string, action: FlagAction, reason?: string) =>
  radarFetch<{ ok: boolean }>('flags', { method: 'POST', body: JSON.stringify({ playerId, action, reason }) });

export interface SourceItem {
  id: string; name: string; url: string; host: string; country: string | null; languages: string[]; type: string; access: string; feedUrl: string | null; headlineOnly: boolean; status: string;
  statusReason: string | null; tier: string; reliability: number; intervalMin: number; lastScanAt: number | null; lastSuccessAt: number | null; lastError: string | null; accessLimitation: string | null;
  failures: number; itemsCollected: number; relevantReports: number; lastArticleAt: number | null; createdAt: number;
}
