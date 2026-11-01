'use client';

import { auth } from '@/lib/firebase';

export class RadarApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** fetch wrapper: adds the Firebase ID token; errors carry the server code (e.g. RADAR_NOT_CONFIGURED). */
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

export interface Opportunity {
  playerId: string; displayName: string; clubName: string | null; country: string | null; league: string | null; score: number; rawScore: number; level: Level; closed: boolean;
  scoreDelta7d: number; urgency: 'High' | 'Medium' | 'Low' | 'Closed'; urgencyScore: number; categories: string[]; loanAvailable: boolean; transferAvailable: boolean;
  topHeadline: string | null; topOutlet: string | null; topTier: string | null; bestVerification: Verification; bestTier: string; reportCount: number; independentOrigins: number;
  action: string | null; firstSeenAt: number; lastReportAt: number; lastChangeAt: number; contractExpires: number | null; onShortlist: boolean; inRoster: boolean;
}
export interface OpportunitiesResponse { items: Opportunity[]; countries: { country: string; n: number }[]; generatedAt: number }

export interface SummaryResponse {
  kpi: Record<string, number>;
  leads: { id: string; outlet: string; url: string; published_at: number; title_orig: string; headline_en: string | null; club_raw: string | null; country: string | null }[];
  removed: { id: string; outlet: string; url: string; published_at: number; headline_en: string | null; title_orig: string; player_raw: string | null; club_raw: string | null; drop_reason: string }[];
  recent: { player_id: string; display_name: string; club_name: string | null; score: number; level: string; last_change_at: number }[];
  newSources: { id: string; name: string; host: string; country: string | null; status: string; created_at: number }[];
  lastRun: { started_at: number; ended_at: number | null; status: string } | null;
  budget: { monthUsd: number; capUsd: number; requests: number };
  generatedAt: number;
}

export interface TimelineItem {
  id: string; at: number; kind: 'REPORT' | 'STATUS_CHANGE'; reportId: string; signals: string[]; verification: Verification; outlet: string; tier: string; url: string;
  headlineEn: string | null; titleOrig: string; quote: string | null; claim: string | null; evidenceOk: boolean; attributedTo: string | null; headlineOnly: boolean; originKey: string | null;
  feedback: { correct: number; incorrect: number; outdated: number };
}
export interface ScoreComponent { key: string; points: number; max: number; signal?: string; outlet?: string; tier?: string; verification?: string; confidence?: number; recency?: number; ageDays?: number; note?: string }
export interface PlayerResponse {
  player: { id: string; displayName: string; clubName: string | null; country: string | null; league: string | null; position: string | null; dob: string | null; nationalities: string[]; foot: string | null;
    heightCm: number | null; contractExpires: number | null; contractVerified: boolean; resolutionStatus: string; onShortlist: boolean };
  opportunity: null | { score: number; rawScore: number; level: Level; closed: boolean; scoreDelta7d: number; urgency: string; categories: string[]; bestVerification: Verification; bestTier: string; reportCount: number;
    independentOrigins: number; action: string | null; explanation: { components?: ScoreComponent[]; caps?: string[]; modifiers?: string[]; independentOrigins?: number }; configVersion: number;
    firstSeenAt: number; lastReportAt: number; lastChangeAt: number; loanAvailable: boolean; transferAvailable: boolean };
  timeline: TimelineItem[];
  history: { at: number; score: number; level: string }[];
}

export interface SourceItem {
  id: string; name: string; url: string; host: string; country: string | null; languages: string[]; type: string; access: string; feedUrl: string | null; headlineOnly: boolean; status: string;
  statusReason: string | null; tier: string; reliability: number; intervalMin: number; lastScanAt: number | null; lastSuccessAt: number | null; lastError: string | null; accessLimitation: string | null;
  failures: number; itemsCollected: number; relevantReports: number; lastArticleAt: number | null; createdAt: number;
}

export function timeAgo(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '-';
  const h = (now - ts) / 3_600_000;
  if (h < 1) return '<1h';
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
export function fmtDateTime(ts: number, lang: 'en' | 'he'): string {
  return new Date(ts).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}
