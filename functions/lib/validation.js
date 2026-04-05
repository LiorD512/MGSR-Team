/**
 * Shared validation helpers for Cloud Functions callables.
 * Single source of truth for field sanitisation, defaults, and required-field checks.
 */

// ── Primitives ──────────────────────────────────────────────────────────────

/** Trim strings; coerce non-strings to "". */
function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

/** Coerce to integer; return fallback when not a number. */
function int(v, fallback = 0) {
  const n = typeof v === "number" ? Math.round(v) : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce to boolean. */
function bool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  return fallback;
}

/** Coerce to non-negative timestamp (milliseconds). Returns 0 for invalid. */
function timestamp(v) {
  const n = typeof v === "number" ? v : 0;
  return n > 0 ? n : 0;
}

// ── URL normalisation ───────────────────────────────────────────────────────

/** Normalise any transfermarkt domain variant (e.g. .co.uk, .de) to .com */
function normalizeTmUrl(url) {
  if (typeof url !== "string") return url;
  return url.replace(/transfermarkt\.[a-z.]+/i, "transfermarkt.com");
}

// ── Require helpers ─────────────────────────────────────────────────────────

/** Throws if the trimmed value is empty. Returns the trimmed value. */
function requireStr(v, fieldName) {
  const s = str(v);
  if (!s) throw new Error(`${fieldName} is required.`);
  return s;
}

/** Throws if the value is not a non-empty string. Returns the raw value. */
function requireId(v, fieldName) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${fieldName} is required.`);
  return v.trim();
}

// ── Contact validation ──────────────────────────────────────────────────────

const VALID_CONTACT_TYPES = new Set(["CLUB", "AGENCY"]);

function validateContact(data) {
  const name = requireStr(data.name, "Contact name");
  const contactType = VALID_CONTACT_TYPES.has(data.contactType) ? data.contactType : "CLUB";
  return {
    name,
    phoneNumber: str(data.phoneNumber),
    role: str(data.role) || "UNKNOWN",
    contactType,
    clubName: contactType === "CLUB" ? str(data.clubName) : "",
    clubCountry: contactType === "CLUB" ? str(data.clubCountry) : "",
    clubLogo: str(data.clubLogo),
    clubCountryFlag: str(data.clubCountryFlag),
    clubTmProfile: str(data.clubTmProfile),
    agencyName: contactType === "AGENCY" ? str(data.agencyName) : "",
    agencyCountry: contactType === "AGENCY" ? str(data.agencyCountry) : "",
    agencyUrl: str(data.agencyUrl),
  };
}

// ── Task validation ─────────────────────────────────────────────────────────

function validateTaskCreate(data) {
  const title = requireStr(data.title, "Task title");
  const payload = {
    agentId: data.agentId || "",
    agentName: str(data.agentName),
    title,
    notes: str(data.notes),
    dueDate: timestamp(data.dueDate),
    priority: int(data.priority, 0),
    isCompleted: false,
    createdAt: Date.now(),
    createdByAgentId: data.createdByAgentId || "",
    createdByAgentName: str(data.createdByAgentName),
  };

  // Optional: link to a player
  if (data.playerId) payload.playerId = data.playerId;
  if (data.playerName) payload.playerName = str(data.playerName);
  if (data.playerTmProfile) payload.playerTmProfile = str(data.playerTmProfile);
  if (data.playerWomenId) payload.playerWomenId = str(data.playerWomenId);
  if (data.templateId) payload.templateId = str(data.templateId);

  // Optional: link to an agent contact
  if (data.linkedAgentContactId) payload.linkedAgentContactId = str(data.linkedAgentContactId);
  if (data.linkedAgentContactName) payload.linkedAgentContactName = str(data.linkedAgentContactName);
  if (data.linkedAgentContactPhone) payload.linkedAgentContactPhone = str(data.linkedAgentContactPhone);

  return payload;
}

function validateTaskUpdate(data) {
  requireId(data.taskId, "taskId");
  const updates = {};
  if (data.title !== undefined) updates.title = str(data.title);
  if (data.notes !== undefined) updates.notes = str(data.notes);
  if (data.dueDate !== undefined) updates.dueDate = timestamp(data.dueDate);
  if (data.priority !== undefined) updates.priority = int(data.priority, 0);
  if (data.agentId !== undefined) updates.agentId = data.agentId;
  if (data.agentName !== undefined) updates.agentName = str(data.agentName);
  if (data.isCompleted !== undefined) {
    updates.isCompleted = bool(data.isCompleted);
    updates.completedAt = updates.isCompleted ? Date.now() : 0;
  }
  if (typeof data.completedAt === "number") updates.completedAt = data.completedAt;
  // linkedAgentContact fields (can be updated)
  if (data.linkedAgentContactId !== undefined) updates.linkedAgentContactId = str(data.linkedAgentContactId);
  if (data.linkedAgentContactName !== undefined) updates.linkedAgentContactName = str(data.linkedAgentContactName);
  if (data.linkedAgentContactPhone !== undefined) updates.linkedAgentContactPhone = str(data.linkedAgentContactPhone);

  if (Object.keys(updates).length === 0) throw new Error("No fields to update.");
  return updates;
}

// ── PlayerOffer validation ──────────────────────────────────────────────────

function validateOfferCreate(data) {
  const playerTmProfile = requireStr(data.playerTmProfile, "playerTmProfile");
  return {
    playerTmProfile,
    playerName: str(data.playerName),
    playerImage: str(data.playerImage),
    requestId: data.requestId || "",
    clubTmProfile: str(data.clubTmProfile),
    clubName: str(data.clubName),
    clubLogo: str(data.clubLogo),
    position: str(data.position),
    offeredAt: Date.now(),
    clubFeedback: str(data.clubFeedback),
    markedByAgentName: str(data.markedByAgentName),
  };
}

// ── AgentTransfer validation ────────────────────────────────────────────────

function validateTransferRequest(data) {
  const playerId = requireId(data.playerId, "playerId");
  const fromAgentId = requireId(data.fromAgentId, "fromAgentId");
  const toAgentId = requireId(data.toAgentId, "toAgentId");
  return {
    playerId,
    playerName: str(data.playerName),
    playerImage: str(data.playerImage),
    platform: data.platform,
    fromAgentId,
    fromAgentName: str(data.fromAgentName),
    toAgentId,
    toAgentName: str(data.toAgentName),
    status: "pending",
    requestedAt: Date.now(),
  };
}

// ── ClubRequest validation ──────────────────────────────────────────────────

const VALID_FEET = new Set(["left", "right", "both", ""]);

function validateRequestCreate(data) {
  const payload = {
    clubTmProfile: str(data.clubTmProfile),
    clubName: str(data.clubName),
    clubLogo: str(data.clubLogo),
    clubCountry: str(data.clubCountry),
    clubCountryFlag: str(data.clubCountryFlag),
    contactId: str(data.contactId),
    contactName: str(data.contactName),
    contactPhoneNumber: str(data.contactPhoneNumber),
    position: str(data.position),
    quantity: int(data.quantity, 1),
    notes: str(data.notes),
    minAge: int(data.minAge, 0),
    maxAge: int(data.maxAge, 0),
    ageDoesntMatter: bool(data.ageDoesntMatter, true),
    salaryRange: str(data.salaryRange),
    transferFee: str(data.transferFee),
    dominateFoot: VALID_FEET.has(str(data.dominateFoot)) ? str(data.dominateFoot) : "",
    createdAt: Date.now(),
    status: "pending",
    euOnly: bool(data.euOnly, false),
    createdByAgent: str(data.createdByAgent),
    createdByAgentHebrew: str(data.createdByAgentHebrew),
  };
  return payload;
}

function validateRequestUpdate(data) {
  requireId(data.requestId, "requestId");
  const updates = {};
  if (data.clubTmProfile !== undefined) updates.clubTmProfile = str(data.clubTmProfile);
  if (data.clubName !== undefined) updates.clubName = str(data.clubName);
  if (data.clubLogo !== undefined) updates.clubLogo = str(data.clubLogo);
  if (data.clubCountry !== undefined) updates.clubCountry = str(data.clubCountry);
  if (data.clubCountryFlag !== undefined) updates.clubCountryFlag = str(data.clubCountryFlag);
  if (data.contactId !== undefined) updates.contactId = str(data.contactId);
  if (data.contactName !== undefined) updates.contactName = str(data.contactName);
  if (data.contactPhoneNumber !== undefined) updates.contactPhoneNumber = str(data.contactPhoneNumber);
  if (data.position !== undefined) updates.position = str(data.position);
  if (data.quantity !== undefined) updates.quantity = int(data.quantity, 1);
  if (data.notes !== undefined) updates.notes = str(data.notes);
  if (data.minAge !== undefined) updates.minAge = int(data.minAge, 0);
  if (data.maxAge !== undefined) updates.maxAge = int(data.maxAge, 0);
  if (data.ageDoesntMatter !== undefined) updates.ageDoesntMatter = bool(data.ageDoesntMatter, true);
  if (data.salaryRange !== undefined) updates.salaryRange = str(data.salaryRange);
  if (data.transferFee !== undefined) updates.transferFee = str(data.transferFee);
  if (data.dominateFoot !== undefined) {
    updates.dominateFoot = VALID_FEET.has(str(data.dominateFoot)) ? str(data.dominateFoot) : "";
  }
  if (data.status !== undefined) updates.status = str(data.status);
  if (data.euOnly !== undefined) updates.euOnly = bool(data.euOnly, false);
  if (data.createdByAgent !== undefined) updates.createdByAgent = str(data.createdByAgent);
  if (data.createdByAgentHebrew !== undefined) updates.createdByAgentHebrew = str(data.createdByAgentHebrew);

  if (Object.keys(updates).length === 0) throw new Error("No fields to update.");
  return updates;
}

module.exports = {
  normalizeTmUrl,
  str,
  int,
  bool,
  timestamp,
  requireStr,
  requireId,
  validateContact,
  validateTaskCreate,
  validateTaskUpdate,
  validateOfferCreate,
  validateTransferRequest,
  validateRequestCreate,
  validateRequestUpdate,
};
