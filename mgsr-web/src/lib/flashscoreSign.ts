/**
 * Flashscore feed signature (`x-fsign`).
 *
 * The signed `flashscore.ninja` feeds — the only source of per-match venue —
 * reject any request without the current signature with an HTTP 401. The value
 * is a global build-time constant that Flashscore publishes in plain JSON on
 * its own pages, so rather than hardcoding it and waiting for a rotation to
 * silently break venue lookups, we derive it at runtime and cache it.
 *
 * Two detection paths, deliberately complementary:
 *   - `observeSignFromHtml` is the fast path. Callers hand it HTML they already
 *     fetched for another purpose, so noticing a rotation costs nothing and
 *     usually happens *before* a request is rejected.
 *   - `refreshFlashscoreSign` is the safety net, triggered only by a 401. It
 *     also distinguishes a genuine rotation from a 401 caused by something else
 *     (IP reputation, geo, rate limiting), which the fast path cannot see.
 *
 * Nothing here throws or rejects: a signature is always returned, falling back
 * to the last value known at publish time.
 */

import { getCached, setCache } from './scrapingCache';

/** Last value known good when this file was written. */
export const FLASHSCORE_FSIGN_SEED = 'SW9D1eZo';

const FLASHSCORE_MOBI = 'https://www.flashscore.mobi/';

/* Anchored on the key, never the value: the current signature also appears on
   every page as a tournament id inside `cjs.defaultTopLeagues`, so matching the
   literal would false-positive. Flashscore spells the key `feedSign` on the
   mobile site and `feed_sign` on the desktop one. */
const SIGN_PATTERN = /"feed_?[sS]ign":"([A-Za-z0-9_-]{6,24})"/;
const SIGN_SHAPE = /^[A-Za-z0-9_-]{6,24}$/;

const STORE_KEY = 'flashscore-fsign';
/** Shorter than the store TTL so a warm instance picks up another instance's
    discovery without having to be rejected first. */
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;
const STORE_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_BACKOFF_MS = 60_000;
/** Consecutive observations with no signature before we assume the page shape
    changed and the fast path has gone blind. */
const BLIND_STREAK_ALARM = 10;

const LOG = '[flashscore:fsign]';

export type SignSource = 'seed' | 'memory' | 'firestore' | 'mobi' | 'team-page';

export interface SignState {
  sign: string;
  source: SignSource;
  /** When the value was last seen at its source. */
  verifiedAt: number;
}

let memory: SignState | null = null;
let memoryAt = 0;
let inFlight: Promise<SignState | null> | null = null;
let refreshFailedAt = 0;
let blindStreak = 0;

function signHeaders(): HeadersInit {
  return {
    accept: 'text/html,application/xhtml+xml,*/*',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148 Safari/537.36',
  };
}

export function extractSignFromHtml(html: string): string | null {
  const found = html.match(SIGN_PATTERN)?.[1];
  return found && SIGN_SHAPE.test(found) ? found : null;
}

async function readStore(): Promise<SignState | null> {
  const stored = await getCached<SignState>(STORE_KEY, STORE_TTL_MS);
  if (!stored || typeof stored.sign !== 'string' || !SIGN_SHAPE.test(stored.sign)) return null;
  return stored;
}

function remember(state: SignState): SignState {
  memory = state;
  memoryAt = Date.now();
  return state;
}

/** Never null — degrades to the seed when nothing better is available. */
export async function getFlashscoreSign(): Promise<SignState> {
  if (memory && Date.now() - memoryAt < MEMORY_TTL_MS) return memory;

  const stored = await readStore();
  if (stored) return remember({ ...stored, source: 'firestore' });

  // A missing store is the normal case in local dev (no admin credentials) and
  // on a cold instance, so it is not worth a log line. Deliberately not
  // remembered, so the next call re-reads the store.
  return { sign: FLASHSCORE_FSIGN_SEED, source: 'seed', verifiedAt: 0 };
}

/**
 * Called only after the feed rejected `rejected`. Resolves to a signature
 * different from that one, or null if no better value could be obtained.
 */
export function refreshFlashscoreSign(rejected: string): Promise<SignState | null> {
  if (inFlight) return inFlight;
  if (Date.now() - refreshFailedAt < REFRESH_BACKOFF_MS) return Promise.resolve(null);

  const attempt = deriveSign(rejected).finally(() => {
    if (inFlight === attempt) inFlight = null;
  });
  inFlight = attempt;
  return attempt;
}

/** Resolves rather than rejects on every failure, so concurrent waiters sharing
    this promise never need their own error handling. */
async function deriveSign(rejected: string): Promise<SignState | null> {
  // Another instance may already have healed this — costs one document read
  // instead of a scrape, and keeps a rotation from fanning out.
  try {
    const stored = await readStore();
    if (stored && stored.sign !== rejected) {
      return remember({ ...stored, source: 'firestore' });
    }
  } catch {
    /* store unavailable — fall through to deriving it ourselves */
  }

  let html: string;
  try {
    const response = await fetch(FLASHSCORE_MOBI, {
      headers: signHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      refreshFailedAt = Date.now();
      console.error(`${LOG} cannot reach ${FLASHSCORE_MOBI} (HTTP ${response.status})`);
      return null;
    }
    html = await response.text();
  } catch (error) {
    refreshFailedAt = Date.now();
    console.error(
      `${LOG} cannot reach ${FLASHSCORE_MOBI}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }

  const found = extractSignFromHtml(html);
  if (!found) {
    refreshFailedAt = Date.now();
    console.error(`${LOG} no signature in ${FLASHSCORE_MOBI} — page shape changed, venue is down`);
    return null;
  }

  if (found === rejected) {
    // Flashscore still publishes the signature we were rejected for, so the
    // rejection is about us, not the signature. Retrying would not help.
    refreshFailedAt = Date.now();
    console.warn(
      `${LOG} feed rejected ${rejected} but Flashscore still publishes it — likely IP, geo or rate limiting`
    );
    return null;
  }

  console.warn(`${LOG} rotated: ${rejected} -> ${found}`);
  const state: SignState = { sign: found, source: 'mobi', verifiedAt: Date.now() };
  remember(state);
  void setCache(STORE_KEY, state);
  return state;
}

/**
 * Compare a signature published in already-fetched HTML against what we hold.
 * Fire-and-forget: returns immediately and never disturbs the caller.
 */
export function observeSignFromHtml(html: string, source: SignSource): void {
  const found = extractSignFromHtml(html);
  if (!found) {
    blindStreak++;
    if (blindStreak === BLIND_STREAK_ALARM) {
      console.warn(
        `${LOG} no signature in ${BLIND_STREAK_ALARM} consecutive pages — rotations will no longer be caught early`
      );
    }
    return;
  }
  blindStreak = 0;

  void (async () => {
    try {
      const held = memory ?? (await readStore());
      const heldSign = held?.sign ?? FLASHSCORE_FSIGN_SEED;

      if (heldSign !== found) {
        console.warn(`${LOG} changed on ${source}: ${heldSign} -> ${found}`);
        const state: SignState = { sign: found, source, verifiedAt: Date.now() };
        remember(state);
        await setCache(STORE_KEY, state);
        return;
      }

      // Unchanged. Re-stamping on every observation would mean a Firestore
      // write per fixture resolve, so only refresh once the record is halfway
      // to expiry.
      if (Date.now() - (held?.verifiedAt ?? 0) > STORE_TTL_MS / 2) {
        const state: SignState = { sign: found, source, verifiedAt: Date.now() };
        remember(state);
        await setCache(STORE_KEY, state);
      } else if (!memory && held) {
        remember(held);
      }
    } catch {
      /* observation is best-effort */
    }
  })();
}

export interface SignProbe {
  sign: string;
  source: SignSource;
  verifiedAt: number;
  ageMs: number | null;
  seedMatches: boolean;
  mobiSign: string | null;
  /** 'unknown' when the probe fixture itself could not be checked, so a dead
      match id cannot masquerade as a broken signature. */
  signValid: boolean | 'unknown';
}

/** Diagnostics for the health route and the regression script. Pass a live
    match id to actually exercise the feed. */
export async function probeSign(matchId?: string | null): Promise<SignProbe> {
  const held = await getFlashscoreSign();

  let mobiSign: string | null = null;
  try {
    const response = await fetch(FLASHSCORE_MOBI, {
      headers: signHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) mobiSign = extractSignFromHtml(await response.text());
  } catch {
    /* reported as a null mobiSign */
  }

  let signValid: boolean | 'unknown' = 'unknown';
  if (matchId) {
    const [held401, garbage401] = await Promise.all([
      feedRejects(matchId, held.sign),
      feedRejects(matchId, 'x'.repeat(8)),
    ]);
    // Only meaningful if the feed rejects a known-bad signature; if it accepts
    // everything, or the fixture has gone, we have learned nothing.
    if (garbage401 === true) signValid = held401 === false;
  }

  return {
    sign: held.sign,
    source: held.source,
    verifiedAt: held.verifiedAt,
    ageMs: held.verifiedAt ? Date.now() - held.verifiedAt : null,
    seedMatches: held.sign === FLASHSCORE_FSIGN_SEED,
    mobiSign,
    signValid,
  };
}

/** true = rejected (401/403), false = accepted, null = inconclusive. */
async function feedRejects(matchId: string, sign: string): Promise<boolean | null> {
  try {
    const response = await fetch(
      `https://local-global.flashscore.ninja/2/x/feed/df_sui_1_${matchId}`,
      { headers: { ...signHeaders(), 'x-fsign': sign }, signal: AbortSignal.timeout(10_000) }
    );
    if (response.status === 401 || response.status === 403) return true;
    if (response.ok) return false;
    return null;
  } catch {
    return null;
  }
}
