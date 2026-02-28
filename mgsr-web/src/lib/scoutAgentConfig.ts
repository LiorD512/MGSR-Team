/**
 * AI Scout Agent Network — configuration.
 * Maps countries to agents, leagues, and scouting profiles.
 */

export const AGENT_IDS = [
  'portugal',
  'serbia',
  'poland',
  'greece',
  'belgium',
  'netherlands',
  'turkey',
  'austria',
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export interface AgentConfig {
  id: AgentId;
  name: string;
  nameHe: string;
  flag: string;
  /** Transfermarkt league startseite URLs for this agent's country */
  leagueUrls: string[];
  /** League display names for UI */
  leagueNames: string[];
}

/** League URLs from Transfermarkt — startseite for squad extraction */
const LEAGUE_URLS: Record<string, string> = {
  // Portugal
  'liga-portugal': 'https://www.transfermarkt.com/liga-portugal/startseite/wettbewerb/PO1',
  'liga-portugal-2': 'https://www.transfermarkt.com/liga-portugal-2/startseite/wettbewerb/PO2',
  // Serbia
  'super-liga-srbije': 'https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1',
  // Poland
  'ekstraklasa': 'https://www.transfermarkt.com/pko-bp-ekstraklasa/startseite/wettbewerb/PL1',
  'i-liga': 'https://www.transfermarkt.com/1-liga/startseite/wettbewerb/PL2',
  // Greece
  'super-league-1': 'https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1',
  // Belgium
  'jupiler-pro-league': 'https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1',
  // Netherlands
  'eredivisie': 'https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1',
  'eerste-divisie': 'https://www.transfermarkt.com/eerste-divisie/startseite/wettbewerb/NL2',
  // Turkey
  'super-lig': 'https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1',
  '1-lig': 'https://www.transfermarkt.com/1-lig/startseite/wettbewerb/TR2',
  // Austria
  'bundesliga-at': 'https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1',
  '2-liga-at': 'https://www.transfermarkt.com/2-liga/startseite/wettbewerb/A2',
};

export const AGENTS_CONFIG: Record<AgentId, AgentConfig> = {
  portugal: {
    id: 'portugal',
    name: 'Portugal',
    nameHe: 'פורטוגל',
    flag: '🇵🇹',
    leagueUrls: [LEAGUE_URLS['liga-portugal'], LEAGUE_URLS['liga-portugal-2']],
    leagueNames: ['Liga Portugal', 'Liga Portugal 2'],
  },
  serbia: {
    id: 'serbia',
    name: 'Serbia',
    nameHe: 'סרביה',
    flag: '🇷🇸',
    leagueUrls: [LEAGUE_URLS['super-liga-srbije']],
    leagueNames: ['Super Liga Srbije'],
  },
  poland: {
    id: 'poland',
    name: 'Poland',
    nameHe: 'פולין',
    flag: '🇵🇱',
    leagueUrls: [LEAGUE_URLS['ekstraklasa'], LEAGUE_URLS['i-liga']],
    leagueNames: ['Ekstraklasa', 'I Liga'],
  },
  greece: {
    id: 'greece',
    name: 'Greece',
    nameHe: 'יוון',
    flag: '🇬🇷',
    leagueUrls: [LEAGUE_URLS['super-league-1']],
    leagueNames: ['Super League 1'],
  },
  belgium: {
    id: 'belgium',
    name: 'Belgium',
    nameHe: 'בלגיה',
    flag: '🇧🇪',
    leagueUrls: [LEAGUE_URLS['jupiler-pro-league']],
    leagueNames: ['Jupiler Pro League'],
  },
  netherlands: {
    id: 'netherlands',
    name: 'Netherlands',
    nameHe: 'הולנד',
    flag: '🇳🇱',
    leagueUrls: [LEAGUE_URLS['eredivisie'], LEAGUE_URLS['eerste-divisie']],
    leagueNames: ['Eredivisie', 'Eerste Divisie'],
  },
  turkey: {
    id: 'turkey',
    name: 'Turkey',
    nameHe: 'טורקיה',
    flag: '🇹🇷',
    leagueUrls: [LEAGUE_URLS['super-lig'], LEAGUE_URLS['1-lig']],
    leagueNames: ['Süper Lig', '1. Lig'],
  },
  austria: {
    id: 'austria',
    name: 'Austria',
    nameHe: 'אוסטריה',
    flag: '🇦🇹',
    leagueUrls: [LEAGUE_URLS['bundesliga-at'], LEAGUE_URLS['2-liga-at']],
    leagueNames: ['Bundesliga', '2. Liga'],
  },
};

/** Scouting profile types — what each agent looks for */
export const SCOUT_PROFILE_TYPES = [
  'HIGH_VALUE_BENCHED',
  'LOW_VALUE_STARTER',
  'YOUNG_STRIKER_HOT',
  'CONTRACT_EXPIRING',
  'HIDDEN_GEM',
  'LOWER_LEAGUE_RISER',
] as const;

export type ScoutProfileType = (typeof SCOUT_PROFILE_TYPES)[number];

export interface ScoutProfileParams {
  /** Min market value (euro) */
  marketValueMin?: number;
  /** Max market value (euro) */
  marketValueMax?: number;
  /** Max age */
  ageMax?: number;
  /** Min age */
  ageMin?: number;
  /** Positions (e.g. CF, SS) */
  positions?: string[];
  /** League tier (1=top, 2=second, etc.) */
  leagueTierMin?: number;
  /** FM PA minimum */
  fmPaMin?: number;
  /** Contract expires within N months */
  contractExpiresWithinMonths?: number;
}

export const SCOUT_PROFILES: Record<
  ScoutProfileType,
  { label: string; labelHe: string; explanationEn: string; explanationHe: string; params: ScoutProfileParams }
> = {
  HIGH_VALUE_BENCHED: {
    label: 'High Value Benched',
    labelHe: 'ערך גבוה על הספסל',
    explanationEn: 'High-value player not getting enough minutes — potential bargain if his club is willing to move him.',
    explanationHe: 'שחקן בעל שווי גבוה שלא מקבל דקות — פוטנציאל למציאה אם המועדון מוכן לשחרר.',
    params: {
      marketValueMin: 800_000,
      marketValueMax: 3_000_000,
      ageMax: 30,
      // Minutes/starts would need FBref — simplified: value + age
    },
  },
  LOW_VALUE_STARTER: {
    label: 'Low Value Starter',
    labelHe: 'שווי נמוך משחק הרבה',
    explanationEn: 'Low market value but plays regularly — proven performer at an affordable price.',
    explanationHe: 'שווי שוק נמוך אבל משחק הרבה — שחקן מוכח במחיר נגיש.',
    params: {
      marketValueMax: 500_000,
      ageMax: 28,
    },
  },
  YOUNG_STRIKER_HOT: {
    label: 'Young Striker Hot',
    labelHe: 'חלוץ צעיר חם',
    explanationEn: 'Young striker with scoring potential at a low price — could develop into a key player.',
    explanationHe: 'חלוץ צעיר עם פוטנציאל כיבוש במחיר נמוך — יכול להתפתח לשחקן מפתח.',
    params: {
      marketValueMax: 1_000_000,
      ageMax: 21,
      positions: ['CF', 'SS', 'Centre-Forward', 'Second Striker'],
    },
  },
  CONTRACT_EXPIRING: {
    label: 'Contract Expiring',
    labelHe: 'חוזה מסתיים',
    explanationEn: 'Contract running out soon — opportunity to negotiate a favorable deal or free transfer.',
    explanationHe: 'חוזה מסתיים בקרוב — הזדמנות למשא ומתן טוב או העברה חופשית.',
    params: {
      marketValueMax: 2_500_000,
      contractExpiresWithinMonths: 6,
    },
  },
  HIDDEN_GEM: {
    label: 'Hidden Gem',
    labelHe: 'יהלום חבוי',
    explanationEn: 'Young player with high FM potential at a low price — could be a steal for Ligat Ha\'Al.',
    explanationHe: 'שחקן צעיר עם פוטנציאל FM גבוה במחיר נמוך — יכול להיות מציאה לליגת העל.',
    params: {
      marketValueMax: 1_500_000,
      ageMax: 24,
      fmPaMin: 130,
    },
  },
  LOWER_LEAGUE_RISER: {
    label: 'Lower League Riser',
    labelHe: 'כוכב עולה בליגה נמוכה',
    explanationEn: 'Rising star in a lower league — ready to step up, often undervalued by the market.',
    explanationHe: 'כוכב עולה בליגה נמוכה — מוכן לעלות רמה, לרוב מוערך מתחת לשווי בשוק.',
    params: {
      marketValueMax: 1_000_000,
      ageMax: 23,
      leagueTierMin: 2,
    },
  },
};

/** Ligat Ha'Al value cap — all profiles must be within reach */
export const LIGAT_HAAL_VALUE_MAX = 2_500_000;
