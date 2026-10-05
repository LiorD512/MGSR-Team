/**
 * Player identity ranking.
 *
 * Takes the raw candidates from `findPlayerPhotos.ts`, downloads and validates
 * each one, and scores it on several independent signals. The decisive one is
 * identity: we must have real reason to believe the photo is the requested
 * player before it can be used automatically. Gemini is used ONLY as a
 * classification/verification layer — it is asked whether an EXISTING photo
 * plausibly shows the player; it never generates or alters a player.
 *
 * When no candidate clears the bar, the caller returns
 * `NO_VERIFIED_PLAYER_IMAGE` and the manual upload workflow remains the
 * fallback. We never crop a random person and call it the player.
 */

import sharp from 'sharp';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { fetchAndValidate } from '@/lib/matchday/assets';
// Imported for the panel the renderer will eventually draw into — read only,
// so composition scoring matches the real target without touching the renderer.
import { PLAYER_PANEL } from '@/lib/matchday/render';
import { scoreSource } from './sourceTrust';
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

/**
 * Below this on the short axis, an image cannot fill any part of the player
 * panel without enlargement. This is a hard floor; it is NOT about orientation
 * — landscape and portrait are both fine, composition scoring handles shape.
 */
const MIN_SHORT_AXIS = 320;
const MIN_LONG_AXIS = 420;
const MIN_FILE_BYTES = 6 * 1024;

/** Accept threshold on the final blended score. */
const ACCEPT_AT = 68;
const REVIEW_AT = 48;
/** Below this identity confidence, a candidate can never auto-accept. */
const MIN_IDENTITY_TO_ACCEPT = 70;

export interface RankOptions {
  /** Cap how many candidates we download (cost + latency control). */
  maxDownloads?: number;
  /** Cap how many of the best downloads get a Gemini verification pass. */
  maxGeminiChecks?: number;
  /** Allow disabling Gemini entirely (e.g. key absent, or deterministic test). */
  useGemini?: boolean;
}

const DEFAULTS: Required<RankOptions> = {
  maxDownloads: 14,
  maxGeminiChecks: 6,
  useGemini: true,
};

// ── Download + hard-reject ───────────────────────────────────────────────────

interface DownloadOutcome {
  downloaded: DownloadedCandidate[];
  rejected: RejectedCandidate[];
}

/**
 * Download candidates and keep only real, large-enough photographs. Logos and
 * non-photographic graphics are filtered here cheaply (aspect/alpha/palette)
 * before any paid model sees them.
 */
async function downloadAndFilter(
  candidates: PhotoCandidate[],
  limit: number
): Promise<DownloadOutcome> {
  const downloaded: DownloadedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const c of candidates) {
    if (downloaded.length >= limit) break;

    if (TM_SILHOUETTE.test(c.imageUrl)) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, reason: 'Transfermarkt silhouette placeholder' });
      continue;
    }

    const fetched = await fetchAndValidate(
      { url: c.imageUrl, source: c.source, pageUrl: c.sourceUrl ?? undefined },
      { minWidth: 1, minHeight: 1 } // size is judged below against our own floors
    );
    if (!fetched) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, reason: 'Unreachable or not a valid image' });
      continue;
    }

    const short = Math.min(fetched.width, fetched.height);
    const long = Math.max(fetched.width, fetched.height);
    if (short < MIN_SHORT_AXIS || long < MIN_LONG_AXIS) {
      rejected.push({
        imageUrl: c.imageUrl,
        source: c.source,
        reason: `Too small (${fetched.width}×${fetched.height})`,
      });
      continue;
    }
    if (fetched.bytes.byteLength < MIN_FILE_BYTES) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, reason: 'Suspiciously small file (likely icon/placeholder)' });
      continue;
    }

    const graphic = await looksLikeGraphic(fetched.bytes, fetched.width, fetched.height);
    if (graphic) {
      rejected.push({ imageUrl: c.imageUrl, source: c.source, reason: graphic });
      continue;
    }

    downloaded.push({
      ...c,
      width: fetched.width,
      height: fetched.height,
      fileSize: fetched.bytes.byteLength,
      mimeType: fetched.mimeType,
      bytes: fetched.bytes,
    });
  }

  return { downloaded, rejected };
}

/**
 * Cheap, deterministic "is this a logo/graphic rather than a photograph?"
 * heuristic. Logos tend to be tiny, square, transparent, and built from very
 * few distinct colours. Returns a reason string when it looks non-photographic,
 * else null. This is a pre-filter, not the final word — Gemini confirms.
 */
async function looksLikeGraphic(bytes: Buffer, width: number, height: number): Promise<string | null> {
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.hasAlpha) {
      // Transparent + near-square + small is the classic crest/badge signature.
      const aspect = width / height;
      if (aspect > 0.8 && aspect < 1.25 && Math.max(width, height) <= 600) {
        return 'Looks like a logo/badge (transparent, square, small)';
      }
    }
    // Colour-count probe on a downscaled copy: photographs carry far more
    // distinct colours than flat graphics.
    const stats = await sharp(bytes).resize(64, 64, { fit: 'inside' }).stats();
    const channelStdev = stats.channels.map((ch) => ch.stdev);
    const avgStdev = channelStdev.reduce((a, b) => a + b, 0) / channelStdev.length;
    if (avgStdev < 12) {
      return 'Looks like a flat graphic (very low colour variance)';
    }
    return null;
  } catch {
    return null; // if we cannot probe it, let later stages decide
  }
}

// ── Deterministic component scoring ──────────────────────────────────────────

/** Earlier (stronger-identity) queries score higher. */
function searchRelevanceScore(searchQuery: string, queries: string[]): number {
  const idx = queries.indexOf(searchQuery);
  if (idx < 0) return 55;
  const span = Math.max(queries.length - 1, 1);
  return Math.round(90 - (idx / span) * 40); // 90 → 50
}

/** Resolution-driven quality score, generous above the renderer's panel size. */
function imageQualityScore(width: number, height: number): number {
  const short = Math.min(width, height);
  const target = Math.min(PLAYER_PANEL.width, PLAYER_PANEL.height); // 640
  const ratio = short / target;
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.1) return 90;
  if (ratio >= 0.8) return 78;
  if (ratio >= 0.6) return 64;
  return 50;
}

/**
 * Composition suitability for a tall 9:16 subject panel. We do NOT penalise
 * orientation outright — a wide action shot can still crop well — but portrait
 * frames that match the panel's aspect are preferred.
 */
function compositionScore(width: number, height: number): number {
  const aspect = width / height;
  const panelAspect = PLAYER_PANEL.width / PLAYER_PANEL.height; // ~0.615 (tall)
  if (aspect <= 1) {
    // Portrait: best when close to the panel's own aspect.
    const closeness = 1 - Math.min(Math.abs(aspect - panelAspect) / panelAspect, 1);
    return Math.round(70 + closeness * 30); // 70 → 100
  }
  // Landscape: usable but needs a tighter crop; score by how wide it is.
  if (aspect <= 1.4) return 72;
  if (aspect <= 1.9) return 60;
  return 48;
}

// ── Gemini identity verification (advisory signal only) ──────────────────────

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

/**
 * Ask Gemini to CLASSIFY an existing photo. The prompt is explicit that it must
 * not invent anything, and that uncertainty must be reported as low confidence
 * rather than a guess. This is one signal; `blend()` keeps it in proportion.
 */
async function verifyIdentity(
  bytes: Buffer,
  mimeType: string,
  input: PlayerPhotoSearchInput
): Promise<IdentityVerdict> {
  const skip: IdentityVerdict = {
    identityConfidence: 50,
    peopleCount: null,
    singleClearSubject: false,
    isPhotograph: true,
    reasons: ['Gemini verification not run'],
    usedGemini: false,
  };
  if (!geminiConfigured()) return skip;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!.trim());
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        responseMimeType: 'application/json',
        // Cap thinking budget to keep per-image classification fast; the SDK's
        // type does not yet include this field, matching documents/detect.
        thinkingConfig: { thinkingBudget: 512 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    const prompt = `You are verifying an EXISTING photograph. Do not invent or imagine anything.

Question: Does this image plausibly show the real football player "${input.playerName}"${
      input.club ? `, associated with the club "${input.club}"` : ''
    }${input.country ? ` (nationality/country: ${input.country})` : ''}?

Also assess, strictly from what is visible:
- How many distinct people are in the frame.
- Whether exactly ONE player is clearly visible and usable as the single subject of a poster (not a crowd, not a tiny figure, not a group).
- Whether this is a real PHOTOGRAPH (not a logo, badge, graphic, illustration, or AI render).

You cannot definitively prove identity from a photo. If you are not reasonably sure it is this specific player, report LOW confidence rather than guessing. Base confidence on recognisability, context clues (kit, club, captions baked into the image), and image clarity.

Return ONLY JSON:
{
  "identityConfidence": 0-100,
  "peopleCount": integer,
  "singleClearSubject": boolean,
  "isPhotograph": boolean,
  "reasons": [short strings]
}`;

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
    if (!obj) return { ...skip, usedGemini: true, reasons: ['Gemini returned unparseable output'] };

    const clamp = (n: unknown, d = 0) =>
      typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;

    return {
      identityConfidence: clamp(obj.identityConfidence, 0),
      peopleCount: typeof obj.peopleCount === 'number' ? Math.max(0, Math.round(obj.peopleCount)) : null,
      singleClearSubject: obj.singleClearSubject === true,
      isPhotograph: obj.isPhotograph !== false,
      reasons: Array.isArray(obj.reasons) ? obj.reasons.map(String).slice(0, 6) : [],
      usedGemini: true,
    };
  } catch (err) {
    return {
      ...skip,
      usedGemini: true,
      reasons: [`Gemini error: ${err instanceof Error ? err.message : 'unknown'}`],
    };
  }
}

// ── Blend + decide ───────────────────────────────────────────────────────────

function blend(
  c: DownloadedCandidate,
  queries: string[],
  verdict: IdentityVerdict
): RankedCandidate {
  const reasons: string[] = [];
  const trust = scoreSource(c.sourceUrl, c.imageUrl);
  reasons.push(trust.reason);

  const searchRelevance = searchRelevanceScore(c.searchQuery, queries);
  const quality = imageQualityScore(c.width, c.height);
  const composition = compositionScore(c.width, c.height);
  const identity = verdict.identityConfidence;

  if (verdict.usedGemini) {
    reasons.push(...verdict.reasons);
  } else {
    reasons.push('Identity not model-verified — source trust and quality only');
  }

  // Weighted blend. Identity is primary; source trust is a strong secondary.
  // When Gemini did not run, lean harder on trust + quality so an unverified
  // image from an unknown host cannot float up on resolution alone.
  const finalScore = verdict.usedGemini
    ? Math.round(
        identity * 0.42 +
          trust.score * 0.24 +
          quality * 0.16 +
          composition * 0.12 +
          searchRelevance * 0.06
      )
    : Math.round(
        trust.score * 0.44 +
          quality * 0.26 +
          composition * 0.16 +
          searchRelevance * 0.14
      );

  // Decision gates. Auto-accept requires a believable single subject AND a
  // real photograph AND enough identity confidence — never on score alone.
  let decision: RankDecision;
  const hardFailPhoto = verdict.usedGemini && !verdict.isPhotograph;
  const crowd = verdict.usedGemini && verdict.peopleCount != null && verdict.peopleCount > 1 && !verdict.singleClearSubject;

  if (hardFailPhoto) {
    decision = 'reject';
    reasons.push('Gemini says this is not a photograph');
  } else if (crowd) {
    decision = 'reject';
    reasons.push('Multiple people and no single clear subject — cannot be sure which is the player');
  } else if (verdict.usedGemini && identity < MIN_IDENTITY_TO_ACCEPT) {
    decision = finalScore >= REVIEW_AT ? 'review' : 'reject';
    reasons.push(`Identity confidence ${identity} below auto-accept bar (${MIN_IDENTITY_TO_ACCEPT})`);
  } else if (finalScore >= ACCEPT_AT) {
    decision = 'accept';
  } else if (finalScore >= REVIEW_AT) {
    decision = 'review';
  } else {
    decision = 'reject';
  }

  return {
    imageUrl: c.imageUrl,
    source: c.source,
    sourceUrl: c.sourceUrl,
    searchQuery: c.searchQuery,
    width: c.width,
    height: c.height,
    fileSize: c.fileSize,
    searchRelevanceScore: searchRelevance,
    sourceTrustScore: trust.score,
    imageQualityScore: quality,
    compositionScore: composition,
    identityConfidence: identity,
    finalScore,
    decision,
    reasons,
    peopleCount: verdict.peopleCount,
    singleClearSubject: verdict.singleClearSubject,
    usedGemini: verdict.usedGemini,
  };
}

export interface RankOutcome {
  ranked: RankedCandidate[];
  rejected: RejectedCandidate[];
  downloadedCount: number;
  geminiUsed: boolean;
  /** How many Gemini vision calls were actually issued this run. */
  geminiCalls: number;
}

/**
 * Full ranking pass: download+filter → preliminary deterministic scoring →
 * Gemini verification on the most promising subset → final blend & sort.
 */
export async function rankPhotos(
  candidates: PhotoCandidate[],
  input: PlayerPhotoSearchInput,
  queries: string[],
  options: RankOptions = {}
): Promise<RankOutcome> {
  const opts = { ...DEFAULTS, ...options };
  const { downloaded, rejected } = await downloadAndFilter(candidates, opts.maxDownloads);

  // Pre-rank cheaply (no Gemini) so we only spend model calls on the best few.
  const prelim = downloaded
    .map((c) => ({
      c,
      pre: scoreSource(c.sourceUrl, c.imageUrl).score * 0.5 + imageQualityScore(c.width, c.height) * 0.5,
    }))
    .sort((a, b) => b.pre - a.pre);

  const wantGemini = opts.useGemini && geminiConfigured();
  const geminiBudget = wantGemini ? opts.maxGeminiChecks : 0;

  const ranked: RankedCandidate[] = [];
  let used = 0;
  for (let i = 0; i < prelim.length; i++) {
    const { c } = prelim[i];
    let verdict: IdentityVerdict;
    if (used < geminiBudget) {
      verdict = await verifyIdentity(c.bytes, c.mimeType, input);
      used++;
    } else {
      verdict = {
        identityConfidence: 50,
        peopleCount: null,
        singleClearSubject: false,
        isPhotograph: true,
        reasons: ['Beyond Gemini budget — not model-verified'],
        usedGemini: false,
      };
    }
    ranked.push(blend(c, queries, verdict));
  }

  ranked.sort((a, b) => b.finalScore - a.finalScore);
  return { ranked, rejected, downloadedCount: downloaded.length, geminiUsed: used > 0, geminiCalls: used };
}

/** True when a Gemini key is configured (never returns the key itself). */
export function geminiVerificationConfigured(): boolean {
  return geminiConfigured();
}
