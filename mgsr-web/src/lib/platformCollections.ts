/**
 * Platform-specific Firestore collection names.
 * MGSR Team (men), MGSR Women, and MGSR Youth use separate collections — no shared data.
 */

import type { Platform } from '@/contexts/PlatformContext';

export const CLUB_REQUESTS_COLLECTIONS: Record<Platform, string> = {
  men: 'ClubRequests',
  women: 'ClubRequestsWomen',
  youth: 'ClubRequestsYouth',
};

export const SHORTLISTS_COLLECTIONS: Record<Platform, string> = {
  men: 'Shortlists',
  women: 'ShortlistsWomen',
  youth: 'ShortlistsYouth',
};

export const CONTACTS_COLLECTIONS: Record<Platform, string> = {
  men: 'Contacts',
  women: 'ContactsWomen',
  youth: 'ContactsYouth',
};

export const PLAYERS_COLLECTIONS: Record<Platform, string> = {
  men: 'Players',
  women: 'PlayersWomen',
  youth: 'PlayersYouth',
};

export const AGENT_TASKS_COLLECTIONS: Record<Platform, string> = {
  men: 'AgentTasks',
  women: 'AgentTasksWomen',
  youth: 'AgentTasksYouth',
};

export const FEED_EVENTS_COLLECTIONS: Record<Platform, string> = {
  men: 'FeedEvents',
  women: 'FeedEventsWomen',
  youth: 'FeedEventsYouth',
};

export const PORTFOLIO_COLLECTIONS: Record<Platform, string> = {
  men: 'Portfolio',
  women: 'PortfolioWomen',
  youth: 'PortfolioYouth',
};

export const PLAYER_DOCUMENTS_COLLECTIONS: Record<Platform, string> = {
  men: 'PlayerDocuments',
  women: 'PlayerDocumentsWomen',
  youth: 'PlayerDocumentsYouth',
};
