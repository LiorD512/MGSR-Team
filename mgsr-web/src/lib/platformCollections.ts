/**
 * Platform-specific Firestore collection names.
 * MGSR Team (men) and MGSR Women use separate collections — no shared data.
 */

import type { Platform } from '@/contexts/PlatformContext';

export const CLUB_REQUESTS_COLLECTIONS: Record<Platform, string> = {
  men: 'ClubRequests',
  women: 'ClubRequestsWomen',
};

export const SHORTLISTS_COLLECTIONS: Record<Platform, string> = {
  men: 'Shortlists',
  women: 'ShortlistsWomen',
};

export const CONTACTS_COLLECTIONS: Record<Platform, string> = {
  men: 'Contacts',
  women: 'ContactsWomen',
};

export const PLAYERS_COLLECTIONS: Record<Platform, string> = {
  men: 'Players',
  women: 'PlayersWomen',
};

/** Shared shortlist document ID — same for both platforms, but different collections. */
export const SHARED_SHORTLIST_DOC_ID = 'team';
