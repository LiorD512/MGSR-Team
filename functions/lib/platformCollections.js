/**
 * Platform-specific Firestore collection names.
 * Single source of truth — used by Cloud Functions callables.
 * Must stay in sync with:
 *   - Android: FirebaseHandler.kt (playersTable, contactsTable, etc.)
 *   - Web:     mgsr-web/src/lib/platformCollections.ts
 */

const PLAYERS_COLLECTIONS = { men: "Players", women: "PlayersWomen", youth: "PlayersYouth" };
const CONTACTS_COLLECTIONS = { men: "Contacts", women: "ContactsWomen", youth: "ContactsYouth" };
const AGENT_TASKS_COLLECTIONS = { men: "AgentTasks", women: "AgentTasksWomen", youth: "AgentTasksYouth" };
const CLUB_REQUESTS_COLLECTIONS = { men: "ClubRequests", women: "ClubRequestsWomen", youth: "ClubRequestsYouth" };
const FEED_EVENTS_COLLECTIONS = { men: "FeedEvents", women: "FeedEventsWomen", youth: "FeedEventsYouth" };
const SHORTLISTS_COLLECTIONS = { men: "Shortlists", women: "ShortlistsWomen", youth: "ShortlistsYouth" };
const PORTFOLIO_COLLECTIONS = { men: "Portfolio", women: "PortfolioWomen", youth: "PortfolioYouth" };
const PLAYER_DOCUMENTS_COLLECTIONS = { men: "PlayerDocuments", women: "PlayerDocumentsWomen", youth: "PlayerDocumentsYouth" };
const SHADOW_TEAMS_COLLECTIONS = { men: "ShadowTeams", women: "ShadowTeamsWomen", youth: "ShadowTeamsYouth" };

const VALID_PLATFORMS = new Set(["men", "women", "youth"]);

function validatePlatform(platform) {
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    throw new Error(`Invalid platform: "${platform}". Must be men, women, or youth.`);
  }
}

module.exports = {
  PLAYERS_COLLECTIONS,
  CONTACTS_COLLECTIONS,
  AGENT_TASKS_COLLECTIONS,
  CLUB_REQUESTS_COLLECTIONS,
  FEED_EVENTS_COLLECTIONS,
  SHORTLISTS_COLLECTIONS,
  PORTFOLIO_COLLECTIONS,
  PLAYER_DOCUMENTS_COLLECTIONS,
  SHADOW_TEAMS_COLLECTIONS,
  VALID_PLATFORMS,
  validatePlatform,
};
