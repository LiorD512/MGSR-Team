/** Signal taxonomy (spec R8). Stored as data in code; scoring weights live in versioned config rows. */
export type Component = 'availability' | 'exclusion' | 'playingTime' | 'relationship' | 'financial' | 'replacement' | 'other';

export const SIGNAL_COMPONENT: Record<string, Component> = {
  // A. sporting status
  NOT_PLAYING: 'exclusion', EXCLUDED_FROM_SQUAD: 'exclusion', OUT_OF_FAVOR: 'exclusion', NOT_REGISTERED: 'exclusion',
  LOSING_STARTING_PLACE: 'playingTime', REDUCED_MINUTES: 'playingTime',
  POSITION_REPLACED_BY_SIGNING: 'replacement',
  // B. transfer availability
  CLUB_WANTS_TO_SELL: 'availability', CLUB_WANTS_TO_RELEASE: 'availability', AVAILABLE_ON_LOAN: 'availability', CLUB_OPEN_TO_TERMINATE: 'availability',
  PLAYER_SEEKING_CLUB: 'availability', CONTRACT_TALKS_FAILED: 'availability', REQUESTED_TO_LEAVE: 'availability',
  // C. relationship
  CONFLICT_WITH_COACH: 'relationship', DISAGREEMENT_WITH_MANAGEMENT: 'relationship', DISCIPLINARY_ISSUE: 'relationship',
  UNHAPPY_PLAYING_TIME: 'relationship', PUBLIC_DISSATISFACTION: 'relationship',
  // D. financial
  CLUB_FINANCIAL_PROBLEMS: 'financial', SALARY_REDUCTION: 'financial', CLUB_NEEDS_TO_SELL: 'financial', UNPAID_SALARY: 'financial',
  // E. indicators
  REPLACEMENT_BEING_RECRUITED: 'replacement', SAME_POSITION_SIGNING: 'replacement', AGENT_OR_JOURNALIST_DEPARTURE_REPORT: 'other', SQUAD_STATUS_CHANGE: 'other', OTHER_INDIRECT: 'other',
};

export const SIGNAL_CODES = [
  ...Object.keys(SIGNAL_COMPONENT), 'CONTRACT_EXPIRING',
  // counter-signals
  'DENIED_BY_CLUB', 'INJURED', 'SUSPENDED', 'RENEWED_CONTRACT', 'RETURNED_TO_SQUAD', 'TRANSFER_COMPLETED',
];

export const COUNTER_SIGNALS = new Set(['DENIED_BY_CLUB', 'INJURED', 'SUSPENDED', 'RENEWED_CONTRACT', 'RETURNED_TO_SQUAD', 'TRANSFER_COMPLETED']);

/** signals that can make an item actionable on their own (PoC round 2 lesson: red cards / benching / single lineups do NOT count) */
export const STRICT_SIGNALS = new Set([
  'CLUB_WANTS_TO_SELL', 'CLUB_WANTS_TO_RELEASE', 'AVAILABLE_ON_LOAN', 'CLUB_OPEN_TO_TERMINATE', 'PLAYER_SEEKING_CLUB', 'CONTRACT_TALKS_FAILED',
  'CONFLICT_WITH_COACH', 'DISAGREEMENT_WITH_MANAGEMENT', 'REQUESTED_TO_LEAVE', 'UNPAID_SALARY', 'EXCLUDED_FROM_SQUAD', 'OUT_OF_FAVOR', 'NOT_REGISTERED', 'CLUB_NEEDS_TO_SELL',
]);

export const CATEGORY_LABEL: Record<Component, string> = {
  availability: 'Transfer availability', exclusion: 'Sporting status', playingTime: 'Sporting status',
  relationship: 'Relationship issues', financial: 'Financial', replacement: 'Opportunity indicators', other: 'Opportunity indicators',
};

export type Tier = 'A' | 'B' | 'C' | 'D';
export type Verification = 'CONFIRMED' | 'REPORTED' | 'RUMOR';
export type Level = 'Exceptional' | 'High priority' | 'Potential' | 'Monitor' | 'Low priority' | 'Closed';
