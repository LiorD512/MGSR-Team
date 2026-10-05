/**
 * Player identity ranking.
 *
 * Downloads and validates the discovered candidates, collapses near-duplicates
 * perceptually, rejects graphics/posters, and scores each survivor on SEPARATE
 * axes. Identity is a HARD GATE: a weak identity score can NEVER be rescued by
 * source trust, image quality, composition, or suitability.
 *
 *   identity < 80            → REJECT
 *   identity 80–84           → REVIEW
 *   identity ≥ 85 + clean    → eligible for ACCEPT
 *
 * Gemini is used ONLY to classify an EXISTING photo (and, when available, to
 * compare it against the player's known reference image) — it never generates
 * or alters a player. When Gemini is unavailable, identity cannot be verified,
 * so a candidate can never auto-ACCEPT; it is surfaced as REVIEW/UNVERIFIED for
 * a human. When nothing clears the bar the caller returns
 * `NO_VERIFIED_PLAYER_IMAGE`. It is always better to return no image than the
 * wrong player.
 */

import sharp from 'sharp';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { fetchAndValidate } from '@/lib/matchday/assets';
// Imported for the panel the renderer will eventually draw into — read only,
// so composition scoring matches the real target without touching the renderer.
import { PLAYER_PANEL } from '@/lib/matchday/render';
import { scoreCandidateSource } from './sourceTrust';
import { perceptualHash, isNearDuplicate } from './perceptualHash';
import type {
  CachedIdentityVerdict,
  DownloadedCandidate,
  IdentityVerdict,
  PhotoCandidate,
  PlayerPhotoSearchInput,
  RankDecision,
  RankedCandidate,
  RejectedCandidate,
} from './types';

const GEMINI_MODEL = 'gemini-2.5-flash';

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/** Transfermarkt's placeholder silhouette — never a real likeness. */
const TM_SILHOUETTE = /\/default\.(jpg|png)(\?|$)/i;

const MIN_SHORT_AXIS = 320;
const MIN_LONG_AXIS = 420;
const MIN_FILE_BYTES = 6 * 1024;

// ── Identity gate (strict, per spec §4) ──
/** Below this, identity is too weak to use at all. */
const IDENTITY_REJECT_BELOW = 80;
/** At/above this, identity is strong enough to be ACCEPT-eligible. */
const IDENTITY_ACCEPT_AT = 85;
/** A clean photo also needs this much MATCHDAY suitability to auto-accept. */
const SUITABILITY_ACCEPT_AT = 60;

export interface RankOptions {
  maxDownloads?: number;
  maxGeminiChecks?: number;
  useGemini?: boolean;
  /** Optional reference-image bytes (player headshot) for identity comparison. */
  referenceImage?: { bytes: Buffer; mimeType: string } | null;
  /** Per-image verdict cache lookups/writes (keyed by perceptual hash). */
  verdictCache?: VerdictCache;
}

/** A pluggable verdict cache so the same photo is not re-sent to Gemini. */
export interface VerdictCache {
  get(playerId: string, hash: string): Promise<CachedIdentityVerdict | null>;
  set(verdict: CachedIdentityVerdict): Promise<void>;
}

const DEFAULTS: Required<Omit<RankOptions, 'referenceImage' | 'verdictCache'>> = {
  maxDownloads: 28,
  maxGeminiChecks: 14,
  useGemini: true,
};

// ── Download + technical/graphic reject + perceptual dedup ───────────────────

interface DownloadOutcome {
  downloaded: DownloadedCandidate[];
  rejected: RejectedCandidate[];
  uniqueAfterPerceptual: number;
  technicalRejects: number;
  graphicRejects: number;
}

async function downloadFilterDedupe(
  candidates: PhotoCandidate[],
  limit: number
): Promise<DownloadOutcome> {
  const kept: DownloadedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  let technicalRejects = 0;
  let graphicRejects = 0;
  const hashes: string[] = [];

  for (const c of candidates) {
    if (kept.length >= limit) break;

    if (TM_SILHOUETTE.test(c.imageUrl)) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, stage: 'technical', reason: 'Transfermarkt silhouette placeholder' });
      technicalRejects++;
      continue;
    }

    const fetched = await fetchAndValidate(
      { url: c.imageUrl, source: c.source, pageUrl: c.sourceUrl ?? undefined },
      { minWidth: 1, minHeight: 1 }
    );
    if (!fetched) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, stage: 'technical', reason: 'Unreachable or not a valid image' });
      technicalRejects++;
      continue;
    }

    const short = Math.min(fetched.width, fetched.height);
    const long = Math.max(fetched.width, fetched.height);
    if (short < MIN_SHORT_AXIS || long < MIN_LONG_AXIS) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, stage: 'technical', reason: `Too small (${fetched.width}×${fetched.height})` });
      technicalRejects++;
      continue;
    }
    if (fetched.bytes.byteLength < MIN_FILE_BYTES) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, stage: 'technical', reason: 'Suspiciously small file (likely icon/placeholder)' });
      technicalRejects++;
      continue;
    }

    const graphic = await looksLikeGraphic(fetched.bytes, fetched.width, fetched.height);
    if (graphic) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, stage: 'graphic', reason: graphic });
      graphicRejects++;
      continue;
    }

    const hash = await perceptualHash(fetched.bytes);
    if (hash && hashes.some((h) => isNearDuplicate(h, hash))) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, stage: 'perceptual_duplicate', reason: 'Near-identical to an already-kept photograph' });
      continue;
    }
    if (hash) hashes.push(hash);

    kept.push({
      ...c,
      width: fetched.width,
      height: fetched.height,
      fileSize: fetched.bytes.byteLength,
      mimeType: fetched.mimeType,
      bytes: fetched.bytes,
      perceptualHash: hash,
    });
  }

  return { downloaded: kept, rejected, uniqueAfterPerceptual: kept.length, technicalRejects, graphicRejects };
}

async function looksLikeGraphic(bytes: Buffer, width: number, height: number): Promise<string | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const aspect = width / height;
    if (meta.hasAlpha && aspect > 0.8 && aspect < 1.25 && Math.max(width, height) <= 600) {
      return 'Looks like a logo/badge (transparent, square, small)';
    }
    if (aspect >= 2.4 || aspect <= 0.33) {
      return `Extreme aspect ratio ${aspect.toFixed(2)} (banner/strip, not a portrait)`;
    }
    const stats = await sharp(bytes).resize(64, 64, { fit: 'inside' }).stats();
    const avgStdev = stats.channels.map((ch) => ch.stdev).reduce((a, b) => a + b, 0) / stats.channels.length;
    if (avgStdev < 12) return 'Looks like a flat graphic (very low colour variance)';
    return null;
  } catch {
    return null;
  }
}

// ── Deterministic component scoring (identity comes from Gemini) ─────────────

function searchRelevanceScore(searchQuery: string, queries: string[]): number {
  const idx = queries.indexOf(searchQuery);
  if (idx < 0) return 55;
  const span = Math.max(queries.length - 1, 1);
  return Math.round(90 - (idx / span) * 40);
}

function photoQualityScore(width: number, height: number): number {
  const short = Math.min(width, height);
  const target = Math.min(PLAYER_PANEL.width, PLAYER_PANEL.height); // 640
  const ratio = short / target;
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.1) return 90;
  if (ratio >= 0.8) return 78;
  if (ratio >= 0.6) return 64;
  return 50;
}

function compositionScore(width: number, height: number): number {
  const aspect = width / height;
  const panelAspect = PLAYER_PANEL.width / PLAYER_PANEL.height; // ~0.615 (tall)
  if (aspect <= 1) {
    const closeness = 1 - Math.min(Math.abs(aspect - panelAspect) / panelAspect, 1);
    return Math.round(70 + closeness * 30);
  }
  if (aspect <= 1.4) return 72;
  if (aspect <= 1.9) return 60;
  return 48;
}

function deterministicSuitability(width: number, height: number): number {
  return Math.round(photoQualityScore(width, height) * 0.5 + compositionScore(width, height) * 0.5);
}

// ── Gemini identity + suitability classification (classify-only) ─────────────

function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function extractJson(text: string): Record<string, unknown> | null {
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Verdict used when Gemini did not (or could not) classify a candidate. */
function unverifiedVerdict(reason: string): IdentityVerdict {
  return {
    identityConfidence: 0,
    peopleCount: null,
    singleClearSubject: false,
    isPhotograph: true,
    isFootballPlayer: false,
    isGraphic: false,
    isPoster: false,
    isCollage: false,
    isScreenshot: false,
    hasLargeText: false,
    isGraphicOrPoster: false,
    faceClearlyVisible: false,
    bodyVisible: false,
    matchdaySuitability: 0,
    comparedToReference: false,
    reasons: [reason],
    usedGemini: false,
  };
}

async function verifyIdentity(
  bytes: Buffer,
  mimeType: string,
  input: PlayerPhotoSearchInput,
  reference: { bytes: Buffer; mimeType: string } | null
): Promise<IdentityVerdict> {
  if (!geminiConfigured()) return unverifiedVerdict('Gemini key not configured — identity unverifiable');

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!.trim());
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 640 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    const refClause = reference
      ? `A REFERENCE image of the target player is provided FIRST, followed by the CANDIDATE image to classify. Judge identity by comparing the person in the CANDIDATE to the person in the REFERENCE (same face, hair, build). `
      : `No reference image is available; judge identity from recognisable features and context only. `;

    const prompt = `You are CLASSIFYING an EXISTING photograph for a football "MATCHDAY" graphic. Do NOT invent, imagine, generate, modify, or describe anything not visibly present. ${refClause}

Target player: "${input.playerName}"${input.club ? `, club "${input.club}"` : ''}${input.country ? ` (nationality ${input.country})` : ''}.

Report, strictly from what is visible in the CANDIDATE image:
- identityConfidence (0-100): confidence this is the REAL target player. ${reference ? 'Base it primarily on whether the CANDIDATE person matches the REFERENCE person. ' : ''}If not reasonably sure it is THIS specific player, report LOW. A generic/distant/unidentifiable footballer must score LOW.
- peopleCount (int): distinct people in frame.
- isSinglePerson (bool): exactly ONE clear usable subject (not a crowd/group/tiny figure).
- isRealPhotograph (bool): a real photograph, NOT a logo/illustration/AI render.
- isFootballPlayer (bool): subject appears to be a footballer (kit/pitch/football context).
- isGraphic (bool): a designed graphic/advertisement rather than a plain photo.
- isPoster (bool): a poster / welcome card / team-announcement / matchday graphic / promotional layout.
- isCollage (bool): multiple images combined.
- isScreenshot (bool): a screenshot (UI chrome, app bars, captions).
- hasLargeText (bool): large overlaid text/wordmarks.
- faceVisible (bool): face clearly visible (not turned away/obstructed/too small).
- bodyVisible (bool): enough of the body/upper body visible for a 9:16 crop.
- matchdaySuitability (0-100): usability as a clean single-player MATCHDAY subject (one player, visible face+hair+upper body, sharp, natural football photo, surrounding space, no text/layout). Distant/blurred/facing-away/extreme-crop/multi-player/graphic images score LOW.

Return ONLY JSON:
{"identityConfidence":0-100,"peopleCount":int,"isSinglePerson":bool,"isRealPhotograph":bool,"isFootballPlayer":bool,"isGraphic":bool,"isPoster":bool,"isCollage":bool,"isScreenshot":bool,"hasLargeText":bool,"faceVisible":bool,"bodyVisible":bool,"matchdaySuitability":0-100,"reasons":[short strings]}`;

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    if (reference) {
      parts.push({ text: 'REFERENCE image of the target player:' });
      parts.push({ inlineData: { mimeType: reference.mimeType || 'image/png', data: reference.bytes.toString('base64') } });
      parts.push({ text: 'CANDIDATE image to classify:' });
    }
    parts.push({ inlineData: { mimeType: mimeType || 'image/png', data: bytes.toString('base64') } });
    parts.push({ text: prompt });

    const result = await model.generateContent(parts);
    const text = (() => {
      try {
        return typeof result.response.text === 'function' ? result.response.text() : '';
      } catch {
        return '';
      }
    })();
    const obj = extractJson(text || '');
    if (!obj) return { ...unverifiedVerdict('Gemini returned unparseable output'), usedGemini: true };

    const clamp = (n: unknown, d = 0) =>
      typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;
    const bool = (v: unknown) => v === true;

    const isGraphic = bool(obj.isGraphic);
    const isPoster = bool(obj.isPoster);
    const isCollage = bool(obj.isCollage);
    const isScreenshot = bool(obj.isScreenshot);
    const hasLargeText = bool(obj.hasLargeText);

    return {
      identityConfidence: clamp(obj.identityConfidence, 0),
      peopleCount: typeof obj.peopleCount === 'number' ? Math.max(0, Math.round(obj.peopleCount)) : null,
      singleClearSubject: bool(obj.isSinglePerson),
      isPhotograph: obj.isRealPhotograph !== false,
      isFootballPlayer: bool(obj.isFootballPlayer),
      isGraphic,
      isPoster,
      isCollage,
      isScreenshot,
      hasLargeText,
      isGraphicOrPoster: isGraphic || isPoster || isCollage || isScreenshot || hasLargeText,
      faceClearlyVisible: bool(obj.faceVisible),
      bodyVisible: bool(obj.bodyVisible),
      matchdaySuitability: clamp(obj.matchdaySuitability, 0),
      comparedToReference: Boolean(reference),
      reasons: Array.isArray(obj.reasons) ? obj.reasons.map(String).slice(0, 6) : [],
      usedGemini: true,
    };
  } catch (err) {
    return { ...unverifiedVerdict(`Gemini error: ${err instanceof Error ? err.message : 'unknown'}`), usedGemini: true };
  }
}

// ── Verdict cache (de)serialisation ──────────────────────────────────────────

function verdictToCache(playerId: string, hash: string, v: IdentityVerdict): CachedIdentityVerdict {
  return {
    perceptualHash: hash,
    playerId,
    identityConfidence: v.identityConfidence,
    isPhotograph: v.isPhotograph,
    isFootballPlayer: v.isFootballPlayer,
    isGraphic: v.isGraphic,
    isPoster: v.isPoster,
    isCollage: v.isCollage,
    isScreenshot: v.isScreenshot,
    hasLargeText: v.hasLargeText,
    faceClearlyVisible: v.faceClearlyVisible,
    bodyVisible: v.bodyVisible,
    singleClearSubject: v.singleClearSubject,
    peopleCount: v.peopleCount,
    matchdaySuitability: v.matchdaySuitability,
    comparedToReference: v.comparedToReference,
    cachedAt: Date.now(),
  };
}

function cacheToVerdict(c: CachedIdentityVerdict): IdentityVerdict {
  return {
    identityConfidence: c.identityConfidence,
    peopleCount: c.peopleCount,
    singleClearSubject: c.singleClearSubject,
    isPhotograph: c.isPhotograph,
    isFootballPlayer: c.isFootballPlayer,
    isGraphic: c.isGraphic,
    isPoster: c.isPoster,
    isCollage: c.isCollage,
    isScreenshot: c.isScreenshot,
    hasLargeText: c.hasLargeText,
    isGraphicOrPoster: c.isGraphic || c.isPoster || c.isCollage || c.isScreenshot || c.hasLargeText,
    faceClearlyVisible: c.faceClearlyVisible,
    bodyVisible: c.bodyVisible,
    matchdaySuitability: c.matchdaySuitability,
    comparedToReference: c.comparedToReference,
    reasons: ['Identity verdict served from cache'],
    usedGemini: true,
  };
}

// ── Score + decide (identity is a HARD GATE) ─────────────────────────────────

function scoreCandidate(
  c: DownloadedCandidate,
  queries: string[],
  verdict: IdentityVerdict,
  knownHandle: string | null | undefined
): RankedCandidate {
  const reasons: string[] = [];
  const rejectionReasons: string[] = [];
  const trust = scoreCandidateSource(c, knownHandle);
  reasons.push(trust.reason);

  const searchRelevance = searchRelevanceScore(c.searchQuery, queries);
  const quality = photoQualityScore(c.width, c.height);
  const composition = compositionScore(c.width, c.height);
  const identity = verdict.identityConfidence;
  const suitability = verdict.usedGemini ? verdict.matchdaySuitability : deterministicSuitability(c.width, c.height);

  // finalScore blends the NON-identity signals only — never promotes a
  // weak-identity candidate.
  const finalScore = Math.round(
    suitability * 0.4 + composition * 0.2 + quality * 0.2 + trust.score * 0.12 + searchRelevance * 0.08
  );

  let decision: RankDecision;
  const addReject = (m: string) => { rejectionReasons.push(m); reasons.push(m); };

  if (!verdict.usedGemini) {
    // No model verification → identity unproven → never ACCEPT (spec §4).
    decision = 'unverified';
    reasons.push('Identity NOT model-verified — automatic ACCEPT not allowed; manual REVIEW required');
    reasons.push(...verdict.reasons.slice(0, 2));
  } else if (!verdict.isPhotograph) {
    decision = 'reject';
    addReject('Not a real photograph (logo/illustration/render)');
  } else if (verdict.isGraphicOrPoster) {
    const kinds = [
      verdict.isPoster && 'poster',
      verdict.isGraphic && 'graphic',
      verdict.isCollage && 'collage',
      verdict.isScreenshot && 'screenshot',
      verdict.hasLargeText && 'large text',
    ].filter(Boolean).join('/');
    decision = 'reject';
    addReject(`Graphic/poster, not a clean photograph (${kinds})`);
  } else if (verdict.peopleCount != null && verdict.peopleCount > 1 && !verdict.singleClearSubject) {
    decision = 'reject';
    addReject('Multiple people, no single clear subject');
  } else if (!verdict.faceClearlyVisible) {
    decision = 'reject';
    addReject('Face not clearly visible (away/obstructed/too small)');
  } else if (identity < IDENTITY_REJECT_BELOW) {
    decision = 'reject';
    addReject(`Identity ${identity} < ${IDENTITY_REJECT_BELOW} — cannot confirm this is the player`);
  } else if (identity < IDENTITY_ACCEPT_AT) {
    decision = 'review';
    reasons.push(`Review: identity ${identity} in ${IDENTITY_REJECT_BELOW}–${IDENTITY_ACCEPT_AT - 1} band — needs human confirmation`);
  } else if (suitability < SUITABILITY_ACCEPT_AT) {
    decision = 'review';
    reasons.push(`Review: identity ${identity} OK but MATCHDAY suitability ${suitability} < ${SUITABILITY_ACCEPT_AT}`);
  } else {
    decision = 'accept';
    reasons.push(
      `Accept: identity ${identity} ≥ ${IDENTITY_ACCEPT_AT}${verdict.comparedToReference ? ' (verified vs reference)' : ''}, clean suitable photograph`
    );
    reasons.push(...verdict.reasons.slice(0, 2));
  }

  return {
    imageUrl: c.imageUrl,
    source: c.source,
    provider: c.provider,
    sourceType: c.sourceType,
    sourceUrl: c.sourceUrl,
    searchQuery: c.searchQuery,
    width: c.width,
    height: c.height,
    fileSize: c.fileSize,
    identityScore: identity,
    photoQualityScore: quality,
    compositionScore: composition,
    sourceTrustScore: trust.score,
    matchdaySuitabilityScore: suitability,
    searchRelevanceScore: searchRelevance,
    finalScore,
    decision,
    reasons,
    rejectionReasons,
    peopleCount: verdict.peopleCount,
    singleClearSubject: verdict.singleClearSubject,
    faceVisible: verdict.faceClearlyVisible,
    bodyVisible: verdict.bodyVisible,
    isRealPhotograph: verdict.isPhotograph,
    isSinglePerson: verdict.singleClearSubject,
    isGraphic: verdict.isGraphic,
    isPoster: verdict.isPoster,
    isCollage: verdict.isCollage,
    isScreenshot: verdict.isScreenshot,
    comparedToReference: verdict.comparedToReference,
    usedGemini: verdict.usedGemini,
    perceptualHash: c.perceptualHash,
  };
}

/**
 * Rank order: ACCEPT → REVIEW → UNVERIFIED → REJECT; then by whether it came
 * from the player's own Instagram, then identity, suitability, finalScore.
 */
const DECISION_RANK: Record<RankDecision, number> = { accept: 0, review: 1, unverified: 2, reject: 3 };
function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (DECISION_RANK[a.decision] !== DECISION_RANK[b.decision]) return DECISION_RANK[a.decision] - DECISION_RANK[b.decision];
  const aIg = a.provider === 'instagram' ? 1 : 0;
  const bIg = b.provider === 'instagram' ? 1 : 0;
  if (aIg !== bIg) return bIg - aIg;
  if (b.identityScore !== a.identityScore) return b.identityScore - a.identityScore;
  if (b.matchdaySuitabilityScore !== a.matchdaySuitabilityScore) return b.matchdaySuitabilityScore - a.matchdaySuitabilityScore;
  return b.finalScore - a.finalScore;
}

export interface RankOutcome {
  ranked: RankedCandidate[];
  rejected: RejectedCandidate[];
  downloadedCount: number;
  uniqueAfterPerceptual: number;
  technicalRejects: number;
  graphicRejects: number;
  identityRejects: number;
  suitabilityRejects: number;
  geminiUsed: boolean;
  geminiCalls: number;
  geminiVerifiedCandidates: number;
}

export async function rankPhotos(
  candidates: PhotoCandidate[],
  input: PlayerPhotoSearchInput,
  queries: string[],
  options: RankOptions = {}
): Promise<RankOutcome> {
  const opts = { ...DEFAULTS, ...options };
  const reference = options.referenceImage ?? null;
  const cache = options.verdictCache;

  const { downloaded, rejected, uniqueAfterPerceptual, technicalRejects, graphicRejects } =
    await downloadFilterDedupe(candidates, opts.maxDownloads);

  // Spend Gemini budget on the most promising first. Candidates from the
  // player's own Instagram are prioritised (identity provenance), then by
  // quality/composition/trust.
  const prelim = downloaded
    .map((c) => {
      const trust = scoreCandidateSource(c, input.instagramHandle);
      const igBoost = c.provider === 'instagram' ? 40 : 0;
      return { c, pre: igBoost + photoQualityScore(c.width, c.height) * 0.35 + compositionScore(c.width, c.height) * 0.35 + trust.score * 0.3 };
    })
    .sort((a, b) => b.pre - a.pre);

  const wantGemini = opts.useGemini && geminiConfigured();
  const geminiBudget = wantGemini ? opts.maxGeminiChecks : 0;

  const ranked: RankedCandidate[] = [];
  let used = 0;
  let verified = 0;
  for (let i = 0; i < prelim.length; i++) {
    const { c } = prelim[i];
    let verdict: IdentityVerdict;

    // Verdict cache: reuse a prior Gemini classification of the same photo.
    const cached = cache && c.perceptualHash && input.playerId
      ? await cache.get(input.playerId, c.perceptualHash)
      : null;

    if (cached) {
      verdict = cacheToVerdict(cached);
    } else if (used < geminiBudget) {
      verdict = await verifyIdentity(c.bytes, c.mimeType, input, reference);
      used++;
      if (verdict.usedGemini && verdict.identityConfidence > 0) verified++;
      if (cache && c.perceptualHash && input.playerId && verdict.usedGemini) {
        await cache.set(verdictToCache(input.playerId, c.perceptualHash, verdict));
      }
    } else {
      verdict = unverifiedVerdict(wantGemini ? 'Beyond Gemini budget — not model-verified' : 'Gemini verification disabled');
    }
    ranked.push(scoreCandidate(c, queries, verdict, input.instagramHandle));
  }

  ranked.sort(compareRanked);

  const identityRejects = ranked.filter(
    (r) => r.decision === 'reject' && r.usedGemini && r.isRealPhotograph && !r.isGraphic && !r.isPoster && !r.isCollage && !r.isScreenshot && r.faceVisible && r.identityScore < IDENTITY_REJECT_BELOW
  ).length;
  const suitabilityRejects = ranked.filter(
    (r) => r.decision === 'reject' && r.usedGemini && (r.isGraphic || r.isPoster || r.isCollage || r.isScreenshot || !r.faceVisible || (r.peopleCount != null && r.peopleCount > 1) || !r.isRealPhotograph)
  ).length;

  return {
    ranked,
    rejected,
    downloadedCount: downloaded.length,
    uniqueAfterPerceptual,
    technicalRejects,
    graphicRejects,
    identityRejects,
    suitabilityRejects,
    geminiUsed: used > 0,
    geminiCalls: used,
    geminiVerifiedCandidates: verified,
  };
}

/** True when a Gemini key is configured (never returns the key itself). */
export function geminiVerificationConfigured(): boolean {
  return geminiConfigured();
}
