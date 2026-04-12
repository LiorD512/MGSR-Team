/**
 * Thin typed wrapper around Firebase callable functions (Phase-1 shared logic).
 * Every write operation goes through Cloud Functions now — single source of truth.
 * Reads (onSnapshot) still happen client-side for real-time updates.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app);

// ─── helpers ────────────────────────────────────────────────────────────────
function callable<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => {
    const result = await fn(data);
    return result.data;
  };
}

// ─── Contacts ───────────────────────────────────────────────────────────────
export interface ContactPayload {
  platform: string;
  contactId?: string;
  name?: string;
  phoneNumber?: string;
  role?: string;
  contactType?: string;
  clubName?: string;
  clubCountry?: string;
  clubLogo?: string;
  clubCountryFlag?: string;
  clubTmProfile?: string;
  agencyName?: string;
  agencyCountry?: string;
  agencyUrl?: string;
}

export const callContactsCreate = callable<ContactPayload, { id: string }>('contactsCreate');
export const callContactsUpdate = callable<ContactPayload, { success: boolean }>('contactsUpdate');
export const callContactsDelete = callable<{ platform: string; contactId: string }, { success: boolean }>('contactsDelete');

// ─── Tasks ──────────────────────────────────────────────────────────────────
export interface TaskCreatePayload {
  platform: string;
  agentId: string;
  agentName: string;
  title: string;
  notes?: string;
  dueDate?: number;
  priority?: number;
  createdByAgentId: string;
  createdByAgentName: string;
  playerId?: string;
  playerName?: string;
  playerTmProfile?: string;
  playerWomenId?: string;
  templateId?: string;
  linkedAgentContactId?: string;
  linkedAgentContactName?: string;
  linkedAgentContactPhone?: string;
}

export interface TaskUpdatePayload {
  platform: string;
  taskId: string;
  title?: string;
  notes?: string;
  dueDate?: number;
  priority?: number;
  agentId?: string;
  agentName?: string;
}

export const callTasksCreate = callable<TaskCreatePayload, { id: string }>('tasksCreate');
export const callTasksUpdate = callable<TaskUpdatePayload, { success: boolean }>('tasksUpdate');
export const callTasksToggleComplete = callable<{ platform: string; taskId: string; isCompleted: boolean }, { success: boolean }>('tasksToggleComplete');
export const callTasksDelete = callable<{ platform: string; taskId: string }, { success: boolean }>('tasksDelete');

// ─── Agent Transfers ────────────────────────────────────────────────────────
export interface AgentTransferRequestPayload {
  platform: string;
  playerId: string;
  playerName?: string;
  playerImage?: string;
  fromAgentId: string;
  fromAgentName?: string;
  toAgentId: string;
  toAgentName?: string;
}

export const callAgentTransferRequest = callable<AgentTransferRequestPayload, { id: string } | { alreadyPending: true }>('agentTransferRequest');
export const callAgentTransferApprove = callable<{ platform: string; requestId: string }, { success: boolean }>('agentTransferApprove');
export const callAgentTransferReject = callable<{ requestId: string; rejectionReason?: string }, { success: boolean }>('agentTransferReject');
export const callAgentTransferCancel = callable<{ requestId: string }, { success: boolean }>('agentTransferCancel');

// ─── Player Offers ──────────────────────────────────────────────────────────
export interface OfferCreatePayload {
  platform: string;
  playerTmProfile: string;
  playerName: string;
  playerImage: string;
  requestId: string;
  clubName: string;
  clubLogo: string;
  position: string;
  clubFeedback?: string;
  markedByAgentName: string;
}

export const callOffersCreate = callable<OfferCreatePayload, { id: string }>('offersCreate');
export const callOffersUpdateFeedback = callable<{ offerId: string; clubFeedback: string }, { success: boolean }>('offersUpdateFeedback');
export const callOffersDelete = callable<{ offerId: string }, { success: boolean }>('offersDelete');

// ─── Club Requests CRUD ─────────────────────────────────────────────────────
export interface RequestCreatePayload {
  platform: string;
  clubTmProfile?: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  contactId?: string;
  contactName?: string;
  contactPhoneNumber?: string;
  position?: string;
  quantity?: number;
  notes?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  salaryRange?: string;
  transferFee?: string;
  dominateFoot?: string;
  euOnly?: boolean;
  createdByAgent?: string;
  createdByAgentHebrew?: string;
}

export interface RequestUpdatePayload {
  platform: string;
  requestId: string;
  clubTmProfile?: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  contactId?: string;
  contactName?: string;
  contactPhoneNumber?: string;
  position?: string;
  quantity?: number;
  notes?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  salaryRange?: string;
  transferFee?: string;
  dominateFoot?: string;
  euOnly?: boolean;
  status?: string;
  createdByAgent?: string;
  createdByAgentHebrew?: string;
}

export const callRequestsCreate = callable<RequestCreatePayload, { id: string }>('requestsCreate');
export const callRequestsUpdate = callable<RequestUpdatePayload, { success: boolean }>('requestsUpdate');
export const callRequestsDelete = callable<{ platform: string; requestId: string; requestSnapshot?: string; agentName?: string }, { success: boolean }>('requestsDelete');

// ─── Request Matching ───────────────────────────────────────────────────────
export const callMatchRequestToPlayers = callable<
  { platform: string; requestId: string; euCountries?: string[] },
  { matchedPlayerIds: string[] }
>('matchRequestToPlayers');

export const callMatchingRequestsForPlayer = callable<
  { platform: string; playerId: string; euCountries?: string[] },
  { matchedRequestIds: string[] }
>('matchingRequestsForPlayer');

// ─── Players ────────────────────────────────────────────────────────────────

export const callPlayersUpdate = callable<
  { platform: string; playerId: string; _deleteFields?: string[]; [key: string]: unknown },
  { success: boolean }
>('playersUpdate');

export const callPlayersToggleMandate = callable<
  { platform: string; playerId: string; hasMandate: boolean; playerRefId?: string; playerName?: string; playerImage?: string; agentName?: string },
  { success: boolean }
>('playersToggleMandate');

export const callPlayersAddNote = callable<
  { platform: string; playerId: string; playerRefId?: string; noteText: string; createdBy?: string; createdByHe?: string; playerName?: string; playerImage?: string; agentName?: string; taggedAgentIds?: string[] },
  { success: boolean; noteList: unknown[] }
>('playersAddNote');

export const callPlayersDeleteNote = callable<
  { platform: string; playerId: string; playerRefId?: string; noteIndex?: number; noteText?: string; noteCreatedAt?: number; playerName?: string; playerImage?: string; agentName?: string },
  { success: boolean; noteList: unknown[] }
>('playersDeleteNote');

export const callPlayersDelete = callable<
  { platform: string; playerId: string; playerRefId?: string; playerName?: string; playerImage?: string; agentName?: string },
  { success: boolean }
>('playersDelete');

// ─── Player Documents ───────────────────────────────────────────────────────

export const callPlayerDocumentsCreate = callable<
  { platform: string; playerRefId: string; type: string; name: string; storageUrl: string; expiresAt?: number; validLeagues?: string[]; uploadedBy?: string; playerName?: string; playerImage?: string; agentName?: string },
  { id: string }
>('playerDocumentsCreate');

export const callPlayerDocumentsDelete = callable<
  { platform: string; documentId: string; clearPassport?: boolean; playerId?: string },
  { success: boolean }
>('playerDocumentsDelete');

export const callPlayerDocumentsMarkExpired = callable<
  { documentId: string },
  { success: boolean }
>('playerDocumentsMarkExpired');

// ─── Shortlists ─────────────────────────────────────────────────────────────

export const callShortlistAdd = callable<
  { platform: string; tmProfileUrl: string; checkRoster?: boolean; agentName?: string; [key: string]: unknown },
  { status: string; id?: string }
>('shortlistAdd');

export const callShortlistRemove = callable<
  { platform: string; tmProfileUrl: string; playerName?: string; playerImage?: string; agentName?: string },
  { success: boolean }
>('shortlistRemove');

export const callShortlistUpdate = callable<
  { platform: string; tmProfileUrl: string; [key: string]: unknown },
  { success: boolean }
>('shortlistUpdate');

export const callShortlistAddNote = callable<
  { platform: string; tmProfileUrl: string; noteText: string; createdBy?: string; createdByHebrewName?: string; createdById?: string },
  { success: boolean }
>('shortlistAddNote');

export const callShortlistUpdateNote = callable<
  { platform: string; tmProfileUrl: string; noteIndex: number; newText: string },
  { success: boolean }
>('shortlistUpdateNote');

export const callShortlistDeleteNote = callable<
  { platform: string; tmProfileUrl: string; noteIndex: number },
  { success: boolean }
>('shortlistDeleteNote');

// ─── Players Create (Phase 5) ──────────────────────────────────────────────

export const callPlayersCreate = callable<
  { platform: string; fullName: string; removeFromShortlistUrl?: string; [key: string]: unknown },
  { status: string; id?: string }
>('playersCreate');

// ─── Portfolio ──────────────────────────────────────────────────────────────

export const callPortfolioUpsert = callable<
  { platform: string; [key: string]: unknown },
  { status: string; id: string }
>('portfolioUpsert');

export const callPortfolioDelete = callable<
  { platform: string; documentId: string },
  { success: boolean }
>('portfolioDelete');

// ─── Phase 6 — misc ────────────────────────────────────────────────────────

export const callSharePlayerCreate = callable<
  { playerId: string; [key: string]: unknown },
  { token: string }
>('sharePlayerCreate');

export const callShadowTeamsSave = callable<
  { platform: string; accountId: string; formationId: string; slots: unknown[]; updatedAt?: number },
  { success: boolean }
>('shadowTeamsSave');

export const callScoutProfileFeedbackSet = callable<
  { uid: string; profileId: string; feedback: string; agentId?: string },
  { success: boolean }
>('scoutProfileFeedbackSet');

export const callBirthdayWishSend = callable<
  { year: string; playerId: string; sentBy?: string },
  { success: boolean }
>('birthdayWishSend');

export const callOffersUpdateHistorySummary = callable<
  { offerId: string; historySummary: string },
  { success: boolean }
>('offersUpdateHistorySummary');

export const callMandateSigningCreate = callable<
  { token: string; [key: string]: unknown },
  { success: boolean }
>('mandateSigningCreate');

// ── Phase 7 — Account ──────────────────────────────────────────────────

export const callAccountUpdate = callable<
  { accountId: string; email?: string; fcmToken?: string; language?: string; addFcmWebToken?: string; removeFcmWebToken?: { token: string; platform: string; updatedAt: number } },
  { success: boolean }
>('accountUpdate');

// ── Chat Room ───────────────────────────────────────────────────────────
export interface ChatRoomSendPayload {
  text: string;
  senderAccountId: string;
  senderName: string;
  senderNameHe: string;
  mentions: { playerId: string; playerName: string }[];
  notifyAccountId?: string;
  replyTo?: { messageId: string; text: string; senderName: string; senderNameHe: string };
  attachments?: { url: string; name: string; type: string; size: number }[];
}

export const callChatRoomSend = callable<ChatRoomSendPayload, { id: string }>('chatRoomSend');

export interface ChatRoomEditPayload {
  messageId: string;
  senderAccountId: string;
  newText: string;
}
export const callChatRoomEdit = callable<ChatRoomEditPayload, { success: boolean }>('chatRoomEdit');

export interface ChatRoomDeletePayload {
  messageId: string;
  senderAccountId: string;
}
export const callChatRoomDelete = callable<ChatRoomDeletePayload, { success: boolean }>('chatRoomDelete');

// ── Notification Center ─────────────────────────────────────────────────
export const callNotificationMarkRead = callable<
  { accountId: string; notificationId: string },
  { success: boolean }
>('notificationMarkRead');

export const callNotificationMarkAllRead = callable<
  { accountId: string },
  { success: boolean; updated?: number }
>('notificationMarkAllRead');
