/**
 * Source trust scoring for discovered player photographs.
 *
 * An official club photo is worth far more than a random image-host result: it
 * is almost certainly the right person, in current kit, shot by someone who
 * knows who they are photographing. This module turns the origin page of a
 * candidate into a trust tier + score, and is intentionally data-driven so the
 * priorities can be tuned without hunting through the ranking code.
 */

import type { PhotoCandidate, SourceTrustResult, SourceTrustTier } from './types';
import { normalizeInstagramHandle } from './providers/instagramProvider';

/** Score floor for each tier. The ranker blends this with other signals. */
export const TRUST_TIER_SCORE: Record<SourceTrustTier, number> = {
  // The player's own Instagram is the single most identity-trustworthy source:
  // it is their account, so a photo there is almost certainly them.
  player_instagram: 100,
  official_club: 98,
  verified_social: 92,
  major_media: 84,
  transfermarkt: 72,
  football_site: 60,
  image_site: 38,
  unknown: 25,
};

/**
 * Host patterns, matched against the origin page host (falling back to the
 * image host). First matching rule wins, so order from most to least specific.
 *
 * This is deliberately editable config, not logic. Add a club domain here and
 * it is immediately trusted; no other file needs to change.
 */
interface TrustRule {
  tier: SourceTrustTier;
  reason: string;
  /** Substrings tested against the lowercased host. */
  hosts?: string[];
  /** Regexes tested against the lowercased host. */
  patterns?: RegExp[];
}

const TRUST_RULES: TrustRule[] = [
  // ── Transfermarkt (own tier so it is neither over- nor under-trusted) ──
  {
    tier: 'transfermarkt',
    reason: 'Transfermarkt (structured football DB)',
    hosts: ['transfermarkt.', 'tmssl.akamaized.net', 'img.a.transfermarkt'],
  },

  // ── Major football media / wire photo agencies ──
  {
    tier: 'major_media',
    reason: 'Major football media / photo agency',
    hosts: [
      'uefa.com',
      'fifa.com',
      'premierleague.com',
      'laliga.com',
      'bundesliga.',
      'skysports.com',
      'bbc.co.uk',
      'bbc.com',
      'theguardian.com',
      'espn.',
      'goal.com',
      'onefootball.com',
      'besoccer.com',
      'flashscore.',
      'sofascore.com',
      'gettyimages.',
      'reuters.com',
      'apnews.com',
      'imago-images.',
      'alamy.com',
      'ynet.co.il',
      'sport5.co.il',
      'one.co.il',
      'sport1.co.il',
      'walla.co.il',
    ],
  },

  // ── Verified social (treated high, but never the foundation) ──
  {
    tier: 'verified_social',
    reason: 'Social platform (identity not independently verified)',
    hosts: [
      'instagram.',
      'cdninstagram.com',
      'fbcdn.net',
      'facebook.com',
      'twitter.com',
      'x.com',
      'twimg.com',
    ],
  },

  // ── Generic image hosts / search CDNs: low trust, decide by other signals ──
  {
    tier: 'image_site',
    reason: 'Generic image host / search CDN',
    hosts: [
      'gstatic.com',
      'googleusercontent.com',
      'pinterest.',
      'pinimg.com',
      'wikimedia.org',
      'wikipedia.org',
      'imgur.com',
      'flickr.com',
      'ytimg.com',
      'blogspot.',
      'wordpress.com',
    ],
  },
];

/**
 * Club sites are too numerous to enumerate, so they are detected structurally:
 * a football-ish host that we did not already classify as media/social/image.
 * This can only *raise* a host to `football_site`; a club allow-list in
 * TRUST_RULES above (tier `official_club`) still wins when present.
 */
const FOOTBALL_HINT =
  /(^|[.-])(fc|cf|sc|afc|cfc|sk|ac|as|ss|us)([.-]|$)|football|soccer|calcio|futbol|futebol|fotbal|voetbal|fussball|fotbal|\bclub\b|united|city|athletic|atletico|dynamo|dinamo|maccabi|hapoel|beitar|bnei/;

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classify a candidate by its origin page (preferred) or image host.
 */
export function scoreSource(sourceUrl: string | null, imageUrl: string): SourceTrustResult {
  const host = hostOf(sourceUrl) ?? hostOf(imageUrl);
  if (!host) {
    return { tier: 'unknown', score: TRUST_TIER_SCORE.unknown, reason: 'No identifiable source host' };
  }

  for (const rule of TRUST_RULES) {
    const hostHit = rule.hosts?.some((h) => host.includes(h));
    const patternHit = rule.patterns?.some((p) => p.test(host));
    if (hostHit || patternHit) {
      return { tier: rule.tier, score: TRUST_TIER_SCORE[rule.tier], reason: `${rule.reason} (${host})` };
    }
  }

  if (FOOTBALL_HINT.test(host)) {
    return {
      tier: 'football_site',
      score: TRUST_TIER_SCORE.football_site,
      reason: `Football-related site (${host})`,
    };
  }

  return { tier: 'unknown', score: TRUST_TIER_SCORE.unknown, reason: `Unrecognised source (${host})` };
}

/**
 * Context-aware trust: when a candidate came from the InstagramPhotoProvider
 * (i.e. the player's OWN known profile), it earns the top `player_instagram`
 * tier regardless of host — identity provenance beats host reputation. All
 * other candidates fall back to host-based `scoreSource`.
 *
 * The known handle is passed so we only award the top tier when the candidate's
 * origin page actually references that handle (defence against a mislabelled
 * candidate).
 */
export function scoreCandidateSource(
  candidate: Pick<PhotoCandidate, 'imageUrl' | 'sourceUrl' | 'provider' | 'sourceType'>,
  knownHandle: string | null | undefined
): SourceTrustResult {
  const handle = normalizeInstagramHandle(knownHandle);
  if (candidate.provider === 'instagram' && candidate.sourceType === 'INSTAGRAM' && handle) {
    const page = (candidate.sourceUrl ?? '').toLowerCase();
    const img = candidate.imageUrl.toLowerCase();
    const referencesHandle = page.includes(`instagram.com/${handle}`);
    const isIgCdn = /cdninstagram\.com|fbcdn\.net/.test(img);
    // Award the top tier when it is clearly from this player's profile, else
    // treat as ordinary verified-social so a loosely-matched hit is not
    // over-trusted.
    if (referencesHandle || isIgCdn) {
      return {
        tier: 'player_instagram',
        score: TRUST_TIER_SCORE.player_instagram,
        reason: `Player's own Instagram (@${handle})`,
      };
    }
  }
  return scoreSource(candidate.sourceUrl, candidate.imageUrl);
}
