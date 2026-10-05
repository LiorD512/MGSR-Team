/**
 * Player identity ranking.
 *
 * Downloads and validates the discovered candidates, collapses near-duplicates
 * perceptually, rejects graphics/posters, and scores each survivor on SEPARATE
 * axes. Identity is a HARD GATE: a weak identity score can never be rescued by
 * source trust, image quality, or composition.
 *
 *   identity < 75           → REJECT
 *   identity 75–79          → REVIEW
 *   identity ≥ 80           → eligible for ACCEPT (if also a clean, suitable photo)
 *
 * Gemini is used ONLY to classify an EXISTING photo — it never generates or
 * alters a player. When Gemini is unavailable, identity cannot be verified, so
 * a candidate can never auto-ACCEPT; it is surfaced as UNVERIFIED for human
 * review. When nothing clears the bar the caller returns
 * `NO_VERIFIED_PLAYER_IMAGE`. It is always better to return no image than the
 * wrong player.
 */

import sharp from 'sharp';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { fetchAndValidate } from '@/lib/matchday/assets';
// Imported for the panel the renderer will eventually draw into — read only,
// so composition scoring matches the real target without touching the renderer.
import { PLAYER_PANEL } from '@/lib/matchday/render';
import { scoreSource } from './sourceTrust';
import { perceptualHash, isNearDuplicate } from './perceptualHash';
import type {
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

// ── Identity gate (the whole point of this iteration) ──
/** Below this, identity is too weak to use at all. */
const IDENTITY_REJECT_BELOW = 75;
/** At/above this, identity is strong enough to be ACCEPT-eligible. */
const IDENTITY_ACCEPT_AT = 80;
/** A clean photo also needs this much MATCHDAY suitability to auto-accept. */
const SUITABILITY_ACCEPT_AT = 60;

export interface RankOptions {
  /** Cap how many candidates we download (cost + latency control). */
  maxDownloads?: number;
  /** Cap how many of the best downloads get a Gemini verification pass. */
  maxGeminiChecks?: number;
  /** Allow disabling Gemini entirely (e.g. key absent, or deterministic test). */
  useGemini?: boolean;
}

const DEFAULTS: Required<RankOptions> = {
  // Broader discovery (iteration 2): download more so perceptual dedup still
  // leaves a healthy pool, and give more candidates a real identity check.
  maxDownloads: 24,
  maxGeminiChecks: 12,
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

    // Perceptual de-dup: fold resized/re-cropped copies of a photo we already
    // kept into a single candidate.
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

  return {
    downloaded: kept,
    rejected,
    uniqueAfterPerceptual: kept.length,
    technicalRejects,
    graphicRejects,
  };
}

/**
 * Deterministic "is this a graphic/poster rather than a clean photograph?"
 * pre-filter. Catches transparent badges, flat graphics, and extreme-aspect
 * banners/strips before any paid model call. Gemini provides the stronger
 * poster/collage/screenshot judgement later.
 */
async function looksLikeGraphic(bytes: Buffer, width: number, height: number): Promise<string | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const aspect = width / height;

    if (meta.hasAlpha && aspect > 0.8 && aspect < 1.25 && Math.max(width, height) <= 600) {
      return 'Looks like a logo/badge (transparent, square, small)';
    }

    // Banners / promo strips: very wide or very tall frames are almost never a
    // usable single-subject photograph.
    if (aspect >= 2.4 || aspect <= 0.33) {
      return `Extreme aspect ratio ${aspect.toFixed(2)} (banner/strip, not a portrait)`;
    }

    const stats = await sharp(bytes).resize(64, 64, { fit: 'inside' }).stats();
    const avgStdev = stats.channels.map((ch) => ch.stdev).reduce((a, b) => a + b, 0) / stats.channels.length;
    if (avgStdev < 12) {
      return 'Looks like a flat graphic (very low colour variance)';
    }
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

/**
 * MATCHDAY suitability from deterministic signals, used as a FALLBACK/floor when
 * Gemini does not supply its own suitability read. Blends resolution and framing
 * — it does NOT consider identity (that is a separate hard gate).
 */
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

/** The verdict used when Gemini did not (or could not) classify a candidate. */
function unverifiedVerdict(reason: string): IdentityVerdict {
  return {
    identityConfidence: 0,
    peopleCount: null,
    singleClearSubject: false,
    isPhotograph: true,
    isGraphicOrPoster: false,
    faceClearlyVisible: false,
    matchdaySuitability: 0,
    reasons: [reason],
    usedGemini: false,
  };
}

async function verifyIdentity(
  bytes: Buffer,
  mimeType: string,
  input: PlayerPhotoSearchInput
): Promise<IdentityVerdict> {
  if (!geminiConfigured()) return unverifiedVerdict('Gemini key not configured — identity unverifiable');

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!.trim());
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 512 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    const prompt = `You are CLASSIFYING an EXISTING photograph for a football "MATCHDAY" graphic. Do NOT invent, imagine, generate, or describe anything that is not visibly present. Judge only what is in the image.

Target player: "${input.playerName}"${input.club ? `, associated with the club "${input.club}"` : ''}${input.country ? ` (nationality/country: ${input.country})` : ''}.

Answer strictly from what is visible:
1. identityConfidence (0-100): how confident that this is the REAL target player. You cannot definitively prove identity from a photo — if you are not reasonably sure it is THIS specific player, report LOW confidence. Base it on recognisable facial features, club kit, and any caption text baked into the image. A generic or distant footballer you cannot identify as this player must score LOW.
2. peopleCount (integer): how many distinct people are in the frame.
3. singleClearSubject (bool): exactly ONE player is clearly the subject and usable (not a crowd/group, not a tiny distant figure).
4. faceClearlyVisible (bool): the subject's face is clearly visible (not turned fully away, not obstructed, not too small).
5. isPhotograph (bool): a real photograph (NOT a logo, badge, illustration, or AI render).
6. isGraphicOrPoster (bool): the image is, or is embedded inside, a POSTER / welcome graphic / social-media card / promotional layout / collage / screenshot / has large overlaid text or decorative design. A real photo placed inside such a layout counts as TRUE.
7. matchdaySuitability (0-100): how usable as a clean single-player MATCHDAY subject — one player, clear visible face, medium/upper-body or full-body, sharp, natural football photo, enough surrounding pixels, minimal obstruction, no large text, no promotional layout. Distant, motion-blurred, facing-away, extreme-crop, obstructed, multi-player, or graphic/poster images must score LOW.

Return ONLY JSON:
{"identityConfidence":0-100,"peopleCount":int,"singleClearSubject":bool,"faceClearlyVisible":bool,"isPhotograph":bool,"isGraphicOrPoster":bool,"matchdaySuitability":0-100,"reasons":[short strings]}`;

    const result = await model.generateContent([
      { inlineData: { mimeType: mimeType || 'image/png', data: bytes.toString('base64') } },
      { text: prompt },
    ]);
    const text = (() => {
      try {
        return typeof result.response.text === 'function' ? result.response.text() : '';
      } catch {
        return '';
      }
    })();
    const obj = extractJson(text || '');
    if (!obj) {
      return { ...unverifiedVerdict('Gemini returned unparseable output'), usedGemini: true };
    }

    const clamp = (n: unknown, d = 0) =>
      typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;

    return {
      identityConfidence: clamp(obj.identityConfidence, 0),
      peopleCount: typeof obj.peopleCount === 'number' ? Math.max(0, Math.round(obj.peopleCount)) : null,
      singleClearSubject: obj.singleClearSubject === true,
      faceClearlyVisible: obj.faceClearlyVisible === true,
      isPhotograph: obj.isPhotograph !== false,
      isGraphicOrPoster: obj.isGraphicOrPoster === true,
      matchdaySuitability: clamp(obj.matchdaySuitability, 0),
      reasons: Array.isArray(obj.reasons) ? obj.reasons.map(String).slice(0, 6) : [],
      usedGemini: true,
    };
  } catch (err) {
    return { ...unverifiedVerdict(`Gemini error: ${err instanceof Error ? err.message : 'unknown'}`), usedGemini: true };
  }
}

// ── Score + decide (identity is a HARD GATE) ─────────────────────────────────

function scoreCandidate(
  c: DownloadedCandidate,
  queries: string[],
  verdict: IdentityVerdict
): RankedCandidate {
  const reasons: string[] = [];
  const trust = scoreSource(c.sourceUrl, c.imageUrl);

  const searchRelevance = searchRelevanceScore(c.searchQuery, queries);
  const quality = photoQualityScore(c.width, c.height);
  const composition = compositionScore(c.width, c.height);
  const identity = verdict.identityConfidence;

  // Suitability: Gemini's read when available, else deterministic floor.
  const suitability = verdict.usedGemini
    ? verdict.matchdaySuitability
    : deterministicSuitability(c.width, c.height);

  // finalScore blends the NON-identity signals only. It never gates identity —
  // identity is handled separately below — so trust/quality can rank among
  // ACCEPT-eligible photos but can never promote a weak-identity one.
  const finalScore = Math.round(
    suitability * 0.4 + composition * 0.2 + quality * 0.2 + trust.score * 0.12 + searchRelevance * 0.08
  );

  trust && reasons.push(trust.reason);

  let decision: RankDecision;

  if (!verdict.usedGemini) {
    // No model verification → identity unproven → never ACCEPT.
    decision = 'unverified';
    reasons.push('Identity NOT model-verified — automatic ACCEPT not allowed');
    reasons.push(...verdict.reasons);
  } else if (verdict.isGraphicOrPoster) {
    decision = 'reject';
    reasons.push('Rejected: poster/graphic/collage/screenshot, not a clean photograph');
  } else if (!verdict.isPhotograph) {
    decision = 'reject';
    reasons.push('Rejected: not a real photograph (logo/illustration/render)');
  } else if (verdict.peopleCount != null && verdict.peopleCount > 1 && !verdict.singleClearSubject) {
    decision = 'reject';
    reasons.push('Rejected: multiple people, no single clear subject');
  } else if (!verdict.faceClearlyVisible) {
    decision = 'reject';
    reasons.push('Rejected: face not clearly visible (away/obstructed/too small)');
  } else if (identity < IDENTITY_REJECT_BELOW) {
    decision = 'reject';
    reasons.push(`Rejected: identity ${identity} < ${IDENTITY_REJECT_BELOW} (cannot confirm this is the player)`);
  } else if (identity < IDENTITY_ACCEPT_AT) {
    decision = 'review';
    reasons.push(`Review: identity ${identity} in 75–79 band (needs human confirmation)`);
  } else if (suitability < SUITABILITY_ACCEPT_AT) {
    decision = 'review';
    reasons.push(`Review: identity ${identity} OK but MATCHDAY suitability ${suitability} < ${SUITABILITY_ACCEPT_AT}`);
  } else {
    decision = 'accept';
    reasons.push(`Accept: identity ${identity} ≥ ${IDENTITY_ACCEPT_AT}, clean suitable photograph`);
    reasons.push(...verdict.reasons.slice(0, 2));
  }

  return {
    imageUrl: c.imageUrl,
    source: c.source,
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
    peopleCount: verdict.peopleCount,
    singleClearSubject: verdict.singleClearSubject,
    faceClearlyVisible: verdict.faceClearlyVisible,
    isGraphicOrPoster: verdict.isGraphicOrPoster,
    usedGemini: verdict.usedGemini,
    perceptualHash: c.perceptualHash,
  };
}

/**
 * Rank order: ACCEPT first, then REVIEW, then UNVERIFIED, then REJECT; within a
 * decision, by identity, then suitability, then finalScore. This keeps the most
 * trustworthy, best-identified photos at the top where it matters.
 */
const DECISION_RANK: Record<RankDecision, number> = { accept: 0, review: 1, unverified: 2, reject: 3 };
function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (DECISION_RANK[a.decision] !== DECISION_RANK[b.decision]) {
    return DECISION_RANK[a.decision] - DECISION_RANK[b.decision];
  }
  if (b.identityScore !== a.identityScore) return b.identityScore - a.identityScore;
  if (b.matchdaySuitabilityScore !== a.matchdaySuitabilityScore) {
    return b.matchdaySuitabilityScore - a.matchdaySuitabilityScore;
  }
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
  const { downloaded, rejected, uniqueAfterPerceptual, technicalRejects, graphicRejects } =
    await downloadFilterDedupe(candidates, opts.maxDownloads);

  // Order the survivors so Gemini budget is spent on the most promising first
  // (quality + composition + source trust — identity is unknown pre-Gemini).
  const prelim = downloaded
    .map((c) => ({
      c,
      pre:
        photoQualityScore(c.width, c.height) * 0.4 +
        compositionScore(c.width, c.height) * 0.4 +
        scoreSource(c.sourceUrl, c.imageUrl).score * 0.2,
    }))
    .sort((a, b) => b.pre - a.pre);

  const wantGemini = opts.useGemini && geminiConfigured();
  const geminiBudget = wantGemini ? opts.maxGeminiChecks : 0;

  const ranked: RankedCandidate[] = [];
  let used = 0;
  let verified = 0;
  for (let i = 0; i < prelim.length; i++) {
    const { c } = prelim[i];
    let verdict: IdentityVerdict;
    if (used < geminiBudget) {
      verdict = await verifyIdentity(c.bytes, c.mimeType, input);
      used++;
      if (verdict.usedGemini && verdict.identityConfidence > 0) verified++;
    } else {
      verdict = unverifiedVerdict(wantGemini ? 'Beyond Gemini budget — not model-verified' : 'Gemini verification disabled');
    }
    ranked.push(scoreCandidate(c, queries, verdict));
  }

  ranked.sort(compareRanked);

  const identityRejects = ranked.filter(
    (r) => r.decision === 'reject' && r.usedGemini && r.identityScore < IDENTITY_REJECT_BELOW
  ).length;
  const suitabilityRejects = ranked.filter(
    (r) =>
      r.decision === 'reject' &&
      r.usedGemini &&
      r.identityScore >= IDENTITY_REJECT_BELOW &&
      (r.isGraphicOrPoster || !r.faceClearlyVisible || (r.peopleCount != null && r.peopleCount > 1))
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
