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

export interface FlagInfo { by: string | null; at: number; reason?: string | null }
export interface Flags { watch?: FlagInfo; contacted?: FlagInfo; hidden?: FlagInfo }
export type Identity = 'CONFIRMED' | 'PROBABLE';

/** One player in the feed: his Transfermarkt identity + the plain situation + the newest original source. */
export interface FeedItem {
  id: string; name: string; fullName: string | null; writtenAs: string[]; tmUrl: string | null; photo: string | null; position: string | null; age: number | null; dob: string | null;
  nationalities: string[]; club: string | null; crest: string | null; league: string | null; country: string | null; contractEnd: number | null; loanFrom: string | null;
  value: string | null; valueEur: number | null; identity: Identity; closed: boolean; situation: Situation; situations: Situation[];
  firstAt: number; lastAt: number; sources: number; latest: { outlet: string; country: string | null; at: number; en: string; orig: string } | null; inRoster: boolean; flags: Flags;
}
export interface FeedResponse { items: FeedItem[]; pending: boolean; generatedAt: number }

export interface IdentityCheck { k: string; [v: string]: string | number | null }
export interface Candidate { tmId: string; tmUrl: string; name: string; position: string | null; age: number | null; club: string | null; value: string | null; photo: string | null; nationalities: string[]; s: number }
export interface FileSource { id: string; outlet: string; country: string | null; lang: string | null; tier: string; at: number; orig: string; en: string | null; quote: string | null; url: string; viaGoogle: boolean; writtenAs: string | null; situation: Situation }
export interface PlayerFile {
  player: {
    id: string; name: string; fullName: string | null; writtenAs: string[]; tmUrl: string | null; photo: string | null; position: string | null; age: number | null; dob: string | null; nationalities: string[];
    foot: string | null; height: string | null; club: string | null; crest: string | null; league: string | null; country: string | null; contractEnd: number | null; loanFrom: string | null;
    value: string | null; valueEur: number | null; identity: string | null; excludedReason: string | null; checks: IdentityCheck[]; candidates: Candidate[]; inRoster: boolean;
  };
  closed: boolean; firstAt: number | null; lastAt: number | null;
  events: { at: number; situation: Situation; title: string; sources: string[] }[];
  sources: FileSource[]; flags: Flags;
}

export interface FilteredItem {
  id: string; name: string; reason: string; status: string | null; value: string | null; club: string | null; tmUrl: string | null; hiddenBy: string | null; staff: string | null;
  article: { outlet: string; url: string; at: number; en: string } | null;
}

export interface SummaryResponse {
  lastRun: { started_at: number; ended_at: number | null; status: string } | null;
  nextAnalysisAt: number | null;
  coverage: { sources: number; countries: number };
  generatedAt: number;
}

export type FlagAction = 'watch' | 'unwatch' | 'contacted' | 'uncontacted' | 'hide' | 'restore';
export const postFlag = (playerId: string, action: FlagAction, reason?: string) =>
  radarFetch<{ ok: boolean }>('flags', { method: 'POST', body: JSON.stringify({ playerId, action, reason }) });

export interface SourceItem {
  id: string; name: string; url: string; host: string; country: string | null; languages: string[]; type: string; access: string; feedUrl: string | null; headlineOnly: boolean; status: string;
  statusReason: string | null; tier: string; reliability: number; intervalMin: number; lastScanAt: number | null; lastSuccessAt: number | null; lastError: string | null; accessLimitation: string | null;
  failures: number; itemsCollected: number; relevantReports: number; lastArticleAt: number | null; createdAt: number;
}
